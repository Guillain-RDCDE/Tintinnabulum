// Water: colour meeting water, and water holding light.
//
// A drop of watercolour opening in a glass, washes spreading on wet paper,
// petals landing on a pond, a pond painted in broken strokes, and a garden
// where the water is only gravel raked to look like it. In each the feed is
// the hand -- a drop, a touch of the brush, a breath of wind, a stone set down
// -- and the water does what water does with it.
//
// Fixed, typed collections; offscreen work only on the shared 'buf' and
// 'layer' buffers, so a change of scene never buys a canvas.

import { scratch } from './paint.js';
import { mixColors, lighten, lightnessOf } from '../color.js';
import { noise2 } from './noise.js';

const TAU = Math.PI * 2;

function seeded(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** The accumulation buffer, cleared on the first frame of a scene. */
function bufferFor(api, key = 'buf') {
  const cv = scratch(api, key);
  if (!cv) return null;
  const g = api.scene[key + 'Ctx'];
  if (!api.scene[key + 'Clean']) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    api.scene[key + 'Clean'] = true;
  }
  return g;
}

/** Fade an accumulation buffer towards clear, at a rate per second. */
function fadeBuffer(g, cv, perSecond, dt) {
  if (perSecond <= 0) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = `rgba(0,0,0,${Math.min(0.25, (perSecond * dt) / 1000)})`;
  g.fillRect(0, 0, cv.width, cv.height);
  g.restore();
}

/** Paper for the watercolour scenes: a light palette's own ground, or cream. */
const paperOf = (pal) => (lightnessOf(pal.background) > 0.6 ? pal.background : '#efe8da');

/** A petal, as a subpath: a rounded blade with a notch at the outer end. */
function petal(ctx, x, y, a, s) {
  const c = Math.cos(a);
  const n = Math.sin(a);
  const P = (u, v) => [x + u * c - v * n, y + u * n + v * c];
  const [x0, y0] = P(0, s);
  const [c1x, c1y] = P(-s * 0.95, s * 0.35);
  const [e1x, e1y] = P(-s * 0.45, -s * 0.8);
  const [nx, ny] = P(0, -s * 0.55);
  const [e2x, e2y] = P(s * 0.45, -s * 0.8);
  const [c2x, c2y] = P(s * 0.95, s * 0.35);
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(c1x, c1y, e1x, e1y);
  ctx.lineTo(nx, ny);
  ctx.lineTo(e2x, e2y);
  ctx.quadraticCurveTo(c2x, c2y, x0, y0);
  ctx.closePath();
}

