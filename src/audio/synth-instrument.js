// Four synthesis engines, driven entirely by the preset table.
//
//   fm      an operator pair. Cheap, and the only honest way to get the
//           inharmonic clang of struck metal out of two oscillators.
//   sub     an oscillator through a filter. Everything pitched and ordinary.
//   noise   filtered noise. Surf, fire, wind: things with no pitch at all.
//   modal   a bank of tuned resonators struck with a burst. This is how a
//           bell or a glass actually works -- a body with modes, each ringing
//           at its own frequency and dying at its own rate -- and it is the
//           difference between something that sounds struck and something
//           that sounds synthesised.
//   string  Karplus-Strong, in string.js. A real plucked string.

import { Instrument } from './instrument.js';
import { SYNTH_PRESETS } from './presets.js';
import { noiseSource } from './noise.js';
import { pluck } from './string.js';
import { strike } from './modal.js';

export class SynthInstrument extends Instrument {
  constructor({ name = 'synth', preset = 'bell', baseFreq = 261.63, gain = 0.35, ...overrides } = {}) {
    super(name);
    const base = typeof preset === 'string' ? SYNTH_PRESETS[preset] : preset;
    if (!base) throw new Error('Unknown synth preset: ' + preset);
    this.params = { ...base, ...overrides };
    this.baseFreq = baseFreq;
    this.gain = gain;
  }

