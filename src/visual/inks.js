// Inks: a handful of colours, and how a picture is made from them.
//
// A palette here is nine named roles -- a ground, the colours of three kinds of
// event, an alert, text and two overlays -- because that is what the live canvas
// needs. Somebody making a picture thinks in fewer and plainer terms: a ground
// and two or three inks. These functions go between the two: they draw a set of
// inks from a number, turn it, and build the nine roles out of whatever set of
// inks somebody has chosen.
//
// Violet is out, by instruction, whatever the seed. Hues are drawn from the
// wheel with the violet band removed, and anything that still reads as violet
// once it is in gamut is turned away from it.

import { fromOklch, parseColor, lightnessOf } from './color.js';
import { PALETTES } from './palettes.js';

/** A small seeded generator: the same number always gives the same inks. */
export function rngOf(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Red and blue both well above green: what reads as violet. The same rule the interface uses. */
export function isViolet(c) {
  const { r, g, b } = parseColor(c);
  return b > g + 25 && r > g + 25;
}

const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const DEG = Math.PI / 180;

// The violet band of the OKLCH wheel, in degrees: blue-violet through magenta.
const BAND_FROM = 272;
const BAND_TO = 348;

/** A hue in degrees, moved out of the violet band towards whichever edge is nearer. */
function allowed(h) {
  const d = ((h % 360) + 360) % 360;
  if (d < BAND_FROM || d >= BAND_TO) return d;
  return d - BAND_FROM < BAND_TO - d ? BAND_FROM - 6 : BAND_TO + 6;
}

/** One ink from lightness, chroma and hue, turned away from violet if it lands there. */
function ink(L, C, h) {
  let hue = allowed(h);
  for (let i = 0; i < 6; i++) {
    const c = hex(fromOklch({ L, C, h: hue * DEG }));
    if (!isViolet(c)) return c;
    hue = allowed(hue + (hue > 300 ? 30 : -30));
  }
  return hex(fromOklch({ L, C: C * 0.3, h: 80 * DEG }));
}

// How the marks sit around the first hue: close, opposite, three ways, split.
const HARMONIES = [
  [0, 28, -28, 56, -56],
  [0, 180, 20, 200, -20],
  [0, 120, 240, 60, 180],
  [0, 150, 210, 30, 330],
];

/**
 * A set of inks drawn from a number: a ground first, then the marks.
 *
 * Three moods, because they are three different pictures: a pale paper, a dark
 * night, or a ground that is itself a strong colour. The marks are placed on
 * the wheel by a harmony and kept well clear of the ground in lightness, so
 * every ink can be seen on it.
 *
 * @param {number} seed
 * @param {number} [count]  2 to 6, ground included
 * @returns {string[]} hex colours, ground first
 */
export function inkSet(seed, count = 4) {
  const rnd = rngOf(seed);
  const n = Math.max(2, Math.min(6, Math.round(count)));
  const mood = rnd();
  const h0 = allowed(rnd() * 360);
  const harmony = HARMONIES[Math.floor(rnd() * HARMONIES.length)];
  const out = [];
  let marks;
  if (mood < 0.42) {
    out.push(ink(0.95 + rnd() * 0.03, 0.01 + rnd() * 0.025, h0 + 40));
    marks = () => ({ L: 0.42 + rnd() * 0.3, C: 0.1 + rnd() * 0.09 });
  } else if (mood < 0.84) {
    // A night ground in the greens would be a dark green, so it is kept near neutral.
    const hg = allowed(h0 + 180);
    const chroma = hg > 100 && hg < 185 ? 0.012 : 0.02 + rnd() * 0.04;
    out.push(ink(0.14 + rnd() * 0.08, chroma, hg));
    marks = () => ({ L: 0.66 + rnd() * 0.24, C: 0.09 + rnd() * 0.09 });
  } else {
    out.push(ink(0.5 + rnd() * 0.12, 0.12 + rnd() * 0.06, h0));
    let flip = rnd() < 0.5;
    marks = () => {
      flip = !flip;
      // The dark ink on a strong ground is a near black: a dark version of the
      // ground's own colour reads as mud, and in the greens as a dark green.
      return flip ? { L: 0.93 + rnd() * 0.05, C: 0.03 + rnd() * 0.05 } : { L: 0.15 + rnd() * 0.06, C: 0.012 + rnd() * 0.015 };
    };
  }
  const Lg = lightnessOf(out[0]);
  for (let i = 1; i < n; i++) {
    const { L, C } = marks();
    const h = h0 + harmony[(i - 1) % harmony.length] + (rnd() - 0.5) * 16;
    // A dark green is not a colour this project shows either: greens are lifted.
    const d = ((allowed(h) % 360) + 360) % 360;
    let want = L + (d > 120 && d < 175 && L < 0.55 ? 0.18 : 0);
    // Every ink must read on the ground. Fitting a colour into gamut can move
    // its lightness, so the ink is measured once made and pushed away from
    // the ground until it clears it.
    let c = ink(want, C, h);
    for (let k = 0; k < 4 && Math.abs(lightnessOf(c) - Lg) < 0.3; k++) {
      want = Lg < 0.5 ? Math.min(0.97, Math.max(want, Lg) + 0.12) : Math.max(0.1, Math.min(want, Lg) - 0.12);
      c = ink(want, C, h);
    }
    out.push(c);
  }
  return out;
}

/** The same inks with the ground moved to the end: the next colour becomes the ground. */
export function rotateInks(inks) {
  if (!Array.isArray(inks) || inks.length < 2) return inks ? [...inks] : [];
  return [...inks.slice(1), inks[0]];
}

/** The inks of a named palette, ground first, without repeats. */
export function inksOfPalette(name) {
  const c = (PALETTES[name] || PALETTES.marine).colors;
  const seen = new Set();
  const out = [];
  for (const k of ['background', 'user', 'anon', 'bot', 'alert', 'default']) {
    const v = String(c[k]).toLowerCase();
    if (!seen.has(v)) {
      seen.add(v);
      out.push(c[k]);
    }
  }
  return out;
}

/** Whether a named palette has any ink that reads as violet. */
export function paletteIsViolet(name) {
  const entry = PALETTES[name];
  if (!entry) return false;
  const c = entry.colors;
  return ['background', 'user', 'anon', 'bot', 'alert', 'default'].some((k) => isViolet(c[k]));
}

/** An rgba() form of a colour. */
function withAlpha(c, a) {
  const { r, g, b } = parseColor(c);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * The nine roles a scene reads, built from a ground and some inks.
 *
 * The marks take the inks in order and wrap round when there are fewer inks
 * than roles. The default ink -- the one most scenes draw their lines in -- is
 * the one that stands furthest from the ground, unless a fifth mark was given
 * for it, which is how a named palette comes back out unchanged.
 *
 * @param {string[]} inks  ground first
 */
export function paletteFromInks(inks) {
  const list = (Array.isArray(inks) ? inks : []).filter((c) => typeof c === 'string' && c.trim());
  const ground = list[0] || '#101418';
  const Lg = lightnessOf(ground);
  const marks = list.slice(1);
  if (!marks.length) marks.push(Lg < 0.5 ? '#f2efe8' : '#1c1c1c');
  const at = (i) => marks[i % marks.length];
  const far = [...marks].sort((a, b) => Math.abs(lightnessOf(b) - Lg) - Math.abs(lightnessOf(a) - Lg))[0];
  return {
    background: ground,
    default: marks.length >= 5 ? marks[4] : far,
    user: at(0),
    anon: at(1),
    bot: at(2),
    alert: at(3),
    text: Lg < 0.5 ? '#f4f3ef' : '#1b1b1b',
    banner: withAlpha(at(1), 0.75),
    hud: withAlpha(at(1), 0.45),
  };
}

// --- a variation of a scene's dials ------------------------------------------------

/**
 * A scene's dials, varied from a number.
 *
 * Each dial moves from where the scene ships towards one end or the other, by
 * a draw that peaks at no movement, and never more than three quarters of the
 * way. The first version spread the draw over the whole range and clamped:
 * a dial shipped near its minimum landed on the minimum a third of the time,
 * which is a whorl with no twist and a ring with no rays -- the dial switched
 * off rather than varied. Values are snapped to the dial's own step, so what
 * is shown is exactly what is drawn.
 *
 * @param {object} scene   a scene, with optional `params`
 * @param {number} seed
 * @param {number} [spread] 0 keeps the defaults, 1 is the usual reach
 */
export function variedParams(scene, seed, spread = 1) {
  const out = {};
  const specs = (scene && scene.params) || {};
  const rnd = rngOf((Number(seed) ^ 0x5bd1e995) >>> 0);
  for (const [name, spec] of Object.entries(specs)) {
    const range = spec.max - spec.min;
    const d = Math.max(spec.min, Math.min(spec.max, spec.default));
    const t = rnd() + rnd() - 1;
    const reach = 0.75 * spread;
    let v = t < 0 ? d + (d - spec.min) * t * reach : d + (spec.max - d) * t * reach;
    v = Math.max(spec.min, Math.min(spec.max, v));
    const step = spec.step || range / 100;
    v = spec.min + Math.round((v - spec.min) / step) * step;
    out[name] = Math.max(spec.min, Math.min(spec.max, Number(v.toFixed(6))));
  }
  return out;
}
