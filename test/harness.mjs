// What every test file needs, and used to carry a copy of.
//
// A tally of checks that prints each one and exits non-zero if any failed; and
// for the browser halves, a static server and a headless browser to run them
// in. Nine files each had their own `ok`, and the three browser suites would
// each have had their own server, launch and teardown.
//
// Playwright is NOT a dependency of this project. A browser suite that finds
// it absent reports "skipped" and exits 0, as the main suite always has.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** A tally: `ok(name, condition, detail)` prints and counts; `finish(label)` reports and exits. */
export function tally() {
  let fails = 0;
  const failed = [];
  const ok = (name, condition, detail = '') => {
    if (!condition) {
      fails++;
      failed.push(name);
      console.log('FAIL  ' + name + (detail ? '  ' + detail : ''));
    } else {
      console.log('ok    ' + name + (detail ? '  ' + detail : ''));
    }
  };
  return {
    ok,
    get fails() {
      return fails;
    },
    get failed() {
      return failed.slice();
    },
    finish(label = 'checks') {
      console.log(fails ? `\n${fails} FAILURE(S): ${failed.join(' | ')}` : `\nall ${label} passed`);
      process.exit(fails ? 1 : 0);
    },
  };
}

const SERVER = fileURLToPath(new URL('../server/ingest.mjs', import.meta.url));

/**
 * The static server, on `port`, or nothing when TEST_BASE points at one already
 * running. Resolves once it answers /health.
 *
 * --no-maglev is not a preference. On Node 25.9 the server dies part way
 * through the main suite with a V8 internal assertion in the mid-tier
 * compiler, and every sample bank afterwards reports itself silent, which
 * looks exactly like seven broken kits. Remove it once the runtime stops.
 */
export async function startServer(port) {
  const base = process.env.TEST_BASE || `http://127.0.0.1:${port}`;
  if (process.env.TEST_BASE) return { srv: null, base };
  const srv = spawn(process.execPath, ['--no-maglev', SERVER, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // If the server dies, everything that depended on it fails as something
  // else, and a connection refused twenty checks later is the first sign.
  srv.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  srv.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) process.stderr.write(`[server] exited with code ${code}\n`);
    else if (signal && signal !== 'SIGTERM') process.stderr.write(`[server] killed by ${signal}\n`);
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base + '/health');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { srv, base };
}

/**
 * Headless Chromium, with autoplay allowed so audio contexts start without a
 * gesture. The installed Chrome when there is one, Playwright's own otherwise.
 * Returns null, after saying so, when Playwright is not installed.
 */
export async function launchBrowser() {
  let chromium = null;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      console.log('skipped - playwright-core is not installed');
      console.log('  npm i -D playwright-core   then re-run');
      return null;
    }
  }
  const args = ['--autoplay-policy=no-user-gesture-required'];
  try {
    return await chromium.launch({ headless: true, channel: 'chrome', args });
  } catch {
    return await chromium.launch({ headless: true, args });
  }
}

/**
 * A server, a browser and one page on the sandbox, ready for checks: the
 * page has loaded and `window.son` exists. `close()` takes it all down.
 *
 * An explicit context rather than browser.newPage(): checks that need a
 * second window sharing this one's origin and storage (BroadcastChannel) can
 * open one on `context`, which the implicit context refuses.
 */
export async function openSandbox({ port = 8793, path = '/demo/' } = {}) {
  const browser = await launchBrowser();
  if (!browser) process.exit(0);
  const { srv, base } = await startServer(port);
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.son, null, { timeout: 15000 });
  return {
    browser,
    context,
    page,
    base,
    errors,
    async close() {
      await browser.close();
      if (srv) srv.kill();
    },
  };
}
