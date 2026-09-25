import { VoicePool } from '../core/voices.js';
import { unitPosition } from '../core/event.js';
import { Bed } from './bed.js';
import { AMBIENCES } from './ambiences.js';

// Turns mapped events into sound. Instrument choice is: category override
// first, then polarity. Accents bypass the voice pool entirely, because a rare
// notable event should never be dropped by a burst of ordinary ones.
//
// A note also comes from somewhere. An event's mark is placed by its identity,
// and the sound is placed the same way, so what you hear is where you are
// looking -- which is the difference between a picture with music over it and
// a room with something happening in it.

/** Positions across the room. Nine is finer than the ear places a bell. */
const PAN_SLOTS = 9;

export class AudioSink {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.pool = opts.pool || new VoicePool();
    this.kit = opts.kit || {}; // { add, sub, neutral, accent }
    this.byCategory = opts.byCategory || {}; // { bot: Instrument, ... }
    this.enabled = opts.enabled !== false;
    // bpm 0 means free time: notes sound the instant their event arrives.
    this.tempo = { bpm: 0, division: 8, ...(opts.tempo || {}) };
    // The shortest gap allowed between two notes, in milliseconds. See
    // setRestraint. 0 restores the old behaviour of sounding everything.
    this.minGap = opts.minGap ?? 0;
    this._pending = null;
    this._timer = null;
    // An ambience's continuous layer. Null for every ordinary kit, which is
    // most of them, so nothing here costs anything unless one is chosen.
    this.bed = null;
    this._lastAt = 0;
    // Accents bypass the voice pool, so that a burst of ordinary events can
    // never bury a notable one. They still need a ceiling of their own: with
    // none, a source that marks everything notable started a note per event,
    // every one of them ringing out its full decay. Two and a half thousand in
    // a second grew the audio graph until the tab crashed, which is also what
    // saturating the speakers sounds like. So one accent per gap, and the
    // others in that gap still take their ordinary turn through the pool.
    this.accentGap = opts.accentGap ?? 250;
    this._accentAt = -Infinity;
    this._now = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    // How wide the sound is laid across the room: 0 puts every note in the
    // middle, 1 puts the leftmost event hard left. An event already has a
    // place on the picture -- the same place, from the same identity -- and
    // giving the sound that place is what ties the two together: on a wall,
    // what you hear is where you are looking. See _panFor.
    this.spread = opts.spread ?? 0.7;
    this._pans = null;
    this.stats = { played: 0, dropped: 0, passedOver: 0, accentsHeld: 0 };
  }

  /**
   * Snap note onsets to a tempo grid.
   *
   * Events arrive whenever the world produces them, which is by definition
   * arrhythmic. Holding each note until the next subdivision turns the same
   * stream into something metrical -- the single biggest change available to
   * how musical this sounds. A note waits at most one subdivision, so at a
   * slow tempo the picture leads the sound slightly; that is the trade.
   */
  setTempo(bpm, division = this.tempo.division) {
    this.tempo = { bpm: Math.max(0, Number(bpm) || 0), division: Number(division) || 8 };
    return this;
  }

  _onset(ctx) {
    const { bpm, division } = this.tempo;
    if (!bpm) return 0; // 0 tells the instrument to start immediately
    const step = (60 / bpm) * (4 / division);
    // The small guard keeps us from ever scheduling a beat already gone by.
    return Math.ceil((ctx.currentTime + 0.004) / step) * step;
  }

  /**
   * The shortest gap allowed between two notes, in milliseconds.
   *
   * This is the difference between hearing a data stream and hearing music
   * made of one. Listen to Wikipedia is disarming largely because it is
   * sparse: Wikipedia produces a couple of edits a second, each note is a
   * celesta with a two-second decay, and the space between them is filled by
   * resonance rather than by more notes. Point the same engine at a feed
   * running at thirty a second and there is no space left -- every note is
   * masked by the next, and the result is a texture, not a rhythm.
   *
   * A rate cap alone does not fix that. The voice pool has one, and because it
   * spends a token on whichever event happens to arrive while a token is free,
   * what comes out is an arbitrary sample of the stream at a constant rate --
   * which is precisely what a wash of undifferentiated noise sounds like.
   *
   * So this does not thin the stream, it *chooses* from it. Events arriving
   * inside a gap are held, and when the gap elapses the most significant one
   * of them sounds; the rest are passed over. The peaks survive, the filler
   * does not, and the rhythm becomes the shape of the data rather than the
   * shape of the network.
   *
   * The cost is latency: a note can wait up to one gap. The visuals are not
   * gated, so at a long gap the picture leads the sound. That is the trade,
   * and it is the same one setTempo makes.
   */
  setRestraint(ms) {
    this.minGap = Math.max(0, Math.min(10000, Number(ms) || 0));
    if (!this.minGap) this._flushNow();
    return this;
  }

  /** Release any held note and stop waiting. Safe to call at any time. */
  _flushNow() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const held = this._pending;
    this._pending = null;
    if (held) this._play(held);
  }

  /** Drop anything held without sounding it. For stopping cleanly. */
  clearPending() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._pending = null;
    return this;
  }

  stop() {
    return this.clearPending();
  }

  setKit(kit) {
    this.kit = kit;
    return this;
  }

  /**
   * Give this sink an ambience's bed, or take the current one away.
   *
   * The bed belongs to the kit, so it is swapped with it: choosing Bells after
   * Seashore must silence the sea, and choosing Seashore twice must not start
   * two of them.
   */
  setBed(name) {
    // A sink that has been switched off plays nothing, a bed included:
    // otherwise connecting a feed while the sink is silenced started the sea
    // under whatever else was playing.
    if (!this.enabled) name = null;
    if (this.bed && this.bed.name === name) return this;
    if (this.bed) {
      this.bed.stop();
      this.bed = null;
    }
    const spec = name && AMBIENCES[name];
    if (!spec) return this;
    this.bed = new Bed(spec);
    try {
      this.bed.start(this.engine.ctx, this.engine.destination);
    } catch (e) {
      console.warn('bed failed to start', e);
      this.bed = null;
    }
    return this;
  }

  /**
   * Loads a kit and only then makes it the active one.
   *
   * Assigning first leaves a window -- seconds, on a phone -- in which the new
   * instruments have no buffers yet, so every note is silently dropped. The
   * outgoing kit keeps playing until the new one can actually sound, and an
   * unusable kit is not swapped in at all.
   */
  async loadKit(kit) {
    const ctx = this.engine.ctx;
    const list = [...new Set(Object.values(kit).filter(Boolean))];
    const problems = [];
    await Promise.all(
      list.map(async (i) => {
        try {
          await i.load(ctx);
        } catch (e) {
          problems.push(`${i.name}: ${e.message}`);
        }
        if (i.failures && i.failures.length) {
          problems.push(`${i.name}: ${i.failures.length} sample(s) unavailable`);
        }
      })
    );
    const playable = list.filter((i) => i.ready !== false);
    const status = {
      ok: playable.length === list.length && problems.length === 0,
      usable: playable.length > 0,
      instruments: list.length,
      playable: playable.length,
      problems,
    };
    if (status.usable) {
      this.kit = kit;
      this.status = status;
    }
    return status;
  }

  /** Every distinct instrument currently reachable. */
  instruments() {
    const seen = new Set();
    for (const src of [this.kit, this.byCategory]) {
      for (const k of Object.keys(src || {})) {
        if (src[k]) seen.add(src[k]);
      }
    }
    return [...seen];
  }

  /**
   * Loads every instrument, tolerating failures, and reports what happened.
   * A kit that cannot load must say so: failing silently here is how a page
   * ends up drawing circles and playing nothing.
   */
  async load() {
    const ctx = this.engine.ctx;
    const list = this.instruments();
    const problems = [];
    await Promise.all(
      list.map(async (i) => {
        try {
          await i.load(ctx);
        } catch (e) {
          problems.push(`${i.name}: ${e.message}`);
        }
        if (i.failures && i.failures.length) {
          problems.push(`${i.name}: ${i.failures.length} sample(s) unavailable`);
        }
      })
    );
    const playable = list.filter((i) => i.ready !== false);
    this.status = {
      ok: playable.length === list.length && problems.length === 0,
      usable: playable.length > 0,
      instruments: list.length,
      playable: playable.length,
      problems,
    };
    return this.status;
  }

  pick(ev) {
    if (this.byCategory[ev.category]) return this.byCategory[ev.category];
    if (ev.polarity < 0) return this.kit.sub || this.kit.add;
    if (ev.polarity > 0) return this.kit.add;
    return this.kit.neutral || this.kit.add;
  }

  handle(ev) {
    if (!this.enabled || ev.dimmed || !ev.map) return false;
    // The bed is told about every event, even one that will not be sounded.
    // It measures how busy the world is, and a note dropped by restraint or by
    // voice stealing still happened.
    if (this.bed) this.bed.observe(ev.ts || Date.now());
    if (!this.minGap) return this._play(ev);

    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // The first note after a silence sounds at once. Making it wait would put
    // a gap of latency on the very first thing anyone hears, for no gain:
    // there is nothing yet to space it away from.
    if (!this._timer && t - this._lastAt >= this.minGap) {
      this._lastAt = t;
      return this._play(ev);
    }

    // Otherwise hold it, keeping whichever of the window's events matters
    // most. Salience is the mapper's percentile, so this keeps the peaks.
    if (!this._pending || this._weight(ev) >= this._weight(this._pending)) {
      if (this._pending) this.stats.passedOver++;
      this._pending = ev;
    } else {
      this.stats.passedOver++;
    }

    if (!this._timer) {
      const wait = Math.max(0, this.minGap - (t - this._lastAt));
      this._timer = setTimeout(() => {
        this._timer = null;
        const held = this._pending;
        this._pending = null;
        if (held) {
          this._lastAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
          this._play(held);
        }
      }, wait);
    }
    return false;
  }

  /**
   * What an event is worth when only one of several may sound.
   *
   * Salience is the mapper's percentile. An accent outranks all of it: the
   * whole point of marking an event notable is that a burst of ordinary ones
   * must not bury it, and a selection window is exactly such a burst.
   */
  _weight(ev) {
    return (ev.accent ? 2 : 0) + (ev.map ? ev.map.salience : 0);
  }

  /**
   * How wide the sound sits in the room.
   *
   * @param {number} spread 0 (all in the middle) to 1 (the full width)
   */
  setSpread(spread) {
    this.spread = Math.max(0, Math.min(1, Number(spread) || 0));
    if (this._pans) {
      for (let i = 0; i < this._pans.length; i++) {
        this._pans[i].pan.value = this._panPosition(i);
      }
    }
    return this;
  }

  /** Where slot `i` of the bank sits, from left to right, at this spread. */
  _panPosition(i) {
    const steps = PAN_SLOTS - 1;
    return ((i / steps) * 2 - 1) * this.spread;
  }

  /**
   * Where an event's sound comes from: the place its mark takes on the
   * picture, which is drawn from its identity and so is the same in both.
   *
   * A bank of fixed positions rather than a panner per note. A note is a few
   * hundred milliseconds and a busy feed is thirty a second, so a node per
   * event is a thousand nodes a minute to build, connect and collect -- for a
   * difference nobody can hear, since the ear cannot place a bell to within a
   * ninth of the room anyway.
   */
  _panFor(ev) {
    const ctx = this.engine.ctx;
    if (!this.spread || typeof ctx.createStereoPanner !== 'function') return this.engine.destination;
    // Built once, and again if the engine ever hands out a different context
    // (an offline render, a context that had to be replaced after a stall).
    if (!this._pans || this._panCtx !== ctx) {
      this._panCtx = ctx;
      this._pans = [];
      for (let i = 0; i < PAN_SLOTS; i++) {
        const node = ctx.createStereoPanner();
        node.pan.value = this._panPosition(i);
        node.connect(this.engine.destination);
        this._pans.push(node);
      }
    }
    const { u } = unitPosition(String(ev.id ?? ''));
    return this._pans[Math.max(0, Math.min(PAN_SLOTS - 1, Math.round(u * (PAN_SLOTS - 1))))];
  }

  _play(ev) {
    const ctx = this.engine.ctx;
    const dest = this._panFor(ev);

    const when = this._onset(ctx);

    if (ev.accent && this.kit.accent) {
      const now = this._now();
      if (now - this._accentAt >= this.accentGap) {
        this._accentAt = now;
        try {
          this.kit.accent.play(ctx, dest, { semitone: ev.map.semitone, velocity: 1, when });
        } catch (e) {
          console.warn('accent failed', e);
        }
      } else {
        this.stats.accentsHeld++;
      }
    }

    const inst = this.pick(ev);
    if (!inst) return false;

    const slot = this.pool.request(ev.map.salience);
    if (!slot) {
      this.stats.dropped++;
      return false;
    }

    let voice = null;
    try {
      voice = inst.play(ctx, dest, {
        semitone: ev.map.semitone,
        velocity: ev.map.velocity,
        when,
      });
    } catch (e) {
      console.warn('instrument failed', e);
    }

    if (!voice) {
      slot.release();
      this.stats.dropped++;
      return false;
    }

    slot.attach(voice.stop, voice.duration);
    this.stats.played++;
    return true;
  }
}
