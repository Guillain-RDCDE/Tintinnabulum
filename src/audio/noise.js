// Noise, and the buffers that make it affordable.
//
// Everything this engine could make until now came from an oscillator, which
// is why `breeze` is a detuned sawtooth under a filter -- a *pitched*
// approximation of wind. Surf, fire, rain, wind through reeds and the hiss of
// a cymbal are not pitched at all. They are filtered noise, and without a
// noise source they cannot be made at any quality.
//
// Buffers are generated once per AudioContext and looped. Generating two
// seconds of noise costs a few million random numbers; doing it per note, at
// the rate this engine fires, would be heard as a stutter.

const CACHE = new WeakMap();

/**
 * White is flat. Pink falls 3dB per octave and is what most natural broadband
 * sound is closest to -- rain, surf, wind. Brown falls 6dB and is the low
 * rumble under a fire or a distant sea.
 */
function fill(data, colour) {
  const n = data.length;
  if (colour === 'white') {
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return;
  }
  if (colour === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return;
  }
  // Pink, by Paul Kellet's economical filter: seven one-pole sections summed.
  // A true 1/f spectrum needs an FFT; this is within a fraction of a dB across
  // the audible range and costs seven multiplies a sample.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

/**
 * A looping noise buffer for this context, made once and shared.
 * @param {BaseAudioContext} ctx
 * @param {'white'|'pink'|'brown'} colour
 */
export function noiseBuffer(ctx, colour = 'pink') {
  let per = CACHE.get(ctx);
  if (!per) {
    per = new Map();
    CACHE.set(ctx, per);
  }
  if (per.has(colour)) return per.get(colour);

  // Two seconds: long enough that the loop is not heard as a period, short
  // enough that the allocation is unremarkable even on a phone.
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  fill(buf.getChannelData(0), colour);
  per.set(colour, buf);
  return buf;
}

/** A looping noise source, started by the caller. */
export function noiseSource(ctx, colour = 'pink') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, colour);
  src.loop = true;
  // A random start keeps two voices from being the same sound twice.
  src.loopStart = Math.random() * 1.5;
  src.loopEnd = src.buffer.duration;
  return src;
}
