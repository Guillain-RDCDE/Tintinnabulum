// One flat colour per card, taken from the palette.
//
// The card grids have now been pictograms, engraved vignettes, plates from an
// image model, gradients, and mosaics of eighteen blocks. The first three lost
// the same argument -- at a hundred and fifty pixels wide a picture of a
// marimba is a smudge. The gradient lost a different one: tasteful and dull.
// The mosaic lost a third: twenty-two charts side by side are a quilt, busy
// enough that no single card stands out, which is the opposite of what a
// picker is for.
//
// So: one colour. The pool is the palette's own four category colours at six
// values each, and the grid walks it in order, which is what makes the picker
// read as a colour chart rather than as twenty-two unrelated squares.
//
// Nothing here names a colour. The pool is derived from the palette, so both
// grids follow a palette change exactly as the canvas does.

import { lighten, lightnessOf, mixColors } from './color.js';

/**
 * A small stable hash of a name.
 *
 * FNV-1a. Kept for anything that needs a per-name number; the colour itself is
 * chosen by position rather than by hash, because a hash into a pool of
 * twenty-four collides long before twenty-two cards are placed and two kits
 * sharing a colour is the one thing this grid must not do.
 */
export function hashOf(name) {
  let h = 0x811c9dc5;
  const s = String(name);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Six values per hue. Fewer and twenty-two cards run out of colours; more and
// neighbouring steps stop being tellable apart at this size.
const STEPS = [0.2, 0.12, 0.04, -0.04, -0.13, -0.22];
const ROLES = ['user', 'anon', 'bot', 'alert'];

/**
 * The colours a card may take, drawn from a palette.
 *
 * `default` is left out on purpose: on every light palette it is the ink, a
 * near-black, and a chart with a black square in it stops looking like a
 * chart.
 *
 * Each is pushed clear of the ground, because a card at the ground's own
 * lightness is not a card, it is a hole.
 *
 * Interleaved by value rather than grouped by hue, so a grid walking the pool
 * in order alternates colours instead of running four blues and then four
 * greens.
 */
export function mosaicPool(palette) {
  const ground = palette.background;
  const groundL = lightnessOf(ground);
  const clear = (colour) => {
    const L = lightnessOf(colour);
    const dir = L >= groundL ? 1 : -1;
    const short = 0.16 - Math.abs(L - groundL);
    return short > 0 ? lighten(colour, dir * short) : colour;
  };
  const out = [];
  for (const step of STEPS) {
    for (const role of ROLES) {
      const base = palette[role] || palette.default;
      out.push(clear(lighten(mixColors(base, ground, 0.06), step)));
    }
  }
  return out;
}

/** How many colours a palette offers the cards. */
export function poolSize(palette) {
  return mosaicPool(palette).length;
}

/** Which colour a position lands on, without drawing anything. */
export function swatchColour(palette, index) {
  const pool = mosaicPool(palette);
  return pool[((index % pool.length) + pool.length) % pool.length];
}

/**
 * Fill a card with one colour.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette  a palette's `colors`
 * @param {number} o.index    position in the grid; decides which colour
 * @returns {string} the colour used
 */
export function drawSwatch(ctx, { w, h, palette, index = 0 }) {
  const colour = swatchColour(palette, index);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  return colour;
}
