// Ready-made {add, sub, accent} sets, and the registry behind the picker.

import { SampleInstrument } from './sample-instrument.js';
import { SynthInstrument } from './synth-instrument.js';
import { AMBIENCES } from './ambiences.js';


// Resolved from this module's own location rather than the site root, so the
// sample banks are found wherever the project is mounted -- a local server, a
// GitHub Pages project subpath, or a subdirectory of a larger site.
export const DEFAULT_SOUND_URL = new URL('../../sounds/', import.meta.url).href;

/** The original Hatnote sound: celesta for additions, clavichord for removals. */
export function hatnoteKit({ baseUrl = DEFAULT_SOUND_URL, count = 27 } = {}) {
  const files = [];
  for (let i = 1; i <= count; i++) files.push('c' + String(i).padStart(3, '0'));
  return {
    add: new SampleInstrument({ name: 'celesta', baseUrl: baseUrl + 'celesta/', files, gain: 0.9 }),
    sub: new SampleInstrument({ name: 'clav', baseUrl: baseUrl + 'clav/', files, gain: 0.9 }),
    accent: new SampleInstrument({
      name: 'swell',
      baseUrl: baseUrl + 'swells/',
      files: ['swell1', 'swell2', 'swell3'],
      step: 0, // pick at random rather than by pitch
      gain: 1,
    }),
  };
}

/** Dependency-free equivalent, no audio files at all. */
export function synthKit(opts = {}) {
  return {
    add: new SynthInstrument({ name: 'bell', preset: 'bell', ...opts.add }),
    sub: new SynthInstrument({ name: 'pluck', preset: 'pluck', ...opts.sub }),
    accent: new SynthInstrument({
      name: 'swell',
      preset: 'pad',
      baseFreq: 130.81,
      gain: 0.3,
      ...opts.accent,
    }),
  };
}


/**
 * A recorded animal call: a small bank of one-shots, picked at random.
 *
 * Synthesis is genuinely good at surf, fire and wind -- they are filtered noise
 * and nothing else. It is bad at animals, because a gull is a resonant body
 * with a vocal tract and an FM pair is not. These are field recordings, all in
 * the public domain or CC0; see NOTICE.
 */
function field(name, files, o = {}) {
  return new SampleInstrument({
    name,
    baseUrl: DEFAULT_SOUND_URL + 'field/',
    files,
    step: 0, // unpitched: these are calls, not notes
    jitter: o.jitter ?? 1.6,
    follow: o.follow ?? 0.06,
    gain: o.gain ?? 0.55,
  });
}

/** Shorthand for a kit made of three presets. */
function trio(addP, subP, accentP, o = {}) {
  return () => ({
    // Per-voice gain matters more for the ambiences than for the instruments:
    // a wave and a tick of foam are the same event seen from different
    // distances, and balancing them is most of what makes a place convincing.
    add: new SynthInstrument({ name: addP, preset: addP, baseFreq: o.baseFreq, ...(o.add ? { gain: o.add } : {}) }),
    sub: new SynthInstrument({ name: subP, preset: subP, baseFreq: o.baseFreq, ...(o.sub ? { gain: o.sub } : {}) }),
    accent: new SynthInstrument({
      name: accentP, preset: accentP, baseFreq: 130.81, gain: o.accent ?? 0.3,
    }),
  });
}

/**
 * Named kits for a picker.
 *
 * Twelve of the fifteen are pure synthesis: no audio files, nothing to
 * download, nothing to license, and they work offline. Three carry recordings
 * -- `hatnote`'s celesta, and the animal calls in `shore` and `camargue`. Every
 * recorded file is public domain or CC0, listed in NOTICE.
 */
