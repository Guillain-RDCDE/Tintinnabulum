// Everything under "Look": scenes, palettes, shapes, colour variety, the
// ceiling on what stays on screen.
//
// Split out of demo.js, which had grown to six hundred lines. The sections
// there share mutable state, so this is not a line-slice: the four things this
// needs from the page -- the renderer, the two repaint callbacks it cannot
// own, and a way to refresh the panel headers -- arrive as arguments. That is
// the whole coupling, and it is now visible in one signature instead of spread
// through a file.

import {
  PALETTES,
  swatchOf,
  GROUND_BANDS,
  groundBandOf,
  PALETTE_FAMILIES,
  familyOf,
  SHAPES,
  drawShape,
  SCENES,
  previewScene,
} from '../src/index.js';
import { $, createPicker, fitCanvas, caption } from './dom.js';
import { store } from './store.js';

// How far each event's colour may stray from its category's. The wording says
// what the setting costs, not just what it does: at zero a colour identifies a
// category, and past that it stops being able to.
const RICHNESS_STEPS = [
  [0.001, 'off', 'Every event of a category is the exact same colour, so a colour identifies a category.'],
  [0.25, 'subtle', 'A slight spread, enough to tell one mark from the next where they overlap.'],
  [0.6, 'balanced', 'Each category reads as a family of shades. The default, and the best-looking on a busy feed.'],
  [1.01, 'wide', 'Shades range far enough to drift in hue. Handsome on a dense stream, no longer a colour code.'],
];

const SHAPE_CHOICES = [...Object.keys(SHAPES), 'mixed'];
const SHAPE_LABELS = {
  ...SHAPES,
  mixed: { label: 'Mixed', note: 'A shape per event, fixed by its identity.' },
};

/**
 * @param {object} io
 * @param {object}   io.canvas          the CanvasSink being driven
 * @param {Function} io.updateSummaries refresh the folded panel headers
 * @param {Function} io.paintKitArts    the Sound panel's cards follow the palette
 */
