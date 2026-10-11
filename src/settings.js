// One Settings object, and one way to write it down.
//
// What a picture is set to used to be saved four ways, each with its own idea
// of the units: the Look panel kept a key per control in localStorage (the
// pace as an index into six words, the grain as a flag, the mix as a
// percentage); Create wrote an address (the grain as a strength up to 0.6);
// the projection window read its own query string; and the console sent the
// wall a message (the grain as a boolean, the pace as a multiplier). A dial
// renamed in one was still the old name in the other three.
//
// A Settings is the shape workSettings() resolves a work to -- scene, palette,
// kit, space, finish, ground, mat, grain, living, pace, params -- with the rest
// of the look beside it and a show layer underneath:
//
//   look    scene palette finish ground mat grain living pace shape richness
//           depth starfield second blend mix budget work
//   scene   params: { [scene]: { [dial]: value } }, old dial names read as new
//   sound   kit space volume
//   show    the projection window's own: exhibition minutes hold fade seed
//           work works room show feed langs people standby quiet idle open
//           label full of wall reload sound
//
// and in it `grain` is an amount from 0 to 1 and `pace` a multiplier, always.
// Every other form is a codec's business: toQuery/fromQuery, toStore/fromStore
// (which reads the old per-control keys and moves them), toMessage/fromMessage,
// and toHash/fromHash for a Create address. Every address, stored panel and
// message written before reads exactly as it did.

import { WORK_PACE, workSettings } from './works.js';
import { canonicalDials } from './visual/scenes/contract.js';

/** The strength the film grain is drawn at for an amount of one. */
export const GRAIN_STRENGTH = 0.6;
/** The amount a work's or the wall's grain switched "on" has always been drawn at (strength 0.28). */
export const GRAIN_ON = 0.28 / GRAIN_STRENGTH;
/** The six paces a panel offers, as multipliers: very slow to brisk. */
export const PACE_STEPS = WORK_PACE;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

/** An amount of grain, 0 to 1, from whatever a setting held: on/off, or an amount. */
export function grainAmount(v) {
  if (v === true) return GRAIN_ON;
  if (v === false || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 0;
}

/** The strength the grain is drawn at, for an amount. */
export const grainStrength = (amount) => grainAmount(amount) * GRAIN_STRENGTH;

/** The pace step nearest a multiplier, for a panel that offers six words. */
export function paceStep(pace) {
  let best = 0;
  for (let i = 1; i < PACE_STEPS.length; i++) if (Math.abs(PACE_STEPS[i] - pace) < Math.abs(PACE_STEPS[best] - pace)) best = i;
  return best;
}

/**
 * A work, as Settings: what workSettings() resolves it to, which is the
 * canonical form every other is read into and written from.
 */
export function settingsOfWork(work, scenes) {
  return workSettings(work, scenes);
}

const LOOK_STRINGS = ['scene', 'palette', 'finish', 'ground', 'mat', 'living', 'shape', 'second', 'blend', 'kit', 'space'];

/**
 * Settings from anything that held some, in any of the old units: grain as a
 * flag, pace as a multiplier, dials under old names. Unknown fields are left
 * out; what is not given stays undefined, so a partial set applies partially.
 *
 * @param {object} input
 * @param {object} [scenes]  the scene registry, to read old dial names as new
 */
export function normalizeSettings(input, scenes = null) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of LOOK_STRINGS) if (typeof input[k] === 'string') out[k] = input[k];
  if ('work' in input) out.work = typeof input.work === 'string' && input.work ? input.work : null;
  if (input.grain !== undefined) out.grain = grainAmount(input.grain);
  if (Number.isFinite(num(input.pace))) out.pace = clamp(num(input.pace), 0.1, 2);
  for (const k of ['richness', 'mix', 'volume']) if (Number.isFinite(num(input[k]))) out[k] = clamp(num(input[k]), 0, 1);
  if (Number.isFinite(num(input.budget))) out.budget = num(input.budget);
  for (const k of ['depth', 'starfield']) if (typeof input[k] === 'boolean') out[k] = input[k];
  if (input.params && typeof input.params === 'object') {
    out.params = {};
    for (const [scene, dials] of Object.entries(input.params)) {
      if (dials && typeof dials === 'object') out.params[scene] = scenes ? canonicalDials(scenes[scene], dials) : { ...dials };
    }
  }
  if (input.show && typeof input.show === 'object') out.show = { ...input.show };
  return out;
}

// --- the message to the wall ------------------------------------------------------------

/** The message the console sends a projected wall: Settings, in Settings' own units. */
export function toMessage(settings) {
  return { type: 'settings', settings: normalizeSettings(settings) };
}

