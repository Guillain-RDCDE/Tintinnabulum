// The exhibition and the watch: arithmetic on a clock, a list and a seed, so
// checked here rather than in a browser.
import {
  rng, seedOf, shuffled, wardrobeOf, exhibition, exhibitionAt, roundLength, describeExhibition,
} from '../src/exhibition.js';
import { rowToEvent, offsetInto, seekTo, replaySource, watchedSource } from '../src/sources/replay.js';
import { WORKS } from '../src/works.js';
import { PALETTES, groundBandOf } from '../src/visual/palettes.js';
import { KITS } from '../src/audio/kits.js';

let fails = 0;
const failedNames = [];
const ok = (name, cond, extra = '') => {
  if (!cond) {
    fails++; failedNames.push(name);
    console.log('FAIL  ' + name + (extra ? '  ' + extra : ''));
  } else console.log('ok    ' + name + (extra ? '  ' + extra : ''));
};

// --- the draw -----------------------------------------------------------
{
  const a = rng(42), b = rng(42);
  ok('the same seed draws the same numbers', a() === b() && a() === b());
  ok('and a number in [0,1)', [rng(7)(), rng(7777)()].every((x) => x >= 0 && x < 1));
  ok('a word is a seed', seedOf('venezia') > 0 && seedOf('venezia') === seedOf('venezia') && seedOf('venezia') !== seedOf('venice'));
  ok('a number is itself', seedOf('12345') === 12345);
  const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const s1 = shuffled(list, 3), s2 = shuffled(list, 3), s3 = shuffled(list, 4);
  ok('a shuffle keeps every item', s1.slice().sort((x, y) => x - y).join() === list.join());
  ok('is the same for the same seed', s1.join() === s2.join());
  ok('and different for another', s1.join() !== s3.join());
}

// --- the wardrobe ---------------------------------------------------------
{
  const w = wardrobeOf('glass');
  const band = groundBandOf(WORKS.glass.palette);
  ok('a work\'s wardrobe is every palette on its own ground', w.length > 1 && w.every((p) => groundBandOf(p) === band), `${w.length} palettes, ${band}`);
  ok('and includes its own', w.includes(WORKS.glass.palette));
  ok('an unknown work has no wardrobe', wardrobeOf('no-such-work').length === 0);
}

// --- the exhibition -------------------------------------------------------
{
  const ex = exhibition({ seed: 'venezia', minutes: 4, hold: 3 });
  const n = Object.keys(WORKS).length;
  ok('the whole catalogue hangs by default', ex.works.length === n, String(ex.works.length));
  ok('four minutes a work', ex.minutes === 4);
  ok('one round is the catalogue times the slot', roundLength(ex) === n * 4);
  ok('every kit is in rotation', ex.kits.length === Object.keys(KITS).length);
  ok('minutes are kept between two and ten', exhibition({ minutes: 0.5 }).minutes === 2 && exhibition({ minutes: 99 }).minutes === 10);
  ok('an unknown work is dropped, not hung blank', exhibition({ works: ['glass', 'nothing'] }).works.join() === 'glass');

  const t0 = new Date(2026, 9, 8, 14, 0, 0);
  const now = exhibitionAt(ex, t0);
  ok('something hangs', now && WORKS[now.work] && PALETTES[now.palette] && KITS[now.kit], JSON.stringify(now));
  ok('the palette is from the work\'s wardrobe', wardrobeOf(now.work).includes(now.palette));
  ok('the variation is a number a bench can take', now.variation >= 1 && now.variation <= 9000);
  ok('two screens asked at the same moment agree', JSON.stringify(exhibitionAt(ex, new Date(t0))) === JSON.stringify(now));
  ok('a second screen started an hour earlier agrees too', exhibitionAt(exhibition({ seed: 'venezia', minutes: 4, hold: 3 }), t0).work === now.work);

  // Walk one round: every work once, no repeats.
  const seen = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(t0.getTime() - (now.index - i) * 4 * 60000);
    const at = exhibitionAt(ex, t);
    if (at.round === now.round) seen.push(at.work);
  }
  ok('within a round every work hangs exactly once', new Set(seen).size === seen.length && seen.length === n, `${seen.length} slots, ${new Set(seen).size} works`);

  // The next round is not the same walk.
  const later = new Date(t0.getTime() + roundLength(ex) * 60000);
  const orderNow = [], orderLater = [];
  for (let i = 0; i < 12; i++) {
    orderNow.push(exhibitionAt(ex, new Date(t0.getTime() + i * 4 * 60000)).work);
    orderLater.push(exhibitionAt(ex, new Date(later.getTime() + i * 4 * 60000)).work);
  }
  ok('the next round walks the catalogue another way', orderNow.join() !== orderLater.join());

  // The same work, next round, wears another dress (almost surely over 94 works).
  const again = exhibitionAt(ex, later);
  let differs = 0, same = 0;
  for (let r = 1; r <= 6; r++) {
    const t = new Date(t0.getTime() + r * roundLength(ex) * 60000);
    for (let i = 0; i < n; i++) {
      const at = exhibitionAt(ex, new Date(t.getTime() + i * 4 * 60000));
      if (at.work !== now.work) continue;
      if (at.palette !== now.palette || at.variation !== now.variation) differs++; else same++;
    }
  }
  ok('the same work comes back dressed differently', differs >= 5 && same === 0, `${differs} different, ${same} same`);
  ok('the next round is a different work in that slot (or at least a different dress)', again.work !== now.work || again.palette !== now.palette);

  // The instrument changes more slowly than the picture.
  const kits = [];
  for (let i = 0; i < 12; i++) kits.push(exhibitionAt(ex, new Date(t0.getTime() + (i - now.index % 3) * 4 * 60000)).kit);
  let changes = 0;
  for (let i = 1; i < kits.length; i++) if (kits[i] !== kits[i - 1]) changes++;
  ok('one instrument is held across three works', changes <= 4 && changes >= 2, `${changes} changes in 12 slots: ${kits.join(',')}`);

  ok('the remaining time counts down inside a slot', exhibitionAt(ex, new Date(t0.getTime() + 60000)).remaining < now.remaining);
  ok('the exhibition can be described', /works/.test(describeExhibition(ex)) && /instruments/.test(describeExhibition(ex)));
  ok('a seed changes the walk', exhibitionAt(exhibition({ seed: 'other' }), t0).work !== now.work || exhibitionAt(exhibition({ seed: 'other' }), t0).palette !== now.palette);
}

