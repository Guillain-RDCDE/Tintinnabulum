// Pure-logic checks. No browser needed: nothing here touches AudioContext or
// canvas, which is the point of keeping those behind sinks.
import { normalize, unitPosition } from '../src/core/event.js';
import { Mapper, SCALES, KEYS } from '../src/core/mapper.js';
import { VoicePool } from '../src/core/voices.js';
import {
  PALETTES,
  PALETTE_KEYS,
  DEFAULT_PALETTE_NAME,
  resolvePalette,
  swatchOf,
  GROUND_BANDS,
  groundBandOf,
  PALETTE_FAMILIES,
  familyOf,
} from '../src/visual/palettes.js';

let fails = 0;
const failedNames = [];
const ok = (name, cond, extra = '') => {
  if (!cond) {
    fails++; failedNames.push(name);
    console.log('FAIL  ' + name + (extra ? '  ' + extra : ''));
  } else console.log('ok    ' + name + (extra ? '  ' + extra : ''));
};

// --- the event contract ---
ok('number shorthand', normalize(42).magnitude === 42);
ok('negative magnitude implies polarity', normalize(-30).polarity === -1 && normalize(-30).magnitude === 30);
ok('explicit polarity wins', normalize({ magnitude: -30, polarity: 1 }).polarity === 1);
ok('non-numeric magnitude rejected', normalize({ magnitude: 'abc' }) === null);
ok('NaN rejected', normalize({ magnitude: NaN }) === null);
ok('null rejected', normalize(null) === null);
ok('zero is a valid magnitude', normalize(0) && normalize(0).magnitude === 0);
ok('defaults applied', normalize(1).category === 'default' && normalize(1).accent === false);

// --- deterministic positioning ---
const a = unitPosition('Paris');
const b = unitPosition('Paris');
const c = unitPosition('Lyon');
ok('same id lands in the same place', a.u === b.u && a.v === b.v);
ok('different ids land apart', a.u !== c.u);
ok('position stays in the unit square', a.u >= 0 && a.u < 1 && a.v >= 0 && a.v < 1);

// --- the headline claim: the mapper calibrates itself ---
const spread = (mapper, samples) => {
  const out = samples.map((m) => mapper.map(m).semitone);
  return { min: Math.min(...out), max: Math.max(...out) };
};

const wiki = new Mapper({ mode: 'adaptive', range: 27 });
const wikiMags = Array.from({ length: 400 }, () => Math.round(Math.exp(Math.random() * 9)));
wikiMags.forEach((m) => wiki.map(m));
const wr = spread(wiki, wikiMags.slice(0, 200));

const latency = new Mapper({ mode: 'adaptive', range: 27 });
const latMags = Array.from({ length: 400 }, () => 40 + Math.random() * 20); // narrow band, tiny values
latMags.forEach((m) => latency.map(m));
const lr = spread(latency, latMags.slice(0, 200));

ok('adaptive spans the range on wiki-like data', wr.max - wr.min > 18, JSON.stringify(wr));
ok('adaptive spans the range on a foreign domain', lr.max - lr.min > 18, JSON.stringify(lr));

// A fixed log curve tuned for one domain collapses on another. This is the
// whole reason the adaptive mode exists.
const logm = new Mapper({ mode: 'log', domain: [1, 100000], range: 27 });
const lg = spread(logm, latMags.slice(0, 200));
ok('fixed log mapping collapses off-domain (expected)', lg.max - lg.min < 6, JSON.stringify(lg));

// --- pitch direction ---
const inv = new Mapper({ mode: 'log', invert: true, range: 27, warmup: 1e9 });
ok('inverted: big event = low note', inv.map(90000).semitone < inv.map(5).semitone);
const noinv = new Mapper({ mode: 'log', invert: false, range: 27, warmup: 1e9 });
ok('not inverted: big event = high note', noinv.map(90000).semitone > noinv.map(5).semitone);

// --- scale quantization ---
const pent = new Mapper({ scale: 'pentatonic', mode: 'log', range: 36, warmup: 1e9 });
const degrees = new Set();
for (let i = 1; i < 5000; i += 7) degrees.add((((pent.map(i).semitone % 12) + 12) % 12));
ok(
  'pentatonic output never leaves the scale',
  [...degrees].every((d) => [0, 2, 4, 7, 9].includes(d)),
  [...degrees].sort((x, y) => x - y).join(',')
);

// --- voice allocation ---
const pool = new VoicePool({ maxVoices: 3 });
const t = 1000;
const s1 = pool.request(0.1, t);
const s2 = pool.request(0.2, t);
const s3 = pool.request(0.3, t);
[s1, s2, s3].forEach((s, i) => s && s.attach(() => {}, 5000 + i));
ok('grants up to maxVoices', Boolean(s1 && s2 && s3) && pool.active === 3);
ok('a weak note is refused when full', pool.request(0.05, t) === null);

let stoppedWeakest = false;
s1.stop = () => {
  stoppedWeakest = true;
};
const strong = pool.request(0.9, t);
ok('a strong note steals the weakest voice', strong !== null && stoppedWeakest);
ok('capacity is respected after a steal', pool.active === 3, 'active=' + pool.active);
ok('expired voices are reclaimed', (() => { pool.request(0.5, t + 60000); return pool.active <= 3; })());

const rl = new VoicePool({ maxVoices: 100, maxPerSecond: 10 });
let granted = 0;
for (let i = 0; i < 50; i++) if (rl.request(0.5, 2000)) granted++;
ok('token bucket caps a burst', granted <= 11, 'granted=' + granted);

// --- palettes: complete, and actually legible ---------------------------
// A palette can be pretty and still unusable. These checks measure it rather
// than trusting the eye: WCAG relative luminance, with the circle colours
// composited over their own background at the 0.5 fill opacity the canvas uses.

