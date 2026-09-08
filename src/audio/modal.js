// A struck body, as the sum of its modes.
//
// Hit a bell, a bar or a clay pot and it rings at a set of frequencies that
// belong to its shape, not to a fundamental. Each of them dies at its own
// rate, and the high ones die first -- which is why a struck object starts as
// a clang and settles onto a pitch. Write that down and you get
//
//     s(t) = SUM  a_i . exp(-t / tau_i) . sin(2 pi f_i t + phi_i)
//
// and that is the whole of modal synthesis. The ratios f_i / f_1 are the
// object; the tau_i are what it is made of.
//
// The obvious Web Audio implementation -- a burst of noise through a bank of
// high-Q bandpass filters -- was tried first and does not work. A biquad rings
// for about Q / (pi f) seconds, so a bell of three seconds at 300 Hz needs a Q
// near three thousand: past the API's limit of a thousand, and numerically
// unstable well before that. The first version measured a peak of 0.002 and
// a quarter-second ring where three and a half were asked for.
//
// Summing the sinusoids directly has none of those problems, is exact rather
// than an approximation of the exact thing, and can be cached.

import { BufferCache, pitchKey } from './buffer-cache.js';

// Bounded by memory, not by entry count, and keyed by pitch rather than by
// hertz. See buffer-cache.js for what the first version of this cost.
const cache = new BufferCache(12);

/**
 * Render one struck note.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} freq            hertz, the first mode
 * @param {object} o
 * @param {Array}  o.modes         [{ ratio, gain, decay }]
 * @param {number} [o.seconds]     how long to render
 * @param {number} [o.decay]       seconds for a mode of decay 1 to fall to silence
 * @param {number} [o.strike]      seconds of hammer noise at the very start
 * @param {number} [o.hardness]    0..1, how bright that hammer is
 * @returns {AudioBuffer}
 */
export function strike(ctx, freq, {
  modes = [{ ratio: 1, gain: 1, decay: 1 }],
  seconds = 3, decay = 2, strike: hit = 0.004, hardness = 0.5,
} = {}) {
  // Rendered at half the context's rate, which a BufferSource resamples on
  // playback. It halves what every cached note costs and takes nothing
  // audible: the highest partial here is a tubular bell's thirteenth, and
  // at any pitch this instrument plays that is far under 11 kHz.
  const rate = Math.max(11025, Math.round(ctx.sampleRate / 2));
  const key = [
    rate, pitchKey(freq), Math.round(seconds * 4), Math.round(decay * 20),
    Math.round(hit * 500), Math.round(hardness * 20),
    modes.map((m) => `${m.ratio}/${m.gain ?? 1}/${m.decay ?? 1}`).join(','),
  ].join(':');
  const found = cache.get(key);
  if (found) return found;

  const total = Math.max(64, Math.round(rate * seconds));
  const buf = ctx.createBuffer(1, total, rate);
  const out = buf.getChannelData(0);

  const nyquist = rate * 0.5;
  for (const m of modes) {
    const f = freq * m.ratio;
    // Above Nyquist a mode does not merely vanish, it folds back down as a
    // frequency that is not in the object at all.
    if (f >= nyquist * 0.98) continue;
    const tau = Math.max(0.004, decay * (m.decay ?? 1)) / 4.6;   // to about 1%
    const a = m.gain ?? 1;
    // A phase per mode. In phase they add to a click on the first sample;
    // scattered, the attack is a body being hit rather than a spike.
    const phase = Math.random() * Math.PI * 2;
    const w = (2 * Math.PI * f) / rate;
    const dampPerSample = Math.exp(-1 / (tau * rate));
    let env = a;
    for (let i = 0; i < total; i++) {
      if (env < 1e-5) break;
      out[i] += env * Math.sin(w * i + phase);
      env *= dampPerSample;
    }
  }

  // The hammer. Every real strike has a moment of broadband noise before the
  // modes take over, and without it the sound begins as a tone rather than as
  // a blow -- the single clearest difference between struck and synthesised.
  const hitN = Math.min(total, Math.round(rate * Math.max(0, hit)));
  if (hitN > 1) {
    let lp = 0;
    const smooth = 1 - Math.min(0.98, Math.max(0.02, hardness));
    for (let i = 0; i < hitN; i++) {
      lp += ((Math.random() * 2 - 1) - lp) * (1 - smooth);
      // Fades out over the length of the strike, so it joins the modes rather
      // than sitting on top of them.
      out[i] += lp * 0.9 * (1 - i / hitN);
    }
  }

  let peak = 0;
  for (let i = 0; i < total; i++) {
    const v = Math.abs(out[i]);
    if (v > peak) peak = v;
  }
  if (peak > 1e-6) for (let i = 0; i < total; i++) out[i] /= peak;

  return cache.set(key, buf);
}

/** Drop everything cached. */
export function forgetStrikes() {
  cache.clear();
}

/** How much audio the strike cache is holding, in megabytes. */
export function strikesHeldMB() {
  return cache.megabytes;
}
