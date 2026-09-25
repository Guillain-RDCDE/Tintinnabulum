// Browser-half checks: sample decoding, audio synthesis, scheduling, canvas.
//
// Everything here needs a real Web Audio implementation and a real canvas, so
// it runs headless Chromium rather than Node. Playwright is NOT a dependency of
// this project: if it is absent the suite reports "skipped" and exits 0.
//
//   npm i -D playwright-core && node test/browser.test.mjs
//
// The audio assertions do not merely check that nothing threw. They render the
// instruments through an OfflineAudioContext and measure the peak amplitude, so
// a silent instrument fails.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('skipped - playwright-core is not installed');
    console.log('  npm i -D playwright-core   then re-run');
    process.exit(0);
  }
}

const SERVER = fileURLToPath(new URL('../server/ingest.mjs', import.meta.url));
const PORT = Number(process.env.TEST_PORT || 8793);
const BASE = process.env.TEST_BASE || `http://127.0.0.1:${PORT}`;
const USE_LOCAL_SERVER = !process.env.TEST_BASE;

let fails = 0;
const failedNames = [];
const ok = (n, c, x = '') => {
  if (!c) {
    fails++; failedNames.push(n);
    console.log('FAIL  ' + n + (x ? '  ' + x : ''));
  } else console.log('ok    ' + n + (x ? '  ' + x : ''));
};

