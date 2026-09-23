// Regenerate demo/social-preview.png from the engine itself.
//
//   node tools/make-social-preview.mjs
//
// Every picture on the card is a real work, developed by `playScene` in a real
// browser -- its scene, its palette, its paper -- and the wall behind them is a
// real sheet from the same paper mill. Nothing here draws a mark by hand. Two
// things follow: the card cannot flatter the product, and it cannot go stale
// while the visuals change underneath it.
//
// It is a wall with pictures hung on it because that is what the thing is: the
// Gallery is the front door, and a work is a picture you can also hear. The
// first version of this card was a band of coloured circles above a title,
// which was honest in 2026-09 and was left behind by the papers, the finishes
// and the grown systems.
//
// The card names no single data source. An earlier version ended on "Wikipedia
// edits", which was true of where the idea came from and wrong about what the
// engine does. It carries no count of anything either: counts drift.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer, launch } from './render.mjs';

const OUT = fileURLToPath(new URL('../demo/social-preview.png', import.meta.url));

const W = 1280;
const H = 640;

const COPY = {
  title: 'Tintinnabulum',
  tagline: 'Turn any stream of events into sound.',
  examples: 'Latencies, trades, commits, quakes — heard, and hung.',
  url: 'github.com/Guillain-RDCDE/Tintinnabulum',
};

// Three works, hung as they would be on a wall: the hero in colour on cotton
// rag, a dark one on black card below it, a quiet engraving above. Each seed is
// fixed, so the card is the same picture every time it is made.
const HANGING = [
  { work: 'mould', x: 690, y: 300, w: 208, h: 260, mat: 16, seed: 4312 },
  { work: 'currents', x: 950, y: 92, w: 264, h: 330, mat: 22, seed: 61297 },
  { work: 'engraved', x: 700, y: 96, w: 170, h: 136, mat: 14, seed: 771 },
];

const { srv, base } = await startServer(8892);
const browser = await launch();

try {
  // Composed at twice the size and laid down at the card's own, so the
  // pictures come out as clean as a print and the file stays small enough to
  // be a social preview (GitHub takes a megabyte).
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.route('**/social-harness.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<style>html,body{margin:0;background:#fff}canvas{display:block}</style>' +
        `<canvas id="out" width="${W}" height="${H}"></canvas>`,
    })
  );
  await page.goto(base + '/social-harness.html');

  await page.evaluate(async (o) => {
    const {
      WORKS, SCENES, PALETTES, GROUNDS, playScene, applyGround, prepareGround,
    } = await import('/src/index.js');

    // The papers are milled first: a picture drawn before its sheet is ready
    // would come out on nothing.
    const papers = new Set(['plaster', ...o.hanging.map((h) => WORKS[h.work].ground)]);
    for (const p of papers) await prepareGround(p);

    /** One work, developed in full at the size it hangs. */
    const drawWork = (name, w, h, seed) => {
      const work = WORKS[name];
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const params = Object.fromEntries(
        Object.entries(SCENES[work.scene].params || {}).map(([k, d]) => [k, d.default])
      );
      const player = playScene(cv.getContext('2d'), work.scene, {
        w, h, palette: PALETTES[work.palette].colors, params,
        finish: work.finish, mat: 'none', grain: work.grain, ground: work.ground, seed, every: 90,
      });
      while (!player.develop(60)) { /* the whole picture, not a first glimpse */ }
      return cv;
    };

    // The wall and the pictures are composed at twice the card's size.
    const big = document.createElement('canvas');
    big.width = o.w * 2;
    big.height = o.h * 2;
    const ctx = big.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    // The wall: plaster from the paper mill, lit from where the type sits.
    const wall = document.createElement('canvas');
    wall.width = o.w * 2;
    wall.height = o.h * 2;
    const wctx = wall.getContext('2d');
    wctx.fillStyle = GROUNDS.plaster.tint;
    wctx.fillRect(0, 0, wall.width, wall.height);
    applyGround(wctx, 'plaster', { palette: PALETTES.linen.colors, sync: true });
    ctx.drawImage(wall, 0, 0, o.w, o.h);
    const light = ctx.createRadialGradient(o.w * 0.32, o.h * 0.42, 60, o.w * 0.32, o.h * 0.42, o.w * 0.8);
    light.addColorStop(0, 'rgba(255,252,246,.55)');
    light.addColorStop(1, 'rgba(74,60,44,.22)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, o.w, o.h);

    for (const h of o.hanging) {
      ctx.save();
      ctx.shadowColor = 'rgba(38,30,22,.40)';
      ctx.shadowBlur = 38;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#fbf8f2';
      ctx.fillRect(h.x - h.mat, h.y - h.mat, h.w + h.mat * 2, h.h + h.mat * 2);
      ctx.restore();
      ctx.drawImage(drawWork(h.work, h.w * 2, h.h * 2, h.seed), h.x, h.y, h.w, h.h);
      ctx.strokeStyle = 'rgba(38,30,22,.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x - h.mat + 0.5, h.y - h.mat + 0.5, h.w + h.mat * 2 - 1, h.h + h.mat * 2 - 1);
    }

    // Laid down at the card's own size; the type is set here rather than up
    // there, so it stays as sharp as type should be.
    const out = document.getElementById('out');
    const fin = out.getContext('2d');
    fin.drawImage(big, 0, 0, o.w, o.h);

    // The type, set the way the Gallery sets a label: a rule, a title, the
    // medium under it in italic.
    const sans = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    const serif = 'Georgia, "Times New Roman", serif';
    const x = 92;
    fin.textBaseline = 'alphabetic';
    fin.fillStyle = '#b4482e';
    fin.fillRect(x, 206, 3, 148);
    fin.fillStyle = '#17150f';
    fin.font = `700 74px ${sans}`;
    fin.fillText(o.title, x + 28, 268);
    fin.fillStyle = '#3d372e';
    fin.font = `400 28px ${sans}`;
    fin.fillText(o.tagline, x + 28, 314);
    fin.fillStyle = '#655c50';
    fin.font = `italic 21px ${serif}`;
    fin.fillText(o.examples, x + 28, 352);
    fin.fillStyle = '#867c6f';
    fin.font = `400 21px ${sans}`;
    fin.fillText(o.url, x + 28, 470);
  }, { w: W, h: H, hanging: HANGING, ...COPY });

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));

  const png = await page.locator('#out').screenshot();
  fs.writeFileSync(OUT, png);
  console.log(`wrote ${OUT}  (${png.length} bytes)`);
} finally {
  await browser.close();
  srv.kill();
}
