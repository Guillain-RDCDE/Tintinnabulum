// What the tools share: the static server, a headless browser, the arguments
// they are given and a blank page on the server's origin to run the engine in.
//
// Every tool drives the real engine in a real browser -- a contact sheet, the
// feed-rule audit, a kit rendered to a WAV -- and each of them used to start
// the server, launch the browser, route a harness page and parse `--flag
// value` on its own, four copies drifting apart. Nothing here reimplements the
// visuals or the sound; if a tool's output looks wrong, the engine is wrong.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const SERVER = fileURLToPath(new URL('../server/ingest.mjs', import.meta.url));

/**
 * The static server on `port`, resolved once it answers.
 *
 * --no-maglev as the test suite passes it: on Node 25.9 the server can die
 * part way through a long run with a V8 internal assertion in the mid-tier
 * compiler, which is not a fault in anything here.
 */
export async function startServer(port) {
  const srv = spawn(process.execPath, ['--no-maglev', SERVER, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(base + '/src/index.js');
      if (r.ok) return { srv, base };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  srv.kill();
  throw new Error('static server did not start');
}

/** Headless Chromium: the installed Chrome when there is one, Playwright's own otherwise. */
export async function launch() {
  try {
    return await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

/**
 * The command line, read the way every tool reads it.
 *
 * `flag('name', fallback)` is the value after `--name`; `has('name')` says
 * whether a bare switch was given; `only` is every argument that is neither,
 * usually scene names; and `set` is the `--set a=1,b=2` list of dials to turn,
 * so a tool can look at a scene's second sheet rather than its first.
 *
 * @param {string[]} [argv]
 * @param {string[]} [switches]  the names that take no value, so a scene named after one is not taken for its value
 */
export function parseArgs(argv = process.argv.slice(2), switches = []) {
  const bare = new Set(switches.map((s) => '--' + s));
  const flag = (name, fallback) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
  const has = (name) => argv.includes('--' + name);
  const only = argv.filter((a, i) => {
    if (a.startsWith('--')) return false;
    const before = argv[i - 1] || '';
    return !(before.startsWith('--') && !bare.has(before));
  });
  const set = Object.fromEntries(
    String(flag('set', ''))
      .split(',')
      .filter((kv) => kv.includes('='))
      .map((kv) => [kv.split('=')[0].trim(), Number(kv.split('=')[1])])
  );
  return { flag, has, only, set };
}

/**
 * A server, a browser and one blank page on the server's origin, so bare
 * module paths resolve; `fn(page, base)` runs against it and whatever it
 * returns comes back. Page errors are collected and thrown afterwards, and
 * everything is taken down whether or not `fn` succeeded.
 *
 * @param {object} o
 * @param {number} o.port
 * @param {string} [o.html]       the harness page's body; a canvas by default
 * @param {object} [o.viewport]   { width, height }
 * @param {number} [o.scale]      device pixel ratio
 */
export async function withHarness({ port, html, viewport, scale } = {}, fn) {
  const { srv, base } = await startServer(port);
  const browser = await launch();
  try {
    const page = await browser.newPage({
      ...(viewport ? { viewport } : {}),
      ...(scale ? { deviceScaleFactor: scale } : {}),
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const body = html || '<style>html,body{margin:0}canvas{display:block}</style><canvas id="c"></canvas>';
    await page.route('**/harness.html', (route) => route.fulfill({ contentType: 'text/html', body }));
    await page.goto(base + '/harness.html');
    const out = await fn(page, base);
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    return out;
  } finally {
    await browser.close();
    srv.kill();
  }
}

/**
 * In the page: one event built the way the engine builds them -- normalised,
 * then given a mapping -- and not by hand. A hand-made event is missing the
 * fields the renderer derives a radius from, every scene throws on the first
 * frame, and an audit then reports that nothing moves for any reason at all.
 * A heavy tail of sizes, as feeds have, and the four kinds in turn.
 *
 * Serialised into page.evaluate as source, since functions do not cross.
 */
export const FEED_EVENT_SOURCE = `
  (mapper, normalize, rnd, i, label = 'event') => {
    const magnitude = Math.round(Math.pow(rnd(), 3) * 9000) + 1;
    const ev = normalize({
      id: 'e' + i,
      magnitude,
      category: ['user', 'anon', 'bot', 'alert'][Math.floor(rnd() * 4)],
      label,
      ts: Date.now(),
    });
    ev.map = mapper.map(magnitude);
    return ev;
  }`;