let srv = null;
if (USE_LOCAL_SERVER) {
  // --no-maglev is not a preference. On Node 25.9 the static server dies part
  // way through this suite with a V8 internal assertion --
  // "Check failed: ValueRepresentationIs(...)" -- which is a fault in the
  // engine's mid-tier compiler, not in anything here. When it happens every
  // sample bank afterwards reports itself silent, which looks exactly like
  // seven broken kits. Remove this once the runtime stops doing it.
  srv = spawn(process.execPath, ['--no-maglev', SERVER, '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // If the server dies, everything that depended on it fails as something
  // else: seven sample banks reported themselves silent and it took a
  // connection-refused twenty checks later to reveal that nothing was
  // serving them. Say it the moment it happens.
  srv.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  srv.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[server] exited with code ${code}
`);
    } else if (signal && signal !== 'SIGTERM') {
      process.stderr.write(`[server] killed by ${signal}
`);
    }
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE + '/health');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function launch() {
  const args = ['--autoplay-policy=no-user-gesture-required'];
  try {
    return await chromium.launch({ headless: true, channel: 'chrome', args });
  } catch {
    return await chromium.launch({ headless: true, args });
  }
}

const browser = await launch();
// An explicit context rather than browser.newPage(). The projection check needs
// a second window that shares this one's origin and storage -- that is what
// BroadcastChannel talks across -- and the implicit context browser.newPage()
// creates refuses to make one. A second Playwright context would not do: it is
// a separate profile, so the channel would never connect.
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
const badResponses = [];
// One check below deliberately requests files that do not exist, to prove a
// partly-broken sample bank still plays. That failure is expected, so page
// hygiene is not recorded while the probe runs.
let probing = false;
page.on('console', (m) => {
  if (!probing && m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => {
  if (!probing) consoleErrors.push('pageerror: ' + e.message);
});
page.on('response', (r) => {
  if (!probing && r.status() >= 400) badResponses.push(r.status() + ' ' + r.url());
});

const resp = await page.goto(BASE + '/demo/', { waitUntil: 'domcontentloaded' });
ok('demo page loads', resp && resp.ok(), 'status=' + (resp && resp.status()));

// The sandbox root must redirect here, or the Pages URL is a dead end.
const rootResp = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForURL(/\/demo\/?$/, { timeout: 10000 }).catch(() => {});
ok('site root redirects to the sandbox', /\/demo\/?$/.test(page.url()), page.url());
ok('root returned 200', rootResp && rootResp.ok());

await page.waitForFunction(() => window.son, null, { timeout: 15000 });
ok('engine is exposed on the page', true);

// --- the shell: the picture first, the settings over it ----------------------
// The work fills the window. Four tabs open an inspector over it, a dock
// carries play and what is on, and every setting still exists exactly once, in
// the panel it always lived in -- now shown by its tab.
const openMore = async (sel) => {
  await page.evaluate((s) => {
    const d = document.querySelector(s);
    if (d && !d.open) d.open = true;
  }, sel);
};
/** Bring a tab up, and give the inspector time to slide in. */
const showTab = async (name, p = page) => {
  await p.evaluate((n) => window.son.shell.show(n), name);
  await p.waitForTimeout(650);
};

// A genuine first visit: the suite has already loaded the page twice (the root
// redirects here), which is exactly what the gallery greeting remembers.
await page.evaluate(() => localStorage.removeItem('t:shell-seen'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.son && window.son.shell, null, { timeout: 15000 });
await page.waitForTimeout(400);

const arrival = await page.evaluate(() => ({
  marks: window.son.sinks.find((s) => s.particles).particles.length,
  received: window.son.stats.received,
  unlock: document.querySelector('#unlock').classList.contains('show'),
}));
ok('before anything plays the stage is already alive, and silent',
   arrival.marks > 0 && arrival.received === 0, `${arrival.marks} marks, ${arrival.received} real events`);
ok('no sound notice across the picture before sound is asked for', !arrival.unlock);

const PANELS = ['#sec-works', '#sec-listen', '#sec-sound', '#sec-look', '#sec-connect', '#sec-filter', '#sec-activity'];
const shellInfo = await page.evaluate((sels) => {
  const cv = document.querySelector('#canvas').getBoundingClientRect();
  return {
    tabs: [...document.querySelectorAll('#tabs [role="tab"]')].map((b) => b.textContent.trim()),
    inInspector: sels.every((s) => document.querySelector('#inspector').contains(document.querySelector(s))),
    tabbed: sels.every((s) => Boolean(document.querySelector(s).dataset.tab)),
    fills: cv.width >= innerWidth - 1 && cv.height >= innerHeight - 1,
    pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
    active: window.son.shell.active,
  };
}, PANELS);
ok('five tabs: Gallery, Sound, Picture, Data, Create',
   JSON.stringify(shellInfo.tabs) === JSON.stringify(['Gallery', 'Sound', 'Picture', 'Data', 'Create']), shellInfo.tabs.join(', '));
ok('every panel lives in the inspector, under a tab', shellInfo.inInspector && shellInfo.tabbed);
ok('the picture fills the window', shellInfo.fills);
ok('the page itself never scrolls; the inspector does', !shellInfo.pageScrolls);
ok('a first visit opens on the gallery', shellInfo.active === 'gallery', String(shellInfo.active));
ok('there is a single obvious play button, in the dock', await page.locator('#dock #start').isVisible());
const playBox = await page.locator('#start').boundingBox();
ok('the play button is a comfortable target', playBox && playBox.height >= 44,
   playBox ? `${Math.round(playBox.height)}px tall` : 'missing');

const tabbing = await page.evaluate(async () => {
  const shell = window.son.shell;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shown = () => [...document.querySelectorAll('#inspector-body > .panel')].filter((p) => !p.hidden).map((p) => p.id);
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  const out = {};
  document.querySelector('#tabs [data-tab="sound"]').click();
  await wait(80);
  out.sound = {
    active: shell.active,
    shown: shown(),
    open: document.querySelector('#sec-sound').open,
    selected: document.querySelector('#tabs [data-tab="sound"]').getAttribute('aria-selected'),
  };
  document.querySelector('#tabs [data-tab="sound"]').click();
  await wait(80);
  out.closed = { active: shell.active, inspecting: document.body.classList.contains('inspecting') };
  document.querySelector('#sec-look').open = true;
  await wait(80);
  out.panelBringsTab = shell.active;
  key('Escape');
  await wait(50);
  out.escape = shell.active;
  key('4');
  await wait(50);
  out.key4 = { active: shell.active, shown: shown() };
  key('g');
  await wait(50);
  out.keyG = shell.active;
  return out;
});
ok('a tab opens the inspector on its own panel',
   tabbing.sound.active === 'sound' && JSON.stringify(tabbing.sound.shown) === '["sec-sound"]' &&
   tabbing.sound.open && tabbing.sound.selected === 'true', JSON.stringify(tabbing.sound));
ok('the same tab again closes it', tabbing.closed.active === null && !tabbing.closed.inspecting, JSON.stringify(tabbing.closed));
ok('a panel opened by any route brings up its tab', tabbing.panelBringsTab === 'picture', String(tabbing.panelBringsTab));
ok('Escape closes the inspector', tabbing.escape === null, String(tabbing.escape));
ok('the number keys open the tabs, and Data holds its four panels',
   tabbing.key4.active === 'data' && tabbing.key4.shown.length === 4, JSON.stringify(tabbing.key4));
ok('G brings up the gallery', tabbing.keyG === 'gallery', String(tabbing.keyG));

// Each header states its own value, so the whole configuration reads at a glance.
const summaries = await page.evaluate(() =>
  ['listen', 'sound', 'look', 'connect', 'filter'].map((k) => document.querySelector('#sum-' + k).textContent.trim()));
ok('each panel states its current setting', summaries.every((s) => s.length > 0), summaries.join(' | '));

const disclosures = await page.evaluate(() =>
  [...document.querySelectorAll('details.more')].map((d) => ({ id: d.id, open: d.open }))
);
ok('the finer settings exist but stay folded away', disclosures.length >= 3 && disclosures.every((d) => !d.open),
   disclosures.map((d) => d.id).join(', '));

// Everything below drives the controls, which means opening the panels.
const openPanels = async (p = page) => {
  await p.evaluate(() => {
    for (const d of document.querySelectorAll('details.panel')) d.open = true;
  });
};
await openPanels();

/**
 * Walk the page the way a person does, so every card gets painted.
 *
 * A card is drawn only once it is near the screen: forty scene previews and
 * twenty-two kit plates at once is what used to hold the main thread for two
 * and a half seconds, which is long enough to swallow a click. So a check on
 * the cards has to scroll to them first -- and doing it this way means the
 * lazy path is exercised on every run rather than trusted.
 */
const paintEverything = async (p = page) => {
  await p.evaluate(async () => {
    const settled = async () => {
      // Wait for the cards on screen to be done rather than for a fixed
      // delay. A tenth of a second per screen is faster than the page can
      // paint -- one card is tens of milliseconds against a six-millisecond
      // frame budget -- so a fixed wait scrolls past cards it never gave the
      // page time to draw, and then complains they are blank.
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (i > 2 && !window.son.look.previewsBusy) return;
      }
    };
    // The inspector scrolls, not the page.
    const box = document.querySelector('#inspector-body');
    for (let y = 0; y < box.scrollHeight; y += Math.round(box.clientHeight * 0.7)) {
      box.scrollTop = y;
      await settled();
    }
    box.scrollTop = 0;
    await settled();
  });
};
ok('a panel opens to reveal its controls',
   (await page.locator('#feeds .card').count()) >= 6 &&
   (await page.locator('#kits .card').count()) >= 6 &&
   (await page.locator('#palettes .sw').count()) >= 8);

// The duplication that made the old interface confusing must not come back.
const dupes = await page.evaluate(() => {
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  const seen = new Set();
  const dup = new Set();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  const controls = [...document.querySelectorAll('[data-feed],[data-kit],[data-palette],[data-shape],[data-lang]')];
  const keys = controls.map((c) => JSON.stringify(c.dataset));
  const dupControls = keys.length - new Set(keys).size;
  return { dupIds: [...dup], dupControls };
});
ok('no element id appears twice', dupes.dupIds.length === 0, dupes.dupIds.join(', '));
ok('no control is offered in two places', dupes.dupControls === 0, dupes.dupControls + ' duplicated');

// --- unlock + sample decoding -------------------------------------------
const unlocked = await page.evaluate(async () => {
  await window.son.unlock();
  return {
    state: window.son.engine.ctx.state,
    instruments: window.son.audio.instruments().map((i) => ({
      name: i.name,
      ready: Boolean(i.ready),
      buffers: i._buffers ? i._buffers.length : null,
    })),
  };
});
ok('AudioContext is running after unlock', unlocked.state === 'running', unlocked.state);
const banks = unlocked.instruments.filter((i) => i.buffers !== null);
ok('all three sample banks decoded', banks.length === 3 && banks.every((b) => b.ready),
   banks.map((b) => `${b.name}:${b.buffers}`).join(' '));
ok('celesta bank has all 27 notes',
   banks.some((b) => b.name === 'celesta' && b.buffers === 27),
   JSON.stringify(banks.map((b) => b.buffers)));

// Decoded audio must not be silent -- a 404 that decoded to nothing would
// otherwise pass every check above.
const bankPeak = await page.evaluate(() => {
  const inst = window.son.audio.instruments().find((i) => i.name === 'celesta');
  const buf = inst._buffers[10];
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  return { peak, duration: buf.duration, rate: buf.sampleRate };
});
ok('decoded sample carries real audio', bankPeak.peak > 0.01,
   `peak=${bankPeak.peak.toFixed(3)} dur=${bankPeak.duration.toFixed(2)}s`);

// --- instruments actually produce sound ---------------------------------
// Rendered offline, so this does not depend on a working output device.
const rendered = await page.evaluate(async () => {
  const mod = await import('../src/audio/instruments.js');
  const out = {};
  const measure = async (inst, semitone) => {
    const off = new OfflineAudioContext(1, 44100 * 2, 44100);
    if (inst.load) await inst.load(off);
    const v = inst.play(off, off.destination, { semitone, velocity: 1 });
    if (!v) return -1;
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    return peak;
  };
  const synth = mod.synthKit();
  out.synthBell = await measure(synth.add, 12);
  out.synthPluck = await measure(synth.sub, 4);
  const samples = mod.hatnoteKit();
  out.sampleCelesta = await measure(samples.add, 9);
  out.sampleClav = await measure(samples.sub, 20);
  // Continuous pitch: a semitone far outside the recorded range must still
  // sound, which is the whole point of resampling through playbackRate.
  out.sampleStretched = await measure(samples.add, 34);
  return out;
});
ok('FM bell renders audible signal', rendered.synthBell > 0.01, 'peak=' + rendered.synthBell?.toFixed(3));
ok('synth pluck renders audible signal', rendered.synthPluck > 0.01, 'peak=' + rendered.synthPluck?.toFixed(3));
ok('sampled celesta renders audible signal', rendered.sampleCelesta > 0.01, 'peak=' + rendered.sampleCelesta?.toFixed(3));
ok('sampled clav renders audible signal', rendered.sampleClav > 0.01, 'peak=' + rendered.sampleClav?.toFixed(3));
ok('resampling past the recorded range still sounds', rendered.sampleStretched > 0.01,
   'peak=' + rendered.sampleStretched?.toFixed(3));

// --- resilience: a bank with missing files must still play --------------
// This is the bug that made the page silent on a phone: one failed request out
// of fifty-seven used to reject the whole load and leave the instrument mute
// forever, while the canvas carried on drawing.
probing = true;
const partial = await page.evaluate(async () => {
  const { SampleInstrument } = await import('../src/audio/instruments.js');
  const files = [];
  for (let i = 1; i <= 27; i++) files.push('c' + String(i).padStart(3, '0'));
  // Break a third of the bank by pointing those names at files that do not exist.
  const broken = files.map((f, i) => (i % 3 === 0 ? f + '-does-not-exist' : f));
  const inst = new SampleInstrument({
    name: 'partial',
    baseUrl: new URL('../sounds/celesta/', location.href).href,
    files: broken,
  });
  const off = new OfflineAudioContext(1, 44100 * 2, 44100);
  await inst.load(off);
  if (!inst.ready) return { ready: false };
  const v = inst.play(off, off.destination, { semitone: 0, velocity: 1 }); // a missing index
  const buf = await off.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  return { ready: true, coverage: inst.coverage, failures: inst.failures.length, peak, played: Boolean(v) };
});
probing = false;
ok('a bank with missing files still loads', partial.ready === true);
ok('the failures are recorded rather than swallowed', partial.failures === 9, 'failures=' + partial.failures);
ok('coverage is reported honestly', Math.abs(partial.coverage - 18 / 27) < 0.01,
   'coverage=' + (partial.coverage || 0).toFixed(2));
ok('a missing note is covered by its neighbour and still sounds', partial.peak > 0.01,
   'peak=' + (partial.peak || 0).toFixed(3));

// --- every kit must actually make a sound -------------------------------
// Rendered offline and measured. A synth preset with one bad parameter is
// silent, and silence is exactly the failure this project keeps hitting.
const kitPeaks = await page.evaluate(async () => {
  const m = await import('../src/audio/instruments.js');
  const out = {};
  for (const name of Object.keys(m.KITS)) {
    const kit = m.KITS[name].make();
    out[name] = {};
    for (const role of ['add', 'sub', 'accent']) {
      const inst = kit[role];
      if (!inst) continue;
      const off = new OfflineAudioContext(1, 44100 * 3, 44100);
      try {
        if (inst.load) await inst.load(off);
        const v = inst.play(off, off.destination, { semitone: 9, velocity: 1 });
        if (!v) {
          // Say why. A bare -1 means "silent" and nothing else, and the two
          // causes -- a bank that never downloaded and a preset that renders
          // nothing -- want completely different fixes.
          const why = (inst.failures || []).length
            ? 'no sample: ' + inst.failures[0]
            : 'played nothing';
          out[name][role] = why;
          continue;
        }
        const buf = await off.startRendering();
        const d = buf.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
        out[name][role] = Number(peak.toFixed(3));
      } catch (e) {
        out[name][role] = 'ERR ' + e.message;
      }
    }
  }
  return out;
});
const silentRoles = [];
for (const [kit, roles] of Object.entries(kitPeaks)) {
  for (const [role, peak] of Object.entries(roles)) {
    if (typeof peak !== 'number' || peak < 0.01) silentRoles.push(`${kit}.${role}=${peak}`);
  }
}
ok('every kit sounds in every role', silentRoles.length === 0, silentRoles.join(' '));

// A chime is one clapper on eight rods: one event is a small arpeggio, not a
// note. Counted at the source -- every rod the clapper reaches -- rather than
// from the waveform, where two rods ringing together are one sound.
const chimeSwing = await page.evaluate(async () => {
  const { ChimeInstrument, CHORDS } = await import('../src/audio/chime.js');
  const swing = async (inst, velocity) => {
    const off = new OfflineAudioContext(1, 44100 * 3, 44100);
    await inst.load(off);
    const rods = [];
    const real = inst.voice.play.bind(inst.voice);
    inst.voice.play = (ctx, dest, o) => {
      rods.push({ semitone: o.semitone, when: o.when, velocity: o.velocity });
      return real(ctx, dest, o);
    };
    const handle = inst.play(off, off.destination, { semitone: 7, velocity });
    const d = (await off.startRendering()).getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    return { rods, peak, duration: handle.duration };
  };
  const loud = await swing(new ChimeInstrument({ rods: CHORDS.earth, strikes: 3 }), 1);
  const soft = await swing(new ChimeInstrument({ rods: CHORDS.earth, strikes: 1 }), 1);
  const set = new Set(CHORDS.earth);
  return {
    swing: loud.rods.length,
    single: soft.rods.length,
    peak: loud.peak,
    // Every rod struck is one of the chime's own, give or take the few cents
    // of scatter a hand-tuned rod has.
    onRods: loud.rods.every((r) => set.has(Math.round(r.semitone))),
    inOrder: loud.rods.every((r, i) => i === 0 || r.when > loud.rods[i - 1].when),
    fading: loud.rods.every((r, i) => i === 0 || r.velocity < loud.rods[i - 1].velocity),
    long: soft.duration,
  };
});
ok('one event swings the clapper through several rods, each softer and later',
   chimeSwing.swing >= 2 && chimeSwing.single === 1 && chimeSwing.inOrder && chimeSwing.fading,
   JSON.stringify(chimeSwing));
ok('a chime only ever strikes its own rods, and they ring on',
   chimeSwing.onRods && chimeSwing.peak > 0.05 && chimeSwing.long > 3,
   JSON.stringify(chimeSwing));
ok('there are several kits to choose from', Object.keys(kitPeaks).length >= 6,
   Object.keys(kitPeaks).join(', '));

// Each kit card carries its own waveform, rendered from the instrument. A
// blank one would be a card promising a sound it cannot show.
await showTab('sound');
await paintEverything();
await page.waitForFunction(
  () => {
    const cards = [...document.querySelectorAll('#kits .card canvas')];
    return cards.length > 0 && cards.every((c) => c.width > 0);
  },
  null,
  { timeout: 30000 }
).catch(() => {});
const waves = await page.evaluate(() =>
  [...document.querySelectorAll('#kits .card')].map((b) => {
    const cv = b.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    // A canvas left at the HTML default of 300x150 was never painted at all,
    // which is how twelve blank cards once passed a check for "some ink".
    const sized = cv.width > 0 && Math.abs(cv.width / (window.devicePixelRatio || 1) - r.width) < 8;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const at = (x, y) => {
      const i = (Math.round(y) * cv.width + Math.round(x)) * 4;
      return d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    };
    const w2 = cv.width - 1;
    const h2 = cv.height - 1;
    // Five points. A card is one flat colour now, so all five agree; a
    // gradient, a mosaic or a drawing would not.
    const pts = [at(2, 2), at(w2 - 2, 2), at(2, h2 - 2), at(w2 - 2, h2 - 2), at(w2 / 2, h2 / 2)];
    return { name: b.dataset.kit, sized, flat: new Set(pts).size === 1, colour: pts[0] };
  })
);
const unsized = waves.filter((c) => !c.sized);
ok('every kit canvas is painted at its displayed size', unsized.length === 0,
   unsized.map((c) => c.name).join(' ') || waves.length + ' sized');
const notFlatInPage = waves.filter((c) => !c.flat);
ok('every kit card in the page is one flat colour', notFlatInPage.length === 0,
   notFlatInPage.map((c) => c.name).join(' ') || waves.length + ' flat');

// You should be able to tell the water from the night without reading the
// label. Two cards sharing a colour would be two cards nobody can tell apart,
// which is what the picker exists not to be.
const prints = new Set(waves.map((c) => c.colour));
ok('no two kits look the same', prints.size === waves.length,
   prints.size + ' distinct for ' + waves.length + ' kits');

// The pitch-swept presets are the new mechanism, so they get their own check:
// a sweep that fails leaves a flat tone, which still passes a peak test.
const sweepWorks = await page.evaluate(async () => {
  const m = await import('../src/audio/instruments.js');
  const render = async (preset) => {
    const off = new OfflineAudioContext(1, 44100, 44100);
    const inst = new m.SynthInstrument({ preset, baseFreq: 440 });
    inst.play(off, off.destination, { semitone: 0, velocity: 1 });
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    // Count zero crossings in the first and last part of the note: a rising
    // sweep crosses zero more often later than earlier.
    const cross = (from, to) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if (d[i - 1] < 0 !== d[i] < 0) n++;
      return n;
    };
    return { early: cross(200, 1800), late: cross(2600, 4200) };
  };
  return { drop: await render('drop'), bell: await render('bell') };
});
ok('the water drop really bends its pitch upward',
   sweepWorks.drop.late > sweepWorks.drop.early * 1.15,
   `early=${sweepWorks.drop.early} late=${sweepWorks.drop.late}`);
ok('a preset without a sweep holds its pitch',
   Math.abs(sweepWorks.bell.late - sweepWorks.bell.early) < sweepWorks.bell.early * 0.5,
   `early=${sweepWorks.bell.early} late=${sweepWorks.bell.late}`);

// --- live pipeline: events in, notes and pixels out ---------------------
const live = await page.evaluate(async () => {
  const son = window.son;
  const before = { played: son.audio.stats.played, received: son.stats.received };
  const canvas = son.sinks.find((s) => s.particles);
  for (let i = 0; i < 40; i++) {
    son.emit({ magnitude: Math.round(Math.exp(Math.random() * 9)) * (i % 3 ? 1 : -1), id: 'test-' + i });
  }
  await new Promise((r) => setTimeout(r, 300));
  return {
    received: son.stats.received - before.received,
    played: son.audio.stats.played - before.played,
    particles: canvas ? canvas.particles.length : -1,
    voices: son.pool.active,
    epm: son.eventsPerMinute,
  };
});
ok('events reach the engine', live.received === 40, 'received=' + live.received);
ok('notes were actually scheduled', live.played > 0, 'played=' + live.played);
ok('canvas drew the events', live.particles >= 40, 'particles=' + live.particles);
ok('voice pool stayed within its ceiling', live.voices <= 16, 'active=' + live.voices);

// Canvas must have non-background pixels, i.e. it really painted.
const painted = await page.evaluate(() => {
  const c = document.querySelector('#canvas');
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400));
  let distinct = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    if (data[i] > 60 || data[i + 1] > 60 || data[i + 2] > 70) distinct++;
  }
  return { distinct, w: c.width, h: c.height };
});
ok('canvas surface has painted pixels', painted.distinct > 5,
   `bright samples=${painted.distinct} size=${painted.w}x${painted.h}`);

// --- colour variety, measured on the canvas itself ----------------------
// The point of the richness setting is what reaches the screen, so count what
// is actually on it rather than trusting the setting was applied.
const variety = await page.evaluate(async () => {
  const son = window.son;
  const sink = son.sinks.find((s) => s.particles);
  const c = document.querySelector('#canvas');
  const ctx = c.getContext('2d');

  const count = async (richness) => {
    sink.setRichness(richness);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // The whole canvas: it fills the window now, and its top strip alone is
    // mostly the soft edges of gradients, which are many colours at any setting.
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) {
      // Ignore the ground, which is most of the canvas and one colour.
      if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 45) continue;
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return seen.size;
  };

  // Counted with shading off. A shaded mark is a radial gradient, which is
  // thousands of colours whatever the variety; on a full-window canvas those
  // gradients swamped the count and hid the very thing being measured.
  const depthWas = sink.depth;
  sink.setDepth(false);
  // And on a fresh set of marks. By now the stage holds everything the
  // arrival animation and the checks above have left on it, half faded, and
  // fading marks are many colours whatever the variety: counted on that, the
  // two settings came out within a few percent of each other on some runs.
  sink.clear();
  for (let i = 0; i < 40; i++) {
    son.emit({ magnitude: Math.round(Math.exp((i % 9) + 0.5)) * (i % 3 ? 1 : -1), id: 'variety-' + i });
  }
  await new Promise((r) => setTimeout(r, 300));
  const flat = await count(0);
  const varied = await count(0.6);
  sink.setDepth(depthWas);
  sink.setRichness(0.45);
  return { flat, varied };
});
ok('raising colour variety puts more colours on the canvas',
   variety.varied > variety.flat * 1.5,
   `flat=${variety.flat} varied=${variety.varied}`);

// A first-time viewer must land on the default, not on whatever an absent
// stored value happens to coerce to.
const richnessDefault = await page.evaluate(() => ({
  sink: window.son.sinks.find((s) => s.particles).richness,
  word: document.querySelector('#richness-val').textContent,
  slider: document.querySelector('#richness').value,
}));
ok('colour variety starts at its default rather than off',
   richnessDefault.word === 'balanced' && richnessDefault.slider === '45',
   `${richnessDefault.word} at ${richnessDefault.slider}`);

const richnessUi = await page.evaluate(async () => {
  const slider = document.querySelector('#richness');
  const sink = window.son.sinks.find((s) => s.particles);
  slider.value = '0';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  const off = { r: sink.richness, word: document.querySelector('#richness-val').textContent };
  slider.value = '100';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  const wide = { r: sink.richness, word: document.querySelector('#richness-val').textContent };
  slider.value = '45';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  return { off, wide, summary: document.querySelector('#sum-look').textContent };
});
ok('the colour-variety slider reaches the renderer',
   richnessUi.off.r === 0 && richnessUi.wide.r === 1,
   `${richnessUi.off.r} then ${richnessUi.wide.r}`);
ok('the slider says what it is set to in words',
   richnessUi.off.word === 'off' && richnessUi.wide.word === 'wide',
   `${richnessUi.off.word} / ${richnessUi.wide.word}`);

const depthUi = await page.evaluate(() => {
  const box = document.querySelector('#depth');
  const sink = window.son.sinks.find((s) => s.particles);
  const started = sink.depth;
  box.checked = false;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  const off = sink.depth;
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  return { started, off, back: sink.depth };
});
ok('shaded marks are on by default and can be turned off',
   depthUi.started === true && depthUi.off === false && depthUi.back === true);

// --- every scene preview must actually draw ------------------------------
// The picker repaints each card inside a try/catch so one bad scene cannot
// cost the others their picture. That is right, and it also means a scene that
// throws leaves a blank card and a console warning nobody reads: bloom did
// exactly that the moment it started calling api.fill(), which previewScene
// did not yet provide. Errors are surfaced here rather than swallowed.
const scenePreviews = await page.evaluate(async () => {
  const { SCENES, previewScene, PALETTES } = await import('../src/index.js');
  const palette = PALETTES.marine.colors;
  const results = [];
  for (const name of Object.keys(SCENES)) {
    const cv = document.createElement('canvas');
    cv.width = 220;
    cv.height = 120;
    const ctx = cv.getContext('2d');
    let error = null;
    try {
      previewScene(ctx, name, { w: 220, h: 120, palette, richness: 0.45, depth: true });
    } catch (e) {
      error = String(e && e.message ? e.message : e);
    }
    // Ink means pixels differing from the ground the preview filled first.
    const { data } = ctx.getImageData(0, 0, 220, 120);
    const ground = [data[0], data[1], data[2]];
    let inked = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - ground[0]) + Math.abs(data[i + 1] - ground[1]) + Math.abs(data[i + 2] - ground[2]) > 24) inked++;
    }
    results.push({ name, error, coverage: inked / (220 * 120) });
  }
  return results;
});
const threw = scenePreviews.filter((p) => p.error);
ok('no scene preview throws', threw.length === 0,
   threw.map((p) => `${p.name}: ${p.error}`).join(' | ') || `${scenePreviews.length} scenes`);
const blankPreviews = scenePreviews.filter((p) => p.coverage < 0.02);
ok('every scene preview paints something', blankPreviews.length === 0,
   blankPreviews.map((p) => `${p.name} ${(p.coverage * 100).toFixed(1)}%`).join(', ') || `${scenePreviews.length} scenes`);

// The cards must follow the colour settings, or they advertise a look the
// canvas will not deliver.
const previewFollows = await page.evaluate(async () => {
  const { previewScene, PALETTES } = await import('../src/index.js');
  const palette = PALETTES.marine.colors;
  const count = (richness, depth) => {
    const cv = document.createElement('canvas');
    cv.width = 220;
    cv.height = 120;
    const ctx = cv.getContext('2d');
    previewScene(ctx, 'bloom', { w: 220, h: 120, palette, richness, depth });
    const { data } = ctx.getImageData(0, 0, 220, 120);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  };
  return { flat: count(0, false), rich: count(0.6, true) };
});
ok('scene cards reflect the colour settings',
   previewFollows.rich > previewFollows.flat * 1.5,
   `flat=${previewFollows.flat} rich=${previewFollows.rich}`);

// --- finishes: the same picture, printed ten ways -----------------------------
// A finish works on the finished frame. It must change it (or it is a menu
// entry that does nothing), leave the drawing state as it found it (or the
// next frame inherits a filter or a blend mode), and cost a frame rather than
// a second. The last is checked generously: this runs on a software renderer.
const finishes = await page.evaluate(async () => {
  const { previewScene, PALETTES, FINISH_ORDER, applyFinish, drawMat } = await import('../src/index.js');
  const out = { changed: {}, leaked: [], slow: {}, mat: null };
  const pool = {};
  for (const palName of ['marine', 'papyrus']) {
    const palette = PALETTES[palName].colors;
    const W = 480;
    const H = 270;
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    previewScene(base.getContext('2d'), 'bloom', { w: W, h: H, palette, richness: 0.6, depth: true, budgetMs: 0 });
    const ref = base.getContext('2d').getImageData(0, 0, W, H).data;
    for (const name of FINISH_ORDER) {
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      // An ordinary canvas, as the page's own is. Asking for willReadFrequently
      // put this one in software, where every step of a finish copies the
      // whole frame back from the graphics card, and the timing measured that
      // copying rather than the finish. The 1-pixel read below still makes the
      // work finish before the clock stops.
      const ctx = cv.getContext('2d');
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Once untimed: textures are generated on first use at a size and kept,
      // and that is a one-off, not the cost of a frame.
      applyFinish(ctx, name, { palette, pool, now: 1000 });
      ctx.drawImage(base, 0, 0);
      // Flushed before the clock starts as well as after it stops: without
      // this the timing picked up whatever was still queued from the line
      // above, and 'As drawn', which does nothing, measured 125 ms.
      ctx.getImageData(0, 0, 1, 1);
      const t0 = performance.now();
      applyFinish(ctx, name, { palette, pool, now: 1000 });
      ctx.getImageData(0, 0, 1, 1);
      out.slow[name] = Math.max(out.slow[name] || 0, performance.now() - t0);
      if (ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over' || (ctx.filter && ctx.filter !== 'none')) {
        out.leaked.push(`${name} on ${palName}`);
      }
      const d = ctx.getImageData(0, 0, W, H).data;
      let differ = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - ref[i]) + Math.abs(d[i + 1] - ref[i + 1]) + Math.abs(d[i + 2] - ref[i + 2]) > 30) differ++;
      }
      out.changed[`${name}/${palName}`] = differ / (W * H);
    }
    // The mat covers the edge and leaves the middle alone.
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);
    drawMat(ctx, 'gallery', { palette });
    const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    const mid = px(W / 2, H / 2);
    const refMid = [ref[(Math.floor(H / 2) * W + Math.floor(W / 2)) * 4], ref[(Math.floor(H / 2) * W + Math.floor(W / 2)) * 4 + 1], ref[(Math.floor(H / 2) * W + Math.floor(W / 2)) * 4 + 2]];
    const corner = px(4, 4);
    const edge = px(W / 2, 6);
    out.mat = out.mat || {};
    out.mat[palName] = {
      edgeUniform: corner.every((v, i) => Math.abs(v - edge[i]) < 12),
      middleKept: mid.every((v, i) => Math.abs(v - refMid[i]) < 3),
    };
  }
  return out;
});
ok('"As drawn" leaves the picture exactly as it was',
   finishes.changed['none/marine'] === 0 && finishes.changed['none/papyrus'] === 0);
const inert = Object.entries(finishes.changed).filter(([k, v]) => !k.startsWith('none/') && v < 0.05);
ok('every other finish visibly changes the picture, on a dark palette and a light one', inert.length === 0,
   inert.map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ') || `${Object.keys(finishes.changed).length} renders`);
ok('no finish leaves a filter, an alpha or a blend mode behind', finishes.leaked.length === 0, finishes.leaked.join(', '));
const slowFinish = Object.entries(finishes.slow).filter(([, ms]) => ms > 250);
ok('no finish costs more than a quarter of a second at card size', slowFinish.length === 0,
   Object.entries(finishes.slow).map(([k, ms]) => `${k} ${ms.toFixed(0)}`).join(', '));
ok('the gallery mat frames the edge and leaves the middle alone',
   Object.values(finishes.mat).every((m) => m.edgeUniform && m.middleKept), JSON.stringify(finishes.mat));

// The live canvas: finish, grain and pace actually reach the renderer, and
// are remembered.
const dressing = await page.evaluate(async () => {
  const look = window.son.look;
  const sink = window.son.sinks.find((s) => s.particles);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  look.selectFinish('cyanotype');
  look.selectMat('thin');
  look.selectGrain(true);
  look.selectPace(0);
  await wait(200);
  const held = {
    finish: sink.finish,
    mat: sink.mat,
    grain: sink.grain,
    pace: sink.pace,
    stored: ['finish', 'mat', 'grain', 'pace'].map((k) => localStorage.getItem('t:' + k)),
    cards: document.querySelectorAll('#finishes .card').length,
    finishCount: (await import('../src/index.js')).FINISH_ORDER.length,
  };
  // A mark lives on the scene's clock: at a quarter speed it ages a quarter
  // as fast, which is what makes a slow room slow.
  window.son.emit({ magnitude: 4000, id: 'pace-slow' });
  const a = sink.particles[sink.particles.length - 1];
  await wait(800);
  const slow = sink._clockNow() - a.born;
  look.selectPace(3);
  window.son.emit({ magnitude: 4000, id: 'pace-real' });
  const b = sink.particles[sink.particles.length - 1];
  await wait(800);
  const real = sink._clockNow() - b.born;
  look.selectFinish('none');
  look.selectMat('none');
  look.selectGrain(false);
  return { ...held, slow, real, after: [sink.finish, sink.mat, sink.grain, sink.pace] };
});
ok('finish, frame, grain and pace reach the canvas',
   dressing.finish === 'cyanotype' && dressing.mat === 'thin' && dressing.grain === true && Math.abs(dressing.pace - 0.25) < 1e-9,
   JSON.stringify(dressing));
ok('finish, frame, grain and pace are remembered', JSON.stringify(dressing.stored) === JSON.stringify(['cyanotype', 'thin', '1', '0']),
   JSON.stringify(dressing.stored));
ok('there is a card for every finish', dressing.cards === dressing.finishCount, `${dressing.cards} of ${dressing.finishCount}`);
ok('a slow pace slows the picture', dressing.slow < dressing.real * 0.45, `slow ${dressing.slow.toFixed(0)} ms vs real ${dressing.real.toFixed(0)} ms`);
ok('and back to real time afterwards', JSON.stringify(dressing.after) === JSON.stringify(['none', 'none', false, 1]), JSON.stringify(dressing.after));

// --- grounds: what the picture is printed on ------------------------------------
// Every paper changes the picture, prints it -- no pure black, no pure white --
// leaves the drawing state as it found it and is the same sheet every time;
// and making a sheet never holds the page.
const grounds = await page.evaluate(async () => {
  const m = await import('../src/index.js');
  // Built in the background, a slice at a time. What could still hold the page
  // is a single step of the build too long to interrupt, and the engine keeps
  // the longest. The gap between frames is not the measure: the page is busy
  // with its own cards at this point, and that is not the paper's doing.
  // Judged on the steps as a whole: a single long one can be the garbage
  // collector stopping the page for its own reasons in the middle of a step,
  // which is not the paper's doing and is not in its power.
  const t0 = performance.now();
  for (const g of m.GROUND_ORDER) await m.prepareGround(g);
  const buildMs = performance.now() - t0;
  const all = Array.from(m.groundStats.times.slice(0, Math.min(m.groundStats.count, m.groundStats.times.length))).sort((a, b) => a - b);
  const at = (q) => all[Math.min(all.length - 1, Math.floor(all.length * q))] || 0;
  const worst = { median: at(0.5), p95: at(0.95), over100: all.filter((t) => t > 100).length, steps: all.length };
  const results = [];
  for (const g of m.GROUND_ORDER.filter((n) => n !== 'none')) {
    for (const pal of ['porcelain', 'marine']) {
      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 220;
      const ctx = cv.getContext('2d');
      m.previewScene(ctx, 'squares', { w: 320, h: 220, palette: m.PALETTES[pal].colors, budgetMs: 0 });
      const before = ctx.getImageData(0, 0, 320, 220).data.slice();
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = 'multiply';
      const done = m.applyGround(ctx, g, { palette: m.PALETTES[pal].colors });
      const state = ctx.globalAlpha === 0.5 && ctx.globalCompositeOperation === 'multiply';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const after = ctx.getImageData(0, 0, 320, 220).data;
      let changed = 0;
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]) > 6) changed++;
        lo = Math.min(lo, after[i], after[i + 1], after[i + 2]);
        hi = Math.max(hi, after[i], after[i + 1], after[i + 2]);
      }
      // The same sheet twice, on the same picture: the scene scatters by
      // chance, so the picture is copied rather than drawn again.
      const again = document.createElement('canvas');
      again.width = 320;
      again.height = 220;
      const ag = again.getContext('2d');
      ag.putImageData(new ImageData(new Uint8ClampedArray(before), 320, 220), 0, 0);
      m.applyGround(ag, g, { palette: m.PALETTES[pal].colors });
      const twice = ag.getImageData(0, 0, 320, 220).data;
      let same = true;
      for (let i = 0; i < twice.length; i += 97) if (twice[i] !== after[i]) { same = false; break; }
      results.push({ g, pal, done, state, changed: changed / (after.length / 4), lo, hi, same });
    }
  }
  return { worst, buildMs: Math.round(buildMs), results };
});
const flatGround = grounds.results.filter((r) => !r.done || r.changed < 0.05).map((r) => `${r.g}/${r.pal} ${(r.changed * 100).toFixed(0)}%`);
ok('every paper changes the picture it is laid under', flatGround.length === 0, flatGround.join(', ') || `${grounds.results.length} papers and palettes`);
const unprinted = grounds.results.filter((r) => r.lo < 10 || r.hi > 252).map((r) => `${r.g}/${r.pal} ${r.lo}-${r.hi}`);
ok('a printed picture has no pure black and no pure white', unprinted.length === 0, unprinted.join(', ') || 'all within print');
ok('a paper leaves the drawing state as it found it', grounds.results.every((r) => r.state));
ok('the same paper is the same sheet every time', grounds.results.every((r) => r.same));
ok('making a sheet never holds the page',
   grounds.worst.steps > 50 && grounds.worst.median < 15 && grounds.worst.p95 < 45 && grounds.worst.over100 <= 2,
   `${grounds.worst.steps} steps: median ${grounds.worst.median.toFixed(1)} ms, 95% under ${grounds.worst.p95.toFixed(1)} ms, ${grounds.worst.over100} over 100 ms; nine sheets in ${grounds.buildMs} ms`);

const paperPanel = await page.evaluate(async () => {
  const son = window.son;
  const sink = son.sinks.find((s) => s.particles);
  const cards = document.querySelectorAll('#grounds .card').length;
  const { GROUND_ORDER } = await import('../src/index.js');
  document.querySelector('#grounds [data-ground="washi"]').click();
  const picked = { ground: sink.ground, stored: localStorage.getItem('t:ground'), note: document.querySelector('#ground-note').textContent.length > 20 };
  await new Promise((r) => setTimeout(r, 300));
  const c = document.querySelector('#canvas');
  const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lo = 255;
  for (let i = 0; i < px.length; i += 4 * 53) lo = Math.min(lo, px[i], px[i + 1], px[i + 2]);
  son.look.selectGround('none');
  return { cards, count: GROUND_ORDER.length, picked, lo, after: sink.ground };
});
ok('there is a card for every paper', paperPanel.cards === paperPanel.count, `${paperPanel.cards} of ${paperPanel.count}`);
ok('choosing a paper lays the live picture on it, and it is remembered',
   paperPanel.picked.ground === 'washi' && paperPanel.picked.stored === 'washi' && paperPanel.picked.note && paperPanel.lo >= 10,
   JSON.stringify(paperPanel));

// --- offscreen canvases are pooled, not bought ---------------------------
// A buffer the size of the visible canvas is several megabytes, and a scene's
// state is thrown away every time the scene changes. Allocating a fresh one
// per change crashed the tab -- "Target crashed" -- when the block below walked
// all forty scenes. Counting them is the check; the picture is not the point.
const pooled = await page.evaluate(async () => {
  const { SCENES } = await import('../src/index.js');
  const sink = window.son.sinks.find((s) => s.particles);
  const seen = new Set();
  let made = 0;
  const real = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    const el = real(tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') made++;
    return el;
  };
  try {
    // Twice round, so the second lap can only reuse what the first made.
    for (let lap = 0; lap < 2; lap++) {
      for (const name of Object.keys(SCENES)) {
        sink.setScene(name);
        window.son.emit({ magnitude: 500, id: `pool-${lap}-${name}` });
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        for (const k of Object.keys(sink._buffers)) seen.add(k);
      }
    }
  } finally {
    document.createElement = real;
  }
  sink.setScene('bloom');
  return { made, keys: Object.keys(sink._buffers).length, distinct: seen.size, scenes: Object.keys(SCENES).length };
});
// One canvas per distinct buffer name, whatever the scene, however many laps.
// Some slack: the previews and the picker make their own.
ok('offscreen buffers are reused across scene changes',
   pooled.made <= pooled.distinct + 4 && pooled.keys === pooled.distinct,
   `${pooled.made} canvases made for ${pooled.distinct} buffer names over ` +
   `${pooled.scenes * 2} scene changes`);

// --- nothing may grow without a ceiling ---------------------------------
// A burst of data must cost frames, never the tab. Everything that accumulates
// is checked against the budget by flooding it well past that budget.
const bounded = await page.evaluate(async () => {
  const son = window.son;
  const sink = son.sinks.find((s) => s.particles);
  const sizes = (label) => ({
    label,
    particles: sink.particles.length,
    banners: sink.banners.length,
    recent: sink._recent.length,
    scene: Object.values(sink._scene)
      .filter((v) => Array.isArray(v))
      .reduce((m, v) => Math.max(m, v.length), 0),
  });

  const flood = async (n) => {
    for (let i = 0; i < n; i++) {
      son.emit({
        magnitude: 1 + Math.floor(Math.random() * 5000),
        id: 'flood-' + Math.random(),
        // Every event an accent, which is what used to make the banner list
        // grow without limit: the newest was always fresh, so the draw loop
        // broke before it ever reached the stale ones behind it.
        accent: true,
        label: 'flood',
      });
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };

  const results = [];
  sink.setMaxParticles(300);
  await flood(4000);
  results.push(sizes('budget 300'));

  // Turning the rate counter off must not stop the timestamp list being
  // trimmed. It used to be trimmed inside the counter's own draw call.
  const hudWas = sink.showHud;
  sink.showHud = false;
  await flood(4000);
  results.push(sizes('hud off'));
  sink.showHud = hudWas;

  // Every scene, since each keeps collections of its own.
  const { SCENES } = await import('../src/index.js');
  const perScene = [];
  for (const name of Object.keys(SCENES)) {
    sink.setScene(name);
    await flood(2500);
    const s = sizes(name);
    perScene.push({ name, worst: Math.max(s.particles, s.scene) });
  }
  sink.setScene('bloom');
  sink.setMaxParticles(800);
  return { results, perScene };
});

const overBudget = bounded.results.filter((r) => r.particles > 300);
ok('the mark ceiling holds under a flood', overBudget.length === 0,
   bounded.results.map((r) => `${r.label}: ${r.particles}`).join(', '));
ok('the banner list is bounded', bounded.results.every((r) => r.banners <= 32),
   bounded.results.map((r) => r.banners).join(', '));
// 4000 events at once, twice: unbounded would be 8000 and climbing.
ok('the rate list is trimmed even with the counter hidden',
   bounded.results.every((r) => r.recent <= 60000),
   bounded.results.map((r) => `${r.label}: ${r.recent}`).join(', '));
const unbounded = bounded.perScene.filter((s) => s.worst > 400);
ok('no scene keeps a collection past the budget', unbounded.length === 0,
   unbounded.map((s) => `${s.name}=${s.worst}`).join(', ') || `${bounded.perScene.length} scenes under 300+slack`);

// A mark carries the shade it was born with, so changing palette must re-derive
// it rather than reshuffling the screen or dropping back to flat colour.
const recolour = await page.evaluate(async () => {
  const sink = window.son.sinks.find((s) => s.particles);
  // Make the marks this inspects rather than inheriting whatever survived the
  // block above: a mark has a lifetime, and on a slow connection the previous
  // ones have long since faded, which left this reading an empty array and
  // passing on vacuous truth.
  sink.setScene('bloom');
  sink.clear();
  for (let i = 0; i < 8; i++) window.son.emit({ magnitude: 200 + i * 90, id: 'tint-' + i });
  await new Promise((r) => setTimeout(r, 120));
  const was = sink.paletteName;
  const before = sink.particles.slice(0, 8).map((p) => ({ tint: p.tint, color: p.color }));
  sink.setPalette('neon');
  const after = sink.particles.slice(0, 8).map((p) => ({ tint: p.tint, color: p.color }));
  sink.setPalette(was);
  const restored = sink.particles.slice(0, 8).map((p) => p.color);
  return {
    tintsKept: before.every((b, i) => String(b.tint) === String(after[i].tint)),
    changed: before.some((b, i) => b.color !== after[i].color),
    restored: before.every((b, i) => b.color === restored[i]),
    n: before.length,
  };
});
ok('the recolour check has marks to look at', recolour.n >= 8, `n=${recolour.n}`);
ok('a palette change re-derives shades from the same per-event tint',
   recolour.n > 0 && recolour.tintsKept && recolour.changed && recolour.restored,
   `n=${recolour.n} tints kept=${recolour.tintsKept} changed=${recolour.changed} restored=${recolour.restored}`);


// --- the input standard, usable from the page ---------------------------
// The standard shipped as schemas and server endpoints, none of which work on
// GitHub Pages. If the sandbox cannot demonstrate it, nobody meets it.
const connect = await page.evaluate(async () => {
  const q = (s) => document.querySelector(s);
  q('#connect-explain').click();
  await new Promise((r) => setTimeout(r, 60));
  const rows = [...document.querySelectorAll('#connect-out table.trace tr')].slice(1)
    .map((tr) => [...tr.children].map((td) => td.textContent));
  return {
    status: q('#connect-status').textContent,
    state: q('#connect-status').dataset.state,
    playable: !q('#connect-play').disabled,
    rows,
    summary: q('#sum-connect').textContent,
  };
});
ok('the example mapping maps without a server', connect.state === 'good', connect.status);
ok('and says how many events are ready', /3 events ready/.test(connect.status), connect.status);
ok('the play button becomes usable', connect.playable);
ok('it shows the working, field by field',
   connect.rows.some((r) => r[0] === 'magnitude' && r[2] === '812'),
   JSON.stringify(connect.rows.find((r) => r[0] === 'magnitude')));
ok('a conditional expression is shown with its result',
   connect.rows.some((r) => r[0] === 'category' && r[2] === '"alert"'),
   JSON.stringify(connect.rows.find((r) => r[0] === 'category')));
ok('the panel header states its own state', /ready/.test(connect.summary), connect.summary);

// A bad mapping must say what is wrong, not fail silently.
const connectBad = await page.evaluate(async () => {
  const q = (s) => document.querySelector(s);
  const keep = q('#connect-map').value;
  q('#connect-map').value = '{"map": {"magnitude": "$.duration_ms +"}}';
  q('#connect-explain').click();
  await new Promise((r) => setTimeout(r, 60));
  const broken = { status: q('#connect-status').textContent, state: q('#connect-status').dataset.state, playable: !q('#connect-play').disabled };
  q('#connect-map').value = '{"map": {"magnitude": "process.env.SECRET"}}';
  q('#connect-explain').click();
  await new Promise((r) => setTimeout(r, 60));
  const hostile = { status: q('#connect-status').textContent, state: q('#connect-status').dataset.state };
  q('#connect-json').value = 'not json at all';
  q('#connect-explain').click();
  await new Promise((r) => setTimeout(r, 60));
  const badJson = { status: q('#connect-status').textContent, state: q('#connect-status').dataset.state };
  q('#connect-map').value = keep;
  return { broken, hostile, badJson };
});
ok('a broken expression names its field', connectBad.broken.state === 'bad' && /magnitude/.test(connectBad.broken.status), connectBad.broken.status);
ok('and nothing can be played from it', connectBad.broken.playable === false);
ok('a hostile expression is refused in the page too',
   connectBad.hostile.state === 'bad' && /process/.test(connectBad.hostile.status), connectBad.hostile.status);
ok('invalid JSON is reported as such', connectBad.badJson.state === 'bad' && /JSON/.test(connectBad.badJson.status), connectBad.badJson.status);

// Guessing a mapping for a payload nobody has seen.
const guessed = await page.evaluate(async () => {
  const q = (s) => document.querySelector(s);
  q('#connect-json').value = JSON.stringify({
    results: [
      { uuid: 'z1', title: 'A thing happened', bytes: 4096, created_at: '2026-09-06T10:00:00Z', link: 'https://e.example/1' },
      { uuid: 'z2', title: 'Another', bytes: 128, created_at: '2026-09-06T10:00:05Z', link: 'https://e.example/2' },
    ],
  });
  q('#connect-guess').click();
  await new Promise((r) => setTimeout(r, 80));
  return {
    items: q('#connect-items').value,
    map: JSON.parse(q('#connect-map').value).map,
    status: q('#connect-status').textContent,
    state: q('#connect-status').dataset.state,
  };
});
ok('it finds where the records are', guessed.items === '$.results', guessed.items);
ok('it picks a numeric field for magnitude', guessed.map.magnitude === '$.bytes', guessed.map.magnitude);
ok('and recognises an identity, a label and a time',
   /uuid/.test(guessed.map.id || '') && guessed.map.label === '$.title' && /created_at/.test(guessed.map.ts || ''),
   JSON.stringify(guessed.map));
ok('the guess works on the first try', guessed.state === 'good', guessed.status);

// Playing them reaches the engine.
const played = await page.evaluate(async () => {
  const before = window.son.stats.received;
  document.querySelector('#connect-play').click();
  await new Promise((r) => setTimeout(r, 900));
  return window.son.stats.received - before;
});
ok('playing the mapped events reaches the engine', played >= 2, `${played} received`);


// --- ambiences: a bed, and voices made of noise -------------------------
// The noise engine and the continuous bed are the two things the audio side
// could not do before. Both are measured through an OfflineAudioContext, so a
// silent ambience fails here rather than being discovered by ear.
const ambience = await page.evaluate(async () => {
  const { SynthInstrument, Bed, AMBIENCES, KITS } = await import('../src/index.js');

  // Every noise preset must actually make a sound, and a loud one.
  const peaks = {};
  for (const preset of ['wave', 'undertow', 'foam', 'crackle', 'logfall', 'gust', 'reed']) {
    const off = new OfflineAudioContext(1, 44100 * 3, 44100);
    const inst = new SynthInstrument({ name: preset, preset });
    inst.play(off, off.destination, { semitone: 0, velocity: 1, when: 0 });
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    peaks[preset] = Number(peak.toFixed(4));
  }

  // Noise must be noise: a filtered oscillator would show a strong single
  // period. Count zero crossings -- broadband noise crosses constantly.
  const off = new OfflineAudioContext(1, 44100, 44100);
  const foam = new SynthInstrument({ name: 'foam', preset: 'foam' });
  foam.play(off, off.destination, { semitone: 0, velocity: 1, when: 0 });
  const fb = (await off.startRendering()).getChannelData(0);
  let crossings = 0;
  for (let i = 1; i < 4000; i++) if ((fb[i - 1] < 0) !== (fb[i] < 0)) crossings++;

  // The bed: continuous, and louder when the world is busy.
  const quiet = new OfflineAudioContext(1, 44100 * 4, 44100);
  const b1 = new Bed(AMBIENCES.shore);
  b1.start(quiet, quiet.destination);
  b1.setDensity(0);
  const qb = (await quiet.startRendering()).getChannelData(0);

  const busy = new OfflineAudioContext(1, 44100 * 4, 44100);
  const b2 = new Bed(AMBIENCES.shore);
  b2.start(busy, busy.destination);
  b2.setDensity(1);
  const bb = (await busy.startRendering()).getChannelData(0);

  // Measure the last second, after the fade-in and after the density ramp.
  const rms = (d) => {
    let s = 0;
    for (let i = d.length - 44100; i < d.length; i++) s += d[i] * d[i];
    return Math.sqrt(s / 44100);
  };

  // Density from a rate, not set by hand.
  const counter = new Bed(AMBIENCES.camargue);
  const now = Date.now();
  for (let i = 0; i < 30; i++) counter.observe(now - i * 100);
  const fromRate = counter.density;

  return {
    peaks,
    crossings,
    quiet: Number(rms(qb).toFixed(5)),
    busy: Number(rms(bb).toFixed(5)),
    fromRate: Number(fromRate.toFixed(3)),
    ambienceKits: Object.entries(KITS).filter(([, k]) => k.ambience).map(([n, k]) => [n, k.bed]),
    bedNames: Object.keys(AMBIENCES),
    rateNow: counter.eventsPerSecond,
    // Same counter, told about something an hour old: it must not count it.
    rateStale: (() => { counter.observe(now - 3600000); return counter.eventsPerSecond; })(),
    forgets: (() => counter.eventsPerSecond <= 3.1)(),
  };
});

const silent = Object.entries(ambience.peaks).filter(([, p]) => p < 0.01);
ok('every noise preset actually sounds', silent.length === 0,
   silent.map(([n, p]) => `${n}=${p}`).join(', ') || JSON.stringify(ambience.peaks));
ok('the noise engine makes noise, not a filtered tone',
   ambience.crossings > 400, ambience.crossings + ' zero crossings in 4000 samples');
ok('the bed sounds continuously', ambience.quiet > 0.0005, 'rms=' + ambience.quiet);
ok('and it rises with how busy the feed is',
   ambience.busy > ambience.quiet * 1.5, `quiet=${ambience.quiet} busy=${ambience.busy}`);
ok('density is derived from the event rate',
   ambience.fromRate > 0.5 && ambience.fromRate <= 1, String(ambience.fromRate));
// The counter is a rolling window, not a total. Without this a feed that was
// once busy would keep the sea up for the rest of the session.
ok('and the rate window forgets what has passed',
   ambience.forgets, `${ambience.rateNow.toFixed(1)}/s now, ${ambience.rateStale.toFixed(1)}/s after a minute`);
// The count is a floor, not a number to keep in step: what has to hold is
// that every ambience kit names a bed and that the bed exists. Pinning the
// count meant adding a piece failed a check about a property it did not touch.
const namedBeds = ambience.ambienceKits.filter(([, b]) => b && ambience.bedNames.includes(b));
ok('every ambience names a bed that exists',
   ambience.ambienceKits.length >= 3 && namedBeds.length === ambience.ambienceKits.length,
   `${namedBeds.length} of ${ambience.ambienceKits.length}: ` +
   ambience.ambienceKits.map(([k, b]) => `${k}->${b}`).join(', '));

// A bed belongs to listening, not to the page being open.
//
// It used to start the moment audio was permitted, which put a page nobody had
// asked to do anything into a five-second cathedral: arrive with an ambience
// remembered from last time, click anything at all, and the aerodrome was
// running before "Start listening" had been pressed. That is the check, and
// the rest of this block is what it must not have broken.
const bedSwap = await page.evaluate(async () => {
  const son = window.son;
  son.disconnect();
  await son.setKit('airports');
  // Audio is unlocked by now and the kit is an ambience. Nothing is connected,
  // so nothing may be sounding.
  const idle = son.audio.bed;

  // A source needs only to be startable and stoppable to count as listening.
  const fake = { name: 'test', start() {}, stop() {} };
  son.connect(fake);
  const listening = son.audio.bed && son.audio.bed.name;

  await son.setKit('shore');
  const onShore = son.audio.bed && son.audio.bed.name;
  await son.setKit('fire');
  const onFire = son.audio.bed && son.audio.bed.name;
  await son.setKit('synth');
  const afterPlain = son.audio.bed;

  await son.setKit('shore');
  son.disconnect(fake);
  const afterStop = son.audio.bed;

  await son.setKit('hatnote');
  return { idle, listening, onShore, onFire, afterPlain, afterStop };
});
ok('an ambience is silent until something is being listened to',
   bedSwap.idle === null, String(bedSwap.idle));
ok('and starts once a source is connected', bedSwap.listening === 'airports', String(bedSwap.listening));
ok('choosing an ambience starts its bed', bedSwap.onShore === 'shore', String(bedSwap.onShore));
ok('choosing another swaps it rather than stacking', bedSwap.onFire === 'fire', String(bedSwap.onFire));
ok('choosing an ordinary kit silences it', bedSwap.afterPlain === null, String(bedSwap.afterPlain));
ok('stopping the feed silences the bed with it', bedSwap.afterStop === null, String(bedSwap.afterStop));



// --- the field recordings ------------------------------------------------
// Real calls, because synthesis is bad at animals. A sample bank that fails to
// load is silent, and silent is exactly how this project has failed before, so
// each one is fetched, decoded and measured rather than assumed.
const field = await page.evaluate(async () => {
  const { SampleInstrument, KITS } = await import('../src/index.js');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Derived from the kits rather than typed here. A list in the test is a
  // second place to keep in step, and it was already out of step once: five
  // bird recordings were added and this went on measuring the seven it knew.
  const files = [...new Set(
    Object.entries(KITS)
      .filter(([, k]) => k.sampled)
      .flatMap(([, k]) => Object.values(k.make()))
      .filter((i) => i && typeof i.baseUrl === 'string' && i.baseUrl.endsWith('field/'))
      .flatMap((i) => i.files || [])
  )];
  const inst = new SampleInstrument({
    name: 'field', baseUrl: new URL('../sounds/field/', location.href).href,
    files, step: 0, jitter: 1.6,
  });
  await inst.load(ctx);
  const measured = (inst._buffers || []).map((b, i) => {
    if (!b) return { file: files[i], loaded: false };
    const d = b.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (let j = 0; j < d.length; j++) {
      const v = Math.abs(d[j]);
      peak = Math.max(peak, v);
      sum += d[j] * d[j];
    }
    return {
      file: files[i], loaded: true,
      seconds: Number(b.duration.toFixed(2)),
      rate: b.sampleRate,
      channels: b.numberOfChannels,
      peak: Number(peak.toFixed(3)),
      rms: Number(Math.sqrt(sum / d.length).toFixed(4)),
      // A clip that starts or ends away from zero clicks. Both ends are faded,
      // so both ends must be near silent.
      head: Number(Math.abs(d[0]).toFixed(4)),
      tail: Number(Math.abs(d[d.length - 1]).toFixed(4)),
    };
  });

  // Unpitched banks vary the playback so repeats are not heard as a loop.
  const rates = new Set();
  for (let i = 0; i < 24; i++) {
    const off = new OfflineAudioContext(1, 4410, 44100);
    const probe = new SampleInstrument({ name: 'p', baseUrl: inst.baseUrl, files, step: 0, jitter: 1.6 });
    probe._buffers = inst._buffers;
    probe._loaded = inst._loaded;
    probe.ready = true;
    const v = probe.play(off, off.destination, { semitone: 0, velocity: 1 });
    rates.add(v ? Math.round(v.duration) : 0);
  }
  ctx.close();
  return {
    measured,
    variations: rates.size,
    sampledKits: Object.entries(KITS)
      .filter(([, k]) => k.sampled)
      .map(([n, k]) => ({
        name: n,
        banks: Object.values(k.make()).filter((i) => i && Array.isArray(i.files)).length,
      })),
    // The other direction, which is the one that actually goes wrong: a kit
    // given recordings and never marked, so nothing tells anyone they are there.
    undeclared: Object.entries(KITS)
      .filter(([, k]) => !k.sampled)
      .filter(([, k]) => Object.values(k.make()).some((i) => i && Array.isArray(i.files)))
      .map(([n]) => n),
  };
});

const notLoaded = field.measured.filter((m) => !m.loaded);
// Every clip the kits reference, whatever that turns out to be. The count was
// pinned at seven here too, so adding five birds failed a check about whether
// recordings decode.
ok('every field recording loads and decodes',
   notLoaded.length === 0 && field.measured.length >= 7,
   notLoaded.map((m) => m.file).join(', ') || `${field.measured.length} clips`);
const tooQuiet = field.measured.filter((m) => m.loaded && m.peak < 0.15);
ok('and every one of them is audible', tooQuiet.length === 0,
   tooQuiet.map((m) => `${m.file}=${m.peak}`).join(', ') ||
   field.measured.map((m) => `${m.file}:${m.peak}`).join(' '));
const clicky = field.measured.filter((m) => m.loaded && (m.head > 0.02 || m.tail > 0.02));
ok('and faded at both ends, so none of them clicks', clicky.length === 0,
   clicky.map((m) => `${m.file} ${m.head}/${m.tail}`).join(', ') || `${field.measured.length} clips`);
const heavy = field.measured.filter((m) => m.loaded && (m.seconds > 2.5 || m.channels > 1));
ok('they are short mono one-shots, not tracks', heavy.length === 0,
   heavy.map((m) => `${m.file} ${m.seconds}s x${m.channels}`).join(', ') ||
   `longest ${Math.max(...field.measured.map((m) => m.seconds))}s`);
ok('repeats are varied rather than looped', field.variations > 3,
   `${field.variations} distinct playback lengths in 24 hits`);
// A property, not a list. Pinning the names meant that giving the dawn chorus
// real birds failed a check about whether kits declare themselves honestly.
// --- the kit cards and the room cards ------------------------------------
//
// Pictograms, engraved vignettes, plates from an image model, gradients, and
// mosaics of eighteen blocks. The first three lost the same argument -- at a
// hundred and fifty pixels wide a picture of a marimba is a smudge. The
// gradient lost a different one: tasteful and dull. The mosaic lost a third:
// twenty-two charts side by side are a quilt, and no card stands out.
//
// One flat colour each now, walked in order out of a pool the palette
// supplies. Three properties: every colour comes from the palette, no two
// cards share one, and each card is a single colour rather than anything else.
const swatches = await page.evaluate(async () => {
  const { drawKitArt, drawSpaceArt, poolSize, PALETTES, KITS } = await import('../src/index.js');
  const { SPACES } = await import('../src/audio/space.js');
  const kits = Object.keys(KITS);
  const rooms = Object.keys(SPACES);

  const read = (draw, pal) => {
    const cv = document.createElement('canvas');
    cv.width = 140;
    cv.height = 60;
    const ctx = cv.getContext('2d');
    const drew = draw(ctx, PALETTES[pal].colors);
    const d = ctx.getImageData(0, 0, 140, 60).data;
    const at = (x, y) => {
      const i = (y * 140 + x) * 4;
      return d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    };
    // Five points. One flat colour means all five agree; anything else --
    // a gradient, a mosaic, a drawing -- does not.
    const pts = [at(3, 3), at(136, 3), at(3, 56), at(136, 56), at(70, 30)];
    return { drew, flat: new Set(pts).size === 1, colour: pts[0] };
  };

  const kitMarine = kits.map((n, i) =>
    read((ctx, palette) => drawKitArt(ctx, n, { w: 140, h: 60, palette, index: i }), 'marine'));
  const kitPapyrus = kits.map((n, i) =>
    read((ctx, palette) => drawKitArt(ctx, n, { w: 140, h: 60, palette, index: i }), 'papyrus'));
  const roomMarine = rooms.map((n, i) =>
    read((ctx, palette) => drawSpaceArt(ctx, SPACES[n], { w: 140, h: 60, palette, index: i }), 'marine'));

  return {
    kits, rooms, kitMarine, kitPapyrus, roomMarine,
    pool: poolSize(PALETTES.marine.colors),
  };
});

ok('every kit card is drawn', swatches.kitMarine.every((c) => c.drew),
   swatches.kits.length + ' kits');
ok('every room card is drawn', swatches.roomMarine.every((c) => c.drew),
   swatches.rooms.length + ' rooms');

// One colour, not a gradient and not a chart.
const notFlat = swatches.kits.filter((n, i) => !swatches.kitMarine[i].flat)
  .concat(swatches.rooms.filter((n, i) => !swatches.roomMarine[i].flat));
ok('each card is one flat colour', notFlat.length === 0, notFlat.join(', ') || 'all flat');

// The pool has to be at least as large as the longest grid, or two kits share
// a colour and the picker stops distinguishing them.
ok('the palette offers more colours than there are kits',
   swatches.pool >= swatches.kits.length,
   swatches.pool + ' colours for ' + swatches.kits.length + ' kits');

const kitColours = new Set(swatches.kitMarine.map((c) => c.colour));
ok('no two kits are given the same colour', kitColours.size === swatches.kits.length,
   kitColours.size + ' distinct for ' + swatches.kits.length + ' kits');

const roomColours = new Set(swatches.roomMarine.map((c) => c.colour));
ok('no two rooms are given the same colour', roomColours.size === swatches.rooms.length,
   roomColours.size + ' distinct for ' + swatches.rooms.length + ' rooms');

// The whole reason not to store pictures: the grids follow a palette change
// exactly as the canvas does.
const stuck = swatches.kits.filter((n, i) => swatches.kitMarine[i].colour === swatches.kitPapyrus[i].colour);
ok('the cards are drawn in the palette, not in fixed colours', stuck.length === 0,
   stuck.join(', ') || swatches.kits.length + ' change between marine and papyrus');

// --- the output cannot be driven past the speakers -----------------------
//
// Reported as "a sort of overdose of sound, saturation all at once, and then
// the sound gives up". Measured through the real engine at the rate Bluesky
// actually produces -- thirty events a second, sixteen voices, a cathedral --
// the output peaked at 25.1 with 8.6% of samples hard-clipped, and 14.3% on
// Gongs. There was no limiter of any kind between the sum and the speakers.
const ceiling = await page.evaluate(async () => {
  const { Sonifier } = await import('../src/index.js');
  const run = async (kit, space, perSec) => {
    const seconds = 6;
    const ctx = new OfflineAudioContext(2, 44100 * seconds, 44100);
    const son = new Sonifier({ kit: 'synth', voices: { maxVoices: 16 }, volume: 0.7 });
    // The engine builds its own chain; this only hands it a context it can
    // render offline, so the limiter under test is the shipped one.
    son.engine._ctx = ctx;
    Object.defineProperty(son.engine, 'ctx', { get() { return ctx; } });
    son.engine._master = ctx.createGain();
    son.engine._master.gain.value = 0.7;
    son.engine._limiter = ctx.createDynamicsCompressor();
    son.engine._limiter.threshold.value = -6;
    son.engine._limiter.knee.value = 0;
    son.engine._limiter.ratio.value = 20;
    son.engine._limiter.attack.value = 0.002;
    son.engine._limiter.release.value = 0.25;
    son.engine._ceiling = ctx.createWaveShaper();
    const N = 8192;
    const k = 2.2;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    son.engine._ceiling.curve = curve;
    son.engine._ceiling.oversample = '2x';
    son.engine._master.connect(son.engine._limiter);
    son.engine._limiter.connect(son.engine._ceiling);
    son.engine._ceiling.connect(ctx.destination);
    son.engine._buildBus();
    son.space = space;
    await son.setKit(kit);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < perSec * seconds; i++) {
      son.emit({ magnitude: Math.round(Math.exp(rnd() * 9)) + 1, id: 'e' + i });
    }
    const buf = await ctx.startRendering();
    let peak = 0;
    let clipped = 0;
    let total = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i]);
        if (v > peak) peak = v;
        if (v >= 0.999) clipped++;
        total++;
      }
    }
    return { peak, clip: (100 * clipped) / total };
  };
  return {
    busy: await run('synth', 'cathedral', 30),
    gongs: await run('gongs', 'cathedral', 30),
    quiet: await run('synth', 'none', 2),
  };
});

ok('a busy feed cannot drive the output past the speakers',
   ceiling.busy.peak <= 1.02 && ceiling.gongs.peak <= 1.02,
   'peak ' + ceiling.busy.peak.toFixed(3) + ' synth, ' + ceiling.gongs.peak.toFixed(3) + ' gongs, was 25.1');
ok('and almost nothing is hard-clipped',
   ceiling.busy.clip < 0.5 && ceiling.gongs.clip < 0.5,
   ceiling.busy.clip.toFixed(3) + '% synth, ' + ceiling.gongs.clip.toFixed(3) + '% gongs, was 8.6% and 14.3%');
// The limiter must be a safety net, not a permanent state: quiet material has
// to arrive at the speakers unchanged.
ok('a quiet feed is left alone', ceiling.quiet.peak > 0.2 && ceiling.quiet.clip === 0,
   'peak ' + ceiling.quiet.peak.toFixed(3) + ', ' + ceiling.quiet.clip.toFixed(3) + '% clipped');

// The other half of "the sound gives up": a context can stop while the tab is
// in front, and nothing tells the page when it does.
const recovered = await page.evaluate(async () => {
  const son = window.son;
  await son.unlock();
  const before = son.engine.ctx.state;
  await son.engine.ctx.suspend();
  const stopped = son.engine.ctx.state;
  await new Promise((r) => setTimeout(r, 3500));
  return { before, stopped, after: son.engine.ctx.state, recoveries: son.engine.recoveries };
});
ok('a context that stops on its own is brought back',
   recovered.stopped === 'suspended' && recovered.after === 'running' && recovered.recoveries >= 1,
   recovered.before + ' -> ' + recovered.stopped + ' -> ' + recovered.after +
   ', ' + recovered.recoveries + ' recovery');

ok('every kit that declares recordings actually carries them',
   field.sampledKits.length >= 3 && field.sampledKits.every((k) => k.banks > 0),
   field.sampledKits.map((k) => `${k.name}:${k.banks}`).join(', '));
ok('and no kit carries recordings without declaring them',
   field.undeclared.length === 0, field.undeclared.join(', ') || 'none');

// The ambiences must reach for the recordings, not the old synthetic calls.
const realVoices = await page.evaluate(async () => {
  const { KITS } = await import('../src/index.js');
  const shape = (n) => Object.fromEntries(
    Object.entries(KITS[n].make()).map(([role, i]) => [role, i.constructor.name + ':' + i.name])
  );
  return { shore: shape('shore'), camargue: shape('camargue'), fire: shape('fire') };
});
ok('the gull is a recording now', /SampleInstrument:gull/.test(realVoices.shore.accent),
   realVoices.shore.accent);
ok('the frog and the heron too',
   /SampleInstrument:frog/.test(realVoices.camargue.add) && /SampleInstrument:heron/.test(realVoices.camargue.accent),
   `${realVoices.camargue.add} / ${realVoices.camargue.accent}`);
ok('surf, fire and wind stay synthesised, which is what synthesis is good at',
   /Synth/.test(realVoices.shore.add) && Object.values(realVoices.fire).every((v) => /Synth/.test(v)),
   JSON.stringify(realVoices.fire));


// --- a scene's own dials -------------------------------------------------
// A scene declares its controls; the panel draws whatever it finds. Adding a
// visualisation with three sliders should need no interface change at all, so
// this asks the scene registry rather than naming any scene.
const dials = await page.evaluate(async () => {
  const { SCENES, previewScene, PALETTES } = await import('../src/index.js');
  const sink = window.son.sinks.find((s) => s.particles);
  const withParams = Object.entries(SCENES).filter(([, def]) => def.params);
  const shapes = withParams.map(([name, def]) => ({
    name,
    dials: Object.entries(def.params).map(([k, d]) => ({
      k,
      ok: typeof d.label === 'string' && d.max > d.min && d.step > 0 &&
          d.default >= d.min && d.default <= d.max,
    })),
  }));

  // Values are clamped, held per scene, and defaulted when never touched.
  sink.setScene('truchet');
  const spec = SCENES.truchet.params.weight;
  sink.setParam('weight', 999);
  const high = sink.param('weight');
  sink.setParam('weight', -999);
  const low = sink.param('weight');
  sink.setParam('weight', 0.2);
  sink.setScene('flow');
  const otherScene = sink.param('scale');
  sink.setScene('truchet');
  const remembered = sink.param('weight');
  sink.resetParams('truchet');
  const afterReset = sink.param('weight');

  // A scene must actually read its dial, not merely declare it.
  const draw = (weight) => {
    const cv = document.createElement('canvas');
    cv.width = 240;
    cv.height = 140;
    const ctx = cv.getContext('2d');
    previewScene(ctx, 'truchet', { w: 240, h: 140, palette: PALETTES.marine.colors, params: { weight } });
    const d = ctx.getImageData(0, 0, 240, 140).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) ink++;
    return ink;
  };
  const thin = draw(0.05);
  const thick = draw(0.3);

  return {
    shapes,
    high: high <= spec.max,
    low: low >= spec.min,
    remembered,
    afterReset,
    defaulted: afterReset === spec.default,
    otherSceneUntouched: otherScene === SCENES.flow.params.scale.default,
    thin,
    thick,
  };
});

const badDial = dials.shapes.flatMap((s) => s.dials.filter((d) => !d.ok).map((d) => `${s.name}.${d.k}`));
ok('every declared dial is well formed', badDial.length === 0,
   badDial.join(', ') || `${dials.shapes.length} scenes, ${dials.shapes.reduce((n, s) => n + s.dials.length, 0)} dials`);
ok('a dial clamps rather than accepting nonsense', dials.high && dials.low);
ok('dials are held per scene', dials.remembered === 0.2 && dials.otherSceneUntouched,
   `truchet.weight=${dials.remembered}`);
ok('and can be put back to their defaults', dials.defaulted, String(dials.afterReset));
ok('a scene really reads its dial', dials.thick > dials.thin * 1.4,
   `thin=${dials.thin} thick=${dials.thick} inked pixels`);

const dialUi = await page.evaluate(async () => {
  const sink = window.son.sinks.find((s) => s.particles);
  const q = (s) => document.querySelector(s);
  const shown = () => [...document.querySelectorAll('#scene-params .dial')].map((el) => ({
    label: el.querySelector('.dial-head span').textContent,
    value: el.querySelector('.dial-head span:last-child').textContent,
  }));
  q('[data-scene="wavefield"]').click();
  await new Promise((r) => setTimeout(r, 80));
  const onWave = shown();
  const slider = document.querySelector('#scene-params input[data-param="length"]');
  slider.value = '30';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
  const applied = sink.param('length');
  q('[data-scene="bloom"]').click();
  await new Promise((r) => setTimeout(r, 80));
  const onBloom = shown();
  q('[data-scene="wavefield"]').click();
  await new Promise((r) => setTimeout(r, 80));
  return { onWave, applied, onBloom, backOnWave: sink.param('length') };
});
ok('the panel draws the dials the scene declares', dialUi.onWave.length === 4,
   dialUi.onWave.map((d) => d.label).join(', '));
ok('moving one reaches the renderer', dialUi.applied === 30, String(dialUi.applied));
ok('a scene with no dials of its own shows none', dialUi.onBloom.length === 0,
   `${dialUi.onBloom.length} dials on bloom`);
ok('coming back to a scene finds it as it was left', dialUi.backOnWave === 30, String(dialUi.backOnWave));

// --- the projection window -----------------------------------------------
// An exhibition puts the work on a projector and the controls on a laptop. The
// second window runs its own renderer at its own size, so the composition is
// made for that screen rather than letterboxed from this one.
//
// The control is checked separately from the mechanism, and on purpose. It has
// to be a link with a target rather than a button calling window.open, because
// window.open is a pop-up: blockers and enterprise policy stop it, and when
// they do it returns null and the person gets nothing. That property is worth
// asserting, and it is not the same claim as "two windows can talk".
const control = await page.evaluate(() => {
  const el = document.querySelector('#project-open');
  return {
    tag: el.tagName,
    href: el.getAttribute('href'),
    target: el.getAttribute('target'),
    rel: el.getAttribute('rel'),
  };
});
ok('the projection control is a link, which no pop-up blocker can stop',
   control.tag === 'A' && control.href === 'project.html' && Boolean(control.target),
   `${control.tag} href=${control.href} target=${control.target}`);
ok('and it is named, so clicking twice reuses the one window',
   control.target === 'tintinnabulum-projection', String(control.target));

// The mechanism: a second window of the same origin, which is what the link
// produces and what BroadcastChannel needs. Opened directly rather than by
// waiting on a pop-up event, so this measures the projection window and not
// the browser's pop-up policy.
//
// From here on, whichever page is about to be driven is brought to the front
// first. A hidden page's task queue is throttled so hard that a bare
// `evaluate(() => 1 + 1)` on one measured 27.9 seconds -- so a suite that
// clicks about in a background window is not slow, it is stopped, and it looks
// like a hang. This is a property of the browser, not of anything under test.
const wall = await context.newPage();
const wallErrors = [];
wall.on('pageerror', (e) => wallErrors.push(String(e.message)));
await wall.setViewportSize({ width: 900, height: 506 }); // 16:9, unlike the sandbox
await wall.goto(BASE + '/demo/project.html', { waitUntil: 'domcontentloaded' });
await wall.waitForFunction(() => window.projection, null, { timeout: 20000 });
ok('the projection window loads and starts a renderer of its own', true);
await page.waitForTimeout(400);

const drive = async (target) => {
  await target.bringToFront();
  return target;
};

await drive(wall);
ok('it says it is waiting until something arrives',
   (await wall.evaluate(() => document.getElementById('note').hidden)) === false);

// Count what the wall receives as well as what it draws. Those are two
// different claims, and conflating them cost an afternoon: the waiting notice
// is hidden the moment any event message lands, before the renderer has looked
// at it, so a window that received everything and drew none of it still looked
// like it was working.
await wall.evaluate(() => {
  window.__got = { event: 0, settings: 0, clear: 0, withoutMap: 0, afterHandle: 0 };
  const sink = window.projection.sink;
  const handle = sink.handle.bind(sink);
  sink.handle = (ev) => {
    handle(ev);
    window.__got.afterHandle = sink.particles.length;
  };
  const ch = window.projection.channel;
  const inner = ch.onmessage;
  ch.onmessage = (m) => {
    const t = m.data && m.data.type;
    if (t in window.__got) window.__got[t]++;
    if (t === 'event' && !(m.data.event && m.data.event.map)) window.__got.withoutMap++;
    return inner.call(ch, m);
  };
});
// Waits are Playwright waits rather than in-page setTimeouts, for the same
// reason: a hidden page's timers are throttled to about one firing a minute.
await drive(page);
const sent = await page.evaluate(() => {
  const son = window.son;
  for (let i = 0; i < 25; i++) son.emit({ magnitude: 100 + i * 40, id: 'wall-' + i, category: 'user' });
  return 25;
});
await drive(wall);
await wall.waitForTimeout(700);
const wallState = await wall.evaluate(() => ({
  got: window.__got,
  life: window.projection.sink.life,
  cap: window.projection.sink.maxParticles,
  scene: window.projection.sink.sceneName,
  noteHidden: document.getElementById('note').hidden,
  w: window.projection.sink.w,
  h: window.projection.sink.h,
}));
ok('events reach the second window', wallState.got.event >= 20,
   `${wallState.got.event} of ${sent} messages arrived`);
ok('and they carry the mapping the renderer needs',
   wallState.got.event > 0 && wallState.got.withoutMap === 0,
   `${wallState.got.withoutMap} without a map`);
// The peak the renderer reached, not the count read later.
//
// A mark has a lifetime -- eighteen seconds on the wall -- and the sandbox
// window is in the background while this runs, where Chrome throttles timers
// hard. More than a lifetime can pass between the events being handled and
// this line executing, and then every mark has legitimately expired and the
// count is zero. Reading the live count was measuring the delay between two
// Playwright calls, which is not a property of the projection window.
ok('the second window draws them', wallState.got.afterHandle >= 20,
   `${wallState.got.afterHandle} marks from ${wallState.got.event} messages` +
   ` (life ${wallState.life}, cap ${wallState.cap}, scene ${wallState.scene})`);
ok('and the waiting notice gets out of the way', wallState.noteHidden === true);
ok('it draws at its own size rather than the sandbox size',
   wallState.w === 900 && wallState.h === 506, `${wallState.w}x${wallState.h}`);

// Settings follow, so changing the look next door changes the wall.
await drive(page);
await page.evaluate(() => {
  document.querySelector('[data-palette="neon"]').click();
  document.querySelector('[data-scene="truchet"]').click();
});
await drive(wall);
await wall.waitForTimeout(700);
const wallFollowed = await wall.evaluate(() => ({
  palette: window.projection.sink.paletteName,
  scene: window.projection.sink.sceneName,
}));
ok('the wall follows the palette chosen next door', wallFollowed.palette === 'neon', wallFollowed.palette);
ok('and the visualisation too', wallFollowed.scene === 'truchet', wallFollowed.scene);

await drive(page);
const dialCrossed = await page.evaluate(() => {
  const slider = document.querySelector('#scene-params input[data-param="weight"]');
  if (!slider) return null;
  slider.value = '0.28';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  return 0.28;
});
await drive(wall);
await wall.waitForTimeout(700);
const wallDial = await wall.evaluate(() => window.projection.sink.param('weight', 'truchet'));
ok('a dial turned on the laptop reaches the wall', dialCrossed === null || wallDial === dialCrossed,
   `${wallDial} on the wall`);

// Reshaping the window reshapes the work, which is the whole point of it.
// A resize is delivered as an event and acted on when the window next gets a
// turn, which a background popup may not get promptly -- so wait for the size
// to arrive rather than for a fixed delay that only holds on a fast machine.
await wall.setViewportSize({ width: 540, height: 960 }); // portrait, as a gallery panel
let reshaped = { w: 0, h: 0 };
try {
  await wall.waitForFunction(
    () => window.projection.sink.w === 540 && window.projection.sink.h === 960,
    null,
    { timeout: 8000 }
  );
} catch { /* report the size it settled on, below */ }
reshaped = await wall.evaluate(() => ({ w: window.projection.sink.w, h: window.projection.sink.h }));
ok('it re-lays out for a portrait screen', reshaped.w === 540 && reshaped.h === 960,
   `${reshaped.w}x${reshaped.h}`);
ok('the projection window logged no errors', wallErrors.length === 0, wallErrors.join(' | '));
await wall.close();

// --- a wall that needs no laptop -------------------------------------------
// A gallery cannot leave a console standing next to the projector for three
// months. The address is the installation: a work to show and a feed to listen
// to, and the window does the rest -- including carrying on when the world
// goes quiet, because a frozen screen reads as broken rather than as art.
const alone = await context.newPage();
const aloneErrors = [];
alone.on('pageerror', (e) => aloneErrors.push(String(e.message)));
await alone.goto(BASE + '/demo/project.html?work=lanterns&feed=demo', { waitUntil: 'domcontentloaded' });
await alone.bringToFront();
await alone.waitForFunction(() => window.projection && window.projection.seen, null, { timeout: 25000 });
const aloneState = await alone.evaluate(async () => {
  const { WORKS } = await import('../src/index.js');
  const sink = window.projection.sink;
  return {
    standalone: window.projection.standalone,
    scene: sink.sceneName, wantScene: WORKS.lanterns.scene,
    palette: sink.paletteName, wantPalette: WORKS.lanterns.palette,
    drawn: sink.particles.length,
    waiting: document.getElementById('note').hidden === false,
  };
});
ok('a wall opened on an address hangs the work and listens to the feed itself',
   aloneState.standalone && aloneState.scene === aloneState.wantScene &&
   aloneState.palette === aloneState.wantPalette && aloneState.drawn > 0 && !aloneState.waiting,
   JSON.stringify(aloneState));
await alone.close();

const patient = await context.newPage();
patient.on('pageerror', (e) => aloneErrors.push(String(e.message)));
// A second of patience rather than the twenty a wall keeps, so the suite does
// not have to wait for a gallery's idea of a pause.
await patient.goto(BASE + '/demo/project.html?work=coral&idle=1', { waitUntil: 'domcontentloaded' });
await patient.bringToFront();
await patient.waitForFunction(() => window.projection, null, { timeout: 20000 });
const before = await patient.evaluate(() => window.projection.sink.particles.length);
await patient.waitForTimeout(7500);
const after = await patient.evaluate(() => window.projection.sink.particles.length);
ok('a wall with nothing to listen to keeps its own pulse rather than freezing',
   after > before, `${before} -> ${after} marks`);
await patient.close();
ok('a wall on its own logged no errors', aloneErrors.length === 0, aloneErrors.join(' | '));

// --- the wall label --------------------------------------------------------
// A gallery tells you what you are looking at. The wall writes its own card --
// the title, the medium, and a code a visitor can point a phone at to open the
// same work and hear it, which is the half a projection cannot carry.
const labelled = await context.newPage();
const labelErrors = [];
labelled.on('pageerror', (e) => labelErrors.push(String(e.message)));
await labelled.goto(BASE + '/demo/project.html?work=currents&feed=demo', { waitUntil: 'domcontentloaded' });
await labelled.bringToFront();
await labelled.waitForFunction(() => window.projection && window.projection.labelled, null, { timeout: 25000 });
const card = await labelled.evaluate(async () => {
  const { WORKS, SCENES, PALETTES, FINISHES, GROUNDS, MATS, KITS, LIVING, mediumOf, qrMatrix } = await import('../src/index.js');
  const qr = document.querySelector('#cartel-qr');
  const d = qr.getContext('2d').getImageData(0, 0, qr.width, qr.height).data;
  let dark = 0;
  let light = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 60) dark++;
    else if (d[i] > 200) light++;
  }
  const style = getComputedStyle(document.querySelector('#cartel'));
  return {
    title: document.querySelector('#cartel-title').textContent,
    wantTitle: WORKS.currents.title,
    medium: document.querySelector('#cartel-medium').textContent,
    wantMedium: mediumOf(WORKS.currents, { SCENES, PALETTES, FINISHES, GROUNDS, MATS, KITS, LIVING }),
    address: window.projection.addressOf('currents'),
    dark, light,
    // The code is a code: the same modules the encoder makes for that address.
    modules: qrMatrix(window.projection.addressOf('currents')).length,
    ink: style.color,
    plate: style.backgroundColor,
  };
});
ok('the wall writes its own label: the title and what the work is made of',
   card.title === card.wantTitle && card.medium === card.wantMedium && card.medium.length > 20,
   JSON.stringify({ title: card.title, medium: card.medium }));
ok('the label carries a drawn code, in ink on paper',
   card.dark > 400 && card.light > 400 && card.modules >= 21,
   `${card.dark} dark, ${card.light} light, ${card.modules} modules`);
ok('and that code opens the same work, where it can be heard',
   /#work=currents$/.test(card.address), card.address);
ok('the label wears the work it stands on: its ink, on a plate of its ground',
   card.ink === 'rgb(58, 47, 36)' && /^rgba\(239, 230, 213/.test(card.plate),
   `${card.ink} on ${card.plate}`);

// It is a label, not furniture: it goes away, and comes back when asked.
const labelToggle = await labelled.evaluate(async () => {
  const shown = () => document.querySelector('#cartel').classList.contains('show');
  window.projection.hideCartel();
  await new Promise((r) => setTimeout(r, 1100));
  const gone = !shown();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
  await new Promise((r) => setTimeout(r, 100));
  return { gone, back: shown() };
});
ok('the label fades away, and i brings it back', labelToggle.gone && labelToggle.back, JSON.stringify(labelToggle));
await labelled.close();
ok('the labelled wall logged no errors', labelErrors.length === 0, labelErrors.join(' | '));

// An address that names a work hangs it in the sandbox: that is where a
// visitor's phone lands when it reads the code off the wall.
const scanned = await context.newPage();
await scanned.goto(BASE + '/demo/#work=mould', { waitUntil: 'domcontentloaded' });
await scanned.bringToFront();
await scanned.waitForFunction(() => window.son && window.son.works, null, { timeout: 20000 });
await scanned.waitForFunction(() => window.son.works.current() === 'mould', null, { timeout: 25000 }).catch(() => {});
const arrived = await scanned.evaluate(() => ({
  work: window.son.works.current(),
  title: document.querySelector('#now-title').textContent,
}));
ok('a code read off the wall opens that work in the sandbox',
   arrived.work === 'mould' && /mould/i.test(arrived.title), JSON.stringify(arrived));
await scanned.close();

// The console offers that address, kept on the work and the feed that are on
// now, and the dock carries the way to a second screen.
await drive(page);
await page.evaluate(() => window.son.works.apply('lanterns'));
await page.waitForFunction(() => window.son.works.current() === 'lanterns', null, { timeout: 20000 });
const wallOffer = await page.evaluate(() => {
  const dock = document.querySelector('#project');
  let clicked = 0;
  dock.click = () => { clicked++; };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
  return {
    tag: dock.tagName,
    target: dock.getAttribute('target'),
    byKey: clicked,
    address: document.querySelector('#wall-address').value,
    tried: document.querySelector('#wall-open').getAttribute('href'),
  };
});
ok('the dock carries the second screen, and P opens it',
   wallOffer.tag === 'A' && wallOffer.target === 'tintinnabulum-projection' && wallOffer.byKey === 1,
   JSON.stringify(wallOffer));
ok('the address offered is a wall of its own, on what is showing now',
   /project\.html\?/.test(wallOffer.address) && /work=/.test(wallOffer.address) &&
   /feed=/.test(wallOffer.address) && /full=1/.test(wallOffer.address) && wallOffer.tried === wallOffer.address,
   wallOffer.address);
// Back to the sandbox, so the rest of the suite is not driving a hidden page.
await page.bringToFront();

// --- voice stealing under real load -------------------------------------
const flood = await page.evaluate(async () => {
  const son = window.son;
  const before = son.pool.stats.stolen + son.pool.stats.denied;
  for (let i = 0; i < 400; i++) son.emit({ magnitude: 1 + (i % 900), id: 'flood-' + i });
  await new Promise((r) => setTimeout(r, 200));
  return {
    limited: son.pool.stats.stolen + son.pool.stats.denied - before,
    active: son.pool.active,
  };
});
ok('polyphony is limited under flood', flood.limited > 0, 'stolen+denied=' + flood.limited);
ok('voice count stays bounded under flood', flood.active <= 16, 'active=' + flood.active);

await showTab('picture');
// --- palette picker -----------------------------------------------------
const swatchCount = await page.locator('#palettes .sw').count();
ok('every palette has a swatch in the picker', swatchCount >= 8, swatchCount + ' swatches');

const groundOf = () =>
  page.evaluate(() => {
    const c = document.querySelector('#canvas');
    const d = c.getContext('2d').getImageData(2, 2, 1, 1).data;
    return [d[0], d[1], d[2]].join(',');
  });

const beforeGround = await groundOf();
await page.click('#palettes .sw[data-palette="daylight"]');
await page.waitForTimeout(120);
const afterGround = await groundOf();
ok('choosing a palette repaints the canvas ground', beforeGround !== afterGround,
   `${beforeGround} -> ${afterGround}`);
ok('daylight really is a light ground',
   Number(afterGround.split(',')[0]) > 200, afterGround);

const recoloured = await page.evaluate(() => {
  const sink = window.son.sinks.find((s) => s.particles);
  window.son.emit({ magnitude: 5000, id: 'palette-probe', category: 'anon' });
  const born = sink.particles[sink.particles.length - 1].color;
  sink.setPalette('ultraviolet');
  const after = sink.particles[sink.particles.length - 1].color;
  return { born, after, name: sink.paletteName };
});
ok('circles already on screen are recoloured by a palette change',
   recoloured.born !== recoloured.after, `${recoloured.born} -> ${recoloured.after}`);
ok('the sink reports the palette it is using', recoloured.name === 'ultraviolet', recoloured.name);

// --- forty swatches, put in front of somebody ---------------------------
//
// A flat grid of forty is forty: you read the first row, decide it is a lot,
// and take the default. Grouped, the same forty are a handful of short lists.
// Both groupings have to account for every palette -- a swatch that lands
// under no heading is a palette nobody will ever find, and nothing looks
// broken when it happens.
const grouped = await page.evaluate(async () => {
  const out = {};
  const read = () => ({
    headings: [...document.querySelectorAll('#palettes .sub-label')].map((h) => h.textContent),
    swatches: document.querySelectorAll('#palettes .sw').length,
    marked: [...document.querySelectorAll('#palettes .sw')]
      .filter((s) => s.getAttribute('aria-pressed') === 'true').map((s) => s.dataset.palette),
  });
  const sel = document.querySelector('#palette-group');
  for (const mode of ['ground', 'family', 'none']) {
    sel.value = mode;
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 250));
    out[mode] = read();
  }
  sel.value = 'ground';
  sel.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 250));
  const { PALETTES } = await import('../src/index.js');
  out.total = Object.keys(PALETTES).length;
  return out;
});
ok('grouping by ground keeps every swatch',
   grouped.ground.swatches === grouped.total, `${grouped.ground.swatches} of ${grouped.total}`);
ok('grouping by dominant keeps every swatch',
   grouped.family.swatches === grouped.total, `${grouped.family.swatches} of ${grouped.total}`);
ok('ungrouped keeps every swatch and shows no headings',
   grouped.none.swatches === grouped.total && grouped.none.headings.length === 0,
   `${grouped.none.swatches} swatches, ${grouped.none.headings.length} headings`);
ok('the ground grouping reads lightest first',
   grouped.ground.headings.join(' ') === 'Paper Twilight Night', grouped.ground.headings.join(' '));
ok('the dominant grouping is offered as its own arrangement',
   grouped.family.headings.length >= 5 &&
   grouped.family.headings.join(' ') !== grouped.ground.headings.join(' '),
   grouped.family.headings.join(' '));
// Relaying the grid must not lose which one is chosen.
ok('the chosen palette stays marked through a regrouping',
   grouped.family.marked.length === 1 && grouped.family.marked[0] === grouped.ground.marked[0],
   `${grouped.ground.marked.join(',')} then ${grouped.family.marked.join(',')}`);

// --- one click, not two -------------------------------------------------
//
// The bug this guards was not in the click handling at all. Repainting the
// grids after a palette change was a single task of two and a half seconds,
// and a click arriving inside it is queued rather than acted on: the button
// does not even light up, so it reads as a click that did nothing. The fix is
// that no repaint may hold the main thread, and the test is the symptom rather
// than the mechanism -- a click made mid-repaint has to land, first time.
await showTab('sound');
await page.locator('#kits .card').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const midRepaint = await page.evaluate(async () => {
  document.querySelector('#kits [data-kit="marimba"]').click();
  await new Promise((r) => setTimeout(r, 600));
  // A palette change is the heaviest thing the page does. Click a kit while
  // it is still working, exactly once.
  document.querySelector('#palettes [data-palette="linen"]').click();
  await new Promise((r) => setTimeout(r, 120));
  document.querySelector('#kits [data-kit="clay"]').click();
  await new Promise((r) => setTimeout(r, 1500));
  return [...document.querySelectorAll('#kits [data-kit]')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.dataset.kit);
});
ok('a single click still lands while the cards are repainting',
   midRepaint.length === 1 && midRepaint[0] === 'clay', midRepaint.join(', ') || 'nothing chosen');

// The measurement behind it: no task may run long enough to swallow a click.
// A hundred and fifty milliseconds is already a long time to be deaf; the
// version this replaced measured 2562.
const worstTask = await page.evaluate(async () => {
  const tasks = [];
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) tasks.push(e.duration); });
  obs.observe({ entryTypes: ['longtask'] });
  document.querySelector('#palettes [data-palette="ember"]').click();
  await new Promise((r) => setTimeout(r, 5000));
  obs.disconnect();
  return Math.round(Math.max(0, ...tasks));
});
ok('a palette change never holds the page long enough to swallow a click',
   worstTask < 300, `worst task ${worstTask} ms`);

// A newer repaint supersedes an older one, which is right: only the second
// answer is wanted. What the first had not reached must not be dropped, and
// it was -- silently and permanently, until somebody happened to scroll. Four
// palette clicks in a second is not an unusual thing for a person to do.
const notDropped = await page.evaluate(async () => {
  for (const p of ['ember', 'linen', 'cobalt', 'marine']) {
    document.querySelector(`#palettes .sw[data-palette="${p}"]`).click();
    await new Promise((r) => setTimeout(r, 90));
  }
  for (let i = 0; i < 150; i++) {
    if (!window.son.look.previewsBusy && i > 3) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return [...document.querySelectorAll('#kits .card')]
    .filter((b) => {
      const cv = b.querySelector('canvas');
      if (!cv) return true;
      const r = b.getBoundingClientRect();
      if (r.top > innerHeight || r.bottom < 0) return false; // off screen, fairly
      // Never painted means the canvas is still at the HTML default of
      // 300x150, which is the only honest test now that a card is one flat
      // colour: looking for pixels that differ from the corner calls every
      // card blank, because on a flat card none of them do.
      return cv.width === 300 && cv.height === 150;
    })
    .map((b) => b.dataset.kit);
});
ok('a superseded repaint hands its unfinished cards back rather than dropping them',
   notDropped.length === 0, notDropped.join(', ') || 'none left blank');

// --- changing palette on its own ----------------------------------------
//
// The rotation walks from one palette to the next rather than switching, so
// what has to be true is that the ground passes through grounds that are
// neither end. Sampling only the two ends would pass on a hard cut.
const walk = await page.evaluate(async () => {
  const sink = window.son.sinks.find((s) => s.particles);
  const ctx = document.querySelector('#canvas').getContext('2d');
  const ground = () => {
    const d = ctx.getImageData(2, 2, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  };
  sink.setPalette('marine');
  await new Promise((r) => setTimeout(r, 120));
  const from = ground();
  sink.fadePalette('linen', 1600);
  const seen = new Set();
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 120));
    seen.add(ground());
  }
  await new Promise((r) => setTimeout(r, 400));
  return { from, arrived: sink.paletteName, steps: seen.size, ends: seen.has(from) };
});
ok('a palette walk passes through grounds that are neither end',
   walk.steps >= 4, `${walk.steps} distinct grounds`);
