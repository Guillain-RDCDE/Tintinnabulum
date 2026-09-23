// Render a kit to a WAV, offline, so it can be listened to away from a browser.
//
//   node tools/audition.mjs earthchime waterchime      one file per kit
//   node tools/audition.mjs --seconds 40 airchime
//
// The point of this tool is that a kit cannot be judged from its code or from
// a peak measurement. It is played here through the real Sonifier, on a stream
// of events with the shape a real feed has -- mostly small, a few large, at
// irregular intervals -- and written out as audio somebody can actually hear.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer, launch } from './render.mjs';

const args = process.argv.slice(2);
const secondsArg = args.indexOf('--seconds');
const SECONDS = secondsArg < 0 ? 30 : Number(args[secondsArg + 1]);
const OUT_DIR = process.env.AUDITION_DIR || fileURLToPath(new URL('../tmp-audition/', import.meta.url));
const kits = args.filter((a, i) => !a.startsWith('--') && i !== secondsArg + 1);
if (!kits.length) {
  console.error('usage: node tools/audition.mjs [--seconds N] <kit> [kit...]');
  process.exit(1);
}

/** A 16-bit stereo WAV, which every player on earth opens. */
function wav(left, right, rate) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(left[i]) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(clamp(right[i]) * 32767), 46 + i * 4);
  }
  return buf;
}

const { srv, base } = await startServer(8894);
const browser = await launch();

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/audition-harness.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>audition</title>' })
  );
  await page.goto(base + '/audition-harness.html');

  const { mkdir } = await import('node:fs/promises');
  await mkdir(OUT_DIR, { recursive: true });

  for (const kit of kits) {
    const got = await page.evaluate(async ({ kit, seconds }) => {
      const { Sonifier, makeKit } = await import('/src/index.js');
      const { AudioEngine } = await import('/src/audio/engine.js');
      const rate = 44100;
      const off = new OfflineAudioContext(2, Math.round(rate * seconds), rate);
      const son = new Sonifier({
        engine: new AudioEngine({ ctx: off, space: 'room' }),
        kit: makeKit(kit),
      });
      await son.audio.load();

      // A feed as feeds are: mostly small events, a few large ones, arriving
      // at uneven intervals. Seeded, so two runs of this tool can be compared.
      let seed = 20260923;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const events = [];
      let t = 0.4;
      while (t < seconds - 3) {
        events.push({ at: t, magnitude: Math.round(Math.pow(rnd(), 3) * 9000) + 1 });
        t += 0.25 + rnd() * 1.9;
      }

      // Offline, the context's clock does not move until rendering starts, so
      // emitting the whole stream up front would pile every note onto the
      // first instant -- and the sink schedules against that clock. Rendering
      // is suspended at each event's moment instead, which is the only way to
      // hear the engine as it actually behaves: its restraint, its voice
      // stealing, its room.
      const quantum = 128 / rate;
      let i = 0;
      for (const ev of events) {
        const at = Math.max(quantum, Math.round(ev.at / quantum) * quantum);
        off.suspend(at).then(() => {
          son.emit({ id: 'a' + i++, magnitude: ev.magnitude, ts: Date.now() });
          off.resume();
        });
      }
      const n = events.length;
      const buf = await off.startRendering();
      let peak = 0;
      const L = buf.getChannelData(0);
      const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { left: Array.from(L), right: Array.from(R), rate: buf.sampleRate, events: n, peak };
    }, { kit, seconds: SECONDS });

    const file = `${OUT_DIR}${kit}.wav`;
    await writeFile(file, wav(got.left, got.right, got.rate));
    console.log(`${kit}: ${got.events} events, peak ${got.peak.toFixed(3)} -> ${file}`);
  }
  if (errors.length) throw new Error(errors.join(' | '));
} finally {
  await browser.close();
  srv.kill();
}
