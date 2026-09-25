// Grown scenes: systems that make their picture by growing it.
//
// Six constructions from the part of generative art that is judged as art
// rather than as demonstration: ribbons laid along a flow field that never
// cross, a line that grows and folds without touching itself, a slime mould
// finding its paths, a picture made of nothing but well-spaced dots, a survey
// map drawn in contours and hatching, and roots reaching for what attracts
// them. What they share is that the picture is the result of a process with
// rules, and the events are what feed the process.
//
// Each keeps its bulk in typed arrays of a fixed size -- nodes, agents, dots,
// a trail map -- so none of them can grow past its ceiling however much
// arrives, and the collections the budget watches stay short.

import { noise2 } from './noise.js';
import { toRgb, scratch } from './paint.js';
import { mixColors, shadeOf, lighten, lightnessOf } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'default', 'alert'];

const pack = (c) => {
  const [r, g, b] = toRgb(c);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};

/** A small canvas of the scene's own, for pictures computed at a low resolution. */
function smallCanvas(w, h) {
  return typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

/** A colour for a mark that has no event behind it: one of the palette's own, lightly varied. */
const inkOf = (api, k) => shadeOf(api.palette[ROLES[k % ROLES.length]] || api.palette.default, [Math.random(), Math.random(), Math.random()], Number.isFinite(api.richness) ? api.richness : 0.45);

export const GROWN_SCENES = {
  // --- ribbons ----------------------------------------------------------------------------
  ribbons: {
    label: 'Flow ribbons',
    note: 'Ribbons laid along a flow field, the construction at the heart of a great deal of the best generative painting. The field is value noise turned into angles, bent into a slow whirl round each recent event. A ribbon starts where an event lands and its whole path is planned at once: it walks the field in both directions, reserving the cells of an occupancy grid as it goes, and stops at the first cell another ribbon owns -- which is why they pack so closely and never cross. Then it is revealed a step at a time, tapered at both ends, one in four striped. When the sheet is full it is let go, slowly, and a new one begins.',
    params: {
      width: { label: 'Ribbon width', min: 0.4, max: 2.5, step: 0.05, default: 1 },
      spacing: { label: 'Space between them', min: 0.5, max: 3, step: 0.05, default: 1 },
      curl: { label: 'How much the field turns', min: 0, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      s.cell = Math.max(3, Math.round(Math.min(api.w, api.h) / 180));
      s.cols = Math.ceil(api.w / s.cell) + 1;
      s.rows = Math.ceil(api.h / s.cell) + 1;
      s.grid = new Uint16Array(s.cols * s.rows);
      s.active = [];
      s.whirls = [];
      s.next = 1;
      s.filled = 0;
      s.fade = 0;
      s.ambient = 0;
      s.cleared = false;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.grid) return;
      s.whirls.push({ x: p.x, y: p.y, k: (p.pick < 0.5 ? -1 : 1) * (0.6 + p.pick), r: Math.min(api.w, api.h) * (0.12 + p.pick * 0.2) });
      if (s.whirls.length > 6) s.whirls.shift();
      plan(api, p.x, p.y, p.color, 0.6 + (p.r / (Math.min(api.w, api.h) * 0.34)) * 1.4);
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      // Ribbons of its own between events, so the sheet keeps filling.
      s.ambient += api.dt;
      if (s.ambient > 50 && !s.fade) {
        s.ambient = 0;
        // Several tries a turn: most starting points are already taken once the
        // sheet begins to fill, and a dense sheet is the whole point.
        for (let k = 0; k < 14 && s.active.length < 40; k++) {
          plan(api, Math.random() * api.w, Math.random() * api.h, inkOf(api, s.next + k), 0.45 + Math.random() * 1.4);
        }
      }
      // Reveal: every active ribbon draws a few more steps.
      b.lineCap = 'round';
      b.lineJoin = 'round';
      for (let k = s.active.length - 1; k >= 0; k--) {
        const r = s.active[k];
        const upto = Math.min(r.n - 1, r.shown + 4 + Math.round(api.dt / 8));
        for (let i = r.shown; i < upto; i++) {
          const u = i / Math.max(1, r.n - 1);
          const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.4);
          b.lineWidth = Math.max(0.6, r.w * (0.15 + 0.85 * taper));
          b.strokeStyle = r.striped && Math.floor(i / 5) % 2 ? r.alt : r.color;
          b.beginPath();
          b.moveTo(r.pts[i * 2], r.pts[i * 2 + 1]);
          b.lineTo(r.pts[i * 2 + 2], r.pts[i * 2 + 3]);
          b.stroke();
        }
        r.shown = upto;
        if (r.shown >= r.n - 1) s.active.splice(k, 1);
      }
      // A full sheet is let go slowly, then begun again.
      if (!s.fade && s.filled > s.cols * s.rows * 0.64) s.fade = 1;
      if (s.fade) {
        b.globalAlpha = 0.07;
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
        s.fade++;
        if (s.fade > 50) {
          s.grid.fill(0);
          s.filled = 0;
          s.fade = 0;
          s.active.length = 0;
        }
      }
      ctx.drawImage(buf, 0, 0, api.w, api.h);
    },
  },

  // --- differential growth ---------------------------------------------------------------------
  growth: {
    label: 'Differential growth',
    preview: { frames: 320, dt: 40 },
    note: 'A closed line that grows. Every node is pulled towards the midpoint of its two neighbours, pushed away from every node near it -- found through a spatial grid, so the cost stays linear -- and an edge that stretches too long is split in two. That is all, and it is enough to fold a circle into the convolutions of coral, lichen and brain, because the line keeps lengthening and has nowhere to go but sideways. Each event makes the line grow where it landed. Its past shapes are left behind as faint rings, and when it has grown as far as it can it is kept as a ghost and a new one starts.',
    params: {
      spacing: { label: 'Room between folds', min: 0.5, max: 2.2, step: 0.05, default: 1 },
      speed: { label: 'Speed of growth', min: 0.2, max: 2.5, step: 0.05, default: 1 },
      rings: { label: 'How much of the past is kept', min: 0, max: 1, step: 0.02, default: 0.5 },
    },
    init(api) {
      const s = api.scene;
      s.max = 1500;
      s.ring = 0;
      s.x = new Float32Array(s.max);
      s.y = new Float32Array(s.max);
      s.n = 0;
      s.cleared = false;
      s.tick = 0;
      seedLoop(api, api.w * (0.35 + Math.random() * 0.3), api.h * (0.35 + Math.random() * 0.3));
    },
    event(p, api) {
      const s = api.scene;
      if (!s.x || s.n < 3) return;
      // Grow where the event landed: split the edges nearest it.
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < s.n; i++) {
        const d = (s.x[i] - p.x) ** 2 + (s.y[i] - p.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      for (let k = 0; k < 3 && s.n < s.max; k++) splitEdge(s, (best + k) % s.n);
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      const R = Math.min(api.w, api.h) * 0.015 * api.param('spacing');
      const speed = api.param('speed');
      const iterations = Math.max(1, Math.round(speed * 2));
      for (let it = 0; it < iterations; it++) relax(s, R, api.w, api.h);
      // Grow: split the longest edges, a few a frame.
      // Grow: every edge that has stretched is split, up to a few a frame.
      // From a different place each frame: always starting at the first node
      // grew the loop on one side only.
      let splits = Math.max(2, Math.round(speed * 16));
      const from = Math.floor(Math.random() * s.n);
      for (let k = 0; k < s.n && splits > 0 && s.n < s.max; k++) {
        const i = (from + k) % s.n;
        const j = (i + 1) % s.n;
        if (Math.hypot(s.x[j] - s.x[i], s.y[j] - s.y[i]) > R * 0.55) {
          splitEdge(s, i);
          k++;
          splits--;
        }
      }
      s.tick++;
      const rings = api.param('rings');
      if (rings > 0 && s.tick % 14 === 0) {
        // The line's past, as rings in the palette's inks in turn.
        b.globalAlpha = 0.06 + rings * 0.3;
        b.strokeStyle = api.palette[ROLES[s.ring++ % 4]] || api.palette.default;
        b.lineWidth = Math.max(0.8, Math.min(api.w, api.h) / 900);
        loopPath(b, s);
        b.stroke();
        b.globalAlpha = 1;
      }
      if (s.n >= s.max) {
        // Kept as a ghost, and a new line begins elsewhere.
        b.globalAlpha = 0.35;
        b.fillStyle = mixColors(api.palette.anon, api.palette.background, 0.5);
        loopPath(b, s);
        b.fill();
        b.globalAlpha = 0.8;
        b.strokeStyle = api.palette.default;
        b.lineWidth = Math.max(1, Math.min(api.w, api.h) / 700);
        b.stroke();
        b.globalAlpha = 1;
        b.globalAlpha = 0.25;
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
        seedLoop(api, api.w * (0.2 + Math.random() * 0.6), api.h * (0.2 + Math.random() * 0.6));
      }
      ctx.drawImage(buf, 0, 0, api.w, api.h);
      ctx.fillStyle = api.palette.anon;
      ctx.globalAlpha = 0.22;
      loopPath(ctx, s);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = api.palette.default;
      ctx.lineWidth = Math.max(1.2, Math.min(api.w, api.h) / 450);
      ctx.stroke();
    },
  },

  // --- physarum -----------------------------------------------------------------------------
  physarum: {
    label: 'Slime mould',
    preview: { frames: 150, dt: 50 },
    note: "Physarum polycephalum, as Jeff Jones modelled it in 2010: thousands of agents, each sensing a trail left by the others a little ahead, to its left and to its right, turning towards the strongest, stepping forward and laying trail of its own. The trail spreads and fades a little every step. Out of nothing but that, the agents organise into a network of veins that finds short paths between food -- the real mould has been shown to reproduce the Tokyo railway map. Every event is food, dropped where it happened, and the network rewires itself to reach it.",
    params: {
      agents: { label: 'How many', min: 4000, max: 30000, step: 500, default: 11000, rebuild: true },
      sense: { label: 'How far each one looks', min: 2, max: 12, step: 0.5, default: 4 },
      turn: { label: 'How sharply they turn', min: 0.1, max: 1.2, step: 0.02, default: 0.78 },
      decay: { label: 'How long a trail lasts', min: 0.75, max: 0.98, step: 0.005, default: 0.87 },
    },
    init(api) {
      const s = api.scene;
      s.cell = Math.max(2, Math.min(api.w, api.h) / 340);
      s.gw = Math.max(8, Math.ceil(api.w / s.cell));
      s.gh = Math.max(8, Math.ceil(api.h / s.cell));
      s.trail = new Float32Array(s.gw * s.gh);
      s.tmp = new Float32Array(s.gw * s.gh);
      // No more agents than the dish can hold: on a small card thousands of
      // them on a few thousand cells only ever made a white blot.
      const n = Math.max(60, Math.min(Math.round(api.param('agents')), Math.round(s.gw * s.gh * 0.16)));
      s.n = n;
      s.ax = new Float32Array(n);
      s.ay = new Float32Array(n);
      s.aa = new Float32Array(n);
      // Spread over the whole dish: started from a disc facing out, the
      // agents made one great ring first and kept it as a highway.
      for (let i = 0; i < n; i++) {
        s.ax[i] = 1 + Math.random() * (s.gw - 2);
        s.ay[i] = 1 + Math.random() * (s.gh - 2);
        s.aa[i] = Math.random() * TAU;
      }
      s.food = [];
      s.canvas = smallCanvas(s.gw, s.gh);
      s.img = s.canvas.getContext('2d').createImageData(s.gw, s.gh);
      s.px = new Uint32Array(s.img.data.buffer);
      s.lutFor = null;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.food) return;
      // Food: a small source that keeps giving for a while, as an oat flake
      // does in a dish. A large flood of trail at once only drew every agent
      // into one blob; small lasting sources are what the network forms between.
      s.food.push({ x: p.x / s.cell, y: p.y / s.cell, left: 400 + p.pick * 500, amount: 2 + p.pick * 3 });
      if (s.food.length > 16) s.food.shift();
    },
    frame(ctx, api) {
      const s = api.scene;
      // Two steps a frame: the network takes a few hundred to form.
      feed(s);
      stepMould(api, s);
      feed(s);
      stepMould(api, s);
      drawMould(ctx, api, s);
    },
  },

  // --- stippling ----------------------------------------------------------------------------
  stipple: {
    label: 'Stippled light',
    preview: { frames: 60, dt: 80 },
    note: "A picture made of nothing but dots, placed the way an engraver would: weighted Voronoi stippling, after Adrian Secord, 2002. Every dot is moved, again and again, towards the centre of the region of the picture that is nearer to it than to any other dot, weighted by how dark the picture is there -- so the dots crowd where it is dark, thin out where it is light, and never clump or line up. The centres are estimated by sampling rather than computed, a few thousand samples a frame, so the relaxation runs live. The picture is a still life of spheres lit from the upper left, each shaded as an engraver shades a ball, over a soft ground of light; every event sets another sphere down where it happened, and the dots drift to model it.",
    params: {
      dots: { label: 'How many dots', min: 2000, max: 16000, step: 250, default: 9000, rebuild: true },
      size: { label: 'Dot size', min: 0.9, max: 3, step: 0.05, default: 1.3 },
      contrast: { label: 'Contrast', min: 0.8, max: 4, step: 0.05, default: 2.2 },
    },
    init(api) {
      const s = api.scene;
      const n = Math.round(api.param('dots'));
      s.n = n;
      s.x = new Float32Array(n);
      s.y = new Float32Array(n);
      s.sx = new Float32Array(n);
      s.sy = new Float32Array(n);
      s.cnt = new Uint16Array(n);
      s.spots = [];
      // A still life to begin with, so the picture has a subject before
      // anything has happened.
      const m = Math.min(api.w, api.h);
      for (let k = 0; k < 3; k++) {
        s.spots.push({ x: api.w * (0.22 + Math.random() * 0.56), y: api.h * (0.28 + Math.random() * 0.46), r: m * (0.14 + Math.random() * 0.14), born: -1e9 });
      }
      s.cell = Math.max(4, Math.sqrt((api.w * api.h) / n) * 1.2);
      s.cols = Math.ceil(api.w / s.cell) + 1;
      s.rows = Math.ceil(api.h / s.cell) + 1;
      s.head = new Int32Array(s.cols * s.rows);
      s.next = new Int32Array(n);
      s.toneAge = Infinity;
      refreshTone(api, s);
      for (let i = 0; i < n; i++) {
        const q = sampleDark(api, s);
        s.x[i] = q[0];
        s.y[i] = q[1];
      }
    },
    event(p, api) {
      const s = api.scene;
      if (!s.spots) return;
      s.spots.push({ x: p.x, y: p.y, r: Math.min(api.w, api.h) * (0.06 + p.pick * 0.14), born: api.now });
      if (s.spots.length > 9) s.spots.shift();
      s.toneAge = Infinity;
    },
    frame(ctx, api) {
      const s = api.scene;
      const { n, x, y, sx, sy, cnt, head, next, cols, rows, cell } = s;
      // The grid of dots, for finding the nearest one to a sample.
      head.fill(-1);
      for (let i = 0; i < n; i++) {
        const c = Math.min(rows - 1, Math.max(0, (y[i] / cell) | 0)) * cols + Math.min(cols - 1, Math.max(0, (x[i] / cell) | 0));
        next[i] = head[c];
        head[c] = i;
      }
      sx.fill(0);
      sy.fill(0);
      cnt.fill(0);
      refreshTone(api, s);
      // Fewer samples than dots: each frame relaxes the part of the picture
      // the samples fell in, and over a few frames all of it.
      const samples = Math.round(n * 0.9);
      for (let k = 0; k < samples; k++) {
        const q = sampleDark(api, s);
        const cx = (q[0] / cell) | 0;
        const cy = (q[1] / cell) | 0;
        let best = -1;
        let bd = Infinity;
        for (let yy = Math.max(0, cy - 1); yy <= Math.min(rows - 1, cy + 1); yy++) {
          for (let xx = Math.max(0, cx - 1); xx <= Math.min(cols - 1, cx + 1); xx++) {
            for (let i = head[yy * cols + xx]; i !== -1; i = next[i]) {
              const d = (x[i] - q[0]) ** 2 + (y[i] - q[1]) ** 2;
              if (d < bd) {
                bd = d;
                best = i;
              }
            }
          }
        }
        if (best >= 0 && cnt[best] < 65000) {
          sx[best] += q[0];
          sy[best] += q[1];
          cnt[best]++;
        }
      }
      for (let i = 0; i < n; i++) {
        if (cnt[i]) {
          x[i] += (sx[i] / cnt[i] - x[i]) * 0.5;
          y[i] += (sy[i] / cnt[i] - y[i]) * 0.5;
        } else if (Math.random() < 0.004) {
          // Now and then a dot nobody sampled -- one in the light -- is sent to
          // where the picture needs it, so the dots follow the light as it moves.
          const q = sampleDark(api, s);
          x[i] = q[0];
          y[i] = q[1];
        }
      }
      // Drawn as pixels, as the dot screen is: arcs by the thousand are what
      // a canvas without a graphics card cannot afford.
      const buf = scratch(api, 'buf', true);
      const b = s.bufCtx;
      const BW = buf.width;
      const BH = buf.height;
      if (!s.img || s.img.width !== BW || s.img.height !== BH) {
        s.img = b.createImageData(BW, BH);
        s.px = new Uint32Array(s.img.data.buffer);
      }
      if (s.inkFor !== api.palette) {
        s.ground = pack(api.palette.background);
        s.ink = pack(api.palette.default);
        s.inkFor = api.palette;
      }
      const px = s.px;
      px.fill(s.ground);
      const size = api.param('size') * Math.max(1, Math.min(api.w, api.h) / 700);
      for (let i = 0; i < n; i++) {
        const t = toneAt(s, x[i], y[i]);
        const r = size * (0.35 + t * 1.5);
        const y0 = Math.max(0, Math.ceil(y[i] - r));
        const y1 = Math.min(BH - 1, Math.floor(y[i] + r));
        for (let yy = y0; yy <= y1; yy++) {
          const dy = yy + 0.5 - y[i];
          const span = Math.sqrt(Math.max(0, r * r - dy * dy));
          const x0 = Math.max(0, Math.round(x[i] - span));
          const x1 = Math.min(BW, Math.round(x[i] + span));
          if (x1 > x0) px.fill(s.ink, yy * BW + x0, yy * BW + x1);
        }
      }
      b.putImageData(s.img, 0, 0);
      ctx.drawImage(buf, 0, 0, api.w, api.h);
    },
  },

  // --- topography ---------------------------------------------------------------------------
  topo: {
    label: 'Contour survey',
    note: 'A survey map, drawn as a cartographer would: contour lines traced through a height field by marching squares, every fifth one an index contour drawn heavier, and short hachures on the slopes that turn away from the light, set across the slope and closer where it is steeper. The land is value noise, and every event raises a hill or sinks a hollow that swells into it over a few seconds; the whole terrain drifts very slowly, so the lines are always being redrawn.',
    params: {
      levels: { label: 'Contour lines', min: 8, max: 44, step: 1, default: 20 },
      hatching: { label: 'Hachures', min: 0, max: 1, step: 0.02, default: 0.6 },
      relief: { label: 'Relief', min: 0.3, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      s.g = Math.max(4, Math.round(Math.min(api.w, api.h) / 110));
      s.cols = Math.ceil(api.w / s.g) + 1;
      s.rows = Math.ceil(api.h / s.g) + 1;
      s.hgt = new Float32Array(s.cols * s.rows);
      s.hills = [];
      s.tick = 0;
      s.seed = Math.random() * 100;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.hills) return;
      s.hills.push({ x: p.x, y: p.y, r: Math.min(api.w, api.h) * (0.08 + p.pick * 0.16), a: (p.pick < 0.7 ? 1 : -0.7) * (0.25 + p.pick * 0.35), born: api.now });
      if (s.hills.length > 24) s.hills.shift();
      s.tick = 0;
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (s.tick-- > 0) {
        ctx.drawImage(buf, 0, 0, api.w, api.h);
        return;
      }
      s.tick = 7;
      const { g, cols, rows, hgt } = s;
      const relief = api.param('relief');
      const t = api.now / 20000;
      const sc = 1 / (Math.min(api.w, api.h) * 0.28);
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const X = i * g;
          const Y = j * g;
          let v = (noise2(X * sc + s.seed + t, Y * sc) * 0.65 + noise2(X * sc * 2.3, Y * sc * 2.3 + s.seed) * 0.35) * relief;
          for (const hl of s.hills) {
            const grow = Math.min(1, (api.now - hl.born) / 3000);
            const d2 = ((X - hl.x) ** 2 + (Y - hl.y) ** 2) / (hl.r * hl.r);
            if (d2 < 9) v += hl.a * grow * Math.exp(-d2);
          }
          hgt[j * cols + i] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      b.fillStyle = api.palette.background;
      b.fillRect(0, 0, api.w, api.h);
      const ink = api.palette.default;
      // Hachures on the slopes that face away from the light.
      const hatch = api.param('hatching');
      if (hatch > 0) {
        b.strokeStyle = ink;
        b.globalAlpha = 0.4 + hatch * 0.35;
        b.lineWidth = Math.max(0.6, g / 9);
        b.beginPath();
        const span = Math.max(1e-6, hi - lo);
        for (let j = 1; j < rows - 1; j++) {
          for (let i = 1; i < cols - 1; i++) {
            const gx = (hgt[j * cols + i + 1] - hgt[j * cols + i - 1]) / span;
            const gy = (hgt[(j + 1) * cols + i] - hgt[(j - 1) * cols + i]) / span;
            const shade = gx * 0.7 + gy * 0.7;
            const steep = Math.hypot(gx, gy);
            // A fixed hash per cell rather than a fresh random: redrawn every few
            // frames, random hachures shimmered.
            const h1 = cellHash(i, j);
            const h2 = cellHash(j + 7, i + 3);
            if (shade <= 0.01 || h1 > hatch * Math.min(1, steep * 14)) continue;
            // Across the slope: along the contour, short.
            const len = g * (0.4 + Math.min(1, steep * 10) * 0.6);
            const ux = -gy / (steep || 1);
            const uy = gx / (steep || 1);
            const cx = i * g + (h2 - 0.5) * g * 0.5;
            const cy = j * g + (h1 - 0.5) * g * 0.5;
            b.moveTo(cx - ux * len * 0.5, cy - uy * len * 0.5);
            b.lineTo(cx + ux * len * 0.5, cy + uy * len * 0.5);
          }
        }
        b.stroke();
        b.globalAlpha = 1;
      }
      // Contours, by marching squares, every fifth heavier and in colour. One
      // pass over the grid for every level at once: each cell answers only for
      // the levels that actually cross it, where a pass per level asked every
      // cell about every level.
      const levels = Math.round(api.param('levels'));
      const step = (hi - lo) / levels;
      const paths = [];
      for (let k = 0; k < levels; k++) paths.push(new Path2D());
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = hgt[j * cols + i];
          const bb = hgt[j * cols + i + 1];
          const c = hgt[(j + 1) * cols + i + 1];
          const d = hgt[(j + 1) * cols + i];
          const mn = Math.min(a, bb, c, d);
          const mx = Math.max(a, bb, c, d);
          const k0 = Math.max(1, Math.ceil((mn - lo) / step));
          const k1 = Math.min(levels - 1, Math.floor((mx - lo) / step));
          const x0 = i * g;
          const y0 = j * g;
          for (let k = k0; k <= k1; k++) {
            const iso = lo + step * k;
            const code = (a > iso ? 8 : 0) | (bb > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const path = paths[k];
            const tx = x0 + g * ((iso - a) / (bb - a));
            const ry = y0 + g * ((iso - bb) / (c - bb));
            const bx = x0 + g * ((iso - d) / (c - d));
            const ly = y0 + g * ((iso - a) / (d - a));
            const seg = (px, py, qx, qy) => {
              path.moveTo(px, py);
              path.lineTo(qx, qy);
            };
            switch (code) {
              case 1: case 14: seg(x0, ly, bx, y0 + g); break;
              case 2: case 13: seg(bx, y0 + g, x0 + g, ry); break;
              case 3: case 12: seg(x0, ly, x0 + g, ry); break;
              case 4: case 11: seg(tx, y0, x0 + g, ry); break;
              case 5: seg(x0, ly, tx, y0); seg(bx, y0 + g, x0 + g, ry); break;
              case 6: case 9: seg(tx, y0, bx, y0 + g); break;
              case 7: case 8: seg(x0, ly, tx, y0); break;
              case 10: seg(x0, ly, bx, y0 + g); seg(tx, y0, x0 + g, ry); break;
              default:
            }
          }
        }
      }
      for (let k = 1; k < levels; k++) {
        const index = k % 5 === 0;
        b.strokeStyle = index ? api.palette.user : ink;
        b.lineWidth = index ? Math.max(1.2, g / 3.5) : Math.max(0.6, g / 7);
        b.globalAlpha = index ? 0.95 : 0.72;
        b.stroke(paths[k]);
      }
      b.globalAlpha = 1;
      ctx.drawImage(buf, 0, 0, api.w, api.h);
    },
  },

  // --- roots ----------------------------------------------------------------------------------
  roots: {
    label: 'Roots',
    note: 'Space colonisation, the algorithm Runions, Lane and Prusinkiewicz published in 2005 for growing leaf veins and trees: points of attraction are scattered, every point pulls on the nearest growing tip within reach, each tip grows one step towards the average of what pulls it, and a point is consumed once a tip reaches it. Branching is not programmed, it happens wherever a tip is pulled two ways. Every event scatters a cloud of attraction where it landed, and the roots go out to find it, drawn thicker the nearer they are to where they began.',
    params: {
      reach: { label: 'How far a tip can sense', min: 0.5, max: 2.2, step: 0.05, default: 1 },
      step: { label: 'Growth step', min: 0.4, max: 2, step: 0.05, default: 1 },
      weight: { label: 'Line weight', min: 0.4, max: 3, step: 0.05, default: 1.2 },
    },
    init(api) {
      const s = api.scene;
      s.maxA = 900;
      s.maxN = 1800;
      s.axs = new Float32Array(s.maxA);
      s.ays = new Float32Array(s.maxA);
      s.alive = new Uint8Array(s.maxA);
      s.aNext = 0;
      s.nx = new Float32Array(s.maxN);
      s.ny = new Float32Array(s.maxN);
      s.depth = new Uint16Array(s.maxN);
      s.n = 0;
      s.dx = new Float32Array(s.maxN);
      s.dy = new Float32Array(s.maxN);
      s.pull = new Uint16Array(s.maxN);
      s.cleared = false;
      s.idle = 0;
      s.ambient = 0;
      plantRoots(api);
    },
    event(p, api) {
      const s = api.scene;
      if (!s.axs) return;
      scatter(s, p.x, p.y, Math.min(api.w, api.h) * (0.06 + p.pick * 0.1), 18 + Math.round(p.pick * 24));
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      const m = Math.min(api.w, api.h);
      const reach = m * 0.12 * api.param('reach');
      const kill = m * 0.012;
      const step = m * 0.0075 * api.param('step');
      s.ambient += api.dt;
      if (s.ambient > 900) {
        s.ambient = 0;
        scatter(s, Math.random() * api.w, Math.random() * api.h * 0.8, m * 0.1, 20);
      }
      s.dx.fill(0, 0, s.n);
      s.dy.fill(0, 0, s.n);
      s.pull.fill(0, 0, s.n);
      let pulling = 0;
      // Tips on a grid a reach across, so each point asks only its neighbours:
      // every tip against every point was two million distances a frame.
      const cols = Math.ceil(api.w / reach) + 1;
      const rows = Math.ceil(api.h / reach) + 1;
      if (!s.head || s.head.length < cols * rows) s.head = new Int32Array(cols * rows);
      if (!s.link) s.link = new Int32Array(s.maxN);
      s.head.fill(-1, 0, cols * rows);
      for (let i = 0; i < s.n; i++) {
        const c = Math.min(rows - 1, Math.max(0, (s.ny[i] / reach) | 0)) * cols + Math.min(cols - 1, Math.max(0, (s.nx[i] / reach) | 0));
        s.link[i] = s.head[c];
        s.head[c] = i;
      }
      for (let a = 0; a < s.maxA; a++) {
        if (!s.alive[a]) continue;
        let best = -1;
        let bd = reach * reach;
        const gx = (s.axs[a] / reach) | 0;
        const gy = (s.ays[a] / reach) | 0;
        for (let yy = Math.max(0, gy - 1); yy <= Math.min(rows - 1, gy + 1); yy++) {
          for (let xx = Math.max(0, gx - 1); xx <= Math.min(cols - 1, gx + 1); xx++) {
            for (let i = s.head[yy * cols + xx]; i !== -1; i = s.link[i]) {
              const d = (s.nx[i] - s.axs[a]) ** 2 + (s.ny[i] - s.ays[a]) ** 2;
              if (d < bd) {
                bd = d;
                best = i;
              }
            }
          }
        }
        if (best < 0) continue;
        if (bd < kill * kill) {
          s.alive[a] = 0;
          continue;
        }
        const d = Math.sqrt(bd) || 1;
        s.dx[best] += (s.axs[a] - s.nx[best]) / d;
        s.dy[best] += (s.ays[a] - s.ny[best]) / d;
        s.pull[best]++;
        pulling++;
      }
      const weight = api.param('weight') * Math.max(1, m / 480);
      b.lineCap = 'round';
      b.strokeStyle = api.palette.default;
      const grown = s.n;
      for (let i = 0; i < grown && s.n < s.maxN; i++) {
        if (!s.pull[i]) continue;
        const len = Math.hypot(s.dx[i], s.dy[i]) || 1;
        const x = s.nx[i] + (s.dx[i] / len) * step;
        const y = s.ny[i] + (s.dy[i] / len) * step;
        const k = s.n++;
        s.nx[k] = x;
        s.ny[k] = y;
        s.depth[k] = s.depth[i] + 1;
        b.lineWidth = Math.max(0.8, weight * (2.8 - Math.min(2.2, s.depth[k] * 0.018)));
        b.globalAlpha = 1;
        b.beginPath();
        b.moveTo(s.nx[i], s.ny[i]);
        b.lineTo(x, y);
        b.stroke();
      }
      b.globalAlpha = 1;
      // When nothing is left to reach, or there is no room left to grow,
      // the drawing is let go and begun again.
      s.idle = pulling ? 0 : s.idle + 1;
      if (s.n >= s.maxN || s.idle > 240) {
        b.globalAlpha = 0.55;
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
        s.n = 0;
        s.alive.fill(0);
        s.idle = 0;
        plantRoots(api);
      }
      ctx.drawImage(buf, 0, 0, api.w, api.h);
    },
  },
};

