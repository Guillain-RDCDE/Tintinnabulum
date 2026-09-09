// A plate for each room.
//
// The rooms were the one picker on the page with nothing to look at: seven
// words in a row, and no way to tell a cistern from a canyon without reading
// two sentences about each. Every other grid here carries a picture, and the
// rule those pictures follow is that they are drawn from the real thing rather
// than decorated to suggest it.
//
// So this is a reflectogram: the room's own impulse response, plotted. Not an
// arch, not a cave, not a picture of a building. The early reflections use the
// same golden-ratio spacing as space.js puts in the audio, the tail uses the
// same decay exponent, and the thinning of the strokes is the same damping.
// A card cannot go stale against the sound, because it is the sound.
//
// What that buys, read left to right at a glance:
//
//   Dry        one stroke and silence after it
//   Room       a short dense wedge, over before the card is a fifth used
//   Hall       the same shape, four times as long
//   Cathedral  fills the plate, and pales early -- that is the stone
//   Cistern    early taps nearly as tall as the strike: hard walls, close
//   Plate      no taps at all, dense from the first instant. There are no walls
//   Canyon     taps far enough apart to count, which is the whole of it
//
// All seven are drawn on one time axis, so the card widths are comparable.
// Drawing each to its own length would have made a half-second room and a five
// second cathedral look alike, which is the one thing the picker exists to
// distinguish.

import { burin, plate, seeded } from './engrave.js';

/** The longest room in the set. Everything is drawn against this. */
const AXIS_SECONDS = 5.2;

// Two choices about the axes, and the first version got both wrong.
//
// TIME runs as a square root, not linearly. Everything that distinguishes one
// room from another happens in the first half second -- the early reflections
// are inside 0.08 s for a room and 0.55 s for a canyon -- and on a linear five
// second axis all of it is crushed into the leftmost tenth. Seven cards came
// out looking like the same card. The square root gives the early pattern a
// third of the width and still puts the cathedral's tail at the far edge.
const atX = (seconds) => Math.sqrt(Math.min(1, Math.max(0, seconds) / AXIS_SECONDS));

// HEIGHT runs in decibels over a 60 dB range, which is how a reverb is read:
// RT60 is the time to fall 60 dB, and on a linear amplitude axis a tail is
// invisible long before it is inaudible. Linearly, the cathedral appeared to
// stop at two fifths of its own length.
const DB_FLOOR = 60;
const atY = (amp) => Math.max(0, 1 + (20 * Math.log10(Math.max(1e-6, amp))) / DB_FLOOR);

/**
 * Draw one room's reflectogram.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec  a SPACES entry: seconds, curve, predelay, damp, taps, spread, early
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette  a palette's `colors`
 */
export function drawSpaceArt(ctx, spec, { w, h, palette }) {
  const ground = palette.background;
  const line = palette.default;
  plate(ctx, w, h, { ground, ink: line, rule: false });

  const padX = Math.max(4, w * 0.05);
  const base = h - Math.max(4, h * 0.16);
  const top = Math.max(3, h * 0.12);
  const span = w - padX * 2;
  const tall = base - top;
  const rnd = seeded(7);

  ctx.fillStyle = line;

  // The floor. A room is a length of time, and without an axis under it the
  // strokes are a shape rather than a measurement.
  burin(ctx, (t) => [padX + span * t, base], () => 0.34, { weight: 1.1, steps: 40 });

  // The strike itself, at t = 0. Every room has one and it is the same in all
  // of them: what differs is only what the room does afterwards.
  burin(ctx, (t) => [padX, base - tall * t], () => 0.95, { weight: 2.2, steps: 12 });

  if (!spec.seconds) {
    // Dry. The absence is the subject, so it is drawn as one: the strike, the
    // floor, and a deliberate emptiness where the others have their tail.
    return;
  }

  const at = (seconds) => padX + span * atX(seconds);
  const curve = spec.curve ?? 1.2;
  const pre = spec.predelay ?? 0.01;
  const secs = spec.seconds;

  // The tail. One stroke every couple of pixels, each as tall as the envelope
  // at that instant, and each thinning as the damping takes the top off it --
  // which is why the cathedral goes pale long before it goes short.
  const damp = spec.damp ?? 3000;
  const brightness = Math.min(1, damp / 7000);
  const step = 2;
  const x0 = at(pre);
  const x1 = at(secs);
  for (let x = x0; x <= x1 && x <= padX + span; x += step) {
    // Back out of the square-root axis to find the instant this column is,
    // so the envelope is sampled in time rather than in pixels.
    const frac = (x - padX) / span;
    const when = frac * frac * AXIS_SECONDS;
    const t = Math.min(1, Math.max(0, (when - pre) / Math.max(1e-4, secs - pre)));
    const env = Math.pow(1 - t, curve * 2.2);
    const height = atY(env);
    if (height <= 0.01) continue;
    // A reverb tail is noise, not a smooth wedge, so the strokes are ragged
    // within the envelope. Seeded, so a card never changes under the eye.
    const jag = 0.62 + rnd() * 0.38;
    const top2 = base - tall * height * jag;
    const tone = 0.26 + 0.5 * height * (0.45 + 0.55 * brightness);
    burin(ctx, (u) => [x, base - (base - top2) * u], () => tone, { weight: 1.05, steps: 6 });
  }

  // Early reflections. Same construction as the audio: fractional multiples of
  // the golden ratio, so no two land on a simple ratio of one another and the
  // pattern never reads as a comb.
  const taps = spec.taps ?? 10;
  const spread = spec.spread ?? 0.08;
  const early = spec.early ?? 0.55;
  for (let k = 0; k < taps; k++) {
    const u = (k + 1) / taps;
    const jitter = ((k * 1.618033988749895) % 1) * 0.55 + 0.45;
    const when = pre + spread * u * jitter;
    if (when > secs) continue;
    const x = at(when);
    if (x > padX + span) continue;
    const amp = early * Math.pow(1 - u, 1.4);
    const height = atY(amp);
    if (height <= 0.02) continue;
    burin(ctx, (t) => [x, base - tall * height * t], () => 0.92, { weight: 1.8, steps: 8 });
  }
}
