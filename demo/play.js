// The playground: small tools for making pictures that sound.
//
// Every scene of the engine is a tool here. A tool is opened on a variation --
// a number from which the dials and the whole sequence of events are drawn, so
// the number is the picture -- and everything else is laid out around it the
// way a print workshop is: the inks, the texture, the frame, and what to do
// with the result. Space draws another. The picture moves and, if asked,
// sounds: every event that arrives is one note, which is the one thing a
// picture made here has that a picture made anywhere else does not.
//
// State lives in the address, so a picture can be sent to somebody by sending
// the link, and the back button leaves a tool for the index.

import {
  SCENES, SCENE_SHELVES, WORKS, KITS, PALETTES, PALETTE_FAMILIES, familyOf, FINISHES, FINISH_ORDER, MATS, MAT_ORDER,
  Sonifier, makeKit, previewScene, animateScene, playScene,
  inkSet, rotateInks, inksOfPalette, paletteFromInks, paletteIsViolet, variedParams,
} from '../src/index.js';
import { lightnessOf, parseColor } from '../src/visual/color.js';
import { accentFor } from './shell.js';
import { store } from './store.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// --- the tools ----------------------------------------------------------------------

/** The scenes new to this bench, marked as such on the index. */
const NEW_TOOLS = new Set(['aura', 'whorl', 'benday', 'rise']);

/** Every scene, shelf by shelf, each shelf in order of name. */
const TOOLS = SCENE_SHELVES.flatMap((shelf) =>
  Object.keys(SCENES)
    .filter((n) => SCENES[n].shelf === shelf)
    .sort((a, b) => SCENES[a].label.localeCompare(SCENES[b].label))
);
const NUMBER = Object.fromEntries(TOOLS.map((n, i) => [n, i + 1]));
const numberOf = (name) => String(NUMBER[name] || 0).padStart(3, '0');

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

/**
 * How a tool first looks and sounds: as the work that hangs it, if one does,
 * otherwise a set of inks drawn from its name, so that each tool has a face of
 * its own on the index and keeps it.
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
    };
  }
  const h = hashOf(name);
  return { inks: inkSet(h, 4), kit: SOUND_KITS[h % SOUND_KITS.length], finish: 'none', mat: 'none', grain: 0 };
}

// --- state -----------------------------------------------------------------------------

const state = {
  tool: null,
  seed: 1,
  params: {},
  inks: [],
  finish: 'none',
  grain: 0,
  mat: 'none',
  ratio: RATIOS.includes(store.get('play-ratio')) ? store.get('play-ratio') : '4:5',
  tempo: store.number('play-tempo', 1.5, 0.25, 6),
  animate: store.flag('play-animate', true),
  hear: false,
  kit: SOUND_KITS[0],
  volume: store.number('play-volume', 0.7, 0, 1),
};
let history = [];
let place = -1;

const readJson = (key, fallback) => {
  try {
    const v = JSON.parse(store.get(key) || 'null');
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
let captures = readJson('play-captures', []);
let savedInks = readJson('play-inks', []);

// --- the address -------------------------------------------------------------------------

function encode(s = state) {
  const q = new URLSearchParams();
  q.set('i', s.inks.map((c) => hex(c).slice(1)).join('-'));
  const drawn = variedParams(SCENES[s.tool], s.seed);
  const moved = Object.entries(s.params).filter(([k, v]) => drawn[k] !== v).map(([k, v]) => `${k}:${v}`);
  if (moved.length) q.set('d', moved.join(','));
  if (s.finish !== 'none') q.set('f', s.finish);
  if (s.grain > 0) q.set('g', String(s.grain));
  if (s.mat !== 'none') q.set('m', s.mat);
  q.set('r', s.ratio.replace(':', 'x'));
  return `#/${s.tool}/${s.seed}?${q.toString()}`;
}

function parse(hash) {
  const h = hash.replace(/^#\/?/, '');
  if (!h) return null;
  const [path, query = ''] = h.split('?');
  const [tool, seedText] = path.split('/');
  if (!SCENES[tool]) return null;
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
    ratio: RATIOS.includes(ratio) ? ratio : null,
    full: q.has('i'),
  };
}

/** Put the state in the address without adding a step to the back button. */
function writeAddress() {
  if (!state.tool) return;
  history_replace(encode());
}
function history_replace(hash) {
  try {
    window.history.replaceState(null, '', hash);
  } catch {
    /* a sandboxed frame may refuse; the picture still works */
  }
}