/** A fixed pseudo-random value for a grid cell, 0 to 1. */
function cellHash(i, j) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- the ribbons' planner --------------------------------------------------------------------

function fieldAngle(api, x, y) {
  const s = api.scene;
  const curl = api.param('curl');
  const sc = 1 / (Math.min(api.w, api.h) * 0.35);
  let a = (noise2(x * sc + 11.3, y * sc + 3.7) * 2 - 1) * Math.PI * curl + Math.PI * 0.12;
  for (const wh of s.whirls) {
    const dx = x - wh.x;
    const dy = y - wh.y;
    const d2 = (dx * dx + dy * dy) / (wh.r * wh.r);
    if (d2 < 6) a += Math.exp(-d2) * wh.k * Math.PI * 0.5;
  }
  return a;
}

/**
 * Plan a whole ribbon from a starting point: walk the field both ways,
 * reserving the grid as it goes, and stop at the first cell another ribbon
 * owns. Nothing is drawn here; the path is revealed a step at a time.
 */
function plan(api, x0, y0, color, widthScale) {
  const s = api.scene;
  if (s.fade || s.active.length >= 40) return;
  const id = (s.next = (s.next % 65000) + 1);
  const w = Math.max(2, Math.min(api.w, api.h) * 0.021 * api.param('width') * widthScale);
  const clearance = w / 2 + s.cell * 0.7 * api.param('spacing');
  const reach = Math.ceil(clearance / s.cell);
  const step = Math.max(1.5, s.cell * 0.9);
  const free = (x, y) => {
    const cx = (x / s.cell) | 0;
    const cy = (y / s.cell) | 0;
    for (let j = cy - reach; j <= cy + reach; j++) {
      if (j < 0 || j >= s.rows) return false;
      for (let i = cx - reach; i <= cx + reach; i++) {
        if (i < 0 || i >= s.cols) return false;
        const o = s.grid[j * s.cols + i];
        if (o && o !== id) return false;
      }
    }
    return true;
  };
  const claim = (x, y) => {
    const cx = (x / s.cell) | 0;
    const cy = (y / s.cell) | 0;
    const rr = Math.max(0, Math.ceil((w / 2) / s.cell));
    for (let j = cy - rr; j <= cy + rr; j++) {
      for (let i = cx - rr; i <= cx + rr; i++) {
        if (i < 0 || j < 0 || i >= s.cols || j >= s.rows) continue;
        const k = j * s.cols + i;
        if (!s.grid[k]) {
          s.grid[k] = id;
          s.filled++;
        }
      }
    }
  };
  if (!free(x0, y0)) return;
  const walk = (dir) => {
    const out = [];
    let x = x0;
    let y = y0;
    for (let k = 0; k < 420; k++) {
      const a = fieldAngle(api, x, y);
      const nx = x + Math.cos(a) * step * dir;
      const ny = y + Math.sin(a) * step * dir;
      if (!free(nx, ny)) break;
      x = nx;
      y = ny;
      out.push(x, y);
    }
    return out;
  };
  const back = walk(-1);
  const fwd = walk(1);
  const n = back.length / 2 + 1 + fwd.length / 2;
  // A stub is not a ribbon: too short and the cells go back to the sheet.
  if (n < 26) {
    return;
  }
  const pts = new Float32Array(n * 2);
  let k = 0;
  for (let i = back.length - 2; i >= 0; i -= 2) {
    pts[k++] = back[i];
    pts[k++] = back[i + 1];
  }
  pts[k++] = x0;
  pts[k++] = y0;
  for (let i = 0; i < fwd.length; i++) pts[k++] = fwd[i];
  for (let i = 0; i < n; i++) claim(pts[i * 2], pts[i * 2 + 1]);
  const striped = id % 4 === 0;
  s.active.push({
    pts, n, w, color, shown: 0, striped,
    alt: lightnessOf(color) > 0.5 ? mixColors(color, api.palette.background, 0.55) : lighten(color, 0.18),
  });
}