  play(ctx, dest, { semitone = 0, velocity = 1, when = 0 } = {}) {
    const p = this.params;
    const t0 = when || ctx.currentTime;
    // `octave` shifts a preset's whole register: birds belong far above the
    // range the mapper works in, an owl far below it.
    const freq = this.baseFreq * Math.pow(2, (semitone + (p.octave || 0)) / 12);
    const peak = Math.max(0.0002, velocity * this.gain);
    const decay = p.decay;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(peak, t0 + p.attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + p.attack + decay);
    amp.connect(dest);

    const nodes = [];
    const tail = t0 + p.attack + decay + 0.05;

    // Pitch envelope. Starting away from the target and arriving at it is what
    // turns a beep into a drop or a knock; without it those presets are just
    // short sine tones.
    const bend = (param, target) => {
      if (!p.sweep || p.sweep === 1) {
        param.value = target;
        return;
      }
      param.setValueAtTime(Math.max(1, target * p.sweep), t0);
      param.exponentialRampToValueAtTime(Math.max(1, target), t0 + (p.sweepTime || 0.05));
    };

    // Vibrato: an LFO added onto the frequency in hertz. Depth is a fraction
    // of the note, so the wobble stays proportional across the register.
    const addVibrato = (param) => {
      if (!p.vibrato) return;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = p.vibrato.rate;
      const depth = ctx.createGain();
      depth.gain.value = freq * p.vibrato.depth;
      lfo.connect(depth).connect(param);
      nodes.push(lfo);
    };

    if (p.engine === 'string') {
      // The whole note is rendered as a buffer and played back; the amplitude
      // envelope above only shapes its ends. See string.js for why it is not
      // built from a DelayNode.
      const src = ctx.createBufferSource();
      src.buffer = pluck(ctx, freq, {
        seconds: Math.min(6, p.attack + decay + 0.2),
        damping: p.damping ?? 0.5,
        // Longer strings ring longer, exactly as they do on an instrument, so
        // the loop gain follows the pitch rather than being one number.
        decay: Math.min(0.9995, (p.loop ?? 0.995) + (1 - Math.min(1, freq / 900)) * 0.003),
        pick: p.pick ?? 0.22,
        tone: p.tone ?? 0.6,
      });
      // A body: a string on its own is thin, and every real one is glued to
      // something that resonates.
      if (p.body) {
        const body = ctx.createBiquadFilter();
        body.type = 'peaking';
        body.frequency.value = p.body;
        body.Q.value = p.bodyQ ?? 1.2;
        body.gain.value = p.bodyGain ?? 6;
        src.connect(body).connect(amp);
      } else {
        src.connect(amp);
      }
      nodes.push(src);
    } else if (p.engine === 'modal') {
      // Summed decaying sinusoids, rendered in modal.js. The bank-of-biquads
      // version is in the comment at the top of that file, along with the
      // measurement that killed it.
      const src = ctx.createBufferSource();
      src.buffer = strike(ctx, freq, {
        modes: p.modes,
        seconds: Math.min(8, p.attack + decay + 0.3),
        decay,
        strike: p.strike,
        hardness: p.hardness ?? 0.5,
      });
      src.connect(amp);
      nodes.push(src);
    } else if (p.engine === 'noise') {
      // Filtered noise: a wave breaking, an ember cracking, a gust. The note's
      // pitch still matters -- it moves the filter, not an oscillator -- so a
      // large event is a deeper break and a small one a lighter tick, and the
      // mapper's work is not thrown away just because nothing here is tuned.
      const src = noiseSource(ctx, p.colour || 'pink');
      const filt = ctx.createBiquadFilter();
      filt.type = p.filter || 'lowpass';
      filt.Q.value = p.q ?? 1;

      const centre = Math.min(18000, Math.max(40, (p.cutoff ?? 1200) * (freq / this.baseFreq)));
      const target = Math.min(18000, Math.max(40, centre * (p.cutoffRatio ?? 0.25)));
      filt.frequency.setValueAtTime(centre, t0);
      filt.frequency.exponentialRampToValueAtTime(target, t0 + (p.cutoffDecay || decay));

      let out = src.connect(filt);
      // A second, narrow band on top is what turns flat noise into something
      // with a voice: the resonant whistle in a gust, the hiss of foam.
      if (p.formant) {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = Math.min(18000, p.formant * (freq / this.baseFreq));
        band.Q.value = p.formantQ ?? 6;
        const mix = ctx.createGain();
        mix.gain.value = p.formantMix ?? 0.5;
        filt.connect(band).connect(mix).connect(amp);
      }
      out.connect(amp);
      nodes.push(src);
    } else if (p.engine === 'fm') {
      const car = ctx.createOscillator();
      car.type = p.wave;
      bend(car.frequency, freq);
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = freq * p.ratio;
      const modGain = ctx.createGain();
      const index = p.index * (0.4 + 0.6 * velocity) * (freq / this.baseFreq);
      modGain.gain.setValueAtTime(Math.max(1, index), t0);
      modGain.gain.exponentialRampToValueAtTime(1, t0 + p.indexDecay);
      mod.connect(modGain).connect(car.frequency);
      car.connect(amp);
      nodes.push(car, mod);
      addVibrato(car.frequency);
    } else {
      const osc = ctx.createOscillator();
      osc.type = p.wave;
      bend(osc.frequency, freq);
      addVibrato(osc.frequency);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.Q.value = p.q;
      filt.frequency.setValueAtTime(Math.min(18000, p.cutoff + freq * 2), t0);
      filt.frequency.exponentialRampToValueAtTime(Math.max(120, freq), t0 + p.cutoffDecay);
      osc.connect(filt).connect(amp);
      nodes.push(osc);
      if (p.detune) {
        const osc2 = ctx.createOscillator();
        osc2.type = p.wave;
        bend(osc2.frequency, freq);
        osc2.detune.value = p.detune;
        osc2.connect(filt);
        nodes.push(osc2);
      }
    }

    for (const n of nodes) {
      n.start(t0);
      n.stop(tail);
    }

    return {
      duration: (p.attack + decay) * 1000,
      stop(fade = 0.02) {
        const t = ctx.currentTime;
        try {
          amp.gain.cancelScheduledValues(t);
          amp.gain.setValueAtTime(Math.max(0.0001, amp.gain.value), t);
          amp.gain.exponentialRampToValueAtTime(0.0001, t + fade);
          for (const n of nodes) n.stop(t + fade + 0.01);
        } catch (e) {}
      },
    };
  }
}