// --- the views ---------------------------------------------------------------------------

const indexView = $('#index-view');
const toolView = $('#tool-view');

function route() {
  const r = parse(location.hash);
  if (!r) showIndex();
  else openTool(r);
}
window.addEventListener('hashchange', route);

function setAccent(inks) {
  const root = document.documentElement;
  const a = inks ? accentFor(paletteFromInks(inks), false) : '#e8b04a';
  root.style.setProperty('--accent', a);
  root.style.setProperty('--accent-ink', lightnessOf(a) > 0.62 ? '#15130e' : '#ffffff');
}

// --- the index ---------------------------------------------------------------------------

let kind = 'All';
const cards = new Map();

function buildIndex() {
  const kinds = $('#kinds');
  const counts = { All: TOOLS.length };
  for (const n of TOOLS) counts[SCENES[n].shelf] = (counts[SCENES[n].shelf] || 0) + 1;
  for (const k of ['All', ...SCENE_SHELVES.filter((s) => counts[s])]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.kind = k;
    b.setAttribute('aria-pressed', String(k === kind));
    b.innerHTML = `${k === 'All' ? 'All tools' : k}<span class="n">${counts[k]}</span>`;
    b.addEventListener('click', () => {
      kind = k;
      filterTools();
    });
    kinds.append(b);
  }
  const grid = $('#tools');
  for (const name of TOOLS) {
    const s = SCENES[name];
    const card = document.createElement('a');
    card.className = 'tool-card' + (NEW_TOOLS.has(name) ? ' new' : '');
    card.href = `#/${name}`;
    card.dataset.tool = name;
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 240;
    cv.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.innerHTML = `<span class="top"><span class="no">${numberOf(name)}</span><span class="name"></span><span class="kind"></span></span><span class="note"></span>`;
    meta.querySelector('.name').textContent = s.label;
    meta.querySelector('.kind').textContent = s.shelf;
    meta.querySelector('.note').textContent = s.note;
    card.append(cv, meta);
    card.addEventListener('pointerenter', () => liveCard(name));
    card.addEventListener('pointerleave', () => stopLiveCard());
    card.addEventListener('focus', () => liveCard(name));
    card.addEventListener('blur', () => stopLiveCard());
    grid.append(card);
    cards.set(name, { el: card, canvas: cv, painted: false });
  }
  // Paint only what is in view, one card a frame: a hundred previews at once
  // would hold the page for seconds.
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) queuePaint(e.target.dataset.tool);
    }
  }, { rootMargin: '300px 0px' });
  for (const { el } of cards.values()) seen.observe(el);
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
  const ctx = c.canvas.getContext('2d');
  previewScene(ctx, name, { w: c.canvas.width, h: c.canvas.height, palette: paletteFromInks(look.inks), seed: (hashOf(name) % 9000) + 7, budgetMs: 90 });
  c.painted = true;
  c.el.dataset.painted = 'true';
}

const live = { name: null, raf: 0 };
function liveCard(name) {
  stopLiveCard();
  const c = cards.get(name);
  if (!c) return;
  const look = toolLook(name);
  const ctx = c.canvas.getContext('2d');
  const run = animateScene(ctx, name, { w: c.canvas.width, h: c.canvas.height, palette: paletteFromInks(look.inks), seed: hashOf(name) % 9000, every: 320 });
  live.name = name;
  let last = performance.now();
  const tick = (now) => {
    if (live.name !== name) return;
    run.frame(now - last);
    last = now;
    live.raf = requestAnimationFrame(tick);
  };
  live.raf = requestAnimationFrame(tick);
}
function stopLiveCard() {
  if (!live.name) return;
  cancelAnimationFrame(live.raf);
  const c = cards.get(live.name);
  live.name = null;
  if (c) {
    c.painted = false;
    paintCard(c.el.dataset.tool);
  }
}

