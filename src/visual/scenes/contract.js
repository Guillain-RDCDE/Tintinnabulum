// What a scene's dials must be, said once.
//
// A dial is a slider or a set of named buttons in two panels, a key in a work,
// a pair in an address and a number a variation draws. Each of those reads
// the same few fields, and a dial that breaks one of them breaks it silently:
// a default outside the range shows a slider at its end and draws another
// picture; a step that does not divide the range leaves the top unreachable;
// a list of options one short shows a button that does nothing.
//
// The names matter as much. A scene's dial and a setting of the whole picture
// travel together -- in an address, in a work, in a message to a projected
// wall -- and a dial called `grain` beside the film grain of the finish is
// two different things under one name.

/**
 * Names a scene's dial must not take: the settings of the whole picture, of
 * the sound and of a show, and the members of the api handed to a scene.
 */
export const GLOBAL_SETTING_NAMES = Object.freeze([
  // the look
  'scene', 'palette', 'finish', 'ground', 'mat', 'grain', 'living', 'pace', 'richness', 'depth', 'shape',
  'second', 'blend', 'mix', 'starfield', 'inks', 'ratio', 'tool',
  // the sound
  'kit', 'space', 'sound', 'volume',
  // a show and the projected wall
  'exhibition', 'hold', 'minutes', 'fade', 'seed', 'work', 'works', 'room', 'show', 'wall', 'feed',
  'langs', 'people', 'quiet', 'reload', 'standby', 'idle', 'label', 'full', 'open',
  // what a scene is handed
  'w', 'h', 'now', 'dt', 'particles', 'buffers', 'darkGround', 'budget', 'param', 'fill',
]);

/**
 * Everything wrong with one dial, as sentences; empty when it is sound.
 *
 * @param {string} name
 * @param {object} spec
 * @returns {string[]}
 */
export function dialProblems(name, spec) {
  const out = [];
  if (!spec || typeof spec !== 'object') return [`${name} is not a dial`];
  const { min, max, step, default: d } = spec;
  if (![min, max, d].every(Number.isFinite)) out.push(`${name} wants a numeric min, max and default`);
  else {
    if (!(min < max)) out.push(`${name}: min ${min} is not below max ${max}`);
    if (!(d >= min && d <= max)) out.push(`${name}: default ${d} outside ${min}..${max}`);
  }
  if (!(Number.isFinite(step) && step > 0)) out.push(`${name} has no step`);
  else if (Number.isFinite(min) && Number.isFinite(max)) {
    const n = (max - min) / step;
    if (Math.abs(n - Math.round(n)) > 1e-6) out.push(`${name}: step ${step} does not divide ${min}..${max}`);
  }
  if (typeof spec.label !== 'string' || !spec.label) out.push(`${name} has no label`);
  if (spec.options !== undefined) {
    if (!Array.isArray(spec.options) || !spec.options.every((o) => typeof o === 'string' && o)) out.push(`${name}: options are not names`);
    else if (spec.options.length !== max - min + 1) out.push(`${name}: ${spec.options.length} options for ${max - min + 1} positions`);
    if (spec.vary !== true && spec.vary !== false) out.push(`${name} is a choice and must say whether it varies`);
  }
  if (spec.vary !== undefined && typeof spec.vary !== 'boolean') out.push(`${name}: vary is not true or false`);
  return out;
}

// --- contract v2: defineScene ------------------------------------------------------------

/**
 * What a dial is for, when a scene says so. Optional, and checked when given:
 * a panel, an address or a variation can then treat every `amount` the same
 * way without knowing the scene.
 */
export const DIAL_ROLES = Object.freeze(['choice', 'count', 'size', 'amount', 'rate', 'time', 'angle', 'ratio']);

/** The unit a dial is read in, when a scene says so. */
export const DIAL_UNITS = Object.freeze(['px', 'ms', 's', 'deg', 'x', 'fraction', 'items', 'steps']);

/** How a scene hears the feed: in `event` as each arrives, or by reading the marks in `frame`. */
export const FEED_MODES = Object.freeze(['push', 'pull']);

/**
 * Dials that were renamed, old name to new, per scene.
 *
 * Each of these took the name of a setting of the whole picture -- `grain`
 * for a cell in pixels beside the film grain of the finish, `depth` for a
 * count of circles beside the renderer's depth, `hold` for a trail beside the
 * exhibition's hold -- and was renamed for what it is. The old name is still
 * accepted everywhere a dial is named from outside -- a work, an address, a
 * stored panel, a message to the wall -- and is read as the new one, so no
 * picture made with the old name changes.
 */