/**
 * What a wall reads from a message, old or new: an older console sent the
 * grain as a flag, and every console sent the pace as a multiplier.
 */
export function fromMessage(msg, scenes = null) {
  const s = msg && msg.type === 'settings' ? msg.settings : msg;
  return normalizeSettings(s, scenes);
}

// --- the projection window's address ---------------------------------------------------

/** The names a projection address may carry for its show, each read as a string. */
export const SHOW_KEYS = Object.freeze([
  'exhibition', 'minutes', 'hold', 'fade', 'seed', 'work', 'works', 'room', 'show', 'feed', 'langs', 'people',
  'standby', 'quiet', 'idle', 'open', 'label', 'full', 'of', 'wall', 'reload', 'sound', 'volume',
]);

/**
 * Settings from a projection address. The show layer is kept as the strings
 * the address held (null when absent), because each has its own default and
 * the wall says what an absent one means; the look layer, when the address
 * carries one (palette, scene, finish, ground, mat, grain, living, pace), is
 * read into Settings' units.
 */
export function fromQuery(query, scenes = null) {
  const q = query instanceof URLSearchParams ? query : new URLSearchParams(String(query || ''));
  const show = {};
  for (const k of SHOW_KEYS) show[k] = q.has(k) ? q.get(k) : null;
  const look = {};
  for (const k of ['palette', 'scene', 'finish', 'ground', 'mat', 'living']) if (q.has(k)) look[k] = q.get(k);
  if (q.has('grain')) look.grain = q.get('grain') === '1' ? GRAIN_ON : q.get('grain') === '0' ? 0 : num(q.get('grain'));
  if (q.has('pace')) look.pace = num(q.get('pace'));
  return { ...normalizeSettings(look, scenes), show };
}

/** A projection address for Settings: the show layer as given, the look in Settings' units. */
export function toQuery(settings) {
  const q = new URLSearchParams();
  const show = (settings && settings.show) || {};
  for (const k of SHOW_KEYS) if (show[k] !== null && show[k] !== undefined && show[k] !== '') q.set(k, String(show[k]));
  const s = normalizeSettings(settings);
  for (const k of ['palette', 'scene', 'finish', 'ground', 'mat', 'living']) if (s[k]) q.set(k, s[k]);
  if (s.grain !== undefined) q.set('grain', String(+s.grain.toFixed(4)));
  if (s.pace !== undefined) q.set('pace', String(s.pace));
  return q;
}

// --- what a viewer's browser keeps -------------------------------------------------------

const STORE_KEY = 'settings';
const STORE_VERSION = 2;

/**
 * Settings kept in a viewer's browser, as one record. `store` is anything with
 * get(key) and set(key, value), such as demo/store.js.
 */
export function toStore(settings, store) {
  const s = normalizeSettings(settings);
  store.set(STORE_KEY, JSON.stringify({ v: STORE_VERSION, ...s }));
  return s;
}

/**
 * Settings from a viewer's browser. A record written by toStore is read as it
 * is. Before it, the Look panel kept a key per control -- `palette`, `scene`,
 * `p:<scene>:<dial>`, the pace as an index, the grain as a flag, the mix and
 * the colour variety as percentages -- and those are read in their old units,
 * old dial names included, and written back as one record, so the next read
 * finds it where it now lives. The old keys are left in place for a page that
 * has not been reloaded since.
 *
 * @param {object} store
 * @param {object} [scenes]  the registry, for the dials and the old dial names
 */
export function fromStore(store, scenes = null) {
  let raw;
  try {
    raw = JSON.parse(store.get(STORE_KEY) || 'null');
  } catch {
    raw = null;
  }
  if (raw && typeof raw === 'object' && raw.v === STORE_VERSION) {
    const { v, ...rest } = raw;
    void v;
    return normalizeSettings(rest, scenes);
  }
  const s = migrateStore(store, scenes);
  toStore(s, store);
  return normalizeSettings(s, scenes);
}