// --- the recording --------------------------------------------------------
{
  const rec = { started: 0, events: [[0, 'enwiki', 'Bell', 120, 'user'], [1000, 'frwiki', 'Cloche', -30, 'anon'], [2000, 'dewiki', 'Glocke', 5, 'bot']] };
  const ev = rowToEvent(rec.events[1]);
  ok('a row becomes an event', ev.magnitude === 30 && ev.polarity === -1 && ev.label === 'Cloche' && ev.category === 'anon' && ev.url === 'https://fr.wikipedia.org/wiki/Cloche' && ev.replayed === true, JSON.stringify(ev));
  const midnight = new Date(2026, 9, 8, 0, 0, 0);
  ok('at midnight the recording starts at its start', offsetInto(rec, midnight) === 0);
  ok('a recording shorter than the day is laid end to end', offsetInto(rec, new Date(midnight.getTime() + 3500)) === 500);
  ok('seeking lands on the next event and says how long to wait', JSON.stringify(seekTo(rec, 500)) === JSON.stringify({ index: 1, wait: 500 }));
  ok('seeking at an exact time waits nothing', JSON.stringify(seekTo(rec, 1000)) === JSON.stringify({ index: 1, wait: 0 }));

  // Play it on a fake clock.
  const timers = [];
  const src = replaySource(rec, {
    now: () => new Date(midnight.getTime() + 500),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  const got = [];
  src.start((e) => got.push(e.label));
  ok('the first wait is to the next recorded event', timers.length === 1 && timers[0].ms === 500, JSON.stringify(timers.map((t) => t.ms)));
  timers[0].fn(); timers[1].fn(); timers[2].fn(); timers[3].fn();
  ok('it plays in order and goes round', got.join() === 'Cloche,Glocke,Bell,Cloche', got.join());
  ok('with the recorded gaps between', timers.slice(1, 4).map((t) => t.ms).join() === '2000,0,1000', timers.map((t) => t.ms).join());
  src.stop();
  ok('a stopped replay stays stopped', (timers[4].fn(), got.length === 4));
  const fast = replaySource(rec, { rate: 2, now: () => midnight, setTimer: (fn, ms) => { timers.push({ fn, ms }); return 0; }, clearTimer: () => {} });
  const before = timers.length;
  fast.start(() => {});
  timers[before].fn();
  ok('rate 2 halves the waits', timers[before + 1].ms === 500, String(timers[before + 1].ms));
  fast.stop();
}

// --- the watch ------------------------------------------------------------
{
  let clock = 1_000_000;
  const journal = [];
  let liveEmit = null;
  let made = 0;
  const live = () => ({ name: 'live', status: 'open', start(emit) { made++; liveEmit = emit; }, stop() {} });
  let standbyOn = false;
  const standby = { start(emit) { standbyOn = true; this.emit = emit; }, stop() { standbyOn = false; } };
  const w = watchedSource({
    live, standby, quiet: 90_000, retry: 300_000,
    journal: (e) => journal.push(e), now: () => clock,
    setTimer: (fn) => fn, clearTimer: () => {},
  });
  const heard = [];
  w.start((e) => heard.push(e));
  ok('the live source is started first', made === 1 && !w.onStandby);
  liveEmit({ id: 1 });
  clock += 60_000; w.check();
  ok('a minute of silence is nothing', !w.onStandby && made === 1);
  clock += 60_000; w.check();
  ok('ninety seconds of silence brings the recording in and restarts the live source', w.onStandby && standbyOn && made === 2, `standby=${w.onStandby} made=${made}`);
  ok('and the journal says so, with the hour', journal.length === 1 && journal[0].what === 'standby' && journal[0].at === clock, JSON.stringify(journal));
  standby.emit({ id: 'replayed' });
  ok('replayed events reach the wall', heard.length === 2 && heard[1].id === 'replayed');
  clock += 120_000; w.check();
  ok('the live source is not hammered: no second restart inside the retry', made === 2);
  clock += 200_000; w.check();
  ok('after the retry it is restarted again', made === 3 && journal[1].what === 'retry', JSON.stringify(journal[1]));
  liveEmit({ id: 2 });
  ok('the first live event ends the standby', !w.onStandby && !standbyOn && heard.length === 3);
  ok('and the journal records the return', journal[2].what === 'live', JSON.stringify(journal[2]));
  w.stop();
  ok('stopping stops both', !standbyOn && w.status === 'idle');
}

console.log(fails ? `\n${fails} failed: ${failedNames.join(', ')}` : '\nall ok');
process.exit(fails ? 1 : 0);
