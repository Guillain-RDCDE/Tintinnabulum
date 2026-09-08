// Karplus-Strong: a plucked string, from a burst of noise and a loop.
//
// Fill a buffer one wavelength long with noise, then read it round and round,
// averaging each sample with the one before it as you go. The noise is the
// pluck; the averaging is the string losing its high partials first, which is
// exactly what a real one does. Two lines of arithmetic and it sounds more
// like a string than any amount of filtered sawtooth, because it is doing the
// same thing a string does rather than imitating the result.
//
// Kevin Karplus and Alex Strong published it in 1983 as "digital synthesis of
// plucked-string and drum timbres". It is the cheapest convincing physical
// model there is.
//
// It is rendered into an AudioBuffer here rather than built from a DelayNode
// with feedback, which is the obvious way and does not work: a feedback loop
// through a DelayNode is quantised to one render quantum in every browser, so
// the shortest loop is 128 samples and the highest note is about 340 Hz. A
// buffer has no such floor, costs a few thousand multiplications, and is
// identical every time -- which means it can be cached.

const cache = new Map();

/**
 * Render one plucked note.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} freq        hertz
 * @param {object} [o]
 * @param {number} [o.seconds]     how long to render
 * @param {number} [o.damping]     0..1, how fast the highs go. 0.5 is neutral
 * @param {number} [o.decay]       loop gain; below 1, and closer to 1 rings longer
 * @param {number} [o.pick]        0..1, where along the string it was plucked
 * @param {number} [o.tone]        0..1, how bright the pluck itself is
 * @returns {AudioBuffer}
 */
export function pluck(ctx, freq, {
  seconds = 2.4, damping = 0.5, decay = 0.996, pick = 0.22, tone = 0.6,
} = {}) {
  const rate = ctx.sampleRate;
  // Cached by everything that changes the result, rounded, so a feed that
  // plays the same note repeatedly renders it once. A quarter of a cent is
  // far finer than anyone can hear and keeps the table small.
  const key = [
    rate, Math.round(freq * 40), Math.round(seconds * 20), Math.round(damping * 100),
    Math.round(decay * 10000), Math.round(pick * 50), Math.round(tone * 50),
  ].join(':');
  const hit = cache.get(key);
  if (hit) return hit;

  const n = Math.max(2, Math.round(rate / Math.max(20, freq)));
  const total = Math.max(n + 2, Math.round(rate * seconds));
  const buf = ctx.createBuffer(1, total, rate);
  const out = buf.getChannelData(0);

  // The pluck. A real string is not excited evenly along its length: plucked
  // near the bridge it is bright and thin, near the middle round and full.
  // That is a comb filter on the excitation, and it is most of the character.
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
  const off = Math.max(1, Math.round(n * Math.min(0.5, Math.max(0.02, pick))));
  const combed = new Float32Array(n);
  for (let i = 0; i < n; i++) combed[i] = line[i] - line[(i + off) % n];
  // `tone` rolls the excitation off before it enters the loop, which is the
  // difference between a fingernail and a thumb.
  let lp = 0;
  const a = 1 - Math.min(0.99, Math.max(0.01, tone));
  for (let i = 0; i < n; i++) {
    lp += (combed[i] - lp) * (1 - a);
    line[i] = lp;
  }

  // The loop. Each sample is a weighted average of the two before it, which
  // is a one-zero lowpass: the higher the partial, the faster it goes.
  const d = Math.min(0.99, Math.max(0.01, damping));
  let prev = line[n - 1];
  let idx = 0;
  for (let i = 0; i < total; i++) {
    const cur = line[idx];
    const next = (cur * (1 - d) + prev * d) * decay;
    out[i] = cur;
    line[idx] = next;
    prev = cur;
    idx = (idx + 1) % n;
  }

  // Normalise: the excitation is random, so without this every note is a
  // different loudness and the instrument sounds broken rather than alive.
  let peak = 0;
  for (let i = 0; i < total; i++) {
    const v = Math.abs(out[i]);
    if (v > peak) peak = v;
  }
  if (peak > 1e-6) {
    for (let i = 0; i < total; i++) out[i] /= peak;
  }

  // Bounded, because a busy feed at many pitches would otherwise grow this
  // for the length of the session.
  if (cache.size > 240) cache.clear();
  cache.set(key, buf);
  return buf;
}

/** Drop everything cached. Contexts do not outlive a page, but tests do. */
export function forgetPlucks() {
  cache.clear();
}
