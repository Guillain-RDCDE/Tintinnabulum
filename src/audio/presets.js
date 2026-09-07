// --- synthesis ------------------------------------------------------------

// `sweep` bends the pitch: the oscillator starts at `sweep` times the target
// frequency and arrives at it over `sweepTime`. It is what separates a water
// drop from a beep -- the rising "plink" is entirely in that bend.
export const SYNTH_PRESETS = {
  // FM with an inharmonic ratio: the classic struck-metal timbre.
  bell: { engine: 'fm', wave: 'sine', ratio: 3.51, index: 320, indexDecay: 0.2, attack: 0.002, decay: 1.8 },
  glass: { engine: 'fm', wave: 'sine', ratio: 2.01, index: 140, indexDecay: 0.35, attack: 0.004, decay: 2.6 },
  clang: { engine: 'fm', wave: 'triangle', ratio: 5.13, index: 600, indexDecay: 0.12, attack: 0.001, decay: 1.1 },
  // Filtered saw with a fast decay: reads as a plucked string.
  pluck: { engine: 'sub', wave: 'sawtooth', attack: 0.001, decay: 0.42, cutoff: 2400, cutoffDecay: 0.14, q: 5 },
  woody: { engine: 'sub', wave: 'square', attack: 0.001, decay: 0.22, cutoff: 1600, cutoffDecay: 0.08, q: 2 },
  blip: { engine: 'sub', wave: 'triangle', attack: 0.001, decay: 0.12, cutoff: 5000, cutoffDecay: 0.06, q: 1 },
  pad: { engine: 'sub', wave: 'sawtooth', attack: 0.6, decay: 3.2, cutoff: 900, cutoffDecay: 2.4, q: 3, detune: 8 },

  // A falling drop rings *upward* as the cavity closes: the pitch rises fast
  // and the whole thing is over in a fifth of a second.
  drop: {
    engine: 'sub', wave: 'sine', attack: 0.001, decay: 0.22,
    cutoff: 4000, cutoffDecay: 0.1, q: 1, sweep: 0.45, sweepTime: 0.07,
  },
  // Deeper, slower, with a longer tail: the same gesture in a bigger space.
  well: {
    engine: 'sub', wave: 'sine', attack: 0.002, decay: 0.55,
    cutoff: 2200, cutoffDecay: 0.2, q: 2, sweep: 0.35, sweepTime: 0.14,
  },
  // Struck wood: a short burst through a narrow band, no tail at all.
  wood: {
    engine: 'sub', wave: 'triangle', attack: 0.001, decay: 0.13,
    cutoff: 2600, cutoffDecay: 0.05, q: 9, sweep: 1.6, sweepTime: 0.015,
  },
  // Tuned bars: an FM ratio near 4 is what makes a marimba read as wooden
  // rather than metallic.
  marimba: { engine: 'fm', wave: 'sine', ratio: 3.98, index: 90, indexDecay: 0.07, attack: 0.002, decay: 0.75 },
  // Plucked metal tines, bright and short.
  musicbox: { engine: 'fm', wave: 'sine', ratio: 3.02, index: 210, indexDecay: 0.09, attack: 0.001, decay: 1.1 },
  kalimba: { engine: 'fm', wave: 'triangle', ratio: 2.03, index: 60, indexDecay: 0.12, attack: 0.002, decay: 0.9 },
  // Big, slow, and deliberately inharmonic so it never settles on a pitch.
  gong: { engine: 'fm', wave: 'sine', ratio: 1.73, index: 480, indexDecay: 1.2, attack: 0.01, decay: 4.2 },

  // A tube rather than a bar: a high odd ratio and a long tail.
  chime: { engine: 'fm', wave: 'sine', ratio: 5.41, index: 260, indexDecay: 0.5, attack: 0.004, decay: 3.4 },
  // Struck oil drum: a low-order ratio keeps the partials nearly harmonic,
  // which is why a steel pan sings where a gong clangs.
  steelpan: { engine: 'fm', wave: 'sine', ratio: 2.5, index: 150, indexDecay: 0.18, attack: 0.003, decay: 1.3 },
  // Plucked gut: bright attack, quick fall, no metallic ring at all.
  harp: { engine: 'sub', wave: 'sawtooth', attack: 0.002, decay: 1.0, cutoff: 3200, cutoffDecay: 0.4, q: 2 },
  // Weight underneath everything else.
  bass: { engine: 'sub', wave: 'triangle', attack: 0.004, decay: 0.9, cutoff: 700, cutoffDecay: 0.3, q: 3 },

  // --- the natural world ---
  // Birdsong is mostly two things: a fast pitch bend and a fast wobble on top
  // of it. `vibrato` supplies the wobble, `sweep` the bend.
  chirp: {
    engine: 'sub', wave: 'sine', attack: 0.004, decay: 0.16,
    cutoff: 6000, cutoffDecay: 0.1, q: 1,
    sweep: 0.62, sweepTime: 0.05, vibrato: { rate: 26, depth: 0.05 },
    octave: 24, // birds sit far above the rest of the range
  },
  warble: {
    engine: 'sub', wave: 'sine', attack: 0.006, decay: 0.34,
    cutoff: 5200, cutoffDecay: 0.24, q: 1,
    sweep: 1.35, sweepTime: 0.09, vibrato: { rate: 15, depth: 0.09 },
    octave: 19,
  },
  // Low, breathy and slow: the counterweight to the small birds.
  owl: {
    engine: 'sub', wave: 'sine', attack: 0.05, decay: 0.55,
    cutoff: 900, cutoffDecay: 0.4, q: 4,
    sweep: 1.1, sweepTime: 0.18, vibrato: { rate: 5, depth: 0.02 },
    octave: -12,
  },
  // A dry, buzzing tick, very high and very short.
  cricket: {
    engine: 'sub', wave: 'square', attack: 0.001, decay: 0.05,
    cutoff: 9000, cutoffDecay: 0.03, q: 12,
    vibrato: { rate: 70, depth: 0.06 },
    octave: 31,
  },
  // Air rather than pitch: a wide, slow swell.
  breeze: {
    engine: 'sub', wave: 'sawtooth', attack: 0.5, decay: 2.6,
    cutoff: 520, cutoffDecay: 2.0, q: 1, detune: 14, octave: -7,
  },

  // --- filtered noise: the ambiences ------------------------------------
  // These are not notes. The mapper's pitch still reaches them, but it moves
  // the filter rather than an oscillator, so a large event breaks deeper and a
  // small one ticks lighter -- the mapping survives even though nothing is
  // tuned. See the `noise` engine in synth-instrument.js.

  // A wave arriving: a slow gather, then a long fall as the filter closes.
  wave: {
    engine: 'noise', colour: 'pink', attack: 0.35, decay: 2.6,
    cutoff: 1800, cutoffRatio: 0.08, cutoffDecay: 2.4, q: 0.9, octave: -6,
  },
  // The water going back out. The filter opens instead of closing, which is
  // the whole difference between a break and a drag.
  undertow: {
    engine: 'noise', colour: 'pink', attack: 0.6, decay: 2.2,
    cutoff: 200, cutoffRatio: 6, cutoffDecay: 1.8, q: 1.2, octave: -6,
  },
  // Foam and shingle: a scatter of very short, very high ticks.
  foam: {
    engine: 'noise', colour: 'white', filter: 'highpass', attack: 0.002, decay: 0.16,
    cutoff: 4200, cutoffRatio: 1.6, cutoffDecay: 0.14, q: 0.7, octave: 6,
  },
  // A gull, a long way off. FM, because a cry has harmonics a filter cannot make.
  gull: {
    engine: 'fm', wave: 'sine', ratio: 1.51, index: 90, indexDecay: 0.35,
    attack: 0.03, decay: 0.9, sweep: 1.7, sweepTime: 0.25,
    vibrato: { rate: 11, depth: 0.03 }, octave: 19,
  },

  // A single crack in a fire: a few milliseconds, and a resonance from the wood.
  crackle: {
    engine: 'noise', colour: 'white', filter: 'bandpass', attack: 0.001, decay: 0.09,
    cutoff: 2600, cutoffRatio: 0.5, cutoffDecay: 0.07, q: 5,
    formant: 1800, formantQ: 9, formantMix: 0.5, octave: 4,
  },
  // A log settling: the low half of the same event.
  logfall: {
    engine: 'noise', colour: 'brown', attack: 0.004, decay: 1.1,
    cutoff: 420, cutoffRatio: 0.2, cutoffDecay: 0.9, q: 2.5, octave: -12,
  },
  // Wind moving through the canopy, with the whistle a formant gives it.
  gust: {
    engine: 'noise', colour: 'pink', attack: 1.1, decay: 3.4,
    cutoff: 900, cutoffRatio: 0.35, cutoffDecay: 3.0, q: 1.4,
    formant: 1400, formantQ: 4, formantMix: 0.35, octave: -4,
  },

  // A frog: a short pulse train, made by a fast vibrato on a low FM voice.
  croak: {
    engine: 'fm', wave: 'sine', ratio: 2.02, index: 140, indexDecay: 0.12,
    attack: 0.008, decay: 0.28, sweep: 0.85, sweepTime: 0.06,
    vibrato: { rate: 34, depth: 0.22 }, octave: -5,
  },
  // Reeds brushing: dry, narrow, brief.
  reed: {
    engine: 'noise', colour: 'white', filter: 'bandpass', attack: 0.02, decay: 0.4,
    cutoff: 3200, cutoffRatio: 0.7, cutoffDecay: 0.35, q: 7, octave: 8,
  },
  // A heron, far across the water. Rare on purpose.
  heron: {
    engine: 'fm', wave: 'sine', ratio: 1.24, index: 210, indexDecay: 0.5,
    attack: 0.02, decay: 1.4, sweep: 1.35, sweepTime: 0.35, octave: 7,
  },
};