/** The Look panel's old per-control keys, read in their old units. */
export function migrateStore(store, scenes = null) {
  const get = (k) => {
    const v = store.get(k);
    return v === null || v === undefined || v === '' ? null : v;
  };
  const s = {};
  for (const k of ['palette', 'scene', 'finish', 'ground', 'mat', 'living', 'shape', 'second', 'blend', 'kit', 'space']) {
    if (get(k) !== null) s[k] = get(k);
  }
  if (get('grain') !== null) s.grain = get('grain') === '1';
  if (get('pace') !== null) {
    const i = clamp(Math.round(Number(get('pace'))), 0, PACE_STEPS.length - 1);
    if (Number.isFinite(i)) s.pace = PACE_STEPS[i];
  }
  if (get('richness') !== null) s.richness = clamp(Number(get('richness')) / 100, 0, 1);
  if (get('mix') !== null) s.mix = clamp(Number(get('mix')) / 100, 0, 1);
  if (get('budget') !== null) s.budget = Number(get('budget'));
  if (get('depth') !== null) s.depth = get('depth') === '1';
  if (get('starfield') !== null) s.starfield = get('starfield') === '1';
  if (scenes) {
    const params = {};
    for (const [name, scene] of Object.entries(scenes)) {
      const keys = [...Object.keys(scene.params || {}), ...Object.keys(scene.aliases || {})];
      for (const dial of keys) {
        const v = get(`p:${name}:${dial}`);
        if (v === null || !Number.isFinite(Number(v))) continue;
        (params[name] ||= {})[dial] = Number(v);
      }
    }
    if (Object.keys(params).length) s.params = params;
  }
  return s;
}

// --- a Create address --------------------------------------------------------------------

/**
 * A Create address read into the bench's own terms, the grain as an amount.
 * Its format is the one every address was ever written in: `#create/tool/seed?i=
 * inks&d=dial:value,...&f=finish&g=strength&m=mat&p=paper&r=WxH` -- the grain
 * stays a strength in the address, so an old one opens on the same picture.
 *
 * @param {string} hash
 * @param {object} o
 * @param {string} o.prefix       '#create'
 * @param {object} o.scenes
 * @param {object} o.finishes
 * @param {object} o.mats
 * @param {object} o.grounds
 * @param {string[]} o.ratios
 * @returns {?object} null when the address is not Create's
 */
export function fromHash(hash, { prefix, scenes, finishes, mats, grounds, ratios }) {
  if (!String(hash || '').startsWith(prefix)) return null;
  const rest = hash.slice(prefix.length).replace(/^\/?/, '');
  if (!rest) return { index: true };
  const [path, query = ''] = rest.split('?');
  const [tool, seedText] = path.split('/');
  if (!scenes[tool]) return { index: true };
  const q = new URLSearchParams(query);
  const seed = Number.parseInt(seedText, 10);
  const inks = (q.get('i') || '').split('-').filter((c) => /^[0-9a-f]{6}$/i.test(c)).map((c) => '#' + c.toLowerCase());
  const specs = scenes[tool].params || {};
  const pairs = {};
  for (const pair of (q.get('d') || '').split(',')) {
    const [k, v] = pair.split(':');
    if (k) pairs[k] = v;
  }
  // A dial renamed since the address was written is read by its new name.
  const dials = {};
  for (const [k, v] of Object.entries(canonicalDials(scenes[tool], pairs))) {
    const n = Number(v);
    if (specs[k] && Number.isFinite(n)) dials[k] = clamp(n, specs[k].min, specs[k].max);
  }
  const ratio = (q.get('r') || '').replace('x', ':');
  return {
    tool,
    seed: Number.isFinite(seed) && seed > 0 ? Math.min(999999, seed) : null,
    inks: inks.length >= 2 ? inks.slice(0, 6) : null,
    dials,
    finish: finishes[q.get('f')] ? q.get('f') : null,
    grain: q.has('g') ? Number((clamp(Number(q.get('g')) || 0, 0, GRAIN_STRENGTH) / GRAIN_STRENGTH).toFixed(4)) : null,
    mat: mats[q.get('m')] ? q.get('m') : null,
    ground: grounds[q.get('p')] ? q.get('p') : null,
    ratio: ratios.includes(ratio) ? ratio : null,
    full: q.has('i'),
  };
}

/**
 * A Create address for a picture on the bench. `drawn` is what the variation
 * number alone gives (seedParams), which the address is written against: only
 * the dials that differ from it are carried.
 */
export function toHash(state, { prefix, drawn = {} }) {
  const q = new URLSearchParams();
  const hex = (c) => String(c).replace('#', '').toLowerCase();
  q.set('i', state.inks.map(hex).join('-'));
  const moved = Object.entries(state.params).filter(([k, v]) => drawn[k] !== v).map(([k, v]) => `${k}:${v}`);
  if (moved.length) q.set('d', moved.join(','));
  if (state.finish !== 'none') q.set('f', state.finish);
  if (state.grain > 0) q.set('g', String(+(state.grain * GRAIN_STRENGTH).toFixed(6)));
  if (state.mat !== 'none') q.set('m', state.mat);
  if (state.ground && state.ground !== 'none') q.set('p', state.ground);
  q.set('r', state.ratio.replace(':', 'x'));
  return `${prefix}/${state.tool}/${state.seed}?${q.toString()}`;
}
