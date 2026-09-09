// The colour on each kit card.
//
// One flat colour, taken from the palette. See mosaic.js for the pool and for
// the four things this replaced.

import { drawSwatch, swatchColour } from './mosaic.js';

/**
 * Draw one kit's card.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kitName
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette  a palette's `colors`
 * @param {number} [o.index]  position in the grid; decides which colour
 * @returns {boolean} false if it could not be drawn at all
 */
export function drawKitArt(ctx, kitName, { w, h, palette, index = 0 } = {}) {
  if (!ctx || !palette || !(w > 0) || !(h > 0)) return false;
  ctx.save();
  try {
    // By position, not by a hash of the name. A hash into a pool of
    // twenty-four collides long before twenty-two cards are placed, and two
    // kits sharing a colour is the one thing this grid must not do. Position
    // also means the picker walks the pool in order, which is what makes it
    // read as a colour chart.
    drawSwatch(ctx, { w, h, palette, index });
  } catch (e) {
    ctx.restore();
    ctx.globalAlpha = 1;
    return false;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/** The colour a kit card takes at a given position, for checking. */
export function kitArtOf(palette, index) {
  return swatchColour(palette, index);
}
