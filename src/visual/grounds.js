// Grounds: what the picture is printed on.
//
// A finish decides what the marks are made of. A ground decides what they sit
// on: a sheet of cotton rag, the tooth of cold-pressed watercolour paper, the
// long fibres of washi, the weave of a linen canvas. It is the difference
// between a picture on a screen and a print on a wall, and it is most of what
// makes generative work read as an object rather than as a render.
//
// A sheet is not a photograph laid over the picture. Each is generated from a
// height field -- fibres, tooth, weave, trowel marks -- lit by a raking light,
// so the relief catches the light the way paper does, and an albedo -- the
// paper's own colour, its flecks, its foxing. The picture is laid into it: the
// relief over everything, as ink sits in the tooth; the paper's colour showing
// through the marks, as it does through any translucent ink; and, on a dark
// sheet, fibres catching the light.
//
// The same pass prints the picture rather than displaying it. Nothing is pure
// black and nothing pure white, because no ink is the first and no paper the
// second, and a fine grain of colour rather than of grey lies over the whole,
// which is what film and print grain are.
//
// A sheet is built once per session at a fixed size and laid over any canvas
// by scaling it to cover: building it at the canvas's own size cost up to
// three quarters of a second on a thumbnail, and would have been redone on
// every resize. Even so a sheet is a few hundred milliseconds of work on a slow
// machine, so it is built in the background, a slice at a time, and the paper
// arrives a moment after it is chosen rather than freezing the click that
// chose it. A frame then costs a handful of draws.

import { lightnessOf, parseColor } from './color.js';

export const GROUND_ORDER = ['none', 'cotton', 'coldpress', 'hotpress', 'washi', 'kraft', 'black', 'linen', 'plaster', 'aged'];

export const GROUNDS = {
  none: { label: 'Screen', note: 'Light on glass, exactly as the scene draws it. No paper, no print.' },
  cotton: {
    label: 'Cotton rag', note: 'A heavy, warm-white rag paper with a fine fibre in it. The paper of good prints.',
    tint: '#f6f0e5', relief: 0.3, tone: 'light',
  },
  coldpress: {
    label: 'Cold-pressed', note: 'Watercolour paper with its tooth: colour catches on the high points and pools in the hollows.',
    tint: '#f7f3ea', relief: 0.55, tone: 'light',
  },
  hotpress: {
    label: 'Hot-pressed', note: 'Smooth, ironed watercolour paper. Almost no tooth, every line crisp.',
    tint: '#f9f6ef', relief: 0.18, tone: 'light',
  },
  washi: {
    label: 'Washi', note: 'Japanese kozo paper, cloudy where it is thin and thick, with long fibres and the odd fleck of bark.',
    tint: '#f3ecde', relief: 0.3, tone: 'light',
  },
  kraft: {
    label: 'Kraft', note: 'Brown wrapping paper, flecked and fibrous. Everything printed on it turns warm and a little rough.',
    tint: '#dcc39f', relief: 0.34, tone: 'light',
  },
  black: {
    label: 'Black paper', note: 'Deep black card with a faint fibre that catches the light, for pictures that glow.',
    relief: 0.34, tone: 'dark', sheen: 0.07,
  },
  linen: {
    label: 'Linen canvas', note: 'A primed linen canvas: the weave shows through the paint, a little irregular, as linen is.',
    tint: '#f1eadd', relief: 0.42, tone: 'light',
  },
  plaster: {
    label: 'Lime plaster', note: 'A wall of lime wash, clouded and trowelled, the ground of a fresco.',
    tint: '#efe9df', relief: 0.4, tone: 'light',
  },
  aged: {
    label: 'Old paper', note: 'A sheet that has waited in a drawer: yellowed towards the edges and spotted with foxing.',
    tint: '#f3ead7', relief: 0.28, tone: 'light',
  },
};

// The size every sheet is built at: half of a large screen, which is as fine
// as paper tooth ever needs to be.
const SW = 960;
const SH = 640;

// Working memory, kept between builds. Each sheet used to allocate a dozen
// arrays of two and a half megabytes, and the garbage collector reclaimed them
// all at once in pauses of up to a third of a second -- the one thing the
// background build could not slice. Reused, a build allocates almost nothing.
const WORK = { floats: [], grid: null, image: null, field: null };

/** Working array k, the size of a sheet. */
function floats(k) {
  if (!WORK.floats[k]) WORK.floats[k] = new Float32Array(SW * SH);
  return WORK.floats[k];
}

