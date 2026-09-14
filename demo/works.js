// The Works panel: finished pieces, hung in rooms, each set with one click.
//
// A work sets the picture, the sound and the way they are shown all at once,
// through the same functions the individual controls use -- so everything it
// changes shows up in those controls, stays changeable, and survives a reload
// exactly as a hand-made choice would. The panel holds no state of its own:
// which work is "on" is read back from the page, so touching any single
// control afterwards turns the work's label off rather than leaving it lying.

import {
  WORKS,
  WORK_ROOMS,
  SCENES,
  PALETTES,
  KITS,
  SPACES,
  FINISHES,
  MATS,
  LIVING,
  previewScene,
} from '../src/index.js';
import { $, createPicker, fitCanvas, caption } from './dom.js';
import { store } from './store.js';

/** The Look panel's pace steps, as multipliers, by index. */
const PACE = [0.25, 0.5, 0.75, 1, 1.3, 1.7];
const PACE_WORDS = ['very slow', 'slow', 'unhurried', 'real time', 'lively', 'brisk'];

/**
 * @param {object} io
 * @param {object}   io.canvas       the CanvasSink
 * @param {object}   io.look         what setupLook returned
 * @param {Function} io.selectKit    (name, options) => Promise
 * @param {Function} io.selectSpace  (name) => void
 * @param {Function} io.ensureAudio  resolves once sound may play
 * @param {Function} io.getKit       the current kit's name
 * @param {Function} io.getSpace     the current room's name
 */
export function setupWorks({ canvas, look, selectKit, selectSpace, ensureAudio, getKit, getSpace }) {
  const pool = {};

  function paint(cv, name) {
    const w = WORKS[name];
    const { ctx, w: cw, h } = fitCanvas(cv, { height: 96 });
    const scene = SCENES[w.scene];
    previewScene(ctx, w.scene, {
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
    });
  }

  const picker = createPicker($('#works'), Object.entries(WORKS), {
    key: 'work',
    className: 'card',
    gridClassName: 'cards',
    title: (w) => w.cartel,
    render: (btn, w) => {
      btn.append(document.createElement('canvas'), caption(w.title, `${SCENES[w.scene].label} · ${KITS[w.kit].label}`));
    },
    onPick: (name) => apply(name),
  });
  picker.group((name) => WORKS[name].room, WORK_ROOMS);

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
    await ensureAudio();
    await selectKit(w.kit, { audition: false });
    refresh();
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
      p.textContent = 'Each work sets the picture, the sound and the way they are shown in one go. Anything it sets can still be changed afterwards.';
      box.append(p);
      return name;
    }
    const w = WORKS[name];
    const title = document.createElement('b');
    title.textContent = w.title;
    const line = document.createElement('span');
    line.className = 'medium';
    line.textContent = medium(w);
    const text = document.createElement('p');
    text.textContent = w.cartel;
    const label = document.createElement('div');
    label.className = 'cartel';
    label.append(title, line, text);
    box.append(label);
    return name;
  }

  return {
    apply,
    refresh,
    current,
    medium,
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
