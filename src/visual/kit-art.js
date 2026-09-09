// The picture on each kit card: flat colour, in blocks.
//
// This has been four things. Pictograms first -- an arc for a bell, a sine for
// a synth -- which were accurate and flat, and eighteen of them side by side
// looked like a stationery catalogue. Then engraved vignettes cut by a burin
// engine. Then plates from an image model, stored as alpha masks. All three
// lost the same argument: at a hundred and fifty pixels wide a picture of a
// marimba is a smudge, and twenty-two smudges is what the grid became.
//
// Then gradients, which lost a different one. They were tasteful and they were
// dull, and a picker nobody wants to touch has failed at the only job a picker
// has.
//
// So: a colour chart, six blocks by three. Nothing shaded, nothing lit,
// nothing standing for an instrument. See mosaic.js for the drawing, and for
// why flat squares are the right answer at this size.

import { drawMosaic, hashOf } from './mosaic.js';

const COLS = 6;
const ROWS = 3;

/**
 * Draw one kit's card.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kitName
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette  a palette's `colors`
 * @returns {boolean} false if it could not be drawn at all
 */
export function drawKitArt(ctx, kitName, { w, h, palette } = {}) {
  if (!ctx || !palette || !(w > 0) || !(h > 0)) return false;
  ctx.save();
  try {
    // The arrangement is the kit's own and never moves: it comes from a hash
    // of the name, so Gongs is the same chart on every visit and on every
    // machine, and a kit added tomorrow gets its own without anybody choosing.
    drawMosaic(ctx, { w, h, palette, seed: hashOf(kitName), cols: COLS, rows: ROWS });
  } catch (e) {
    ctx.restore();
    ctx.globalAlpha = 1;
    return false;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/**
 * The seed a kit's card is drawn from.
 *
 * Exposed so "no two kits look the same" is something a test can measure
 * rather than something somebody has to squint at.
 */
export function kitArtOf(kitName) {
  return { seed: hashOf(kitName), cols: COLS, rows: ROWS };
}
