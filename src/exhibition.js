// An exhibition: the whole catalogue, in a drawn order, each work dressed anew.
//
// A programme (show.js) is a list somebody wrote: these pieces, in this order.
// An exhibition is what a room does when nobody writes the list. Every work in
// the catalogue hangs in turn, a few minutes each, in an order drawn from a
// number; each time a work comes round it wears a palette drawn from the ones
// that suit it and a variation drawn fresh, so the same picture is never seen
// twice the same way. The sound changes more slowly than the picture: one
// instrument is held across several works, then another, because a room where
// the sound changed with every image would be a zapping and not a show.
//
// The position is read from the clock, as a programme's is: minutes since a
// fixed epoch, folded into the length of a round. Two screens in a room agree
// without a channel between them, and a machine rebooted overnight comes back
// where the exhibition is. Nothing here touches a browser; see
// test/exhibition.test.mjs.

import { WORKS } from './works.js';
import { PALETTES, groundBandOf } from './visual/palettes.js';
import { KITS } from './audio/kits.js';

/** A small seeded generator: the same number always gives the same draw. */
export function rng(seed) {
  let s = (Math.floor(seed) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** A number from a short word, so an address can carry a seed by name. */
export function seedOf(text) {
  const t = String(text ?? '');
  if (/^\d+$/.test(t)) return Number(t) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

/** Fisher-Yates, seeded. */
export function shuffled(list, seed) {
  const out = list.slice();
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The palettes a work may wear: those on the same ground as its own, so a
 * night work stays a night work and a paper one stays on paper. The work's
 * own palette is in the set, so one round in a few it comes as it was hung.
 */
export function wardrobeOf(workKey, palettes = PALETTES) {
  const w = WORKS[workKey];
  if (!w) return [];
  const band = groundBandOf(w.palette);
  return Object.keys(palettes).filter((p) => groundBandOf(p) === band);
}

/**
 * The exhibition, drawn once from its seed.
 *
 * @param {object} o
 * @param {string[]} [o.works]     keys to hang; the whole catalogue by default
 * @param {number} [o.seed]
 * @param {number} [o.minutes]     per work; 4 by default, 2 to 10 allowed
 * @param {number} [o.hold]        works per instrument; 3 by default
 * @param {string[]} [o.kits]      instruments to rotate through; every kit by default
 * @param {string[]} [o.palettes]  palettes to draw from; every palette by default
 */
export function exhibition({
  works = Object.keys(WORKS),
  seed = 1,
  minutes = 4,
  hold = 3,
  kits = Object.keys(KITS),
  palettes = Object.keys(PALETTES),
} = {}) {
  const hung = works.filter((k) => WORKS[k]);
  const per = Math.max(2, Math.min(10, Number(minutes) || 4));
  const span = Math.max(1, Math.min(12, Math.round(Number(hold) || 3)));
  const paletteSet = {};
  for (const p of palettes) if (PALETTES[p]) paletteSet[p] = PALETTES[p];
  const kitList = kits.filter((k) => KITS[k]);
  return { works: hung, seed: seedOf(seed), minutes: per, hold: span, kits: kitList, palettes: paletteSet };
}

/** The length of one round, in minutes. */
export const roundLength = (ex) => ex.works.length * ex.minutes;

// Minutes are counted from here rather than from midnight, so a round longer
// than a day does not restart at the stroke of twelve.
const EPOCH = Date.UTC(2026, 0, 1);

/**
 * What hangs at that moment.
 *
 * Each round draws its own order from the seed and the round number, so the
 * catalogue is not walked the same way twice running; within a round every
 * work hangs once. The palette and the variation are drawn from the seed,
 * the round and the slot together, so a work seen at four o'clock and again
 * six hours later wears a different dress each time -- and so two screens
 * draw the same dress at the same moment.
 *
 * @returns {?{work, palette, variation, kit, index, round, minutes, remaining, slot}}
 */
export function exhibitionAt(ex, date = new Date()) {
  const n = ex.works.length;
  if (!n) return null;
  const elapsed = (date.getTime() - EPOCH) / 60000;
  const total = roundLength(ex);
  const round = Math.floor(elapsed / total);
  const into = ((elapsed % total) + total) % total;
  const index = Math.min(n - 1, Math.floor(into / ex.minutes));
  const order = shuffled(ex.works, ex.seed * 7919 + round * 104729);
  const work = order[index];
  // The slot number runs across rounds, so the instrument is held across the
  // seam of a round as it is within one.
  const slot = round * n + index;
  const draw = rng(ex.seed * 31 + slot * 2654435761);
  const wardrobe = wardrobeOf(work, ex.palettes);
  const palette = wardrobe.length ? wardrobe[Math.floor(draw() * wardrobe.length)] : WORKS[work].palette;
  const variation = Math.floor(draw() * 9000) + 1;
  // One instrument for `hold` works running, then the next, in an order drawn
  // per run of holds so the sequence of instruments is not the catalogue's.
  const kitRun = Math.floor(slot / ex.hold);
  const kitOrder = shuffled(ex.kits, ex.seed * 17 + Math.floor(kitRun / Math.max(1, ex.kits.length)) * 7);
  const kit = ex.kits.length ? kitOrder[kitRun % ex.kits.length] : WORKS[work].kit;
  return {
    work, palette, variation, kit, index, round, slot,
    minutes: ex.minutes,
    remaining: ex.minutes - (into - index * ex.minutes),
  };
}

/** The exhibition in words, for a panel or a label. */
export function describeExhibition(ex) {
  const n = ex.works.length;
  const round = roundLength(ex);
  const hours = round >= 60 ? `${(round / 60).toFixed(round % 60 ? 1 : 0)} hours` : `${round} minutes`;
  return `${n} works, ${ex.minutes} minutes each, a new palette and variation every time; one round takes ${hours}. ` +
    `${ex.kits.length} instruments, each held for ${ex.hold} works.`;
}
