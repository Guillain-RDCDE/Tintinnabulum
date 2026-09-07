// The bed: sound that is always there, and answers the rate rather than the
// event.
//
// Every voice in this engine until now was one note for one event. That is a
// musical instrument, and it is the right shape for bells. It is the wrong
// shape for a place. A shore is not a sequence of wave-events; it is a
// continuous body of sound that rises and falls, with detail on top.
//
// So an ambience reads the same data twice. The bed follows *density* -- how
// much is happening -- and the kit's instruments answer individual events as
// before. A quiet feed is a distant swell; a busy one is a sea getting up. The
// aggregate becomes texture, and the single event stays a detail within it.
//
// Nothing here is triggered. The layers start when the ambience starts and run
// until it stops; only their gain and colour move.

import { noiseSource } from './noise.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

export class Bed {
  /**
   * @param {object} spec
   * @param {string} spec.name
   * @param {Array}  spec.layers     see AMBIENCES for the shape
   * @param {number} [spec.busyAt]   events per second counted as "fully busy"
   */
  constructor(spec) {
    this.spec = spec;
    this.name = spec.name || 'bed';
    this.busyAt = spec.busyAt ?? 8;
    this.ctx = null;
    this.out = null;
    this.layers = [];
    this._density = 0;
    this._recent = [];
  }

  get running() {
    return Boolean(this.out);
  }

  start(ctx, dest, { volume = 1 } = {}) {
    if (this.out) return this;
    this.ctx = ctx;
    const out = ctx.createGain();
    // Fade in. A bed that appears at full level is heard as a fault.
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), ctx.currentTime + 2.5);
    out.connect(dest);
    this.out = out;

    for (const spec of this.spec.layers) {
      this.layers.push(this._buildLayer(ctx, out, spec));
    }
    this.setDensity(0);
    return this;
  }

  _buildLayer(ctx, dest, spec) {
    const nodes = [];
    const gain = ctx.createGain();
    gain.gain.value = spec.gain?.[0] ?? 0.05;

    let source;
    if (spec.tone) {
      // A drone rather than noise: the low sustain under a night, the distant
      // hum of a forest. Two detuned oscillators, because one is a test tone.
      const a = ctx.createOscillator();
      a.type = spec.wave || 'sine';
      a.frequency.value = spec.tone;
      const b = ctx.createOscillator();
      b.type = spec.wave || 'sine';
      b.frequency.value = spec.tone;
      b.detune.value = spec.detune ?? 7;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      a.connect(mix);
      b.connect(mix);
      source = mix;
      nodes.push(a, b);
    } else {
      const n = noiseSource(ctx, spec.colour || 'pink');
      source = n;
      nodes.push(n);
    }

    const filt = ctx.createBiquadFilter();
    filt.type = spec.filter || 'lowpass';
    filt.frequency.value = spec.cutoff?.[0] ?? 600;
    filt.Q.value = spec.q ?? 1;
    source.connect(filt).connect(gain).connect(dest);

    // A slow, unsynchronised modulation is what stops a bed sounding like a
    // held sample. Two layers with slightly different rates never repeat the
    // same combination, which is the whole trick behind a convincing swell.
    if (spec.swell) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = spec.swell.rate;
      const depth = ctx.createGain();
      depth.gain.value = spec.swell.depth;
      lfo.connect(depth);
      depth.connect(spec.swell.target === 'cutoff' ? filt.frequency : gain.gain);
      nodes.push(lfo);
    }

    for (const n of nodes) {
      if (n.start) n.start(ctx.currentTime + Math.random() * 0.3);
    }
    return { spec, gain, filt, nodes };
  }

  /**
   * Tell the bed how busy the world is, 0 to 1.
   *
   * Movement is ramped over seconds, never set. A bed that jumps with the rate
   * is a volume control being turned; a bed that takes four seconds to answer
   * is weather.
   */
  setDensity(value) {
    this._density = clamp01(value);
    if (!this.ctx) return this;
    const t = this.ctx.currentTime;
    for (const layer of this.layers) {
      const s = layer.spec;
      const ease = s.ease ?? 4;
      if (s.gain) {
        layer.gain.gain.cancelScheduledValues(t);
        layer.gain.gain.setTargetAtTime(lerp(s.gain[0], s.gain[1], this._density), t, ease);
      }
      if (s.cutoff) {
        layer.filt.frequency.cancelScheduledValues(t);
        layer.filt.frequency.setTargetAtTime(lerp(s.cutoff[0], s.cutoff[1], this._density), t, ease);
      }
    }
    return this;
  }

  /**
   * Feed it an event. The bed does not sound it -- it counts it.
   *
   * The rate is measured over a rolling ten seconds rather than instantaneously,
   * because a bed answering each arrival would be a tremolo, not a tide.
   */
  observe(now = Date.now()) {
    this._recent.push(now);
    const cutoff = now - 10000;
    while (this._recent.length && this._recent[0] < cutoff) this._recent.shift();
    if (this._recent.length > 5000) this._recent.splice(0, this._recent.length - 5000);
    const perSecond = this._recent.length / 10;
    // Compressed, because rate spans orders of magnitude: two an hour and two
    // thousand a minute must both land somewhere usable on a 0..1 dial.
    this.setDensity(Math.log1p(perSecond) / Math.log1p(this.busyAt));
    return this;
  }

  get density() {
    return this._density;
  }

  get eventsPerSecond() {
    return this._recent.length / 10;
  }

  stop(fade = 1.5) {
    if (!this.out) return this;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
      this.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    } catch (e) {
      /* a context that is already gone cannot be faded */
    }
    const nodes = this.layers.flatMap((l) => l.nodes);
    for (const n of nodes) {
      try {
        if (n.stop) n.stop(t + fade + 0.1);
      } catch (e) {}
    }
    this.layers = [];
    this.out = null;
    this.ctx = null;
    this._recent.length = 0;
    return this;
  }
}
