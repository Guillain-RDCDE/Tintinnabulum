// The Gallery: finished pieces, hung in rooms by their light.
//
// A work sets the picture, the sound and the way they are shown all at once,
// through the same functions the individual controls use -- so everything it
// changes shows up in those controls, stays changeable, and survives a reload
// exactly as a hand-made choice would. Which work is "on" is read back from
// the page rather than stored, so touching any single control afterwards takes
// the work's label off rather than leaving it lying.
//
// Each room is a row that scrolls sideways, its first work hung larger. A card
// comes alive under the pointer -- the scene itself runs in it -- and choosing
// it puts the work up full screen and starts it playing. Exhibition mode walks
// through whatever is showing, dipping through the ground between works.
//
// The Gallery and Create are one place. Every card has a Remix that opens the
// work on the bench, exactly as it hangs; what you keep there comes back here,
// in a room of its own above the others, played and remixed like any work.

import {
  WORKS,
  WORK_ROOMS,
  WORK_ROOM_NOTES,
  SCENES,
  PALETTES,
  KITS,
  SPACES,
  FINISHES,
  MATS,
  GROUNDS,
  LIVING,
  previewScene,
  animateScene,
  paletteFromInks,
  mediumOf,
} from '../src/index.js';
import { $, createPicker, fitCanvas, caption } from './dom.js';
import { store } from './store.js';

/** The Look panel's pace steps, as multipliers, by index. */
const PACE = [0.25, 0.5, 0.75, 1, 1.3, 1.7];
const PACE_WORDS = ['very slow', 'slow', 'unhurried', 'real time', 'lively', 'brisk'];

const TOUR_NOTES = {
  0: 'Each work stays until you choose another.',
  5: 'A new work every five minutes, from the rooms and the filter shown above.',
  10: 'A new work every ten minutes: long enough to settle into each.',
  20: 'A new work every twenty minutes, for a room people spend time in.',
  30: 'Every half hour, for a screen that is part of the room.',
  60: 'Every hour, for a wall that stays on all day.',
};

/**
 * @param {object} io
 * @param {object}   io.canvas       the CanvasSink
 * @param {object}   io.look         what setupLook returned
 * @param {Function} io.selectKit    (name, options) => Promise
 * @param {Function} io.selectSpace  (name) => void
 * @param {Function} io.ensureAudio  resolves once sound may play
 * @param {Function} io.getKit       the current kit's name
 * @param {Function} io.getSpace     the current room's name
 * @param {Function} [io.onPlay]     a work was chosen by hand: put it up and play
 * @param {Function} [io.onRemix]    ({kind, name|id, picture, origin}) => open it in Create
 * @param {Function} [io.pieces]     the pictures you kept in Create, newest first
 * @param {Function} [io.pieceOn]    the one of yours on the wall now, if any: {id, title}
 * @param {Function} [io.onPlayPiece]   (id) => put one of yours up and play it
 * @param {Function} [io.onForgetPiece] (id) => let one of yours go
 */
