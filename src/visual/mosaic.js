// Flat colour, in blocks, with the ground showing between them.
//
// The card grids have now been pictograms, engraved vignettes, plates from an
// image model, and gradients. The first three lost the same argument -- at a
// hundred and fifty pixels wide a picture of a marimba is a smudge -- and the
// gradient lost a different one: it was tasteful and it was dull, and a picker
// nobody wants to touch has failed at the only job a picker has.
//
// So: a colour chart. Flat squares, thin gutters, nothing shaded, nothing lit.
// It is the oldest way of showing that a thing is one of a set and that the
// set is worth going through, and it is why paint charts are pleasant to look
// at and gradient ramps are not.
//
// Everything still comes out of the palette. The blocks are the palette's own
// four category colours at three values each, so a grid of them follows a
// palette change exactly as the canvas does, and no colour is ever named here.

import { lighten, lightnessOf, mixColors } from './color.js';

/**
 * A small stable hash of a name.
 *
 * FNV-1a. It has to give the same number in every browser and on every visit:
 * a card that changed between sessions would stop being recognisable, and
 * being recognisable is the whole job.
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

/** A tiny deterministic generator, so a card is drawn the same way every time. */
function rngFrom(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * The colours a mosaic may use, drawn from a palette.
 *
 * The four category colours, each at three values. `default` is left out on
 * purpose: on every light palette it is the ink, a near-black, and a chart
 * with a black square in it stops looking like a chart.
 *
 * Each is pushed clear of the ground, because a block at the ground's own
 * lightness is not a block, it is a hole.
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
  for (const role of ['user', 'anon', 'bot', 'alert']) {
    const base = palette[role] || palette.default;
    // Light, as it is, and deep. Three values of four hues is twelve, which is
    // enough that a card of eighteen blocks never looks like a repeat.
    for (const step of [0.13, 0, -0.15]) {
      out.push(clear(step ? lighten(mixColors(base, ground, 0.06), step) : base));
    }
  }
  return out;
}

/**
 * Draw a chart of flat colour blocks.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette   a palette's `colors`
 * @param {number} o.seed      decides which colour goes where
 * @param {number} [o.cols]
 * @param {number} [o.rows]
 * @param {number} [o.filled]  0..1, how many blocks get a colour at all
 * @returns {number} how many blocks were given a colour
 */
export function drawMosaic(ctx, { w, h, palette, seed, cols = 6, rows = 3, filled = 1 }) {
  const ground = palette.background;
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);

  const pool = mosaicPool(palette);
  const rnd = rngFrom(seed);
  // The gutter is the ground showing through, not a drawn line: one fill and
  // then the blocks inset into their cells. A stroked grid at this size turns
  // into a smear the moment the device ratio is not a whole number.
  const gap = Math.max(1.5, Math.min(w, h) * 0.035);
  const cw = (w - gap) / cols;
  const ch = (h - gap) / rows;

  // Which cells get a colour. Filled from the left, so a card that is only
  // part filled reads as a bar rather than as a scatter of holes.
  const total = cols * rows;
  const want = Math.max(1, Math.round(total * Math.min(1, Math.max(0, filled))));

  let painted = 0;
  let previous = -1;
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    // Column-major order for the fill, so "how far it reaches" means how far
    // across rather than how far down.
    const rank = col * rows + row;
    if (rank >= want) continue;
    // Never the same colour twice running: two identical neighbours read as
    // one wide block and the chart loses its count.
    let pick = (rnd() * pool.length) | 0;
    if (pick === previous) pick = (pick + 1 + ((rnd() * (pool.length - 1)) | 0)) % pool.length;
    previous = pick;
    ctx.fillStyle = pool[pick];
    ctx.fillRect(gap + col * cw, gap + row * ch, cw - gap, ch - gap);
    painted++;
  }
  return painted;
}
