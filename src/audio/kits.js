// Ready-made {add, sub, accent} sets, and the registry behind the picker.

import { SampleInstrument } from './sample-instrument.js';
import { SynthInstrument } from './synth-instrument.js';
import { AMBIENCES } from './ambiences.js';
import { GranularInstrument } from './granular.js';


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
    note: 'A real plucked string: a burst of noise in a loop that loses its highs, which is what a string does. Where it is plucked along its length decides the whole character.',
    make: trio('harpstring', 'bassstring', 'nylon', { add: 0.45, sub: 0.4, accent: 0.4 }),
  },

  // --- struck bodies -------------------------------------------------------
  handbells: {
    label: 'Handbells',
    note: 'Bells modelled as bodies rather than as timbres: seven partials, each dying at its own rate, with the minor-third tierce that founders have tuned in since the seventeenth century.',
    make: trio('handbell', 'tubular', 'singingbowl', { add: 0.32, sub: 0.28, accent: 0.22 }),
  },
  clay: {
    label: 'Clay and wood',
    note: 'Fired clay and tuned bars. Almost no sustain, which is what tells the ear it is not metal. The quietest kit here, and the one that suits a busy feed.',
    make: trio('claypot', 'bar', 'woody', { add: 0.42, sub: 0.4, accent: 0.42 }),
  },
  aviary: {
    label: 'Aviary',
    note: 'The same recordings, taken apart. Each event scatters nine fifty-millisecond grains of birdsong across the stereo field at slightly different pitches, so a busy feed is a hedgerow rather than a queue of birds.',
    sampled: true,
    make: () => ({
      add: new GranularInstrument({
        name: 'cloud', baseUrl: DEFAULT_SOUND_URL + 'field/',
        files: ['tit1', 'finch1', 'wren1', 'chiff1', 'chiff2'],
        grains: 9, grain: 0.075, spray: 0.5, pitch: 6, follow: 0.35, gain: 0.34,
      }),
      sub: new GranularInstrument({
        name: 'undergrowth', baseUrl: DEFAULT_SOUND_URL + 'field/',
        // Longer grains, pitched down and barely spread: the same material
        // heard as a body rather than as birds.
        files: ['frog1', 'frog2', 'heron1'],
        grains: 5, grain: 0.16, spray: 0.28, pitch: 3, follow: 0.2, gain: 0.3,
      }),
      accent: field('gull', ['gull1', 'gull2', 'gull3'], { gain: 0.42 }),
    }),
  },
  koto: {
    label: 'Koto',
    note: 'Plucked near the bridge, so thin and bright, over a low string plucked in the middle. The body under them is a resonance, not a filter sweep.',
    make: trio('koto', 'bassstring', 'harpstring', { add: 0.4, sub: 0.38, accent: 0.36 }),
  },
  birds: {
    label: 'Dawn chorus',
    note: 'Real birds: a great tit and a chaffinch on the events, a chiffchaff on the small ones, an owl for the rare ones. Busy feeds turn into a hedgerow.',
    sampled: true,
    make: () => ({
      // Recorded, not synthesised. The FM version of a songbird was the worst
      // sound in the project after the synthesised gull: birdsong is a syrinx
      // -- two independent sound sources in one throat -- and a pair of
      // oscillators is not going to get there.
      add: field('songbird', ['tit1', 'finch1', 'wren1'], { gain: 0.42, jitter: 1.8 }),
      sub: field('warbler', ['chiff1', 'chiff2'], { gain: 0.32, jitter: 2.4 }),
      // Still synthesised, and not for want of looking: Wikimedia Commons has
      // no owl call under CC0 or public domain. Everything there is CC BY-SA,
      // whose share-alike term would attach to any adaptation.
      accent: new SynthInstrument({ name: 'owl', preset: 'owl', gain: 0.3 }),
    }),
  },
  night: {
    label: 'Night',
    note: 'Crickets ticking over a low owl, with the wind for the rare events. Sparse feeds suit it best.',
    // Synthesised throughout, and the two reasons are different. Crickets and
    // owls have no free recording to be had. Wind genuinely is filtered noise,
    // so synthesis is not a compromise for it at all.
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
