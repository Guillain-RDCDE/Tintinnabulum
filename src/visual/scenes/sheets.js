// One scene, several sheets.
//
// A scene that has learned a second way of drawing -- a sheet of cells and a
// stack of bands, a sentence and a screen of digits -- used to carry the
// choice itself: a `figure` dial read in init, and `if (s.figure === 1)`
// written three times over, in init, event and frame, in eight scenes. The
// choice is one thing and belongs in one place.
//
// `sheets()` takes the scene's common ground and a list of sheets, each a
// scene in its own right, and returns one scene. The dial it adds is a choice
// rather than a slider: it carries the sheets' names as `options`, rebuilds
// the scene, and is never varied -- a different sheet is a different picture,
// not a variation of this one. Every other dial is tagged with the sheets it
// belongs to, so a panel can show only the dials of the sheet on view.

/**
 * @param {object} spec
 * @param {string} spec.label        the scene's name on the shelf
 * @param {object[]} spec.list       the sheets, in order; each { name, params?, init?, event?, frame, how? }
 * @param {string} [spec.dial]       the dial's name, `figure` unless said otherwise
 * @param {string} [spec.choice]     the dial's label
 * @param {object} [spec.params]     dials every sheet shares
 * @returns {object} a scene
 */
export function sheets({ label, note, how, positional, preview, list, dial = 'figure', choice = 'Which sheet', params = {} }) {
  if (!Array.isArray(list) || list.length < 2) throw new Error(`${label}: sheets() wants at least two sheets`);
  const names = list.map((sh) => sh.name);
  const merged = {
    [dial]: {
      label: `${choice}: ${names.join(', ')}`,
      options: names,
      min: 0,
      max: list.length - 1,
      step: 1,
      default: 0,
      rebuild: true,
      vary: false,
    },
  };
  for (const [k, spec] of Object.entries(params)) merged[k] = { ...spec };
  for (const sh of list) {
    for (const [k, spec] of Object.entries(sh.params || {})) {
      if (merged[k]) {
        // The same dial on two sheets: one entry, tagged with both. Its range
        // and default are the first sheet's, so two sheets cannot disagree
        // about what the dial means.
        merged[k].sheets = [...(merged[k].sheets || names), sh.name].filter((v, i, a) => a.indexOf(v) === i);
      } else {
        merged[k] = { ...spec, sheets: [sh.name] };
      }
    }
  }
  const at = (api) => list[api.scene.sheet] || list[0];
  const hows = list.filter((sh) => sh.how).map((sh) => `${sh.name[0].toUpperCase()}${sh.name.slice(1)}: ${sh.how}`);
  return {
    label,
    note,
    // Left undefined when nobody wrote one, so the catalogue falls back to
    // the note as it does for every other scene.
    how: how || (hows.length ? hows.join(' ') : undefined),
    positional,
    preview,
    params: merged,
    sheets: names,
    init(api) {
      const v = Math.round(Number(api.param(dial)) || 0);
      api.scene.sheet = Math.max(0, Math.min(list.length - 1, v));
      const sh = at(api);
      if (sh.init) sh.init(api);
    },
    event(p, api) {
      if (api.scene.sheet === undefined) return;
      const sh = at(api);
      if (sh.event) sh.event(p, api);
    },
    frame(ctx, api) {
      if (api.scene.sheet === undefined) return;
      at(api).frame(ctx, api);
    },
  };
}

/** The name of the sheet a scene is on for these dial values, or '' for a scene with one. */
export function sheetNameOf(scene, params = {}) {
  if (!scene || !scene.sheets) return '';
  const spec = scene.params.figure;
  const v = Math.round(Number(params.figure ?? spec.default) || 0);
  return scene.sheets[Math.max(0, Math.min(scene.sheets.length - 1, v))] || '';
}
