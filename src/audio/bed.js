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
import { swellWave } from './loop-wave.js';

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
      // A drone rather than noise: the low sustain under a night, the weight
      // under a cathedral. Never one oscillator -- one oscillator is a test
      // tone, and the beating between two slightly apart is the whole reason
      // this sounds like an instrument.
      //
      // `stack` is what separates a hum from a wall of low brass. Six partials
      // over a root of forty hertz, each a couple of cents off its neighbour,
      // through a low filter: the filter decides how much of the stack you
      // hear, and that is the crescendo.
      const stack = spec.stack || [{ mul: 1, gain: 1 }];
      const mix = ctx.createGain();
      mix.gain.value = 1 / Math.max(1, stack.reduce((n, p2) => n + (p2.gain ?? 1), 0));
      const spread = spec.detune ?? 7;
      for (let i = 0; i < stack.length; i++) {
        const part = stack[i];
        const g = ctx.createGain();
        g.gain.value = part.gain ?? 1;
        g.connect(mix);
        // Two per partial, detuned against each other. The spread widens with
        // the partial number because beating that is right for a fundamental
        // is inaudible three octaves up.
        for (const sign of [-1, 1]) {
          const osc = ctx.createOscillator();
          osc.type = part.wave || spec.wave || 'sine';
          osc.frequency.value = spec.tone * (part.mul ?? 1);
          osc.detune.value = sign * spread * (1 + i * 0.35);
          osc.connect(g);
          nodes.push(osc);
        }
      }
      source = mix;
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
    // held sample. Rates that are not a ratio of one another never repeat the
    // same combination, which is the whole trick behind a convincing swell --
    // and, at periods of half a minute rather than ten seconds, it is also
    // exactly how Music for Airports is built.
    //
    // `shape: 'swell'` gives the movement an asymmetric envelope instead of a
    // sine: in over two seconds, out over ten. A sine rises and falls the same
    // way, and every voice sounds like a hand on a fader.
    for (const sw of spec.swells || (spec.swell ? [spec.swell] : [])) {
      const lfo = ctx.createOscillator();
      if (sw.shape === 'swell') {
        lfo.setPeriodicWave(
          swellWave(ctx, { attack: sw.attack ?? 0.12, hold: sw.hold ?? 0.05, release: sw.release ?? 0.45 })
        );
      } else {
        lfo.type = sw.wave || 'sine';
      }
      lfo.frequency.value = sw.rate;
      // A phase offset per layer, so voices sharing a rate still do not land
      // together. An oscillator has no phase control, so it is bought with a
      // delayed start instead.
      const depth = ctx.createGain();
      depth.gain.value = sw.depth;
      lfo.connect(depth);
      depth.connect(sw.target === 'cutoff' ? filt.frequency : gain.gain);
      nodes.push(lfo);
    }

    // A start offset per layer rather than per node: everything inside one
    // layer must stay in phase with itself, and nothing across layers should.
    const offset = spec.offset ?? Math.random() * 0.3;
    for (const n of nodes) {
      if (n.start) n.start(ctx.currentTime + offset);
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
