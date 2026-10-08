// Record a day of Wikipedia, for the wall to fall back on.
//
//   node tools/record-day.mjs --hours 24 --out demo/recordings/a-day.json
//   node tools/record-day.mjs --minutes 10 --out /tmp/ten-minutes.json
//
// Listens to Wikimedia's recent changes, keeps the article edits from every
// Wikipedia, judges each one as the wall does (humanity.js, so a recording
// made with --people carries only what a person wrote), and writes rows of
// [dt, wiki, title, delta, category] with dt the milliseconds since the row
// before. The file is written every few minutes as it goes, so a recording
// cut short is still a recording; and it is written gzipped beside the JSON
// when --gzip is given, which is what a page should load.
//
// No dependency: Node's own fetch reads the stream, zlib does the gzip.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHumanity } from '../src/sources/humanity.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const has = (name) => args.includes('--' + name);

const minutes = Number(flag('minutes', 0)) || Number(flag('hours', 0)) * 60 || 60;
const out = flag('out', 'demo/recordings/a-day.json');
const peopleOnly = has('people');
const gzip = has('gzip');
const every = Number(flag('save', 3)) * 60_000; // write the file every N minutes
const UA = 'Tintinnabulum/0.1 (https://guillain-rdcde.github.io/Tintinnabulum/; record-day)';

const judge = createHumanity();
const events = [];
const started = Date.now();
let lastAt = started;
let counted = { kept: 0, dropped: 0 };

function save(final = false) {
  const doc = { started, minutes: Math.round((Date.now() - started) / 60000), people: peopleOnly, events };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const json = JSON.stringify(doc);
  fs.writeFileSync(out, json);
  if (gzip) fs.writeFileSync(out + '.gz', zlib.gzipSync(json, { level: 9 }));
  const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
  console.log(`${final ? 'done' : 'saved'}: ${events.length} events, ${doc.minutes} min, ${mb(json.length)}${gzip ? ', gz ' + mb(fs.statSync(out + '.gz').size) : ''}, kept ${counted.kept} dropped ${counted.dropped}`);
}

async function listen() {
  const res = await fetch('https://stream.wikimedia.org/v2/stream/recentchange', { headers: { 'User-Agent': UA } });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let d;
      try { d = JSON.parse(line.slice(5)); } catch { continue; }
      if (!/wiki$/.test(d.wiki || '') || d.wiki === 'wikidatawiki' || d.wiki === 'commonswiki') continue;
      if ((d.type !== 'edit' && d.type !== 'new') || d.namespace !== 0 || !d.title) continue;
      const delta = ((d.length && d.length.new) || 0) - ((d.length && d.length.old) || 0);
      const verdict = await judge.settle(d);
      const anon = /^(\d{1,3}\.){3}\d{1,3}$|:/.test(d.user || '');
      let category;
      if (verdict.verdict === 'human') category = anon ? 'anon' : 'user';
      else category = 'bot';
      if (peopleOnly && category === 'bot') { counted.dropped++; continue; }
      const t = Date.now();
      events.push([t - lastAt, d.wiki, d.title, delta, category]);
      lastAt = t;
      counted.kept++;
      if (Date.now() - started >= minutes * 60_000) return;
    }
  }
}

const saver = setInterval(() => save(false), every);
console.log(`recording ${minutes} min of ${peopleOnly ? 'people' : 'everyone'} to ${out}`);
for (;;) {
  try {
    await listen();
    break;
  } catch (e) {
    console.log('stream dropped, reconnecting:', e.message);
    await new Promise((r) => setTimeout(r, 5000));
    if (Date.now() - started >= minutes * 60_000) break;
    lastAt = Date.now();
  }
}
clearInterval(saver);
save(true);
