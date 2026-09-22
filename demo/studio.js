// Create: every scene as a small tool for making pictures that sound.
//
// The fifth tab. The other four set up how the world is heard and seen; this
// one is for making a picture of your own, and it lives in the same place so
// that what was playing can be taken onto the bench and what was made can be
// put back on the live feed.
//
// A tool is opened on a variation -- a number from which the dials and the
// whole sequence of events are drawn, so the number is the picture -- and
// everything else is laid out around it the way a print workshop is: the inks,
// the texture, the frame, and what to do with the result. Space draws another.
// The picture moves and, if asked, sounds: every event is one note.
//
// While the bench is open its state is in the address, so a picture can be
// sent to somebody by sending the link.

import {
  SCENES, SCENE_SHELVES, WORKS, KITS, PALETTES, PALETTE_FAMILIES, familyOf, FINISHES, FINISH_ORDER, MATS, MAT_ORDER,
  GROUNDS, GROUND_ORDER, prepareGround,
  Sonifier, makeKit, previewScene, animateScene, playScene,
  inkSet, rotateInks, inksOfPalette, paletteFromInks, paletteIsViolet, variedParams, isViolet,
} from '../src/index.js';
import { lightnessOf, parseColor } from '../src/visual/color.js';
import { accentFor } from './shell.js';
import { store } from './store.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const el = (id) => document.getElementById(`st-${id}`);

/** The scenes new to the bench, marked as such. */
const NEW_TOOLS = new Set(['ribbons', 'growth', 'physarum', 'stipple', 'topo', 'roots']);

const RATIOS = ['9:16', '3:4', '4:5', '1:1', '5:4', '4:3', '3:2', '16:9'];
const ratioOf = (r) => r.split(':').map(Number);

// Instruments rather than ambiences: a picture's events should each be heard.
const SOUND_KITS = ['musicbox', 'marimba', 'glassy', 'chimes', 'handbells', 'koto', 'steelpan', 'strings', 'water', 'clay', 'synth', 'hatnote']
  .filter((k) => KITS[k]);

const hashOf = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const randomSeed = () => 1 + Math.floor(Math.random() * 99998);
const hex = (c) => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const { r, g, b } = parseColor(c);
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
};
const PREFIX = '#create';

/**
 * @param {object} io
 * @param {object}   io.son        the sandbox's Sonifier: its audio engine is shared
 * @param {object}   io.canvas     the live CanvasSink
 * @param {Function} io.onLeave    the bench asks to be closed (Escape from the index)
 * @param {Function} io.playLive   (picture) => put a picture on the live feed
 * @param {Function} [io.feedLabel] what the sandbox is listening to, in words
 * @param {Function} [io.onSource]  ('live'|'own') => the bench changed where its events come from
 */
