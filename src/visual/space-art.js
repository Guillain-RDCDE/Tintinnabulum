// The picture on each room card: flat colour, in blocks, and how many blocks
// are coloured is how long the room rings.
//
// This was a reflectogram first -- the room's own impulse response, plotted,
// with the early reflections at the same golden-ratio spacing the audio uses
// and the tail on a 60 dB scale. Honest, correct, and it read as a graph
// nobody asked for. Then a gradient, which was tasteful and dull.
//
// It is a colour chart now, like the kits, and it keeps the one fact the
// picker exists to give you: Dry colours a single block, Room a third of the
// row, Cathedral the lot. The seven can be ranked by eye without reading a
// word, which is what the graph was for and never achieved.

import { drawMosaic, hashOf } from './mosaic.js';

/** The longest room in the set. Everything is counted against this. */
const AXIS_SECONDS = 5.2;

const COLS = 6;
const ROWS = 2;

/**
 * How much of a room's card is coloured, 0 to 1.
 *
 * The square root, not the raw ratio: everything that separates one room from
 * another is in the first second, and on a linear five-second scale a room of
 * half a second gets a tenth of the card while four of the seven crowd the far
 * end. A floor of one block, because Dry is a choice rather than an absence.
 */
export function spaceReachOf(spec) {
  const seconds = (spec && spec.seconds) || 0;
  const reach = Math.sqrt(Math.min(1, Math.max(0, seconds) / AXIS_SECONDS));
  return Math.max(1 / (COLS * ROWS), reach);
}

/**
 * Draw one room's card.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec  a SPACES entry: label, seconds
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette  a palette's `colors`
 * @returns {boolean} false if it could not be drawn at all
 */
export function drawSpaceArt(ctx, spec, { w, h, palette } = {}) {
  if (!ctx || !palette || !spec || !(w > 0) || !(h > 0)) return false;
  ctx.save();
  try {
    drawMosaic(ctx, {
      w, h, palette,
      seed: hashOf(spec.label || String(spec.seconds)),
      cols: COLS,
      rows: ROWS,
      filled: spaceReachOf(spec),
    });
  } catch (e) {
    ctx.restore();
    ctx.globalAlpha = 1;
    return false;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}