// --- differential growth ---------------------------------------------------------------------

function seedLoop(api, cx, cy) {
  const s = api.scene;
  const r = Math.min(api.w, api.h) * 0.14;
  s.n = 72;
  for (let i = 0; i < s.n; i++) {
    const a = (i / s.n) * TAU;
    s.x[i] = cx + Math.cos(a) * r;
    s.y[i] = cy + Math.sin(a) * r;
  }
}

function splitEdge(s, i) {
  if (s.n >= s.max) return;
  const j = (i + 1) % s.n;
  const mx = (s.x[i] + s.x[j]) / 2;
  const my = (s.y[i] + s.y[j]) / 2;
  s.x.copyWithin(i + 2, i + 1, s.n);
  s.y.copyWithin(i + 2, i + 1, s.n);
  s.x[i + 1] = mx;
  s.y[i + 1] = my;
  s.n++;
}

function relax(s, R, W, H) {
  const n = s.n;
  const cell = R;
  const cols = Math.ceil(W / cell) + 1;
  const rows = Math.ceil(H / cell) + 1;
  if (!s.head || s.head.length < cols * rows) s.head = new Int32Array(cols * rows);
  if (!s.link || s.link.length < s.max) s.link = new Int32Array(s.max);
  if (!s.fx || s.fx.length < s.max) {
    s.fx = new Float32Array(s.max);
    s.fy = new Float32Array(s.max);
  }
  const { head, link, fx, fy, x, y } = s;
  head.fill(-1, 0, cols * rows);
  for (let i = 0; i < n; i++) {
    const c = Math.min(rows - 1, Math.max(0, (y[i] / cell) | 0)) * cols + Math.min(cols - 1, Math.max(0, (x[i] / cell) | 0));
    link[i] = head[c];
    head[c] = i;
  }
  const R2 = R * R;
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n;
    const q = (i + 1) % n;
    let ax = ((x[p] + x[q]) / 2 - x[i]) * 0.22;
    let ay = ((y[p] + y[q]) / 2 - y[i]) * 0.22;
    const cx = (x[i] / cell) | 0;
    const cy = (y[i] / cell) | 0;
    for (let yy = Math.max(0, cy - 1); yy <= Math.min(rows - 1, cy + 1); yy++) {
      for (let xx = Math.max(0, cx - 1); xx <= Math.min(cols - 1, cx + 1); xx++) {
        for (let k = head[yy * cols + xx]; k !== -1; k = link[k]) {
          if (k === i) continue;
          const dx = x[i] - x[k];
          const dy = y[i] - y[k];
          const d2 = dx * dx + dy * dy;
          if (d2 < R2 && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const f = (R - d) / R;
            ax += (dx / d) * f * R * 0.45;
            ay += (dy / d) * f * R * 0.45;
          }
        }
      }
    }
    fx[i] = ax;
    fy[i] = ay;
  }
  const m = R * 2;
  for (let i = 0; i < n; i++) {
    x[i] = Math.min(W - m, Math.max(m, x[i] + fx[i]));
    y[i] = Math.min(H - m, Math.max(m, y[i] + fy[i]));
  }
}