export const DIAL_ALIASES = Object.freeze({
  reaction: { grain: 'cell', feed: 'feedRate' },
  quasicrystal: { grain: 'cell' },
  coral: { grain: 'cell' },
  voronoi: { grain: 'cell' },
  peals: { grain: 'dust' },
  attractor: { hold: 'linger' },
  dejong: { hold: 'linger' },
  drip: { hold: 'linger' },
  apollonian: { depth: 'circles' },
  penrose: { depth: 'subdivisions' },
  groove: { depth: 'cut' },
  grid: { fill: 'fullness' },
  glyphs: { fill: 'fullness' },
  mondrian: { fill: 'filled' },
  packing: { fill: 'filled' },
  meshes: { fill: 'flat' },
  harmonograph: { ratio: 'frequency' },
  sheaf: { inks: 'inkCount' },
});

/**
 * The name a scene knows a dial by: itself, or the new name of an old one.
 *
 * @param {object} scene  a scene, as registered
 * @param {string} name
 */
export function dialName(scene, name) {
  if (!scene) return name;
  const params = scene.params || {};
  if (params[name]) return name;
  const to = scene.aliases && scene.aliases[name];
  return to && params[to] ? to : name;
}

/**
 * A set of dial values with every old name read as the new one. A value given
 * under both names keeps the new name's.
 */
export function canonicalDials(scene, values) {
  if (!values || typeof values !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const name = dialName(scene, k);
    if (name !== k && Object.prototype.hasOwnProperty.call(values, name)) continue;
    out[name] = v;
  }
  return out;
}

/**
 * Everything wrong with a scene as a whole, as sentences; empty when sound.
 * The dials against dialProblems, their names against the settings of the
 * whole picture, `role`, `unit` and `feed` against their vocabularies, and the
 * aliases against the dials they name.
 */
export function sceneProblems(name, def) {
  const out = [];
  if (!def || typeof def.frame !== 'function') return [`${name} needs a frame(ctx, api) function`];
  const params = def.params || {};
  for (const [k, spec] of Object.entries(params)) {
    for (const p of dialProblems(k, spec)) out.push(`${name}.${p}`);
    if (GLOBAL_SETTING_NAMES.includes(k)) out.push(`${name}.${k} takes the name of a setting of the whole picture`);
    if (spec.role !== undefined && !DIAL_ROLES.includes(spec.role)) out.push(`${name}.${k}: role "${spec.role}" is not one of ${DIAL_ROLES.join(', ')}`);
    if (spec.unit !== undefined && !DIAL_UNITS.includes(spec.unit)) out.push(`${name}.${k}: unit "${spec.unit}" is not one of ${DIAL_UNITS.join(', ')}`);
    if (spec.role === 'choice' && !Array.isArray(spec.options)) out.push(`${name}.${k} is a choice without options`);
  }
  if (def.feed !== undefined) {
    if (!def.feed || !FEED_MODES.includes(def.feed.mode)) out.push(`${name}: feed.mode must be one of ${FEED_MODES.join(', ')}`);
    else if (def.feed.mode === 'push' && typeof def.event !== 'function') out.push(`${name} hears the feed in event() but has none`);
  }
  for (const [from, to] of Object.entries(def.aliases || {})) {
    if (params[from]) out.push(`${name}: alias ${from} is still a dial`);
    if (!params[to]) out.push(`${name}: alias ${from} names no dial ${to}`);
  }
  return out;
}

/**
 * A scene, checked and completed: the one door every scene comes in by.
 *
 * Adds what can be said for the scene when it does not say it -- `feed.mode`
 * (push when it has an event handler, pull otherwise), `role: 'choice'` on a
 * dial with named options, and the scene's entry in the alias table -- and
 * throws, listing every problem at once, when the scene breaks the contract.
 * The object is completed in place and returned, so a family module's own
 * export stays the scene the registry holds.
 *
 * @param {string} name
 * @param {object} def
 * @returns {object} def
 */
export function defineScene(name, def) {
  if (def && DIAL_ALIASES[name]) def.aliases = { ...DIAL_ALIASES[name], ...(def.aliases || {}) };
  const problems = sceneProblems(name, def);
  if (problems.length) throw new Error(`scene "${name}" breaks the contract: ${problems.join('; ')}`);
  if (!def.feed) def.feed = { mode: typeof def.event === 'function' ? 'push' : 'pull' };
  for (const spec of Object.values(def.params || {})) {
    if (Array.isArray(spec.options) && spec.role === undefined) spec.role = 'choice';
  }
  return def;
}
