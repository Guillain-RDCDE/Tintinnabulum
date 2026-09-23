// A chime of eight rods, struck by one clapper.
//
// The small bamboo chimes -- Koshi, Zaphir and the rest -- are not a scale.
// They are eight steel rods brazed to a plate inside a tube, tuned to one
// chord, with a clapper hanging on a thread that touches two or three of them
// on every swing. Everything that makes them beautiful follows from that:
//
//   - A rod clamped at one end has bending modes at 1 : 6.27 : 17.55 : ...
//     Nothing harmonic, but the upper ones are quiet and die in a moment, so
//     the ear is left holding a clean pitch after a bright first instant.
//   - A rod vibrates in two planes at once, and a brazed joint is never quite
//     symmetric, so the two are a few cents apart. That is the shimmer: two
//     modes beating against each other, about once a second.
//   - It has EIGHT notes. Whatever you ask of it, it answers with one of its
//     eight, which is why a chime cannot play a wrong note and why two of them
//     in the same room never disagree.
//   - One event is one swing of the clapper, not one note. Two or three rods
//     in quick succession, each softer than the last: an arpeggio nobody
//     played.
//
// So this instrument does not take a pitch and render it. It takes the pitch
// the mapper asked for, folds it into its own compass, snaps it to the nearest
// rod, and lets the clapper carry on to the neighbours. The synthesis itself
// is the ordinary modal strike of modal.js -- a body with modes, each dying at
// its own rate -- and because there are only ever eight distinct pitches, the
// strike cache renders each one once and every later swing is a buffer replay.

import { Instrument } from './instrument.js';
import { SynthInstrument } from './synth-instrument.js';

/**
 * The chords. Semitones above the chime's lowest rod, eight to a chime, in the
 * shape these instruments are actually built in: a triad with its octaves, and
 * one added degree that gives each its character.
 *
 * They are named for the four elements because that is what such chimes have
 * always been named for -- earth, water, air, fire -- and because a chord is
 * easier to choose by what it feels like than by its notes. The intervals here
 * were tuned by ear against the engine, not copied from a shop: the workshops
 * publish no note list, and the resellers who do contradict each other.
 */
export const CHORDS = {
  // A major triad, wide and settled: the one to leave running all day.
  earth: [0, 4, 7, 12, 16, 19, 24, 28],
  // A minor seventh over a fourth: moving, unresolved, never sad.
  water: [0, 5, 7, 10, 12, 17, 19, 22],
  // A major ninth, thin and open, with the second high enough to sparkle.
  air: [0, 2, 7, 11, 14, 19, 23, 26],
  // A major sixth with the fifth doubled: bright, and it will not sit still.
  fire: [0, 4, 7, 9, 12, 16, 19, 21],
};

const rand = (a, b) => a + Math.random() * (b - a);

export class ChimeInstrument extends Instrument {
  /**
   * @param {object} o
   * @param {string}   [o.name]
   * @param {number[]} [o.rods]      semitones above the lowest rod, eight of them
   * @param {number}   [o.baseFreq]  the lowest rod, in hertz
   * @param {number}   [o.gain]
   * @param {number}   [o.strikes]   how many rods one swing of the clapper reaches
   * @param {number}   [o.reach]     how far up the chime the clapper carries, in rods
   * @param {number}   [o.falloff]   how much softer each rod after the first
   * @param {number[]} [o.gap]       seconds between rods, low and high
   * @param {number}   [o.detune]    cents of scatter, because rods are hand-tuned
   * @param {string|object} [o.preset]
   */
  constructor({
    name = 'chime', rods = CHORDS.earth, baseFreq = 392, gain = 0.3, preset = 'rod',
    strikes = 3, reach = 3, falloff = 0.62, gap = [0.045, 0.125], detune = 5, ...voice
  } = {}) {
    super(name);
    this.rods = [...rods].sort((a, b) => a - b);
    this.strikes = strikes;
    this.reach = reach;
    this.falloff = falloff;
    this.gap = gap;
    this.detune = detune;
    this.voice = new SynthInstrument({ name: name + '-rod', preset, baseFreq, gain, ...voice });
  }

  async load(ctx) {
    await this.voice.load(ctx);
    return this;
  }

  /** The rod nearest the note asked for, the pitch folded into the chime's compass. */
  nearest(semitone) {
    const lo = this.rods[0];
    const hi = this.rods[this.rods.length - 1];
    let s = semitone;
    // A chime has no register beyond its own. Whatever is asked for comes back
    // inside it, an octave at a time, the way it would on the instrument.
    while (s > hi + 0.5) s -= 12;
    while (s < lo - 0.5) s += 12;
    let best = 0;
    for (let i = 1; i < this.rods.length; i++) {
      if (Math.abs(this.rods[i] - s) < Math.abs(this.rods[best] - s)) best = i;
    }
    return best;
  }

  play(ctx, dest, { semitone = 0, velocity = 1, when = 0 } = {}) {
    const t0 = when || ctx.currentTime;
    const first = this.nearest(semitone);
    // A soft event barely moves the clapper; a large one swings it through
    // three rods. The count is what a listener hears as force, more than
    // loudness is.
    const count = Math.max(1, Math.min(this.strikes, Math.round(1 + velocity * (this.strikes - 1) + rand(-0.3, 0.3))));

    const handles = [];
    let at = t0;
    let index = first;
    let level = Math.max(0.12, velocity);
    for (let i = 0; i < count; i++) {
      // Upwards, mostly: the clapper leaves the rod it struck and meets the
      // next along the ring. Now and then it catches one below instead.
      const cents = rand(-this.detune, this.detune) / 100;
      handles.push(this.voice.play(ctx, dest, {
        semitone: this.rods[index] + cents,
        velocity: level,
        when: at,
      }));
      const step = Math.random() < 0.78 ? 1 + Math.floor(Math.random() * this.reach) : -1;
      index = Math.max(0, Math.min(this.rods.length - 1, index + step));
      at += rand(this.gap[0], this.gap[1]);
      level *= this.falloff;
    }

    const ends = handles.map((h, i) => (h.duration || 0) + (i ? 0.2 * i : 0));
    return {
      duration: Math.max(...ends, 0.2),
      stop(fade = 0.05) {
        for (const h of handles) h.stop(fade);
      },
    };
  }
}

/**
 * A chime as a kit: the same eight rods heard three ways.
 *
 * Nothing here is a different instrument. A small event is the clapper
 * brushing one rod near the top; an ordinary one is a swing through two or
 * three; a rare one is the whole chime turned over in the hand. That is what
 * these objects do, and it means a busy feed and a quiet one sound like the
 * same room rather than like two different sound schemes.
 */
export function chimeKit({ rods = CHORDS.earth, baseFreq = 392, name = 'chime' } = {}) {
  return {
    add: new ChimeInstrument({ name, rods, baseFreq, gain: 0.3, strikes: 3 }),
    sub: new ChimeInstrument({
      name: name + '-brush', rods, baseFreq: baseFreq * 2, gain: 0.17,
      strikes: 2, reach: 2, gap: [0.03, 0.08],
    }),
    accent: new ChimeInstrument({
      name: name + '-turn', rods, baseFreq: baseFreq / 2, gain: 0.26,
      strikes: 6, reach: 4, falloff: 0.82, gap: [0.07, 0.19],
    }),
  };
}
