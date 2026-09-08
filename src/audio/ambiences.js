// Places, described as layers.
//
// An ambience is a bed plus a set of detail voices. The bed is continuous and
// answers how busy the feed is; the voices answer individual events. Both read
// the same data, which is the point: you hear the shape of the whole stream
// and the single thing inside it at once.
//
// Every number here was chosen by listening. The comments say what each layer
// is for, because a table of frequencies is otherwise unreadable and nobody
// will dare change it.

export const AMBIENCES = {
  shore: {
    name: 'shore',
    label: 'Seashore',
    note: 'A swell that rises with the feed, waves that break on the large events and foam on the small ones. A gull, rarely.',
    // A calm feed is a distant sea; a dozen a second is a sea getting up.
    busyAt: 6,
    layers: [
      {
        // The body of the water. Brown noise, heavily filtered: this is the
        // sound you feel rather than hear.
        colour: 'brown', filter: 'lowpass', q: 0.7,
        gain: [0.05, 0.16], cutoff: [180, 420], ease: 6,
        swell: { rate: 0.055, depth: 90, target: 'cutoff' },
      },
      {
        // The surface: hiss, and the breathing that makes it a shore rather
        // than a hiss. The two swell rates are deliberately not a ratio of one
        // another, so the combination never repeats.
        colour: 'pink', filter: 'lowpass', q: 0.9,
        gain: [0.018, 0.075], cutoff: [700, 2600], ease: 5,
        swell: { rate: 0.083, depth: 0.014, target: 'gain' },
      },
    ],
  },

  fire: {
    name: 'fire',
    label: 'Forest fire',
    note: 'A rumble that grows with the feed, cracks on every event and a log giving way on the large ones. Wind moves through the tops.',
    busyAt: 10,
    layers: [
      {
        // The roar. Almost entirely below where a phone speaker reaches, which
        // is fine: on anything else it is what makes the fire large.
        colour: 'brown', filter: 'lowpass', q: 1.1,
        gain: [0.04, 0.2], cutoff: [110, 340], ease: 3,
        swell: { rate: 0.11, depth: 40, target: 'cutoff' },
      },
      {
        // Air being pulled in. Rises sharply with density, which is what makes
        // a busy feed sound like a fire taking hold.
        colour: 'pink', filter: 'bandpass', q: 1.6,
        gain: [0.01, 0.09], cutoff: [500, 2000], ease: 2.5,
        swell: { rate: 0.19, depth: 0.01, target: 'gain' },
      },
    ],
  },

  camargue: {
    name: 'camargue',
    label: 'Camargue night',
    note: 'Crickets, a low warmth off the marsh, frogs on the events and reeds on the small ones. A heron calls, once in a long while.',
    // A night is quiet by definition: it takes very little to fill it.
    busyAt: 3,
    layers: [
      {
        // The warmth left in the ground. A drone rather than noise, low enough
        // to sit under everything without being a note anyone hears as pitch.
        tone: 58, wave: 'sine', detune: 9, filter: 'lowpass', q: 0.8,
        gain: [0.026, 0.055], cutoff: [200, 320], ease: 8,
        swell: { rate: 0.037, depth: 0.008, target: 'gain' },
      },
      {
        // The crickets: a narrow high band, breathing. Real crickets fall
        // silent in waves and start again, which the slow gain swell imitates
        // more convincingly than any per-insect trigger would.
        colour: 'white', filter: 'bandpass', q: 9,
        gain: [0.008, 0.085], cutoff: [4000, 6200], ease: 5,
        swell: { rate: 0.071, depth: 0.011, target: 'gain' },
      },
      {
        // Air over the water. Barely there, and the thing you would miss.
        colour: 'pink', filter: 'lowpass', q: 0.6,
        gain: [0.012, 0.03], cutoff: [300, 700], ease: 7,
        swell: { rate: 0.043, depth: 60, target: 'cutoff' },
      },
    ],
  },

  // --- the three that are pieces rather than places -----------------------
  //
  // The first three ambiences are somewhere you could stand. These are not:
  // they are ways of building music out of a rate, and the feed is the
  // performer. Nothing in them is triggered, nothing is sequenced, and neither
  // was the music they come from.

  cathedral: {
    name: 'cathedral',
    label: 'Cathedral',
    note: 'A wall of low brass that grows with the feed. Nothing here is a note anyone played: a stack of six partials over a low root, and a filter that opens as the world gets busy.',
    // A slow feed should already be enormous. This is not a rate meter.
    busyAt: 4,
    layers: [
      {
        // The wall. Sawtooth partials over E1, run through a filter low enough
        // that at rest you hear the fundamental and almost nothing else -- the
        // crescendo is the filter opening, which is how a real brass section
        // gets louder, and it is why turning up a gain never sounds the same.
        tone: 41.2, wave: 'sawtooth', detune: 6, filter: 'lowpass', q: 1.4,
        stack: [
          { mul: 0.5, gain: 0.85 },                    // the octave below, felt
          { mul: 1, gain: 1 },
          { mul: 1.5, gain: 0.42 },                    // the fifth: the weight
          { mul: 2, gain: 0.55 },
          { mul: 3, gain: 0.2 },
          { mul: 4, gain: 0.13, wave: 'triangle' },    // air at the top
        ],
        gain: [0.05, 0.15], cutoff: [95, 780], ease: 7,
        swells: [
          { rate: 0.021, depth: 120, target: 'cutoff', shape: 'swell', attack: 0.3, release: 0.6 },
          { rate: 0.013, depth: 0.012, target: 'gain' },
        ],
      },
      {
        // The room. Every cathedral recording is mostly the building, and a
        // filtered noise floor is what a building sounds like.
        colour: 'brown', filter: 'lowpass', q: 0.6,
        gain: [0.012, 0.05], cutoff: [140, 520], ease: 9,
        swells: [{ rate: 0.029, depth: 60, target: 'cutoff' }],
      },
      {
        // A fifth above, two octaves up, entering only when it is busy. This
        // is the layer that turns a drone into a chord, and it is deliberately
        // the last thing to arrive.
        tone: 123.5, wave: 'sawtooth', detune: 11, filter: 'lowpass', q: 2.2,
        stack: [{ mul: 1, gain: 1 }, { mul: 2, gain: 0.3 }],
        gain: [0.0, 0.042], cutoff: [300, 1400], ease: 6,
        swells: [{ rate: 0.017, depth: 0.014, target: 'gain', shape: 'swell', attack: 0.2, release: 0.55 }],
      },
    ],
  },

  airports: {
    name: 'airports',
    label: 'Airports',
    note: 'Five held notes on loops of different lengths, after the tape pieces of 1978. They drift apart and come back over hours, so what you hear has almost certainly not been heard before.',
    busyAt: 5,
    // A-flat major, spread over three octaves and voiced wide, because close
    // voicing in this register turns to mud. The loop lengths are the point:
    // no two share a factor, so the combination has a period of hours.
    layers: [
      {
        tone: 51.91, wave: 'triangle', detune: 5, filter: 'lowpass', q: 0.8,   // Ab1
        stack: [{ mul: 1, gain: 1 }, { mul: 2, gain: 0.35 }],
        gain: [0.03, 0.052], cutoff: [220, 460], ease: 8, offset: 0,
        swells: [{ rate: 1 / 17.3, depth: 0.026, target: 'gain', shape: 'swell', attack: 0.1, release: 0.5 }],
      },
      {
        tone: 103.83, wave: 'triangle', detune: 7, filter: 'lowpass', q: 1,     // Ab2
        stack: [{ mul: 1, gain: 1 }, { mul: 3, gain: 0.12 }],
        gain: [0.022, 0.04], cutoff: [340, 720], ease: 8, offset: 3.1,
        swells: [{ rate: 1 / 20.9, depth: 0.02, target: 'gain', shape: 'swell', attack: 0.12, release: 0.48 }],
      },
      {
        tone: 155.56, wave: 'sine', detune: 9, filter: 'lowpass', q: 1,         // Eb3
        stack: [{ mul: 1, gain: 1 }, { mul: 2, gain: 0.22 }],
        gain: [0.018, 0.034], cutoff: [500, 1100], ease: 8, offset: 6.7,
        swells: [{ rate: 1 / 25.1, depth: 0.017, target: 'gain', shape: 'swell', attack: 0.14, release: 0.46 }],
      },
      {
        tone: 207.65, wave: 'sine', detune: 11, filter: 'lowpass', q: 1,        // Ab3
        stack: [{ mul: 1, gain: 1 }],
        gain: [0.014, 0.028], cutoff: [700, 1600], ease: 8, offset: 11.3,
        swells: [{ rate: 1 / 31.7, depth: 0.014, target: 'gain', shape: 'swell', attack: 0.16, release: 0.44 }],
      },
      {
        tone: 261.63, wave: 'sine', detune: 13, filter: 'lowpass', q: 1,        // C4
        stack: [{ mul: 1, gain: 1 }],
        // Enters only on a busy feed: the top of the chord is the thing you
        // notice, so it is what the data is allowed to add.
        gain: [0.004, 0.024], cutoff: [900, 2000], ease: 7, offset: 15.9,
        swells: [{ rate: 1 / 37.3, depth: 0.012, target: 'gain', shape: 'swell', attack: 0.1, release: 0.52 }],
      },
      {
        // Tape hiss. Every one of those loops was quarter-inch tape, and
        // without this the piece sounds like a synthesiser pretending.
        colour: 'pink', filter: 'lowpass', q: 0.5,
        gain: [0.006, 0.012], cutoff: [2000, 5000], ease: 10,
        swells: [{ rate: 0.011, depth: 0.003, target: 'gain' }],
      },
    ],
  },

  glacier: {
    name: 'glacier',
    label: 'Glacier',
    note: 'Something enormous, very slow, and mostly below hearing. A sub that you feel rather than hear, ice singing three octaves above it, and nothing in between.',
    busyAt: 3,
    layers: [
      {
        // The mass. Thirty-two hertz is at the bottom of what a speaker will
        // give you and under what a laptop will give you at all -- which is
        // honest: a glacier is not audible either, until it moves.
        tone: 32.7, wave: 'sine', detune: 4, filter: 'lowpass', q: 0.7,
        stack: [{ mul: 1, gain: 1 }, { mul: 2, gain: 0.45 }, { mul: 3, gain: 0.1 }],
        gain: [0.048, 0.105], cutoff: [70, 240], ease: 10,
        swells: [{ rate: 0.009, depth: 40, target: 'cutoff' }],
      },
      {
        // Ice singing: a narrow, high, wandering band. Real glacier recordings
        // are full of this, and it is the only thing in the piece with pitch
        // you could hum.
        // Measured, not guessed: at the first balance this band was forty
        // times quieter than the sub, so the piece promised ice singing and
        // delivered a rumble. A bandpass at Q16 throws away nearly all of the
        // noise it is given, which is what the gain here is paying for.
        colour: 'white', filter: 'bandpass', q: 16,
        gain: [0.02, 0.115], cutoff: [1800, 3400], ease: 6,
        swells: [
          { rate: 0.023, depth: 700, target: 'cutoff' },
          { rate: 0.0071, depth: 0.008, target: 'gain', shape: 'swell', attack: 0.2, release: 0.5 },
        ],
      },
      {
        // The pressure underneath, felt as movement in the noise floor rather
        // than heard. Deliberately nothing between 240 Hz and 1.8 kHz: the gap
        // is what makes the two ends sound far apart.
        colour: 'brown', filter: 'lowpass', q: 0.5,
        gain: [0.02, 0.06], cutoff: [90, 200], ease: 12,
        swells: [{ rate: 0.0053, depth: 30, target: 'cutoff' }],
      },
    ],
  },
};

export const AMBIENCE_NAMES = Object.keys(AMBIENCES);
