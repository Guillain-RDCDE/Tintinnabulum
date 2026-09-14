// Materials: pictures that are about what they are made of.
//
// Ink floating on water and combed into feathers, wax rising in a lamp, spray
// paint on a wall, stone set in mortar, paper torn by hand. In each, the feed
// supplies the gesture and the material does the rest, which is how these
// crafts work in life: the marbler drops the colour, the water decides.
//
// Every collection kept here is small and fixed, and the point data lives in
// typed arrays.

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

const inks = (pal) => [pal.user, pal.anon, pal.alert, pal.default];

/** The accumulation buffer, cleared on the first frame of a scene. */
function bufferFor(api, key = 'buf') {
  const cv = scratch(api, key);
  if (!cv) return null;
  const g = api.scene[key + 'Ctx'];
  if (!api.scene[key + 'Clean']) {
    g.clearRect(0, 0, cv.width, cv.height);
    api.scene[key + 'Clean'] = true;
  }
  return g;
}

// --- marbling ------------------------------------------------------------------
//
// Drops are kept as outlines, not as pixels, so they can be moved exactly. A new
// drop pushes every older outline outward by the rule for an incompressible
// film -- a point at distance d from the centre moves to sqrt(d^2 + r^2) -- and
// the comb drags points along a line, strongly near it and weakly far away.
// Both are the formulas used to describe real marbling, and both keep areas.

const DROPS = 36;
const RIM = 72;

