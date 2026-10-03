// The checks that measure the machine as much as the code.
//
// How long a step of a paper's build holds the page; how long a palette
// change holds it. Both assert wall-clock numbers, and wall-clock numbers
// depend on what else the machine is doing: the same build that takes 2.6 ms
// a step on a quiet laptop took 4 steps over 100 ms with a browser suite,
// Dropbox and a second Chrome beside it. They are worth measuring -- a click
// that lands in a long task is a click that did nothing -- but on their own
// exit code, so a loaded machine does not read as a broken picture:
//
//   npm run test:perf

import { tally, openSandbox } from './harness.mjs';

const { ok, finish } = tally();
const sandbox = await openSandbox({ port: Number(process.env.TEST_PORT || 8796) });
const { page } = sandbox;

// Every paper is built in the background, a slice at a time. What could hold
// the page is a single step too long to interrupt, and the engine keeps the
// longest. Judged on the steps as a whole: one long step can be the garbage
// collector stopping the page for its own reasons, which is not the paper's
// doing and not in its power.
const grounds = await page.evaluate(async () => {
  const m = await import('../src/index.js');
  const t0 = performance.now();
  for (const g of m.GROUND_ORDER) await m.prepareGround(g);
  const buildMs = performance.now() - t0;
  const all = Array.from(m.groundStats.times.slice(0, Math.min(m.groundStats.count, m.groundStats.times.length))).sort((a, b) => a - b);
  const at = (q) => all[Math.min(all.length - 1, Math.floor(all.length * q))] || 0;
  return { steps: all.length, median: at(0.5), p95: at(0.95), over100: all.filter((t) => t > 100).length, buildMs: Math.round(buildMs) };
});
ok('making a sheet never holds the page',
   grounds.steps > 50 && grounds.median < 15 && grounds.p95 < 45 && grounds.over100 <= 2,
   `${grounds.steps} steps: median ${grounds.median.toFixed(1)} ms, 95% under ${grounds.p95.toFixed(1)} ms, ${grounds.over100} over 100 ms; nine sheets in ${grounds.buildMs} ms`);

// A palette change repaints every card. No task may run long enough to
// swallow a click: a hundred and fifty milliseconds is already a long time to
// be deaf, and the version this replaced measured 2562.
const worstTask = await page.evaluate(async () => {
  const tasks = [];
  const obs = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) tasks.push(e.duration);
  });
  obs.observe({ entryTypes: ['longtask'] });
  document.querySelector('#palettes [data-palette="ember"]').click();
  await new Promise((r) => setTimeout(r, 5000));
  obs.disconnect();
  return Math.round(Math.max(0, ...tasks));
});
ok('a palette change never holds the page long enough to swallow a click', worstTask < 300, `worst task ${worstTask} ms`);

ok('no page errors', sandbox.errors.length === 0, sandbox.errors.slice(0, 3).join(' | '));

await sandbox.close();
finish('performance checks');
