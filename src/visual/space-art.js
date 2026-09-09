// The colour on each room card.
//
// One flat colour, from the same pool as the kit cards. See mosaic.js.
//
// This was a reflectogram once -- the room's own impulse response, plotted,
// with the early reflections at the same golden-ratio spacing the audio uses.
// Honest, correct, and it read as a graph nobody asked for. The caption
// already says how long each room rings, in seconds, which is the fact the
// chart was there to give and says it better.

import { drawSwatch, swatchColour } from './mosaic.js';

// The rooms start further along the pool than the kits do, so the two panels
// are not the same seven colours in the same order one above the other.
const OFFSET = 7;

/**
 * Draw one room's card.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec  a SPACES entry
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette  a palette's `colors`
 * @param {number} [o.index]  position in the grid; decides which colour
 * @returns {boolean} false if it could not be drawn at all
 */
export function drawSpaceArt(ctx, spec, { w, h, palette, index = 0 } = {}) {
  if (!ctx || !palette || !spec || !(w > 0) || !(h > 0)) return false;
  ctx.save();
  try {
    // Strided, so seven rooms taken from a pool of twenty-four are spread
    // across it rather than being seven neighbours.
    drawSwatch(ctx, { w, h, palette, index: OFFSET + index * 3 });
  } catch (e) {
    ctx.restore();
    ctx.globalAlpha = 1;
    return false;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

/** The colour a room card takes at a given position, for checking. */
export function spaceArtOf(palette, index) {
  return swatchColour(palette, OFFSET + index * 3);
}