/** A closed curve through the loop's nodes, smoothed through the midpoints. */
function loopPath(c, s) {
  const n = s.n;
  if (n < 3) return;
  c.beginPath();
  const mx = (i) => (s.x[i % n] + s.x[(i + 1) % n]) / 2;
  const my = (i) => (s.y[i % n] + s.y[(i + 1) % n]) / 2;
  c.moveTo(mx(0), my(0));
  for (let i = 1; i <= n; i++) c.quadraticCurveTo(s.x[i % n], s.y[i % n], mx(i), my(i));
  c.closePath();
}

// --- stippling ----------------------------------------------------------------------------------

// The light, from the upper left and a little in front.
const LX = -0.52;
const LY = -0.62;
const LZ = 0.59;

/**
 * How dark the picture is at a point, 0 to 1: a soft ground of light, and
 * spheres shaded as an engraver shades a ball -- lit side pale, terminator,
 * core shadow, a little reflected light at the rim -- each with the shadow it
 * casts on the ground behind it.
 */
function tone(api, s, x, y) {
  const m = Math.min(api.w, api.h);
  const t = api.now / 30000;
  let v = 0.34 + noise2(x / (m * 0.5) + t, y / (m * 0.5) - t * 0.6) * 0.1 + (y / api.h) * 0.08;
  for (const sp of s.spots) {
    const grow = Math.min(1, (api.now - sp.born) / 1800);
    const r = sp.r * (0.4 + 0.6 * grow);
    const dx = (x - sp.x) / r;
    const dy = (y - sp.y) / r;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1) {
      const nz = Math.sqrt(1 - d2);
      const lambert = Math.max(0, dx * LX + dy * LY + nz * LZ);
      const rim = Math.pow(1 - nz, 3) * 0.25;
      v = 0.015 + Math.pow(1 - lambert, 1.4) * 0.92 - rim;
    } else {
      // The cast shadow: an ellipse offset away from the light.
      const sx = (x - sp.x + LX * r * 0.9) / (r * 1.25);
      const sy = (y - sp.y + LY * r * 0.9 - r * 0.55) / (r * 0.45);
      const sd = sx * sx + sy * sy;
      if (sd < 1) v = Math.max(v, 0.42 + 0.4 * (1 - sd));
    }
  }
  v = Math.min(1, Math.max(0, v));
  return Math.pow(v, api.param('contrast'));
}

