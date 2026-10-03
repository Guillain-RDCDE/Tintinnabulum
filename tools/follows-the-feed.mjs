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
//   node tools/follows-the-feed.mjs --sheets --works  every sheet and every work's dials too
//   node tools/follows-the-feed.mjs --strict          exit 1 if any picture is deaf

import { parseArgs, withHarness } from './render.mjs';

// --sheets measures every other sheet of a scene that has several; --works
// measures every work's own dials; --strict exits non-zero if any picture is
// deaf, which is what `npm run test:feed` runs. `--set figure=1` measures one
// scene's second sheet, which can answer the feed quite differently.
const { flag, has, only, set: SET } = parseArgs(process.argv.slice(2), ['sheets', 'works', 'strict']);
const WORST = Number(flag('worst', 0));
const port = Number(flag('port', 8931));
const SHEETS = has('sheets');
const WORKS_TOO = has('works');
const STRICT = has('strict');

const rows = await withHarness({ port, viewport: { width: 900, height: 620 } }, (page) => page.evaluate(async (opt) => {
  const { CanvasSink, SCENE_NAMES } = await import('/src/index.js');
  // Events are built the way the engine builds them -- normalised, then
  // given a mapping -- and not by hand. A hand-made event is missing the
  // fields the renderer derives a radius from, every scene throws on the
  // first frame, and the audit then reports that nothing moves for any
  // reason at all, which is the most convincing wrong answer available.
  const { Mapper } = await import('/src/core/mapper.js');
  const { normalize, unitPosition } = await import('/src/core/event.js');
  const mapper = new Mapper({ mode: 'adaptive' });
  const cv = document.getElementById('c');
  cv.style.width = '900px';
  cv.style.height = '620px';
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  const snap = () => ctx.getImageData(0, 0, cv.width, cv.height).data.slice();
  /**
   * How much the picture differs, summed rather than counted.
   *
   * Counting pixels that crossed a threshold saturates at both ends for a
   * scene made of thousands of small marks: a flock of sixteen hundred
   * birds a pixel and a half across flips most of the canvas for a
   * movement of a third of a pixel, so the count reads the same whether
   * the flock is hanging almost still or boiling. The summed difference
   * scales with how far things actually moved, which is the question.
   */
  const moved = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i += 4 * 11) {
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return Math.round(sum / 100);
  };
  /**
   * The same count, but only inside one half of the canvas.
   *
   * Some scenes repaint everything every frame -- a flock of sixteen hundred
   * birds, a reaction grid, a field of stripes -- and then a count over the
   * whole canvas saturates: nearly every sampled pixel differs between any
   * two frames whatever arrives, and an arrival cannot raise a number that
   * is already at its ceiling. Landing a burst in one half and comparing
   * that half against the other asks where the change is rather than how
   * much, and a saturated scene can still answer it.
   */
  const movedIn = (a, b, left) => {
    let n = 0;
    const w = cv.width;
    const half = w >> 1;
    for (let i = 0; i < a.length; i += 4 * 11) {
      const x = (i >> 2) % w;
      if (left ? x >= half : x < half) continue;
      n += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return Math.round(n / 100);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Which pictures: the scenes named, or all of them; and on top, when
  // asked, every other sheet of a scene that has several, and every work's
  // own dials -- a second sheet is a second picture, and a work's dials can
  // turn a scene into one the defaults never show.
  const { SCENES, WORKS, workSettings } = await import('/src/index.js');
  const names = opt.only.length ? opt.only : SCENE_NAMES;
  const pictures = names.map((name) => ({ key: name, name, params: opt.set }));
  if (opt.sheets) {
    for (const name of names) {
      const sheet = SCENES[name] && SCENES[name].params && SCENES[name].params.figure;
      if (!sheet) continue;
      for (let v = sheet.min + (sheet.step || 1); v <= sheet.max; v += sheet.step || 1) {
        pictures.push({ key: `${name}:${v}`, name, params: { ...opt.set, figure: v } });
      }
    }
  }
  if (opt.works) {
    const seen = new Set(pictures.map((p) => p.name + JSON.stringify(p.params)));
    for (const [work, w] of Object.entries(WORKS)) {
      if (opt.only.length && !opt.only.includes(w.scene)) continue;
      const s = workSettings(work, SCENES);
      const turned = Object.fromEntries(Object.entries(s.params).filter(([k, v]) => SCENES[s.scene].params[k].default !== v));
      const id = s.scene + JSON.stringify(turned);
      if (seen.has(id)) continue;
      seen.add(id);
      pictures.push({ key: `${work} (${s.scene})`, name: s.scene, params: turned });
    }
  }
  const out = [];
  for (const { key, name, params } of pictures) {
    const sink = new CanvasSink(cv, { palette: 'marine', scene: name, showHud: false, showLabels: false, params: { [name]: params } });
    sink.start();
    let n = 0;
    const feed = (count, side) => {
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
    /**
     * A burst that lands in one half, by choosing its identity.
     *
     * The renderer places a mark from the event's own id, so rather than
     * move the mark after the scene has already seen it -- which would show
     * the scene two events for one -- the id is drawn until it hashes to
     * the half we want.
     */
    const feedSide = (count, left) => {
      let tries = 0;
      let placed = 0;
      while (placed < count && tries < count * 200) {
        tries++;
        const id = `${name}-side-${n++}`;
        const u = unitPosition(id).u;
        if (left ? u > 0.44 : u < 0.56) continue;
        const magnitude = Math.round(Math.exp(Math.random() * 8)) + 1;
        const ev = normalize({ id, magnitude, category: 'user', label: 'audit', ts: Date.now() });
        ev.map = mapper.map(magnitude);
        sink.handle(ev);
        placed++;
      }
      return placed;
    };
    // Something on the canvas to begin with, and then long enough for the
    // picture to actually come to rest.
    //
    // Two seconds was not enough: a flock disturbed by a falcon is still
    // settling three and a half seconds later, so the "quiet" reading was
    // taken while the last burst was still working its way through and
    // counted the feed's own aftermath as the scene running on its own.
    feed(40);
    await wait(4200);

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

    // Where the change is, for the scenes whose own motion saturates the
    // counts above: a burst into the left half only, then the change in
    // that half against the change in the right.
    await wait(700);
    const s0 = snap();
    const landed = feedSide(30, true);
    await wait(260);
    const s1 = snap();
    const here = movedIn(s0, s1, true);
    const away = movedIn(s0, s1, false);
    sink.stop();
    out.push({ name: key, quiet, busy, drift, jolt, here, away, landed });
  }
  return out;
}, { only, set: SET, sheets: SHEETS, works: WORKS_TOO }));

const scored = rows.map((r) => ({
  ...r,
  // A floor, so a wholly still picture does not divide by nothing.
  share: (r.busy + 4) / (r.quiet + 4),
  answer: (r.jolt + 4) / (r.drift + 4),
  where: (r.here + 4) / (r.away + 4),
}));
scored.sort((a, b) => Math.max(a.answer, a.share, a.where) - Math.max(b.answer, b.share, b.where));
const shown = WORST ? scored.slice(0, WORST) : scored;
console.log('scene             share   answer    where    quiet/busy');
// Deaf on all three readings, not on one. The same bar the browser suite
// holds its subset to, so the two can never disagree about a picture.
//
// A scene can fail one of them honestly. "Fields" fades a new rectangle in
// over several seconds, so a quarter second after a burst holds nothing and
// its answer reads 1.0 -- and yet it changes nothing at all when nothing
// arrives, so its share is in the thousands. The reverse happens too: a
// scene that repaints its whole ground every frame buries its share and
// still shows a burst at once. A diagram redrawn whole from every event
// changes everywhere at once and has no "where". Only a scene that fails
// all three is ignoring the feed.
const isDeaf = (r) => r.answer < 1.4 && r.share < 2 && r.where < 1.6;
for (const r of shown) {
  const mark = isDeaf(r) ? '  <- deaf' : (r.answer < 2 && r.share < 2 && r.where < 2) ? '  <- faint' : '';
  console.log(
    `${r.name.padEnd(24)} ${r.share.toFixed(2).padStart(6)}  ${r.answer.toFixed(2).padStart(7)}` +
    `  ${r.where.toFixed(2).padStart(7)}   ${String(r.quiet).padStart(6)}/${String(r.busy).padStart(6)}${mark}`
  );
}
const deaf = scored.filter(isDeaf);
console.log('');
console.log(`${scored.length} pictures; ${deaf.length} answer the feed on no reading`);
if (deaf.length) console.log(deaf.map((r) => r.name).join(', '));
console.log('share  = how much of a busy second is the feed rather than the scene running on');
console.log('answer = how plainly a burst shows up at once, which a simulation can still do');
console.log('where  = a burst into the left half: the change there against the change opposite');
if (STRICT && deaf.length > 0) process.exit(1);
