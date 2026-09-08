// The room the sound is in, built rather than recorded.
//
// A convolution reverb needs an impulse response: a recording of a hand clap
// in the actual room. Those are large files with awkward licences, and this
// project ships neither. So the rooms here are synthesised, which for this
// purpose is not a compromise -- an impulse response is noise with an envelope
// on it, plus a handful of discrete early reflections, and both of those are
// two loops.
//
// Three things separate a room that sounds like a room from a wash of noise:
//
//   Early reflections. The first sixty milliseconds are not a tail, they are
//   individual bounces off the nearest surfaces, and their spacing is what
//   tells the ear how big the place is. A tail with no early reflections is a
//   plate, not a room -- which is why `plate` here has none, deliberately.
//
//   Frequency-dependent decay. Air and soft surfaces absorb treble faster
//   than bass, so a cathedral's tail goes dark as it dies. A tail that keeps
//   its brightness all the way down sounds electronic, because it is.
//
//   Two different channels. The same noise in both ears is a sound inside
//   your head. Decorrelated noise is a space around it.
//
// An impulse response is computed once per room per context and kept, because
// five seconds of stereo noise is half a million random numbers.

const cache = new Map();

export const SPACES = {
  none: {
    label: 'Dry',
    note: 'No room at all. What the instrument makes, and nothing else.',
    wet: 0,
  },
  room: {
    label: 'Room',
    note: 'A small, soft space with the walls close enough to hear. Adds a body to a bell without putting it anywhere in particular.',
    seconds: 0.55, wet: 0.9, predelay: 0.006, damp: 4200, taps: 9, spread: 0.05,
  },
  hall: {
    label: 'Hall',
    note: 'A concert hall: the tail is long enough to notice and short enough to stay out of the way of the next note.',
    seconds: 1.9, wet: 0.8, predelay: 0.018, damp: 3200, taps: 12, spread: 0.09,
  },
  cathedral: {
    label: 'Cathedral',
    note: 'Five seconds of stone. Everything above two kilohertz is gone within a second, which is what makes it sound like a building rather than a setting.',
    seconds: 5.2, wet: 1.15, predelay: 0.035, damp: 1500, taps: 16, spread: 0.16, curve: 1.6,
  },
  cistern: {
    label: 'Cistern',
    note: 'Hard wet walls very close together. The early reflections are nearly as loud as the sound, which is what a tiled underground room does.',
    seconds: 3.4, wet: 1.0, predelay: 0.004, damp: 5200, taps: 22, spread: 0.03, early: 0.85,
  },
  plate: {
    label: 'Plate',
    note: 'A sheet of steel under tension, as the studios of the 1960s used. Dense from the first instant and with no early reflections at all, because there are no walls -- and that is exactly why it sits behind anything without describing a place.',
    seconds: 2.1, wet: 0.85, predelay: 0.002, damp: 7000, taps: 0, curve: 0.8,
  },
  canyon: {
    label: 'Canyon',
    note: 'Reflections far enough apart to be heard one at a time. Not a reverb so much as a landscape answering back.',
    seconds: 4.5, wet: 1.0, predelay: 0.08, damp: 2600, taps: 7, spread: 0.55, early: 0.7, curve: 2.2,
  },
};

// The `wet` numbers look large for a send level and they are not: the
// impulses are normalised to unit energy, so a five-second tail is spread very
// thin and needs more gain than a half-second one to arrive at the same place.
// They were tuned by measuring the change in level a bell makes, not by eye.
export const SPACE_NAMES = Object.keys(SPACES);
export const DEFAULT_SPACE = 'none';

/**
 * Build the impulse response for one room.
 *
 * @param {BaseAudioContext} ctx
 * @param {string} name
 * @returns {AudioBuffer|null} null for a room with no tail
 */
export function impulse(ctx, name) {
  const spec = SPACES[name];
  if (!spec || !spec.seconds) return null;
  const key = ctx.sampleRate + ':' + name;
  const found = cache.get(key);
  if (found) return found;

  const rate = ctx.sampleRate;
  const total = Math.max(64, Math.round(rate * spec.seconds));
  const buf = ctx.createBuffer(2, total, rate);
  const curve = spec.curve ?? 1.2;
  const pre = Math.round(rate * (spec.predelay ?? 0.01));

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // The tail. Two layers with different decays does the job of a
    // frequency-dependent one: a dark layer that lasts and a bright layer
    // that does not, so the tail darkens as it falls.
    let lp = 0;
    const a = Math.exp((-2 * Math.PI * (spec.damp ?? 3000)) / rate);
    for (let i = pre; i < total; i++) {
      const t = (i - pre) / (total - pre);
      const env = Math.pow(1 - t, curve * 2.2);
      const n = Math.random() * 2 - 1;
      lp = lp * a + n * (1 - a);
      // The bright half dies about four times faster than the dark half.
      const bright = (n - lp) * Math.pow(1 - t, curve * 9);
      d[i] = (lp + bright * 0.6) * env;
    }

    // Early reflections: discrete taps, spread over the first `spread`
    // seconds, alternating in sign and getting quieter. Their spacing is the
    // size of the room, so it is deliberately not regular -- a regular comb
    // is a flanger, and the ear hears the metal in it at once.
    const taps = spec.taps ?? 10;
    const spread = spec.spread ?? 0.08;
    for (let k = 0; k < taps; k++) {
      const u = (k + 1) / taps;
      // Irregular by construction: fractional multiples of the golden ratio
      // never land on a simple ratio of one another.
      const jitter = ((k * 1.618033988749895) % 1) * 0.55 + 0.45;
      const at = pre + Math.round(rate * spread * u * jitter);
      if (at >= total) continue;
      const amp = (spec.early ?? 0.55) * Math.pow(1 - u, 1.4) * (k % 2 ? -1 : 1);
      // A tap is not a single sample: a real reflection has been through the
      // air and off a wall, so it is a short smear.
      const width = Math.max(2, Math.round(rate * 0.0012));
      for (let j = 0; j < width; j++) {
        if (at + j < total) d[at + j] += amp * (1 - j / width) * (Math.random() * 0.5 + 0.75);
      }
    }
  }

  // Normalised by ENERGY, not by peak, and the difference is not academic.
  //
  // Convolution sums the whole impulse, so what decides the output level is
  // the total energy in it -- and a five-second tail has ten times the energy
  // of a half-second one at the same peak. The first version normalised the
  // peak and measured output peaks of 7.9 against a dry 0.48: every room
  // clipped, and the long ones clipped hardest, so the reverb got worse
  // exactly as the room got bigger.
  //
  // One scale for both channels, so the stereo image is not disturbed.
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < total; i++) energy += d[i] * d[i];
  }
  if (energy > 1e-9) {
    const scale = 1 / Math.sqrt(energy);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < total; i++) d[i] *= scale;
    }
  }

  cache.set(key, buf);
  return buf;
}

/** Drop every cached impulse response. */
export function forgetSpaces() {
  cache.clear();
}