/**
 * The tone, on a grid a few pixels across, refreshed every few frames or when
 * a sphere is set down: the relaxation asks for it a hundred thousand times a
 * frame, and a lookup is what it can afford.
 */
function refreshTone(api, s) {
  const cell = 4;
  const gw = Math.ceil(api.w / cell) + 1;
  const gh = Math.ceil(api.h / cell) + 1;
  s.toneAge = (s.toneAge || 0) + 1;
  if (s.tg && s.tgw === gw && s.tgh === gh && s.toneAge < 12) return;
  if (!s.tg || s.tgw !== gw || s.tgh !== gh) {
    s.tg = new Float32Array(gw * gh);
    s.tgw = gw;
    s.tgh = gh;
  }
  s.tcell = cell;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) s.tg[j * gw + i] = tone(api, s, i * cell, j * cell);
  }
  s.toneAge = 0;
}

function toneAt(s, x, y) {
  const i = Math.min(s.tgw - 1, Math.max(0, (x / s.tcell + 0.5) | 0));
  const j = Math.min(s.tgh - 1, Math.max(0, (y / s.tcell + 0.5) | 0));
  return s.tg[j * s.tgw + i];
}

/** A point drawn where the picture is dark, by rejection against the tone grid. */
function sampleDark(api, s) {
  for (let k = 0; k < 30; k++) {
    const x = Math.random() * api.w;
    const y = Math.random() * api.h;
    if (Math.random() < toneAt(s, x, y) * 0.95 + 0.02) return [x, y];
  }
  return [Math.random() * api.w, Math.random() * api.h];
}

