// Every scene, on one sheet, drawn by the real engine.
//
// Written because a green test count says nothing about what a visualisation
// looks like. Three defects in this project were found by looking at a picture
// and by no other means: a reaction grid with a bright rim, because its border
// rows were a reservoir the simulation never consumed; a Chladni plate stuck at
// mode two, which is a zoom rather than a pattern; a Turing texture rendered in
// bathroom-tile grey. All three passed their tests.
//
//   node tools/contact-sheet.mjs                     every scene
//   node tools/contact-sheet.mjs maurer guilloche    only these
//   node tools/contact-sheet.mjs --palette ember --out sheet.png
//
// Each tile is a real CanvasSink fed the same seeded events, so two tiles
// differ only in the scene. Events arrive spread over time rather than all at
// once, because the scenes worth looking at are the ones that accumulate and a
// single burst is not what they are for.
//
// The tiles are run a few at a time. Thirty-four renderers sharing one page
// share one main thread, and the heavy ones -- a reaction grid, a quasicrystal,
// a Hilbert curve of four thousand points -- starve the rest: the first sheet
// of all thirty-four came back with a dozen blank tiles, and every one of them
// drew correctly on its own. A blank tile has to mean a broken scene, or the
// sheet is worse than useless.

import { writeFile } from 'node:fs/promises';
import { startServer, launch } from './render.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const only = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));

const PALETTE = flag('palette', 'marine');
const OUT = flag('out', 'contact-sheet.png');
const TILE_W = Number(flag('width', 300));
const TILE_H = Number(flag('height', 190));
const COLS = Number(flag('cols', 5));
const SETTLE = Number(flag('settle', 4200));
const COUNT = Number(flag('count', 110));
// Small enough that every renderer in a batch gets its frames.
const BATCH = Number(flag('batch', 6));

const port = Number(flag('port', 8894));
const { srv, base } = await startServer(port);
const browser = await launch();
let failed = false;

try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.route('**/sheet-harness.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>
        html,body{margin:0;background:#111;font:11px ui-sans-serif,system-ui,sans-serif;color:#bbb}
        #g{display:grid;grid-template-columns:repeat(${COLS},${TILE_W}px);gap:10px;padding:10px}
        figure{margin:0}
        canvas{display:block;width:${TILE_W}px;height:${TILE_H}px}
        figcaption{padding:3px 1px 0;letter-spacing:.02em}
      </style><div id="g"></div>`,
    })
  );
  await page.goto(base + '/sheet-harness.html');

  const names = await page.evaluate(async (opt) => {
    const { CanvasSink } = await import('/src/visual/canvas-sink.js');
    const { SCENES } = await import('/src/visual/scenes/index.js');
    const { Mapper } = await import('/src/core/mapper.js');
    const { normalize, rngFrom } = await import('/src/core/event.js');

    const chosen = opt.only.length ? opt.only.filter((n) => SCENES[n]) : Object.keys(SCENES);
    const grid = document.getElementById('g');

    // Every tile's canvas up front, so the sheet keeps the order it was asked
    // for however the batches fall.
    const canvases = new Map();
    for (const name of chosen) {
      const fig = document.createElement('figure');
      const cv = document.createElement('canvas');
      const cap = document.createElement('figcaption');
      cap.textContent = `${SCENES[name].label} — ${name}`;
      fig.append(cv, cap);
      grid.append(fig);
      canvases.set(name, cv);
    }

    // The same stream for every batch, from the same seed: two tiles differ
    // only in the scene, whichever batches they were drawn in.
    const kinds = ['user', 'anon', 'bot', 'alert'];
    const steps = 22;
    const run = async (names) => {
      const sinks = names.map((name) =>
        // The sink's own defaults, deliberately. An earlier version set a
        // forty-second lifetime here and every tile came out three times as
        // crowded as anything that ships -- an instrument that made the thing
        // it was measuring look worse than it is.
        new CanvasSink(canvases.get(name), {
          palette: opt.palette, scene: name, showLabels: false, showHud: false,
        }).start()
      );
      const mapper = new Mapper({ mode: 'adaptive' });
      const rnd = rngFrom('contact-sheet');
      for (let b = 0; b < steps; b++) {
        for (let i = 0; i < Math.ceil(opt.count / steps); i++) {
          const magnitude = Math.round(Math.pow(rnd(), 3) * 9000) + 1;
          const ev = normalize({
            id: `e${b}-${i}`,
            magnitude,
            category: kinds[Math.floor(rnd() * kinds.length)],
            label: 'event',
            ts: Date.now(),
          });
          ev.map = mapper.map(magnitude);
          for (const s of sinks) s.handle(ev);
        }
        await new Promise((r) => setTimeout(r, opt.settle / steps));
      }
      // Stopped, not cleared: the canvas keeps its last frame, which is the
      // picture this whole tool exists to show.
      for (const s of sinks) s.stop();
    };

    for (let i = 0; i < chosen.length; i += opt.batch) {
      await run(chosen.slice(i, i + opt.batch));
    }
    return chosen;
  }, { palette: PALETTE, only, count: COUNT, settle: SETTLE, batch: BATCH });

  const shot = await page.screenshot({ fullPage: true });
  await writeFile(OUT, shot);
  console.log(`${names.length} scenes -> ${OUT}`);
  if (errors.length) {
    failed = true;
    console.error('page errors:\n  ' + errors.join('\n  '));
  }
} finally {
  await browser.close();
  srv.kill();
}

process.exit(failed ? 1 : 0);
