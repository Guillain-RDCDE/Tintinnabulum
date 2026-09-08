// How loud is each kit, really?
//
//   node tools/level-kits.mjs            measure and print
//   node tools/level-kits.mjs --write    measure and write the levels into kits.js
//
// Twenty-two kits built by different people at different times will not be the
// same loudness, and they were not: measured through the real engine on one
// stream of events, Handbells came out FORTY-SEVEN times quieter than the
// Hatnote bells, and the Hatnote bells peaked at 3.2 -- clipping hard. Choosing
// a kit then meant choosing the volume too, and two of them were inaudible
// after it.
//
// Nothing here is tuned by ear. Each kit is played the same stream through the
// same engine, its loudness is measured, and `level` is set to whatever brings
// it to the target. A kit added later starts at 1 and is measured with the
// rest.
//
// The target is deliberately below the old reference. A peak over one is
// clipping, and the loudest kit has to fit under it with the room turned on.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer, launch } from './render.mjs';

const KITS_FILE = fileURLToPath(new URL('../src/audio/kits.js', import.meta.url));
const TARGET_RMS = 0.16;
// A peak over one is clipping. The margin leaves room for the room: the
// convolution send adds on top of the dry path.
const PEAK_CEILING = 0.72;
const WRITE = process.argv.includes('--write');

const port = 8896;
const { srv, base } = await startServer(port);
const browser = await launch();
let rows = [];

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.route('**/lvl.html', (r) => r.fulfill({ contentType: 'text/html', body: '<title>x</title>' }));
  await page.goto(base + '/lvl.html');

  rows = await page.evaluate(async (origin) => {
    const { KITS, makeKit } = await import(origin + '/src/audio/kits.js');
    const { Mapper } = await import(origin + '/src/core/mapper.js');
    const out = [];

    for (const name of Object.keys(KITS)) {
      const SR = 44100;
      const SECONDS = 14;
      const off = new OfflineAudioContext(1, SR * SECONDS, SR);
      const kit = makeKit(name);
      for (const role of ['add', 'sub', 'accent']) {
        if (kit[role] && kit[role].load) await kit[role].load(off);
      }

      // One stream, identical for every kit, so a difference between two rows
      // is a difference of kit. Seeded, so the answer does not move between
      // runs and a level can be compared with the one before it.
      let seed = 20260908;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const mapper = new Mapper({ mode: 'adaptive' });
      const mags = [];
      for (let i = 0; i < 700; i++) mags.push(Math.round(Math.pow(rnd(), 3) * 9000) + 1);
      for (const m of mags) mapper.map(m);

      // Four events a second for ten seconds: a Wikipedia feed on an ordinary
      // afternoon, and busy enough that tails overlap the way they do live.
      let played = 0;
      for (let i = 0; i < 40; i++) {
        const magnitude = mags[i % mags.length];
        const m = mapper.map(magnitude);
        // The same split the sonifier uses: mostly additions, some removals,
        // an accent now and then.
        const role = i % 11 === 0 ? 'accent' : i % 3 === 0 ? 'sub' : 'add';
        const inst = kit[role];
        if (!inst) continue;
        const v = inst.play(off, off.destination, {
          semitone: m.semitone,
          velocity: 0.45 + rnd() * 0.55,
          when: 0.5 + i * 0.25,
        });
        if (v) played++;
      }

      const buf = await off.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += d[i] * d[i];
      }
      out.push({
        name,
        level: KITS[name].level ?? 1,
        played,
        peak: +peak.toFixed(3),
        rms: +Math.sqrt(sum / d.length).toFixed(5),
      });
    }
    return out;
  }, base);
} finally {
  await browser.close();
  srv.kill();
}

const loudest = Math.max(...rows.map((r) => r.rms));
console.log('kit           joues    crete       rms   x vs le plus fort   niveau -> nouveau');
for (const r of rows) {
  // TWO constraints, and whichever binds wins.
  //
  // Matching loudness alone was the first version and it made things worse:
  // RMS says nothing about crest factor, so a kit of sharp transients -- water
  // drops, clay, a koto -- has a low RMS and tall peaks, and multiplying it up
  // to the loudness target pushed twelve kits past one. They were level with
  // each other and clipping.
  //
  // So a kit is brought to the loudness target unless that would put its peaks
  // over the ceiling, in which case the ceiling decides. A peaky kit ends up
  // quieter than the target, which is correct: that is what a peaky kit is.
  const byLoudness = TARGET_RMS / Math.max(1e-6, r.rms);
  const byPeak = PEAK_CEILING / Math.max(1e-6, r.peak);
  r.bound = byPeak < byLoudness ? 'crete' : 'rms';
  r.want = +(r.level * Math.min(byLoudness, byPeak)).toFixed(3);
  // Bounded. A kit that needs eight times more gain is not badly levelled, it
  // is broken, and multiplying it up would only make the fault loud.
  r.want = Math.max(0.05, Math.min(6, r.want));
  console.log(
    r.name.padEnd(12),
    String(r.played).padStart(5),
    String(r.peak).padStart(8),
    String(r.rms).padStart(9),
    ('x' + (r.rms / loudest).toFixed(2)).padStart(14),
    `${r.level} -> ${r.want}`.padStart(18),
    ('(' + r.bound + ')').padStart(8),
    r.peak > 1 ? '  ECRETE' : ''
  );
}

if (!WRITE) {
  console.log('\nRien ecrit. Relancer avec --write pour appliquer.');
  process.exit(0);
}

let src = await readFile(KITS_FILE, 'utf8');
const crlf = src.includes('\r\n');
if (crlf) src = src.replace(/\r\n/g, '\n');
let touched = 0;
for (const r of rows) {
  const head = new RegExp(`(\\n  ${r.name}: \\{\\n)([\\s\\S]*?)(\\n  \\},)`);
  const m = head.exec(src);
  if (!m) {
    console.error('could not find kit ' + r.name);
    continue;
  }
  let body = m[2];
  if (/^\s*level: [\d.]+,$/m.test(body)) {
    body = body.replace(/^(\s*)level: [\d.]+,$/m, `$1level: ${r.want},`);
  } else {
    body = `    level: ${r.want},` + '\n' + body;
  }
  src = src.slice(0, m.index) + m[1] + body + m[3] + src.slice(m.index + m[0].length);
  touched++;
}
await writeFile(KITS_FILE, crlf ? src.replace(/\n/g, '\r\n') : src);
console.log(`\n${touched} kits mis a jour dans src/audio/kits.js.`);
