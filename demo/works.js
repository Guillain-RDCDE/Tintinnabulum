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
  LIVING,
  previewScene,
  animateScene,
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
 */
export function setupWorks({ canvas, look, selectKit, selectSpace, ensureAudio, getKit, getSpace, onPlay = () => {}, onChange = () => {} }) {
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
      pool,
    };
  };

  function paint(cv, name) {
    const w = WORKS[name];
    const { ctx, w: cw, h } = fitCanvas(cv, { height: heightOf(cv.closest('.card')) });
    previewScene(ctx, w.scene, optionsFor(w, cw, h));
  }

  const picker = createPicker($('#works'), Object.entries(WORKS), {
    key: 'work',
    className: 'card',
    gridClassName: 'cards',
    title: (w) => w.cartel,
    render: (btn, w) => {
      btn.append(document.createElement('canvas'), caption(w.title, `${SCENES[w.scene].label} · ${KITS[w.kit].label}`));
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
    paint(card.querySelector('canvas'), name);
  }

  function startLive(card) {
    const name = card.dataset.work;
    if (live && live.card === card) return;
    stopLive();
    const cv = card.querySelector('canvas');
    const { ctx, w: cw, h } = fitCanvas(cv, { height: heightOf(card) });
    const player = animateScene(ctx, WORKS[name].scene, optionsFor(WORKS[name], cw, h));
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

  for (const [, btn] of picker.buttons) {
    btn.addEventListener('pointerenter', () => startLive(btn));
    btn.addEventListener('pointerleave', () => { if (live && live.card === btn) stopLive(); });
    btn.addEventListener('focus', () => startLive(btn));
    btn.addEventListener('blur', () => { if (live && live.card === btn) stopLive(); });
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

  /** The line under a title, the way a museum label gives the medium. */
  function medium(w) {
    return [
      SCENES[w.scene].label,
      `${PALETTES[w.palette].label} palette`,
      w.finish === 'none' ? '' : FINISHES[w.finish].label,
      w.mat === 'none' ? '' : MATS[w.mat].label.toLowerCase(),
      KITS[w.kit].label,
      w.space === 'none' ? '' : SPACES[w.space].label.toLowerCase(),
      PACE_WORDS[w.pace],
      w.living === 'still' ? '' : LIVING[w.living].label.toLowerCase(),
    ].filter(Boolean).join(' · ');
  }

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
  function refresh() {
    const name = current();
    // The header is set here as well as by the page's once-a-second summary,
    // so it is right the moment a work is chosen rather than up to a second on.
    $('#sum-works').textContent = name ? WORKS[name].title : 'Your own';
    if (name === shown) return name;
    shown = name;
    picker.mark(name);
    const box = $('#work-cartel');
    box.textContent = '';
    if (!name) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'Point at a work to see it move. Choose one to put it up and hear it.';
      box.append(p);
      return name;
    }
    const w = WORKS[name];
    const title = document.createElement('b');
    title.textContent = w.title;
    const line = document.createElement('span');
    line.className = 'medium';
    line.textContent = `${w.room} · ${w.energy} · ${medium(w)}`;
    const text = document.createElement('p');
    text.textContent = w.cartel;
    const label = document.createElement('div');
    label.className = 'cartel';
    label.append(title, line, text);
    box.append(label);
    return name;
  }

  selectEnergy(store.get('works-energy') || 'all', false);
  selectTour(store.get('works-tour') || 0, false);

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
      const name = current();
      return name ? WORKS[name].title : '';
    },
  };
}