// --- roots ------------------------------------------------------------------------------------------

function scatter(s, cx, cy, r, count) {
  for (let k = 0; k < count; k++) {
    const i = s.aNext;
    s.aNext = (s.aNext + 1) % s.maxA;
    const a = Math.random() * TAU;
    const d = Math.sqrt(Math.random()) * r;
    s.axs[i] = cx + Math.cos(a) * d;
    s.ays[i] = cy + Math.sin(a) * d;
    s.alive[i] = 1;
  }
}

function plantRoots(api) {
  const s = api.scene;
  const count = 1 + Math.floor(Math.random() * 3);
  for (let k = 0; k < count && s.n < s.maxN; k++) {
    const i = s.n++;
    s.nx[i] = api.w * (0.2 + Math.random() * 0.6);
    s.ny[i] = api.h * (0.9 + Math.random() * 0.06);
    s.depth[i] = 0;
  }
  const m = Math.min(api.w, api.h);
  // Something to reach for from the start, above the roots.
  for (let k = 0; k < 7; k++) {
    scatter(s, api.w * (0.1 + Math.random() * 0.8), api.h * (0.1 + Math.random() * 0.65), m * 0.16, 45);
  }
  // And a handful within reach of each tip, where the first root will find it.
  //
  // A tip senses only as far as `reach` -- about a tenth of the picture -- and
  // on a small canvas every one of those scattered clouds can land outside it.
  // A root that senses nothing never takes a step, and the whole picture stays
  // empty: measured at one preview in twenty-four, which is a card promising a
  // picture it does not have.
  for (let k = 0; k < s.n; k++) {
    scatter(s, s.nx[k] + (Math.random() - 0.5) * m * 0.05, s.ny[k] - m * 0.05, m * 0.045, 14);
  }
}