export function setupLook({ canvas, updateSummaries, paintKitArts, onLookChange = () => {} }) {
  let richnessWord = 'balanced';

  /**
   * Draw the dials the current scene declares.
   *
   * A scene owns its own controls, so this reads them rather than knowing any
   * scene by name: adding a visualisation with three sliders needs no change
   * here at all. Label left, value right, track underneath -- the reading order
   * is what it is called, what it is set to, and only then how to change it.
   */
  function drawParams() {
    const host = $('#scene-params');
    host.textContent = '';
    const dials = canvas.paramsOf();
    $('#params-label').hidden = dials.length === 0;
    if (!dials.length) return;

    for (const d of dials) {
      const wrap = document.createElement('label');
      wrap.className = 'dial';
      const head = document.createElement('span');
      head.className = 'dial-head';
      const name = document.createElement('span');
      name.textContent = d.label;
      const val = document.createElement('span');
      const show = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(v) : v.toFixed(d.step < 0.01 ? 4 : 2));
      val.textContent = d.value === 0 && d.default === 0 ? 'auto' : show(d.value);
      head.append(name, val);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(d.min);
      slider.max = String(d.max);
      slider.step = String(d.step);
      slider.value = String(d.value === 0 && d.default === 0 ? d.min : d.value);
      slider.dataset.param = d.name;

      // A dial that rebuilds the scene waits for the drag to finish: rebuilding
      // on every pixel would wipe the picture continuously while somebody is
      // still deciding where to put it.
      const commit = (v) => {
        canvas.setParam(d.name, v);
        store.set(`p:${canvas.sceneName}:${d.name}`, String(v));
        repaintScenePreviews();
        onLookChange();
      };
      slider.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        val.textContent = show(v);
        if (!d.rebuild) commit(v);
      });
      slider.addEventListener('change', (e) => { if (d.rebuild) commit(Number(e.target.value)); });

      wrap.append(head, slider);
      host.append(wrap);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'reset';
    reset.textContent = 'Back to defaults';
    reset.addEventListener('click', () => {
      for (const d of canvas.paramsOf()) store.set(`p:${canvas.sceneName}:${d.name}`, '');
      canvas.resetParams();
      drawParams();
      repaintScenePreviews();
      onLookChange();
    });
    host.append(reset);
  }

  /** Dial positions survive a reload, per scene. */
  function restoreParams(sceneName) {
    for (const d of canvas.paramsOf(sceneName)) {
      const held = store.get(`p:${sceneName}:${d.name}`);
      if (held) canvas.setParam(d.name, Number(held), sceneName);
    }
  }

  // --- scenes -------------------------------------------------------------
  // Scenes are whole ways of drawing the same events. Shapes only apply to the
  // ones that draw a mark per event, so the shape picker follows the choice.
  function selectScene(name, persist = true) {
    if (!SCENES[name]) return;
    canvas.setScene(name);
    $('#scene-note').textContent = SCENES[name].note;
    scenePicker.mark(name);
    const usesShapes = name === 'bloom';
    $('#shapes').style.opacity = usesShapes ? '1' : '.4';
    $('#shapes').style.pointerEvents = usesShapes ? '' : 'none';
    $('#shapes-label').textContent = usesShapes ? 'Shapes' : 'Shapes — used by Bloom only';
    if (persist) store.set('scene', name);
    restoreParams(name);
    drawParams();
    onLookChange();
  }

  // Each card carries a still drawn by the scene itself, against synthetic
  // events. A stored image would go stale the moment a palette changed; this
  // cannot disagree with what you are about to launch.
  function paintScenePreview(cv, name) {
    const { ctx, w, h } = fitCanvas(cv, { height: 84 });
    previewScene(ctx, name, {
      w,
      h,
      palette: PALETTES[canvas.paletteName].colors,
      shape: canvas.shape,
      richness: canvas.richness,
      depth: canvas.depth,
      params: Object.fromEntries(canvas.paramsOf(name).map((p) => [p.name, p.value])),
    });
  }

  const scenePicker = createPicker($('#scenes'), Object.entries(SCENES), {
    key: 'scene',
    className: 'card',
    title: (def) => def.note,
    render: (btn, def) => {
      btn.append(
        document.createElement('canvas'),
        caption(def.label, def.positional === false ? 'Composed view' : 'One mark per event')
      );
    },
    onPick: (name) => selectScene(name),
  });
  const repaintScenePreviews = () => scenePicker.repaint(paintScenePreview);
  const repaintPendingPreviews = () => {
    scenePicker.repaintPending(paintScenePreview);
    shapePicker.repaintPending(paintSwatch);
  };

  // --- palettes -----------------------------------------------------------

  function selectPalette(name, persist = true) {
    canvas.setPalette(name);
    canvas.canvas.style.background = PALETTES[name].colors.background;
    $('#palette-note').textContent = PALETTES[name].note;
    palettePicker.mark(name);
    if (persist) store.set('palette', name);
    // The swatches and the stills are drawn in the palette's own colours, so
    // they follow the choice rather than lying about it.
    repaintShapeSwatches();
    repaintScenePreviews();
    paintKitArts();
    onLookChange();
  }


  // --- leaving it to change on its own -------------------------------------
  //
  // Forty palettes is thirty-nine nobody sees, and forty visualisations is
  // thirty-nine nobody sees, because choosing one is a decision and watching is
  // not. Left to itself the piece walks through them, slowly enough that the
  // change is something you notice having happened rather than something you
  // watch happen.
  //
  // Both rotations are the same mechanism with a different verb for arriving,
  // so it is written once. What differs is only that: a palette is walked to,
  // because colours interpolate, and a visualisation is dipped to, because a
  // Hilbert curve and a wave field have nothing in common to blend.
  const ROTATE_STEPS = [
    [0, 'never'],
    [45000, 'every 45 seconds'],
    [120000, 'every two minutes'],
    [300000, 'every five minutes'],
    [900000, 'every quarter of an hour'],
    [3600000, 'every hour'],
    [10800000, 'every three hours'],
  ];

  /**
   * Wire one "change it on its own" control.
   *
   * @param {object} o
   * @param {string}   o.id       the slider's element id; -val and -note follow it
   * @param {Function} o.names    everything it may choose between
   * @param {Function} o.current  what is showing now, so a step is always a change
   * @param {Function} o.go       start the change to a name
   * @param {string[]} o.notes    one line per step, saying what the interval is for
   * @param {string}   o.key      where the choice is remembered
   */
  function makeRotation({ id, names, current, go, notes, key }) {
    let timer = 0;
    let order = null;
    let at = 0;
    let word = 'never';

    // Shuffled once per session rather than taken in declaration order: down
    // either list the neighbours are related -- the ten papers sit together,
    // the geometric scenes sit together -- and a walk through those in order
    // reads as a fault rather than as a change. That shuffle is the whole of
    // the random mode; the slider only says how often it steps.
    const shuffle = () => {
      const list = names();
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };

    function step() {
      if (!order || !order.length) order = shuffle();
      // Start from where the chooser actually is, so the first step is a
      // change rather than a jump back to the top of the list.
      let next = order[at % order.length];
      if (next === current()) {
        at++;
        next = order[at % order.length];
      }
      at++;
      go(next);
    }

    function select(index, persist = true) {
      const i = Math.max(0, Math.min(ROTATE_STEPS.length - 1, Math.round(index)));
      const [ms, said] = ROTATE_STEPS[i];
      word = said;
      $(`#${id}-val`).textContent = said;
      $(`#${id}-note`).textContent = notes[i];
      $(`#${id}`).value = String(i);
      clearInterval(timer);
      timer = 0;
      if (ms > 0) timer = setInterval(step, ms);
      if (persist) store.set(key, String(i));
      updateSummaries();
    }

    $(`#${id}`).addEventListener('input', (e) => select(Number(e.target.value)));
    return { select, step, get word() { return word; } };
  }

  const PALETTE_ROTATE_NOTES = [
    'The palette stays as chosen.',
    'Quick enough to see the range in a few minutes. Good for showing somebody what is here.',
    'A change while you are looking at something else, which is the point of it.',
    'About the length of a piece of music.',
    'For a screen somebody is working next to.',
    'For a screen in a room, over a day.',
    'An exhibition that opens in the morning and closes at night.',
  ];

  const SCENE_ROTATE_NOTES = [
    'The visualisation stays as chosen.',
    'Quick enough to see most of the forty in half an hour.',
    'Long enough to watch one develop before it goes.',
    'About the length of a piece of music, which is roughly how long anybody stands in front of a screen.',
    'For a room people walk through rather than sit in.',
    'For a screen in a room, over a day.',
    'An exhibition that opens in the morning and closes at night.',
  ];

  const paletteRotation = makeRotation({
    id: 'rotate',
    key: 'rotate',
    notes: PALETTE_ROTATE_NOTES,
    names: () => Object.keys(PALETTES),
    current: () => canvas.paletteName,
    go: (next) => {
      // Walked, not switched: see CanvasSink.fadePalette.
      canvas.fadePalette(next, 4000);
      // The rest of the panel follows once the walk has arrived, because
      // repainting forty scene cards five times a second is not a thing to do
      // for a colour change nobody is looking at.
      setTimeout(() => selectPalette(next, true), 4200);
    },
  });

  const sceneRotation = makeRotation({
    id: 'scene-rotate',
    key: 'scene-rotate',
    notes: SCENE_ROTATE_NOTES,
    names: () => Object.keys(SCENES),
    current: () => canvas.sceneName,
    go: (next) => {
      // Dipped, not cut: see CanvasSink.fadeScene.
      canvas.fadeScene(next, 2600);
      // The panel follows at the bottom of the dip, where the swap happens.
      setTimeout(() => selectScene(next, true), 1400);
    },
  });

  const selectRotate = paletteRotation.select;
  const stepPalette = paletteRotation.step;

  const palettePicker = createPicker($('#palettes'), Object.entries(PALETTES), {
    key: 'palette',
    className: 'sw',
    title: (def) => def.note,
    render: (btn, def, name) => {
      const { background, dots } = swatchOf(name);
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = background;
      for (const colour of dots) {
        const dot = document.createElement('i');
        dot.style.background = colour;
        chip.append(dot);
      }
      const label = document.createElement('small');
      label.textContent = def.label;
      btn.append(chip, label);
    },
    onPick: (name) => selectPalette(name),
    gridClassName: 'swatches',
  });

  // Forty swatches in one grid is forty swatches. Two groupings, because there
  // are two questions anybody actually asks of a palette: how light is it, and
  // what colour is it. The first is measured from the ground and the second is
  // written down; see palettes.js for why one is derived and the other is not.
  const GROUPINGS = {
    ground: [groundBandOf, GROUND_BANDS],
    family: [familyOf, PALETTE_FAMILIES],
    none: [null, []],
  };

  function selectGrouping(mode, persist = true) {
    const [by, order] = GROUPINGS[mode] || GROUPINGS.ground;
    palettePicker.group(by, order);
    palettePicker.mark(canvas.paletteName);
    $('#palette-group').value = mode;
    if (persist) store.set('palette-group', mode);
  }

  $('#palette-group').addEventListener('change', (e) => selectGrouping(e.target.value));
  selectGrouping(store.get('palette-group') || 'ground', false);

  // --- shapes -------------------------------------------------------------
  // Swatches are drawn with the same drawShape() the canvas uses, so a preview
  // can never drift from the result.
  function selectShape(name, persist = true) {
    canvas.setShape(name);
    $('#shape-note').textContent = SHAPE_LABELS[name].note;
    shapePicker.mark(name);
    if (persist) store.set('shape', name);
  }

  function paintSwatch(cv, name) {
    const { ctx, w, h } = fitCanvas(cv, { height: 42, fallbackWidth: 76 });
    const colors = PALETTES[canvas.paletteName].colors;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colors.anon;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    drawShape(ctx, name, w / 2, h / 2, 13, -0.25, 0.4);
    ctx.fill(name === 'ring' ? 'evenodd' : 'nonzero');
  }

  const shapePicker = createPicker(
    $('#shapes'),
    SHAPE_CHOICES.map((name) => [name, SHAPE_LABELS[name]]),
    {
      key: 'shape',
      className: 'sw',
      title: (def) => def.note,
      render: (btn, def) => {
        const label = document.createElement('small');
        label.textContent = def.label;
        btn.append(document.createElement('canvas'), label);
      },
      onPick: (name) => selectShape(name),
    }
  );
  const repaintShapeSwatches = () => shapePicker.repaint(paintSwatch);

  // --- colour variety and the ceiling ------------------------------------
  function selectRichness(value, persist = true) {
    const v = Math.max(0, Math.min(1, value));
    canvas.setRichness(v);
    const [, word, note] = RICHNESS_STEPS.find(([edge]) => v < edge) || RICHNESS_STEPS[3];
    richnessWord = word;
    $('#richness-val').textContent = word;
    $('#richness-note').textContent = note;
    $('#richness').value = String(Math.round(v * 100));
    if (persist) store.set('richness', String(Math.round(v * 100)));
    updateSummaries();
    // The palette swatches and stills are drawn through the same renderer, so
    // they have to be redrawn or they would advertise the wrong setting.
    repaintShapeSwatches();
    repaintScenePreviews();
  }

  function selectBudget(n, persist = true) {
    canvas.setMaxParticles(n);
    $('#budget').value = String(canvas.maxParticles);
    $('#budget-val').textContent = String(canvas.maxParticles);
    if (persist) store.set('budget', String(canvas.maxParticles));
  }

  $('#richness').addEventListener('input', (e) => selectRichness(Number(e.target.value) / 100));
  $('#depth').addEventListener('change', (e) => {
    canvas.setDepth(e.target.checked);
    store.setFlag('depth', e.target.checked);
  });
  // On `change`, not `input`: applying it restarts the active scene's own
  // state, and doing that on every pixel of a drag would wipe the picture
  // continuously while you were still deciding where to put the slider.
  $('#budget').addEventListener('input', (e) => ($('#budget-val').textContent = e.target.value));
  $('#budget').addEventListener('change', (e) => selectBudget(Number(e.target.value)));
  $('#starfield').addEventListener('change', (e) => {
    canvas.setStarfield(e.target.checked);
    store.setFlag('starfield', e.target.checked);
  });
  $('#labels').addEventListener('change', (e) => (canvas.showLabels = e.target.checked));
  $('#hud').addEventListener('change', (e) => (canvas.showHud = e.target.checked));

  // Restored from demo.js, after `look` exists. Anything in here that reaches
  // updateSummaries cannot run during setup: the summary reads `look`, and
  // `look` is the const this call is still returning into.

  requestAnimationFrame(repaintScenePreviews);
  requestAnimationFrame(repaintShapeSwatches);
  restoreParams(canvas.sceneName);
  drawParams();

  return {
    selectScene, selectPalette, selectShape, selectRichness, selectBudget,
    selectRotate,
    selectSceneRotate: sceneRotation.select,
    // Exposed so a step can be checked without waiting out the shortest
    // interval, which is three quarters of a minute.
    stepPalette,
    stepScene: sceneRotation.step,
    repaintScenePreviews, repaintShapeSwatches, repaintPendingPreviews, drawParams,
    SHAPE_LABELS,
    get richnessWord() {
      return richnessWord;
    },
    get rotateWord() {
      return paletteRotation.word;
    },
    get sceneRotateWord() {
      return sceneRotation.word;
    },
    /** True while the cards are still catching up with a palette change. */
    get previewsBusy() {
      return scenePicker.busy || shapePicker.busy;
    },
  };
}
