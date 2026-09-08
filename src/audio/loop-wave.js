// The shape of a swell, as one oscillator.
//
// Music for Airports is tape loops of different lengths playing at once. Each
// loop holds one sung note; the loops are 17, 20, 24, 31 seconds long, so the
// combination takes hours to come back round and never sounds arranged. That
// is the whole construction, and it needs no sequencer -- only a periodic
// envelope per voice, at a period that shares no factor with its neighbours.
//
// A sine LFO would do it, but a sine swells and fades symmetrically and every
// voice would sound like it was being faded up by a hand on a slider. A note
// enters over a couple of seconds and leaves over ten. That asymmetry is what
// makes it a note rather than a fader, so the envelope is built as a Fourier
// series and handed to the oscillator as a PeriodicWave: one node, no
// scheduling, and it runs for as long as the piece does.

/**
 * Build a repeating envelope as a PeriodicWave.
 *
 * The wave is zero-mean, because it is added to a gain that already has its
 * own level: what this contributes is the movement, not the loudness. It peaks
 * at +1, so a depth of d gives a swing of d.
 *
 * @param {BaseAudioContext} ctx
 * @param {object} [o]
 * @param {number} [o.attack]     fraction of the period spent rising
 * @param {number} [o.hold]       fraction spent at the top
 * @param {number} [o.release]    fraction spent falling
 * @param {number} [o.harmonics]  terms in the series; more means sharper
 * @returns {PeriodicWave}
 */
export function swellWave(ctx, { attack = 0.12, hold = 0.06, release = 0.45, harmonics = 28 } = {}) {
  const N = 1024;
  const env = new Float64Array(N);
  const a = Math.max(1e-3, attack);
  const h = Math.max(0, hold);
  const r = Math.max(1e-3, release);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    let v;
    if (t < a) {
      // Raised cosine in and out, so there is no corner anywhere: a corner is
      // a click, and at these periods a click is the only thing you would hear.
      v = 0.5 - 0.5 * Math.cos((t / a) * Math.PI);
    } else if (t < a + h) {
      v = 1;
    } else if (t < a + h + r) {
      v = 0.5 + 0.5 * Math.cos(((t - a - h) / r) * Math.PI);
    } else {
      v = 0;
    }
    env[i] = v;
  }

  // Direct summation rather than an FFT: this runs once per layer, at start,
  // and 28 terms over 1024 samples is nothing. Being obviously correct is
  // worth more here than being fast.
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const th = (2 * Math.PI * k * i) / N;
      re += env[i] * Math.cos(th);
      im -= env[i] * Math.sin(th);
    }
    // The DC term is dropped by starting at k = 1, which is what makes the
    // result zero-mean.
    real[k] = (2 * re) / N;
    imag[k] = (2 * im) / N;
  }

  // Normalise to a peak of one, so `depth` means the same thing whatever
  // shape it was asked for.
  let peak = 0;
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (let k = 1; k <= harmonics; k++) {
      const th = (2 * Math.PI * k * i) / N;
      v += real[k] * Math.cos(th) - imag[k] * Math.sin(th);
    }
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  if (peak > 1e-6) {
    for (let k = 1; k <= harmonics; k++) {
      real[k] /= peak;
      imag[k] /= peak;
    }
  }

  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

/**
 * Periods that do not line up.
 *
 * Given a rough length in seconds and how many voices are wanted, this returns
 * lengths spread around it whose ratios are as far from simple fractions as it
 * can manage -- successive multiples of the golden ratio, folded into a range.
 * Two loops at 20 and 30 seconds meet every minute and the piece has a bar
 * line; at 19.4 and 30.7 they effectively never meet.
 *
 * @param {number} around  centre of the range, in seconds
 * @param {number} count
 * @param {number} [spread] half-width as a fraction of `around`
 */
export function loopPeriods(around, count, spread = 0.45) {
  const PHI = 1.618033988749895;
  const out = [];
  for (let i = 0; i < count; i++) {
    // Fractional parts of multiples of phi are the classic low-discrepancy
    // sequence: evenly spread, and never repeating a ratio.
    const u = (i * PHI) % 1;
    out.push(around * (1 - spread + 2 * spread * u));
  }
  return out;
}