function filterTools() {
  const q = $('#find').value.trim().toLowerCase();
  let shown = 0;
  for (const [name, c] of cards) {
    const s = SCENES[name];
    const text = `${s.label} ${name} ${s.note} ${s.shelf} ${numberOf(name)}`.toLowerCase();
    const on = (kind === 'All' || s.shelf === kind) && (!q || q.split(/\s+/).every((w) => text.includes(w)));
    c.el.hidden = !on;
    if (on) shown++;
  }
  $('#none').hidden = shown > 0;
  for (const b of document.querySelectorAll('#kinds .chip')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  // Cards that have just been revealed are painted as they come into view.
  for (const [name, c] of cards) if (!c.el.hidden && !c.painted) {
    const r = c.el.getBoundingClientRect();
    if (r.top < innerHeight + 300 && r.bottom > -300) queuePaint(name);
  }
  return shown;
}

function firstShown() {
  for (const [name, c] of cards) if (!c.el.hidden) return name;
  return null;
}

function showIndex() {
  stopStage();
  toolView.hidden = true;
  indexView.hidden = false;
  $('#to-index').hidden = true;
  $('#crumb-tool').textContent = '';
  document.title = 'Playground · Tintinnabulum';
  setAccent(null);
  state.tool = null;
  filterTools();
  if (matchMedia('(hover: hover)').matches) $('#find').focus({ preventScroll: true });
}

// --- a tool --------------------------------------------------------------------------------

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
  }
  if (r.ratio) state.ratio = r.ratio;
  if (fresh) {
    state.kit = store.get(`play-kit:${r.tool}`) || look.kit;
    if (son) son.setKit(state.kit);
    history = [state.seed];
    place = 0;
  } else if (history[place] !== state.seed) {
    history = history.slice(0, place + 1);
    history.push(state.seed);
    place = history.length - 1;
  }
  indexView.hidden = true;
  toolView.hidden = false;
  $('#to-index').hidden = false;
  $('#crumb-tool').textContent = `${numberOf(r.tool)}  ${scene.label}`;
  document.title = `${scene.label} · Playground · Tintinnabulum`;
  window.scrollTo(0, 0);
  buildDials();
  refreshAll();
  writeAddress();
  rebuild();
}