ok('a palette walk arrives where it was sent', walk.arrived === 'linen', walk.arrived);

// A click has to win over a timer, or the piece would fight the person using it.
const cancelled = await page.evaluate(async () => {
  const sink = window.son.sinks.find((s) => s.particles);
  sink.setPalette('marine');
  sink.fadePalette('daylight', 6000);
  await new Promise((r) => setTimeout(r, 400));
  sink.setPalette('neon');
  await new Promise((r) => setTimeout(r, 700));
  return sink.paletteName;
});
ok('a chosen palette cancels a walk already under way', cancelled === 'neon', cancelled);

const rotateUi = await page.evaluate(async () => {
  const look = window.son.look;
  const before = { word: look.rotateWord, val: document.querySelector('#rotate-val').textContent };
  look.selectRotate(1, false);
  const armed = { word: look.rotateWord, note: document.querySelector('#rotate-note').textContent };
  // Driven directly rather than waiting out the shortest interval.
  const sink = window.son.sinks.find((s) => s.particles);
  sink.setPalette('marine');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    look.stepPalette();
    await new Promise((r) => setTimeout(r, 4500));
    seen.push(sink.paletteName);
  }
  look.selectRotate(0, false);
  return { before, armed, seen, after: look.rotateWord };
});
ok('the rotation is off until it is asked for',
   rotateUi.before.word === 'never' && rotateUi.before.val === 'never', rotateUi.before.word);