// --- the slime mould ---------------------------------------------------------------------------

// Sines and cosines from a table: an agent asks for four of each every step,
// and there are tens of thousands of agents.
const STEPS = 2048;
const COS = new Float32Array(STEPS);
const SIN = new Float32Array(STEPS);
for (let i = 0; i < STEPS; i++) {
  COS[i] = Math.cos((i / STEPS) * TAU);
  SIN[i] = Math.sin((i / STEPS) * TAU);
}
const turnIndex = (a) => ((((a / TAU) * STEPS) | 0) % STEPS + STEPS) % STEPS;

/**
 * One step of every agent, then the trail spread and faded. The settings are
 * Jones's: sensors at twenty-two and a half degrees either side, a turn of
 * forty-five, a short look ahead -- which is what makes veins rather than
 * blobs at this resolution.
 */
function stepMould(api, s) {
  const { gw, gh, ax, ay, aa } = s;
  const trail = s.trail;
  const tmp = s.tmp;
  const sense = api.param('sense');
  const turn = api.param('turn');
  const decay = api.param('decay');
  const spread = Math.round((0.39 / TAU) * STEPS);
  const turnSteps = Math.round((turn / TAU) * STEPS);
  const W1 = gw - 1;
  const H1 = gh - 1;
  const at = (x, y) => trail[(y < 0 ? 0 : y > H1 ? H1 : y | 0) * gw + (x < 0 ? 0 : x > W1 ? W1 : x | 0)];
  for (let i = 0; i < s.n; i++) {
    let k = turnIndex(aa[i]);
    const x = ax[i];
    const y = ay[i];
    const kl = (k - spread + STEPS) % STEPS;
    const kr = (k + spread) % STEPS;
    const f = at(x + COS[k] * sense, y + SIN[k] * sense);
    const l = at(x + COS[kl] * sense, y + SIN[kl] * sense);
    const r = at(x + COS[kr] * sense, y + SIN[kr] * sense);
    if (f > l && f > r) {
      /* straight on */
    } else if (f < l && f < r) k += Math.random() < 0.5 ? -turnSteps : turnSteps;
    else if (l > r) k -= turnSteps;
    else if (r > l) k += turnSteps;
    k = (k % STEPS + STEPS) % STEPS;
    let nx = x + COS[k];
    let ny = y + SIN[k];
    if (nx < 1 || nx >= W1 || ny < 1 || ny >= H1) {
      k = (Math.random() * STEPS) | 0;
      nx = nx < 1 ? 1 : nx >= W1 ? W1 - 1 : nx;
      ny = ny < 1 ? 1 : ny >= H1 ? H1 - 1 : ny;
    }
    ax[i] = nx;
    ay[i] = ny;
    aa[i] = (k / STEPS) * TAU;
    trail[(ny | 0) * gw + (nx | 0)] += 1.5;
  }
  // Spread and fade: a 3 by 3 mean, as two passes of three.
  for (let y = 0; y < gh; y++) {
    const row = y * gw;
    tmp[row] = (trail[row] * 2 + trail[row + 1]) / 3;
    for (let x = 1; x < W1; x++) tmp[row + x] = (trail[row + x - 1] + trail[row + x] + trail[row + x + 1]) / 3;
    tmp[row + W1] = (trail[row + W1 - 1] + trail[row + W1] * 2) / 3;
  }
  // Half diffused and half kept: a full blur every step thickened the veins
  // into highways.
  const k3 = (decay * 0.5) / 3;
  const keep = decay * 0.5;
  for (let x = 0; x < gw; x++) {
    trail[x] = trail[x] * keep + (tmp[x] * 2 + tmp[gw + x]) * k3;
    for (let y = 1; y < H1; y++) {
      const i = y * gw + x;
      trail[i] = trail[i] * keep + (tmp[i - gw] + tmp[i] + tmp[i + gw]) * k3;
    }
    const e = H1 * gw + x;
    trail[e] = trail[e] * keep + (tmp[e - gw] + tmp[e] * 2) * k3;
  }
}