export function setupWorks({
  canvas, look, selectKit, selectSpace, ensureAudio, getKit, getSpace, onPlay = () => {}, onChange = () => {},
  onRemix = () => {}, pieces = () => [], pieceOn = () => null, onPlayPiece = () => {}, onForgetPiece = () => {},
}) {
  const pool = {};

  const heightOf = (card) => (card.classList.contains('featured') ? 168 : 116);

  const optionsFor = (w, cw, h) => {
    const scene = SCENES[w.scene];
    return {
      w: cw,
      h,
      palette: PALETTES[w.palette].colors,
      shape: canvas.shape,
      richness: canvas.richness,
      depth: canvas.depth,
      params: Object.fromEntries(Object.entries(scene.params || {}).map(([k, d]) => [k, d.default])),
      finish: w.finish,
      mat: w.mat,
      ground: w.ground,
      pool,
    };
  };

  function paint(cv, name) {
    const w = WORKS[name];
    const { ctx, w: cw, h } = fitCanvas(cv, { height: heightOf(cv.closest('.card')) });
    previewScene(ctx, w.scene, optionsFor(w, cw, h));
  }

  const REMIX_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 11.5l7-7 2 2-7 7h-2z"/><path d="M8.5 5.5l2 2"/></svg>';

  /**
   * A small action on a card: a span, since a card is already a button. The
   * pointer uses it directly; the keyboard has the same thing on the card's
   * own key (R) and in the cartel.
   */
  function cardAction(card, className, html, label, act) {
    const a = document.createElement('span');
    a.className = className;
    a.innerHTML = html;
    a.title = label;
    a.setAttribute('aria-hidden', 'true');
    a.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      act();
    });
    card.append(a);
    return a;
  }

  /** Where a card's picture is, so the bench can open out of it. */
  const pictureOf = (card) => {
    const cv = card.querySelector('canvas');
    return { picture: cv, origin: cv.getBoundingClientRect() };
  };

  function remixWork(name, card = picker.buttons.get(name)) {
    stopLive();
    onRemix({ kind: 'work', name, ...(card && card.offsetParent ? pictureOf(card) : {}) });
  }

  const picker = createPicker($('#works'), Object.entries(WORKS), {
    key: 'work',
    className: 'card',
    gridClassName: 'cards',
    title: (w) => w.cartel,
    render: (btn, w, name) => {
      btn.append(document.createElement('canvas'), caption(w.title, `${SCENES[w.scene].label} · ${KITS[w.kit].label}`));
      btn.setAttribute('aria-keyshortcuts', 'R');
      cardAction(btn, 'remix', `${REMIX_ICON}Remix`, `Remix ${w.title} in Create`, () => remixWork(name, btn));
    },
    onPick: (name) => choose(name),
  });

  // --- a card comes alive under the pointer ---------------------------------------
  let live = null;

  function stopLive() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    const { card, name } = live;
    live = null;
    if (card.dataset.piece) paintPiece(card);
    else paint(card.querySelector('canvas'), name);
  }

  function startLive(card) {
    const piece = card.dataset.piece ? pieces().find((p) => p.id === card.dataset.piece) : null;
    const name = piece ? piece.id : card.dataset.work;
    if (live && live.card === card) return;
    stopLive();
    const cv = card.querySelector('canvas');
    const { ctx, w: cw, h } = fitCanvas(cv, { height: heightOf(card) });
    const player = piece
      ? animateScene(ctx, piece.state.tool, pieceOptions(piece, cw, h))
      : animateScene(ctx, WORKS[name].scene, optionsFor(WORKS[name], cw, h));
    const state = { card, name, raf: 0, last: performance.now(), frames: 0 };
    const tick = (now) => {
      if (live !== state) return;
      player.frame(now - state.last);
      state.last = now;
      state.frames++;
      state.raf = requestAnimationFrame(tick);
    };
    live = state;
    state.raf = requestAnimationFrame(tick);
  }

  function comesAlive(btn) {
    btn.addEventListener('pointerenter', () => startLive(btn));
    btn.addEventListener('pointerleave', () => { if (live && live.card === btn) stopLive(); });
    btn.addEventListener('focus', () => startLive(btn));
    btn.addEventListener('blur', () => { if (live && live.card === btn) stopLive(); });
  }
  for (const [name, btn] of picker.buttons) {
    comesAlive(btn);
    btn.addEventListener('keydown', (e) => {
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        remixWork(name, btn);
      }
    });
  }

  // --- yours: what was kept in Create, hung like the works --------------------------------
  //
  // A kept picture carries its own thumbnail, the bench's frame at the moment
  // it was kept, so its card is that picture exactly and costs nothing to show.
  // Under the pointer it comes alive like a work's, from its own dials and inks.
  const yoursHost = $('#yours-cards');
  let yoursWrap = null;

  function pieceOptions(piece, cw, h) {
    const st = piece.state;
    return {
      w: cw, h,
      palette: paletteFromInks(st.inks),
      shape: canvas.shape,
      richness: canvas.richness,
      depth: canvas.depth,
      params: { ...st.params },
      finish: st.finish,
      mat: st.mat,
      ground: st.ground || 'none',
      seed: st.seed,
      pool,
    };
  }

  function paintPiece(card) {
    const piece = pieces().find((p) => p.id === card.dataset.piece);
    const cv = card.querySelector('canvas');
    if (!piece || !cv) return;
    const { ctx, w: cw, h } = fitCanvas(cv, { height: heightOf(card) });
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cw, h);
    const img = new Image();
    img.onload = () => {
      if (live && live.card === card) return;
      const k = Math.max(cw / img.width, h / img.height);
      ctx.drawImage(img, (cw - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
      card.dataset.painted = '1';
    };
    img.src = piece.thumb;
  }

  function remixPiece(id, card) {
    stopLive();
    onRemix({ kind: 'yours', id, ...(card && card.offsetParent ? pictureOf(card) : {}) });
  }

  function renderYours() {
    if (live && live.card.dataset.piece) {
      cancelAnimationFrame(live.raf);
      live = null;
    }
    const list = pieces();
    const on = pieceOn();
    yoursHost.textContent = '';
    for (const piece of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card';
      btn.dataset.piece = piece.id;
      btn.title = `${piece.title}: play it`;
      btn.setAttribute('aria-pressed', String(Boolean(on && on.id === piece.id)));
      btn.setAttribute('aria-keyshortcuts', 'R Delete');
      const kit = KITS[piece.kit] ? KITS[piece.kit].label : '';
      btn.append(document.createElement('canvas'), caption(piece.title, [(SCENES[piece.state.tool] || {}).label, kit].filter(Boolean).join(' · ')));
      cardAction(btn, 'remix', `${REMIX_ICON}Remix`, `Remix ${piece.title} in Create`, () => remixPiece(piece.id, btn));
      cardAction(btn, 'forget', '×', `Let ${piece.title} go`, () => onForgetPiece(piece.id));
      btn.addEventListener('click', () => playPiece(piece.id));
      btn.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          remixPiece(piece.id, btn);
        } else if (e.key === 'Delete') {
          e.preventDefault();
          onForgetPiece(piece.id);
        }
      });
      comesAlive(btn);
      yoursHost.append(btn);
    }
    if (!yoursWrap) yoursWrap = makeRow(yoursHost, 'Yours');
    yoursWrap.hidden = !list.length;
    $('#yours-note').hidden = !list.length;
    $('#yours-empty').hidden = list.length > 0;
    for (const card of yoursHost.children) paintPiece(card);
    requestAnimationFrame(() => updateRow(yoursWrap));
  }

  function playPiece(id) {
    stopLive();
    const go = () => onPlayPiece(id);
    if (document.startViewTransition) document.startViewTransition(go);
    else go();
  }

  /** Bring a card into view in the gallery and light it for a moment: where you came back to. */
  function reveal({ work = null, piece = null } = {}) {
    const card = work ? picker.buttons.get(work) : piece ? yoursHost.querySelector(`[data-piece="${CSS.escape(piece)}"]`) : null;
    if (!card || card.hidden) return false;
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    card.classList.remove('arrived');
    void card.offsetWidth;
    card.classList.add('arrived');
    card.focus({ preventScroll: true });
    return true;
  }

  // --- the rooms, and what is showing in them ----------------------------------
  let energy = 'all';

  const visible = () =>
    Object.keys(WORKS).filter((n) => energy === 'all' || WORKS[n].energy === energy);

  // --- a row you can move along with a mouse --------------------------------------
  //
  // A row that scrolls sideways is natural under a finger or on a trackpad and
  // invisible to a mouse: the wheel scrolls the inspector, the scrollbar is
  // hidden, and the works past the edge simply are not there. So each row has
  // an arrow at either end, shown only when there is somewhere to go, and a
  // fade at the edge that says the row goes on.
  const CHEVRON_LEFT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg>';
  const CHEVRON_RIGHT = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5"/></svg>';

  function updateRow(wrap) {
    const grid = wrap.querySelector('.cards');
    const max = grid.scrollWidth - grid.clientWidth;
    const atStart = grid.scrollLeft <= 2;
    const atEnd = grid.scrollLeft >= max - 2;
    wrap.classList.toggle('at-start', atStart);
    wrap.classList.toggle('at-end', atEnd || max <= 2);
  }

  function makeRow(grid, room) {
    const wrap = document.createElement('div');
    wrap.className = 'rowwrap';
    grid.before(wrap);
    wrap.append(grid);
    for (const [dir, icon, word] of [[-1, CHEVRON_LEFT, 'back'], [1, CHEVRON_RIGHT, 'on']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `row-nav ${dir < 0 ? 'prev' : 'next'}`;
      b.setAttribute('aria-label', `Scroll ${room} ${word}`);
      b.innerHTML = icon;
      b.addEventListener('click', () => {
        grid.scrollBy({ left: dir * Math.max(160, grid.clientWidth * 0.8), behavior: 'smooth' });
      });
      wrap.append(b);
    }
    grid.addEventListener('scroll', () => updateRow(wrap), { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => updateRow(wrap)).observe(grid);
    requestAnimationFrame(() => updateRow(wrap));
    return wrap;
  }

  function layout() {
    stopLive();
    picker.group((name) => WORKS[name].room, WORK_ROOMS);
    const host = $('#works');
    for (const heading of host.querySelectorAll('.sub-label')) {
      const note = document.createElement('p');
      note.className = 'room-note';
      note.textContent = WORK_ROOM_NOTES[heading.textContent] || '';
      heading.after(note);
      makeRow(note.nextElementSibling, heading.textContent);
    }
    const shown = new Set(visible());
    for (const grid of host.querySelectorAll('.cards')) {
      let first = true;
      let any = false;
      for (const btn of grid.children) {
        const on = shown.has(btn.dataset.work);
        btn.hidden = !on;
        btn.classList.toggle('featured', on && first);
        if (on) { first = false; any = true; }
      }
      // A room with nothing in it under this filter disappears, heading and all.
      const wrap = grid.parentElement;
      grid.hidden = !any;
      wrap.hidden = !any;
      wrap.previousElementSibling.hidden = !any;
      wrap.previousElementSibling.previousElementSibling.hidden = !any;
      grid.scrollLeft = 0;
      requestAnimationFrame(() => updateRow(wrap));
    }
    for (const b of document.querySelectorAll('#works-energy button')) {
      b.setAttribute('aria-pressed', String(b.dataset.energy === energy));
    }
    picker.mark(current());
    if (shown.size) picker.repaint(paint);
  }

  function selectEnergy(value, persist = true) {
    energy = ['calm', 'lively'].includes(value) ? value : 'all';
    if (persist) store.set('works-energy', energy);
    layout();
  }

  for (const b of document.querySelectorAll('#works-energy button')) {
    b.addEventListener('click', () => selectEnergy(b.dataset.energy));
  }

  /** The line under a title, as the wall writes it too: see mediumOf. */
  const medium = (w) => mediumOf(w, { SCENES, PALETTES, FINISHES, GROUNDS, MATS, KITS, SPACES, LIVING });

  async function apply(name) {
    const w = WORKS[name];
    if (!w) return;
    // A work is a fixed composition: left rotating, it would last until the
    // next change of palette or scene and then quietly stop being itself.
    look.selectRotate(0);
    look.selectSceneRotate(0);
    look.selectScene(w.scene);
    look.selectPalette(w.palette);
    look.selectFinish(w.finish);
    look.selectGround(w.ground);
    look.selectMat(w.mat);
    look.selectGrain(w.grain);
    look.selectPace(w.pace);
    look.selectLiving(w.living);
    selectSpace(w.space);
    store.set('work', name);
    refresh();
    onChange();
    await ensureAudio();
    await selectKit(w.kit, { audition: false });
    refresh();
    onChange();
  }

  /** Chosen by hand: the work goes up full screen, through a transition where the browser has one. */
  function choose(name) {
    stopLive();
    const go = () => {
      apply(name);
      onPlay(name);
    };
    if (document.startViewTransition) document.startViewTransition(go);
    else go();
  }

  /** Which work, if any, the page is showing now. */
  function current() {
    for (const [name, w] of Object.entries(WORKS)) {
      if (
        canvas.sceneName === w.scene &&
        canvas.paletteName === w.palette &&
        canvas.finish === w.finish &&
        canvas.ground === w.ground &&
        canvas.mat === w.mat &&
        Boolean(canvas.grain) === Boolean(w.grain) &&
        Math.abs(canvas.pace - PACE[w.pace]) < 1e-6 &&
        canvas.living === w.living &&
        getKit() === w.kit &&
        getSpace() === w.space
      ) return name;
    }
    return null;
  }

  // --- moving through the works -----------------------------------------------------
  /** The work before or after the one on show, among those showing, put up for real. */
  function step(dir = 1) {
    const list = visible();
    if (!list.length) return null;
    const at = list.indexOf(current());
    const index = at < 0 ? (dir >= 0 ? 0 : list.length - 1) : (at + (dir >= 0 ? 1 : -1) + list.length) % list.length;
    const next = list[index];
    const w = WORKS[next];
    // Dipped through the ground, not cut: the picture fades, the work is put
    // up at the bottom of the dip, and it fades back in.
    if (canvas.fadeScene && w.scene !== canvas.sceneName) {
      canvas.fadeScene(w.scene, 2600);
      setTimeout(() => apply(next), 1400);
    } else {
      apply(next);
    }
    return next;
  }

  const tourStep = () => step(1);

  let tourTimer = 0;
  let tourMinutes = 0;

  function selectTour(minutes, persist = true) {
    const m = Object.prototype.hasOwnProperty.call(TOUR_NOTES, Number(minutes)) ? Number(minutes) : 0;
    tourMinutes = m;
    clearInterval(tourTimer);
    tourTimer = m ? setInterval(tourStep, m * 60000) : 0;
    $('#works-tour').value = String(m);
    $('#works-tour-note').textContent = TOUR_NOTES[m];
    if (persist) store.set('works-tour', String(m));
  }
  $('#works-tour').addEventListener('change', (e) => selectTour(e.target.value));

  // --- the label for the work on show ----------------------------------------------
  let shown;

  function remixButton(text, act) {
    const row = document.createElement('div');
    row.className = 'cartel-actions';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'act';
    b.id = 'work-remix';
    b.innerHTML = REMIX_ICON;
    b.querySelector('svg').style.cssText = 'width:14px;height:14px;margin-right:.4rem';
    b.append(text);
    b.addEventListener('click', act);
    row.append(b);
    return row;
  }

  function refresh() {
    // Yours first. A piece hung from Create can be the exact look of a work
    // in the catalogue -- the bench starts from those looks -- and when it is,
    // the title somebody gave their own piece is the one that belongs on the
    // wall, not the name of the work it resembles.
    const on = pieceOn();
    const name = on ? null : current();
    // The header is set here as well as by the page's once-a-second summary,
    // so it is right the moment a work is chosen rather than up to a second on.
    $('#sum-works').textContent = name ? WORKS[name].title : on ? on.title : 'Your own';
    const key = name || (on ? `piece:${on.id}:${on.title}` : null);
    if (key === shown) return name;
    shown = key;
    picker.mark(name);
    for (const card of yoursHost.children) card.setAttribute('aria-pressed', String(Boolean(on && on.id === card.dataset.piece)));
    const box = $('#work-cartel');
    box.textContent = '';
    if (!name && !on) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'Point at a work to see it move. Choose one to put it up and hear it, or remix it in Create.';
      box.append(p, remixButton('Remix what is playing', () => onRemix({ kind: 'live' })));
      return name;
    }
    const title = document.createElement('b');
    const line = document.createElement('span');
    line.className = 'medium';
    const text = document.createElement('p');
    let act;
    if (on) {
      const piece = pieces().find((p) => p.id === on.id);
      const st = piece.state;
      title.textContent = on.title;
      line.textContent = ['Yours', (SCENES[st.tool] || {}).label, st.finish !== 'none' && FINISHES[st.finish] ? FINISHES[st.finish].label : '',
        st.ground && st.ground !== 'none' && GROUNDS[st.ground] ? `on ${GROUNDS[st.ground].label.toLowerCase()}` : '',
        KITS[piece.kit] ? KITS[piece.kit].label : ''].filter(Boolean).join(' · ');
      text.textContent = `Made in Create, variation No. ${st.seed}. Kept on this device.`;
      act = remixButton('Remix', () => remixPiece(on.id, yoursHost.querySelector(`[data-piece="${CSS.escape(on.id)}"]`)));
    } else {
      const w = WORKS[name];
      title.textContent = w.title;
      line.textContent = `${w.room} · ${w.energy} · ${medium(w)}`;
      text.textContent = w.cartel;
      act = remixButton('Remix this work', () => remixWork(name));
    }
    const label = document.createElement('div');
    label.className = 'cartel';
    label.append(title, line, text, act);
    box.append(label);
    return name;
  }

  selectEnergy(store.get('works-energy') || 'all', false);
  selectTour(store.get('works-tour') || 0, false);
  renderYours();

  return {
    apply,
    choose,
    refresh,
    current,
    medium,
    visible,
    selectEnergy,
    selectTour,
    step,
    tourStep,
    get live() {
      return live ? { name: live.name, frames: live.frames } : null;
    },
    get tourMinutes() {
      return tourMinutes;
    },
    get energy() {
      return energy;
    },
    repaint: () => picker.repaint(paint),
    repaintPending: () => picker.repaintPending(paint),
    get busy() {
      return picker.busy;
    },
    get title() {
      const on = pieceOn();
      if (on) return on.title;
      const name = current();
      return name ? WORKS[name].title : '';
    },
    renderYours,
    reveal,
    remixWork,
  };
}
