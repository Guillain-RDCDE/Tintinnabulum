// Does the picture follow the feed, or does it run by itself?
//
// This is the one question the whole project rests on. Every scene is allowed
// motion of its own -- a lantern rises, a flock turns, paint dries -- and none
// of that is a fault. What IS a fault is a picture that puts down as much new
// work in a silent minute as in a busy one, because then the feed is not
// driving anything and the sound and the image are two unrelated performances
// that happen to share a window.
//
// So the measurement is comparative, never absolute:
//
//   quiet   how much the canvas changes over a second with nothing arriving
//   busy    how much it changes over the same second with events arriving
//
// and what matters is `busy / quiet`. A scene at 1.0 is deaf. A scene at 3 or
// more is plainly answering. Scenes that draw continuous motion sit lower than
// scenes that strike marks, which is expected and is why the report prints the
// raw numbers beside the ratio rather than a pass mark.
//
//   node tools/follows-the-feed.mjs                  every scene
//   node tools/follows-the-feed.mjs comb hatched     only these
//   node tools/follows-the-feed.mjs --worst 20       the twenty deafest

import { startServer, launch } from './render.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const only = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
const WORST = Number(flag('worst', 0));
const port = Number(flag('port', 8931));

const { srv, base } = await startServer(port);
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/feed-harness.html', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<style>html,body{margin:0}canvas{display:block}</style><canvas id="c"></canvas>' })
  );
  await page.goto(base + '/feed-harness.html');

  const rows = await page.evaluate(async (opt) => {
    const { CanvasSink, SCENE_NAMES } = await import('/src/index.js');
    // Events are built the way the engine builds them -- normalised, then
    // given a mapping -- and not by hand. A hand-made event is missing the
    // fields the renderer derives a radius from, every scene throws on the
    // first frame, and the audit then reports that nothing moves for any
    // reason at all, which is the most convincing wrong answer available.
    const { Mapper } = await import('/src/core/mapper.js');
    const { normalize } = await import('/src/core/event.js');
    const mapper = new Mapper({ mode: 'adaptive' });
    const cv = document.getElementById('c');
    cv.style.width = '900px';
    cv.style.height = '620px';
    const ctx = cv.getContext('2d', { willReadFrequently: true });

    const snap = () => ctx.getImageData(0, 0, cv.width, cv.height).data.slice();
    /** How many sampled pixels differ, of those sampled. */
    const moved = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4 * 11) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 20) n++;
      }
      return n;
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const names = opt.only.length ? opt.only : SCENE_NAMES;
    const out = [];
    for (const name of names) {
      const sink = new CanvasSink(cv, { palette: 'marine', scene: name, showHud: false, showLabels: false });
      sink.start();
      let n = 0;
      const feed = (count) => {
        for (let i = 0; i < count; i++) {
          const magnitude = Math.round(Math.exp(Math.random() * 8)) + 1;
          const ev = normalize({
            id: `${name}-${n++}`,
            magnitude,
            category: ['user', 'anon', 'bot', 'alert'][n % 4],
            label: 'audit',
            ts: Date.now(),
          });
          ev.map = mapper.map(magnitude);
          sink.handle(ev);
        }
      };
      // Something on the canvas to begin with, so the quiet reading is of a
      // picture at rest rather than of a picture being born.
      feed(40);
      await wait(2200);

      // Quiet: a full second with nothing arriving.
      const q0 = snap();
      await wait(1000);
      const quiet = moved(q0, snap());

      // Busy: the same second, with events.
      const b0 = snap();
      const started = performance.now();
      while (performance.now() - started < 1000) {
        feed(2);
        await wait(90);
      }
      const busy = moved(b0, snap());

      // The jolt: a quarter second either side of a burst.
      //
      // The second-long comparison above cannot tell a scene that ignores the
      // feed from one that simulates something continuously -- a reaction
      // grid or a flock repaints most of the canvas every frame whatever
      // arrives, and drowns its own answer in its own motion. Over a quarter
      // of a second the drift is small and a mark that has just been struck
      // is not, so this separates the two. A scene that answers at all shows
      // it here.
      await wait(700);
      const d0 = snap();
      await wait(250);
      const drift = moved(d0, snap());
      const j0 = snap();
      feed(25);
      await wait(250);
      const jolt = moved(j0, snap());
      sink.stop();
      out.push({ name, quiet, busy, drift, jolt });
    }
    return out;
  }, { only });

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));

  const scored = rows.map((r) => ({
    ...r,
    // A floor, so a wholly still picture does not divide by nothing.
    share: (r.busy + 4) / (r.quiet + 4),
    answer: (r.jolt + 4) / (r.drift + 4),
  }));
  scored.sort((a, b) => a.answer - b.answer);
  const shown = WORST ? scored.slice(0, WORST) : scored;
  console.log('scene             quiet     busy   share    drift     jolt   answer');
  for (const r of shown) {
    const mark = r.answer < 1.3 ? '  <- deaf' : r.answer < 2 ? '  <- faint' : '';
    console.log(
      `${r.name.padEnd(16)} ${String(r.quiet).padStart(6)} ${String(r.busy).padStart(8)}` +
      `  ${r.share.toFixed(2).padStart(5)}  ${String(r.drift).padStart(7)} ${String(r.jolt).padStart(8)}` +
      `  ${r.answer.toFixed(2).padStart(6)}${mark}`
    );
  }
  // Deaf on both readings, not on either.
  //
  // A scene can fail one of them honestly. "Fields" fades a new rectangle in
  // over several seconds, so a quarter second after a burst holds nothing and
  // its answer reads 1.0 -- and yet it changes nothing at all when nothing
  // arrives, so its share is in the thousands. The reverse happens too: a
  // scene that repaints its whole ground every frame buries its share and
  // still shows a burst at once. Only a scene that fails both is ignoring the
  // feed.
  const deaf = scored.filter((r) => r.answer < 1.3 && r.share < 2);
  console.log('');
  console.log(`${scored.length} scenes; ${deaf.length} answer the feed on neither reading`);
  if (deaf.length) console.log(deaf.map((r) => r.name).join(', '));
  console.log('share  = how much of a busy second is the feed rather than the scene running on');
  console.log('answer = how plainly a burst shows up at once, which a simulation can still do');
} finally {
  await browser.close();
  srv.kill();
}
