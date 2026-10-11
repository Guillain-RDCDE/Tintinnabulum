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
