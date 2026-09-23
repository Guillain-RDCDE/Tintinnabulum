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
// It is a dark wall with pictures hung on it because that is what the thing
// is: the Gallery is the front door, and a work is a picture you can also
// hear. The first version was a band of coloured circles above a title, which
// was honest in 2026-09 and was left behind by the papers, the finishes and
// the grown systems.
//
// The furniture around the pictures -- charcoal ground, brass rule down the
// left edge, a band of artwork fading into the type below it, Arial as the
// others are set -- is the house style of the whole portfolio's cards, which
// live together in Dropbox/Perso/GitHub/_social-previews. A card that wandered
// off on a light ground would read as somebody else's project.
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
  examples: 'Latencies, trades, commits, quakes - heard, and hung.',
  url: 'github.com/Guillain-RDCDE/Tintinnabulum',
};

// The house style of the portfolio's cards.
const BRASS = '#e8b44a';
const CREAM = '#faf4e8';
const MUTED = '#b0b0b8';
const STRIPE = 26;

// Four works hung in a line, their centres level as a hanging is hung, in four
// different hands: gouache on cotton rag, a mould on black card, a workshop
// exercise in flat colour, and lanterns on the water at night. Each seed is
// fixed, so the card is the same picture every time it is made.
const HANGING = [
  { work: 'currents', x: 110, y: 34, w: 184, h: 230, mat: 15, seed: 61297 },
  { work: 'mould', x: 386, y: 50, w: 168, h: 210, mat: 14, seed: 4312 },
  { work: 'bauhaus', x: 646, y: 66, w: 236, h: 177, mat: 13, seed: 2207 },
  { work: 'lanterns', x: 974, y: 56, w: 264, h: 198, mat: 14, seed: 8823 },
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

    // The wall: the portfolio's charcoal, with the grain of the engine's own
    // black card over it so it is a wall and not a fill.
    const ground = ctx.createLinearGradient(0, 0, 0, o.h);
    ground.addColorStop(0, '#121215');
    ground.addColorStop(1, '#222227');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, o.w, o.h);
    const wall = document.createElement('canvas');
    wall.width = o.w * 2;
    wall.height = o.h * 2;
    const wctx = wall.getContext('2d');
    wctx.fillStyle = GROUNDS.black.tint || '#141414';
    wctx.fillRect(0, 0, wall.width, wall.height);
    applyGround(wctx, 'black', { palette: PALETTES.abyss.colors, sync: true });
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(wall, 0, 0, o.w, o.h);
    ctx.restore();

    for (const h of o.hanging) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#fbf8f2';
      ctx.fillRect(h.x - h.mat, h.y - h.mat, h.w + h.mat * 2, h.h + h.mat * 2);
      ctx.restore();
      ctx.drawImage(drawWork(h.work, h.w * 2, h.h * 2, h.seed), h.x, h.y, h.w, h.h);
      ctx.strokeStyle = 'rgba(255,248,236,.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x - h.mat + 0.5, h.y - h.mat + 0.5, h.w + h.mat * 2 - 1, h.h + h.mat * 2 - 1);
    }

    // Laid down at the card's own size; the type is set here rather than up
    // there, so it stays as sharp as type should be.
    const out = document.getElementById('out');
    const fin = out.getContext('2d');
    fin.drawImage(big, 0, 0, o.w, o.h);

    // The brass rule down the left edge, as every card in the set wears.
    fin.fillStyle = o.brass;
    fin.fillRect(0, 0, o.stripe, o.h);

    // The type, in the set's own hand: the title, the promise, the examples.
    const sans = 'Arial, "Segoe UI", Helvetica, sans-serif';
    fin.textBaseline = 'alphabetic';
    fin.fillStyle = o.cream;
    fin.font = `700 86px ${sans}`;
    fin.fillText(o.title, 70, 432);
    fin.fillStyle = o.brass;
    fin.font = `400 36px ${sans}`;
    fin.fillText(o.tagline, 72, 490);
    fin.fillStyle = o.muted;
    fin.font = `400 29px ${sans}`;
    fin.fillText(o.examples, 72, 536);
    fin.fillStyle = '#96a0af';
    fin.font = `400 30px ${sans}`;
    fin.fillText(o.url, 70, 598);
  }, { w: W, h: H, stripe: STRIPE, brass: BRASS, cream: CREAM, muted: MUTED, hanging: HANGING, ...COPY });

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));

  const png = await page.locator('#out').screenshot();
  fs.writeFileSync(OUT, png);
  console.log(`wrote ${OUT}  (${png.length} bytes)`);
} finally {
  await browser.close();
  srv.kill();
}
