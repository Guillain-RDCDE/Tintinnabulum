// The painters' rooms: pictures in the spirit of twentieth-century painting.
//
// These are homages to ways of painting, not copies of paintings. Each takes
// what a movement was about -- Albers's colours pressing on one another,
// Rothko's fields that seem to breathe, Matisse cutting straight into colour
// with scissors -- and lets a live feed do the painting. None of them names a
// living artist, and none reproduces a particular work.
//
// Everything here is drawn from the palette, so a room follows whatever
// scheme is chosen, and every collection a room keeps is small and fixed.

import { scratch } from './paint.js';
import { cap } from './budget.js';
import { mixColors, lighten, lightnessOf } from '../color.js';
import { noise2 } from './noise.js';

const TAU = Math.PI * 2;

/** A generator that gives the same composition on every visit. */
function seeded(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** The palette's four inks, in a fixed order. */
const inks = (pal) => [pal.user, pal.anon, pal.alert, pal.default];

/** The accumulation buffer, cleared the first time it is asked for. */
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

/** Ease a stored number towards a target at a rate independent of frame rate. */
const ease = (from, to, dt, ms) => from + (to - from) * (1 - Math.exp(-dt / ms));

export const PAINTER_SCENES = {
  // --- Albers ---------------------------------------------------------------
  squares: {
    label: 'Nested squares',
    positional: false,
    note: "In the spirit of Josef Albers's Homage to the Square, 1950-76: squares set inside squares, their centres a little low, in colours close enough to change each other. The feed shifts one square's colour at a time, slowly, and the whole panel appears to change with it.",
    params: {
      panels: { label: 'Panels', min: 1, max: 5, step: 1, default: 3 },
      closeness: { label: 'How close the colours are', min: 0.1, max: 0.9, step: 0.02, default: 0.5 },
    },
    init(api) {
      const s = api.scene;
      s.tones = new Float32Array(20);   // per panel, per square: 0..1 drift
      s.targets = new Float32Array(20);
    },
    event(p, api) {
      const s = api.scene;
      const panels = Math.round(api.param('panels'));
      const panel = Math.min(panels - 1, Math.floor((p.x / api.w) * panels));
      const sq = Math.floor(Math.random() * 4);
      s.targets[panel * 4 + sq] = Math.random();
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const panels = Math.round(api.param('panels'));
      const close = api.param('closeness');
      const gap = Math.min(api.w, api.h) * 0.05;
      const pw = (api.w - gap * (panels + 1)) / panels;
      const side = Math.min(pw, api.h - gap * 2);
      const top = (api.h - side) / 2;
      const base = inks(pal);
      for (let k = 0; k < panels; k++) {
        const x0 = gap + k * (pw + gap) + (pw - side) / 2;
        // One hue per panel; the four squares are that hue at four values.
        const hue = base[k % base.length];
        for (let i = 0; i < 4; i++) {
          const idx = k * 4 + i;
          s.tones[idx] = ease(s.tones[idx], s.targets[idx], api.dt, 2600);
          const shift = (s.tones[idx] - 0.5) * 0.18;
          const toward = i % 2 ? pal.background : lighten(hue, 0.18);
          const colour = lighten(mixColors(hue, toward, (i / 4) * close), shift);
          const size = side * (1 - i * 0.2);
          // The Albers offset: each inner square sits lower than centre.
          const x = x0 + (side - size) / 2;
          const y = top + (side - size) * 0.62;
          ctx.fillStyle = colour;
          ctx.fillRect(x, y, size, size);
        }
      }
    },
  },

  // --- Rothko ---------------------------------------------------------------
  fields: {
    label: 'Colour fields',
    positional: false,
    note: "In the spirit of Mark Rothko's colour-field paintings: two or three soft rectangles hovering on a coloured ground, their edges feathered so they seem to breathe rather than sit. Busy moments brighten a field; quiet ones let it sink back.",
    params: {
      bands: { label: 'Fields', min: 2, max: 3, step: 1, default: 2 },
      soft: { label: 'Softness', min: 2, max: 40, step: 1, default: 16 },
    },
    init(api) {
      api.scene.glow = new Float32Array(3);
    },
    event(p, api) {
      const bands = Math.round(api.param('bands'));
      const i = Math.min(bands - 1, Math.floor((p.y / api.h) * bands));
      api.scene.glow[i] = Math.min(1, api.scene.glow[i] + 0.22);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const bands = Math.round(api.param('bands'));
      const soft = api.param('soft');
      // The ground is a colour too: that is half of what these paintings are.
      ctx.fillStyle = mixColors(pal.alert, pal.background, 0.55);
      ctx.fillRect(0, 0, api.w, api.h);
      const mx = api.w * 0.1;
      const my = api.h * 0.08;
      const gap = api.h * 0.05;
      const bh = (api.h - my * 2 - gap * (bands - 1)) / bands;
      const colours = [pal.user, pal.anon, pal.default];
      const breathe = 0.5 + 0.5 * Math.sin(api.now / 5200);
      for (let i = 0; i < bands; i++) {
        s.glow[i] = Math.max(0, s.glow[i] - api.dt / 9000);
        const c = lighten(mixColors(colours[i % 3], pal.background, 0.25), s.glow[i] * 0.2 + breathe * 0.03);
        const y = my + i * (bh + gap);
        // Feathered by stacking translucent copies inward, which is roughly what
        // thin glazes of paint do and costs a handful of rectangles.
        const layers = 7;
        for (let l = 0; l < layers; l++) {
          const inset = (soft * (layers - l)) / layers;
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = c;
          ctx.fillRect(mx + inset - soft / 2, y + inset - soft / 2, api.w - mx * 2 - inset * 2 + soft, bh - inset * 2 + soft);
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- Matisse --------------------------------------------------------------
  cutouts: {
    label: 'Paper cut-outs',
    positional: false,
    note: "In the spirit of Matisse's late cut-outs, when he drew with scissors straight into painted paper: leaves, fronds and seaweed shapes scattered across a ground, turning slowly. Every event cuts a new shape in its own colour.",
    params: {
      count: { label: 'How many shapes', min: 4, max: 40, step: 1, default: 16 },
      size: { label: 'Size', min: 0.4, max: 2.2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1947);
      s.shapes = [];
      for (let i = 0; i < 40; i++) {
        s.shapes.push({
          x: rnd(), y: rnd(), a: rnd() * TAU, spin: (rnd() - 0.5) * 0.00006,
          lobes: 3 + Math.floor(rnd() * 5), k: rnd(), c: null, seed: Math.floor(rnd() * 1e6),
        });
      }
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      const count = Math.round(api.param('count'));
      const sh = s.shapes[s.next % count];
      s.next++;
      sh.x = p.x / api.w;
      sh.y = p.y / api.h;
      sh.c = p.color;
      sh.lobes = 3 + Math.floor(Math.random() * 5);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const count = Math.round(api.param('count'));
      const R = Math.min(api.w, api.h) * 0.11 * api.param('size');
      const base = inks(pal);
      for (let i = 0; i < count; i++) {
        const sh = s.shapes[i];
        sh.a += sh.spin * api.dt;
        const cx = sh.x * api.w;
        const cy = sh.y * api.h;
        ctx.fillStyle = sh.c || base[i % base.length];
        const n = sh.lobes;
        const len = R * (1.1 + sh.k * 0.8);
        const cos = Math.cos(sh.a);
        const sin = Math.sin(sh.a);
        ctx.beginPath();
        const steps = 96;
        for (let k = 0; k <= steps; k++) {
          const t = (k / steps) * TAU;
          // Fingers round a body, the way scissors go in and out of a sheet: a
          // rounded lobe, a sharp notch, another rounded lobe.
          const wave = Math.abs(Math.cos((t * n) / 2));
          const rr = len * (0.36 + 0.64 * Math.pow(wave, 0.55)) * (0.9 + 0.1 * Math.sin(t * 3 + sh.seed));
          const u = Math.cos(t) * rr;
          const v = Math.sin(t) * rr * (0.55 + sh.k * 0.35);
          const x = cx + u * cos - v * sin;
          const y = cy + u * sin + v * cos;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
  },

  // --- Sonia Delaunay -------------------------------------------------------
  discs: {
    label: 'Simultaneous discs',
    positional: false,
    note: "In the spirit of Sonia Delaunay's simultaneous contrasts: large discs cut into rings and quarters, each segment a colour that makes its neighbour look different. They turn very slowly; an event gives the nearest disc a push.",
    params: {
      discs: { label: 'Discs', min: 1, max: 7, step: 1, default: 4 },
      rings: { label: 'Rings', min: 2, max: 7, step: 1, default: 4 },
    },
    init(api) {
      const s = api.scene;
      s.spin = new Float32Array(8);
      s.vel = new Float32Array(8);
      const rnd = seeded(1913);
      s.pos = new Float32Array(16);
      for (let i = 0; i < 8; i++) {
        s.pos[i * 2] = 0.18 + rnd() * 0.64;
        s.pos[i * 2 + 1] = 0.2 + rnd() * 0.6;
        s.vel[i] = (rnd() - 0.5) * 0.00004;
      }
    },
    event(p, api) {
      const s = api.scene;
      const n = Math.round(api.param('discs'));
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(s.pos[i * 2] * api.w - p.x, s.pos[i * 2 + 1] * api.h - p.y);
        if (d < bd) { bd = d; best = i; }
      }
      s.vel[best] += (Math.random() < 0.5 ? -1 : 1) * 0.00018;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const n = Math.round(api.param('discs'));
      const rings = Math.round(api.param('rings'));
      const base = [...inks(pal), pal.default];
      const R0 = Math.min(api.w, api.h) * (n > 3 ? 0.23 : 0.32);
      for (let i = 0; i < n; i++) {
        s.vel[i] *= Math.exp(-api.dt / 12000);
        s.spin[i] += (s.vel[i] + 0.000012) * api.dt;
        const cx = s.pos[i * 2] * api.w;
        const cy = s.pos[i * 2 + 1] * api.h;
        const R = R0 * (0.7 + ((i * 37) % 10) / 30);
        for (let r = rings; r > 0; r--) {
          const outer = (R * r) / rings;
          for (let q = 0; q < 4; q++) {
            ctx.fillStyle = base[(i + r * 2 + q) % base.length];
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, outer, s.spin[i] + (q * TAU) / 4, s.spin[i] + ((q + 1) * TAU) / 4);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    },
  },

  // --- Miró -----------------------------------------------------------------
  signs: {
    label: 'Night signs',
    note: "In the spirit of Joan Miró's Constellations, 1940-41: stars, crescents, eyes and black dots strung together by fine lines, with small spots of pure colour. Each event draws its sign where it landed.",
    params: {
      lines: { label: 'Threads between signs', min: 0, max: 1, step: 0.02, default: 0.6 },
    },
    frame(ctx, api) {
      const pal = api.palette;
      const marks = api.particles.slice(-Math.min(90, cap(api, 0.3)));
      const ink = lightnessOf(pal.background) < 0.5 ? pal.text : '#161412';
      // The threads first, so the signs sit on top of them.
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = 0.5 * api.param('lines');
      ctx.beginPath();
      for (let i = 1; i < marks.length; i++) {
        if (i % 3 === 0) continue;
        ctx.moveTo(marks[i - 1].x, marks[i - 1].y);
        ctx.lineTo(marks[i].x, marks[i].y);
      }
      ctx.stroke();
      for (const p of marks) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        const a = Math.min(1, (1 - age) * 1.4);
        const r = Math.max(4, p.r * 0.35);
        const kind = Math.floor((p.pick || 0) * 6);
        ctx.globalAlpha = a;
        ctx.fillStyle = kind < 2 ? ink : p.color;
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.2, r * 0.18);
        ctx.beginPath();
        if (kind === 0) {
          ctx.arc(p.x, p.y, r * 0.7, 0, TAU);
          ctx.fill();
        } else if (kind === 1) {
          // A star: an asterisk of strokes.
          for (let k = 0; k < 4; k++) {
            const t = (k * Math.PI) / 4 + (p.rot || 0);
            ctx.moveTo(p.x - Math.cos(t) * r, p.y - Math.sin(t) * r);
            ctx.lineTo(p.x + Math.cos(t) * r, p.y + Math.sin(t) * r);
          }
          ctx.stroke();
        } else if (kind === 2) {
          // A crescent.
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(p.x + r * 0.45, p.y - r * 0.2, r * 0.85, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else if (kind === 3) {
          // An eye.
          ctx.ellipse(p.x, p.y, r * 1.2, r * 0.6, p.rot || 0, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.fillStyle = ink;
          ctx.arc(p.x, p.y, r * 0.28, 0, TAU);
          ctx.fill();
        } else {
          // A spot of pure colour with a dark rim.
          ctx.arc(p.x, p.y, r * 0.9, 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- Calder -----------------------------------------------------------------
  mobile: {
    label: 'Hanging mobile',
    positional: false,
    note: "In the spirit of Alexander Calder's mobiles: arms balanced on a wire, each carrying a flat disc, turning in air you cannot feel. Every event is a breath of wind on one arm, and the rest of the mobile answers it.",
    params: {
      sway: { label: 'How much it sways', min: 0.1, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      // A binary tree three levels deep: fifteen arms, eight discs. Angle and
      // angular velocity per arm, in typed arrays.
      s.angle = new Float32Array(15);
      s.vel = new Float32Array(15);
      s.colour = new Array(8).fill(null);
      const rnd = seeded(1932);
      for (let i = 0; i < 15; i++) s.angle[i] = (rnd() - 0.5) * 0.5;
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      const arm = Math.floor(Math.random() * 15);
      s.vel[arm] += (Math.random() - 0.5) * 0.0026 * api.param('sway');
      s.colour[s.next % 8] = p.color;
      s.next++;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const dt = Math.min(50, api.dt);
      // A damped pendulum per arm, with a slow drift so it never stops dead.
      for (let i = 0; i < 15; i++) {
        const drift = noise2(i * 3.1, api.now / 9000) * 0.0000045 * api.param('sway');
        s.vel[i] += (-s.angle[i] * 0.0000018 + drift) * dt;
        s.vel[i] *= Math.exp(-dt / 6000);
        s.angle[i] += s.vel[i] * dt;
      }
      const wire = lightnessOf(pal.background) < 0.5 ? pal.text : '#1b1916';
      ctx.strokeStyle = wire;
      ctx.lineWidth = 1.3;
      const base = inks(pal);
      let disc = 0;
      const arm = (node, x, y, len, depth, heading) => {
        const a = heading + s.angle[node];
        const dx = Math.cos(a) * len;
        const dy = Math.sin(a) * len;
        const lx = x - dx;
        const ly = y - dy;
        const rx = x + dx;
        const ry = y + dy;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(rx, ry);
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - len * 0.25);
        ctx.stroke();
        const drop = len * 0.55;
        for (const [ex, ey, side] of [[lx, ly, 1], [rx, ry, 2]]) {
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex, ey + drop);
          ctx.stroke();
          const child = node * 2 + side;
          if (depth < 2 && child < 15) {
            arm(child, ex, ey + drop, len * 0.58, depth + 1, 0);
          } else {
            const i = disc++;
            ctx.globalAlpha = 1;
            ctx.fillStyle = s.colour[i] || base[i % base.length];
            ctx.beginPath();
            ctx.ellipse(ex, ey + drop, Math.max(9, len * 0.42), Math.max(9, len * 0.42) * (0.35 + 0.65 * Math.abs(Math.cos(api.now / 3000 + i))), 0, 0, TAU);
            ctx.fill();
          }
        }
      };
      const L = Math.min(api.w, api.h) * 0.34;
      ctx.beginPath();
      ctx.moveTo(api.w / 2, 0);
      ctx.lineTo(api.w / 2, api.h * 0.16);
      ctx.stroke();
      arm(0, api.w / 2, api.h * 0.16, L, 0, 0);
      ctx.globalAlpha = 1;
    },
  },

  // --- Bauhaus ----------------------------------------------------------------
  bauhaus: {
    label: 'Bauhaus',
    positional: false,
    note: 'In the spirit of the Bauhaus posters of the 1920s: circles, half-circles, bars and triangles set on a strict grid in a few flat colours. The grid holds still; events swap one cell for another shape, which is how a poster gets rearranged.',
    params: {
      cols: { label: 'Columns', min: 2, max: 8, step: 1, default: 5, rebuild: true },
    },
    init(api) {
      const s = api.scene;
      const cols = Math.round(api.param('cols'));
      const rows = Math.max(2, Math.round((cols * api.h) / api.w));
      const rnd = seeded(1919);
      s.cols = cols;
      s.rows = rows;
      s.kind = new Uint8Array(cols * rows);
      s.ink = new Uint8Array(cols * rows);
      s.turn = new Uint8Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        s.kind[i] = Math.floor(rnd() * 6);
        s.ink[i] = Math.floor(rnd() * 5);
        s.turn[i] = Math.floor(rnd() * 4);
      }
    },
    event(p, api) {
      const s = api.scene;
      if (!s.kind) return;
      const c = Math.min(s.cols - 1, Math.floor((p.x / api.w) * s.cols));
      const r = Math.min(s.rows - 1, Math.floor((p.y / api.h) * s.rows));
      const i = r * s.cols + c;
      s.kind[i] = (s.kind[i] + 1 + Math.floor(Math.random() * 5)) % 6;
      s.ink[i] = Math.floor(Math.random() * 5);
      s.turn[i] = (s.turn[i] + 1) % 4;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.kind) return;
      const pal = api.palette;
      const inksHere = [pal.user, pal.anon, pal.alert, pal.default, pal.default];
      const cw = api.w / s.cols;
      const ch = api.h / s.rows;
      const u = Math.min(cw, ch);
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          const i = r * s.cols + c;
          const cx = c * cw + cw / 2;
          const cy = r * ch + ch / 2;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((s.turn[i] * Math.PI) / 2);
          ctx.fillStyle = inksHere[s.ink[i]];
          ctx.beginPath();
          const h = u * 0.42;
          switch (s.kind[i]) {
            case 0: ctx.arc(0, 0, h, 0, TAU); break;
            case 1: ctx.arc(0, 0, h, 0, Math.PI); ctx.closePath(); break;
            case 2: ctx.rect(-h, -h * 0.28, h * 2, h * 0.56); break;
            case 3: ctx.moveTo(-h, h); ctx.lineTo(h, h); ctx.lineTo(-h, -h); ctx.closePath(); break;
            case 4: ctx.moveTo(-h, -h); ctx.arc(-h, -h, h * 2, 0, Math.PI / 2); ctx.closePath(); break;
            default: ctx.rect(-h, -h, h * 2, h * 2);
          }
          ctx.fill();
          ctx.restore();
        }
      }
    },
  },

  // --- Anni Albers --------------------------------------------------------------
  weaving: {
    label: 'Woven cloth',
    positional: false,
    note: "In the spirit of Anni Albers's weavings: warp threads running down, weft passing over and under them, and bands of colour building up row by row as if on a loom. Each event changes the colour of the weft being thrown.",
    params: {
      thread: { label: 'Thread size', min: 4, max: 24, step: 1, default: 12, rebuild: true },
      speed: { label: 'Rows per second', min: 1, max: 30, step: 1, default: 7 },
    },
    init(api) {
      const s = api.scene;
      const t = Math.max(3, Math.round(api.param('thread')));
      s.t = t;
      s.cols = Math.ceil(api.w / t);
      s.rows = Math.ceil(api.h / t);
      // One colour index per row, as a ring: the newest row is written at
      // `head`, and the picture is read from there, so the cloth scrolls.
      s.rowInk = new Uint8Array(s.rows);
      s.head = 0;
      s.acc = 0;
      s.current = 0;
    },
    event(p, api) {
      // Not every event changes the thread, or the cloth is confetti.
      if (Math.random() < 0.35) api.scene.current = (api.scene.current + 1 + Math.floor(Math.random() * 3)) % 5;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.rowInk) return;
      const pal = api.palette;
      const threads = [pal.user, pal.anon, pal.alert, pal.default, pal.default];
      s.acc += (api.param('speed') * api.dt) / 1000;
      while (s.acc >= 1) {
        s.acc -= 1;
        s.head = (s.head + 1) % s.rows;
        s.rowInk[s.head] = s.current;
      }
      // The warp is the loom's plain thread, darker than any weft, and it
      // shows only as a narrow stitch: the colour is the weft's.
      const warp = mixColors(pal.background, '#000000', lightnessOf(pal.background) < 0.5 ? 0.35 : 0.25);
      const t = s.t;
      // The weft: one band per row, in that row's colour.
      for (let r = 0; r < s.rows; r++) {
        ctx.fillStyle = threads[s.rowInk[(s.head - r + s.rows * 2) % s.rows]];
        ctx.fillRect(0, r * t, api.w, t);
      }
      // The warp where it passes over the weft -- every other cell, offset
      // row to row, which is plain weave -- as a single path.
      ctx.fillStyle = warp;
      ctx.beginPath();
      for (let r = 0; r < s.rows; r++) {
        for (let c = r % 2; c < s.cols; c += 2) ctx.rect(c * t + t * 0.32, r * t, t * 0.36, t);
      }
      ctx.fill();
      // The shadow between rows, which is what makes it read as thread.
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      for (let r = 1; r < s.rows; r++) ctx.rect(0, r * t - 0.5, api.w, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },

  // --- Memphis ------------------------------------------------------------------
  memphis: {
    label: 'Memphis',
    positional: false,
    note: 'In the spirit of the Memphis design group of the 1980s: squiggles, confetti triangles, dotted circles and terrazzo chips in loud flat colours with black outlines. Nothing about it is quiet, and each event drops another piece into the mix.',
    params: {
      pieces: { label: 'How many pieces', min: 10, max: 90, step: 2, default: 44 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1981);
      s.bits = [];
      for (let i = 0; i < 90; i++) {
        s.bits.push({ x: rnd(), y: rnd(), a: rnd() * TAU, kind: Math.floor(rnd() * 5), s: 0.6 + rnd() * 0.8, c: null });
      }
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      const n = Math.round(api.param('pieces'));
      const b = s.bits[s.next % n];
      s.next++;
      b.x = p.x / api.w;
      b.y = p.y / api.h;
      b.c = p.color;
      b.kind = Math.floor(Math.random() * 5);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const n = Math.round(api.param('pieces'));
      const outline = lightnessOf(pal.background) < 0.5 ? '#0d0d0d' : '#141414';
      const loud = inks(pal);
      const U = Math.min(api.w, api.h) * 0.05;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const b = s.bits[i];
        const x = b.x * api.w;
        const y = b.y * api.h;
        const sz = U * b.s;
        const wob = Math.sin(api.now / 2400 + i) * 0.08;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(b.a + wob);
        ctx.fillStyle = b.c || loud[i % loud.length];
        ctx.strokeStyle = outline;
        ctx.lineWidth = Math.max(1.5, sz * 0.12);
        ctx.beginPath();
        if (b.kind === 0) {
          // A squiggle.
          ctx.lineWidth = Math.max(2.5, sz * 0.22);
          ctx.strokeStyle = b.c || loud[i % loud.length];
          for (let k = 0; k <= 10; k++) ctx.lineTo(-sz * 1.4 + (k / 10) * sz * 2.8, Math.sin(k * 1.2) * sz * 0.35);
          ctx.stroke();
        } else if (b.kind === 1) {
          ctx.moveTo(0, -sz * 0.8); ctx.lineTo(sz * 0.8, sz * 0.6); ctx.lineTo(-sz * 0.8, sz * 0.6); ctx.closePath();
          ctx.fill(); ctx.stroke();
        } else if (b.kind === 2) {
          ctx.arc(0, 0, sz * 0.7, 0, TAU);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = outline;
          for (let k = 0; k < 6; k++) {
            ctx.beginPath();
            ctx.arc(Math.cos(k) * sz * 0.35, Math.sin(k * 1.7) * sz * 0.35, sz * 0.07, 0, TAU);
            ctx.fill();
          }
        } else if (b.kind === 3) {
          ctx.rect(-sz, -sz * 0.18, sz * 2, sz * 0.36);
          ctx.fill(); ctx.stroke();
        } else {
          // A terrazzo chip.
          ctx.moveTo(-sz * 0.5, -sz * 0.2); ctx.lineTo(sz * 0.1, -sz * 0.55); ctx.lineTo(sz * 0.6, 0);
          ctx.lineTo(sz * 0.2, sz * 0.5); ctx.lineTo(-sz * 0.4, sz * 0.3); ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    },
  },

  // --- Agnes Martin -------------------------------------------------------------
  stillness: {
    label: 'Quiet grid',
    positional: false,
    note: "In the spirit of Agnes Martin's pale grid paintings: pencil lines drawn by hand across a light ground, and bands of colour so faint they are more felt than seen. It hardly moves. An event deepens one band for a moment, then lets it fade.",
    params: {
      lines: { label: 'Lines', min: 6, max: 60, step: 1, default: 28 },
    },
    init(api) {
      api.scene.band = new Float32Array(12);
    },
    event(p, api) {
      const i = Math.min(11, Math.floor((p.y / api.h) * 12));
      api.scene.band[i] = Math.min(1, api.scene.band[i] + 0.35);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const dark = lightnessOf(pal.background) < 0.5;
      ctx.fillStyle = dark ? mixColors(pal.background, '#ffffff', 0.08) : mixColors(pal.background, '#ffffff', 0.35);
      ctx.fillRect(0, 0, api.w, api.h);
      const bh = api.h / 12;
      const tints = [pal.user, pal.anon, pal.alert];
      for (let i = 0; i < 12; i++) {
        s.band[i] = Math.max(0, s.band[i] - api.dt / 14000);
        ctx.globalAlpha = 0.05 + s.band[i] * 0.2;
        ctx.fillStyle = tints[i % 3];
        ctx.fillRect(0, i * bh, api.w, bh);
      }
      // Pencil: thin, slightly wavering, never quite straight -- the waver is
      // the hand, and without it this is a spreadsheet.
      const lines = Math.round(api.param('lines'));
      ctx.globalAlpha = dark ? 0.35 : 0.3;
      ctx.strokeStyle = dark ? pal.text : '#3a3632';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let l = 1; l < lines; l++) {
        const y0 = (l / lines) * api.h;
        ctx.moveTo(0, y0);
        for (let x = 0; x <= api.w; x += 24) {
          ctx.lineTo(x, y0 + noise2(x * 0.004, l * 1.7) * 1.4);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  // --- Pollock ------------------------------------------------------------------
  drip: {
    label: 'Drip painting',
    positional: false,
    note: "In the spirit of Jackson Pollock's poured paintings: paint flung from a stick across a canvas on the floor, in loops that thin to threads and break into spatter. Every event is one flick of the wrist, and they pile up over each other.",
    params: {
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.995 },
      loop: { label: 'Loopiness', min: 0.2, max: 3, step: 0.05, default: 1.2 },
    },
    init(api) {
      api.scene.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      const loop = api.param('loop');
      let x = p.x;
      let y = p.y;
      let a = Math.random() * TAU;
      let w = Math.max(1.5, p.r * 0.12);
      g.strokeStyle = p.color;
      g.fillStyle = p.color;
      g.lineCap = 'round';
      // One flick: a path that curls and thins as the paint runs out.
      const steps = 30 + Math.floor(Math.random() * 40);
      for (let i = 0; i < steps; i++) {
        a += (Math.random() - 0.5) * loop;
        const nx = x + Math.cos(a) * (6 + Math.random() * 14);
        const ny = y + Math.sin(a) * (6 + Math.random() * 14);
        g.globalAlpha = 0.85;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
        x = nx;
        y = ny;
        w *= 0.955;
        // Spatter where the flick slows.
        if (Math.random() < 0.18) {
          const n = 2 + Math.floor(Math.random() * 5);
          for (let k = 0; k < n; k++) {
            g.beginPath();
            g.arc(x + (Math.random() - 0.5) * 26, y + (Math.random() - 0.5) * 26, Math.random() * w * 0.6 + 0.4, 0, TAU);
            g.fill();
          }
        }
      }
      g.globalAlpha = 1;
      void cv;
    },
    frame(ctx, api) {
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      const keep = api.param('hold');
      if (keep < 0.999) {
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = `rgba(0,0,0,${(1 - keep) * Math.min(0.06, api.dt / 1000) * 1.8})`;
        g.fillRect(0, 0, cv.width, cv.height);
        g.restore();
      }
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  // --- temperament: calm and storm --------------------------------------------------
  temperament: {
    label: 'Temperament',
    positional: false,
    note: 'A picture that changes character with the mood of the feed. When the world is quiet it is a pale, hand-drawn grid; as things get busy the lines loosen, and in a real rush the paint starts to fly. It reads the rate of events, not where they land.',
    params: {
      sensitivity: { label: 'How easily it gets excited', min: 0.2, max: 4, step: 0.05, default: 1 },
    },
    init(api) {
      api.scene.mood = 0;
      api.scene.bufClean = false;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      // The mood: how many marks were born in the last three seconds, eased so
      // a single burst does not flip the whole picture.
      let recent = 0;
      for (let i = api.particles.length - 1; i >= 0; i--) {
        if (api.now - api.particles[i].born > 3000) break;
        recent++;
      }
      const want = Math.min(1, (recent / 40) * api.param('sensitivity'));
      s.mood = ease(s.mood, want, api.dt, 1800);
      const calm = 1 - s.mood;
      const dark = lightnessOf(pal.background) < 0.5;

      // Calm: the quiet grid, fading in and out with the mood.
      ctx.fillStyle = dark ? mixColors(pal.background, '#ffffff', 0.06) : mixColors(pal.background, '#ffffff', 0.3);
      ctx.fillRect(0, 0, api.w, api.h);
      ctx.globalAlpha = 0.3 * calm + 0.05;
      ctx.strokeStyle = dark ? pal.text : '#3a3632';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const lines = 26;
      for (let l = 1; l < lines; l++) {
        const y0 = (l / lines) * api.h;
        ctx.moveTo(0, y0);
        for (let x = 0; x <= api.w; x += 24) {
          // The waver grows with the mood: a steady hand becomes an unsteady one.
          ctx.lineTo(x, y0 + noise2(x * 0.004, l * 1.7 + api.now / 6000) * (1.2 + s.mood * 18));
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Storm: flicks of paint, more of them the busier it is.
      const flicks = s.mood > 0.25 ? Math.floor(s.mood * s.mood * 3 + Math.random()) : 0;
      const marks = api.particles;
      for (let f = 0; f < flicks && marks.length; f++) {
        const p = marks[marks.length - 1 - Math.floor(Math.random() * Math.min(marks.length, 30))];
        let x = p.x;
        let y = p.y;
        let a = Math.random() * TAU;
        let w = Math.max(1, p.r * 0.1);
        g.strokeStyle = p.color;
        g.lineCap = 'round';
        for (let i = 0; i < 24; i++) {
          a += (Math.random() - 0.5) * 1.3;
          const nx = x + Math.cos(a) * 12;
          const ny = y + Math.sin(a) * 12;
          g.globalAlpha = 0.8;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(nx, ny);
          g.stroke();
          x = nx;
          y = ny;
          w *= 0.95;
        }
      }
      // The paint dries away faster when the room has calmed down.
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 1;
      g.fillStyle = `rgba(0,0,0,${Math.min(0.08, (api.dt / 1000) * (0.05 + calm * 0.6))})`;
      g.fillRect(0, 0, cv.width, cv.height);
      g.restore();
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },
};