function buildDials() {
  const scene = SCENES[state.tool];
  $('#tool-title').textContent = scene.label;
  $('#tool-note').textContent = scene.note;
  const host = $('#dials');
  host.textContent = '';
  const specs = Object.entries(scene.params || {});
  $('#shuffle-dials').disabled = specs.length === 0;
  $('#reset-dials').disabled = specs.length === 0;
  if (!specs.length) {
    const p = document.createElement('p');
    p.className = 'no-dials';
    p.textContent = 'This one has no dials of its own. The variation, the colours and the texture are yours.';
    host.append(p);
    return;
  }
  for (const [name, spec] of specs) {
    const wrap = document.createElement('div');
    wrap.className = 'dial';
    const id = `dial-${name}`;
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
  $('#seed').value = String(state.seed);
  for (const input of document.querySelectorAll('#dials input[type="range"]')) {
    input.value = state.params[input.dataset.param];
    showDial(input);
  }
  refreshInks();
  for (const b of document.querySelectorAll('#finishes .chip')) b.setAttribute('aria-pressed', String(b.dataset.finish === state.finish));
  for (const b of document.querySelectorAll('#mat button')) b.setAttribute('aria-pressed', String(b.dataset.mat === state.mat));
  for (const b of document.querySelectorAll('#ratios button')) b.setAttribute('aria-pressed', String(b.dataset.ratio === state.ratio));
  const grain = $('#grain');
  grain.value = state.grain;
  $('#grain-out').textContent = state.grain ? `${Math.round((state.grain / 0.6) * 100)}%` : 'Off';
  paintRange(grain);
  const tempo = $('#tempo');
  tempo.value = state.tempo;
  $('#tempo-out').textContent = state.tempo.toFixed(2).replace(/\.?0+$/, '');
  paintRange(tempo);
  $('#kit').value = state.kit;
  const vol = $('#volume');
  vol.value = state.volume;
  $('#volume-out').textContent = `${Math.round(state.volume * 100)}%`;
  paintRange(vol);
  refreshTransport();
  renderCaptures();
}

function refreshTransport() {
  const play = $('#play');
  play.setAttribute('aria-pressed', String(state.animate));
  play.querySelector('span').textContent = state.animate ? 'Moving' : 'Still';
  play.querySelector('svg').innerHTML = state.animate
    ? '<path d="M4.5 3h2.2v10H4.5zM9.3 3h2.2v10H9.3z"/>'
    : '<path d="M4.5 2.8l8.5 5.2-8.5 5.2z"/>';
  const hear = $('#hear');
  hear.setAttribute('aria-pressed', String(state.hear));
  hear.querySelector('span').textContent = state.hear ? 'Hearing it' : 'Hear it';
}

// --- colour ---------------------------------------------------------------------------------

function refreshInks() {
  const host = $('#inks');
  host.textContent = '';
  state.inks.forEach((c, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'ink';
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
      setAccent(state.inks);
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
    add.className = 'add-ink';
    add.setAttribute('aria-label', 'Add an ink');
    add.textContent = '+';
    add.addEventListener('click', () => {
      const extra = inkSet(randomSeed(), 6)[1 + (state.inks.length % 5)];
      state.inks.push(extra);
      inksChanged();
    });
    host.append(add);
  }
  $('#ink-count').textContent = `${state.inks.length} inks`;
  const mine = $('#my-colours');
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
  setAccent(state.inks);
}

function inksChanged() {
  refreshInks();
  writeAddress();
  scheduleRebuild();
}

function newColours() {
  state.inks = inkSet(randomSeed(), clamp(state.inks.length || 4, 3, 5));
  $('#palette').value = '';
  inksChanged();
}

function rotateColours() {
  state.inks = rotateInks(state.inks);
  inksChanged();
}

// --- texture, frame, motion ---------------------------------------------------------------

function buildControls() {
  const finishes = $('#finishes');
  for (const name of FINISH_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.finish = name;
    b.textContent = FINISHES[name].label;
    b.title = FINISHES[name].note;
    b.addEventListener('click', () => {
      state.finish = name;
      changed();
    });
    finishes.append(b);
  }
  const mat = $('#mat');
  for (const name of MAT_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mat = name;
    b.textContent = { none: 'None', thin: 'Thin mat', gallery: 'Gallery' }[name] || MATS[name].label;
    b.addEventListener('click', () => {
      state.mat = name;
      changed();
    });
    mat.append(b);
  }
  const ratios = $('#ratios');
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
    ratios.append(b);
  }
  const select = $('#palette');
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
  const kit = $('#kit');
  for (const k of SOUND_KITS) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = KITS[k].label || k;
    kit.append(o);
  }
  kit.addEventListener('change', () => {
    state.kit = kit.value;
    store.set(`play-kit:${state.tool}`, state.kit);
    if (son) son.setKit(state.kit);
  });
  $('#grain').addEventListener('input', (e) => {
    state.grain = Number(e.target.value);
    refreshAll();
    scheduleRebuild();
  });
  $('#grain').addEventListener('change', writeAddress);
  $('#tempo').addEventListener('input', (e) => {
    state.tempo = Number(e.target.value);
    store.set('play-tempo', state.tempo);
    if (view.player) view.player.every = 1000 / state.tempo;
    refreshAll();
  });
  $('#volume').addEventListener('input', (e) => {
    state.volume = Number(e.target.value);
    store.set('play-volume', state.volume);
    if (son) son.volume = state.volume;
    refreshAll();
  });
}

function changed() {
  refreshAll();
  writeAddress();
  scheduleRebuild();
}

// --- the picture -----------------------------------------------------------------------------

const stage = $('#stage');
const sctx = stage.getContext('2d');
const frameEl = $('#frame');
const pool = {};
const view = { player: null, params: null, token: 0, raf: 0, last: 0, pending: false };

function stageSize() {
  const box = $('#frame-box').getBoundingClientRect();
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
  if (!state.tool || toolView.hidden) return;
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
    pool,
    seed: state.seed,
    every: 1000 / state.tempo,
    onArrive: sound,
  });
  develop(token);
}

function develop(token) {
  frameEl.classList.add('developing');
  const bar = $('#develop');
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
    frameEl.dataset.developed = String(token);
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
  const f = $('#flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

// --- variations ---------------------------------------------------------------------------------

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
  const b = $('#new-variation');
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
  const specs = SCENES[state.tool].params;
  if (!specs) return;
  state.params = variedParams(SCENES[state.tool], randomSeed(), 1.4);
  refreshAll();
  writeAddress();
  rebuild();
}

function resetDials() {
  const specs = SCENES[state.tool].params || {};
  state.params = Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, s.default]));
  refreshAll();
  writeAddress();
  rebuild();
}

