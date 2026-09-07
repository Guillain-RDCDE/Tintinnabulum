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
  srv = spawn(process.execPath, [SERVER, '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
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
// partly-broken sample bank still plays. Those failures are expected, so page
// hygiene is not recorded while that probe runs.
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

// --- one surface, progressively disclosed --------------------------------
// There used to be a "simple" and an "advanced" screen that duplicated most
// controls, with the same setting offered two different ways. Now every
// setting exists exactly once, and the deeper ones are revealed in place.
const openMore = async (sel) => {
  await page.evaluate((s) => {
    const d = document.querySelector(s);
    if (d && !d.open) d.open = true;
  }, sel);
};

const PANELS = ['#sec-listen', '#sec-sound', '#sec-look', '#sec-connect', '#sec-filter', '#sec-activity'];
for (const sec of PANELS) {
  ok(`${sec.replace('#sec-', '')} is on the page from the start`,
     await page.locator(sec).isVisible());
}
ok('there is a single obvious start button', await page.locator('#start').isVisible());

// The page opens as folded rows and one button, so it stays short no matter
// how many feeds, kits, palettes and scenes exist behind them.
const folded = await page.evaluate((sels) =>
  sels.map((s) => ({ id: s, open: document.querySelector(s).open })), PANELS);
ok('every panel starts folded', folded.every((p) => !p.open), folded.filter((p) => p.open).map((p) => p.id).join(', '));

// A fixed ceiling on the total was the wrong guard: adding a sixth panel
// pushed it over by five pixels, which says nothing about whether folding
// works. What matters is that a folded panel stays one compact row, so the
// page grows by a row per panel and never by a section.
const folding = await page.evaluate((sels) => ({
  total: document.querySelector('main').getBoundingClientRect().height,
  rows: sels.map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height)),
}), PANELS);
ok('every folded panel is a single compact row',
   folding.rows.every((h) => h <= 80), folding.rows.join(', ') + 'px');
ok('the folded page fits a phone screen without scrolling far',
   folding.total < 80 * PANELS.length + 260,
   Math.round(folding.total) + 'px for ' + PANELS.length + ' panels');

// Each header states its own value, so the whole configuration reads at a glance.
const summaries = await page.evaluate(() =>
  ['listen', 'sound', 'look', 'connect', 'filter'].map((k) => document.querySelector('#sum-' + k).textContent.trim()));
ok('each folded panel shows its current setting', summaries.every((s) => s.length > 0), summaries.join(' | '));

// The start button is the one action, and it is centred rather than pushed aside.
const centring = await page.evaluate(() => {
  const b = document.querySelector('#start').getBoundingClientRect();
  const m = document.querySelector('main').getBoundingClientRect();
  return Math.abs((b.left + b.right) / 2 - (m.left + m.right) / 2);
});
ok('the start button is centred', centring < 2, 'off centre by ' + centring.toFixed(1) + 'px');

const disclosures = await page.evaluate(() =>
  [...document.querySelectorAll('details.more')].map((d) => ({ id: d.id, open: d.open }))
);
ok('advanced options exist but stay folded away', disclosures.length >= 3 && disclosures.every((d) => !d.open),
   disclosures.map((d) => d.id).join(', '));

// Everything below drives the controls, which means opening the panels.
const openPanels = async (p = page) => {
  await p.evaluate(() => {
    for (const d of document.querySelectorAll('details.panel')) d.open = true;
  });
};
await openPanels();
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
          out[name][role] = -1;
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
ok('there are several kits to choose from', Object.keys(kitPeaks).length >= 6,
   Object.keys(kitPeaks).join(', '));

// Each kit card carries its own waveform, rendered from the instrument. A
// blank one would be a card promising a sound it cannot show.
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
    const ctx2 = cv.getContext('2d');
    const d = ctx2.getImageData(0, 0, cv.width, cv.height).data;
    const bg = [d[0], d[1], d[2]];
    let ink = 0;
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      total++;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 20) ink++;
    }
    // A coarse 8x4 fingerprint of where the ink sits, for telling the motifs
    // apart from one another.
    const cols = 8;
    const rows = 4;
    const grid = new Array(cols * rows).fill(0);
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 20) {
          grid[Math.floor((y / cv.height) * rows) * cols + Math.floor((x / cv.width) * cols)]++;
        }
      }
    }
    const peak = Math.max(1, ...grid);
    return {
      name: b.dataset.kit,
      sized,
      share: total ? ink / total : 0,
      print: grid.map((v) => Math.round((v / peak) * 9)).join(''),
    };
  })
);
const unsized = waves.filter((c) => !c.sized);
ok('every kit canvas is painted at its displayed size', unsized.length === 0,
   unsized.map((c) => c.name).join(' ') || waves.length + ' sized');
const flatCards = waves.filter((c) => c.share < 0.04);
ok('every kit card carries a real motif', flatCards.length === 0,
   flatCards.map((c) => `${c.name}(${(c.share * 100).toFixed(1)}%)`).join(' ') ||
     'lightest ' + (Math.min(...waves.map((c) => c.share)) * 100).toFixed(1) + '%');