/** One ImageData the size of a sheet, written into and copied out. */
function image() {
  if (!WORK.image) WORK.image = new ImageData(SW, SH);
  return WORK.image;
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise with features `cell` pixels across, from a grid of random values. */
function* lattice(w, h, cell, rnd, out) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  // The grid, from one buffer large enough for the finest noise used.
  if (!WORK.grid || WORK.grid.length < gw * gh) WORK.grid = new Float32Array(gw * gh);
  const g = WORK.grid;
  for (let i = 0; i < gw * gh; i++) g[i] = rnd();
  // Where each column falls in the grid and how far across, worked out once:
  // a division and a floor for every pixel of every layer was most of the cost.
  const cx = new Int32Array(w);
  const cs = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = x / cell;
    cx[x] = fx | 0;
    const t = fx - cx[x];
    cs[x] = t * t * (3 - 2 * t);
  }
  for (let y = 0; y < h; y++) {
    const fy = y / cell;
    const y0 = fy | 0;
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const r0 = y0 * gw;
    const r1 = r0 + gw;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i0 = r0 + cx[x];
      const i1 = r1 + cx[x];
      const sx = cs[x];
      const top = g[i0] + (g[i0 + 1] - g[i0]) * sx;
      const bottom = g[i1] + (g[i1 + 1] - g[i1]) * sx;
      out[row + x] = top + (bottom - top) * sy;
    }
    if ((y & 47) === 47) yield;
  }
  return out;
}