function marbled({ label, note, water, ringInks, rings }) {
  return {
    label,
    positional: false,
    note,
    params: {
      comb: { label: 'How much it is combed', min: 0, max: 2, step: 0.05, default: 1 },
      drop: { label: 'Drop size', min: 0.4, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      s.pts = new Float32Array(DROPS * RIM * 2);
      s.live = new Uint8Array(DROPS);
      s.ink = new Array(DROPS).fill('');
      s.order = new Int16Array(DROPS).fill(-1); // oldest first
      s.count = 0;
      s.next = 0;
      s.ring = 0;
      const rnd = seeded(1618);
      // A few drops already on the water, so the tray is never empty.
      for (let i = 0; i < 10; i++) {
        drop(api, rnd() * api.w, rnd() * api.h, Math.min(api.w, api.h) * (0.06 + rnd() * 0.08), null);
      }
    },
    event(p, api) {
      drop(api, p.x, p.y, Math.max(10, p.r * 0.9) * api.param('drop'), p.color);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      ctx.fillStyle = water(pal);
      ctx.fillRect(0, 0, api.w, api.h);
      // The comb: two tines crossing the tray very slowly, one each way.
      const amount = api.param('comb') * Math.min(40, api.dt) * 0.012;
      if (amount > 0) {
        const t = api.now / 1000;
        const ly = api.h * (0.5 + 0.42 * Math.sin(t * 0.07));
        const lx = api.w * (0.5 + 0.42 * Math.cos(t * 0.05));
        const reach = Math.min(api.w, api.h) * 0.05;
        const P = s.pts;
        for (let d = 0; d < DROPS; d++) {
          if (!s.live[d]) continue;
          for (let k = 0; k < RIM; k++) {
            const i = (d * RIM + k) * 2;
            P[i] += (amount * reach) / (reach + Math.abs(P[i + 1] - ly)) * 3;
            P[i + 1] += (amount * reach) / (reach + Math.abs(P[i] - lx)) * 2;
          }
        }
      }
      const pickInk = ringInks(pal);
      const still = water(pal);
      for (let o = 0; o < s.count; o++) {
        const d = s.order[o];
        if (d < 0) continue;
        const ink = s.ink[d];
        ctx.fillStyle = ink === '__w' ? still
          : ink.startsWith('__i') ? pickInk[Number(ink.slice(3)) % pickInk.length]
            : ink || pickInk[d % pickInk.length];
        ctx.beginPath();
        const base = d * RIM * 2;
        ctx.moveTo(s.pts[base], s.pts[base + 1]);
        for (let k = 1; k < RIM; k++) ctx.lineTo(s.pts[base + k * 2], s.pts[base + k * 2 + 1]);
        ctx.closePath();
        ctx.fill();
      }
    },
  };

  function drop(api, cx, cy, r, colour) {
    const s = api.scene;
    const P = s.pts;
    const r2 = r * r;
    // Push everything already on the water out of the way.
    for (let d = 0; d < DROPS; d++) {
      if (!s.live[d]) continue;
      for (let k = 0; k < RIM; k++) {
        const i = (d * RIM + k) * 2;
        const dx = P[i] - cx;
        const dy = P[i + 1] - cy;
        const d2 = dx * dx + dy * dy || 1e-6;
        const f = Math.sqrt(1 + r2 / d2);
        P[i] = cx + dx * f;
        P[i + 1] = cy + dy * f;
      }
    }
    // A new drop, reusing the oldest slot once the tray is full.
    const slot = s.next;
    s.next = (s.next + 1) % DROPS;
    for (let k = 0; k < RIM; k++) {
      const a = (k / RIM) * TAU;
      P[(slot * RIM + k) * 2] = cx + Math.cos(a) * r;
      P[(slot * RIM + k) * 2 + 1] = cy + Math.sin(a) * r;
    }
    // Floating ink alternates ink and water, ring after ring.
    s.ring++;
    // Resolved when drawn, so a change of palette re-inks the tray.
    if (rings) s.ink[slot] = s.ring % 2 === 0 ? '__w' : `__i${(s.ring >> 1) % 3}`;
    else s.ink[slot] = colour || '';
    s.live[slot] = 1;
    // Drawing order: oldest first. The slot moves to the end.
    const order = [];
    for (let o = 0; o < s.count; o++) if (s.order[o] !== slot && s.order[o] >= 0) order.push(s.order[o]);
    order.push(slot);
    s.count = order.length;
    for (let o = 0; o < DROPS; o++) s.order[o] = o < order.length ? order[o] : -1;
  }
}

/** One stone of a mosaic, as a subpath of whatever path is open. */
function stone(g, s, i) {
  const h = s.sz[i] / 2;
  const co = Math.cos(s.ang[i]) * h;
  const si = Math.sin(s.ang[i]) * h;
  const x = s.cx[i];
  const y = s.cy[i];
  g.moveTo(x - co + si, y - si - co);
  g.lineTo(x + co + si, y + si - co);
  g.lineTo(x + co - si, y + si + co);
  g.lineTo(x - co - si, y - si + co);
  g.closePath();
}

export const MATERIAL_SCENES = {
  marbling: marbled({
    label: 'Marbled paper',
    note: 'Ebru, the Turkish art of marbling: colours dropped onto thickened water, each new drop pushing the others aside, then a comb drawn slowly through so they stretch into feathers and veins. Every event is a drop from the brush.',
    water: (pal) => (lightnessOf(pal.background) > 0.5 ? pal.background : mixColors(pal.background, '#e9e1cf', 0.82)),
    ringInks: (pal) => inks(pal),
    rings: false,
  }),

  floatingink: marbled({
    label: 'Floating ink',
    note: 'Suminagashi, the Japanese way of floating ink: a brush of ink touched to still water, then a brush of clear water in the middle of it, and again, so the rings spread like the grain of wood. The breath across the tray bends them.',
    water: (pal) => mixColors(pal.background, '#efe9dc', lightnessOf(pal.background) > 0.5 ? 0.35 : 0.88),
    ringInks: (pal) => ['#1e1c1b', mixColors(pal.user, '#1e1c1b', 0.55), '#2b2a2a'],
    rings: true,
  }),

  // --- lava lamp ---------------------------------------------------------------
  lavalamp: {
    label: 'Lava lamp',
    positional: false,
    note: 'Wax in a glass of warm liquid: heated at the bottom it rises in slow soft columns, cools at the top and sinks again, and blobs pinch apart and merge. Events turn the heat up under one blob.',
    params: {
      blobs: { label: 'Blobs', min: 3, max: 14, step: 1, default: 8 },
      heat: { label: 'Heat', min: 0.2, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1963);
      s.x = new Float32Array(14);
      s.phase = new Float32Array(14);
      s.speed = new Float32Array(14);
      s.r = new Float32Array(14);
      s.boost = new Float32Array(14);
      s.clock = new Float32Array(14);
      for (let i = 0; i < 14; i++) {
        s.x[i] = 0.3 + rnd() * 0.4;
        s.phase[i] = rnd() * TAU;
        s.speed[i] = 0.6 + rnd() * 0.8;
        s.r[i] = 0.07 + rnd() * 0.06;
      }
    },
    event(p, api) {
      const s = api.scene;
      const i = Math.floor(Math.random() * Math.round(api.param('blobs')));
      s.boost[i] = Math.min(3, s.boost[i] + 1.2);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const n = Math.round(api.param('blobs'));
      const dt = Math.min(50, api.dt);
      const heat = api.param('heat');
      // Each blob rises and sinks on its own slow cycle -- a lamp is far more
      // regular than it looks -- and the heat of an event hurries one along.
      for (let i = 0; i < 14; i++) {
        s.boost[i] *= Math.exp(-dt / 4000);
        s.clock[i] += dt * 0.00012 * s.speed[i] * heat * (1 + s.boost[i]);
      }
      const liquid = mixColors(mixColors(pal.background, pal.anon, 0.25), '#000000', 0.45);
      const wax = lighten(pal.alert, 0.06);
      const cv = scratch(api, 'buf');
      const g = s.bufCtx;
      const scale = 0.33;
      const mw = Math.max(1, Math.round(cv.width * scale));
      const mh = Math.max(1, Math.round(cv.height * scale));
      const unit = Math.min(mw, mh);
      // The goo: white blobs on black at a third of the size, then blurred and
      // pushed through a steep contrast, so neighbours join with a neck
      // instead of overlapping as circles.
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#000';
      g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = '#fff';
      for (let i = 0; i < n; i++) {
        const c = s.clock[i] + s.phase[i];
        const y = 0.5 - 0.4 * Math.sin(c);
        // Stretched while it moves, round when it pauses at the top or bottom.
        const stretch = 1 + 0.45 * Math.abs(Math.cos(c));
        const x = s.x[i] + noise2(i * 3.7, c * 0.3) * 0.08;
        const r = s.r[i] * unit;
        g.beginPath();
        g.ellipse(x * mw, y * mh, r / Math.sqrt(stretch), r * stretch, 0, 0, TAU);
        g.fill();
      }
      // The pool of wax that always lies at the bottom of a real lamp.
      g.beginPath();
      g.ellipse(mw / 2, mh * 1.02, mw * 0.3, mh * 0.09, 0, 0, TAU);
      g.fill();
      g.restore();
      const out = scratch(api, 'layer');
      const og = s.layerCtx;
      og.save();
      og.setTransform(1, 0, 0, 1, 0, 0);
      // Over black, not over nothing: multiplying the wax colour onto a clear
      // pixel gives the wax colour, and the first version wore a glowing frame.
      og.globalCompositeOperation = 'source-over';
      og.fillStyle = '#000';
      og.fillRect(0, 0, out.width, out.height);
      og.filter = `blur(${Math.max(2, Math.round((unit * 0.05) / scale))}px) contrast(18)`;
      og.drawImage(cv, 0, 0, mw, mh, 0, 0, out.width, out.height);
      og.filter = 'none';
      og.globalCompositeOperation = 'multiply';
      og.fillStyle = wax;
      og.fillRect(0, 0, out.width, out.height);
      og.restore();
      const light = ctx.createLinearGradient(0, 0, 0, H);
      light.addColorStop(0, liquid);
      light.addColorStop(1, mixColors(liquid, wax, 0.3));
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(out, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      // The curve of the glass: darker towards both sides.
      const glass = ctx.createLinearGradient(0, 0, W, 0);
      glass.addColorStop(0, 'rgba(0,0,0,0.4)');
      glass.addColorStop(0.25, 'rgba(0,0,0,0)');
      glass.addColorStop(0.75, 'rgba(0,0,0,0)');
      glass.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = glass;
      ctx.fillRect(0, 0, W, H);
    },
  },

  // --- spray paint -------------------------------------------------------------
  spray: {
    label: 'Spray paint',
    positional: false,
    note: 'A wall worked with spray cans: soft-edged strokes with a fine overspray around them, and where the paint goes on too thick, a drip running down. Each event is one pass of the can.',
    params: {
      width: { label: 'Nozzle', min: 0.4, max: 2.5, step: 0.05, default: 1 },
      drips: { label: 'Drips', min: 0, max: 1, step: 0.02, default: 0.5 },
    },
    event(p, api) {
      const g = bufferFor(api);
      if (!g) return;
      // A wall takes only so many passes of the can in one frame. A flood drew
      // every one of them, and two and a half thousand passes took eight
      // seconds; past a handful, the rest are simply not painted.
      const s = api.scene;
      s.passes = (s.passes || 0) + 1;
      if (s.passes > 8) return;
      const nozzle = Math.max(6, p.r * 0.45) * api.param('width');
      const len = 60 + Math.random() * 160;
      let a = Math.random() * TAU;
      let x = p.x;
      let y = p.y;
      g.fillStyle = p.color;
      const steps = Math.ceil(len / (nozzle * 0.25));
      for (let i = 0; i < steps; i++) {
        a += (Math.random() - 0.5) * 0.18;
        x += Math.cos(a) * nozzle * 0.25;
        y += Math.sin(a) * nozzle * 0.25;
        // A core, and a halo of single droplets that thins with distance.
        g.globalAlpha = 0.05;
        g.beginPath();
        g.arc(x, y, nozzle, 0, TAU);
        g.fill();
        g.globalAlpha = 0.5;
        for (let k = 0; k < 14; k++) {
          const rr = nozzle * 1.6 * Math.sqrt(-Math.log(1 - Math.random() * 0.98)) * 0.6;
          const t = Math.random() * TAU;
          g.fillRect(x + Math.cos(t) * rr, y + Math.sin(t) * rr, 1.1, 1.1);
        }
      }
      if (Math.random() < api.param('drips')) {
        g.globalAlpha = 0.7;
        g.lineCap = 'round';
        g.strokeStyle = p.color;
        g.lineWidth = Math.max(1.5, nozzle * 0.14);
        const dl = 20 + Math.random() * 90;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 2, y + dl);
        g.stroke();
        g.beginPath();
        g.arc(x, y + dl, g.lineWidth * 0.9, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    frame(ctx, api) {
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      api.scene.passes = 0;
      // Walls get painted over, eventually.
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = `rgba(0,0,0,${Math.min(0.05, api.dt / 60000)})`;
      g.fillRect(0, 0, cv.width, cv.height);
      g.restore();
      // Concrete: a faint texture so the paint has a wall to sit on.
      const pal = api.palette;
      if (!api.scene.wall) {
        const wall = scratch(api, 'layer');
        const wg = api.scene.layerCtx;
        wg.fillStyle = mixColors(pal.background, '#8b8680', lightnessOf(pal.background) > 0.5 ? 0.2 : 0.12);
        wg.fillRect(0, 0, wall.width, wall.height);
        const rnd = seeded(77);
        wg.fillStyle = '#000';
        for (let i = 0; i < 2600; i++) {
          wg.globalAlpha = rnd() * 0.08;
          wg.fillRect(rnd() * wall.width, rnd() * wall.height, 1 + rnd() * 2, 1 + rnd() * 2);
        }
        wg.globalAlpha = 1;
        api.scene.wall = true;
      }
      ctx.drawImage(scratch(api, 'layer'), 0, 0, api.w, api.h);
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  // --- tesserae -------------------------------------------------------------------
  tesserae: {
    label: 'Tesserae',
    positional: false,
    note: 'A floor of small stones set in mortar, laid in rows that follow the flow of the picture the way Roman and Byzantine mosaicists laid them. Events set new stones in their colour where they land; the rest stay the colour of the ground.',
    params: {
      tile: { label: 'Stone size', min: 8, max: 30, step: 1, default: 14, rebuild: true },
    },
    init(api) {
      const s = api.scene;
      const t = Math.max(6, Math.round(api.param('tile')));
      const rnd = seeded(476);
      const rows = Math.ceil(api.h / t) + 2;
      const cols = Math.ceil(api.w / t) + 2;
      const n = rows * cols;
      s.n = n;
      s.cx = new Float32Array(n);
      s.cy = new Float32Array(n);
      s.ang = new Float32Array(n);
      s.sz = new Float32Array(n);
      s.col = new Uint8Array(n);
      s.t = t;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = (c - 1) * t + ((r % 2) * t) / 2;
          // Rows follow a slow wave: the opus vermiculatum of the mosaicists.
          const wave = Math.sin(x / (api.w * 0.18) + r * 0.12) * t * 1.6;
          const slope = Math.cos(x / (api.w * 0.18) + r * 0.12) * ((t * 1.6) / (api.w * 0.18));
          s.cx[i] = x + (rnd() - 0.5) * t * 0.15;
          s.cy[i] = (r - 1) * t + wave + (rnd() - 0.5) * t * 0.15;
          s.ang[i] = Math.atan(slope) + (rnd() - 0.5) * 0.15;
          s.sz[i] = t * (0.78 + rnd() * 0.12);
          s.col[i] = Math.floor(rnd() * 2);
        }
      }
      s.palette = new Array(10).fill('');
      s.slot = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cx) return;
      const ci = 2 + (s.slot % 8);
      s.slot++;
      s.palette[ci] = p.color;
      const R = Math.max(s.t * 1.5, p.r * 0.8);
      const R2 = R * R;
      const g = s.built ? s.bufCtx : null;
      if (g) {
        g.fillStyle = p.color;
        g.beginPath();
      }
      for (let i = 0; i < s.n; i++) {
        const dx = s.cx[i] - p.x;
        const dy = s.cy[i] - p.y;
        if (dx * dx + dy * dy >= R2) continue;
        s.col[i] = ci;
        if (g) stone(g, s, i);
      }
      if (g) g.fill();
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.cx) return;
      const pal = api.palette;
      const cv = scratch(api, 'buf');
      const g = s.bufCtx;
      const key = `${cv.width}x${cv.height}:${pal.background}`;
      // The floor is laid once and then only the stones an event touches are
      // reset. Laying all four thousand every frame cost 17 ms.
      if (s.built !== key) {
        const k = cv.width / api.w;
        g.setTransform(k, 0, 0, k, 0, 0);
        const dark = lightnessOf(pal.background) < 0.5;
        g.fillStyle = dark ? mixColors(pal.background, '#000', 0.4) : mixColors(pal.background, '#6f6a61', 0.45);
        g.fillRect(0, 0, api.w, api.h);
        s.palette[0] = mixColors(pal.background, dark ? '#ffffff' : '#000000', 0.06);
        s.palette[1] = mixColors(pal.background, dark ? '#ffffff' : '#000000', 0.13);
        for (let c = 0; c < 10; c++) {
          if (!s.palette[c]) continue;
          g.fillStyle = s.palette[c];
          g.beginPath();
          for (let i = 0; i < s.n; i++) if (s.col[i] === c) stone(g, s, i);
          g.fill();
        }
        s.built = key;
      }
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  // --- torn paper -------------------------------------------------------------------
  tornpaper: {
    label: 'Torn paper',
    positional: false,
    note: 'A collage of coloured papers torn by hand and laid over one another, each torn edge showing the white core of the sheet and casting a thin shadow. Every event tears a new piece and lays it on top.',
    params: {
      pieces: { label: 'Pieces on the table', min: 4, max: 30, step: 1, default: 16 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1912);
      s.x = new Float32Array(30);
      s.y = new Float32Array(30);
      s.w = new Float32Array(30);
      s.h = new Float32Array(30);
      s.a = new Float32Array(30);
      s.seed = new Float32Array(30);
      s.ink = new Array(30).fill('');
      s.order = new Uint8Array(30);
      for (let i = 0; i < 30; i++) {
        s.x[i] = rnd(); s.y[i] = rnd();
        s.w[i] = 0.15 + rnd() * 0.35; s.h[i] = 0.08 + rnd() * 0.2;
        s.a[i] = (rnd() - 0.5) * 0.7; s.seed[i] = rnd() * 100;
        s.order[i] = i;
      }
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      const n = Math.round(api.param('pieces'));
      const i = s.order[0] % n;
      // The oldest piece is taken off the bottom and laid again on the top.
      for (let k = 0; k < 29; k++) s.order[k] = s.order[k + 1];
      s.order[29] = i;
      s.x[i] = p.x / api.w; s.y[i] = p.y / api.h;
      s.w[i] = 0.12 + Math.random() * 0.32; s.h[i] = 0.06 + Math.random() * 0.2;
      s.a[i] = (Math.random() - 0.5) * 0.7; s.seed[i] = Math.random() * 100;
      s.ink[i] = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const n = Math.round(api.param('pieces'));
      const base = [...inks(pal), pal.default];
      const core = lightnessOf(pal.background) > 0.85 ? '#fffdf8' : '#f6f1e6';
      for (let o = 0; o < 30; o++) {
        const i = s.order[o];
        if (i >= n) continue;
        const cx = s.x[i] * api.w;
        const cy = s.y[i] * api.h;
        const hw = (s.w[i] * api.w) / 2;
        const hh = (s.h[i] * api.h) / 2;
        const edge = (inset) => {
          ctx.beginPath();
          const steps = 48;
          for (let k = 0; k <= steps; k++) {
            // Walk round the rectangle; the tear is noise along the walk.
            const t = k / steps;
            let u;
            let v;
            if (t < 0.25) { u = -1 + t * 8; v = -1; }
            else if (t < 0.5) { u = 1; v = -1 + (t - 0.25) * 8; }
            else if (t < 0.75) { u = 1 - (t - 0.5) * 8; v = 1; }
            else { u = -1; v = 1 - (t - 0.75) * 8; }
            const rag = noise2(s.seed[i] + t * 38, s.seed[i]) * Math.min(hw, hh) * 0.18;
            const x = u * (hw - inset + rag);
            const y = v * (hh - inset + rag);
            const px = cx + x * Math.cos(s.a[i]) - y * Math.sin(s.a[i]);
            const py = cy + x * Math.sin(s.a[i]) + y * Math.cos(s.a[i]);
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
        };
        ctx.save();
        ctx.translate(1.5, 2.5);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#000';
        edge(0);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = core;
        edge(0);
        ctx.fill();
        ctx.fillStyle = s.ink[i] || base[i % base.length];
        edge(Math.max(1.5, Math.min(hw, hh) * 0.06));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
};