// --- sound -------------------------------------------------------------------------------------

let son = null;

function ensureSon() {
  if (son) return son;
  const kit = state.kit === 'synth' || state.kit === 'hatnote' ? state.kit : makeKit(state.kit);
  son = new Sonifier({
    kit,
    mapping: { mode: 'adaptive', scale: 'pentatonic', range: 24, jitter: 0.2 },
    voices: { maxVoices: 12 },
  });
  son.volume = state.volume;
  return son;
}

/** One event of the picture, heard: larger marks lower, as everywhere else in the engine. */
function sound(p, i) {
  if (!state.hear || !son || son.locked) return;
  son.emit({
    magnitude: Math.max(1, Math.round(p.r * p.r * 3)),
    id: `play-${state.tool}-${i}`,
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
  const s = ensureSon();
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

// --- keeping ---------------------------------------------------------------------------------

function thumbOf(canvas) {
  const k = 220 / Math.max(canvas.width, canvas.height);
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(canvas.width * k));
  t.height = Math.max(1, Math.round(canvas.height * k));
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.78);
}

function snapshot() {
  return {
    tool: state.tool, seed: state.seed, params: { ...state.params }, inks: state.inks.slice(),
    finish: state.finish, grain: state.grain, mat: state.mat, ratio: state.ratio,
  };
}

function keep() {
  if (!state.tool) return;
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
  const host = $('#captures');
  host.textContent = '';
  captures.forEach((c, i) => {
    const b = document.createElement('div');
    b.className = 'capture' + (fresh && i === 0 ? ' fresh' : '');
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
    const open = () => restore(c.state);
    b.addEventListener('click', open);
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') open();
    });
    b.append(img, x);
    host.append(b);
  });
  $('#captures-empty').hidden = captures.length > 0;
  $('#capture-count').textContent = captures.length ? String(captures.length) : '';
}

function restore(s) {
  if (!SCENES[s.tool]) return;
  const target = { ...state, ...s, inks: s.inks.slice(), params: { ...s.params } };
  const hash = encode(target);
  if (s.tool !== state.tool) {
    location.hash = hash;
    return;
  }
  Object.assign(state, target);
  if (history[place] !== state.seed) {
    history = history.slice(0, place + 1);
    history.push(state.seed);
    place = history.length - 1;
  }
  refreshAll();
  writeAddress();
  rebuild();
}

// --- taking it away ------------------------------------------------------------------------------

let busy = false;