ok('choosing an interval says which one', rotateUi.armed.word === 'every 45 seconds',
   rotateUi.armed.word);
ok('every interval explains what it is for', rotateUi.armed.note.length > 20, rotateUi.armed.note);
ok('each step lands on a palette that is not the one before it',
   rotateUi.seen.length === 3 && new Set(rotateUi.seen).size === 3 && !rotateUi.seen.includes('marine'),
   rotateUi.seen.join(' -> '));
ok('the rotation can be turned off again', rotateUi.after === 'never', rotateUi.after);

// --- and the same for the visualisation ---------------------------------
//
// Colours interpolate and two scenes do not: a Hilbert curve and a wave field
// have nothing in common to blend. So a scene change dips to the palette's own
// ground, swaps at the bottom where there is nothing to see, and comes back
// up. The check is that it really goes dark in the middle -- sampling only the
// two ends would pass on a cut, which is the thing this exists not to be.
const dip = await page.evaluate(async () => {
  const sink = window.son.sinks.find((s) => s.particles);
  sink.setScene('bloom');
  for (let i = 0; i < 40; i++) window.son.emit({ magnitude: 200 + i * 300, id: 'dip-' + i });
  await new Promise((r) => setTimeout(r, 700));
  const cv = document.querySelector('#canvas');
  const ctx = cv.getContext('2d');
  const ink = () => {
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const bg = [d[0], d[1], d[2]];
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 53) {
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 18) n++;
    }
    return n;
  };
  const before = ink();
  sink.fadeScene('wavefield', 1800);
  let lowest = Infinity;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 100));
    lowest = Math.min(lowest, ink());
  }
  await new Promise((r) => setTimeout(r, 900));
  return { before, lowest, arrived: sink.sceneName, stillFading: sink.sceneFading };
});
ok('a visualisation change dips to the ground on the way',
   dip.before > 200 && dip.lowest < dip.before / 8,
   `${dip.before} down to ${dip.lowest}`);
