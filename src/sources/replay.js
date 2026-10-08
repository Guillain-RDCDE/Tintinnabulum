// A recorded day, played back at its own pace, and the watch that falls
// back on it when the world goes quiet.
//
// A wall in a room outlives its network. The wall already keeps a slow pulse
// of invented events when nothing arrives (project.js), which stops the
// picture reading as a broken screen; but a piece whose whole point is that
// every bell is a person writing cannot run on invented bells for a day. So
// the day is recorded -- real edits, real titles, real sizes, the real
// seconds between them -- and when the live feed falls silent the recording
// takes over from the same time of day, at the same cadence, until the world
// comes back. Nobody in the room sees the join; the journal keeps the hour.
//
// The recording is a plain JSON file: { "started": ms, "events": [[dt, wiki,
// title, delta, category], ...] } with dt in milliseconds since the previous
// event, so a day of two hundred thousand gestures is a few megabytes and
// gzips to a fraction of that. tools/record-day.mjs writes one.

/** Expand the compact rows into events the pipeline understands. */
export function rowToEvent(row, serverFor = (wiki) => `https://${String(wiki).replace(/wiki$/, '')}.wikipedia.org`) {
  const [, wiki, title, delta, category] = row;
  return {
    magnitude: Math.abs(delta),
    polarity: Math.sign(delta),
    id: title,
    label: title,
    url: serverFor(wiki) + '/wiki/' + encodeURIComponent(title),
    category: category || 'user',
    source: wiki,
    replayed: true,
  };
}

/**
 * Where in the recording the clock is now: the recording is laid over the
 * day so that a wall that falls back at four o'clock plays what was recorded
 * at four o'clock, and a recording shorter than a day is laid end to end.
 */
export function offsetInto(recording, date = new Date()) {
  const length = recording.events.reduce((s, r) => s + r[0], 0);
  if (!length) return 0;
  const sinceMidnight = date.getTime() - new Date(date).setHours(0, 0, 0, 0);
  return sinceMidnight % length;
}

/** The index of the first event at or after that offset, and the time to it. */
export function seekTo(recording, offset) {
  let t = 0;
  for (let i = 0; i < recording.events.length; i++) {
    t += recording.events[i][0];
    if (t >= offset) return { index: i, wait: t - offset };
  }
  return { index: 0, wait: 0 };
}

/**
 * A source that plays a recording at its own cadence, from the time of day,
 * round and round.
 *
 * @param {object} recording   { started, events }
 * @param {object} [o]
 * @param {number} [o.rate]    1 is the real cadence; 2 twice as fast
 * @param {() => Date} [o.now]
 * @param {(fn, ms) => any} [o.setTimer]   for the tests
 * @param {(h) => void} [o.clearTimer]
 */
export function replaySource(recording, {
  rate = 1,
  now = () => new Date(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  name = 'replay',
} = {}) {
  let timer = null;
  let running = false;
  let index = 0;
  const events = recording.events || [];
  return {
    name,
    get status() {
      return running ? 'open' : 'idle';
    },
    get length() {
      return events.length;
    },
    start(emit) {
      if (!events.length) return;
      running = true;
      const at = seekTo(recording, offsetInto(recording, now()));
      index = at.index;
      const step = (wait) => {
        timer = setTimer(() => {
          if (!running) return;
          const row = events[index];
          emit(rowToEvent(row));
          index = (index + 1) % events.length;
          step(events[index][0]);
        }, Math.max(0, wait / rate));
      };
      step(at.wait);
    },
    stop() {
      running = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

/**
 * Load a recording from a URL. A `.gz` is inflated in the browser, where the
 * stream API exists; a plain `.json` is read as it is.
 */
export async function loadRecording(url, fetchFn = globalThis.fetch) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`recording: ${res.status} for ${url}`);
  if (/\.gz($|\?)/.test(url) && typeof DecompressionStream === 'function') {
    const inflated = res.body.pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(inflated).text());
  }
  return res.json();
}

/**
 * The watch: a live source, and a recording that stands in for it.
 *
 * The live source is always started. When nothing has arrived from it for
 * `quiet` ms, the recording starts from the time of day and the live source
 * is restarted, in case its connection died without saying so; the moment
 * the live source speaks again the recording stops. Every change of guard is
 * written to the journal with the hour.
 *
 * @param {object} o
 * @param {() => object} o.live       makes the live source (a fresh one each restart)
 * @param {object} [o.standby]        a source to fall back on (replaySource)
 * @param {number} [o.quiet]          ms of silence before the standby starts; 90 s
 * @param {number} [o.retry]          ms between restarts of the live source while quiet; 5 min
 * @param {(entry) => void} [o.journal]
 * @param {() => number} [o.now]
 */
export function watchedSource({
  live,
  standby = null,
  quiet = 90_000,
  retry = 300_000,
  journal = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (h) => clearInterval(h),
}) {
  let current = null;
  let onStandby = false;
  let lastLive = now();
  let lastRestart = now();
  let ticker = null;
  let emitOut = null;
  let restarts = 0;

  function startLive() {
    if (current) {
      try { current.stop(); } catch (e) { /* already dead */ }
    }
    current = live();
    current.start((ev) => {
      lastLive = now();
      if (onStandby) {
        onStandby = false;
        if (standby) standby.stop();
        journal({ at: lastLive, what: 'live', note: 'the world is back' });
      }
      emitOut(ev);
    });
  }

  function check() {
    const silence = now() - lastLive;
    if (silence < quiet) return;
    if (!onStandby) {
      onStandby = true;
      journal({ at: now(), what: 'standby', note: `nothing live for ${Math.round(silence / 1000)} s`, standby: Boolean(standby) });
      if (standby) standby.start((ev) => emitOut(ev));
      lastRestart = now();
      restarts++;
      startLive();
    } else if (now() - lastRestart >= retry) {
      lastRestart = now();
      restarts++;
      journal({ at: now(), what: 'retry', note: `live source restarted (${restarts})` });
      startLive();
    }
  }

  return {
    name: 'watched',
    get status() {
      return onStandby ? 'standby' : current ? current.status : 'idle';
    },
    get onStandby() {
      return onStandby;
    },
    get restarts() {
      return restarts;
    },
    get quietFor() {
      return now() - lastLive;
    },
    check,
    start(emit) {
      emitOut = emit;
      lastLive = now();
      startLive();
      ticker = setTimer(check, Math.max(1000, Math.min(quiet, 10_000)));
    },
    stop() {
      if (ticker !== null) clearTimer(ticker);
      ticker = null;
      if (current) current.stop();
      if (standby) standby.stop();
      current = null;
      onStandby = false;
    },
  };
}