function status(text) {
  $('#export-status').textContent = text;
}

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
  if (busy || !state.tool) return;
  busy = true;
  const long = Number($('#png-size').value) || 2048;
  const [rw, rh] = ratioOf(state.ratio);
  const w = rw >= rh ? long : Math.round((long * rw) / rh);
  const h = rw >= rh ? Math.round((long * rh) / rw) : long;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const player = playScene(cv.getContext('2d'), state.tool, {
    w, h, palette: paletteFromInks(state.inks), params: { ...state.params },
    finish: state.finish, mat: state.mat, grain: state.grain, pool: {}, seed: state.seed, every: 1000 / state.tempo,
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

async function exportVideo() {
  if (busy || !state.tool) return;
  if (typeof MediaRecorder === 'undefined' || !stage.captureStream) {
    status('This browser cannot record video.');
    return;
  }
  busy = true;
  const seconds = Number($('#video-length').value) || 12;
  const stream = stage.captureStream(30);
  const withSound = state.hear && son && !son.locked;
  if (withSound) for (const t of son.engine.captureStream().getAudioTracks()) stream.addTrack(t);
  const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    .find((t) => MediaRecorder.isTypeSupported(t)) || '';
  let rec;
  try {
    rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8000000 } : undefined);
  } catch (e) {
    busy = false;
    status('This browser cannot record video.');
    return;
  }
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((r) => {
    rec.onstop = r;
  });
  const wasMoving = state.animate;
  if (!state.animate) setAnimate(true);
  const button = $('#export-video');
  button.disabled = true;
  rec.start(250);
  let left = seconds;
  status(`Recording${withSound ? ' with sound' : ''}… ${left} s`);
  await new Promise((resolve) => {
    const t = setInterval(() => {
      left--;
      status(`Recording${withSound ? ' with sound' : ''}… ${left} s`);
      if (left <= 0) {
        clearInterval(t);
        resolve();
      }
    }, 1000);
  });
  rec.stop();
  await stopped;
  for (const t of stream.getVideoTracks()) t.stop();
  if (!wasMoving) setAnimate(false);
  button.disabled = false;
  busy = false;
  const blob = new Blob(chunks, { type: (type.split(';')[0]) || 'video/webm' });
  download(blob, `${fileBase()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
  status(`Saved, ${seconds} seconds${withSound ? ' with sound' : ', silent: press Hear it first to record the sound'}.`);
  toast('Video saved');
}

// --- small things ---------------------------------------------------------------------------------

let toastTimer = 0;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

async function copyLink() {
  writeAddress();
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    toast('Copy the address from the bar above');
  }
}

// --- wiring ------------------------------------------------------------------------------------------

function wire() {
  $('#new-variation').addEventListener('click', newVariation);
  $('#prev-var').addEventListener('click', () => stepVariation(-1));
  $('#next-var').addEventListener('click', () => stepVariation(1));
  $('#copy-link').addEventListener('click', copyLink);
  $('#seed').addEventListener('change', (e) => {
    const n = Number.parseInt(e.target.value, 10);
    if (Number.isFinite(n) && n > 0) setSeed(n);
    else e.target.value = String(state.seed);
  });
  $('#shuffle-dials').addEventListener('click', shuffleDials);
  $('#reset-dials').addEventListener('click', resetDials);
  $('#new-colours').addEventListener('click', newColours);
  $('#rotate-colours').addEventListener('click', rotateColours);
  $('#keep-colours').addEventListener('click', () => {
    const key = state.inks.join();
    savedInks = [state.inks.slice(), ...savedInks.filter((s) => s.join() !== key)].slice(0, 12);
    store.set('play-inks', JSON.stringify(savedInks));
    refreshInks();
    toast('Colours saved');
  });
  $('#play').addEventListener('click', () => setAnimate(!state.animate));
  $('#hear').addEventListener('click', toggleHear);
  $('#keep').addEventListener('click', keep);
  $('#export-png').addEventListener('click', exportPicture);
  $('#export-video').addEventListener('click', exportVideo);
  stage.addEventListener('click', newVariation);
  stage.title = 'Click for a new variation';
  $('#random-tool').addEventListener('click', () => {
    const shown = TOOLS.filter((n) => !cards.get(n).el.hidden);
    const list = shown.length ? shown : TOOLS;
    location.hash = `#/${list[Math.floor(Math.random() * list.length)]}`;
  });
  $('#find').addEventListener('input', filterTools);
  // A button clicked with the mouse gives its focus back, so Space keeps
  // meaning "another one" rather than pressing the last button again.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, .chip');
    if (b && e.detail > 0) b.blur();
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t.closest && t.closest('input, select, textarea') && !['range', 'color'].includes(t.type);
    if (!indexView.hidden) {
      const find = $('#find');
      if (e.key === 'Escape') {
        find.value = '';
        kind = 'All';
        filterTools();
        return;
      }
      if (e.key === 'Enter' && (t === find || t === document.body)) {
        const first = firstShown();
        if (first) location.hash = `#/${first}`;
        e.preventDefault();
        return;
      }
      if (!typing && e.key.length === 1 && /\S/.test(e.key) && t !== find) find.focus();
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
        if (onButton && t.id !== 'new-variation') return;
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
      case 'Escape': location.hash = '#/'; break;
      default: return;
    }
  });

  // Between a wide screen and a narrower one the output column folds into the
  // first, so nothing is ever more than one scroll away.
  const narrow = matchMedia('(max-width: 1180px)');
  const placeOutput = () => (narrow.matches ? $('#output-here') : $('#output')).append($('#output-body'));
  narrow.addEventListener('change', placeOutput);
  placeOutput();
  let lastBox = '';
  new ResizeObserver(() => {
    const r = $('#frame-box').getBoundingClientRect();
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key === lastBox) return;
    lastBox = key;
    if (!toolView.hidden) scheduleRebuild();
  }).observe($('#frame-box'));
}

buildIndex();
buildControls();
wire();
route();

// For the console and for the test suite.
window.playground = {
  state,
  TOOLS,
  get player() {
    return view.player;
  },
  get son() {
    return son;
  },
  get captures() {
    return captures;
  },
  rebuild,
  newVariation,
  keep,
  toolLook,
};