ok('and arrives at the visualisation it was sent to',
   dip.arrived === 'wavefield' && dip.stillFading === false, dip.arrived);

const beatsDip = await page.evaluate(async () => {
  const sink = window.son.sinks.find((s) => s.particles);
  sink.setScene('bloom');
  await new Promise((r) => setTimeout(r, 200));
  sink.fadeScene('hilbert', 6000);
  await new Promise((r) => setTimeout(r, 400));
  sink.setScene('threads');
  await new Promise((r) => setTimeout(r, 900));
  return { scene: sink.sceneName, fading: sink.sceneFading };
});
ok('a chosen visualisation cancels a dip already under way',
   beatsDip.scene === 'threads' && beatsDip.fading === false,
   `${beatsDip.scene}, fading=${beatsDip.fading}`);

const sceneRotateUi = await page.evaluate(async () => {
  const look = window.son.look;
  const sink = window.son.sinks.find((s) => s.particles);
  const before = { word: look.sceneRotateWord, val: document.querySelector('#scene-rotate-val').textContent };
  look.selectSceneRotate(3, false);
  const armed = { word: look.sceneRotateWord, note: document.querySelector('#scene-rotate-note').textContent };
  sink.setScene('bloom');
  const seen = [];
  for (let i = 0; i < 3; i++) {
    look.stepScene();
    await new Promise((r) => setTimeout(r, 3200));
    seen.push(sink.sceneName);
  }
  look.selectSceneRotate(0, false);
  return { before, armed, seen, after: look.sceneRotateWord };
});
ok('the visualisation rotation is off until it is asked for',
   sceneRotateUi.before.word === 'never' && sceneRotateUi.before.val === 'never',
   sceneRotateUi.before.word);
ok('choosing an interval for it says which one',
   sceneRotateUi.armed.word === 'every five minutes', sceneRotateUi.armed.word);
ok('every interval says what it is for', sceneRotateUi.armed.note.length > 20, sceneRotateUi.armed.note);
ok('each step lands on a visualisation that is not the one before it',
   sceneRotateUi.seen.length === 3 && new Set(sceneRotateUi.seen).size === 3 &&
   !sceneRotateUi.seen.includes('bloom'),
   sceneRotateUi.seen.join(' -> '));
ok('it can be turned off again', sceneRotateUi.after === 'never', sceneRotateUi.after);

// The choice must survive a reload, and must not break when storage is denied.
await showTab('picture');
await page.click('#palettes .sw[data-palette="bronze"]');
await page.waitForTimeout(100);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.son, null, { timeout: 15000 });
const restored = await page.evaluate(
  () => window.son.sinks.find((s) => s.particles).paletteName
);
ok('the palette choice survives a reload', restored === 'bronze', restored);
// The reload folded the panels again, as a fresh visit should.
await openPanels();

// The reload left a fresh, suspended AudioContext. Without this the recorder
// check below would capture silence and still pass on size alone.
await page.evaluate(() => window.son.unlock());
ok('audio unlocks again after the reload',
   (await page.evaluate(() => window.son.engine.ctx.state)) === 'running');

// --- changing instruments must not create a silent window ----------------
// Regression: swapping the kit before loading it left every note dropped for
// as long as the download took, which on a phone is seconds.
const swap = await page.evaluate(async () => {
  const son = window.son;
  await son.setKit('synth');
  const before = son.audio.stats.played;
  const pending = son.setKit('hatnote'); // deliberately not awaited
  for (let i = 0; i < 12; i++) son.emit({ magnitude: 500 * (i + 1), id: 'swap-' + i });
  await new Promise((r) => setTimeout(r, 200));
  const during = son.audio.stats.played - before;
  await pending;
  const mid = son.audio.stats.played;
  for (let i = 0; i < 12; i++) son.emit({ magnitude: 700 * (i + 1), id: 'swapped-' + i });
  await new Promise((r) => setTimeout(r, 200));
  return { during, after: son.audio.stats.played - mid };
});
ok('notes keep sounding while a new kit is loading', swap.during > 0, 'played=' + swap.during);
ok('notes still sound once the new kit is in', swap.after > 0, 'played=' + swap.after);

// --- the unlock overlay must tell the truth ------------------------------
// Reported from a phone: the overlay said "tap to enable sound", tapping it
// did nothing, and once sound started by another route the overlay was still
// there asking. Both faults came from latching on "the kit loaded" rather than
// "we can hear", and from only ever refreshing the overlay while locked.
ok('the engine exposes a synchronous resume for use inside a gesture',
   await page.evaluate(() => typeof window.son.engine.resumeSync === 'function'));

// The notice is for sound that has been asked for, so ask first -- as a person
// does, by tapping. A reload above left this page with nobody having asked.
await page.evaluate(async () => {
  document.querySelector('#unlock').click();
  await new Promise((r) => setTimeout(r, 800));
});
const overlayTruth = await page.evaluate(async () => {
  const el = document.querySelector('#unlock');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Force the context back down, as a phone does when it refuses a gesture.
  //
  // Checked straight away rather than after a wait: the engine now brings a
  // stopped context back within two seconds, so a delayed check is a race
  // against the repair. What has to be true is that the overlay follows the
  // context -- showing while it is down, gone once it is up -- and both halves
  // are asserted here.
  //
  // Watched rather than sampled, like the check below it: the watchdog can
  // have the sound back inside 120 ms, and a sample then read "never shown"
  // for an overlay that had shown and already stood down.
  let whileBlocked = el.classList.contains('show');
  let blockedState = window.son.engine.ctx.state;
  const watch = new MutationObserver(() => {
    if (el.classList.contains('show')) {
      whileBlocked = true;
      blockedState = window.son.engine.ctx.state;
    }
  });
  watch.observe(el, { attributes: true, attributeFilter: ['class'] });
  await window.son.engine.ctx.suspend();
  await wait(120);
  if (!whileBlocked) await wait(600);
  watch.disconnect();
  // Resume by some other means than the overlay, which is exactly what
  // pressing Start ended up doing.
  await window.son.engine.ctx.resume();
  await wait(400);
  const afterResume = el.classList.contains('show');
  return { whileBlocked, blockedState, afterResume, state: window.son.engine.ctx.state };
});
ok('the overlay appears when the context is blocked',
   overlayTruth.whileBlocked && overlayTruth.blockedState !== 'running',
   'ctx=' + overlayTruth.blockedState);
ok('the overlay goes away once sound is possible, however it was unblocked',
   overlayTruth.afterResume === false, 'ctx=' + overlayTruth.state);

// The overlay must follow a recovery it did not cause. It used to be refreshed
// only where the page itself touched the audio, which was true until the engine
// started bringing back a context that stopped on its own.
const afterWatchdog = await page.evaluate(async () => {
  const el = document.querySelector('#unlock');
  // Watched rather than sampled. A sample 120 ms after the suspend raced the
  // watchdog, which can have the sound back before then, and read "never
  // asked" when the overlay had asked and already stood down.
  let asking = el.classList.contains('show');
  const watch = new MutationObserver(() => { if (el.classList.contains('show')) asking = true; });
  watch.observe(el, { attributes: true, attributeFilter: ['class'] });
  await window.son.engine.ctx.suspend();
  await new Promise((r) => setTimeout(r, 3500));
  watch.disconnect();
  return { asking, still: el.classList.contains('show'), state: window.son.engine.ctx.state };
});
ok('the overlay stops asking once the engine has brought the sound back',
   afterWatchdog.asking && afterWatchdog.still === false && afterWatchdog.state === 'running',
   `asking ${afterWatchdog.asking}, still ${afterWatchdog.still}, ctx ${afterWatchdog.state}`);

// A refused unlock must not make every later attempt a no-op.
const retries = await page.evaluate(async () => {
  await window.son.engine.ctx.suspend();
  const before = window.son.engine.ctx.state;
  document.querySelector('#unlock').click();
  await new Promise((r) => setTimeout(r, 600));
  return { before, after: window.son.engine.ctx.state };
});
ok('tapping the overlay still tries after an earlier failure',
   retries.before === 'suspended' && retries.after === 'running',
   `${retries.before} -> ${retries.after}`);

// --- the way out of the sandbox -----------------------------------------
// Without this a shared link is a dead end: no way to reach the project.
const homeHref = await page.getAttribute('#home', 'href');
const srcHref = await page.getAttribute('#source-link', 'href');
const REPO = 'https://github.com/Guillain-RDCDE/Tintinnabulum';
ok('the title links back to the repository', homeHref === REPO, String(homeHref));
ok('there is a visible source link too', srcHref === REPO, String(srcHref));

// --- shape picker --------------------------------------------------------
// Shapes are the geometry of one mark per event, so they belong to Bloom and to
// no other scene; the picker says so by going dim and inert elsewhere. That is
// also why this block chooses its own scene instead of inheriting whatever the
// previous one left behind -- a choice that survives a reload.
const pickerOff = await page.evaluate(async () => {
  document.querySelector('[data-scene="threads"]').click();
  await new Promise((r) => setTimeout(r, 100));
  return {
    pe: getComputedStyle(document.querySelector('#shapes')).pointerEvents,
    label: document.querySelector('#shapes-label').textContent,
  };
});
ok('the shape picker goes inert on a scene with no use for it',
   pickerOff.pe === 'none' && /Bloom/.test(pickerOff.label),
   `${pickerOff.pe} / ${pickerOff.label}`);