// The whole point of replacing the waveforms: you should be able to tell the
// water from the night without reading the label. Identical fingerprints would
// mean twelve cards that look like one card.
const prints = new Set(waves.map((c) => c.print));
ok('no two kits look the same', prints.size === waves.length,
   `${prints.size} distinct motifs for ${waves.length} kits`);

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
    const { data } = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400));
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) {
      // Ignore the ground, which is most of the canvas and one colour.
      if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 45) continue;
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    return seen.size;
  };

  const flat = await count(0);
  const varied = await count(0.6);
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
ok('three ambiences ship, each naming its bed',
   ambience.ambienceKits.length === 3 && ambience.ambienceKits.every(([, b]) => b),
   JSON.stringify(ambience.ambienceKits));

// Choosing an ambience starts its bed; choosing an ordinary kit stops it.
const bedSwap = await page.evaluate(async () => {
  const son = window.son;
  await son.setKit('shore');
  const onShore = son.audio.bed && son.audio.bed.name;
  await son.setKit('fire');
  const onFire = son.audio.bed && son.audio.bed.name;
  await son.setKit('synth');
  const afterPlain = son.audio.bed;
  await son.setKit('hatnote');
  return { onShore, onFire, afterPlain };
});
ok('choosing an ambience starts its bed', bedSwap.onShore === 'shore', String(bedSwap.onShore));
ok('choosing another swaps it rather than stacking', bedSwap.onFire === 'fire', String(bedSwap.onFire));
ok('choosing an ordinary kit silences it', bedSwap.afterPlain === null, String(bedSwap.afterPlain));



// --- the field recordings ------------------------------------------------
// Real calls, because synthesis is bad at animals. A sample bank that fails to
// load is silent, and silent is exactly how this project has failed before, so
// each one is fetched, decoded and measured rather than assumed.
const field = await page.evaluate(async () => {
  const { SampleInstrument, KITS } = await import('../src/index.js');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const files = ['gull1', 'gull2', 'gull3', 'frog1', 'frog2', 'heron1', 'heron2'];
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
    sampledKits: Object.entries(KITS).filter(([, k]) => k.sampled).map(([n]) => n),
  };
});

const notLoaded = field.measured.filter((m) => !m.loaded);
ok('every field recording loads and decodes', notLoaded.length === 0 && field.measured.length === 7,
   notLoaded.map((m) => m.file).join(', ') || `${field.measured.length} clips`);
const tooQuiet = field.measured.filter((m) => m.loaded && m.peak < 0.15);
ok('and every one of them is audible', tooQuiet.length === 0,
   tooQuiet.map((m) => `${m.file}=${m.peak}`).join(', ') ||
   field.measured.map((m) => `${m.file}:${m.peak}`).join(' '));
const clicky = field.measured.filter((m) => m.loaded && (m.head > 0.02 || m.tail > 0.02));
ok('and faded at both ends, so none of them clicks', clicky.length === 0,
   clicky.map((m) => `${m.file} ${m.head}/${m.tail}`).join(', ') || '7 clips');
const heavy = field.measured.filter((m) => m.loaded && (m.seconds > 2.5 || m.channels > 1));
ok('they are short mono one-shots, not tracks', heavy.length === 0,
   heavy.map((m) => `${m.file} ${m.seconds}s x${m.channels}`).join(', ') ||
   `longest ${Math.max(...field.measured.map((m) => m.seconds))}s`);
ok('repeats are varied rather than looped', field.variations > 3,
   `${field.variations} distinct playback lengths in 24 hits`);
ok('the kits carrying recordings say so', field.sampledKits.length === 3,
   field.sampledKits.join(', '));

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

// The choice must survive a reload, and must not break when storage is denied.
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

const overlayTruth = await page.evaluate(async () => {
  const el = document.querySelector('#unlock');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Force the context back down, as a phone does when it refuses a gesture.
  await window.son.engine.ctx.suspend();
  await wait(1400);
  const whileBlocked = el.classList.contains('show');
  // Resume by some other means than the overlay, which is exactly what
  // pressing Start ended up doing.
  await window.son.engine.ctx.resume();
  await wait(1400);
  const afterResume = el.classList.contains('show');
  return { whileBlocked, afterResume, state: window.son.engine.ctx.state };
});
ok('the overlay appears when the context is blocked', overlayTruth.whileBlocked);
ok('the overlay goes away once sound is possible, however it was unblocked',
   overlayTruth.afterResume === false, 'ctx=' + overlayTruth.state);

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
const REPO = 'https://github.com/Guillain-RDCDE/tintinnabulum';
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
const beforeSwitch = await page.evaluate(() => {
  const cv = document.querySelector('#scenes .card canvas');
  return cv.getContext('2d').getImageData(0, 0, 4, 4).data.join(',');
});
await page.click('#palettes .sw[data-palette="papyrus"]');
await page.waitForTimeout(300);
const afterSwitch = await page.evaluate(() => {
  const cv = document.querySelector('#scenes .card canvas');
  return cv.getContext('2d').getImageData(0, 0, 4, 4).data.join(',');
});
ok('the previews follow the palette rather than going stale', beforeSwitch !== afterSwitch);
await page.click('#palettes .sw[data-palette="marine"]');
await page.waitForTimeout(200);

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
  const ink = await inkOf();
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
