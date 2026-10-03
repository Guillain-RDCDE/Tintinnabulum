// The checks that depend on the machine's audio device.
//
// Two of them: that an audio context which stops on its own is brought back,
// and that the recorder captures real sound. Both passed for weeks and then
// failed on a laptop whose audio device was in an error state, taking the
// whole browser suite down with them -- and nothing in the suite's four
// hundred other checks had anything to do with the sound card. So they live
// here, on their own exit code:
//
//   npm run test:audio

import { tally, openSandbox } from './harness.mjs';

const { ok, finish } = tally();
const sandbox = await openSandbox({ port: Number(process.env.TEST_PORT || 8795) });
const { page } = sandbox;

// A context can stop while the tab is in front, and nothing tells the page
// when it does. The engine's watchdog looks every two seconds; resuming is
// asynchronous on top of that. Polled, with a ceiling, rather than waited for
// over a fixed time: under load one tick plus a slow resume overran 3.5 s.
const recovered = await page.evaluate(async () => {
  const son = window.son;
  await son.unlock();
  const before = son.engine.ctx.state;
  await son.engine.ctx.suspend();
  const stopped = son.engine.ctx.state;
  const since = performance.now();
  while (son.engine.ctx.state !== 'running' && performance.now() - since < 8000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return { before, stopped, after: son.engine.ctx.state, recoveries: son.engine.recoveries, ms: Math.round(performance.now() - since) };
});
ok('a context that stops on its own is brought back',
   recovered.stopped === 'suspended' && recovered.after === 'running' && recovered.recoveries >= 1,
   `${recovered.before} -> ${recovered.stopped} -> ${recovered.after}, ${recovered.recoveries} recovery, ${recovered.ms} ms`);

// The recorder. Confirmed running first, then a second and a half of notes:
// an empty Opus container is about 300 bytes, so "non-empty" is not enough,
// and 700 ms of a context that was still waking up came out at 0 bytes.
const rec = await page.evaluate(async () => {
  const { Recorder } = await import('../src/audio/recorder-sink.js');
  if (!Recorder.supported) return { supported: false };
  const son = window.son;
  await son.unlock();
  const since = performance.now();
  while (son.engine.ctx.state !== 'running' && performance.now() - since < 8000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const r = new Recorder(son.engine);
  r.start();
  for (let i = 0; i < 24; i++) {
    son.emit({ magnitude: 400 * (i + 1), id: 'rec-' + i });
    await new Promise((res) => setTimeout(res, 60));
  }
  const blob = await r.stop();
  return { supported: true, size: blob.size, type: blob.type, state: son.engine.ctx.state };
});
if (rec.supported) {
  ok('recorder captured real audio, not an empty container', rec.size > 2000, `${rec.size} bytes ${rec.type}, context ${rec.state}`);
} else {
  ok('recorder reports unsupported cleanly', true, 'MediaRecorder absent in this build');
}

ok('no page errors', sandbox.errors.length === 0, sandbox.errors.slice(0, 3).join(' | '));

await sandbox.close();
finish('audio checks');