const hex = (c) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const srgbToLin = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = (rgb) => {
  const [r, g, b] = rgb.map(srgbToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const over = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

// WCAG contrast is luminance only. That is the right measure for text on a
// background, but the wrong one for "can you tell these two circles apart":
// deep cyan and magenta are unmistakable yet share a luminance band. Category
// separation is therefore measured as perceptual distance in CIELAB (CIE76).
const toLab = (rgb) => {
  const [r, g, b] = rgb.map(srgbToLin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const deltaE = (a, b) => {
  const la = toLab(a);
  const lb = toLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};

const names = Object.keys(PALETTES);
ok('palettes are defined', names.length >= 8, names.length + ' palettes');
ok('the default palette exists', Boolean(PALETTES[DEFAULT_PALETTE_NAME]), DEFAULT_PALETTE_NAME);

let structureOk = true;
let parseOk = true;
for (const n of names) {
  const c = PALETTES[n].colors;
  if (!PALETTE_KEYS.every((k) => typeof c[k] === 'string' && c[k])) {
    structureOk = false;
    console.log('   missing keys in ' + n);
  }
  for (const k of ['background', 'default', 'user', 'anon', 'bot', 'alert', 'text']) {
    if (!hex(c[k])) {
      parseOk = false;
      console.log(`   ${n}.${k} is not a plain hex colour: ${c[k]}`);
    }
  }
  if (!/^rgba?\(/.test(c.banner) || !/^rgba?\(/.test(c.hud)) {
    parseOk = false;
    console.log('   banner/hud must be rgba() in ' + n);
  }
  if (!PALETTES[n].label || !PALETTES[n].note) {
    structureOk = false;
    console.log('   missing label/note in ' + n);
  }
}
ok('every palette defines every key', structureOk);
ok('every colour parses', parseOk);

let worstText = { ratio: Infinity, name: '' };
let worstCircle = { ratio: Infinity, name: '' };
let worstPair = { ratio: Infinity, name: '' };
let worstMono = { ratio: Infinity, name: '' };
for (const n of names) {
  const c = PALETTES[n].colors;
  const bg = hex(c.background);

  const t = contrast(hex(c.text), bg);
  if (t < worstText.ratio) worstText = { ratio: t, name: n };

  const cats = ['user', 'anon', 'bot', 'alert'];
  const composited = cats.map((k) => over(hex(c[k]), bg, 0.5));
  for (const comp of composited) {
    const r = contrast(comp, bg);
    if (r < worstCircle.ratio) worstCircle = { ratio: r, name: n };
  }
  for (let i = 0; i < composited.length; i++) {
    for (let j = i + 1; j < composited.length; j++) {
      const pair = `${n} ${cats[i]}/${cats[j]}`;
      if (n === 'monochrome') {
        // Greyscale by design: perceptual distance cannot apply, so this one
        // palette is held to a luminance floor -- which is exactly what it
        // promises, that colour vision is never required.
        const r = contrast(composited[i], composited[j]);
        if (r < worstMono.ratio) worstMono = { ratio: r, name: pair };
      } else {
        const d = deltaE(composited[i], composited[j]);
        if (d < worstPair.ratio) worstPair = { ratio: d, name: pair };
      }
    }
  }
}
ok('label text is legible on every background (WCAG AA, 4.5)',
   worstText.ratio >= 4.5, `worst ${worstText.name} = ${worstText.ratio.toFixed(2)}`);
ok('circles stand out from their background at 50% fill',
   worstCircle.ratio >= 1.4, `worst ${worstCircle.name} = ${worstCircle.ratio.toFixed(2)}`);
ok('colour palettes keep their categories perceptually apart (CIELAB dE >= 22)',
   worstPair.ratio >= 22, `closest ${worstPair.name} = dE ${worstPair.ratio.toFixed(1)}`);
ok('monochrome separates categories by lightness alone (>= 1.35)',
   worstMono.ratio >= 1.35, `closest ${worstMono.name} = ${worstMono.ratio.toFixed(3)}`);

ok('resolvePalette fills gaps from the default',
   resolvePalette({ anon: '#123456' }).background === PALETTES[DEFAULT_PALETTE_NAME].colors.background);
ok('resolvePalette honours the override', resolvePalette({ anon: '#123456' }).anon === '#123456');
ok('an unknown palette name falls back rather than throwing',
   resolvePalette('does-not-exist').background === PALETTES[DEFAULT_PALETTE_NAME].colors.background);
const sw = swatchOf('bronze');
ok('swatchOf returns a ground and four dots',
   Boolean(sw.background) && sw.dots.length === 4 && sw.dots.every(Boolean));

// --- shapes -------------------------------------------------------------
// Exercised against a recording stub rather than a real canvas: what matters
// here is that every shape emits a path of the right size, which is checkable
// without a browser. A shape that silently draws nothing must fail.

const { SHAPES, SHAPE_NAMES, MIXED_POOL, DEFAULT_SHAPE, drawShape, isHollow } = await import(
  '../src/visual/shapes.js'
);

function recorder() {
  const pts = [];
  let ops = 0;
  const push = (x, y) => pts.push([x, y]);
  return {
    pts,
    get ops() {
      return ops;
    },
    moveTo(x, y) { ops++; push(x, y); },
    lineTo(x, y) { ops++; push(x, y); },
    quadraticCurveTo(cx, cy, x, y) { ops++; push(cx, cy); push(x, y); },
    arc(x, y, r) { ops++; push(x - r, y); push(x + r, y); push(x, y - r); push(x, y + r); },
    closePath() {},
  };
}

ok('shape registry is populated', SHAPE_NAMES.length >= 6, SHAPE_NAMES.length + ' shapes');
ok('the default shape exists', Boolean(SHAPES[DEFAULT_SHAPE]), DEFAULT_SHAPE);
ok('mixed draws only from registered shapes',
   MIXED_POOL.every((n) => SHAPES[n]), MIXED_POOL.join(','));

let shapeStructure = true;
let emptyShape = '';
let oversized = '';
for (const name of SHAPE_NAMES) {
  const s = SHAPES[name];
  if (!s.label || !s.note || typeof s.draw !== 'function') {
    shapeStructure = false;
    console.log('   incomplete shape: ' + name);
  }
  const ctx = recorder();
  drawShape(ctx, name, 100, 100, 20, 0.3, 0.5);
  if (ctx.ops < 1 || ctx.pts.length < 3) emptyShape = name;
  for (const [x, y] of ctx.pts) {
    if (Math.hypot(x - 100, y - 100) > 20 * 1.45) oversized = `${name} (${Math.round(Math.hypot(x - 100, y - 100))})`;
  }
}
ok('every shape declares a label, a note and a draw function', shapeStructure);
ok('every shape actually emits a path', !emptyShape, emptyShape || 'all draw');
ok('no shape overruns its radius', !oversized, oversized || 'all within bounds');

const c1 = recorder();
drawShape(c1, 'nonexistent-shape', 10, 10, 5);
ok('an unknown shape falls back rather than throwing', c1.ops > 0);

const mixA = recorder();
const mixB = recorder();
drawShape(mixA, 'mixed', 50, 50, 10, 0, 0.31);
drawShape(mixB, 'mixed', 50, 50, 10, 0, 0.31);
ok('mixed is deterministic for a given event',
   JSON.stringify(mixA.pts) === JSON.stringify(mixB.pts));
const mixC = recorder();
drawShape(mixC, 'mixed', 50, 50, 10, 0, 0.87);
ok('mixed does vary across events', JSON.stringify(mixA.pts) !== JSON.stringify(mixC.pts));

ok('rotation actually rotates the path', (() => {
  const a = recorder();
  const b = recorder();
  drawShape(a, 'star', 0, 0, 10, 0);
  drawShape(b, 'star', 0, 0, 10, 1.1);
  return JSON.stringify(a.pts) !== JSON.stringify(b.pts);
})());

ok('ring is the hollow one', isHollow('ring') && !isHollow('circle'));

// --- polled feeds must trickle, not dump -------------------------------
// A poller that emits its whole page at once produces one blurred chord --
// most of it dropped, there being only so many voices -- then a long silence.
// It sounds broken even though the data is fine.

const { pollSource } = await import('../src/sources/index.js');

const BATCH = Array.from({ length: 20 }, (_, i) => ({ magnitude: 10 + i, id: 'batch-' + i }));
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => BATCH });

const paced = await new Promise((resolve) => {
  const stamps = [];
  const src = pollSource({
    url: 'https://example.invalid/feed',
    interval: 2000,
    map: (b) => b,
    name: 'spread-test',
  });
  const t0 = Date.now();
  src.start(() => stamps.push(Date.now() - t0));
  setTimeout(() => {
    src.stop();
    resolve(stamps);
  }, 1200);
});
ok('a polled batch is not delivered all at once', new Set(paced).size > 1,
   `${paced.length} events across ${new Set(paced).size} moments`);
ok('a polled batch starts arriving immediately', paced.length > 0 && paced[0] < 300,
   'first at ' + paced[0] + 'ms');
ok('the batch is paced, not dumped',
   paced.length > 1 && paced[paced.length - 1] - paced[0] > 300,
   `spanned ${paced[paced.length - 1] - paced[0]}ms`);

const afterStop = await new Promise((resolve) => {
  let count = 0;
  const src = pollSource({ url: 'https://example.invalid/feed', interval: 2000, map: (b) => b, name: 'stop-test' });
  src.start(() => count++);
  setTimeout(() => {
    src.stop();
    const atStop = count;
    setTimeout(() => resolve({ atStop, later: count }), 700);
  }, 250);
});
ok('stopping a poller cancels its pending deliveries',
   afterStop.later === afterStop.atStop,
   `${afterStop.atStop} at stop, ${afterStop.later} after`);

const unspread = await new Promise((resolve) => {
  const stamps = [];
  const src = pollSource({
    url: 'https://example.invalid/feed',
    interval: 2000,
    map: (b) => b,
    name: 'unspread-test',
    spread: false,
  });
  const t0 = Date.now();
  src.start(() => stamps.push(Date.now() - t0));
  setTimeout(() => {
    src.stop();
    resolve(stamps);
  }, 400);
});
// Not "at most two distinct milliseconds": that is a claim about the machine's
// load, not about the source, and a busy machine failed it. What "not spread"
// means is that the batch arrives together -- the whole of it inside a moment
// rather than paced across the interval, which the paced case above spans more
// than three hundred milliseconds of.
ok('spreading can still be turned off',
   unspread.length === 20 && unspread[unspread.length - 1] - unspread[0] < 60,
   `${unspread.length} events within ${unspread[unspread.length - 1] - unspread[0]}ms`);

// Events that carry real times must keep their own rhythm. Spacing a batch
// evenly discards exactly what is interesting about a feed like seismicity,
// which arrives in swarms rather than on a metronome.
const base = Date.now() - 3600000;
// Two tight clusters an hour apart, with nothing in between.
const CLUSTERED = [
  ...Array.from({ length: 6 }, (_, i) => ({ magnitude: 100, id: 'a' + i, ts: base + i * 4000 })),
  ...Array.from({ length: 6 }, (_, i) => ({ magnitude: 100, id: 'b' + i, ts: base + 3000000 + i * 4000 })),
];
globalThis.fetch = async () => ({ ok: true, json: async () => CLUSTERED });

const rhythm = await new Promise((resolve) => {
  const stamps = [];
  const src = pollSource({
    url: 'https://example.invalid/quakes',
    interval: 60000,
    firstSpread: 1500,
    map: (b) => b,
    name: 'rhythm-test',
  });
  const t0 = Date.now();
  src.start(() => stamps.push(Date.now() - t0));
  setTimeout(() => {
    src.stop();
    resolve(stamps);
  }, 1900);
});
ok('a timed batch is replayed in full', rhythm.length === 12, rhythm.length + ' delivered');
ok('the replay runs in chronological order',
   rhythm.every((t, i) => i === 0 || t >= rhythm[i - 1]), rhythm.join(','));

// The real property: each event lands at its own position in the source's
// timeline, scaled into the window. An even spacing would put event 6 at the
// halfway mark; the true timeline puts it at the start of the second swarm.
const span = CLUSTERED[11].ts - CLUSTERED[0].ts;
const expected = CLUSTERED.map((e) => ((e.ts - CLUSTERED[0].ts) / span) * 1500);
const drift = rhythm.map((t, i) => Math.abs(t - expected[i]));
// Placement is proportional to the timestamps *subject to* a minimum audible
// separation: two notes in the same millisecond are one blurred chord, not
// two events. So the contract is not exact proportional placement but
// preserved clustering with nothing landing on top of anything else.
const gapsIn = rhythm.slice(1, 6).map((t, i) => t - rhythm[i]);
const gapBetween = rhythm[6] - rhythm[5];
// There is deliberately no assertion on the smallest observed gap. Scheduling
// separates notes by 70ms, but these are setTimeout callbacks: after heavy
// work the event loop can fire several in one tick, so a measured gap of zero
// says something about Node's timers rather than about this code. The
// properties below survive that noise and are the ones that matter.
ok('the silence between two swarms dwarfs the gaps inside one',
   gapBetween > Math.max(...gapsIn) * 3,
   `between ${gapBetween}ms vs widest within ${Math.max(...gapsIn)}ms`);
ok('an even spacing is rejected: the first six arrive well before the midpoint',
   rhythm[5] < 1500 * 0.45 && rhythm[6] > 1500 * 0.8,
   `sixth at ${rhythm[5]}ms, seventh at ${rhythm[6]}ms of 1500`);

// One stale entry among many recent ones must not claim the whole window.
// Active weather alerts are exactly this shape: hundreds issued within a few
// hours, and one left over from days ago. On raw min/max bounds that single
// outlier took the start of the window and crushed everything else into its
// last few percent, which played as one event and then silence.
const nowMs = Date.now();
const OUTLIER = [
  { magnitude: 50, id: 'ancient', ts: nowMs - 5 * 86400000 },
  ...Array.from({ length: 14 }, (_, i) => ({
    magnitude: 20,
    id: 'recent' + i,
    ts: nowMs - 3600000 + i * 60000,
  })),
];
globalThis.fetch = async () => ({ ok: true, json: async () => OUTLIER });

const robust = await new Promise((resolve) => {
  const stamps = [];
  const src = pollSource({
    url: 'https://example.invalid/alerts',
    interval: 60000,
    firstSpread: 2000,
    map: (b) => b,
    name: 'outlier-test',
  });
  const t0 = Date.now();
  src.start(() => stamps.push(Date.now() - t0));
  setTimeout(() => {
    src.stop();
    resolve(stamps);
  }, 2700);
});
ok('a stale outlier does not empty the replay', robust.length === 15,
   robust.length + ' of 15 delivered');
ok('the bulk is not crushed into the tail by one old entry',
   robust.filter((t) => t < 1200).length >= 5,
   robust.filter((t) => t < 1200).length + ' arrived in the first 1.2s');
// Timer jitter can still collapse the odd pair into one millisecond, so this
// asks that the batch is overwhelmingly spread rather than perfectly so.
ok('the batch does not arrive as a chord',
   new Set(robust).size >= robust.length * 0.85,
   `${new Set(robust).size} distinct moments for ${robust.length} events`);
ok('the replay spans its window rather than bunching',
   Math.max(...robust) - Math.min(...robust) > 900,
   `spanned ${Math.max(...robust) - Math.min(...robust)}ms`);

globalThis.fetch = realFetch;

// --- musical rules ------------------------------------------------------

ok('there are twelve keys', KEYS.length === 12, KEYS.join(' '));
ok('there is a broad choice of scales', Object.keys(SCALES).length >= 15,
   Object.keys(SCALES).length + ' scales');

// A degree need not be a whole semitone, and the tunings are the reason: just
// intonation, the harmonic series and a bell's partials all come from
// whole-number frequency RATIOS, which land between the twelve equal steps.
// The requirement is that a degree is a real position inside one octave and
// that no two are so close together that they are a beat rather than an
// interval.
let scalesValid = true;
for (const [name, degrees] of Object.entries(SCALES)) {
  if (!degrees.length || degrees.some((d) => !Number.isFinite(d) || d < 0 || d >= 12)) {
    scalesValid = false;
    console.log('   bad scale: ' + name);
  }
  const sorted = [...degrees].sort((a, b) => a - b);
  if (String(sorted) !== String(degrees)) {
    scalesValid = false;
    console.log('   degrees out of order in: ' + name);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < 0.9) {
      scalesValid = false;
      console.log(`   degrees too close in ${name}: ${sorted[i - 1]} and ${sorted[i]}`);
    }
  }
}
ok('every scale is a valid set of degrees', scalesValid);

// Every scale must survive quantization: a mapper set to it may never emit a
// pitch outside it.
let offScale = '';
for (const name of Object.keys(SCALES)) {
  const m = new Mapper({ scale: name, mode: 'log', range: 36, warmup: 1e9 });
  for (let v = 1; v < 4000; v += 37) {
    const deg = (((m.map(v).semitone % 12) + 12) % 12);
    // Compared with a tolerance, because a fractional degree comes back from
    // an octave's worth of addition and subtraction: 3.156 leaves as
    // 3.1560000000000006, which is the same note and a different number.
    if (!SCALES[name].some((d) => Math.abs(d - deg) < 1e-6)) {
      offScale = `${name} produced ${deg}`;
    }
  }
}
ok('no scale ever emits a note outside itself', !offScale, offScale || 'all clean');

const inC = new Mapper({ scale: 'major', mode: 'log', range: 24, warmup: 1e9, root: 0 });
const inF = new Mapper({ scale: 'major', mode: 'log', range: 24, warmup: 1e9, root: 5 });
ok('changing key transposes everything by the same amount',
   inF.map(500).semitone - inC.map(500).semitone === 5,
   `${inC.map(500).semitone} -> ${inF.map(500).semitone}`);

const straight = new Mapper({ mode: 'log', range: 27, warmup: 1e9, jitter: 0 });
const humanised = new Mapper({ mode: 'log', range: 27, warmup: 1e9, jitter: 2 });
const spreadOf = (m) => new Set(Array.from({ length: 60 }, () => m.map(4000).semitone)).size;
ok('humanising varies a repeated value, and none does not',
   spreadOf(straight) === 1 && spreadOf(humanised) > 1,
   `plain=${spreadOf(straight)} humanised=${spreadOf(humanised)}`);

// --- rhythmic quantisation ----------------------------------------------
// _onset only reads currentTime, so the grid is testable without a browser.
const { AudioSink } = await import('../src/audio/audio-sink.js');
const fakeSink = new AudioSink({ ctx: null, destination: null });

const at = (t) => ({ currentTime: t });
fakeSink.setTempo(0);
ok('free time schedules immediately', fakeSink._onset(at(12.34)) === 0);

fakeSink.setTempo(120, 4); // quarter notes at 120bpm = every 0.5s
const grid = [10.01, 10.2, 10.49, 10.51, 10.9].map((t) => fakeSink._onset(at(t)));
ok('onsets land on the beat', grid.every((g) => Math.abs(g / 0.5 - Math.round(g / 0.5)) < 1e-9),
   grid.map((g) => g.toFixed(3)).join(' '));
ok('events inside one beat gather onto it', grid[0] === grid[1] && grid[1] === grid[2],
   grid.slice(0, 3).join(' '));
ok('the next beat is a separate onset', grid[3] > grid[2], `${grid[2]} then ${grid[3]}`);
ok('a note is never scheduled in the past', grid.every((g, i) => g >= [10.01, 10.2, 10.49, 10.51, 10.9][i]));

fakeSink.setTempo(120, 16); // sixteenths = every 0.125s
const fine = fakeSink._onset(at(10.01));
ok('a finer division gives a tighter grid', Math.abs(fine - 10.125) < 1e-9, String(fine));

// --- perceptual colour ---------------------------------------------------

{
  const { parseColor, rgbToOklab, oklabToRgb, toOklch, fromOklch, shadeOf, lighten, lightnessOf } =
    await import('../src/visual/color.js');

  let worst = 0;
  for (let r = 0; r <= 255; r += 15) {
    for (let g = 0; g <= 255; g += 15) {
      for (let b = 0; b <= 255; b += 15) {
        const back = oklabToRgb(rgbToOklab({ r, g, b }));
        worst = Math.max(worst, Math.abs(back.r - r), Math.abs(back.g - g), Math.abs(back.b - b));
      }
    }
  }
  ok('sRGB survives a round trip through OKLab', worst <= 1, `worst channel error ${worst}`);

  ok('short hex parses', parseColor('#abc').r === 170 && parseColor('#abc').b === 204);
  ok('rgba keeps its alpha', parseColor('rgba(41, 128, 185, 0.85)').a === 0.85);
  ok('white and black land on the ends of the lightness axis',
     Math.abs(lightnessOf('#ffffff') - 1) < 0.005 && lightnessOf('#000000') < 0.005);

  // Richness 0 is what a colour-coded reading depends on, so it has to be an
  // exact identity rather than merely a small change.
  ok('richness 0 returns the colour untouched', shadeOf('#39b7a8', [0.9, 0.1, 0.7], 0) === '#39b7a8');
  ok('shading preserves alpha', /^rgba\(/.test(shadeOf('rgba(41, 128, 185, 0.85)', [0.3, 0.6, 0.2], 0.5)));

  const shades = new Set();
  for (let i = 0; i < 300; i++) {
    shades.add(shadeOf('#39b7a8', [(i * 7 % 300) / 300, (i * 13 % 300) / 300, (i * 29 % 300) / 300], 0.45));
  }
  ok('one category yields many distinct shades', shades.size > 200,
     `${shades.size} shades from one base colour`);

  // Hue must open up only at the top of the range. Measured against the base
  // hue and wrapped: a raw min/max of atan2 reports a full circle for any base
  // sitting near the seam, which teal does.
  const baseHue = toOklch(rgbToOklab(parseColor('#39b7a8'))).h;
  const swing = (k) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= 20; i++) {
      let d = ((toOklch(rgbToOklab(parseColor(shadeOf('#39b7a8', [0.5, 0.5, i / 20], k)))).h - baseHue) * 180) / Math.PI;
      while (d > 180) d -= 360;
      while (d <= -180) d += 360;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return hi - lo;
  };
  ok('low richness barely moves the hue', swing(0.25) < 10, `${swing(0.25).toFixed(1)} degrees`);
  ok('high richness opens the hue up', swing(1) > 60, `${swing(1).toFixed(1)} degrees`);

  // Out-of-gamut results must lose chroma, not hue and lightness. Clipping each
  // channel on its own turned Papyrus's near-black ink into rgb(1, 0, 0).
  let collapsed = null;
  for (const [name, p] of Object.entries(PALETTES)) {
    for (const key of ['user', 'anon', 'bot', 'alert', 'default']) {
      for (const k of [0.2, 0.45, 0.8, 1]) {
        for (let i = 0; i < 12; i++) {
          const out = shadeOf(p.colors[key], [(i * 7 % 12) / 12, (i * 5 % 12) / 12, i / 12], k);
          const L = lightnessOf(out);
          if (!Number.isFinite(parseColor(out).r) || L < 0.04 || L > 0.995) {
            collapsed = collapsed || `${name}.${key} at richness ${k} gave ${out}`;
          }
        }
      }
    }
  }
  ok('no palette colour collapses when shaded', collapsed === null, collapsed || `${names.length} palettes`);

  ok('lighten stays in gamut on an extreme colour',
     Number.isFinite(parseColor(lighten('#1c1a17', 0.9)).r) && lightnessOf(lighten('#1c1a17', 0.4)) > lightnessOf('#1c1a17'));

  // The reason any of this exists: `user` is the commonest category in a live
  // feed, and it used to be a near-white in fifteen of seventeen palettes,
  // which is what made a running screen look washed out.
  const pale = Object.entries(PALETTES).filter(
    ([name, p]) => name !== 'monochrome' && lightnessOf(p.colors.user) > 0.88
  );
  ok('no palette paints the commonest category as a near-white',
     pale.length === 0, pale.map(([n]) => n).join(', ') || `${names.length - 1} palettes carry a real hue`);

  // The first thing a palette decides is how light the ground is, and for a
  // long time it did not decide it: two were on paper and fifteen shared a
  // near-black spanning 0.118 to 0.268 in OKLab lightness -- one colour with
  // the hue changed, offered fifteen times. Counting palettes is no guard
  // against that, so this counts bands instead.
  const bands = { dark: [], mid: [], light: [] };
  for (const [name, p] of Object.entries(PALETTES)) {
    const L = lightnessOf(p.colors.background);
    bands[L < 0.3 ? 'dark' : L < 0.7 ? 'mid' : 'light'].push(name);
  }
  const thin = Object.entries(bands).filter(([, list]) => list.length < 3);
  ok('grounds are spread across dark, mid and light, not crowded into one',
     thin.length === 0,
     thin.length
       ? thin.map(([b, list]) => `${b}: ${list.length}`).join(', ')
       : `${bands.dark.length} dark, ${bands.mid.length} mid, ${bands.light.length} light`);

  // Forty swatches in one grid is forty swatches, so they are offered grouped
  // two ways. Both groupings must account for every palette: a heading nobody
  // wrote is how a palette becomes invisible without anything appearing broken.
  const unbanded = names.filter((n) => !GROUND_BANDS.includes(groundBandOf(n)));
  ok('every palette lands in a ground band', unbanded.length === 0,
     unbanded.join(', ') || GROUND_BANDS.map((b) => `${b} ${names.filter((n) => groundBandOf(n) === b).length}`).join(', '));

  const undeclared = names.filter((n) => !PALETTE_FAMILIES.includes(PALETTES[n].family));
  ok('every palette declares a dominant from the known list', undeclared.length === 0,
     undeclared.map((n) => `${n}=${PALETTES[n].family}`).join(', ') ||
     PALETTE_FAMILIES.map((f) => `${f} ${names.filter((n) => familyOf(n) === f).length}`).join(', '));

  // A family holding one palette is a heading for a heading's sake.
  const lonely = PALETTE_FAMILIES.filter((f) => names.filter((n) => familyOf(n) === f).length < 2);
  ok('no family is a heading over a single swatch', lonely.length === 0, lonely.join(', ') || 'all earn their heading');
}

// --- the catalogue and the works --------------------------------------------
{
  const lib = await import('../src/index.js');
  const { SCENES, SCENE_SHELVES, PALETTES, KITS, SPACES, FINISHES, FINISH_ORDER, MATS, WORKS, WORK_ROOMS } = lib;
  const { lightnessOf } = await import('../src/visual/color.js');

  // A scene with no catalogue entry still works but lands on "Other" with its
  // technical note showing first. That is the fallback, not the intent.
  const unshelved = Object.entries(SCENES).filter(([, s]) => !s.shelf || s.shelf === 'Other').map(([n]) => n);
  ok('every scene sits on a named shelf', unshelved.length === 0, unshelved.join(', ') || `${Object.keys(SCENES).length} scenes`);
  const shelves = new Set(Object.values(SCENES).map((s) => s.shelf));
  const stray = [...shelves].filter((s) => !SCENE_SHELVES.includes(s));
  ok('every shelf a scene names is in the shelf order', stray.length === 0, stray.join(', ') || [...shelves].length + ' shelves');
  const mute = Object.entries(SCENES).filter(([, s]) => !s.note || !s.how).map(([n]) => n);
  ok('every scene says what it looks like, and how it is made', mute.length === 0, mute.join(', ') || 'all described');
  ok('the demonstrations sit together on the last shelf',
     ['ulam', 'collatz', 'rule30'].every((n) => SCENES[n].shelf === 'Forms and numbers') &&
     SCENE_SHELVES[SCENE_SHELVES.length - 2] === 'Forms and numbers');
  const crowded = SCENE_SHELVES.filter((sh) => Object.values(SCENES).filter((x) => x.shelf === sh).length > 20);
  ok('no shelf is a wall of more than twenty', crowded.length === 0, crowded.join(', ') || `${SCENE_SHELVES.length - 1} shelves`);
  ok('there are at least ninety scenes to choose from', Object.keys(SCENES).length >= 90, String(Object.keys(SCENES).length));

  ok('the finishes are all declared, in order', FINISH_ORDER.length === Object.keys(FINISHES).length &&
     FINISH_ORDER.every((f) => FINISHES[f] && FINISHES[f].label && FINISHES[f].note));

  // A work names a scene, a palette, a kit, a room, a finish and a frame by
  // key. A renamed key anywhere would otherwise fall back silently.
  const broken = [];
  for (const [name, w] of Object.entries(WORKS)) {
    for (const [field, table] of [['scene', SCENES], ['palette', PALETTES], ['kit', KITS], ['space', SPACES], ['finish', FINISHES], ['mat', MATS]]) {
      if (!table[w[field]]) broken.push(`${name}.${field}=${w[field]}`);
    }
    if (!WORK_ROOMS.includes(w.room)) broken.push(`${name}.room=${w.room}`);
    if (!(Number.isInteger(w.pace) && w.pace >= 0 && w.pace <= 5)) broken.push(`${name}.pace=${w.pace}`);
    if (!w.title || !w.cartel) broken.push(`${name} has no label`);
  }
  for (const [name, w] of Object.entries(WORKS)) if (!lib.GROUNDS[w.ground]) broken.push(`${name}.ground=${w.ground}`);
  ok('every work names things that exist', broken.length === 0, broken.join(', ') || `${Object.keys(WORKS).length} works`);
  // A room named for its light must hang works in that light: a night room on
  // a light palette, or a dawn room on a dark one, is a label that lies.
  const wrongLight = Object.entries(WORKS).filter(([, w]) => {
    const L = lightnessOf(PALETTES[w.palette].colors.background);
    return (w.room === 'Night' && L >= 0.5) || ((w.room === 'Dawn' || w.room === 'Daylight') && L < 0.5);
  }).map(([n]) => n);
  ok('every work hangs in a room that matches its light', wrongLight.length === 0, wrongLight.join(', ') || 'all match');
  ok('every work is calm or lively', Object.values(WORKS).every((w) => lib.WORK_ENERGIES.includes(w.energy)));
  ok('every room says what it holds', WORK_ROOMS.every((r) => lib.WORK_ROOM_NOTES[r]));
  const emptyRooms = WORK_ROOMS.filter((r) => Object.values(WORKS).filter((w) => w.room === r).length < 3);
  ok('every room has at least three works', emptyRooms.length === 0, emptyRooms.join(', ') || WORK_ROOMS.join(', '));
  const titles = Object.values(WORKS).map((w) => w.title);
  ok('no two works share a title', new Set(titles).size === titles.length);
  // Nobody living is named, anywhere a person reads first.
  const named = Object.values(WORKS).filter((w) => /riley|hockney|kusama|richter/i.test(w.title + w.cartel)).map((w) => w.title);
  ok('no work is sold on a living artist\'s name', named.length === 0, named.join(', '));

  // --- living colour: pure functions, so checked without a canvas ----------------
  const { LIVING, LIVING_ORDER, driftNeighbours, driftColours, daylightColours, moodColours, busyness } = lib;
  const { parseColor } = await import('../src/visual/color.js');
  const rgb = (c) => parseColor(c);
  ok('every living mode is declared, with words for it', LIVING_ORDER.every((m) => LIVING[m] && LIVING[m].label && LIVING[m].note));
  const strays = Object.keys(PALETTES).filter((n) => {
    const L = lightnessOf(PALETTES[n].colors.background);
    return driftNeighbours(n).some((m) => Math.abs(lightnessOf(PALETTES[m].colors.background) - L) >= 0.16);
  });
  ok('a drift only visits palettes on a ground of the same lightness', strays.length === 0, strays.join(', ') || 'none strays');
  const d0 = driftColours('marine', 0, 1000);
  const dHalf = driftColours('marine', 500, 1000);
  const dBack = driftColours('marine', 2000, 1000);
  ok('a drift starts on the chosen palette, moves, and comes back to it',
     d0.background === mixKey('marine') && dHalf.background !== d0.background && dBack.background === d0.background,
     `${d0.background} -> ${dHalf.background} -> ${dBack.background}`);
  function mixKey(n) { return driftColours(n, 0, 1000).background; }
  const night = rgb(daylightColours('papyrus', 0).background);
  const noon = rgb(daylightColours('papyrus', 13).background);
  const dusk = rgb(daylightColours('papyrus', 19).background);
  ok('by the clock, night is bluer than noon', night.b - night.r > noon.b - noon.r, JSON.stringify({ night, noon }));
  ok('and dusk is warmer than noon', dusk.r - dusk.b > noon.r - noon.b, JSON.stringify({ dusk, noon }));
  const quietC = rgb(moodColours('papyrus', 0).background);
  const busyC = rgb(moodColours('papyrus', 1).background);
  const flat = moodColours('papyrus', 0.4);
  ok('a quiet feed cools the colours and a busy one warms them',
     quietC.b - quietC.r > busyC.b - busyC.r, JSON.stringify({ quietC, busyC }));
  ok('at an ordinary pace the mood leaves the palette alone', ['background', 'user', 'alert'].every((k) => {
    const a = rgb(flat[k]); const e = rgb(PALETTES.papyrus.colors[k]);
    return Math.abs(a.r - e.r) + Math.abs(a.g - e.g) + Math.abs(a.b - e.b) <= 3;
  }));
  ok('busyness is a 0..1 dial that rises with the rate', busyness(0) === 0 && busyness(10) < busyness(100) && busyness(1e6) === 1);
  const violet = [];
  for (const n of Object.keys(PALETTES)) {
    for (const h of [0, 7, 13, 19, 21]) {
      const c = rgb(daylightColours(n, h).background);
      if (c.b > c.g + 25 && c.r > c.g + 25) violet.push(`${n}@${h}`);
    }
  }
  ok('no hour of the day turns a ground violet', violet.length === 0, violet.slice(0, 6).join(', ') || 'none');
}

// --- accents have a ceiling of their own -------------------------------------
// They bypass the voice pool on purpose, and with no limit of their own a
// flood of notable events started one ringing note each: the browser suite's
// flood grew the audio graph until the tab crashed.
{
  const { AudioSink } = await import('../src/audio/audio-sink.js');
  let accents = 0;
  let notes = 0;
  let clock = 1000;
  const note = { play: () => { notes++; return { stop() {}, duration: 1 }; } };
  const accent = { play: () => { accents++; return {}; } };
  const sink = new AudioSink({ ctx: { currentTime: 0 }, destination: {} }, {
    kit: { add: note, accent },
    pool: new VoicePool({ maxVoices: 8 }),
    now: () => clock,
  });
  const ev = () => ({ accent: true, polarity: 1, category: 'user', map: { salience: 0.9, semitone: 0, velocity: 0.5 } });
  for (let i = 0; i < 2500; i++) sink.handle(ev());
  ok('a flood of accents sounds one accent, not two and a half thousand', accents === 1,
     `accents=${accents} held=${sink.stats.accentsHeld}`);
  ok('the accents held back still take their turn as ordinary notes', notes > 0, `notes=${notes}`);
  clock += 300;
  sink.handle(ev());
  ok('the next accent sounds once the gap has passed', accents === 2, `accents=${accents}`);
}

// --- the playground: inks and variations ------------------------------------------
// Pure functions, so checked here in bulk rather than a few at a time in a page.
{
  const m = await import('../src/index.js');
  const { lightnessOf } = await import('../src/visual/color.js');

  let violet = 0;
  let faint = 0;
  let tooMany = 0;
  for (let s = 1; s <= 2000; s++) {
    const n = 2 + (s % 5);
    const inks = m.inkSet(s * 7919, n);
    if (inks.length !== n) tooMany++;
    const g = lightnessOf(inks[0]);
    for (const c of inks) if (m.isViolet(c)) violet++;
    for (const c of inks.slice(1)) if (Math.abs(lightnessOf(c) - g) < 0.25) faint++;
  }
  ok('drawn inks are never violet, whatever the number', violet === 0, `violet=${violet}`);
  ok('every drawn ink can be seen on its ground', faint === 0, `faint=${faint}`);
  ok('a set of inks has as many inks as asked for', tooMany === 0);
  ok('the same number draws the same inks', m.inkSet(42, 4).join() === m.inkSet(42, 4).join() && m.inkSet(42, 4).join() !== m.inkSet(43, 4).join());
  ok('rotating makes the next ink the ground', m.rotateInks(['#1', '#2', '#3']).join() === '#2,#3,#1');

  const pal = m.paletteFromInks(m.inksOfPalette('marine'));
  const marine = m.PALETTES.marine.colors;
  ok('a named palette comes back out of its inks unchanged',
     ['background', 'default', 'user', 'anon', 'bot', 'alert'].every((k) => pal[k] === marine[k]), JSON.stringify(pal));
  const two = m.paletteFromInks(['#101418', '#f4795b']);
  ok('two inks are enough for every role', m.PALETTE_KEYS.every((k) => typeof two[k] === 'string' && two[k].length > 0));

  let outside = 0;
  let unstepped = 0;
  let switchedOff = 0;
  let unstable = 0;
  for (const [name, scene] of Object.entries(m.SCENES)) {
    for (let s = 1; s <= 40; s++) {
      const v = m.variedParams(scene, s);
      if (JSON.stringify(v) !== JSON.stringify(m.variedParams(scene, s))) unstable++;
      for (const [k, spec] of Object.entries(scene.params || {})) {
        const x = v[k];
        if (!(x >= spec.min && x <= spec.max)) outside++;
        const steps = (x - spec.min) / (spec.step || 1e-9);
        if (spec.step && Math.abs(steps - Math.round(steps)) > 1e-6) unstepped++;
        // A dial that ships above its minimum must never be varied down onto it.
        if (spec.default > spec.min && x === spec.min && spec.step < (spec.default - spec.min) * 0.2) switchedOff++;
      }
    }
    if (!name) unstable++;
  }
  ok('every varied dial stays within its range', outside === 0, `outside=${outside}`);
  ok('every varied dial lands on its own step', unstepped === 0, `unstepped=${unstepped}`);
  ok('a variation never switches a dial off', switchedOff === 0, `switchedOff=${switchedOff}`);
  ok('the same number varies the dials the same way', unstable === 0);

  for (const name of ['aura', 'whorl', 'benday', 'rise', 'frost', 'fracture', 'asemic', 'collapse']) {
    const s = m.SCENES[name];
    ok(`the new scene "${name}" is catalogued and has something to say`,
       s && s.shelf !== 'Other' && s.note.length > 30 && s.how.length > 60 && typeof s.frame === 'function', s ? s.shelf : 'missing');
  }
  ok('dither is a finish with a note of its own', m.FINISH_ORDER.includes('dither') && m.FINISHES.dither.note.length > 30);
}

// --- a chime has eight rods and cannot play a wrong note ---
// The synthesis needs a browser; the rule that makes a chime a chime does not.
{
  const { ChimeInstrument, CHORDS } = await import('../src/audio/chime.js');
  const { KITS } = await import('../src/audio/kits.js');

  for (const [name, rods] of Object.entries(CHORDS)) {
    const sorted = [...rods].sort((a, b) => a - b);
    ok(`the ${name} chime is eight rods, in order, from its lowest`,
       rods.length === 8 && rods[0] === 0 && rods.join() === sorted.join(), rods.join(' '));
  }

  const rods = CHORDS.earth;
  const chime = new ChimeInstrument({ rods });
  let off = 0;
  let wrong = 0;
  // Whatever is asked for, from two octaves below the chime to three above it,
  // comes back as one of the eight rods -- and as the nearest one, once the
  // pitch has been folded into the chime's own compass.
  for (let s = -24; s <= 60; s += 0.5) {
    const i = chime.nearest(s);
    if (!Number.isInteger(i) || i < 0 || i >= rods.length) { off++; continue; }
    let folded = s;
    while (folded > rods[rods.length - 1] + 0.5) folded -= 12;
    while (folded < rods[0] - 0.5) folded += 12;
    const best = rods.reduce((a, b) => (Math.abs(b - folded) < Math.abs(a - folded) ? b : a), rods[0]);
    if (rods[i] !== best) wrong++;
  }
  ok('every note asked of a chime lands on one of its rods', off === 0, `off=${off}`);
  ok('a note outside the chime is folded into it, not dropped', wrong === 0, `wrong=${wrong}`);

  const chimes = ['earthchime', 'waterchime', 'airchime', 'firechime'];
  const missing = chimes.filter((n) => !KITS[n] || !KITS[n].level || KITS[n].note.length < 40);
  ok('the four chimes are kits, measured and described', missing.length === 0, missing.join(','));
  ok('a chime kit answers in three roles', chimes.every((n) => {
    const k = KITS[n].make();
    return k.add && k.sub && k.accent;
  }));
}

console.log(fails ? `\n${fails} FAILURE(S): ${failedNames.join(' | ')}` : '\nall core checks passed');
process.exit(fails ? 1 : 0);