export function setupStudio({ son: live, canvas, onLeave, playLive, feedLabel = () => 'the feed', onSource = () => {} }) {
  const studio = document.getElementById('studio');
  const indexView = el('index');
  const bench = el('bench');

  /** Every scene, shelf by shelf, each shelf in order of name. */
  const TOOLS = SCENE_SHELVES.flatMap((shelf) =>
    Object.keys(SCENES)
      .filter((n) => SCENES[n].shelf === shelf)
      .sort((a, b) => SCENES[a].label.localeCompare(SCENES[b].label))
  );
  const NUMBER = Object.fromEntries(TOOLS.map((n, i) => [n, i + 1]));
  const numberOf = (name) => String(NUMBER[name] || 0).padStart(3, '0');

  /**
   * How a tool first looks and sounds: as the work that hangs it, if one does,
   * otherwise a set of inks drawn from its name, so each tool keeps a face.
   */
  function toolLook(name) {
    const work = Object.values(WORKS).find((w) => w.scene === name && PALETTES[w.palette] && !paletteIsViolet(w.palette));
    if (work) {
      return {
        inks: inksOfPalette(work.palette).map(hex),
        kit: SOUND_KITS.includes(work.kit) ? work.kit : SOUND_KITS[hashOf(name) % SOUND_KITS.length],
        finish: FINISHES[work.finish] ? work.finish : 'none',
        mat: MATS[work.mat] ? work.mat : 'none',
        grain: work.grain ? 0.18 : 0,
        ground: GROUNDS[work.ground] ? work.ground : 'none',
      };
    }
    const h = hashOf(name);
    return { inks: inkSet(h, 4), kit: SOUND_KITS[h % SOUND_KITS.length], finish: 'none', mat: 'none', grain: 0, ground: 'none' };
  }

  // --- state -----------------------------------------------------------------------

  const state = {
    tool: null,
    seed: 1,
    params: {},
    inks: [],
    finish: 'none',
    grain: 0,
    mat: 'none',
    ground: 'none',
    ratio: RATIOS.includes(store.get('play-ratio')) ? store.get('play-ratio') : '4:5',
    tempo: store.number('play-tempo', 1.5, 0.25, 6),
    animate: store.flag('play-animate', true),
    hear: false,
    kit: SOUND_KITS[0],
    // Where the events come from: the feed the sandbox listens to, as they
    // happen, or a steady rhythm of the picture's own.
    source: store.get('play-source') === 'own' ? 'own' : 'live',
  };
  let open = false;
  let history = [];
  let place = -1;

  const readJson = (key) => {
    try {
      const v = JSON.parse(store.get(key) || 'null');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  let captures = readJson('play-captures');
  let savedInks = readJson('play-inks');

  // --- the address --------------------------------------------------------------------

  function encode(s = state) {
    const q = new URLSearchParams();
    q.set('i', s.inks.map((c) => hex(c).slice(1)).join('-'));
    const drawn = variedParams(SCENES[s.tool], s.seed);
    const moved = Object.entries(s.params).filter(([k, v]) => drawn[k] !== v).map(([k, v]) => `${k}:${v}`);
    if (moved.length) q.set('d', moved.join(','));
    if (s.finish !== 'none') q.set('f', s.finish);
    if (s.grain > 0) q.set('g', String(s.grain));
    if (s.mat !== 'none') q.set('m', s.mat);
    if (s.ground && s.ground !== 'none') q.set('p', s.ground);
    q.set('r', s.ratio.replace(':', 'x'));
    return `${PREFIX}/${s.tool}/${s.seed}?${q.toString()}`;
  }

  /** What an address asks for: nothing, the index, or a picture. */
  function parse(hash) {
    if (!hash.startsWith(PREFIX)) return null;
    const rest = hash.slice(PREFIX.length).replace(/^\/?/, '');
    if (!rest) return { index: true };
    const [path, query = ''] = rest.split('?');
    const [tool, seedText] = path.split('/');
    if (!SCENES[tool]) return { index: true };
    const q = new URLSearchParams(query);
    const seed = Number.parseInt(seedText, 10);
    const inks = (q.get('i') || '').split('-').filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => '#' + c.toLowerCase());
    const specs = SCENES[tool].params || {};
    const dials = {};
    for (const pair of (q.get('d') || '').split(',')) {
      const [k, v] = pair.split(':');
      const n = Number(v);
      if (specs[k] && Number.isFinite(n)) dials[k] = clamp(n, specs[k].min, specs[k].max);
    }
    const ratio = (q.get('r') || '').replace('x', ':');
    return {
      tool,
      seed: Number.isFinite(seed) && seed > 0 ? Math.min(999999, seed) : null,
      inks: inks.length >= 2 ? inks.slice(0, 6) : null,
      dials,
      finish: FINISHES[q.get('f')] ? q.get('f') : null,
      grain: q.has('g') ? clamp(Number(q.get('g')) || 0, 0, 0.6) : null,
      mat: MATS[q.get('m')] ? q.get('m') : null,
      ground: GROUNDS[q.get('p')] ? q.get('p') : null,
      ratio: RATIOS.includes(ratio) ? ratio : null,
      full: q.has('i'),
    };
  }

  /** Put an address in the bar without adding a step to the back button. */
  function replaceAddress(hash) {
    try {
      window.history.replaceState(null, '', hash || location.pathname + location.search);
    } catch {
      /* a sandboxed frame may refuse; nothing else depends on it */
    }
  }
  function writeAddress() {
    if (open && state.tool && !bench.hidden) replaceAddress(encode());
  }

  function route() {
    const r = parse(location.hash);
    if (!r) {
      if (open) onLeave();
      return;
    }
    if (!open) return;
    if (r.index) showIndex();
    else openTool(r);
  }
  window.addEventListener('hashchange', route);

  function setAccent() {
    const root = document.documentElement;
    const a = state.inks.length ? accentFor(paletteFromInks(state.inks), false) : '#e8b04a';
    root.style.setProperty('--accent', a);
    root.style.setProperty('--accent-ink', lightnessOf(a) > 0.62 ? '#15130e' : '#ffffff');
  }

  // --- the index ----------------------------------------------------------------------

  let kind = 'All';
  const cards = new Map();

  function buildIndex() {
    const kinds = el('kinds');
    const counts = { All: TOOLS.length };
    for (const n of TOOLS) counts[SCENES[n].shelf] = (counts[SCENES[n].shelf] || 0) + 1;
    for (const k of ['All', ...SCENE_SHELVES.filter((s) => counts[s])]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-chip';
      b.dataset.kind = k;
      b.setAttribute('aria-pressed', String(k === kind));
      b.innerHTML = `${k === 'All' ? 'All tools' : k}<span class="n">${counts[k]}</span>`;
      b.addEventListener('click', () => {
        kind = k;
        filterTools();
      });
      kinds.append(b);
    }
    const grid = el('tools');
    for (const name of TOOLS) {
      const s = SCENES[name];
      const card = document.createElement('a');
      card.className = 'st-card' + (NEW_TOOLS.has(name) ? ' new' : '');
      card.href = `${PREFIX}/${name}`;
      card.dataset.tool = name;
      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 240;
      cv.setAttribute('aria-hidden', 'true');
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.innerHTML = '<span class="top"><span class="no"></span><span class="name"></span><span class="kind"></span></span><span class="note"></span>';
      meta.querySelector('.no').textContent = numberOf(name);
      meta.querySelector('.name').textContent = s.label;
      meta.querySelector('.kind').textContent = s.shelf;
      meta.querySelector('.note').textContent = s.note;
      card.append(cv, meta);
      card.addEventListener('pointerenter', () => liveCard(name));
      card.addEventListener('pointerleave', stopLiveCard);
      card.addEventListener('focus', () => liveCard(name));
      card.addEventListener('blur', stopLiveCard);
      grid.append(card);
      cards.set(name, { el: card, canvas: cv, painted: false });
    }
    // Only what is in view is painted, one card a frame: a hundred previews at
    // once would hold the page for seconds. A hidden bench is never in view.
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) queuePaint(e.target.dataset.tool);
    }, { root: indexView, rootMargin: '300px 0px' });
    for (const { el: card } of cards.values()) seen.observe(card);
  }

  const paintQueue = [];
  let pumping = false;
  function queuePaint(name) {
    const c = cards.get(name);
    if (!c || c.painted || paintQueue.includes(name)) return;
    paintQueue.push(name);
    if (!pumping) {
      pumping = true;
      requestAnimationFrame(pump);
    }
  }
  function pump() {
    const until = performance.now() + 14;
    while (paintQueue.length && performance.now() < until) paintCard(paintQueue.shift());
    if (paintQueue.length) requestAnimationFrame(pump);
    else pumping = false;
  }
  function paintCard(name) {
    const c = cards.get(name);
    if (!c || c.painted) return;
    const look = toolLook(name);
    previewScene(c.canvas.getContext('2d'), name, {
      w: c.canvas.width, h: c.canvas.height, palette: paletteFromInks(look.inks), seed: (hashOf(name) % 9000) + 7, budgetMs: 90,
    });
    c.painted = true;
    c.el.dataset.painted = 'true';
  }

  const liveCardRun = { name: null, raf: 0 };
  function liveCard(name) {
    stopLiveCard();
    const c = cards.get(name);
    if (!c) return;
    const look = toolLook(name);
    const run = animateScene(c.canvas.getContext('2d'), name, {
      w: c.canvas.width, h: c.canvas.height, palette: paletteFromInks(look.inks), seed: hashOf(name) % 9000, every: 320,
    });
    liveCardRun.name = name;
    let last = performance.now();
    const tick = (now) => {
      if (liveCardRun.name !== name) return;
      run.frame(now - last);
      last = now;
      liveCardRun.raf = requestAnimationFrame(tick);
    };
    liveCardRun.raf = requestAnimationFrame(tick);
  }
  function stopLiveCard() {
    if (!liveCardRun.name) return;
    cancelAnimationFrame(liveCardRun.raf);
    const c = cards.get(liveCardRun.name);
    liveCardRun.name = null;
    if (c) {
      c.painted = false;
      paintCard(c.el.dataset.tool);
    }
  }

  function filterTools() {
    const q = el('find').value.trim().toLowerCase();
    let shown = 0;
    for (const [name, c] of cards) {
      const s = SCENES[name];
      const text = `${s.label} ${name} ${s.note} ${s.shelf} ${numberOf(name)}`.toLowerCase();
      const on = (kind === 'All' || s.shelf === kind) && (!q || q.split(/\s+/).every((w) => text.includes(w)));
      c.el.hidden = !on;
      if (on) shown++;
    }
    el('none').hidden = shown > 0;
    for (const b of el('kinds').querySelectorAll('.st-chip')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    for (const [name, c] of cards) {
      if (c.el.hidden || c.painted) continue;
      const r = c.el.getBoundingClientRect();
      if (r.top < innerHeight + 300 && r.bottom > -300) queuePaint(name);
    }
    return shown;
  }

  const firstShown = () => {
    for (const [name, c] of cards) if (!c.el.hidden) return name;
    return null;
  };

  function showIndex() {
    stopStage();
    bench.hidden = true;
    indexView.hidden = false;
    replaceAddress(PREFIX);
    setAccent();
    filterTools();
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) el('find').focus({ preventScroll: true });
  }

  // --- a tool -----------------------------------------------------------------------------

  function openTool(r) {
    stopLiveCard();
    const fresh = state.tool !== r.tool;
    const scene = SCENES[r.tool];
    const look = toolLook(r.tool);
    state.tool = r.tool;
    state.seed = r.seed || randomSeed();
    state.params = { ...variedParams(scene, state.seed), ...r.dials };
    if (r.inks) state.inks = r.inks;
    else if (fresh || !state.inks.length) state.inks = look.inks.slice();
    if (r.full || fresh) {
      state.finish = r.finish || (r.full ? 'none' : look.finish);
      state.grain = r.grain ?? (r.full ? 0 : look.grain);
      state.mat = r.mat || (r.full ? 'none' : look.mat);
      state.ground = r.ground || (r.full ? 'none' : look.ground);
    }
    if (r.ratio) state.ratio = r.ratio;
    if (fresh) {
      state.kit = store.get(`play-kit:${r.tool}`) || look.kit;
      if (sound) sound.setKit(state.kit);
      history = [state.seed];
      place = 0;
    } else if (history[place] !== state.seed) {
      history = history.slice(0, place + 1);
      history.push(state.seed);
      place = history.length - 1;
    }
    indexView.hidden = true;
    bench.hidden = false;
    buildDials();
    refreshAll();
    writeAddress();
    rebuild();
  }

  function buildDials() {
    const scene = SCENES[state.tool];
    el('title').textContent = `${numberOf(state.tool)}  ${scene.label}`;
    el('note').textContent = scene.note;
    const host = el('dials');
    host.textContent = '';
    const specs = Object.entries(scene.params || {});
    el('shuffle').disabled = specs.length === 0;
    el('reset').disabled = specs.length === 0;
    if (!specs.length) {
      const p = document.createElement('p');
      p.className = 'st-none-dials';
      p.textContent = 'This one has no dials of its own. The variation, the colours and the texture are yours.';
      host.append(p);
      return;
    }
    for (const [name, spec] of specs) {
      const wrap = document.createElement('div');
      wrap.className = 'st-dial';
      const id = `st-dial-${name}`;
      wrap.innerHTML = `<div class="lab"><label for="${id}"></label><output></output></div><input type="range" id="${id}">`;
      wrap.querySelector('label').textContent = spec.label;
      const input = wrap.querySelector('input');
      input.min = spec.min;
      input.max = spec.max;
      input.step = spec.step || (spec.max - spec.min) / 100;
      input.dataset.param = name;
      input.addEventListener('input', () => {
        const v = Number(input.value);
        state.params[name] = v;
        showDial(input);
        // Felt at once while the picture is moving; drawn again from the
        // beginning when the hand comes off, so the number stays the picture.
        if (view.params && !spec.rebuild) view.params[name] = v;
        else scheduleRebuild();
      });
      input.addEventListener('change', () => {
        writeAddress();
        scheduleRebuild();
      });
      host.append(wrap);
    }
  }

  const fmt = (v, step) => {
    const d = step >= 1 ? 0 : Math.min(4, Math.max(0, -Math.floor(Math.log10(step))));
    return Number(v).toFixed(d);
  };
  function paintRange(input) {
    const pct = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min) || 1)) * 100;
    input.style.setProperty('--pct', `${clamp(pct, 0, 100)}%`);
  }
  function showDial(input) {
    const spec = SCENES[state.tool].params[input.dataset.param];
    input.parentElement.querySelector('output').textContent = fmt(input.value, spec.step || 0.01);
    paintRange(input);
  }

  function refreshAll() {
    el('seed').value = String(state.seed);
    for (const input of el('dials').querySelectorAll('input[type="range"]')) {
      input.value = state.params[input.dataset.param];
      showDial(input);
    }
    refreshInks();
    for (const b of el('finishes').querySelectorAll('.st-chip')) b.setAttribute('aria-pressed', String(b.dataset.finish === state.finish));
    for (const b of el('mat').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mat === state.mat));
    for (const b of el('grounds').querySelectorAll('.st-chip')) b.setAttribute('aria-pressed', String(b.dataset.ground === state.ground));
    for (const b of el('ratios').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.ratio === state.ratio));
    const grain = el('grain');
    grain.value = state.grain;
    el('grain-out').textContent = state.grain ? `${Math.round((state.grain / 0.6) * 100)}%` : 'Off';
    paintRange(grain);
    const tempo = el('tempo');
    tempo.value = state.tempo;
    el('tempo-out').textContent = state.tempo.toFixed(2).replace(/\.?0+$/, '');
    paintRange(tempo);
    for (const b of el('source').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.source === state.source));
    el('tempo-dial').classList.toggle('off', state.source === 'live');
    tempo.disabled = state.source === 'live';
    el('source-note').textContent = state.source === 'live'
      ? `${feedLabel()}, as it happens: every real event lands on the picture and, heard, is one note. The picture starts from its number, then follows the feed.`
      : 'A steady rhythm of the picture\'s own, drawn from its number. Nothing outside it moves it.';
    el('kit').value = state.kit;
    const vol = el('volume');
    vol.value = live.volume;
    el('volume-out').textContent = `${Math.round(live.volume * 100)}%`;
    paintRange(vol);
    refreshTransport();
    renderCaptures();
  }

  function refreshTransport() {
    const play = el('play');
    play.setAttribute('aria-pressed', String(state.animate));
    play.querySelector('span').textContent = state.animate ? 'Moving' : 'Still';
    play.querySelector('svg').innerHTML = state.animate
      ? '<path d="M4.5 3h2.2v10H4.5zM9.3 3h2.2v10H9.3z"/>'
      : '<path d="M4.5 2.8l8.5 5.2-8.5 5.2z"/>';
    const hear = el('hear');
    hear.setAttribute('aria-pressed', String(state.hear));
    hear.querySelector('span').textContent = state.hear ? 'Hearing it' : 'Hear it';
  }

  // --- colour -----------------------------------------------------------------------------

  function refreshInks() {
    const host = el('inks');
    host.textContent = '';
    state.inks.forEach((c, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'st-ink';
      const well = document.createElement('label');
      well.className = 'well';
      well.style.background = c;
      well.title = i === 0 ? 'The ground' : `Ink ${i}`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = hex(c);
      input.setAttribute('aria-label', i === 0 ? 'Ground colour' : `Ink ${i} colour`);
      input.addEventListener('input', () => {
        state.inks[i] = input.value;
        well.style.background = input.value;
        setAccent();
        scheduleRebuild();
      });
      input.addEventListener('change', writeAddress);
      well.append(input);
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = i === 0 ? 'Ground' : `Ink ${i}`;
      wrap.append(well, tag);
      if (state.inks.length > 2) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'x';
        x.setAttribute('aria-label', `Remove ${i === 0 ? 'the ground' : `ink ${i}`}`);
        x.textContent = '×';
        x.addEventListener('click', () => {
          state.inks.splice(i, 1);
          inksChanged();
        });
        wrap.append(x);
      }
      host.append(wrap);
    });
    if (state.inks.length < 6) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'st-add-ink';
      add.setAttribute('aria-label', 'Add an ink');
      add.textContent = '+';
      add.addEventListener('click', () => {
        state.inks.push(inkSet(randomSeed(), 6)[1 + (state.inks.length % 5)]);
        inksChanged();
      });
      host.append(add);
    }
    el('ink-count').textContent = `${state.inks.length} inks`;
    const mine = el('my-colours');
    mine.textContent = '';
    savedInks.forEach((set, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'set';
      b.title = 'Use these colours';
      b.setAttribute('aria-label', `Saved colours ${i + 1}`);
      for (const c of set) {
        const dot = document.createElement('span');
        dot.style.background = c;
        b.append(dot);
      }
      b.addEventListener('click', () => {
        state.inks = set.slice();
        inksChanged();
      });
      mine.append(b);
    });
    setAccent();
  }

  function inksChanged() {
    refreshInks();
    writeAddress();
    scheduleRebuild();
  }

  function newColours() {
    state.inks = inkSet(randomSeed(), clamp(state.inks.length || 4, 3, 5));
    el('palette').value = '';
    inksChanged();
  }

  function rotateColours() {
    state.inks = rotateInks(state.inks);
    inksChanged();
  }

  // --- texture, frame, motion -----------------------------------------------------------

  function buildControls() {
    for (const name of FINISH_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-chip';
      b.dataset.finish = name;
      b.textContent = FINISHES[name].label;
      b.title = FINISHES[name].note;
      b.addEventListener('click', () => {
        state.finish = name;
        changed();
      });
      el('finishes').append(b);
    }
    for (const name of MAT_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mat = name;
      b.textContent = { none: 'None', thin: 'Thin mat', gallery: 'Gallery' }[name] || MATS[name].label;
      b.addEventListener('click', () => {
        state.mat = name;
        changed();
      });
      el('mat').append(b);
    }
    for (const name of GROUND_ORDER) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-chip';
      b.dataset.ground = name;
      b.textContent = GROUNDS[name].label;
      b.title = GROUNDS[name].note;
      b.addEventListener('click', () => {
        state.ground = name;
        // The sheet is built in the background; the picture is drawn again
        // on it the moment it is ready.
        prepareGround(name).then(() => {
          if (state.ground === name) scheduleRebuild();
        });
        changed();
      });
      el('grounds').append(b);
    }
    for (const r of RATIOS) {
      const [w, h] = ratioOf(r);
      const k = 20 / Math.max(w, h);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.ratio = r;
      b.setAttribute('aria-label', `Frame ${r}`);
      b.innerHTML = `<i style="width:${Math.round(w * k)}px;height:${Math.round(h * k)}px"></i>${r}`;
      b.addEventListener('click', () => {
        state.ratio = r;
        store.set('play-ratio', r);
        changed();
      });
      el('ratios').append(b);
    }
    const select = el('palette');
    select.innerHTML = '<option value="">Choose a palette…</option>';
    for (const fam of PALETTE_FAMILIES) {
      const names = Object.keys(PALETTES).filter((n) => familyOf(n) === fam && !paletteIsViolet(n));
      if (!names.length) continue;
      const group = document.createElement('optgroup');
      group.label = fam;
      for (const n of names) {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = PALETTES[n].label;
        group.append(o);
      }
      select.append(group);
    }
    select.addEventListener('change', () => {
      if (!select.value) return;
      state.inks = inksOfPalette(select.value).map(hex);
      inksChanged();
    });
    const kit = el('kit');
    for (const k of SOUND_KITS) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = KITS[k].label || k;
      kit.append(o);
    }
    kit.addEventListener('change', () => {
      state.kit = kit.value;
      store.set(`play-kit:${state.tool}`, state.kit);
      if (sound) sound.setKit(state.kit);
    });
    el('grain').addEventListener('input', (e) => {
      state.grain = Number(e.target.value);
      refreshAll();
      scheduleRebuild();
    });
    el('grain').addEventListener('change', writeAddress);
    for (const b of el('source').querySelectorAll('button')) {
      b.addEventListener('click', () => setSource(b.dataset.source));
    }
    el('tempo').addEventListener('input', (e) => {
      state.tempo = Number(e.target.value);
      store.set('play-tempo', state.tempo);
      if (view.player) view.player.every = 1000 / state.tempo;
      refreshAll();
    });
    el('volume').addEventListener('input', (e) => {
      live.volume = Number(e.target.value);
      const dock = document.getElementById('volume');
      if (dock) {
        dock.value = String(live.volume);
        dock.dispatchEvent(new Event('input', { bubbles: true }));
      }
      refreshAll();
    });
  }

  function changed() {
    refreshAll();
    writeAddress();
    scheduleRebuild();
  }

  // --- the picture -----------------------------------------------------------------------------

  const stage = el('canvas');
  const sctx = stage.getContext('2d');
  const frameEl = el('frame');
  const pool = {};
  const view = { player: null, params: null, token: 0, raf: 0, last: 0, pending: false };

  function stageSize() {
    const box = el('frame-box').getBoundingClientRect();
    const [rw, rh] = ratioOf(state.ratio);
    const availW = Math.max(80, box.width - 24);
    const availH = Math.max(80, box.height - 24);
    let cw = availW;
    let ch = (availW * rh) / rw;
    if (ch > availH) {
      ch = availH;
      cw = (ch * rw) / rh;
    }
    cw = Math.floor(cw);
    ch = Math.floor(ch);
    // Pixels are the cost of every frame. Two megapixels is sharp on any screen
    // this is likely to be seen on, and keeps the heavier scenes moving.
    let k = Math.min(window.devicePixelRatio || 1, 2);
    if (cw * ch * k * k > 2.2e6) k = Math.sqrt(2.2e6 / (cw * ch));
    return { cw, ch, w: Math.max(2, Math.round(cw * k)), h: Math.max(2, Math.round(ch * k)) };
  }

  function scheduleRebuild() {
    if (view.pending) return;
    view.pending = true;
    requestAnimationFrame(() => {
      view.pending = false;
      rebuild();
    });
  }

  function rebuild() {
    if (!open || !state.tool || bench.hidden) return;
    const token = ++view.token;
    cancelAnimationFrame(view.raf);
    const { cw, ch, w, h } = stageSize();
    frameEl.style.width = `${cw}px`;
    frameEl.style.height = `${ch}px`;
    if (stage.width !== w || stage.height !== h) {
      stage.width = w;
      stage.height = h;
    }
    view.params = { ...state.params };
    view.player = playScene(sctx, state.tool, {
      w, h,
      palette: paletteFromInks(state.inks),
      params: view.params,
      finish: state.finish,
      mat: state.mat,
      grain: state.grain,
      ground: state.ground,
      pool,
      seed: state.seed,
      every: 1000 / state.tempo,
      onArrive: hearEvent,
    });
    view.player.external = state.source === 'live';
    develop(token);
  }

  /** Where the events come from: the live feed, or the picture's own rhythm. */
  function setSource(source) {
    const next = source === 'own' ? 'own' : 'live';
    if (next === state.source) return;
    state.source = next;
    store.set('play-source', next);
    if (view.player) view.player.external = next === 'live';
    refreshAll();
    if (open) onSource(next);
  }

  // The feed's own events, while the bench follows it: each lands on the
  // picture where its identity puts it, and is heard on the bench's own
  // instrument -- at the moment it happened, which is the whole point.
  live.on((ev) => {
    if (!open || state.source !== 'live' || !view.player || bench.hidden || ev.dimmed) return;
    view.player.arriveFrom(ev);
    if (state.hear && sound && !sound.locked) {
      sound.emit({ magnitude: ev.magnitude, id: ev.id, category: ev.category, polarity: ev.polarity, label: ev.label });
    }
  });

  function develop(token) {
    frameEl.classList.add('developing');
    const bar = el('develop');
    let chunk = 3;
    const step = () => {
      if (token !== view.token || !view.player) return;
      const t0 = performance.now();
      const done = view.player.develop(chunk);
      const spent = performance.now() - t0;
      // As many frames a chunk as fit in about a frame's time, so a quick scene
      // appears at once and a heavy one develops without freezing the page.
      chunk = clamp(Math.round(chunk * (22 / Math.max(1, spent))), 1, 60);
      bar.style.transform = `scaleX(${view.player.progress})`;
      if (!done) {
        view.raf = requestAnimationFrame(step);
        return;
      }
      frameEl.classList.remove('developing');
      if (state.animate) loop(token);
    };
    view.raf = requestAnimationFrame(step);
  }

  function loop(token = view.token) {
    cancelAnimationFrame(view.raf);
    view.last = performance.now();
    const tick = (now) => {
      if (token !== view.token || !state.animate || !view.player) return;
      view.player.frame(now - view.last);
      view.last = now;
      view.raf = requestAnimationFrame(tick);
    };
    view.raf = requestAnimationFrame(tick);
  }

  function stopStage() {
    view.token++;
    cancelAnimationFrame(view.raf);
    view.player = null;
  }

  function setAnimate(on) {
    state.animate = on;
    store.setFlag('play-animate', on);
    refreshTransport();
    if (on && view.player && view.player.developed) loop();
    if (!on) cancelAnimationFrame(view.raf);
  }

  function flash() {
    const f = el('flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  // --- variations ------------------------------------------------------------------------------

  function setSeed(seed, { fromHistory = false } = {}) {
    state.seed = clamp(Math.round(seed), 1, 999999);
    state.params = variedParams(SCENES[state.tool], state.seed);
    if (!fromHistory) {
      history = history.slice(0, place + 1);
      history.push(state.seed);
      place = history.length - 1;
    }
    refreshAll();
    writeAddress();
    rebuild();
  }

  function newVariation() {
    const b = el('new');
    b.classList.remove('spin');
    void b.offsetWidth;
    b.classList.add('spin');
    setSeed(randomSeed());
  }

  function stepVariation(dir) {
    if (dir < 0) {
      if (place <= 0) return toast('This is the first one');
      place--;
      setSeed(history[place], { fromHistory: true });
    } else if (place < history.length - 1) {
      place++;
      setSeed(history[place], { fromHistory: true });
    } else {
      newVariation();
    }
  }

  function shuffleDials() {
    if (!SCENES[state.tool].params) return;
    state.params = variedParams(SCENES[state.tool], randomSeed(), 1.4);
    changed();
  }

  function resetDials() {
    const specs = SCENES[state.tool].params || {};
    state.params = Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, s.default]));
    changed();
  }

  // --- sound ----------------------------------------------------------------------------------

  // A Sonifier of the bench's own, on the sandbox's audio engine: one audio
  // context, one volume, one unlock, and its own instrument and mapping.
  let sound = null;

  function ensureSound() {
    if (sound) return sound;
    const kit = state.kit === 'synth' || state.kit === 'hatnote' ? state.kit : makeKit(state.kit);
    sound = new Sonifier({
      engine: live.engine,
      kit,
      mapping: { mode: 'adaptive', scale: 'pentatonic', range: 24, jitter: 0.2 },
      voices: { maxVoices: 12 },
    });
    return sound;
  }

  /** One event of the picture, heard: larger marks lower, as everywhere else. */
  function hearEvent(p, i) {
    if (!state.hear || !sound || sound.locked) return;
    sound.emit({
      magnitude: Math.max(1, Math.round(p.r * p.r * 3)),
      id: `create-${state.tool}-${i}`,
      category: p.category,
      polarity: i % 3 === 2 ? -1 : 1,
    });
  }

  function toggleHear() {
    if (state.hear) {
      state.hear = false;
      refreshTransport();
      return;
    }
    const s = ensureSound();
    // Synchronously, while the gesture is still ours: iOS will not start audio
    // after an await.
    s.engine.resumeSync();
    state.hear = true;
    refreshTransport();
    if (!state.animate) setAnimate(true);
    s.unlock().then((status) => {
      if (!status || !status.audible) toast('The browser is holding the sound back. Press Hear it again.');
    });
  }

  // --- keeping -------------------------------------------------------------------------------

  function thumbOf(cv) {
    const k = 220 / Math.max(cv.width, cv.height);
    const t = document.createElement('canvas');
    t.width = Math.max(1, Math.round(cv.width * k));
    t.height = Math.max(1, Math.round(cv.height * k));
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.78);
  }

  const snapshot = () => ({
    tool: state.tool, seed: state.seed, params: { ...state.params }, inks: state.inks.slice(),
    finish: state.finish, grain: state.grain, mat: state.mat, ground: state.ground, ratio: state.ratio,
  });

  function keep() {
    if (!state.tool || bench.hidden) return;
    captures.unshift({ state: snapshot(), thumb: thumbOf(stage), at: Date.now() });
    captures = captures.slice(0, 24);
    saveCaptures();
    renderCaptures(true);
    flash();
    toast('Kept');
  }

  function saveCaptures() {
    // Thumbnails are small, but storage is not endless: drop the oldest until it fits.
    for (;;) {
      try {
        localStorage.setItem('t:play-captures', JSON.stringify(captures));
        return;
      } catch {
        if (!captures.length) return;
        captures.pop();
      }
    }
  }

  function renderCaptures(fresh = false) {
    const host = el('captures');
    host.textContent = '';
    captures.forEach((c, i) => {
      const b = document.createElement('div');
      b.className = 'st-capture' + (fresh && i === 0 ? ' fresh' : '');
      b.tabIndex = 0;
      b.setAttribute('role', 'button');
      const label = `${(SCENES[c.state.tool] || {}).label || c.state.tool}, No. ${c.state.seed}`;
      b.setAttribute('aria-label', `Open ${label}`);
      b.title = label;
      const img = document.createElement('img');
      img.src = c.thumb;
      img.alt = '';
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.textContent = '×';
      x.setAttribute('aria-label', `Forget ${label}`);
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        captures.splice(i, 1);
        saveCaptures();
        renderCaptures();
      });
      const reopen = () => restore(c.state);
      b.addEventListener('click', reopen);
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') reopen();
      });
      b.append(img, x);
      host.append(b);
    });
    el('captures-empty').hidden = captures.length > 0;
    el('capture-count').textContent = captures.length ? String(captures.length) : '';
  }

  function restore(s) {
    if (!SCENES[s.tool]) return;
    openTool({
      tool: s.tool, seed: s.seed, inks: s.inks.slice(), dials: { ...s.params },
      finish: s.finish, grain: s.grain, mat: s.mat, ground: s.ground || 'none', ratio: s.ratio, full: true,
    });
  }

  // --- taking it away ----------------------------------------------------------------------------

  let busy = false;
  const status = (text) => {
    el('export-status').textContent = text;
  };

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  const fileBase = () => `tintinnabulum-${state.tool}-${state.seed}`;

  async function exportPicture() {
    if (busy || !state.tool || bench.hidden) return;
    busy = true;
    const long = Number(el('png-size').value) || 2048;
    const [rw, rh] = ratioOf(state.ratio);
    const w = rw >= rh ? long : Math.round((long * rw) / rh);
    const h = rw >= rh ? Math.round((long * rh) / rw) : long;
    // A picture taken away has its paper: wait for the sheet if it is still being made.
    await prepareGround(state.ground);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const player = playScene(cv.getContext('2d'), state.tool, {
      w, h, palette: paletteFromInks(state.inks), params: { ...state.params },
      finish: state.finish, mat: state.mat, grain: state.grain, ground: state.ground, pool: {}, seed: state.seed, every: 1000 / state.tempo,
    });
    status('Developing at full size…');
    await new Promise((resolve) => {
      const step = () => {
        const done = player.develop(4);
        status(`Developing at full size… ${Math.round(player.progress * 100)}%`);
        if (done) resolve();
        else setTimeout(step, 0);
      };
      step();
    });
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    busy = false;
    if (!blob) {
      status('The picture could not be saved in this browser.');
      return;
    }
    download(blob, `${fileBase()}.png`);
    status(`Saved, ${w} by ${h} pixels.`);
    toast('Picture saved');
  }

  /**
   * One recording of the picture as it moves, with its sound if it is being
   * heard: the chunks it produced and the type they are in.
   */
  async function record(seconds, withSound, note = '') {
    const stream = stage.captureStream(30);
    if (withSound) for (const t of sound.engine.captureStream().getAudioTracks()) stream.addTrack(t);
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((t) => MediaRecorder.isTypeSupported(t)) || '';
    let rec;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8000000 } : undefined);
    } catch (e) {
      for (const t of stream.getVideoTracks()) t.stop();
      return null;
    }
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((r) => {
      rec.onstop = r;
    });
    rec.start(250);
    let left = seconds;
    const say = () => status(`${note}Recording${withSound ? ' with sound' : ''}… ${left} s`);
    say();
    await new Promise((resolve) => {
      const t = setInterval(() => {
        left--;
        say();
        if (left <= 0) {
          clearInterval(t);
          resolve();
        }
      }, 1000);
    });
    if (rec.state === 'recording') rec.requestData();
    rec.stop();
    await stopped;
    // The picture's own track is let go; the sound's belongs to the engine
    // and carries on for the next recording.
    for (const t of stream.getVideoTracks()) t.stop();
    return { chunks, type };
  }

  async function exportVideo() {
    if (busy || !state.tool || bench.hidden) return;
    if (typeof MediaRecorder === 'undefined' || !stage.captureStream) {
      status('This browser cannot record video.');
      return;
    }
    busy = true;
    const seconds = Number(el('video-length').value) || 12;
    const withSound = Boolean(state.hear && sound && !sound.locked);
    const wasMoving = state.animate;
    if (!state.animate) setAnimate(true);
    const button = el('export-video');
    button.disabled = true;
    let take = await record(seconds, withSound);
    // A machine hard at work can hand back an empty recording: the encoder
    // never caught a frame. It is said, and done again, rather than saving an
    // empty file.
    if (take && !take.chunks.length) take = await record(seconds, withSound, 'The first take came out empty. ');
    if (!wasMoving) setAnimate(false);
    button.disabled = false;
    busy = false;
    if (!take) {
      status('This browser cannot record video.');
      return;
    }
    if (!take.chunks.length) {
      status('The recording came out empty. The machine may be too busy; try again in a moment.');
      return;
    }
    const blob = new Blob(take.chunks, { type: take.type.split(';')[0] || 'video/webm' });
    download(blob, `${fileBase()}.${take.type.includes('mp4') ? 'mp4' : 'webm'}`);
    status(`Saved, ${seconds} seconds${withSound ? ' with sound' : ', silent: press Hear it first to record the sound'}.`);
    toast('Video saved');
  }

  // --- between the bench and the live feed -------------------------------------------------------

  /** What the live canvas is showing, as a picture on the bench. */
  function fromLive() {
    const name = canvas.sceneName;
    const c = canvas.palette;
    const seen = new Set();
    const inks = [];
    for (const k of ['background', 'user', 'anon', 'bot', 'alert', 'default']) {
      const v = hex(c[k]);
      if (!seen.has(v) && !isViolet(v)) {
        seen.add(v);
        inks.push(v);
      }
    }
    const params = Object.fromEntries(canvas.paramsOf(name).map((d) => [d.name, d.value]));
    return {
      tool: name, seed: randomSeed(), inks: inks.length >= 2 ? inks : toolLook(name).inks, dials: params,
      finish: FINISHES[canvas.finish] ? canvas.finish : 'none', grain: canvas.grain ? 0.18 : 0,
      mat: MATS[canvas.mat] ? canvas.mat : 'none', ground: GROUNDS[canvas.ground] ? canvas.ground : 'none', ratio: null, full: true,
    };
  }

  /** The live picture onto the bench, dials, inks and texture as they were. */
  function takeFromLive() {
    openTool(fromLive());
  }

  function putLive() {
    if (!state.tool) return;
    const named = Object.keys(PALETTES).find((n) => inksOfPalette(n).map(hex).join() === state.inks.join());
    playLive({
      scene: state.tool,
      params: { ...state.params },
      palette: named || paletteFromInks(state.inks),
      finish: state.finish,
      mat: state.mat,
      grain: state.grain > 0,
      ground: state.ground,
    });
  }

  // --- small things ----------------------------------------------------------------------------------

  let toastTimer = 0;
  function toast(text) {
    const t = el('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }

  async function copyLink() {
    writeAddress();
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied');
    } catch {
      toast('Copy the address from the bar above');
    }
  }

  // --- wiring ------------------------------------------------------------------------------------------

  function wire() {
    el('new').addEventListener('click', newVariation);
    el('prev').addEventListener('click', () => stepVariation(-1));
    el('next').addEventListener('click', () => stepVariation(1));
    el('copy').addEventListener('click', copyLink);
    el('seed').addEventListener('change', (e) => {
      const n = Number.parseInt(e.target.value, 10);
      if (Number.isFinite(n) && n > 0) setSeed(n);
      else e.target.value = String(state.seed);
    });
    el('shuffle').addEventListener('click', shuffleDials);
    el('reset').addEventListener('click', resetDials);
    el('new-colours').addEventListener('click', newColours);
    el('rotate').addEventListener('click', rotateColours);
    el('save-colours').addEventListener('click', () => {
      const key = state.inks.join();
      savedInks = [state.inks.slice(), ...savedInks.filter((s) => s.join() !== key)].slice(0, 12);
      store.set('play-inks', JSON.stringify(savedInks));
      refreshInks();
      toast('Colours saved');
    });
    el('play').addEventListener('click', () => setAnimate(!state.animate));
    el('hear').addEventListener('click', toggleHear);
    el('keep').addEventListener('click', keep);
    el('export-png').addEventListener('click', exportPicture);
    el('export-video').addEventListener('click', exportVideo);
    el('to-index').addEventListener('click', () => {
      location.hash = PREFIX;
    });
    el('live').addEventListener('click', putLive);
    el('from-live').addEventListener('click', takeFromLive);
    stage.addEventListener('click', newVariation);
    stage.title = 'Click for a new variation';
    el('random').addEventListener('click', () => {
      const shown = TOOLS.filter((n) => !cards.get(n).el.hidden);
      const list = shown.length ? shown : TOOLS;
      location.hash = `${PREFIX}/${list[Math.floor(Math.random() * list.length)]}`;
    });
    el('find').addEventListener('input', filterTools);
    // A button clicked with the mouse gives its focus back, so Space keeps
    // meaning "another one" rather than pressing the last button again.
    studio.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && e.detail > 0) b.blur();
    });

    addEventListener('keydown', (e) => {
      if (!open || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const typing = t.closest && t.closest('input, select, textarea') && !['range', 'color'].includes(t.type);
      if (!indexView.hidden) {
        const find = el('find');
        if (e.key === 'Escape') {
          if (find.value || kind !== 'All') {
            find.value = '';
            kind = 'All';
            filterTools();
          } else {
            onLeave();
          }
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter' && (t === find || t === document.body)) {
          const first = firstShown();
          if (first) location.hash = `${PREFIX}/${first}`;
          e.preventDefault();
          return;
        }
        if (!typing && e.key.length === 1 && /[^\s\d]/.test(e.key) && t !== find) find.focus();
        return;
      }
      if (typing) {
        if (e.key === 'Escape') t.blur();
        return;
      }
      const onRange = t.type === 'range';
      const onButton = t.closest && t.closest('button, [role="button"], a');
      switch (e.key) {
        case ' ':
          if (onButton && t.id !== 'st-new') return;
          e.preventDefault();
          newVariation();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          if (onRange) return;
          e.preventDefault();
          stepVariation(e.key === 'ArrowLeft' ? -1 : 1);
          break;
        case 'p': case 'P': setAnimate(!state.animate); break;
        case 'h': case 'H': toggleHear(); break;
        case 'c': case 'C': newColours(); break;
        case 'r': case 'R': rotateColours(); break;
        case 'k': case 'K': keep(); break;
        case 'e': case 'E': exportPicture(); break;
        case 'd': case 'D': shuffleDials(); break;
        case 'Escape': e.preventDefault(); location.hash = PREFIX; break;
        default: return;
      }
    });

    // Between a wide screen and a narrower one the output column folds into
    // the first, so nothing is ever more than one scroll away.
    const narrow = matchMedia('(max-width: 1180px)');
    const placeOutput = () => (narrow.matches ? el('output-here') : el('output')).append(el('output-body'));
    narrow.addEventListener('change', placeOutput);
    placeOutput();
    let lastBox = '';
    new ResizeObserver(() => {
      const r = el('frame-box').getBoundingClientRect();
      const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (key === lastBox) return;
      lastBox = key;
      if (open && !bench.hidden) scheduleRebuild();
    }).observe(el('frame-box'));
  }

  buildIndex();
  buildControls();
  wire();

  // --- the tab ----------------------------------------------------------------------------------------

  /**
   * Open the bench. From an address, whatever it asks for; otherwise where it
   * was left, and the very first time on the picture that was playing.
   */
  function show() {
    open = true;
    studio.hidden = false;
    document.body.classList.add('creating');
    document.documentElement.dataset.ground = 'dark';
    const r = parse(location.hash);
    if (r && r.index) showIndex();
    else if (r) openTool(r);
    else if (state.tool) openTool({ tool: state.tool, seed: state.seed, inks: state.inks, dials: state.params, finish: state.finish, grain: state.grain, mat: state.mat, ground: state.ground, ratio: state.ratio, full: true });
    else openTool(fromLive());
  }

  function hide() {
    if (!open) return;
    open = false;
    stopStage();
    stopLiveCard();
    state.hear = false;
    refreshTransport();
    studio.hidden = true;
    document.body.classList.remove('creating');
    if (location.hash.startsWith(PREFIX)) replaceAddress('');
  }

  return {
    show,
    hide,
    state,
    TOOLS,
    toolLook,
    get open() {
      return open;
    },
    get player() {
      return view.player;
    },
    get son() {
      return sound;
    },
    get captures() {
      return captures;
    },
    rebuild,
    newVariation,
    keep,
    fromLive,
    setSource,
  };
}