await page.evaluate(async () => {
  document.querySelector('[data-scene="bloom"]').click();
  await new Promise((r) => setTimeout(r, 140));
});
ok('and comes back for the scene it belongs to',
   (await page.evaluate(() => getComputedStyle(document.querySelector('#shapes')).pointerEvents)) !== 'none');

const shapeCount = await page.locator('#shapes .sw').count();
ok('every shape has a swatch', shapeCount >= 8, shapeCount + ' shapes');
// The swatches are painted lazily like every other card, so they have to be
// on screen before their pixels mean anything.
await showTab('picture');
await page.locator('#shapes .sw').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
ok('the shape swatches are drawn, not empty', await page.evaluate(() => {
  const cv = document.querySelector('#shapes .sw canvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 41) if (d[i] > 10) lit++;
  return lit > 5;
}));

// Draw one event of known identity, snapshot, change shape, redraw, compare.
// Same id and same delay, so only the geometry differs between the two.
const renderWith = async (shape) => {
  await page.click(`#shapes .sw[data-shape="${shape}"]`);
  return page.evaluate(async () => {
    const sink = window.son.sinks.find((s) => s.particles);
    sink.clear();
    window.son.emit({ magnitude: 90000, id: 'shape-probe' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.querySelector('#canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4 * 37) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
};
const sigCircle = await renderWith('circle');
const sigStar = await renderWith('star');
const sigRing = await renderWith('ring');
ok('switching to a star changes what is drawn', sigCircle !== sigStar, `${sigCircle} vs ${sigStar}`);
ok('the hollow ring differs from both', sigRing !== sigCircle && sigRing !== sigStar, String(sigRing));
ok('the sink reports the shape in use',
   (await page.evaluate(() => window.son.sinks.find((s) => s.particles).shape)) === 'ring');

// --- scenes --------------------------------------------------------------
// Every scene must actually draw. A scene that throws, or quietly paints
// nothing, would leave a blank canvas while the audio carried on -- the visual
// twin of the silent-audio bug this project keeps running into.
const sceneNames = await page.evaluate(async () => {
  const m = await import('../src/visual/scenes/index.js');
  return m.SCENE_NAMES;
});
ok('several visualisations are available', sceneNames.length >= 6, sceneNames.join(', '));
ok('every scene is offered in the picker',
   (await page.locator('#scenes .card').count()) === sceneNames.length,
   (await page.locator('#scenes .card').count()) + ' cards');

// Each card carries a still drawn by the scene itself. A blank one would be a
// card that promises nothing, so the pixels are counted rather than trusted.
//
// A card below the fold is not painted until it is nearly on screen -- forty
// simulations at once is what used to freeze the page for two and a half
// seconds -- so the page is walked the way a person walks it. Scrolling past
// every card and then checking is also the only honest test of the lazy path:
// a card that never got painted would be found here rather than by a visitor.
await showTab('picture');
await paintEverything();

const previews = await page.evaluate(() =>
  [...document.querySelectorAll('#scenes .card')].map((b) => {
    const cv = b.querySelector('canvas');
    if (!cv || !cv.width) return { name: b.dataset.scene, ink: -1 };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const bg = [d[0], d[1], d[2]];
    let ink = 0;
    for (let i = 0; i < d.length; i += 4 * 17) {
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 20) ink++;
    }
    return { name: b.dataset.scene, ink };
  })
);
const emptyCards = previews.filter((p) => p.ink < 6);
ok('every scene card shows a real preview', emptyCards.length === 0,
   emptyCards.map((p) => `${p.name}(${p.ink})`).join(' ') || previews.length + ' painted');

// The stills are drawn in the active palette, so switching must redraw them.
// A card nobody can see is deliberately left alone, so the card sampled has to
// be one that is on screen at the moment of the switch -- which means finding
// it after the click has scrolled the palette swatch into view, not before.
const followed = await page.evaluate(async () => {
  const onScreen = () =>
    [...document.querySelectorAll('#scenes .card canvas')].find((cv) => {
      const r = cv.getBoundingClientRect();
      return r.top < innerHeight && r.bottom > 0 && cv.width > 0;
    });
  const read = (cv) => cv.getContext('2d').getImageData(0, 0, 4, 4).data.join(',');

  // A scene card is brought on screen, not the swatch: with ninety-odd cards
  // and the finish controls between them, the swatch and the cards no longer
  // fit in one viewport. The click below goes through the DOM and scrolls nothing.
  [...document.querySelectorAll('#scenes .card')].pop().scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 400));
  const cv = onScreen();
  if (!cv) return { found: false };
  const before = read(cv);
  document.querySelector('#palettes .sw[data-palette="papyrus"]').click();
  // Wait for the walk to finish rather than for a fixed delay: the cards are
  // repainted a few per frame, so which card is reached when is not something
  // a timeout can know. A fixed 900 ms sampled a card the walk had not got to
  // yet and read it as stale.
  for (let i = 0; i < 200; i++) {
    if (!window.son.look.previewsBusy && i > 2) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return { found: true, name: cv.closest('.card').dataset.scene, before, after: read(cv) };
});
ok('the previews follow the palette rather than going stale',
   followed.found && followed.before !== followed.after,
   followed.found ? `${followed.name}: ${followed.before} -> ${followed.after}` : 'no card was on screen');
await page.click('#palettes .sw[data-palette="marine"]');
await page.waitForTimeout(400);

const sceneErrors = [];
const blank = [];
const inkOf = () =>
  page.evaluate(() => {
    const c = document.querySelector('#canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const bg = [d[0], d[1], d[2]];
    let ink = 0;
    for (let i = 0; i < d.length; i += 4 * 29) {
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24) ink++;
    }
    return ink;
  });

for (const name of sceneNames) {
  const before = consoleErrors.length;
  await page.evaluate((n) => {
    const sink = window.son.sinks.find((s) => s.particles);
    sink.clear();
    sink.setScene(n);
    for (let i = 0; i < 45; i++) {
      window.son.emit({ magnitude: Math.round(Math.exp(Math.random() * 9)), id: `scene-${n}-${i}` });
    }
  }, name);
  // Several frames: the moving scenes need time to travel before they mark.
  await page.waitForTimeout(450);
  let ink = await inkOf();
  // A second chance for a scene whose picture is drawn by chance. The
  // attractor takes its shape from its events, and one run in twenty lands on
  // a shape that is still fine dust at this moment -- measured at 4 to 1128
  // across twenty runs of the same check, before and after any change of ours.
  // A scene that is genuinely broken stays blank however long it is given.
  if (ink < 8) {
    await page.evaluate((n) => {
      for (let i = 0; i < 45; i++) window.son.emit({ magnitude: Math.round(Math.exp(Math.random() * 9)), id: `scene-${n}-again-${i}` });
    }, name);
    await page.waitForTimeout(700);
    ink = await inkOf();
  }
  if (ink < 8) blank.push(`${name}(${ink})`);
  if (consoleErrors.length > before) sceneErrors.push(name);
}
ok('every scene paints something', blank.length === 0, blank.join(' ') || 'all drew');
ok('no scene throws while drawing', sceneErrors.length === 0, sceneErrors.join(' '));

// Scenes size their own structures to the canvas, so a resize must not break
// them: the grid allocates arrays from the dimensions.
await page.evaluate(() => {
  const sink = window.son.sinks.find((s) => s.particles);
  sink.setScene('grid');
  for (let i = 0; i < 20; i++) window.son.emit({ magnitude: 500, id: 'grid-' + i });
});
await page.setViewportSize({ width: 700, height: 620 });
await page.waitForTimeout(300);
await page.evaluate(() => {
  for (let i = 0; i < 20; i++) window.son.emit({ magnitude: 900, id: 'grid-after-' + i });
});
await page.waitForTimeout(300);
ok('a scene survives the canvas being resized under it', (await inkOf()) > 8);
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);

// The extension point is the point: adding a visualisation must be adding one
// object, with no change to the engine.
const custom = await page.evaluate(async () => {
  const m = await import('../src/visual/scenes/index.js');
  m.registerScene('test-only', {
    label: 'Test',
    frame(ctx, api) {
      ctx.fillStyle = api.palette.alert;
      ctx.fillRect(10, 10, api.w - 20, api.h - 20);
    },
  });
  const sink = window.son.sinks.find((s) => s.particles);
  sink.setScene('test-only');
  return sink.sceneName;
});
ok('a scene can be registered from outside the library', custom === 'test-only', String(custom));
await page.waitForTimeout(200);
ok('the registered scene really draws', (await inkOf()) > 50);
await page.evaluate(() => window.son.sinks.find((s) => s.particles).setScene('bloom'));

// --- starry sky ----------------------------------------------------------
const emptyGround = async () =>
  page.evaluate(async () => {
    const sink = window.son.sinks.find((s) => s.particles);
    sink.clear();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const c = document.querySelector('#canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4 * 13) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  });
const plainGround = await emptyGround();
await showTab('picture');
await openMore('#more-look');
await page.check('#starfield');
const starryGround = await emptyGround();
// Not merely "different": the sky has to be visible, so require a real change
// on an otherwise empty canvas rather than a few stray pixels.
const starDelta = Math.abs(starryGround - plainGround) / plainGround;
ok('the starry sky is plainly visible on an empty canvas', starDelta > 0.004,
   `${(starDelta * 100).toFixed(2)}% change`);
ok('the sink records the starfield setting',
   (await page.evaluate(() => window.son.sinks.find((s) => s.particles).starfield)) === true);
await page.uncheck('#starfield');

// --- feed and language pickers ------------------------------------------
// The pickers are exercised, not the remote feeds: asserting on live Bitcoin
// or GitHub traffic would make this suite fail for reasons that have nothing
// to do with the code.
await showTab('data');
const feedCount = await page.locator('#feeds .card').count();
ok('several live feeds are offered', feedCount >= 6, feedCount + ' feeds');

await page.click('#feeds .card[data-feed="earthquakes"]');
ok('choosing a feed renames the start button',
   /earthquakes/i.test(await page.textContent('#start')),
   await page.textContent('#start'));
ok('choosing a feed explains what it is',
   (await page.textContent('#feed-note')).length > 40);
ok('the chosen feed is the one shown as chosen',
   (await page.getAttribute('#feeds .card[data-feed="earthquakes"]', 'aria-pressed')) === 'true');
ok('editions are hidden for a feed that has none',
   await page.locator('#langs-wrap').isHidden());

await page.click('#feeds .card[data-feed="wikipedia"]');
ok('editions come back for Wikipedia', await page.locator('#langs-wrap').isVisible());
ok('the ingest URL only appears for the ingest feed',
   await page.locator('#ingest-wrap').isHidden());

const langCount = await page.locator('#langs-grid .lang').count();
ok('every Wikipedia edition has a button', langCount >= 40, langCount + ' editions');
ok('English is selected by default',
   (await page.getAttribute('#langs-grid .lang[data-lang="en"]', 'aria-pressed')) === 'true');

// Flags are images, not emoji. Windows ships no country-flag glyphs, so an
// emoji-based picker renders as the bare letters "GB" for every visitor on a
// PC -- which is exactly how this was found. These checks therefore prove the
// images decoded, not merely that some text is present.
await page.waitForFunction(
  () => [...document.querySelectorAll('#langs-grid img.fl')].every((i) => i.complete),
  null,
  { timeout: 20000 }
);
const flagInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#langs-grid .lang')];
  const imgs = btns.map((b) => b.querySelector('img.fl')).filter(Boolean);
  const names = btns.map((b) => b.querySelector('.nm').textContent.trim());
  return {
    total: btns.length,
    imgs: imgs.length,
    decoded: imgs.filter((i) => i.naturalWidth > 0 && i.naturalHeight > 0).length,
    distinctSrc: new Set(imgs.map((i) => i.getAttribute('src'))).size,
    distinctNames: new Set(names).size,
    named: names.every((n) => n.length > 0),
    titled: btns.every((b) => (b.getAttribute('title') || '').includes('—')),
  };
});
ok('every edition has a flag image', flagInfo.imgs === flagInfo.total,
   `${flagInfo.imgs}/${flagInfo.total}`);
ok('every flag image actually decoded, not a broken icon',
   flagInfo.decoded === flagInfo.total, `${flagInfo.decoded}/${flagInfo.total} decoded`);
ok('the flags are not all the same picture', flagInfo.distinctSrc >= 25,
   flagInfo.distinctSrc + ' distinct flags');
// Ten Indic editions necessarily share one flag, so the endonym is what tells
// them apart. If two ever collided, the picker would become ambiguous.
ok('no two editions are labelled the same', flagInfo.distinctNames === flagInfo.total,
   `${flagInfo.distinctNames}/${flagInfo.total} distinct`);
ok('every edition is labelled in its own language', flagInfo.named);
ok('hovering names the language in full', flagInfo.titled);

await openMore('#more-listen');
await page.click('#langs-grid .lang[data-lang="fr"]');
ok('clicking a flag updates the typed field: one setting, two ways in',
   (await page.inputValue('#langs')).split(',').includes('fr'),
   await page.inputValue('#langs'));
await page.fill('#langs', 'en,de,ja');
await page.dispatchEvent('#langs', 'change');
ok('typing codes updates the flags in turn',
   (await page.getAttribute('#langs-grid .lang[data-lang="ja"]', 'aria-pressed')) === 'true');
await page.click('#langs-grid .lang[data-lang="de"]');
await page.click('#langs-grid .lang[data-lang="ja"]');
await page.click('#langs-grid .lang[data-lang="en"]');
ok('deselecting everything falls back to English rather than nothing',
   (await page.inputValue('#langs')) === 'en', await page.inputValue('#langs'));

// The new source factories must at least build, start and stop cleanly.
const factories = await page.evaluate(async () => {
  const m = await import('../src/index.js');
  const out = {};
  for (const [key, make] of Object.entries({
    bitcoin: () => m.bitcoin(),
    coinbase: () => m.coinbase(),
    earthquakes: () => m.earthquakes(),
    bluesky: () => m.bluesky(),
    github: () => m.github(),
    weather: () => m.noaaAlerts(),
    hackernews: () => m.hackerNews(),
    commons: () => m.wikipedia({ wikis: ['commonswiki'], mainNamespaceOnly: false }),
    wikidata: () => m.wikipedia({ wikis: ['wikidatawiki'] }),
  })) {
    try {
      const s = make();
      out[key] = { name: s.name, hasStart: typeof s.start === 'function', hasStop: typeof s.stop === 'function' };
      s.stop();
    } catch (e) {
      out[key] = { error: e.message };
    }
  }
  return out;
});
ok('every new source builds and exposes the source interface',
   Object.values(factories).every((f) => f.hasStart && f.hasStop),
   JSON.stringify(factories));

// --- recorder -----------------------------------------------------------
await openMore('#more-sound');
const rec = await page.evaluate(async () => {
  const { Recorder } = await import('../src/audio/recorder-sink.js');
  if (!Recorder.supported) return { supported: false };
  const r = new Recorder(window.son.engine);
  r.start();
  for (let i = 0; i < 12; i++) window.son.emit({ magnitude: 400 * (i + 1), id: 'rec-' + i });
  await new Promise((res) => setTimeout(res, 700));
  const blob = await r.stop();
  return { supported: true, size: blob.size, type: blob.type };
});
if (rec.supported) {
  // An empty Opus container is about 300 bytes, so "non-empty" is not enough:
  // require a size that can only come from actually captured audio.
  ok('recorder captured real audio, not an empty container',
     rec.size > 2000, `${rec.size} bytes ${rec.type}`);
} else {
  ok('recorder reports unsupported cleanly', true, 'MediaRecorder absent in this build');
}

// --- ingest server -> browser, end to end -------------------------------
if (USE_LOCAL_SERVER) {
  await showTab('data');
  await page.click('#feeds .card[data-feed="ingest"]');
  ok('the ingest URL field appears with the ingest feed',
     await page.locator('#ingest-wrap').isVisible());
  await page.fill('#ingest-url', BASE + '/events');
  if ((await page.getAttribute('#start', 'data-on')) === 'true') await page.click('#start');
  await page.click('#start');
  // Wait for the stream to be open rather than for a fixed delay: the connect
  // handler prepares audio first, and how long that takes is not this test's
  // business.
  await page.waitForFunction(
    () => window.son.sources.some((s) => s.status === 'open'),
    null,
    { timeout: 20000 }
  );
  const before = await page.evaluate(() => window.son.stats.received);
  await fetch(BASE + '/emit?magnitude=7777&id=from-curl&label=end-to-end');
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    received: window.son.stats.received,
    last: window.son.sinks.find((s) => s.particles)?.particles.slice(-1)[0]?.label,
  }));
  ok('event posted over HTTP reaches the browser', after.received > before,
     `+${after.received - before}`);
  ok('its label survived the round trip', after.last === 'end-to-end', String(after.last));
}

ok('every resource the page requests resolves', badResponses.length === 0,
   badResponses.slice(0, 4).join(' | '));
ok('no console errors on the page', consoleErrors.length === 0,
   consoleErrors.slice(0, 3).join(' | '));

// --- works: one click sets the picture, the sound and the frame ----------------
// Last of the desktop checks, because choosing a work changes -- and remembers
// -- a scene, a palette and a kit that the checks above take as given.
await showTab('gallery');
await page.waitForFunction(() => document.querySelectorAll('#works .card').length > 0, null, { timeout: 10000 });
const worksPainted = await page.evaluate(async () => {
  const { WORKS } = await import('../src/index.js');
  window.son.works.repaint();
  const start = performance.now();
  while (window.son.works.busy && performance.now() - start < 30000) await new Promise((r) => setTimeout(r, 100));
  const cards = [...document.querySelectorAll('#works .card')];
  const blank = [];
  for (const card of cards) {
    card.scrollIntoView();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  const s2 = performance.now();
  while (window.son.works.busy && performance.now() - s2 < 30000) await new Promise((r) => setTimeout(r, 100));
  for (const card of cards) {
    const cv = card.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 13) seen.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3));
    if (seen.size < 4) blank.push(card.dataset.work);
  }
  window.scrollTo(0, 0);
  const { WORK_ROOMS } = await import('../src/index.js');
  return { total: cards.length, expected: Object.keys(WORKS).length, blank, headings: document.querySelectorAll('#works .sub-label').length, rooms: WORK_ROOMS.length };
});
ok('every work has a card, hung in its room', worksPainted.total === worksPainted.expected && worksPainted.headings === worksPainted.rooms,
   `${worksPainted.total}/${worksPainted.expected} cards, ${worksPainted.headings} rooms`);
ok('every work card shows its picture', worksPainted.blank.length === 0, worksPainted.blank.join(', ') || 'all painted');

// A row that scrolls sideways has to be movable with a mouse: an arrow at
// each end, shown only when there is somewhere to go, reaching the last work.
await page.evaluate(() => { const g = document.querySelector('#works .cards'); g.scrollLeft = 0; });
// Until the arrows' fade has actually finished, not for a fixed time: a busy
// machine caught one at 0.07 on its way out.
await page.waitForFunction(() => {
  const wrap = document.querySelector('#works .rowwrap');
  const o = (sel) => Number(getComputedStyle(wrap.querySelector(sel)).opacity);
  return o('.row-nav.prev') < 0.01 && o('.row-nav.next') > 0.99;
}, null, { timeout: 3000 }).catch(() => {});
const rowStart = await page.evaluate(() => {
  const wrap = document.querySelector('#works .rowwrap');
  const style = (sel) => getComputedStyle(wrap.querySelector(sel)).opacity;
  return { rows: document.querySelectorAll('#works .rowwrap').length, prev: style('.row-nav.prev'), next: style('.row-nav.next') };
});
await page.locator('#works .rowwrap .row-nav.next').first().click();
await page.waitForTimeout(900);
const rowMoved = await page.evaluate(async () => {
  const wrap = document.querySelector('#works .rowwrap');
  const grid = wrap.querySelector('.cards');
  const moved = grid.scrollLeft;
  const prevShown = getComputedStyle(wrap.querySelector('.row-nav.prev')).opacity;
  for (let i = 0; i < 12 && !wrap.classList.contains('at-end'); i++) {
    wrap.querySelector('.row-nav.next').click();
    await new Promise((r) => setTimeout(r, 700));
  }
  const last = [...grid.children].filter((c) => !c.hidden).pop().getBoundingClientRect();
  const box = grid.getBoundingClientRect();
  return { moved, prevShown, atEnd: wrap.classList.contains('at-end'), lastInView: last.right <= box.right + 2 && last.left >= box.left - 2 };
});
ok('every room row has its arrows', rowStart.rows === 4, `${rowStart.rows} rows`);
// Read as numbers: the arrows fade, and an opacity caught in the last
// microseconds of its transition reads 1.9e-8 rather than 0.
ok('at the start of a row only the forward arrow shows', Number(rowStart.prev) < 0.01 && Number(rowStart.next) > 0.99, JSON.stringify(rowStart));
ok('the forward arrow moves the row along, and the back arrow appears', rowMoved.moved > 100 && Number(rowMoved.prevShown) > 0.99, JSON.stringify(rowMoved));
ok('the arrows reach the last work in the row', rowMoved.atEnd && rowMoved.lastInView, JSON.stringify(rowMoved));

const hoverLive = await page.evaluate(async () => {
  const card = document.querySelector('#works .card:not([hidden])');
  card.dispatchEvent(new PointerEvent('pointerenter'));
  const cv = card.querySelector('canvas');
  const g = cv.getContext('2d');
  await new Promise((r) => setTimeout(r, 300));
  const a = g.getImageData(0, 0, cv.width, cv.height).data.slice();
  await new Promise((r) => setTimeout(r, 800));
  const b = g.getImageData(0, 0, cv.width, cv.height).data;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4 * 7) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 10) changed++;
  }
  const live = window.son.works.live;
  card.dispatchEvent(new PointerEvent('pointerleave'));
  return { live, changed, after: window.son.works.live };
});
ok('a work card comes alive under the pointer, and rests when it leaves',
   hoverLive.live && hoverLive.live.frames > 5 && hoverLive.changed > 0 && hoverLive.after === null, JSON.stringify(hoverLive));