export const KITS = {
  hatnote: {
    label: 'Bells',
    note: 'The recorded celesta and clavichord. The original sound of the project.',
    make: () => hatnoteKit(),
    sampled: true,
  },
  synth: {
    label: 'Synth bell',
    note: 'An FM bell and a plucked string, generated rather than recorded.',
    make: () => synthKit(),
  },
  water: {
    label: 'Water',
    note: 'Drops in a cavity. The rising pitch is what makes it read as water rather than a beep.',
    make: trio('drop', 'wood', 'well'),
  },
  musicbox: {
    label: 'Music box',
    note: 'Plucked metal tines, bright and short, with a kalimba underneath.',
    make: trio('musicbox', 'kalimba', 'glass'),
  },
  marimba: {
    label: 'Marimba',
    note: 'Tuned wooden bars. Warm, and the least tiring over a long session.',
    make: trio('marimba', 'wood', 'kalimba'),
  },
  gongs: {
    label: 'Gongs',
    note: 'Large and slow, deliberately inharmonic. Best with a sparse feed.',
    make: trio('gong', 'glass', 'gong', { baseFreq: 130.81 }),
  },
  glassy: {
    label: 'Glass',
    note: 'Long, clear and ringing. Turns a busy feed into a wash.',
    make: trio('glass', 'blip', 'pad'),
  },
  chimes: {
    label: 'Wind chimes',
    note: 'Tubes rather than bars, with a long tail. Best on a slow feed.',
    make: trio('chime', 'harp', 'glass'),
  },
  steelpan: {
    label: 'Steel pan',
    note: 'Nearly harmonic partials, so it sings where a gong clangs.',
    make: trio('steelpan', 'wood', 'gong'),
  },
  strings: {
    label: 'Plucked strings',
    note: 'Harp above, deep pizzicato below. The warmest of the set.',
    make: trio('harp', 'bass', 'pad'),
  },
  birds: {
    label: 'Dawn chorus',
    note: 'Chirps and warbles high above the register, with an owl underneath. Busy feeds turn into a hedgerow.',
    make: trio('chirp', 'warble', 'owl'),
  },
  night: {
    label: 'Night',
    note: 'Crickets ticking over a low owl, with the wind for the rare events. Sparse feeds suit it best.',
    make: trio('cricket', 'owl', 'breeze'),
  },

  // --- ambiences ---------------------------------------------------------
  // These carry a `bed` as well as instruments. The bed is continuous and
  // answers how busy the feed is; the instruments answer single events. Both
  // read the same data, which is what makes an ambience a second reading of it
  // rather than a costume over the first.
  shore: {
    label: 'Seashore',
    note: AMBIENCES.shore.note,
    ambience: true,
    bed: 'shore',
    sampled: true,
    make: () => ({
      add: new SynthInstrument({ name: 'wave', preset: 'wave', gain: 0.5 }),
      sub: new SynthInstrument({ name: 'undertow', preset: 'undertow', gain: 0.45 }),
      // A real herring gull, recorded at Carolles. The synthesised one was the
      // worst thing in the project.
      accent: field('gull', ['gull1', 'gull2', 'gull3'], { gain: 0.5 }),
    }),
  },
  fire: {
    label: 'Forest fire',
    note: AMBIENCES.fire.note,
    ambience: true,
    bed: 'fire',
    make: trio('crackle', 'logfall', 'gust', { add: 0.5, sub: 0.6, accent: 0.3 }),
  },
  camargue: {
    label: 'Camargue night',
    note: AMBIENCES.camargue.note,
    ambience: true,
    bed: 'camargue',
    sampled: true,
    make: () => ({
      // Edible frogs -- Pelophylax, the Camargue's own -- and a heron.
      add: field('frog', ['frog1', 'frog2'], { gain: 0.5, jitter: 2.2 }),
      sub: new SynthInstrument({ name: 'reed', preset: 'reed', gain: 0.35 }),
      accent: field('heron', ['heron1', 'heron2'], { gain: 0.45 }),
    }),
  },

  // --- the pieces ----------------------------------------------------------
  // The three above are places. These are compositions: the bed is the piece,
  // and an event adds a voice to it rather than a sound on top of it. That is
  // why every instrument here has an attack measured in seconds.
  cathedral: {
    label: 'Cathedral',
    note: AMBIENCES.cathedral.note,
    ambience: true,
    bed: 'cathedral',
    make: () => ({
      add: new SynthInstrument({ name: 'brass', preset: 'brass', gain: 0.34 }),
      sub: new SynthInstrument({ name: 'sub', preset: 'subdrone', gain: 0.4 }),
      // The one struck thing in the piece, and rare. A cathedral has a bell.
      accent: new SynthInstrument({ name: 'gong', preset: 'gong', gain: 0.3 }),
    }),
  },
  airports: {
    label: 'Airports',
    note: AMBIENCES.airports.note,
    ambience: true,
    bed: 'airports',
    make: () => ({
      add: new SynthInstrument({ name: 'choir', preset: 'choir', gain: 0.26 }),
      sub: new SynthInstrument({ name: 'bowed', preset: 'bowed', gain: 0.22 }),
      // The piano in the original is the only percussive thing in it, and it
      // is what stops the loops becoming wallpaper.
      accent: new SynthInstrument({ name: 'piano', preset: 'musicbox', gain: 0.3 }),
    }),
  },
  glacier: {
    label: 'Glacier',
    note: AMBIENCES.glacier.note,
    ambience: true,
    bed: 'glacier',
    make: () => ({
      add: new SynthInstrument({ name: 'shimmer', preset: 'shimmer', gain: 0.3 }),
      sub: new SynthInstrument({ name: 'sub', preset: 'subdrone', gain: 0.45 }),
      accent: new SynthInstrument({ name: 'crack', preset: 'icecrack', gain: 0.4 }),
    }),
  },
};

export const KIT_NAMES = Object.keys(KITS);

/** Build a kit by name; unknown names fall back to synthesis. */
export function makeKit(name) {
  return (KITS[name] || KITS.synth).make();
}
