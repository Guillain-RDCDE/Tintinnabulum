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
};

export const AMBIENCE_NAMES = Object.keys(AMBIENCES);