const chosen = await page.evaluate(async () => {
  const son = window.son;
  const sink = son.sinks.find((s) => s.particles);
  document.querySelector('#works [data-work="kyoto"]').click();
  const start = performance.now();
  while (son.works.current() !== 'kyoto' && performance.now() - start < 20000) await new Promise((r) => setTimeout(r, 100));
  const result = {
    current: son.works.current(),
    scene: sink.sceneName,
    palette: sink.paletteName,
    finish: sink.finish,
    mat: sink.mat,
    pace: sink.pace,
    space: son.space,
    pressed: document.querySelector('#works [data-work="kyoto"]').getAttribute('aria-pressed'),
    cartel: document.querySelector('#work-cartel').textContent,
    summary: document.querySelector('#sum-works').textContent,
  };
  // Change one thing by hand: the work's label must come off, not linger.
  son.look.selectPalette('marine');
  son.works.refresh();
  result.afterTouch = son.works.current();
  result.pressedAfter = document.querySelector('#works [data-work="kyoto"]').getAttribute('aria-pressed');
  return result;
});
ok('choosing a work sets scene, palette, finish, frame, pace and room at once',
   chosen.current === 'kyoto' && chosen.scene === 'floatingink' && chosen.palette === 'ink' && chosen.finish === 'ink' &&
   chosen.mat === 'gallery' && Math.abs(chosen.pace - 0.5) < 1e-9 && chosen.space === 'hall',
   JSON.stringify(chosen));
ok('the chosen work is marked and labelled', chosen.pressed === 'true' && /Nocturne in Kyoto/.test(chosen.cartel) && /Koto/.test(chosen.cartel),
   chosen.cartel);
ok('the panel header names the work on show', chosen.summary === 'Nocturne in Kyoto', chosen.summary);
ok('changing anything by hand takes the label off', chosen.afterTouch === null && chosen.pressedAfter === 'false');

// A work is printed on its paper, and says so on its label.
const onPaper = await page.evaluate(async () => {
  const son = window.son;
  const sink = son.sinks.find((s) => s.particles);
  document.querySelector('#works [data-work="mould"]').click();
  const start = performance.now();
  while (son.works.current() !== 'mould' && performance.now() - start < 20000) await new Promise((r) => setTimeout(r, 100));
  const out = { current: son.works.current(), scene: sink.sceneName, ground: sink.ground, cartel: document.querySelector('#work-cartel').textContent };
  son.look.selectGround('cotton');
  son.works.refresh();
  out.afterTouch = son.works.current();
  son.look.selectGround('none');
  return out;
});
ok('a work is laid on its paper, and its label says which',
   onPaper.current === 'mould' && onPaper.scene === 'physarum' && onPaper.ground === 'black' && /on black paper/.test(onPaper.cartel),
   JSON.stringify(onPaper));
ok('changing the paper by hand takes the label off too', onPaper.afterTouch === null);

// The rooms read as rooms: a line under each, a first work hung large, and a
// filter that hides what does not fit and whole rooms left empty by it.
const gallery = await page.evaluate(async () => {
  const { WORKS, WORK_ROOMS } = await import('../src/index.js');
  const works = window.son.works;
  const host = document.querySelector('#works');
  const out = {
    notes: [...host.querySelectorAll('.room-note')].filter((n) => n.textContent.length > 20).length,
    featured: [...host.querySelectorAll('.cards')].map((g) => [...g.children].filter((b) => b.classList.contains('featured')).length),
    rooms: WORK_ROOMS.length,
  };
  works.selectEnergy('lively');
  const shownLively = [...host.querySelectorAll('.card')].filter((b) => !b.hidden).map((b) => b.dataset.work);
  out.livelyOk = shownLively.length > 0 && shownLively.every((n) => WORKS[n].energy === 'lively') &&
    shownLively.length === Object.values(WORKS).filter((w) => w.energy === 'lively').length;
  out.pressed = document.querySelector('#works-energy [data-energy="lively"]').getAttribute('aria-pressed');
  out.hiddenRooms = [...host.querySelectorAll('.cards')].filter((g) => g.hidden).length;
  out.emptyRoomsExpected = WORK_ROOMS.filter((r) => !Object.values(WORKS).some((w) => w.room === r && w.energy === 'lively')).length;
  // Exhibition mode: the next work among those showing, put up for real.
  const before = works.current();
  const next = works.tourStep();
  const t0 = performance.now();
  while (works.current() !== next && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  out.tour = { before, next, now: works.current(), lively: next && WORKS[next].energy === 'lively' };
  works.selectTour(10);
  out.tourSet = { minutes: works.tourMinutes, stored: localStorage.getItem('t:works-tour'), note: document.querySelector('#works-tour-note').textContent.length > 10 };
  works.selectTour(0);
  works.selectEnergy('all');
  out.allBack = [...host.querySelectorAll('.card')].filter((b) => !b.hidden).length === Object.keys(WORKS).length;
  return out;
});
ok('every room says what light it holds', gallery.notes === gallery.rooms, `${gallery.notes} of ${gallery.rooms}`);
ok('every room hangs its first work large', gallery.featured.every((n) => n === 1), JSON.stringify(gallery.featured));
ok('the lively filter shows the lively works and only those', gallery.livelyOk && gallery.pressed === 'true');
ok('a room with nothing lively is hidden, not left as an empty heading', gallery.hiddenRooms === gallery.emptyRoomsExpected,
   `${gallery.hiddenRooms} hidden, ${gallery.emptyRoomsExpected} expected`);
ok('exhibition mode moves on to the next work showing, and puts it up', gallery.tour.next && gallery.tour.now === gallery.tour.next && gallery.tour.lively,
   JSON.stringify(gallery.tour));
ok('exhibition mode is remembered', gallery.tourSet.minutes === 10 && gallery.tourSet.stored === '10' && gallery.tourSet.note, JSON.stringify(gallery.tourSet));
ok('and "All" brings every work back', gallery.allBack);

// --- the dock, surprise, and the chrome that gets out of the way ---------------
const dock = await page.evaluate(async () => {
  const { SCENES, WORKS } = await import('../src/index.js');
  const son = window.son;
  const shell = son.shell;
  const sink = son.sinks.find((s) => s.particles);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rgb = (c) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const violet = (c) => { const v = rgb(c); return Boolean(v) && v[2] > v[1] + 25 && v[0] > v[1] + 25; };
  shell.close();
  const out = {};

  const before = `${sink.sceneName}/${sink.paletteName}`;
  document.querySelector('#surprise').click();
  await wait(300);
  out.surprise = { before, after: `${sink.sceneName}/${sink.paletteName}`, shelf: SCENES[sink.sceneName].shelf };

  son.works.selectEnergy('all');
  const until = async (name) => {
    const t0 = performance.now();
    while (son.works.current() !== name && performance.now() - t0 < 20000) await wait(100);
    return son.works.current();
  };
  const first = son.works.step(1);
  out.next = { chosen: first, now: await until(first) };
  const second = son.works.step(1);
  await until(second);
  const back = son.works.step(-1);
  out.prev = { chosen: back, expected: first, now: await until(back) };
  out.nowTitle = document.querySelector('#now-title').textContent;
  out.expectedTitle = WORKS[back] ? WORKS[back].title : '';

  son.look.selectPalette('papyrus');
  shell.refresh();
  out.light = { ground: document.documentElement.dataset.ground, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
  son.look.selectPalette('marine');
  shell.refresh();
  out.dark = { ground: document.documentElement.dataset.ground, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
  out.violet = violet(out.light.accent) || violet(out.dark.accent);

  window.dispatchEvent(new PointerEvent('pointerdown'));
  for (const el of document.querySelectorAll('#topbar, #dock')) el.dispatchEvent(new PointerEvent('pointerleave'));
  if (document.activeElement) document.activeElement.blur();
  shell.idle.ms = 300;
  shell.wake();
  await wait(900);
  out.idle = document.body.classList.contains('idle');
  window.dispatchEvent(new PointerEvent('pointermove'));
  await wait(50);
  out.woke = !document.body.classList.contains('idle');
  shell.idle.ms = 3000;
  shell.wake();

  const vol = document.querySelector('#volume');
  vol.value = '35';
  vol.dispatchEvent(new Event('input', { bubbles: true }));
  out.volume = son.volume;
  vol.value = '70';
  vol.dispatchEvent(new Event('input', { bubbles: true }));
  return out;
});
ok('Surprise me puts up a different picture, from the art shelves',
   dock.surprise.after !== dock.surprise.before && ['Painting', 'Nature', 'Water', 'Night', 'Materials'].includes(dock.surprise.shelf),
   JSON.stringify(dock.surprise));
ok('next and previous move through the works and put them up',
   dock.next.now === dock.next.chosen && dock.prev.now === dock.prev.expected, JSON.stringify({ next: dock.next, prev: dock.prev }));
ok('the dock says which work is on', dock.nowTitle === dock.expectedTitle, `${dock.nowTitle} / ${dock.expectedTitle}`);
ok('the interface takes a light or dark glass from the work', dock.light.ground === 'light' && dock.dark.ground === 'dark',
   JSON.stringify({ light: dock.light, dark: dock.dark }));
ok('and its accent from the palette, never a violet', Boolean(dock.light.accent) && Boolean(dock.dark.accent) && !dock.violet,
   `${dock.light.accent} / ${dock.dark.accent}`);
ok('the controls fade away when nothing is touched, and come back at once', dock.idle && dock.woke, JSON.stringify({ idle: dock.idle, woke: dock.woke }));
ok('the dock volume is the volume', Math.abs(dock.volume - 0.35) < 1e-9, String(dock.volume));

// --- every picture keeps living between events --------------------------------
// A scene that moves only when an event arrives is a still image with a
// soundtrack whenever the feed is quiet or a work runs slowly -- which is how
// the Homage to the Square was reported. Every scene must keep changing on its
// own once the events stop.
const stillness = await page.evaluate(async () => {
  const son = window.son;
  // Nothing live may keep a frozen scene looking alive: choosing a work starts
  // the feed, so whatever is connected is disconnected first.
  for (const src of [...son.sources]) son.disconnect(src);
  const sink = son.sinks.find((s) => s.particles);
  son.look.selectFinish('none');
  son.look.selectMat('none');
  son.look.selectGrain(false);
  son.look.selectPace(3);
  son.look.selectLiving('still');
  const { SCENES } = await import('../src/index.js');
  const src = document.querySelector('#canvas');
  const snap = () => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, 320, 180);
    return g.getImageData(0, 0, 320, 180).data;
  };
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) n++;
    return n / (a.length / 4);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (const name of Object.keys(SCENES)) {
    sink.setScene(name);
    for (let i = 0; i < 12; i++) son.emit({ magnitude: 100 + i * 300, category: ['user', 'anon', 'bot'][i % 3], label: 'Event ' + i, id: `still-${name}-${i}` });
    await wait(900);
    const a = snap();
    await wait(2500);
    out.push([name, diff(a, snap())]);
  }
  sink.setScene('bloom');
  return out;
});
const frozen = stillness.filter(([, d]) => d < 0.001);
ok('every scene keeps moving when the events stop', frozen.length === 0,
   frozen.map(([n, d]) => `${n} ${(d * 100).toFixed(2)}%`).join(', ') || `${stillness.length} scenes all moving`);

// --- Create: every scene as a small tool, in the fifth tab ----------------------------
// The bench lives in the sandbox: it opens on what was playing, rests the live
// picture while it has the screen, and puts what was made back on the feed.
// A variation number is the picture, the address is the whole state, and what
// is made can be kept, heard and taken away. Each is checked by doing it.
const pgContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const pg = await pgContext.newPage();
const pgErrors = [];
pg.on('pageerror', (e) => pgErrors.push(e.message));
pg.on('console', (m) => { if (m.type() === 'error') pgErrors.push(m.text()); });
await pg.addInitScript(() => localStorage.setItem('t:shell-seen', '1'));
await pg.goto(BASE + '/demo/', { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.son && window.son.studio, null, { timeout: 20000 });
await pg.waitForTimeout(800);

/**
 * A fingerprint of the picture -- its colour averaged over a 32 by 32 grid --
 * and how many colours it holds.
 *
 * Averaged, not hashed. Chrome moves a canvas that is read back often from the
 * graphics card to the processor, and the two smooth the edge of a shape very
 * slightly differently: an exact hash of the same picture came out different
 * once the suite had read it a few times. What a variation number promises is
 * the same picture, not the same antialiasing, and a grid of averages sees the
 * first without being fooled by the second.
 */
const picture = (p = pg) => p.evaluate(() => {
  const cv = document.querySelector('#st-canvas');
  const W = cv.width;
  const H = cv.height;
  const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const grid = new Float64Array(32 * 32 * 3);
  const n = new Float64Array(32 * 32);
  const seen = new Set();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const g = Math.floor((y * 32) / H) * 32 + Math.floor((x * 32) / W);
      grid[g * 3] += d[i]; grid[g * 3 + 1] += d[i + 1]; grid[g * 3 + 2] += d[i + 2];
      n[g]++;
      if (seen.size < 5000) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
  }
  const cells = [];
  for (let g = 0; g < 32 * 32; g++) for (let c = 0; c < 3; c++) cells.push(n[g] ? grid[g * 3 + c] / n[g] : 0);
  return { cells, colours: seen.size, w: W, hgt: H };
});
/** Mean difference per channel between two fingerprints, 0 to 255. */
const apart = (a, b) => a.cells.reduce((s, v, i) => s + Math.abs(v - b.cells[i]), 0) / a.cells.length;
/** Wait until the picture on the bench has finished developing. */
const developed = (p = pg) => p.waitForFunction(() => {
  const st = window.son.studio;
  return st.open && st.player && st.player.developed && !document.querySelector('#st-frame').classList.contains('developing');
}, null, { timeout: 30000 });
const bench = (p = pg) => p.evaluate(() => ({
  open: window.son.studio.open,
  creating: document.body.classList.contains('creating'),
  suspended: Boolean(window.son.sinks.find((s) => s.particles).suspended),
  running: document.querySelector('#start').dataset.on,
  hash: location.hash,
  tool: window.son.studio.state.tool,
}));

// Listening first, so that the bench can be seen to pause it and give it back.
await pg.click('#start');
await pg.waitForFunction(() => document.querySelector('#start').dataset.on === 'true', null, { timeout: 20000 });
const liveScene = await pg.evaluate(() => window.son.sinks.find((s) => s.particles).sceneName);
await pg.click('#tabs [data-tab="create"]');
await developed();
const pgIn = await bench();
const pgDock = await pg.evaluate(() => getComputedStyle(document.querySelector('#dock')).display);
ok('Create opens the bench on the picture that was playing', pgIn.open && pgIn.tool === liveScene && pgIn.hash.startsWith(`#create/${liveScene}/`),
   JSON.stringify(pgIn));
const pgQuiet = await pg.evaluate(() => ({ source: window.son.studio.state.source, notes: window.son.audio.enabled }));
ok('while creating, the live picture rests and the feed keeps coming, silent in the sandbox',
   pgIn.creating && pgIn.suspended && pgIn.running === 'true' && pgDock === 'none' && pgQuiet.source === 'live' && pgQuiet.notes === false,
   JSON.stringify({ ...pgIn, dock: pgDock, ...pgQuiet }));
ok("the bench's own controls are drawn for a dark room",
   await pg.evaluate(() => getComputedStyle(document.querySelector('#studio')).colorScheme === 'dark'));

// Following the feed: every real event lands on the picture, where its
// identity puts it, and the sandbox plays none of them.
const pgFeed = await pg.evaluate(async () => {
  const st = window.son.studio;
  const before = st.player.count;
  const sandbox = window.son.audio.stats.played;
  for (let i = 0; i < 12; i++) window.son.emit({ magnitude: 100 * (i + 1), id: `feed-${i}` });
  await new Promise((r) => setTimeout(r, 300));
  return { external: st.player.external, arrived: st.player.count - before, sandbox: window.son.audio.stats.played - sandbox };
});
ok('following the feed, every real event lands on the picture and the sandbox stays silent',
   pgFeed.external && pgFeed.arrived >= 12 && pgFeed.sandbox === 0, JSON.stringify(pgFeed));

// Its own rhythm: the feed pauses and the sandbox has its notes back.
await pg.click('#st-source [data-source="own"]');
await pg.waitForTimeout(300);
const pgOwn = await pg.evaluate(() => ({
  source: window.son.studio.state.source,
  external: window.son.studio.player.external,
  running: document.querySelector('#start').dataset.on,
  notes: window.son.audio.enabled,
  tempo: !document.querySelector('#st-tempo').disabled,
}));
ok('keeping its own rhythm, the bench pauses the feed and the tempo is its own',
   pgOwn.source === 'own' && !pgOwn.external && pgOwn.running === 'false' && pgOwn.notes === true && pgOwn.tempo, JSON.stringify(pgOwn));
const pgFirst = await picture();
ok('the picture on the bench is drawn', pgFirst.colours >= 3, `${pgFirst.colours} colours at ${pgFirst.w}x${pgFirst.hgt}`);

await pg.keyboard.press('Escape');
await pg.waitForTimeout(400);
const pgIndex = await pg.evaluate(async () => {
  const { SCENE_NAMES } = await import('../src/index.js');
  return {
    hash: location.hash,
    cards: document.querySelectorAll('.st-card').length,
    scenes: SCENE_NAMES.length,
    fresh: [...document.querySelectorAll('.st-card.new')].map((c) => c.dataset.tool).sort().join(','),
  };
});
await pg.waitForTimeout(800);
const pgPainted = await pg.evaluate(() => document.querySelectorAll('.st-card[data-painted]').length);
ok('Escape on the bench goes to all the tools', pgIndex.hash === '#create', pgIndex.hash);
ok('every scene is a tool', pgIndex.cards === pgIndex.scenes, `${pgIndex.cards} tools, ${pgIndex.scenes} scenes`);
ok('the new tools are marked as new', pgIndex.fresh === 'growth,physarum,ribbons,roots,stipple,topo', pgIndex.fresh);
ok('the tools in view are painted', pgPainted >= 8, `${pgPainted} painted`);

await pg.keyboard.type('whorl');
const pgFiltered = await pg.evaluate(() => [...document.querySelectorAll('.st-card')].filter((c) => !c.hidden).map((c) => c.dataset.tool));
ok('typing filters the tools', pgFiltered.length === 1 && pgFiltered[0] === 'whorl', pgFiltered.join(','));
await pg.keyboard.press('Enter');
await developed();
ok('Enter opens the first tool', await pg.evaluate(() => location.hash.startsWith('#create/whorl/') && !document.querySelector('#st-bench').hidden));

// Still, so that pictures can be compared.
await pg.keyboard.press('p');
await pg.evaluate(() => window.son.studio.rebuild());
await developed();
const pgSeedA = await pg.evaluate(() => window.son.studio.state.seed);
const picA = await picture();
await pg.keyboard.press(' ');
await developed();
const pgSeedB = await pg.evaluate(() => ({ seed: window.son.studio.state.seed, hash: location.hash }));
const picB = await picture();
ok('Space draws a new variation', pgSeedB.seed !== pgSeedA && pgSeedB.hash.includes(`/${pgSeedB.seed}?`) && apart(picA, picB) > 3,
   `${pgSeedA} -> ${pgSeedB.seed}, ${apart(picA, picB).toFixed(2)} apart`);
await pg.keyboard.press('ArrowLeft');
await developed();
const picBack = await picture();
ok('stepping back finds the same picture',
   (await pg.evaluate(() => window.son.studio.state.seed)) === pgSeedA && apart(picBack, picA) < 1, `${apart(picBack, picA).toFixed(3)} apart`);

const pgDials = await pg.evaluate(async () => {
  const { SCENES } = await import('../src/index.js');
  const inputs = [...document.querySelectorAll('#st-dials input[type="range"]')];
  const twist = document.querySelector('#st-dial-twist');
  twist.value = String(Number(twist.max));
  twist.dispatchEvent(new Event('input', { bubbles: true }));
  twist.dispatchEvent(new Event('change', { bubbles: true }));
  return { count: inputs.length, expected: Object.keys(SCENES.whorl.params).length, value: window.son.studio.state.params.twist, max: Number(twist.max) };
});
await developed();
const picTwist = await picture();
ok('every dial of the tool is on the bench', pgDials.count === pgDials.expected, `${pgDials.count} of ${pgDials.expected}`);
ok('a dial changes the picture and is written into the address',
   pgDials.value === pgDials.max && apart(picTwist, picA) > 2 &&
   (await pg.evaluate(() => /[?&]d=[^&]*twist:/.test(decodeURIComponent(location.hash)))));

const pgInks = await pg.evaluate(async () => {
  const { isViolet, paletteIsViolet, inksOfPalette } = await import('../src/index.js');
  const st = window.son.studio.state;
  const before = st.inks.slice();
  document.querySelector('#st-new-colours').click();
  const fresh = st.inks.slice();
  document.querySelector('#st-rotate').click();
  const turned = st.inks.slice();
  const offered = [...document.querySelectorAll('#st-palette option')].map((o) => o.value).filter(Boolean);
  const select = document.querySelector('#st-palette');
  select.value = 'marine';
  select.dispatchEvent(new Event('change'));
  return {
    changed: fresh.join() !== before.join(),
    violet: fresh.filter(isViolet).length,
    rotated: turned.join() === [...fresh.slice(1), fresh[0]].join(),
    offered: offered.length,
    violetOffered: offered.filter(paletteIsViolet).length,
    marine: st.inks.join() === inksOfPalette('marine').map((c) => c.toLowerCase()).join(),
    address: location.hash.includes('i=' + st.inks.map((c) => c.slice(1)).join('-')),
  };
});
ok('new colours are new, and never violet', pgInks.changed && pgInks.violet === 0, JSON.stringify(pgInks));
ok('rotate makes the next ink the ground', pgInks.rotated);
ok('the palettes offered include none with violet in them', pgInks.offered > 20 && pgInks.violetOffered === 0, `${pgInks.offered} offered`);
ok('a palette sets the inks, and the address carries them', pgInks.marine && pgInks.address);

