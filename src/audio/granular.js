// Granular: a recording taken apart and put back as a cloud.
//
// A sample bank plays a call, and one call per event is a call per event. Cut
// the same recording into fifty-millisecond grains, scatter them in time,
// pitch and stereo position, and the same twelve files become a texture that
// never repeats -- a hedgerow rather than a bird, a crowd rather than a voice.
// It is the one technique that turns a small set of recordings into an
// unbounded amount of sound, which is exactly the constraint this project has.
//
// Every grain is a BufferSource with its own envelope. That is a lot of nodes,
// so the count is bounded per event and the grains are short: the ear stops
// hearing them individually somewhere around forty milliseconds, which is
// also where they get cheap.
//
// The envelope matters more than anything else here. A grain cut with hard
// edges is a click at each end, and a cloud of clicks is not a texture. Each
// one is faded in and out over its own length, which is what makes the joins
// inaudible.

import { Instrument } from './instrument.js';

export class GranularInstrument extends Instrument {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {string} o.baseUrl
   * @param {string[]} o.files
   * @param {number} [o.grains]     grains per event
   * @param {number} [o.grain]      seconds per grain
   * @param {number} [o.spray]      seconds the cloud is spread over
   * @param {number} [o.pitch]      semitones of random detune per grain
   * @param {number} [o.follow]     0..1 of the mapped pitch to obey
   * @param {number} [o.gain]
   */
  constructor({
    name = 'grains', baseUrl = '', files = [], exts = ['ogg', 'mp3'],
    grains = 9, grain = 0.09, spray = 0.55, pitch = 5, follow = 0.35, gain = 0.4,
  } = {}) {
    super(name);
    this.baseUrl = baseUrl;
    this.files = files;
    this.exts = exts;
    this.grains = grains;
    this.grain = grain;
    this.spray = spray;
    this.pitch = pitch;
    this.follow = follow;
    this.gain = gain;
    this._buffers = null;
    this._loading = null;
    this.failures = [];
  }

  get ready() {
    return Boolean(this._buffers && this._buffers.some(Boolean));
  }

  async load(ctx) {
    if (this._buffers) return this;
    if (!this._loading) {
      const ext = this.exts[0];
      this.failures = [];
      this._loading = Promise.all(
        this.files.map(async (f) => {
          try {
            const res = await fetch(this.baseUrl + f + '.' + ext);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await ctx.decodeAudioData(await res.arrayBuffer());
          } catch (e) {
            this.failures.push(`${f}.${ext}: ${e.message}`);
            return null;
          }
        })
      ).then((bufs) => {
        this._buffers = bufs;
        return this;
      });
    }
    return this._loading;
  }

  play(ctx, dest, { semitone = 0, velocity = 1, when = 0 } = {}) {
    const usable = (this._buffers || []).filter(Boolean);
    if (!usable.length) return null;
    const t0 = when || ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = Math.max(0.0001, velocity * this.gain);
    out.connect(dest);

    // The mapped pitch is obeyed only in part. A cloud that tracks the data
    // exactly is a siren; one that ignores it entirely has thrown away the
    // measurement. A third of the way is where it still reads as data.
    const base = Math.pow(2, (semitone * this.follow) / 12);
    const n = Math.max(1, Math.round(this.grains));
    let last = t0;

    for (let i = 0; i < n; i++) {
      const buf = usable[(Math.random() * usable.length) | 0];
      // Grains are spread with a bias towards the start, so the cloud has an
      // onset. Spread evenly it has none, and an event with no onset is not
      // heard as an event at all.
      const at = t0 + Math.pow(Math.random(), 1.7) * this.spray;
      const len = this.grain * (0.6 + Math.random() * 0.8);
      // Never within a grain's length of the end of the file, or the grain is
      // half silence and the cloud develops holes.
      const maxOff = Math.max(0, buf.duration - len - 0.01);
      const offset = Math.random() * maxOff;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = base * Math.pow(2, ((Math.random() - 0.5) * this.pitch) / 12);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      // Fade in over a third, out over the rest: an asymmetric grain reads as
      // a small sound rather than as a symmetrical blip.
      env.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.5, at + len * 0.3);
      env.gain.linearRampToValueAtTime(0.0001, at + len);

      // Scattered across the stereo field, because a mono cloud is a mono
      // cloud however many grains are in it.
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) {
        pan.pan.value = (Math.random() - 0.5) * 1.6;
        src.connect(env).connect(pan).connect(out);
      } else {
        src.connect(env).connect(out);
      }

      src.start(at, offset, len + 0.02);
      src.stop(at + len + 0.05);
      if (at + len > last) last = at + len;
    }

    return {
      duration: (last - t0) * 1000,
      stop(fade = 0.05) {
        const t = ctx.currentTime;
        try {
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
          out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        } catch (e) {}
      },
    };
  }
}