function canvasOf(w, h) {
  return typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

/** Marks drawn in white on black and read back as a field: fibres, flecks, trowel strokes. */
function* drawnField(w, h, draw) {
  if (!WORK.field) WORK.field = canvasOf(w, h).getContext('2d', { willReadFrequently: true });
  const g = WORK.field;
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  yield* draw(g);
  yield;
  const d = g.getImageData(0, 0, w, h).data;
  const out = floats(7);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

function* fibres(g, w, h, rnd, { count, length, width, alpha, curl }) {
  for (let i = 0; i < count; i++) {
    if (i % 120 === 119) yield;
    let x = rnd() * w;
    let y = rnd() * h;
    let a = rnd() * Math.PI * 2;
    const len = length * (0.4 + rnd());
    g.strokeStyle = `rgba(255,255,255,${alpha * (0.4 + rnd() * 0.6)})`;
    g.lineWidth = width * (0.6 + rnd() * 0.8);
    g.beginPath();
    g.moveTo(x, y);
    const steps = Math.max(3, Math.round(len / 4));
    for (let k = 0; k < steps; k++) {
      a += (rnd() - 0.5) * curl;
      x += Math.cos(a) * (len / steps);
      y += Math.sin(a) * (len / steps);
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function* flecks(g, w, h, rnd, count, size) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
    g.beginPath();
    g.ellipse(rnd() * w, rnd() * h, size * (0.3 + rnd()), size * (0.2 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * One sheet: its relief, its colour and, for a dark card, its sheen, as
 * canvases at the fixed size, ready to be laid over any picture.
 */
function* buildSheet(name) {
  const def = GROUNDS[name];
  if (!def || name === 'none') return null;
  const w = SW;
  const h = SH;
  const n = w * h;
  const rnd = seeded(0x51ee7 + name.length * 977 + name.charCodeAt(0) * 131 + name.charCodeAt(1));
  const height = floats(0).fill(0);
  const shade = floats(1).fill(1);
  let fib = null;
  let slot = 2;
  const L = (cell) => lattice(w, h, cell, rnd, floats(slot++));

  switch (name) {
    case 'cotton': {
      fib = yield* drawnField(w, h, (g) => fibres(g, w, h, rnd, { count: 700, length: 10, width: 0.7, alpha: 0.5, curl: 0.9 }));
      const a = yield* L(1.6);
      const b = yield* L(4);
      const c = yield* L(34);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        height[i] = a[i] * 0.55 + b[i] * 0.3 + fib[i] * 0.3 + c[i] * 0.1;
        shade[i] = 1 - fib[i] * 0.03 - (c[i] - 0.5) * 0.025;
      }
      break;
    }
    case 'coldpress': {
      const a = yield* L(5);
      const b = yield* L(2);
      const c = yield* L(22);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        height[i] = a[i] * Math.sqrt(a[i]) + b[i] * 0.22 + c[i] * 0.18;
        shade[i] = 1 - (1 - a[i]) * 0.03;
      }
      break;
    }
    case 'hotpress': {
      const a = yield* L(1.5);
      const c = yield* L(46);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        height[i] = a[i] * 0.3 + c[i] * 0.12;
        shade[i] = 1 - (c[i] - 0.5) * 0.015;
      }
      break;
    }
    case 'washi': {
      fib = yield* drawnField(w, h, function* (g) {
        yield* fibres(g, w, h, rnd, { count: 240, length: 110, width: 0.8, alpha: 0.5, curl: 0.3 });
        yield* flecks(g, w, h, rnd, 70, 1.3);
      });
      const cloud = yield* L(70);
      const cloud2 = yield* L(24);
      const a = yield* L(2);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        const cl = cloud[i] * 0.7 + cloud2[i] * 0.3;
        height[i] = cl * 0.3 + a[i] * 0.2 + fib[i] * 0.6;
        shade[i] = 1 - (cl - 0.5) * 0.09 - fib[i] * 0.045;
      }
      break;
    }
    case 'kraft': {
      fib = yield* drawnField(w, h, function* (g) {
        yield* fibres(g, w, h, rnd, { count: 900, length: 8, width: 0.8, alpha: 0.55, curl: 1.2 });
        yield* flecks(g, w, h, rnd, 420, 0.9);
      });
      const a = yield* L(2);
      const c = yield* L(50);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        height[i] = a[i] * 0.5 + fib[i] * 0.4;
        shade[i] = 1 - fib[i] * 0.1 - (c[i] - 0.5) * 0.06;
      }
      break;
    }
    case 'black': {
      fib = yield* drawnField(w, h, (g) => fibres(g, w, h, rnd, { count: 560, length: 12, width: 0.6, alpha: 0.6, curl: 1 }));
      const a = yield* L(2);
      for (let i = 0; i < n; i++) height[i] = a[i] * 0.5 + fib[i] * 0.35;
      break;
    }
    case 'linen': {
      const p = 3.2;
      const irregular = yield* L(30);
      const fine = yield* L(1.5);
      for (let y = 0, i = 0; y < h; y++) {
        const ry = Math.floor(y / p);
        for (let x = 0; x < w; x++, i++) {
          // Warp and weft, each thread a little thicker or thinner than the next.
          const rx = Math.floor(x / p);
          const warp = Math.abs(Math.sin((x / p) * Math.PI));
          const weft = Math.abs(Math.sin((y / p) * Math.PI));
          const over = (rx + ry) % 2 ? warp : weft;
          height[i] = over * (0.6 + irregular[i] * 0.4) + fine[i] * 0.2;
          shade[i] = 1 - (1 - over) * 0.035 - (irregular[i] - 0.5) * 0.03;
        }
        if ((y & 47) === 47) yield;
      }
      break;
    }
    case 'plaster': {
      const trowel = yield* drawnField(w, h, function* (g) {
        for (let i = 0; i < 60; i++) {
          const x = rnd() * w;
          const y = rnd() * h;
          const r = 40 + rnd() * 140;
          const a0 = rnd() * Math.PI * 2;
          g.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.12})`;
          g.lineWidth = 14 + rnd() * 30;
          g.beginPath();
          g.arc(x, y, r, a0, a0 + 0.6 + rnd() * 1.2);
          g.stroke();
        }
      });
      const cloud = yield* L(60);
      const a = yield* L(2.5);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        height[i] = cloud[i] * 0.4 + trowel[i] * 0.8 + a[i] * 0.22;
        shade[i] = 1 - (cloud[i] - 0.5) * 0.08 + trowel[i] * 0.03;
      }
      break;
    }
    case 'aged': {
      fib = yield* drawnField(w, h, (g) => fibres(g, w, h, rnd, { count: 600, length: 10, width: 0.7, alpha: 0.5, curl: 0.9 }));
      const a = yield* L(1.8);
      const c = yield* L(40);
      for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
        height[i] = a[i] * 0.55 + fib[i] * 0.3;
        shade[i] = 1 - (c[i] - 0.5) * 0.05 - fib[i] * 0.03;
      }
      break;
    }
    default:
      return null;
  }

  // The relief, lit from the upper left at a low angle: grey where the sheet is
  // flat, lighter on the slopes that face the light, darker on those that do not.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
    if (height[i] < lo) lo = height[i];
    if (height[i] > hi) hi = height[i];
  }
  const span = Math.max(1e-6, hi - lo);
  const relief = canvasOf(w, h);
  const rg = relief.getContext('2d');
  const img = image();
  const rd = img.data;
  for (let y = 0; y < h; y++) {
    const up = Math.max(0, y - 1) * w;
    const dn = Math.min(h - 1, y + 1) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const slope = (height[row + Math.max(0, x - 1)] - height[row + Math.min(w - 1, x + 1)] + height[up + x] - height[dn + x]) / span;
      const v = 128 + slope * 150;
      rd[i * 4] = rd[i * 4 + 1] = rd[i * 4 + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
      rd[i * 4 + 3] = 255;
    }
    if ((y & 47) === 47) yield;
  }
  rg.putImageData(img, 0, 0);
  yield;

  // The paper's own colour, with its flecks, its clouds and, for an old sheet,
  // its foxing and its yellowed edges.
  let albedo = null;
  if (def.tone === 'light') {
    albedo = canvasOf(w, h);
    const ag = albedo.getContext('2d');
    const aimg = image();
    const ad = aimg.data;
    const { r: tr, g: tg, b: tb } = parseColor(def.tint);
    for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
      const k = shade[i] > 1.03 ? 1.03 : shade[i];
      ad[i * 4] = Math.min(255, tr * k);
      ad[i * 4 + 1] = Math.min(255, tg * k);
      ad[i * 4 + 2] = Math.min(255, tb * k);
      ad[i * 4 + 3] = 255;
      if ((i & 131071) === 131071) yield;
    }
    ag.putImageData(aimg, 0, 0);
    yield;
    if (name === 'aged') {
      ag.globalCompositeOperation = 'multiply';
      const edge = ag.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      edge.addColorStop(0, 'rgba(255,255,255,1)');
      edge.addColorStop(1, 'rgba(236,216,180,1)');
      ag.fillStyle = edge;
      ag.fillRect(0, 0, w, h);
      for (let i = 0; i < 38; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const r = 1.5 + rnd() ** 3 * 12;
        const spot = ag.createRadialGradient(x, y, 0, x, y, r);
        spot.addColorStop(0, `rgba(176,126,76,${0.1 + rnd() * 0.18})`);
        spot.addColorStop(1, 'rgba(170,110,60,0)');
        ag.fillStyle = spot;
        ag.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ag.globalCompositeOperation = 'source-over';
    }
  }

  // On a dark card the fibres are what catch the light.
  let sheen = null;
  if (def.sheen && fib) {
    sheen = canvasOf(w, h);
    const sg = sheen.getContext('2d');
    const simg = image();
    const sd = simg.data;
    for (let i = 0; i < n; i++) {
        if ((i & 65535) === 65535) yield;
      const v = Math.min(255, fib[i] * 255);
      sd[i * 4] = v;
      sd[i * 4 + 1] = v * 0.97;
      sd[i * 4 + 2] = v * 0.92;
      sd[i * 4 + 3] = 255;
    }
    sg.putImageData(simg, 0, 0);
  }

  return { relief, albedo, sheen };
}

/** A fine grain of colour, the grain of film and of print. */
function buildGrain() {
  const cv = canvasOf(SW, SH);
  const g = cv.getContext('2d');
  const img = g.createImageData(SW, SH);
  const d = img.data;
  const rnd = seeded(0x9a1e);
  for (let i = 0; i < d.length; i += 4) {
    const base = (rnd() - 0.5) * 70;
    d[i] = 128 + base + (rnd() - 0.5) * 34;
    d[i + 1] = 128 + base + (rnd() - 0.5) * 34;
    d[i + 2] = 128 + base + (rnd() - 0.5) * 34;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// Built once per session and shared by every canvas on the page: the live
// picture, the cards and the bench all lay the same sheet.
const SHEETS = {};
const BUILDING = {};
let GRAIN = null;

/**
 * A sheet, if it is ready. With `sync`, built on the spot if it is not: for an
 * export, which has to have its paper and can afford to wait for it.
 */
export function sheetOf(name, { sync = false } = {}) {
  if (SHEETS[name] !== undefined) return SHEETS[name];
  if (!sync) return null;
  // Builds share their working memory, so they never overlap: whatever is
  // queued is finished first, in order, and this one after it.
  while (QUEUE.length) {
    const job = QUEUE.shift();
    let r = job.gen.next();
    while (!r.done) r = job.gen.next();
    SHEETS[job.name] = r.value;
    job.resolve(r.value);
    if (job.name === name) return r.value;
  }
  const gen = buildSheet(name);
  let r = gen.next();
  while (!r.done) r = gen.next();
  SHEETS[name] = r.value;
  return r.value;
}

/** Whether a ground can be laid now, without building anything. */
export const groundReady = (name) => name === 'none' || SHEETS[name] !== undefined;

/**
 * Build a sheet in the background, a few milliseconds at a time with the page
 * free in between, and resolve when it is ready. A sheet is a few hundred
 * milliseconds of work on a slow machine; done at once it froze the page on
 * the click that chose it, done this way the paper simply arrives a moment
 * later.
 */
export function prepareGround(name) {
  if (!GROUNDS[name] || name === 'none') return Promise.resolve(null);
  if (SHEETS[name] !== undefined) return Promise.resolve(SHEETS[name]);
  if (BUILDING[name]) return BUILDING[name].promise;
  const job = { name, gen: buildSheet(name) };
  job.promise = new Promise((resolve) => {
    job.resolve = resolve;
  });
  BUILDING[name] = job;
  QUEUE.push(job);
  if (QUEUE.length === 1) setTimeout(work, 0);
  return job.promise;
}

// One sheet at a time: nine asked for at once -- the paper cards all painting
// together -- would otherwise interleave and keep the page busy for seconds.
const QUEUE = [];
/** How long the longest uninterrupted step of building a sheet has taken, in ms. */
export const groundStats = { longestStep: 0, times: new Float32Array(4096), count: 0 };
const clock = () => (typeof performance === 'object' ? performance.now() : Date.now());

function work() {
  const job = QUEUE[0];
  if (!job) return;
  if (SHEETS[job.name] !== undefined) {
    QUEUE.shift();
    job.resolve(SHEETS[job.name]);
    if (QUEUE.length) setTimeout(work, 0);
    return;
  }
  const until = clock() + 8;
  let r;
  do {
    const t = clock();
    r = job.gen.next();
    // The one thing that could still hold the page is a single step too long
    // to interrupt, so the longest is kept, and the suite holds it down.
    job.steps = (job.steps || 0) + 1;
    const took = clock() - t;
    groundStats.times[groundStats.count++ % groundStats.times.length] = took;
    if (took > groundStats.longestStep) {
      groundStats.longestStep = took;
      groundStats.longestAt = `${job.name}#${job.steps}`;
    }
  } while (!r.done && clock() < until);
  if (r.done) {
    SHEETS[job.name] = r.value;
    QUEUE.shift();
    job.resolve(r.value);
    if (QUEUE.length) setTimeout(work, 12);
  } else {
    setTimeout(work, 12);
  }
}

/**
 * Lay the picture on a ground and print it.
 *
 * Works on whatever is on the canvas now, in the canvas's own pixels, and
 * leaves the context's state as it found it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} name        a key of GROUNDS
 * @param {object} o
 * @param {object} o.palette   the palette's colours, which decide whether the
 *                             paper's colour shows: a light picture takes the
 *                             paper's tint, a dark one only its surface
 * @returns {boolean} whether anything was done
 */
export function applyGround(ctx, name, { palette, sync = false } = {}) {
  const def = GROUNDS[name];
  if (!def || name === 'none' || !ctx) return false;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (!(W > 0 && H > 0)) return false;
  const sheet = sheetOf(name, { sync });
  if (!sheet) {
    // Not ready: the picture goes out as it is this frame, and the sheet is
    // on its way.
    prepareGround(name);
    return false;
  }
  if (!GRAIN) GRAIN = buildGrain();
  const light = !palette || lightnessOf(palette.background) >= 0.5;
  // Scaled to cover, centred: the sheet is larger than any thumbnail and about
  // the size of a screen, so it is seldom stretched by much.
  const k = Math.max(W / SW, H / SH);
  const dw = SW * k;
  const dh = SH * k;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    // The paper's colour through the picture, where the picture is light.
    if (sheet.albedo && light) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1;
      ctx.drawImage(sheet.albedo, dx, dy, dw, dh);
    }
    // The relief, over ink and paper alike: gentler on a dark picture, where
    // soft light greys what it lightens.
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, def.relief * (light ? 1 : 0.6));
    ctx.drawImage(sheet.relief, dx, dy, dw, dh);
    if (sheet.sheen) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = def.sheen;
      ctx.drawImage(sheet.sheen, dx, dy, dw, dh);
    }
    // Printed, not displayed: no ink is pure black and no paper pure white.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = '#0c0b0a';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'darken';
    ctx.fillStyle = '#fbf8f2';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = light ? 0.14 : 0.1;
    ctx.drawImage(GRAIN, dx, dy, dw, dh);
  } catch (e) {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

/** Whether a ground is a light sheet or a dark card, for choosing a palette to suit it. */
export const groundTone = (name) => (GROUNDS[name] && GROUNDS[name].tone) || null;