/** Every source of food gives a little, and gives out in the end. */
function feed(s) {
  for (let k = s.food.length - 1; k >= 0; k--) {
    const f = s.food[k];
    const x0 = Math.round(f.x);
    const y0 = Math.round(f.y);
    for (let y = y0 - 2; y <= y0 + 2; y++) {
      if (y < 0 || y >= s.gh) continue;
      for (let x = x0 - 2; x <= x0 + 2; x++) {
        if (x < 0 || x >= s.gw) continue;
        s.trail[y * s.gw + x] += f.amount;
      }
    }
    if (--f.left <= 0) s.food.splice(k, 1);
  }
}

/** The trail, coloured through a ramp from the ground to the palette's lightest ink. */
function drawMould(ctx, api, s) {
  if (s.lutFor !== api.palette) {
    const dark = lightnessOf(api.palette.background) < 0.5;
    const mid = api.palette.anon;
    const top = dark ? lighten(api.palette.default, 0.05) : api.palette.bot;
    s.lut = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const c = t < 0.5 ? mixColors(api.palette.background, mid, t * 2) : mixColors(mid, top, (t - 0.5) * 2);
      s.lut[i] = pack(c);
    }
    s.lutFor = api.palette;
  }
  const src = s.trail;
  const px = s.px;
  const lut = s.lut;
  for (let i = 0; i < px.length; i++) {
    const v = src[i];
    // Only the cores of the veins come up bright; the spread trail stays low.
    const t = v <= 0 ? 0 : 1 - Math.exp(-v * 0.09);
    px[i] = lut[(t * 255) | 0];
  }
  s.canvas.getContext('2d').putImageData(s.img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.canvas, 0, 0, api.w, api.h);
}