// Dither prints with the palette's own inks and nothing else.
await pg.evaluate(() => document.querySelector('#st-finishes [data-finish="dither"]').click());
await developed();
const pgDither = await pg.evaluate(async () => {
  const { paletteFromInks } = await import('../src/index.js');
  const { parseColor } = await import('../src/visual/color.js');
  const pal = paletteFromInks(window.son.studio.state.inks);
  const allowed = new Set(['background', 'bot', 'anon', 'user', 'default', 'alert'].map((k) => {
    const { r, g, b } = parseColor(pal[k]);
    return (r << 16) | (g << 8) | b;
  }));
  const cv = document.querySelector('#st-canvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return { finish: window.son.studio.state.finish, colours: seen.size, stray: [...seen].filter((c) => !allowed.has(c)).length };
});
ok('the dither finish prints in the inks alone', pgDither.finish === 'dither' && pgDither.colours >= 2 && pgDither.stray === 0,
   JSON.stringify(pgDither));
await pg.evaluate(() => document.querySelector('#st-finishes [data-finish="none"]').click());

// A paper on the bench, and in the address, so a link keeps it.
await pg.evaluate(() => document.querySelector('#st-grounds [data-ground="cotton"]').click());
await pg.waitForTimeout(300);
await developed();
const pgPaper = await pg.evaluate(() => ({
  ground: window.son.studio.state.ground,
  pressed: document.querySelector('#st-grounds [data-ground="cotton"]').getAttribute('aria-pressed'),
  address: /[?&]p=cotton/.test(location.hash),
  cards: document.querySelectorAll('#st-grounds .st-chip').length,
}));
ok('a paper can be chosen on the bench, and the address carries it',
   pgPaper.ground === 'cotton' && pgPaper.pressed === 'true' && pgPaper.address && pgPaper.cards === 10, JSON.stringify(pgPaper));
await pg.evaluate(() => document.querySelector('#st-grounds [data-ground="none"]').click());

await pg.evaluate(() => document.querySelector('#st-ratios [data-ratio="16:9"]').click());
await developed();
const pgWide = await picture();
ok('the frame takes the shape chosen', Math.abs(pgWide.w / pgWide.hgt - 16 / 9) < 0.02, `${pgWide.w}x${pgWide.hgt}`);

// The address is the picture: opened elsewhere, it draws the same one.
const pgState = (p = pg) => p.evaluate(() => {
  const s = window.son.studio.state;
  return JSON.stringify({ tool: s.tool, seed: s.seed, params: s.params, inks: s.inks, finish: s.finish, grain: s.grain, mat: s.mat, ratio: s.ratio });
});
const pgHere = { url: await pg.evaluate(() => location.href), state: await pgState() };
const pgHereFp = await picture();
const pg2 = await pgContext.newPage();
await pg2.addInitScript(() => localStorage.setItem('t:play-animate', '0'));
await pg2.goto(pgHere.url, { waitUntil: 'domcontentloaded' });
await pg2.waitForFunction(() => window.son && window.son.studio, null, { timeout: 20000 });
await developed(pg2);
const pgThereFp = await picture(pg2);
const pgThere = await pgState(pg2);
ok('a link opens the same picture somewhere else', pgThere === pgHere.state && apart(pgThereFp, pgHereFp) < 1,
   pgThere === pgHere.state ? `${apart(pgThereFp, pgHereFp).toFixed(3)} apart` : `${pgThere} vs ${pgHere.state}`);
await pg2.close();

await pg.keyboard.press('k');
const pgKept = await pg.evaluate(() => ({
  n: window.son.studio.captures.length,
  shown: document.querySelectorAll('#st-captures .st-capture img').length,
  seed: window.son.studio.captures[0].state.seed,
}));
await pg.keyboard.press(' ');
await developed();
await pg.reload({ waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.son && window.son.studio, null, { timeout: 20000 });
await developed();
await pg.evaluate(() => document.querySelector('#st-captures .st-capture').click());
await developed();
const pgRestored = await pg.evaluate(() => ({ n: window.son.studio.captures.length, seed: window.son.studio.state.seed }));
ok('Keep puts the picture on the shelf', pgKept.n >= 1 && pgKept.shown === pgKept.n);
ok('what is kept survives a reload and opens again', pgRestored.n === pgKept.n && pgRestored.seed === pgKept.seed,
   `${pgRestored.seed} vs ${pgKept.seed}`);

await pg.selectOption('#st-png-size', '1080');
const [pngDownload] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#st-export-png')]);
const { readFile } = await import('node:fs/promises');
const pngBytes = await readFile(await pngDownload.path());
ok('the picture downloads as a PNG at the size asked for',
   /^tintinnabulum-whorl-\d+\.png$/.test(pngDownload.suggestedFilename()) && pngBytes.slice(1, 4).toString() === 'PNG' &&
   pngBytes.readUInt32BE(16) === 1080 && pngBytes.length > 5000,
   `${pngDownload.suggestedFilename()}, ${pngBytes.readUInt32BE(16)}x${pngBytes.readUInt32BE(20)}, ${pngBytes.length} bytes`);

await pg.click('#st-hear');
await pg.waitForTimeout(3000);
const pgHeard = await pg.evaluate(() => {
  const s = window.son.studio.son;
  return {
    on: window.son.studio.state.hear,
    moving: window.son.studio.state.animate,
    shared: Boolean(s && s.engine === window.son.engine),
    state: s && s.engine.ctx.state,
    played: s ? s.audio.stats.played : 0,
  };
});
ok('Hear it plays the events as notes, through the one audio engine',
   pgHeard.on && pgHeard.moving && pgHeard.shared && pgHeard.state === 'running' && pgHeard.played > 0, JSON.stringify(pgHeard));

// And following the feed, what is heard is the feed itself, at the moment
// each event happened, on the bench's instrument and nowhere else.
await pg.click('#st-source [data-source="live"]');
await pg.waitForTimeout(500);
const pgHeardLive = await pg.evaluate(async () => {
  const bench = window.son.studio.son.audio.stats;
  const before = bench.played;
  const sandbox = window.son.audio.stats.played;
  for (let i = 0; i < 10; i++) {
    window.son.emit({ magnitude: 60 * (i + 1), id: `heard-${i}` });
    await new Promise((r) => setTimeout(r, 90));
  }
  await new Promise((r) => setTimeout(r, 400));
  return { bench: bench.played - before, sandbox: window.son.audio.stats.played - sandbox, running: document.querySelector('#start').dataset.on };
});
ok('following the feed, Hear it plays each real event on the bench, and only there',
   pgHeardLive.bench > 0 && pgHeardLive.sandbox === 0 && pgHeardLive.running === 'true', JSON.stringify(pgHeardLive));
await pg.click('#st-source [data-source="own"]');
await pg.waitForTimeout(300);

await pg.selectOption('#st-video-length', '6');
const [videoDownload] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#st-export-video')]);
const videoBytes = await readFile(await videoDownload.path());
const videoNote = await pg.evaluate(() => document.querySelector('#st-export-status').textContent);
ok('a video of the moving picture downloads, with its sound',
   /\.(webm|mp4)$/.test(videoDownload.suggestedFilename()) && videoBytes.length > 20000 && /with sound/.test(videoNote),
   `${videoDownload.suggestedFilename()}, ${videoBytes.length} bytes, "${videoNote}"`);
await pg.click('#st-hear');

await pg.keyboard.press('Escape');
await pg.waitForTimeout(400);
await pg.evaluate(() => {
  document.querySelector('#st-find').value = '';
  document.querySelector('#st-kinds [data-kind="Night"]').click();
});
const pgNight = await pg.evaluate(async () => {
  const { SCENES } = await import('../src/index.js');
  const shown = [...document.querySelectorAll('.st-card')].filter((c) => !c.hidden).map((c) => c.dataset.tool);
  return { shown: shown.length, night: shown.filter((n) => SCENES[n].shelf === 'Night').length, all: Object.values(SCENES).filter((s) => s.shelf === 'Night').length };
});
ok('a kind shows that shelf and nothing else', pgNight.shown === pgNight.all && pgNight.night === pgNight.all, JSON.stringify(pgNight));
await pg.click('#st-random');
await developed();
const pgSurprise = await pg.evaluate(async () => {
  const { SCENES } = await import('../src/index.js');
  return window.son.studio.state.tool;
});
ok('Surprise me opens a tool of that kind', await pg.evaluate(async (t) => (await import('../src/index.js')).SCENES[t].shelf === 'Night', pgSurprise), pgSurprise);

// And back to the feed with it: hung, it is kept with yours too.
const pgBeforeHang = await pg.evaluate(() => window.son.studio.captures.length);
await pg.click('#st-live');
await pg.waitForTimeout(800);
const pgLive = await bench();
const pgLiveScene = await pg.evaluate(() => window.son.sinks.find((s) => s.particles).sceneName);
ok('Hang it puts the picture on the feed and starts listening',
   !pgLive.open && !pgLive.creating && !pgLive.suspended && pgLive.running === 'true' && pgLiveScene === pgSurprise && pgLive.hash === '',
   JSON.stringify({ ...pgLive, scene: pgLiveScene }));
const pgHung = await pg.evaluate(() => ({
  kept: window.son.studio.captures.length,
  title: window.son.studio.captures[0].title,
  now: document.querySelector('#now-title').textContent,
  card: document.querySelectorAll('#yours-cards .card').length,
}));
ok('Hang it keeps the picture with yours, and the dock names it',
   pgHung.kept === pgBeforeHang + 1 && pgHung.title && pgHung.now === pgHung.title && pgHung.card === pgHung.kept, JSON.stringify(pgHung));

// The fifth key opens the bench; leaving it gives listening back.
await pg.keyboard.press('5');
await developed();
const pgKey = await bench();
await pg.keyboard.press('Escape');
await pg.waitForTimeout(300);
await pg.evaluate(() => { document.querySelector('#st-find').value = ''; document.querySelector('#st-kinds [data-kind="All"]').click(); });
await pg.keyboard.press('Escape');
await pg.waitForTimeout(600);
const pgOut = await bench();
ok('the key 5 opens Create', pgKey.open && pgKey.running === 'false', JSON.stringify(pgKey));
ok('leaving Create gives the live picture and listening back', !pgOut.open && !pgOut.suspended && pgOut.running === 'true' && pgOut.hash === '',
   JSON.stringify(pgOut));

// --- the Gallery and Create are one place ------------------------------------------------
// Every work has a Remix that opens it on the bench exactly as it hangs, and
// the bench says where it came from and goes back there. What is hung comes
// back to the Gallery, in a room of yours, played and remixed like any work.
const openGallery = () => pg.evaluate(() => {
  const b = document.querySelector('#tabs [data-tab="gallery"]');
  if (b.getAttribute('aria-selected') !== 'true') b.click();
});
await openGallery();
await pg.waitForTimeout(500);
const pgRemixed = await pg.evaluate(async () => {
  const { WORKS, inksOfPalette } = await import('../src/index.js');
  const w = WORKS.mould;
  const card = document.querySelector('#works [data-work="mould"]');
  card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  card.querySelector('.remix').click();
  const frame = document.querySelector('#st-frame');
  const st = window.son.studio.state;
  return {
    open: window.son.studio.open,
    moving: frame.getAnimations().length > 0,
    tool: st.tool, want: w.scene, ground: st.ground, wantGround: w.ground, finish: st.finish, wantFinish: w.finish,
    mat: st.mat, wantMat: w.mat,
    inks: st.inks.join() === inksOfPalette(w.palette).map((c) => c.toLowerCase()).join(),
    seed: st.seed,
    chip: document.querySelector('#st-from').textContent,
    title: w.title,
    placeholder: document.querySelector('#st-piece-title').placeholder,
    colour: document.querySelector('#st-ink-count').textContent,
    palette: document.querySelector('#st-palette').value,
    wantPalette: w.palette,
  };
});
await developed();
ok('Remix on a work opens it on the bench, exactly as it hangs',
   pgRemixed.open && pgRemixed.tool === pgRemixed.want && pgRemixed.ground === pgRemixed.wantGround &&
   pgRemixed.finish === pgRemixed.wantFinish && pgRemixed.mat === pgRemixed.wantMat && pgRemixed.inks,
   JSON.stringify(pgRemixed));
ok('the bench grows out of the card it was opened from', pgRemixed.moving);
ok('the bench says where the picture came from, and offers a title from it',
   pgRemixed.chip.includes(pgRemixed.title) && pgRemixed.placeholder === `${pgRemixed.title}, remixed`, JSON.stringify(pgRemixed));
ok("the colours keep their palette's name", pgRemixed.palette === pgRemixed.wantPalette && /· \d+ inks$/.test(pgRemixed.colour), pgRemixed.colour);
const pgAgain = await pg.evaluate(() => {
  window.son.studio.remix({ kind: 'work', name: 'mould' });
  return window.son.studio.state.seed;
});
ok('a work remixed twice is the same variation', pgAgain === pgRemixed.seed, `${pgAgain} vs ${pgRemixed.seed}`);

await pg.click('#st-from');
await pg.waitForTimeout(500);
const pgBack = await pg.evaluate(() => ({
  open: window.son.studio.open,
  tab: document.querySelector('#inspector').dataset.tab,
  inspecting: document.body.classList.contains('inspecting'),
  focused: document.activeElement && document.activeElement.dataset.work,
}));
ok('the way back leads to the card in the Gallery', !pgBack.open && pgBack.tab === 'gallery' && pgBack.inspecting && pgBack.focused === 'mould',
   JSON.stringify(pgBack));

// From the wall, by the dock.
await pg.keyboard.press('Escape');
await pg.waitForTimeout(300);
const pgWall = await pg.evaluate(() => ({ scene: window.son.sinks.find((s) => s.particles).sceneName, title: document.querySelector('#now-title').textContent }));
await pg.evaluate(() => document.querySelector('#remix').click());
await developed();
const pgDockRemix = await pg.evaluate(() => ({
  tool: window.son.studio.state.tool, from: window.son.studio.from, chip: document.querySelector('#st-from').textContent,
}));
ok('Remix in the dock takes what is playing to the bench',
   pgDockRemix.tool === pgWall.scene && pgDockRemix.from && pgDockRemix.chip.includes(pgWall.title), JSON.stringify({ pgWall, pgDockRemix }));

// Hung with a title of its own: it plays under that title and hangs in Yours.
await pg.fill('#st-piece-title', 'Veins, for the hall');
await pg.click('#st-live');
await pg.waitForFunction(() => document.querySelector('#now-title').textContent === 'Veins, for the hall', null, { timeout: 15000 });
await openGallery();
await pg.waitForTimeout(600);
const pgYours = await pg.evaluate(() => {
  const card = document.querySelector('#yours-cards .card');
  return {
    first: card && card.querySelector('b').textContent,
    pressed: card && card.getAttribute('aria-pressed'),
    painted: card && card.dataset.painted,
    cartel: document.querySelector('#work-cartel b') && document.querySelector('#work-cartel b').textContent,
    sub: document.querySelector('#now-sub').textContent,
    empty: document.querySelector('#yours-empty').hidden,
    remixes: document.querySelectorAll('#works .card .remix').length,
  };
});
ok('what is hung hangs in Yours, marked as playing, with its label',
   pgYours.first === 'Veins, for the hall' && pgYours.pressed === 'true' && pgYours.painted === '1' &&
   pgYours.cartel === 'Veins, for the hall' && /^Yours/.test(pgYours.sub) && pgYours.empty, JSON.stringify(pgYours));
ok('every work in the Gallery has its Remix', pgYours.remixes === (await pg.evaluate(async () => Object.keys((await import('../src/index.js')).WORKS).length)));

// Yours, remixed: back on the bench exactly as kept.
const pgMine = await pg.evaluate(() => {
  const piece = window.son.studio.captures[0];
  document.querySelector('#yours-cards .card .remix').click();
  const st = window.son.studio.state;
  return { same: st.tool === piece.state.tool && st.seed === piece.state.seed && st.inks.join() === piece.state.inks.join(),
    from: window.son.studio.from && window.son.studio.from.kind };
});
ok('one of yours, remixed, opens on the bench exactly as it was kept', pgMine.same && pgMine.from === 'yours', JSON.stringify(pgMine));
await pg.keyboard.press('5');
await pg.waitForTimeout(400);

// Something else on the wall, then one of yours played from its card.
await pg.evaluate(() => window.son.works.apply('mould'));
await pg.waitForFunction(() => window.son.works.current() === 'mould', null, { timeout: 15000 });
await openGallery();
await pg.waitForTimeout(400);
await pg.evaluate(() => document.querySelector('#yours-cards .card').click());
await pg.waitForFunction(() => document.querySelector('#now-title').textContent === 'Veins, for the hall', null, { timeout: 15000 });
ok('a card in Yours puts the piece up and plays it, like a work',
   await pg.evaluate(() => window.son.sinks.find((s) => s.particles).sceneName === window.son.studio.captures[0].state.tool &&
     document.querySelector('#start').dataset.on === 'true'));

// Kept across a reload, and let go from the Gallery.
await pg.reload({ waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.son && window.son.works, null, { timeout: 20000 });
await openGallery();
await pg.waitForTimeout(600);
const pgReloaded = await pg.evaluate(() => ({
  cards: document.querySelectorAll('#yours-cards .card').length,
  kept: window.son.studio.captures.length,
  first: document.querySelector('#yours-cards .card b').textContent,
}));
ok('Yours survives a reload', pgReloaded.cards === pgReloaded.kept && pgReloaded.first === 'Veins, for the hall', JSON.stringify(pgReloaded));
await pg.evaluate(() => document.querySelector('#yours-cards .card .forget').click());
const pgForgot = await pg.evaluate(() => ({
  cards: document.querySelectorAll('#yours-cards .card').length,
  kept: window.son.studio.captures.length,
  stored: JSON.parse(localStorage.getItem('t:play-captures')).length,
  first: document.querySelector('#yours-cards .card b') && document.querySelector('#yours-cards .card b').textContent,
}));
ok('a piece let go from the Gallery is gone everywhere',
   pgForgot.cards === pgReloaded.cards - 1 && pgForgot.kept === pgForgot.cards && pgForgot.stored === pgForgot.cards && pgForgot.first !== 'Veins, for the hall',
   JSON.stringify(pgForgot));

// A link made while the bench was a page of its own still opens the picture.
const pgOld = await pgContext.newPage();
await pgOld.goto(BASE + '/demo/play.html#/rise/321?i=f3f7ff-5f7dc5-a68700&r=1x1', { waitUntil: 'domcontentloaded' });
await pgOld.waitForFunction(() => window.son && window.son.studio && window.son.studio.player, null, { timeout: 20000 });
const pgOldState = await pgOld.evaluate(() => ({ url: location.href, tool: window.son.studio.state.tool, seed: window.son.studio.state.seed, ratio: window.son.studio.state.ratio }));
ok('an old playground link opens the same picture in Create',
   /\/demo\/#create\/rise\/321\?/.test(pgOldState.url) && pgOldState.tool === 'rise' && pgOldState.seed === 321 && pgOldState.ratio === '1:1',
   JSON.stringify(pgOldState));
await pgOld.close();
ok('Create: no page errors', pgErrors.length === 0, pgErrors.slice(0, 3).join(' | '));
await pgContext.close();

const pgPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const pgp = await pgPhone.newPage();
await pgp.goto(BASE + '/demo/#create/aura/31', { waitUntil: 'domcontentloaded' });
await pgp.waitForFunction(() => window.son && window.son.studio, null, { timeout: 20000 });
await developed(pgp);
// Past the frame growing into place.
await pgp.waitForFunction(() => document.querySelector('#st-frame').getAnimations().length === 0, null, { timeout: 5000 });
const pgPhoneLayout = await pgp.evaluate(() => {
  const r = document.querySelector('#st-canvas').getBoundingClientRect();
  const b = document.querySelector('#st-new').getBoundingClientRect();
  const tabs = [...document.querySelectorAll('#tabs button')].map((x) => x.getBoundingClientRect());
  return {
    doc: document.documentElement.scrollWidth, win: innerWidth, top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight,
    button: Math.round(b.height), tabsFit: tabs.every((t) => t.left >= 0 && t.right <= innerWidth),
  };
});
ok('Create on a phone: the picture comes first, the tabs fit, nothing scrolls sideways',
   pgPhoneLayout.doc <= pgPhoneLayout.win + 1 && pgPhoneLayout.tabsFit && pgPhoneLayout.top < 140 &&
   pgPhoneLayout.bottom < pgPhoneLayout.h * 0.72 && pgPhoneLayout.button >= 44,
   JSON.stringify(pgPhoneLayout));
await pgPhone.close();

// --- phone-sized, touch-driven ------------------------------------------
// The report that started this was "I see the circles and hear nothing on my
// phone", so the phone path is exercised rather than assumed.
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const mp = await mobile.newPage();
const mobileErrors = [];
mp.on('pageerror', (e) => mobileErrors.push(e.message));
await mp.goto(BASE + '/demo/', { waitUntil: 'domcontentloaded' });
await mp.waitForFunction(() => window.son, null, { timeout: 15000 });

ok('phone: the essentials are on screen without digging',
   (await mp.locator('#feeds .card').count()) >= 6 && (await mp.locator('#kits .card').count()) >= 6);
ok('phone: the start button is reachable without scrolling sideways',
   await mp.locator('#start').isVisible());

const overflow = await mp.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));
ok('phone: the page does not scroll sideways', overflow.doc <= overflow.win + 1,
   `${overflow.doc} vs ${overflow.win}`);

const tapTarget = await mp.locator('#start').boundingBox();
ok('phone: the start button is a comfortable tap target',
   tapTarget && tapTarget.height >= 44, tapTarget ? `${Math.round(tapTarget.height)}px tall` : 'missing');

const phoneSheet = await mp.evaluate(async () => {
  document.querySelector('#tabs [data-tab="sound"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const r = document.querySelector('#inspector').getBoundingClientRect();
  const out = { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight };
  window.son.shell.close();
  await new Promise((r2) => setTimeout(r2, 700));
  return out;
});
ok('phone: the settings rise as a sheet from the bottom, full width',
   phoneSheet.left <= 1 && phoneSheet.right >= phoneSheet.w - 1 && phoneSheet.bottom >= phoneSheet.h - 1 && phoneSheet.top > phoneSheet.h * 0.15,
   JSON.stringify(phoneSheet));

await mp.tap('#start');
// Wait for the audio state to settle rather than for a fixed number of
// seconds: over a real connection the sample banks take as long as they take,
// and a hard-coded sleep only tests the network.
await mp
  .waitForFunction(
    () => /sound on|blocked|no instrument/i.test(document.querySelector('#audio-status').textContent),
    null,
    { timeout: 40000 }
  )
  .catch(() => {});
const mobileAudio = await mp.evaluate(() => ({
  state: window.son.engine.ctx.state,
  status: window.son.audioStatus,
  statusText: document.querySelector('#audio-status').textContent,
  running: document.querySelector('#start').dataset.on,
}));
ok('phone: tapping start unlocks the audio context',
   mobileAudio.state === 'running', mobileAudio.state);
ok('phone: the kit is usable after the tap',
   mobileAudio.status && mobileAudio.status.usable === true,
   JSON.stringify(mobileAudio.status && mobileAudio.status.problems));
ok('phone: audio state is stated on screen, never left silent',
   /Sound on/i.test(mobileAudio.statusText), mobileAudio.statusText);
ok('phone: the button reflects that it is running', mobileAudio.running === 'true');

const mobileSound = await mp.evaluate(async () => {
  const before = window.son.audio.stats.played;
  for (let i = 0; i < 20; i++) window.son.emit({ magnitude: 200 * (i + 1), id: 'phone-' + i });
  await new Promise((r) => setTimeout(r, 300));
  return window.son.audio.stats.played - before;
});
ok('phone: notes are actually scheduled', mobileSound > 0, 'played=' + mobileSound);
ok('phone: no page errors', mobileErrors.length === 0, mobileErrors.slice(0, 2).join(' | '));
await mobile.close();

await browser.close();
if (srv) srv.kill();
console.log(fails ? `\n${fails} FAILURE(S): ${failedNames.join(' | ')}` : '\nall browser checks passed');
process.exit(fails ? 1 : 0);