export const WATER_SCENES = {
  // --- colour in water ------------------------------------------------------------
  inkwater: {
    label: 'Colour in water',
    positional: false,
    // Clouds take time to sink and open; a card run for the default seven
    // seconds showed them still bunched at the surface.
    preview: { frames: 170, dt: 62 },
    note: 'Drops of watercolour falling into a glass of clear water: each sinks, slows and opens into a cloud that curls over on itself, and where two clouds meet the colours mix. Every event is one drop from the brush.',
    params: {
      swirl: { label: 'How much the water turns', min: 0, max: 2, step: 0.05, default: 1 },
      clear: { label: 'How fast the water clears', min: 0, max: 1, step: 0.02, default: 0.3 },
    },
    init(api) {
      const s = api.scene;
      const N = 1400;
      s.N = N;
      s.x = new Float32Array(N);
      s.y = new Float32Array(N);
      s.ox = new Float32Array(N);
      s.vx = new Float32Array(N);
      s.vy = new Float32Array(N);
      s.age = new Float32Array(N).fill(1e9);
      s.ink = new Uint8Array(N);
      s.inks = new Array(24).fill('');
      s.nextInk = 0;
      s.next = 0;
      s.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      const slot = s.nextInk++ % 24;
      s.inks[slot] = p.color;
      const x0 = p.x;
      const y0 = api.h * (0.04 + Math.random() * 0.12);
      const speed = 0.025 + Math.min(0.05, p.r * 0.0006);
      for (let k = 0; k < 70; k++) {
        const i = s.next++ % s.N;
        const a = Math.random() * TAU;
        const sp = 0.01 + Math.random() * 0.04;
        s.x[i] = x0 + (Math.random() - 0.5) * 6;
        s.y[i] = y0 + (Math.random() - 0.5) * 6;
        s.vx[i] = Math.cos(a) * sp;
        s.vy[i] = speed * (0.6 + Math.random() * 0.8);
        s.age[i] = 0;
        s.ox[i] = x0;
        s.ink[i] = slot;
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      fadeBuffer(g, cv, api.param('clear') * 0.25, dt);
      const t = api.now / 1000;
      const swirl = api.param('swirl');
      // Small curls rather than a wind: at a larger scale the whole glass
      // swept one way and the clouds read as brush strokes.
      const f = 0.013;
      const drag = Math.exp(-dt / 900);
      for (let i = 0; i < s.N; i++) {
        if (s.age[i] > 14000) continue;
        s.age[i] += dt;
        // The turning grows as the drop slows: a falling drop cuts straight
        // down, and only once it has stopped does the water take it.
        const turn = Math.min(1, s.age[i] / 500) * swirl;
        const ang = noise2(s.x[i] * f, s.y[i] * f - t * 0.05) * TAU * 1.5;
        // Early on the cloud also spreads away from where the drop went in.
        const open = s.age[i] < 2500 ? (s.x[i] - s.ox[i]) * 0.0000008 * dt : 0;
        s.vx[i] = (s.vx[i] + Math.cos(ang) * 0.00006 * turn * dt + open) * drag;
        s.vy[i] = (s.vy[i] + Math.sin(ang) * 0.00006 * turn * dt + 0.00003 * dt) * drag;
        s.x[i] += s.vx[i] * dt;
        s.y[i] += s.vy[i] * dt;
        if (s.y[i] > H - 3) { s.y[i] = H - 3; s.vy[i] *= -0.2; }
        if (s.x[i] < 2) s.x[i] = 2;
        if (s.x[i] > W - 2) s.x[i] = W - 2;
      }
      // Pigment is laid down as soft discs that grow as it thins, batched by
      // colour and by how old it is: a hundred fills at most, however many drops.
      for (let slot = 0; slot < 24; slot++) {
        const colour = s.inks[slot];
        if (!colour) continue;
        for (let band = 0; band < 3; band++) {
          g.beginPath();
          let any = false;
          for (let i = 0; i < s.N; i++) {
            const age = s.age[i];
            if (s.ink[i] !== slot || age > 14000) continue;
            if ((age < 1500 ? 0 : age < 5000 ? 1 : 2) !== band) continue;
            const r = 1.5 + Math.min(18, age * 0.004);
            g.moveTo(s.x[i] + r, s.y[i]);
            g.arc(s.x[i], s.y[i], r, 0, TAU);
            any = true;
          }
          if (!any) continue;
          g.globalAlpha = band === 0 ? 0.1 : band === 1 ? 0.035 : 0.014;
          g.fillStyle = colour;
          g.fill();
        }
      }
      g.globalAlpha = 1;
      const pale = lightnessOf(pal.background) > 0.5 ? pal.background : mixColors(pal.background, '#e4ecee', 0.86);
      const water = ctx.createLinearGradient(0, 0, 0, H);
      water.addColorStop(0, lighten(pale, 0.03));
      water.addColorStop(1, mixColors(pale, pal.anon, 0.08));
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, W, H);
      // Multiplied, so pigment stains the water the way it does in a glass
      // rather than sitting on top of it like paint.
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(cv, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      // The surface, and light down the sides of the glass.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(0, H * 0.03, W, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, H * 0.03 + 1.5, W, 1);
      const side = ctx.createLinearGradient(0, 0, W, 0);
      side.addColorStop(0, 'rgba(255,255,255,0.22)');
      side.addColorStop(0.06, 'rgba(255,255,255,0)');
      side.addColorStop(0.94, 'rgba(255,255,255,0)');
      side.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, W, H);
    },
  },

  // --- wet on wet ----------------------------------------------------------------------
  washes: {
    label: 'Wet on wet',
    positional: false,
    note: 'Watercolour dropped onto paper that is still wet: each touch spreads by itself, pale in the middle and darker at the edge, where the pigment gathers as it dries, and washes laid over one another deepen like glazes. Events are touches of the brush.',
    params: {
      spread: { label: 'How far a wash spreads', min: 0.4, max: 2, step: 0.05, default: 1 },
      dry: { label: 'How long the paper stays wet', min: 0.5, max: 3, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      s.cx = new Float32Array(32);
      s.cy = new Float32Array(32);
      s.r = new Float32Array(32);
      s.t0 = new Float32Array(32).fill(-1e9);
      s.seed = new Float32Array(32);
      s.ink = new Array(32).fill('');
      s.next = 0;
      s.bufClean = false;
      s.paperKey = '';
    },
    event(p, api) {
      const s = api.scene;
      const i = s.next++ % 32;
      s.cx[i] = p.x;
      s.cy[i] = p.y;
      s.r[i] = (18 + p.r * 0.9) * api.param('spread');
      s.t0[i] = api.now;
      s.seed[i] = Math.random() * 100;
      s.ink[i] = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      fadeBuffer(g, cv, 0.012, dt);
      const dur = 2600 * api.param('dry');
      for (let i = 0; i < 32; i++) {
        const age = api.now - s.t0[i];
        if (age < 0 || age > dur || !s.ink[i]) continue;
        const u = age / dur;
        const grow = 1 - Math.pow(1 - u, 3);
        const R = s.r[i] * (0.25 + 0.75 * grow);
        const sd = s.seed[i];
        g.beginPath();
        for (let k = 0; k <= 56; k++) {
          const a = (k / 56) * TAU;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          // The edge wanders with noise sampled round a circle, so it closes.
          const rr = R * (1 + 0.22 * noise2(sd + ca * 1.3, sd + sa * 1.3) + 0.07 * noise2(sd * 2 + ca * 4, sa * 4 + u));
          const x = s.cx[i] + ca * rr;
          const y = s.cy[i] + sa * rr;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = s.ink[i];
        g.globalAlpha = 0.03 * (1 - u * 0.5);
        g.fill();
        // Pigment runs to the edge as the water there dries first.
        g.strokeStyle = s.ink[i];
        g.globalAlpha = 0.02 + 0.05 * u;
        g.lineWidth = 1.2 + R * 0.03;
        g.stroke();
        // Late in the drying, water creeping back into the wash leaves the
        // small ragged blooms watercolourists call cauliflowers.
        if (u > 0.6 && Math.random() < 0.1) {
          const a = Math.random() * TAU;
          g.globalAlpha = 0.05;
          g.beginPath();
          g.arc(s.cx[i] + Math.cos(a) * R * 0.9, s.cy[i] + Math.sin(a) * R * 0.9, R * (0.08 + Math.random() * 0.12), 0, TAU);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      ctx.fillStyle = paperOf(pal);
      ctx.fillRect(0, 0, W, H);
      // The tooth of the paper, laid once per size.
      const layer = scratch(api, 'layer');
      const lg = s.layerCtx;
      const key = `${layer.width}x${layer.height}`;
      if (s.paperKey !== key) {
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.clearRect(0, 0, layer.width, layer.height);
        const rnd = seeded(71);
        lg.fillStyle = '#000';
        for (let i = 0; i < 3200; i++) {
          lg.globalAlpha = rnd() * 0.05;
          lg.fillRect(rnd() * layer.width, rnd() * layer.height, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
        }
        lg.globalAlpha = 1;
        s.paperKey = key;
      }
      ctx.drawImage(layer, 0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(cv, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  // --- falling petals ---------------------------------------------------------------------
  petals: {
    label: 'Falling petals',
    positional: false,
    note: 'Cherry blossom coming down onto a still pond: petals turn as they fall, land with a small ring, and drift together on a current you can only see because of them. Every event is a breath of wind through the tree.',
    params: {
      count: { label: 'Petals', min: 40, max: 300, step: 5, default: 160, rebuild: true },
      current: { label: 'Current', min: 0, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const n = Math.round(api.param('count'));
      const rnd = seeded(1300);
      s.n = n;
      s.x = new Float32Array(n);
      s.y = new Float32Array(n);
      s.z = new Float32Array(n);
      s.a = new Float32Array(n);
      s.spin = new Float32Array(n);
      s.size = new Float32Array(n);
      s.vx = new Float32Array(n);
      s.vy = new Float32Array(n);
      s.shade = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        s.x[i] = rnd() * api.w;
        s.y[i] = rnd() * api.h;
        // Some already on the water, the rest waiting in the tree.
        s.z[i] = i < n * 0.55 ? 0 : -1;
        s.a[i] = rnd() * TAU;
        s.spin[i] = (rnd() - 0.5) * 0.004;
        s.size[i] = 4 + rnd() * 4;
        s.shade[i] = Math.floor(rnd() * 3);
      }
      s.rx = new Float32Array(16);
      s.ry = new Float32Array(16);
      s.rt = new Float32Array(16).fill(-1e9);
      s.nr = 0;
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      for (let k = 0; k < 5; k++) {
        const i = s.next++ % s.n;
        s.x[i] = p.x + (Math.random() - 0.5) * 80;
        s.y[i] = p.y + (Math.random() - 0.5) * 60;
        s.z[i] = 0.7 + Math.random() * 0.3;
        s.spin[i] = (Math.random() - 0.5) * 0.008;
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const t = api.now / 1000;
      const deep = mixColors(pal.background, '#24505c', lightnessOf(pal.background) > 0.5 ? 0.55 : 0.35);
      const water = ctx.createLinearGradient(0, 0, W, H);
      water.addColorStop(0, lighten(deep, 0.06));
      water.addColorStop(1, lighten(deep, -0.05));
      ctx.fillStyle = water;
      ctx.fillRect(0, 0, W, H);
      // The sky on the water: one broad soft band of light.
      const sky = ctx.createLinearGradient(0, H * 0.2, W, H * 0.7);
      sky.addColorStop(0, 'rgba(255,255,255,0)');
      sky.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      sky.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const current = api.param('current');
      const drag = Math.exp(-dt / 1500);
      for (let i = 0; i < s.n; i++) {
        if (s.z[i] < 0) continue;
        s.a[i] += s.spin[i] * dt;
        if (s.z[i] > 0) {
          s.z[i] -= dt * 0.00035;
          s.x[i] += Math.sin(t * 1.3 + i) * 0.02 * dt * s.z[i];
          if (s.z[i] <= 0) {
            s.z[i] = 0;
            s.spin[i] *= 0.1;
            const r = s.nr++ % 16;
            s.rx[r] = s.x[i];
            s.ry[r] = s.y[i];
            s.rt[r] = api.now;
          }
        } else {
          const ang = noise2(s.x[i] * 0.003, s.y[i] * 0.003 + t * 0.02) * TAU;
          s.vx[i] = (s.vx[i] + (Math.cos(ang) * 0.000015 + 0.000006) * current * dt) * drag;
          s.vy[i] = (s.vy[i] + Math.sin(ang) * 0.000015 * current * dt) * drag;
          s.x[i] += s.vx[i] * dt;
          s.y[i] += s.vy[i] * dt;
          s.spin[i] *= Math.exp(-dt / 3000);
          if (s.x[i] > W + 10) s.x[i] -= W + 20;
          if (s.x[i] < -10) s.x[i] += W + 20;
          if (s.y[i] > H + 10) s.y[i] -= H + 20;
          if (s.y[i] < -10) s.y[i] += H + 20;
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      for (let r = 0; r < 16; r++) {
        const age = api.now - s.rt[r];
        if (age < 0 || age > 2200) continue;
        ctx.globalAlpha = 1 - age / 2200;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.rx[r], s.ry[r], 3 + age * 0.012, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Shadows of the petals still in the air, on the water below them.
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        if (s.z[i] <= 0) continue;
        petal(ctx, s.x[i] + s.z[i] * 22, s.y[i] + s.z[i] * 14, s.a[i], s.size[i]);
      }
      ctx.fill();
      const shades = [
        mixColors('#f7c9d2', pal.anon, 0.12),
        '#fbf0f1',
        mixColors('#eba7b6', pal.alert, 0.1),
      ];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = shades[k];
        ctx.beginPath();
        for (let i = 0; i < s.n; i++) {
          if (s.z[i] < 0 || s.shade[i] !== k) continue;
          petal(ctx, s.x[i], s.y[i], s.a[i], s.size[i] * (1 + s.z[i] * 0.9));
        }
        ctx.fill();
      }
    },
  },

  // --- water lilies ---------------------------------------------------------------------------
  lilies: {
    label: 'Water lilies',
    positional: false,
    note: 'A pond painted in short strokes, the way the Impressionists painted light on water: the sky reflected in broken patches, pads afloat, flowers in pink and white, and the water repainted a little all the time. Events open a flower.',
    params: {
      strokes: { label: 'Brush strokes per second', min: 50, max: 900, step: 10, default: 300 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1914);
      s.pads = new Float32Array(18 * 3);
      for (let i = 0; i < 18; i++) {
        s.pads[i * 3] = rnd();
        s.pads[i * 3 + 1] = rnd();
        s.pads[i * 3 + 2] = 0.05 + rnd() * 0.06;
      }
      s.fx = new Float32Array(40);
      s.fy = new Float32Array(40);
      s.fs = new Float32Array(40);
      s.fc = new Array(40).fill('');
      for (let i = 0; i < 12; i++) {
        const pad = Math.floor(rnd() * 18);
        s.fx[i] = s.pads[pad * 3];
        s.fy[i] = s.pads[pad * 3 + 1];
        s.fs[i] = 0.6 + rnd() * 0.5;
      }
      s.nf = 12;
      s.built = '';
    },
    event(p, api) {
      const s = api.scene;
      const i = s.nf++ % 40;
      s.fx[i] = p.x / api.w;
      s.fy[i] = p.y / api.h;
      s.fs[i] = 0.6 + Math.min(0.8, p.r * 0.01);
      s.fc[i] = mixColors('#f4c2cf', p.color, 0.35);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const cv = scratch(api);
      const g = s.bufCtx;
      const inks = [
        mixColors('#1f4b5e', pal.user, 0.12),
        mixColors('#35707f', pal.anon, 0.12),
        mixColors('#6f9fae', pal.anon, 0.1),
        '#a9c8d2',
        '#dce8e2',
        mixColors('#c9b27a', pal.alert, 0.15),
      ];
      const U = Math.min(W, H);
      const inPad = (x, y) => {
        for (let i = 0; i < 18; i++) {
          const dx = x - s.pads[i * 3] * W;
          const dy = (y - s.pads[i * 3 + 1] * H) * 1.8;
          if (dx * dx + dy * dy < (s.pads[i * 3 + 2] * U) ** 2) return true;
        }
        return false;
      };
      // Colour by where the stroke is: deep water with patches of reflected
      // sky, found with noise so the patches are shapes rather than speckle.
      const inkAt = (x, y) => {
        const v = noise2(x * 0.004, y * 0.007) + 0.35 * noise2(x * 0.02, y * 0.03);
        return v < -0.35 ? 0 : v < -0.05 ? 1 : v < 0.2 ? 2 : v < 0.42 ? 3 : v < 0.72 ? 4 : 5;
      };
      const paint = (count, rnd) => {
        const paths = [[], [], [], [], [], []];
        for (let k = 0; k < count; k++) {
          const x = rnd() * W;
          const y = rnd() * H;
          if (inPad(x, y)) continue;
          paths[inkAt(x, y)].push(x, y, 5 + rnd() * 9, (rnd() - 0.5) * 0.5);
        }
        g.lineCap = 'round';
        g.globalAlpha = 0.75;
        for (let c = 0; c < 6; c++) {
          const list = paths[c];
          if (!list.length) continue;
          g.strokeStyle = inks[c];
          g.lineWidth = 3 + (c % 3);
          g.beginPath();
          for (let j = 0; j < list.length; j += 4) {
            const dx = Math.cos(list[j + 3]) * list[j + 2];
            const dy = Math.sin(list[j + 3]) * list[j + 2] * 0.4;
            g.moveTo(list[j] - dx, list[j + 1] - dy);
            g.lineTo(list[j] + dx, list[j + 1] + dy);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      };
      const key = `${cv.width}x${cv.height}:${pal.background}:${pal.user}`;
      if (s.built !== key) {
        const k = cv.width / W;
        g.setTransform(k, 0, 0, k, 0, 0);
        g.fillStyle = inks[1];
        g.fillRect(0, 0, W, H);
        paint(Math.round((W * H) / 90), seeded(5));
        // The pads: dabs in sage and olive, never the dark green of a
        // photograph, with the notch every lily pad has.
        const greens = ['#9db46f', '#7f9a5c', '#bcc780'];
        const rnd = seeded(6);
        g.lineCap = 'round';
        for (let i = 0; i < 18; i++) {
          const px = s.pads[i * 3] * W;
          const py = s.pads[i * 3 + 1] * H;
          const pr = s.pads[i * 3 + 2] * U;
          const notch = rnd() * TAU;
          for (let c = 0; c < 3; c++) {
            g.strokeStyle = greens[c];
            g.lineWidth = 3 + c;
            g.beginPath();
            for (let d = 0; d < 26; d++) {
              const a = rnd() * TAU;
              if (Math.abs(((a - notch + TAU + Math.PI) % TAU) - Math.PI) < 0.35) continue;
              const rr = Math.sqrt(rnd()) * pr * 0.9;
              const x = px + Math.cos(a) * rr;
              const y = py + (Math.sin(a) * rr) / 1.8;
              g.moveTo(x - 4, y);
              g.lineTo(x + 4, y + (rnd() - 0.5) * 2);
            }
            g.stroke();
          }
        }
        s.built = key;
      }
      // The water is repainted a little every frame, so it is never quite
      // the same picture twice -- which is what light on water does.
      paint(Math.round((api.param('strokes') * Math.min(50, api.dt)) / 1000) + 1, Math.random);
      ctx.drawImage(cv, 0, 0, W, H);
      // Flowers on top, painted fresh: a few dabs of pink and white round a
      // touch of yellow.
      ctx.lineCap = 'round';
      for (let i = 0; i < Math.min(40, s.nf); i++) {
        const x = s.fx[i] * W;
        const y = s.fy[i] * H;
        const sz = s.fs[i] * U * 0.026;
        const colour = s.fc[i] || (i % 3 ? '#f3c4cf' : '#faf3ee');
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(2, sz * 0.8);
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU + i;
          ctx.moveTo(x + Math.cos(a) * sz * 0.3, y + Math.sin(a) * sz * 0.2);
          ctx.lineTo(x + Math.cos(a) * sz * 1.3, y + Math.sin(a) * sz * 0.7 - sz * 0.2);
        }
        ctx.stroke();
        ctx.fillStyle = '#f2cf5b';
        ctx.fillRect(x - sz * 0.25, y - sz * 0.3, sz * 0.5, sz * 0.4);
      }
    },
  },

  // --- a raked garden -------------------------------------------------------------------------------
  zengarden: {
    label: 'Raked garden',
    positional: false,
    note: 'A dry garden of raked gravel: straight lines across the courtyard, and rings drawn round each stone as if the stone had dropped into still water. Events set a stone down, and the rake goes round it again.',
    params: {
      spacing: { label: 'Line spacing', min: 6, max: 20, step: 1, default: 10 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1499);
      s.sx = new Float32Array(8);
      s.sy = new Float32Array(8);
      s.sr = new Float32Array(8);
      s.sb = new Float32Array(8).fill(-1e9);
      s.seed = new Float32Array(8);
      const U = Math.min(api.w, api.h);
      for (let i = 0; i < 3; i++) {
        s.sx[i] = api.w * (0.2 + i * 0.3 + (rnd() - 0.5) * 0.1);
        s.sy[i] = api.h * (0.3 + rnd() * 0.4);
        s.sr[i] = U * (0.04 + rnd() * 0.04);
        s.seed[i] = rnd() * 100;
      }
      s.count = 3;
      s.next = 3;
      s.built = '';
      s.animating = false;
    },
    event(p, api) {
      const s = api.scene;
      const i = s.next++ % 8;
      s.sx[i] = p.x;
      s.sy[i] = p.y;
      s.sr[i] = Math.min(Math.min(api.w, api.h) * 0.09, 10 + p.r * 0.35);
      s.sb[i] = api.now;
      s.seed[i] = Math.random() * 100;
      s.count = Math.min(8, s.count + 1);
      s.built = '';
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const cv = scratch(api);
      const g = s.bufCtx;
      const sp = api.param('spacing');
      const key = `${cv.width}x${cv.height}:${pal.background}:${sp}`;
      if (s.built === key && !s.animating) {
        ctx.drawImage(cv, 0, 0, W, H);
        return;
      }
      const k = cv.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      const light = lightnessOf(pal.background) > 0.5;
      // Gravel is pale whatever the palette; a dark ground only tints it, or
      // the grooves -- which are the picture -- cannot be seen.
      const sand = light ? mixColors(pal.background, '#d9d0bd', 0.6) : mixColors(pal.background, '#a89f8c', 0.78);
      g.fillStyle = sand;
      g.fillRect(0, 0, W, H);
      const rnd = seeded(9);
      g.fillStyle = '#5f5648';
      for (let band = 0; band < 3; band++) {
        g.globalAlpha = 0.04 + band * 0.04;
        g.beginPath();
        for (let i = 0; i < 470; i++) g.rect(rnd() * W, rnd() * H, 1.2, 1.2);
        g.fill();
      }
      g.globalAlpha = 1;
      // Each stone's reach grows as the rake goes round it after it is set.
      let animating = false;
      const reach = new Float32Array(8);
      for (let i = 0; i < s.count; i++) {
        const age = api.now - s.sb[i];
        const u = age < 0 ? 1 : Math.min(1, age / 1800);
        if (u < 1) animating = true;
        reach[i] = s.sr[i] * (1.2 + 1.6 * (1 - Math.pow(1 - u, 3)));
      }
      s.animating = animating;
      const owner = (x, y) => {
        let best = -1;
        let bd = 1;
        for (let i = 0; i < s.count; i++) {
          const d = Math.hypot(x - s.sx[i], y - s.sy[i]) / reach[i];
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      };
      const groove = 'rgba(60,50,35,0.3)';
      const ridge = 'rgba(255,255,255,0.55)';
      const strokeBoth = () => {
        g.strokeStyle = groove;
        g.lineWidth = 1.6;
        g.stroke();
        g.save();
        g.translate(0, -1.3);
        g.strokeStyle = ridge;
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      };
      // Straight lines, broken wherever a stone's rings own the gravel.
      g.beginPath();
      for (let y = sp / 2; y < H; y += sp) {
        let pen = false;
        for (let x = 0; x <= W; x += 5) {
          const yy = y + Math.sin(x * 0.01 + y) * 0.6;
          if (owner(x, yy) >= 0) { pen = false; continue; }
          if (pen) g.lineTo(x, yy);
          else { g.moveTo(x, yy); pen = true; }
        }
      }
      strokeBoth();
      // Rings, each kept only where it is nearer, in proportion, to its own
      // stone than to any other -- which is how two sets of rings meet.
      g.beginPath();
      for (let i = 0; i < s.count; i++) {
        for (let rad = s.sr[i] + sp * 0.9; rad <= reach[i]; rad += sp) {
          let pen = false;
          const steps = Math.max(24, Math.round(rad * 0.6));
          for (let q = 0; q <= steps; q++) {
            const a = (q / steps) * TAU;
            const x = s.sx[i] + Math.cos(a) * rad;
            const y = s.sy[i] + Math.sin(a) * rad;
            if (owner(x, y) !== i) { pen = false; continue; }
            if (pen) g.lineTo(x, y);
            else { g.moveTo(x, y); pen = true; }
          }
        }
      }
      strokeBoth();
      // The stones.
      const rock = light ? mixColors(pal.default, '#5f5a53', 0.6) : mixColors(pal.default, '#3a3632', 0.75);
      for (let i = 0; i < s.count; i++) {
        const outline = () => {
          g.beginPath();
          for (let q = 0; q <= 22; q++) {
            const a = (q / 22) * TAU;
            const rr = s.sr[i] * (0.85 + 0.25 * noise2(s.seed[i] + Math.cos(a), s.seed[i] + Math.sin(a)));
            const x = s.sx[i] + Math.cos(a) * rr;
            const y = s.sy[i] + Math.sin(a) * rr * 0.8;
            if (q === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.closePath();
        };
        g.save();
        g.translate(3, 4);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        outline();
        g.fill();
        g.restore();
        g.fillStyle = rock;
        outline();
        g.fill();
        const hl = g.createRadialGradient(s.sx[i] - s.sr[i] * 0.3, s.sy[i] - s.sr[i] * 0.35, 0, s.sx[i], s.sy[i], s.sr[i]);
        hl.addColorStop(0, 'rgba(255,255,255,0.28)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hl;
        outline();
        g.fill();
      }
      s.built = key;
      ctx.drawImage(cv, 0, 0, W, H);
    },
  },
};
