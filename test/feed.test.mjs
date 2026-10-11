// The feed a scene reads (scenes/feed.js), owned by the runtime.
//
// It replaced two dozen copies of the same few lines -- a drive kicked in
// event() and let fall in frame() -- so it is held here to exactly what those
// lines did, and the scenes are held to not writing them again.
import { readFileSync, readdirSync } from 'node:fs';
import { tally } from './harness.mjs';
import { makeFeed, feedFor, FEED_DEFAULTS } from '../src/visual/scenes/feed.js';
import { kick, tempo } from '../src/visual/scenes/shared.js';
import { SCENES } from '../src/visual/scenes/index.js';

const { ok, finish } = tally();

// The runtime's feed against the hand-written drive it replaced, step by step:
// arrivals and frames in an irregular order, the same numbers out.
{
  const f = makeFeed();
  const s = {};
  let worst = 0;
  let now = 0;
  const rnd = ((x) => () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff))(9);
  for (let i = 0; i < 4000; i++) {
    if (rnd() < 0.3) {
      f.hit(now);
      kick(s);
    }
    const dt = 4 + rnd() * 40;
    now += dt;
    f.tick(dt, now);
    const hand = tempo(s, { dt }, 0.05);
    worst = Math.max(worst, Math.abs(f.rate(0.05) - hand), Math.abs(f.drive - s.drive));
  }
  ok('the feed rises and falls exactly as the hand-written drive did', worst < 1e-12, `largest gap ${worst}`);
}
{
  const f = makeFeed();
  f.tick(16, 16);
  ok('a silent feed runs the world at its floor', f.rate(0.04) === 0.04 && f.drive === 0);
  for (let i = 0; i < 10; i++) f.hit(20);
  ok('arrivals lift the drive to its ceiling and no further', Math.abs(f.drive - FEED_DEFAULTS.ceiling) < 1e-9, String(f.drive));
  ok('the rate counts the drive to one at most', Math.abs(f.rate(0.05) - 1.05) < 1e-9);
  f.tick(600, 620);
  ok('and the drive falls over its decay', Math.abs(f.drive - (1.6 - 0.5)) < 1e-9, String(f.drive));
  ok('quiet is the time since the last arrival', f.quiet === 600);
  const slow = makeFeed({ kick: 0.28, decay: 1400 });
  slow.hit(0);
  slow.tick(140, 140);
  ok('a scene can kick softer and let go slower', Math.abs(slow.drive - (0.28 - 0.1)) < 1e-9, String(slow.drive));
  let hands = 0;
  const h = makeFeed();
  h.hit(0);
  for (let t = 16; t < 6000; t += 16) {
    h.tick(16, t);
    h.ambient(500, () => hands++);
  }
  ok('the ambient hand works only after the quiet, then on its beat', hands >= 6 && hands <= 8, `${hands} strokes in 3.5 s of silence`);
  ok('every scene is given the feed it declares', feedFor(SCENES.murmuration).rate(0) === 0 && SCENES.murmuration.feed.kick === 0.28 && SCENES.topo.feed.decay === 1500);
}

// No scene writes the drive by hand again. The drawn-by-hand pen sheets are
// left as they are, pending the owner's review; the shared kick()/tempo()
// helpers are the older form and still allowed.
{
  const dir = new URL('../src/visual/scenes/', import.meta.url);
  const hand = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'drawn.js' || f === 'shared.js' || f === 'feed.js') continue;
    const text = readFileSync(new URL(f, dir), 'utf8');
    for (const m of text.matchAll(/drive = Math\.(min|max)\(/g)) hand.push(`${f}@${text.slice(0, m.index).split('\n').length}`);
  }
  ok('no scene kicks or lets fall a drive of its own by hand', hand.length === 0, hand.join(', ') || 'none');
}

finish('feed checks');
