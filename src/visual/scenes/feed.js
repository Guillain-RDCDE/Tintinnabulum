// The feed, as a scene sees it: owned by the runtime, not by the scene.
//
// The project's highest rule is that the amount of work a picture does comes
// from the feed. The remedy that worked was a `drive` that rises with every
// arrival and falls back over a second or so, setting the rate the scene's
// world runs at -- and it was written out by hand in two dozen scenes, each
// kicking and decaying its own copy, a few with their own numbers, any of
// which could forget to kick on one path through its event handler.
//
// Now the host -- the live canvas, a card, Create's bench -- keeps one of
// these per running scene, kicks it on every event before the scene hears of
// it, and lets it fall once before every frame. The scene only reads it:
//
//   api.feed.rate(floor)   the rate its world runs at this frame: floor + drive, at most floor + 1
//   api.feed.drive         the drive itself, 0 when long quiet
//   api.feed.quiet         milliseconds of scene time since the last arrival
//   api.feed.ambient(every, fn, quiet)      the hand that works only in silence
//
// How hard an arrival kicks and how long the drive takes to fall are the
// scene's to say, once, in its `feed`: { mode: 'push', kick: 0.3, decay: 1200 }.

/** What a scene's feed does when the scene says nothing. */
export const FEED_DEFAULTS = Object.freeze({ kick: 0.3, ceiling: 1.6, decay: 1200 });

/**
 * One scene's feed.
 *
 * @param {object} [o]   the scene's `feed` declaration
 * @param {number} [o.kick]     how much one arrival adds
 * @param {number} [o.ceiling]  the most the drive can hold
 * @param {number} [o.decay]    milliseconds for a drive of one to fall to nothing
 */
export function makeFeed({ kick = FEED_DEFAULTS.kick, ceiling = FEED_DEFAULTS.ceiling, decay = FEED_DEFAULTS.decay } = {}) {
  let rise = kick;
  let most = ceiling;
  let fall = decay;
  let drive = 0;
  let lastAt = -Infinity;
  let now = 0;
  let hand = 0;
  let step = 16;
  let count = 0;
  return {
    /** An arrival, at scene time `at`. The host calls this before the scene's event. */
    hit(at) {
      drive = Math.min(most, drive + rise);
      lastAt = at;
      now = at;
      count++;
    },
    /** A frame of `dt` scene milliseconds, at scene time `at`. The host calls this before the scene's frame. */
    tick(dt, at) {
      drive = Math.max(0, drive - dt / fall);
      now = at;
      step = dt;
    },
    get drive() {
      return drive;
    },
    /**
     * Say how hard an arrival kicks, from `init`: for a sheet that answers
     * the feed differently from the other sheets of its scene. Only what is
     * given changes.
     */
    configure({ kick: k, ceiling: c, decay: d } = {}) {
      if (Number.isFinite(k) && k > 0) rise = k;
      if (Number.isFinite(c) && c > 0) most = c;
      if (Number.isFinite(d) && d > 0) fall = d;
    },
    /** How many arrivals this scene has heard since it started. */
    get count() {
      return count;
    },
    /** Milliseconds of scene time since the last arrival; Infinity before the first. */
    get quiet() {
      return now - lastAt;
    },
    /** The rate the world runs at: `floor` plus the drive, the drive counted to one at most. */
    rate(floor = 0) {
      return floor + Math.min(1, drive);
    },
    /**
     * The hand that works when nothing arrives, and only then: after `quiet`
     * milliseconds without an arrival, `fn` every `every` milliseconds.
     * Two and a half seconds by default, because a drive takes a second and a
     * quarter to let go, and a hand that started sooner was counted as the
     * feed's own aftermath.
     */
    ambient(every, fn, quietFor = 2500) {
      if (now - lastAt > quietFor) {
        hand += step;
        if (hand > every) {
          hand = 0;
          fn();
        }
      } else {
        hand = 0;
      }
    },
  };
}

/** The feed a scene asked for, from its declaration. */
export function feedFor(scene) {
  const f = (scene && scene.feed) || {};
  return makeFeed({ kick: f.kick, ceiling: f.ceiling, decay: f.decay });
}
