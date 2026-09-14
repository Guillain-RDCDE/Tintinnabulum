// Nature and night: places rather than patterns.
//
// A window on a rainy night, a meadow of fireflies, starlings at dusk, a sea
// that glows where it breaks. Each is a scene you could stand in front of, and
// the feed is the weather in it: an event is a drop on the glass, a firefly
// answering, a wave lighting up, a firework over a far-off town.
//
// These scenes paint their own sky or ground, since a place has one; they
// still take every colour from the palette. Collections are fixed and typed.

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

/** A night sky from the palette: its ground, taken down towards ink. */
const nightOf = (pal) => mixColors(pal.background, '#05080d', lightnessOf(pal.background) > 0.5 ? 0.86 : 0.45);

/** A soft round light, drawn as a radial gradient. */
function glow(ctx, x, y, r, colour, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * A one-pixel-wide column of light fading upward, kept per colour for the life
 * of the page. Kept on the scene's state at first, which threw them away and
 * made them again on every change of scene -- and the suite counts canvases.
 */
const RAYS = new Map();
function raySprite(s, colour) {
  if (RAYS.has(colour)) return RAYS.get(colour);
  if (RAYS.size > 32) RAYS.clear();
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 96;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 96, 0, 0);
  grad.addColorStop(0, colour);
  grad.addColorStop(0.15, colour);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 96);
  RAYS.set(colour, cv);
  return cv;
}

export const NATURE_SCENES = {
  // --- rain on a window at night ---------------------------------------------------
  windowrain: {
    label: 'Rain on the window',
    positional: false,
    note: "A window at night with the city out of focus behind it: lights gone soft and round, and drops on the glass, each one holding a tiny upside-down picture of the street. Events are lights coming on, and drops landing.",
    params: {
      drops: { label: 'Drops on the glass', min: 10, max: 140, step: 2, default: 70 },
      blur: { label: 'How far away the city is', min: 0.4, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(2024);
      s.lx = new Float32Array(48);
      s.ly = new Float32Array(48);
      s.lr = new Float32Array(48);
      s.lb = new Float32Array(48);
      s.lc = new Array(48).fill('');
      for (let i = 0; i < 48; i++) {
        s.lx[i] = rnd(); s.ly[i] = 0.35 + rnd() * 0.65; s.lr[i] = 0.5 + rnd(); s.lb[i] = 0.3 + rnd() * 0.5;
      }
      s.dx = new Float32Array(140);
      s.dy = new Float32Array(140);
      s.dr = new Float32Array(140);
      s.dv = new Float32Array(140);
      for (let i = 0; i < 140; i++) {
        s.dx[i] = rnd(); s.dy[i] = rnd(); s.dr[i] = 1.5 + rnd() * rnd() * 7; s.dv[i] = 0;
      }
      s.nl = 0;
      s.nd = 0;
    },
    event(p, api) {
      const s = api.scene;
      const i = s.nl++ % 48;
      s.lx[i] = p.x / api.w; s.ly[i] = 0.3 + (p.y / api.h) * 0.7; s.lb[i] = 1; s.lc[i] = p.color;
      const d = s.nd++ % Math.round(api.param('drops'));
      s.dx[d] = Math.random(); s.dy[d] = Math.random() * 0.7; s.dr[d] = 3 + Math.random() * 6; s.dv[d] = 0;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const bg = scratch(api, 'buf');
      const g = s.bufCtx;
      // The street is out of focus anyway, so it is painted at a quarter of
      // the size and blown up: sixteen times fewer pixels under the gradients.
      const k = (bg.width / W) * 0.25;
      g.setTransform(k, 0, 0, k, 0, 0);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, nightOf(pal));
      sky.addColorStop(1, mixColors(nightOf(pal), pal.alert, 0.12));
      g.globalAlpha = 1;
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const base = [pal.alert, pal.user, pal.anon, '#f3d9a4'];
      const size = Math.min(W, H) * 0.09 * api.param('blur');
      for (let i = 0; i < 48; i++) {
        s.lb[i] += ((0.35 + 0.15 * Math.sin(i + api.now / 4000)) - s.lb[i]) * dt * 0.0002;
        glow(g, s.lx[i] * W, s.ly[i] * H, size * s.lr[i], s.lc[i] || base[i % 4], 0.7 * s.lb[i]);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      ctx.drawImage(bg, 0, 0, Math.max(1, Math.round(bg.width * 0.25)), Math.max(1, Math.round(bg.height * 0.25)), 0, 0, W, H);
      // The drops: the big ones slide, the small ones stay put.
      const n = Math.round(api.param('drops'));
      const rim = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < n; i++) {
        if (s.dr[i] > 5.2) s.dv[i] += dt * 0.0000009 * s.dr[i];
        s.dy[i] += s.dv[i] * dt;
        s.dx[i] += noise2(i, api.now / 800) * s.dv[i] * dt * 0.3;
        if (s.dy[i] > 1.05) { s.dy[i] = -0.02; s.dx[i] = Math.random(); s.dr[i] = 1.5 + Math.random() * Math.random() * 7; s.dv[i] = 0; }
        const x = s.dx[i] * W;
        const y = s.dy[i] * H;
        const r = s.dr[i];
        // The street, seen through the drop: upside down and small.
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 1.12, 0, 0, TAU);
        ctx.clip();
        const span = r * 9;
        ctx.drawImage(bg, (x - span) * k, (y - span) * k, span * 2 * k, span * 2 * k, x - r, y + r * 1.12, r * 2, -r * 2.24);
        ctx.restore();
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(0.6, r * 0.18);
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 1.12, 0, 0.2, Math.PI - 0.2);
        ctx.stroke();
        // The glint that makes a drop a drop.
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - r * 0.4, y - r * 0.6, Math.max(1, r * 0.3), Math.max(1, r * 0.3));
        ctx.globalAlpha = 1;
        if (s.dv[i] > 0) {
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - r * 0.25, y - r * 6, r * 0.5, r * 5);
          ctx.globalAlpha = 1;
        }
      }
    },
  },

  // --- fireflies -------------------------------------------------------------------
  fireflies: {
    label: 'Fireflies',
    positional: false,
    note: 'A meadow at the edge of a wood on a warm night, and fireflies drifting over the grass, each blinking on its own rhythm. When something happens, the ones nearby fall into step and flash together, as some species really do.',
    params: {
      count: { label: 'How many', min: 10, max: 160, step: 2, default: 80 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(610);
      s.x = new Float32Array(160);
      s.y = new Float32Array(160);
      s.phase = new Float32Array(160);
      s.rate = new Float32Array(160);
      for (let i = 0; i < 160; i++) {
        s.x[i] = rnd(); s.y[i] = 0.35 + rnd() * 0.6; s.phase[i] = rnd(); s.rate[i] = 0.00025 + rnd() * 0.00025;
      }
      s.grass = rnd;
    },
    event(p, api) {
      const s = api.scene;
      const n = Math.round(api.param('count'));
      const R = Math.min(api.w, api.h) * 0.28;
      for (let i = 0; i < n; i++) {
        if (Math.hypot(s.x[i] * api.w - p.x, s.y[i] * api.h - p.y) < R) s.phase[i] = 0.02 * Math.random();
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const night = nightOf(pal);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, night);
      sky.addColorStop(1, mixColors(night, pal.user, 0.14));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // The wood line and the grass, dark shapes against a slightly lighter sky.
      const land = mixColors(night, '#000000', 0.55);
      ctx.fillStyle = land;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) ctx.lineTo(x, H * 0.34 + noise2(x * 0.01, 3) * H * 0.07 + noise2(x * 0.05, 9) * H * 0.02);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.globalAlpha = 0.65;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (let x = 0; x < W; x += 5) {
        const h = H * (0.05 + 0.07 * (0.5 + 0.5 * noise2(x * 0.08, 1)));
        const sway = noise2(x * 0.02, api.now / 3000) * 6;
        ctx.moveTo(x, H);
        ctx.quadraticCurveTo(x + sway * 0.5, H - h * 0.5, x + sway, H - h);
      }
      ctx.strokeStyle = land;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      const light = mixColors('#f6f0a0', pal.alert, 0.2);
      const n = Math.round(api.param('count'));
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        s.phase[i] += s.rate[i] * dt;
        if (s.phase[i] > 1) s.phase[i] -= 1;
        s.x[i] += noise2(i * 1.3, api.now / 5000) * dt * 0.000015;
        s.y[i] += noise2(i * 2.9, api.now / 6000) * dt * 0.000012;
        if (s.x[i] < 0) s.x[i] += 1; if (s.x[i] > 1) s.x[i] -= 1;
        s.y[i] = Math.min(0.97, Math.max(0.3, s.y[i]));
        // A flash is short and the dark between flashes is long.
        const f = s.phase[i] < 0.12 ? Math.sin((s.phase[i] / 0.12) * Math.PI) : 0;
        const x = s.x[i] * W;
        const y = s.y[i] * H;
        if (f > 0.02) glow(ctx, x, y, 16 + f * 16, light, f * 0.8);
        ctx.globalAlpha = 0.25 + f * 0.75;
        ctx.fillStyle = light;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  },

  // --- murmuration ---------------------------------------------------------------------
  murmuration: {
    label: 'Murmuration',
    positional: false,
    note: 'Starlings at dusk, thousands of them moving as one cloud that folds, thins to a ribbon and thickens again. Every event is a falcon passing through, and the wave of alarm runs across the flock.',
    params: {
      birds: { label: 'Birds', min: 300, max: 3000, step: 50, default: 1600, rebuild: true },
    },
    init(api) {
      const s = api.scene;
      const n = Math.round(api.param('birds'));
      const rnd = seeded(1839);
      s.n = n;
      s.u = new Float32Array(n);
      s.v = new Float32Array(n);
      s.j = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        s.u[i] = rnd(); s.v[i] = rnd();
        s.j[i * 2] = (rnd() - 0.5); s.j[i * 2 + 1] = (rnd() - 0.5);
      }
      s.hx = new Float32Array(6);
      s.hy = new Float32Array(6);
      s.ht = new Float32Array(6).fill(-1e9);
      s.nh = 0;
    },
    event(p, api) {
      const s = api.scene;
      const i = s.nh++ % 6;
      s.hx[i] = p.x; s.hy[i] = p.y; s.ht[i] = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.u) return;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const t = api.now / 1000;
      const dusk = ctx.createLinearGradient(0, 0, 0, H);
      const top = mixColors(pal.background, '#1b2a3a', lightnessOf(pal.background) > 0.5 ? 0.35 : 0.2);
      dusk.addColorStop(0, top);
      dusk.addColorStop(0.75, mixColors(top, pal.alert, 0.35));
      dusk.addColorStop(1, mixColors(top, '#f2c48d', 0.5));
      ctx.fillStyle = dusk;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = mixColors(top, '#000000', 0.7);
      ctx.fillRect(0, H * 0.94, W, H * 0.06);
      // The flock as a sheet in space, folding: every bird has a place on the
      // sheet, and the sheet moves, twists and is projected flat. Density
      // comes free, from the sheet turning edge-on.
      const cx = W * (0.5 + 0.22 * Math.sin(t * 0.05));
      const cy = H * (0.42 + 0.12 * Math.sin(t * 0.083));
      const span = Math.min(W, H) * 0.42;
      const twist = t * 0.11;
      const fold = Math.sin(t * 0.07) * 3.4;
      const ct = Math.cos(twist);
      const st = Math.sin(twist);
      const ink = mixColors(top, '#000000', 0.8);
      ctx.fillStyle = ink;
      ctx.beginPath();
      for (let i = 0; i < s.n; i++) {
        const u = s.u[i] * 2 - 1;
        const v = s.v[i] * 2 - 1;
        const X = u * 1.4;
        const Y = v * 0.35 * (0.3 + Math.abs(Math.cos(u * 2.1 + t * 0.09))) + Math.sin(u * fold + t * 0.2) * 0.5;
        const Z = Math.cos(u * 1.7 + v + t * 0.13) * 0.6;
        let px = cx + (X * ct - Z * st) * span + noise2(u * 3 + t * 0.2, v * 3) * span * 0.08 + s.j[i * 2] * 6;
        let py = cy + Y * span * 0.7 + s.j[i * 2 + 1] * 6;
        for (let h = 0; h < 6; h++) {
          const age = api.now - s.ht[h];
          if (age < 0 || age > 3500) continue;
          const dx = px - s.hx[h];
          const dy = py - s.hy[h];
          const d = Math.hypot(dx, dy) || 1;
          const front = (age / 3500) * span * 2;
          const k = Math.exp(-((d - front) ** 2) / (span * span * 0.04)) * (1 - age / 3500) * span * 0.12;
          px += (dx / d) * k;
          py += (dy / d) * k;
        }
        ctx.rect(px, py, 1.6, 1.6);
      }
      ctx.fill();
    },
  },

  // --- the sea at night --------------------------------------------------------------------
  seaglow: {
    label: 'Sea glow',
    positional: false,
    note: 'Waves breaking on a beach on a moonless night, and the plankton in them lighting up blue where the water is disturbed. Quiet water stays dark; every event breaks a little stretch of wave into light.',
    params: {
      waves: { label: 'Waves', min: 3, max: 9, step: 1, default: 6 },
    },
    init(api) {
      const s = api.scene;
      s.glow = new Float32Array(9 * 32);
    },
    event(p, api) {
      const s = api.scene;
      const waves = Math.round(api.param('waves'));
      const w = Math.floor(Math.random() * waves);
      const seg = Math.min(31, Math.floor((p.x / api.w) * 32));
      for (let k = -3; k <= 3; k++) {
        const j = seg + k;
        if (j >= 0 && j < 32) s.glow[w * 32 + j] = Math.min(1.4, s.glow[w * 32 + j] + 1 - Math.abs(k) * 0.25);
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const night = nightOf(pal);
      ctx.fillStyle = night;
      ctx.fillRect(0, 0, W, H);
      const sand = mixColors(night, '#3b3730', 0.4);
      ctx.fillStyle = sand;
      ctx.fillRect(0, H * 0.82, W, H * 0.18);
      const light = lighten(mixColors(pal.user, '#5fd8ff', 0.5), 0.05);
      const waves = Math.round(api.param('waves'));
      for (let w = 0; w < waves; w++) {
        // Each wave rolls in from the horizon and breaks on the sand, then
        // starts again, staggered so the beach is never empty.
        const cycle = ((api.now / 14000 + w / waves) % 1);
        const y0 = H * (0.25 + cycle * 0.58);
        const amp = H * 0.012 * (0.4 + cycle);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        const pts = [];
        for (let j = 0; j <= 32; j++) {
          const x = (j / 32) * W;
          const y = y0 + noise2(j * 0.3, w * 5 + api.now / 5000) * amp * 3;
          pts.push(x, y);
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = 0.18 + cycle * 0.25;
        ctx.strokeStyle = mixColors(night, '#ffffff', 0.18);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < 32; j++) {
          const i = w * 32 + j;
          // The wave itself stirs the plankton as it breaks.
          if (cycle > 0.85) s.glow[i] = Math.max(s.glow[i], (cycle - 0.85) * 3 * (0.5 + 0.5 * noise2(j * 0.4, w)));
          s.glow[i] *= Math.exp(-dt / 2600);
          const gl = s.glow[i];
          if (gl < 0.03) continue;
          ctx.strokeStyle = light;
          ctx.globalAlpha = Math.min(1, gl) * 0.25;
          ctx.lineWidth = 10 + gl * 10;
          ctx.beginPath();
          ctx.moveTo(pts[j * 2], pts[j * 2 + 1]);
          ctx.lineTo(pts[j * 2 + 2], pts[j * 2 + 3]);
          ctx.stroke();
          ctx.globalAlpha = Math.min(1, gl);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- light through leaves ----------------------------------------------------------------
  canopy: {
    label: 'Light through leaves',
    positional: false,
    note: 'Sunlight coming through a tree onto a path: round pools of light, each a small image of the sun, trembling as the leaves move. Events are gusts of wind in the branches.',
    params: {
      spots: { label: 'Pools of light', min: 10, max: 90, step: 2, default: 50 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(333);
      s.x = new Float32Array(90);
      s.y = new Float32Array(90);
      s.r = new Float32Array(90);
      for (let i = 0; i < 90; i++) { s.x[i] = rnd(); s.y[i] = rnd(); s.r[i] = 0.4 + rnd() * rnd(); }
      s.gust = 0;
    },
    event(p, api) {
      api.scene.gust = Math.min(1.5, api.scene.gust + 0.35);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      s.gust *= Math.exp(-Math.min(50, api.dt) / 2500);
      // Earth in the shade of a tree is warm, not grey: mixing towards a
      // neutral dark turned every palette to concrete.
      const shade = mixColors(mixColors(pal.background, pal.anon, 0.25), '#4a3b22', lightnessOf(pal.background) > 0.5 ? 0.5 : 0.3);
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      const sun = mixColors('#fff1c4', pal.alert, 0.15);
      const t = api.now / 1000;
      const wind = 0.4 + s.gust;
      ctx.globalCompositeOperation = 'lighter';
      const n = Math.round(api.param('spots'));
      const R = Math.min(W, H) * 0.09;
      for (let i = 0; i < n; i++) {
        const x = s.x[i] * W + noise2(i * 0.7, t * 0.6) * R * 0.5 * wind;
        const y = s.y[i] * H + noise2(i * 1.9, t * 0.5) * R * 0.3 * wind;
        const flicker = 0.6 + 0.4 * (0.5 + 0.5 * noise2(i * 3.1, t * 2 * wind));
        // Pinhole images of the sun are ellipses, stretched by the slope of the light.
        const r = R * s.r[i];
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, sun);
        g.addColorStop(0.6, sun);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.32 * flicker;
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1.35, 1);
        ctx.translate(-x, -y);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      // Leaf shadows moving over the light.
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const x = ((i * 0.618) % 1) * W + noise2(i, t * 0.4) * 20 * wind;
        const y = ((i * 0.377) % 1) * H + noise2(i + 50, t * 0.4) * 14 * wind;
        ctx.moveTo(x + 22, y);
        ctx.ellipse(x, y, 22, 9, i + noise2(i, t * 0.3) * wind, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },

  // --- aurora --------------------------------------------------------------------------------
  aurora: {
    label: 'Northern lights',
    positional: false,
    note: 'Curtains of light over a dark landscape, hanging in folds and moving slowly across the stars. The feed feeds the storm: busy moments brighten the curtain nearest where they fall.',
    params: {
      curtains: { label: 'Curtains', min: 1, max: 4, step: 1, default: 3 },
      height: { label: 'How tall', min: 0.3, max: 1.2, step: 0.05, default: 0.7 },
    },
    init(api) {
      const s = api.scene;
      s.bright = new Float32Array(4 * 16);
      const rnd = seeded(66);
      s.stars = new Float32Array(180 * 3);
      for (let i = 0; i < 180; i++) { s.stars[i * 3] = rnd(); s.stars[i * 3 + 1] = rnd() * 0.8; s.stars[i * 3 + 2] = rnd(); }
    },
    event(p, api) {
      const s = api.scene;
      const c = Math.floor(Math.random() * Math.round(api.param('curtains')));
      const seg = Math.min(15, Math.floor((p.x / api.w) * 16));
      for (let k = -2; k <= 2; k++) {
        const j = seg + k;
        if (j >= 0 && j < 16) s.bright[c * 16 + j] = Math.min(1, s.bright[c * 16 + j] + 0.5 - Math.abs(k) * 0.15);
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const night = nightOf(pal);
      ctx.fillStyle = night;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = mixColors(night, '#ffffff', 0.7);
      ctx.beginPath();
      for (let i = 0; i < 180; i++) {
        const z = s.stars[i * 3 + 2];
        ctx.rect(s.stars[i * 3] * W, s.stars[i * 3 + 1] * H, z > 0.9 ? 1.6 : 1, z > 0.9 ? 1.6 : 1);
      }
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      const colours = [mixColors(pal.user, '#6cf0b0', 0.35), mixColors(pal.anon, '#7ad8e8', 0.3), mixColors(pal.alert, '#f0d890', 0.3), pal.default];
      const t = api.now / 1000;
      const n = Math.round(api.param('curtains'));
      const tall = H * api.param('height');
      ctx.globalCompositeOperation = 'lighter';
      for (let c = 0; c < n; c++) {
        const base = H * (0.55 + c * 0.07);
        const col = colours[c % colours.length];
        // Rays: columns as tall as the curtain is bright there, each fading
        // upward. The fade is one small gradient drawn once per colour and
        // stretched per column; a gradient object for every column cost 11 ms,
        // and plain rectangles lost the rays and read as mist.
        const sprite = raySprite(s, col);
        const step = 3;
        for (let x = 0; x < W; x += step) {
          const j = Math.min(15, Math.floor((x / W) * 16));
          const b = s.bright[c * 16 + j];
          const y = base + noise2(x * 0.003 + c * 10, t * 0.05) * H * 0.18 + Math.sin(x * 0.004 + t * 0.1 + c) * H * 0.05;
          const ray = 0.5 + 0.5 * noise2(x * 0.05 + c * 3, t * 0.3);
          const h = tall * (0.35 + 0.65 * ray) * (0.7 + b * 0.6);
          ctx.globalAlpha = Math.min(1, (0.05 + 0.14 * ray) * (0.7 + b));
          ctx.drawImage(sprite, x, y - h, step, h);
        }
        for (let j = 0; j < 16; j++) s.bright[c * 16 + j] *= Math.exp(-dt / 5000);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = mixColors(night, '#000000', 0.6);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * 0.86 + noise2(x * 0.004, 20) * H * 0.06);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    },
  },

  // --- dunes at sunset ---------------------------------------------------------------------------
  dunes: {
    label: 'Dunes at sunset',
    positional: false,
    note: 'Sand dunes in low evening light, each ridge sharp, one face lit warm and the other in cool shadow, the whole range shifting very slowly in the wind. Events send a plume of sand off a crest.',
    params: {
      ridges: { label: 'Ridges', min: 3, max: 9, step: 1, default: 6 },
    },
    init(api) {
      const s = api.scene;
      s.px = new Float32Array(240);
      s.py = new Float32Array(240);
      s.pa = new Float32Array(240);
      s.ys = new Float32Array(97);
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      for (let k = 0; k < 24; k++) {
        const i = s.next++ % 240;
        s.px[i] = p.x + (Math.random() - 0.5) * 30;
        s.py[i] = p.y + (Math.random() - 0.5) * 10;
        s.pa[i] = 1;
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const warm = mixColors(pal.alert, '#f0a860', 0.35);
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      sky.addColorStop(0, mixColors(pal.background, '#2b3446', lightnessOf(pal.background) > 0.5 ? 0.3 : 0.1));
      sky.addColorStop(1, mixColors(warm, '#f7dcb0', 0.4));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      glow(ctx, W * 0.72, H * 0.36, Math.min(W, H) * 0.3, mixColors('#fff0cc', warm, 0.3), 0.6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff4dc';
      ctx.beginPath();
      ctx.arc(W * 0.72, H * 0.36, Math.min(W, H) * 0.045, 0, TAU);
      ctx.fill();
      const n = Math.round(api.param('ridges'));
      const t = api.now / 60000;
      const lit0 = mixColors(warm, '#f3cf9c', 0.45);
      const shade0 = mixColors(pal.anon, '#5a4250', 0.6);
      const haze = mixColors('#f2d9b8', warm, 0.25);
      const steps = 96;
      for (let r = 0; r < n; r++) {
        const depth = n === 1 ? 1 : r / (n - 1);
        const far = 1 - depth;
        const horizon = H * (0.5 + depth * 0.42);
        const amp = H * (0.05 + depth * 0.13);
        const lit = mixColors(lit0, haze, far * 0.6);
        const shade = mixColors(shade0, haze, far * 0.7);
        for (let k = 0; k <= steps; k++) {
          const x = (k / steps) * W;
          // A dune has a long windward slope and a short steep slip face: a
          // sawtooth, softened by noise, drifting with the wind.
          const phase = x / (W * (0.22 + far * 0.2)) + r * 1.7 + t;
          const saw = phase - Math.floor(phase);
          const rise = saw < 0.72 ? saw / 0.72 : (1 - saw) / 0.28;
          const shape = rise * rise * (3 - 2 * rise);
          s.ys[k] = horizon - amp * (0.3 + 0.7 * shape * (0.75 + 0.25 * noise2(phase * 0.5, r)));
        }
        // Each ridge is one flat layer, paler the further off it is, with a
        // bright rim where the low sun catches the crest. Three attempts at
        // shading the slip faces -- columns, wedges, crescents -- read as
        // blinds, fins and curtains; the layering alone reads as distance.
        ctx.fillStyle = mixColors(mixColors(lit, shade, 0.2 + depth * 0.35), haze, far * 0.45);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let k = 0; k <= steps; k++) ctx.lineTo((k / steps) * W, s.ys[k]);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = lighten(lit, 0.1);
        ctx.lineWidth = 1.2 + depth;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          if (k === 0) ctx.moveTo(0, s.ys[0]);
          else ctx.lineTo((k / steps) * W, s.ys[k]);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = '#f7e4c4';
      for (let i = 0; i < 240; i++) {
        if (s.pa[i] <= 0) continue;
        s.px[i] -= dt * 0.05 * s.pa[i];
        s.py[i] -= dt * 0.004;
        s.pa[i] -= dt / 3000;
        ctx.globalAlpha = Math.max(0, s.pa[i]) * 0.5;
        ctx.fillRect(s.px[i], s.py[i], 2, 1);
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- a city from the air ---------------------------------------------------------------------------
  nightflight: {
    label: 'City from the air',
    positional: false,
    note: "A city seen from a plane at night: the grid of streets picked out in sodium orange, brighter along the avenues, the dark of a river and parks between, all sliding slowly beneath. Events are headlights moving along a street.",
    params: {
      speed: { label: 'Speed of the plane', min: 0, max: 2, step: 0.05, default: 0.6 },
    },
    init(api) {
      const s = api.scene;
      s.ox = 0;
      s.cx = new Float32Array(60);
      s.cy = new Float32Array(60);
      s.cv = new Float32Array(60);
      s.ca = new Float32Array(60);
      s.horiz = new Uint8Array(60);
      s.nc = 0;
      s.built = '';
    },
    event(p, api) {
      const s = api.scene;
      const i = s.nc++ % 60;
      const step = Math.max(16, Math.min(api.w, api.h) / 18);
      s.horiz[i] = Math.random() < 0.5 ? 1 : 0;
      s.cx[i] = s.horiz[i] ? p.x : Math.round(p.x / step) * step;
      s.cy[i] = s.horiz[i] ? Math.round(p.y / step) * step : p.y;
      s.cv[i] = (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.05);
      s.ca[i] = 1;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const cv = scratch(api, 'buf');
      const g = s.bufCtx;
      const key = `${cv.width}x${cv.height}:${pal.background}:${pal.alert}`;
      const step = Math.max(16, Math.min(W, H) / 18);
      if (s.built !== key) {
        // The city is laid out once per size, wrapping left to right, so it can
        // slide forever without a seam.
        s.built = key;
        const k = cv.width / W;
        g.setTransform(k, 0, 0, k, 0, 0);
        g.fillStyle = mixColors(nightOf(pal), '#000000', 0.5);
        g.fillRect(0, 0, W, H);
        const rnd = seeded(1969);
        const sodium = mixColors('#ffb347', pal.alert, 0.2);
        const white = '#fff6e0';
        g.fillStyle = sodium;
        const riverY = (x) => H * 0.62 + Math.sin((x / W) * TAU) * H * 0.08;
        const parks = [[rnd() * W, rnd() * H * 0.5, 0.12], [rnd() * W, H * 0.8, 0.09]];
        const dark = (x, y) => Math.abs(y - riverY(x)) < H * 0.035 ||
          parks.some(([px, py, r]) => Math.hypot(((x - px + W * 1.5) % W) - W / 2, y - py) < r * W);
        for (let y = 0; y <= H; y += step) {
          const avenue = rnd() < 0.2;
          for (let x = 0; x < W; x += step / 5) {
            if (dark(x, y) || rnd() < 0.12) continue;
            g.globalAlpha = avenue ? 0.95 : 0.35 + rnd() * 0.4;
            g.fillStyle = avenue && rnd() < 0.3 ? white : sodium;
            g.fillRect(x + (rnd() - 0.5), y + (rnd() - 0.5) * 2, avenue ? 2 : 1.4, avenue ? 2 : 1.4);
          }
        }
        for (let x = 0; x < W; x += step) {
          const avenue = rnd() < 0.2;
          for (let y = 0; y <= H; y += step / 5) {
            if (dark(x, y) || rnd() < 0.12) continue;
            g.globalAlpha = avenue ? 0.95 : 0.3 + rnd() * 0.4;
            g.fillStyle = sodium;
            g.fillRect(x + (rnd() - 0.5) * 2, y + (rnd() - 0.5), avenue ? 2 : 1.4, avenue ? 2 : 1.4);
          }
        }
        g.globalAlpha = 1;
      }
      s.ox = (s.ox + dt * 0.012 * api.param('speed')) % W;
      ctx.drawImage(cv, -s.ox, 0, W, H);
      ctx.drawImage(cv, W - s.ox, 0, W, H);
      // A soft glow over the brightest districts, as city light scatters in the air.
      glow(ctx, (W * 0.3 - s.ox + W) % W, H * 0.35, Math.min(W, H) * 0.5, mixColors('#ffb347', pal.alert, 0.3), 0.12);
      glow(ctx, (W * 0.8 - s.ox + W) % W, H * 0.3, Math.min(W, H) * 0.4, mixColors('#ffb347', pal.alert, 0.3), 0.1);
      ctx.globalAlpha = 1;
      // Headlights, moving with the ground as well as along their street.
      ctx.fillStyle = '#fffbe8';
      for (let i = 0; i < 60; i++) {
        if (s.ca[i] <= 0) continue;
        s.ca[i] -= dt / 9000;
        if (s.horiz[i]) s.cx[i] += s.cv[i] * dt; else s.cy[i] += s.cv[i] * dt;
        const x = (((s.cx[i] - s.ox) % W) + W) % W;
        ctx.globalAlpha = Math.max(0, s.ca[i]);
        ctx.fillRect(x - 1, s.cy[i] - 1, 2.4, 2.4);
      }
      ctx.globalAlpha = 1;
      // Cloud passing under the wing.
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = mixColors(nightOf(pal), '#8a8f99', 0.5);
      ctx.beginPath();
      const t = api.now / 1000;
      for (let i = 0; i < 12; i++) {
        const x = ((i * 0.37 * W - s.ox * 1.6) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
        const y = H * (0.2 + ((i * 0.53) % 0.7));
        const r = Math.min(W, H) * (0.08 + 0.05 * noise2(i, t * 0.05));
        ctx.moveTo(x + r, y);
        ctx.ellipse(x, y, r * 2.4, r, 0, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  },

  // --- distant fireworks ------------------------------------------------------------------------------
  fireworks: {
    label: 'Distant fireworks',
    positional: false,
    note: 'Fireworks over a town across the water, far enough away that they are small and silent until the sound arrives: bursts that open, droop and fade, and their reflections trembling in the bay. Each event is one shell.',
    params: {
      sparks: { label: 'Sparks per shell', min: 20, max: 120, step: 5, default: 60 },
    },
    init(api) {
      const s = api.scene;
      const N = 24 * 120;
      s.x = new Float32Array(N);
      s.y = new Float32Array(N);
      s.vx = new Float32Array(N);
      s.vy = new Float32Array(N);
      s.born = new Float32Array(24).fill(-1e9);
      s.count = new Uint8Array(24);
      s.ink = new Array(24).fill('');
      s.next = 0;
    },
    event(p, api) {
      const s = api.scene;
      const k = s.next++ % 24;
      const n = Math.round(api.param('sparks'));
      const bx = p.x;
      const by = api.h * (0.12 + (p.y / api.h) * 0.4);
      const speed = Math.min(api.w, api.h) * (0.0001 + Math.random() * 0.00008);
      for (let i = 0; i < n; i++) {
        const j = k * 120 + i;
        const a = (i / n) * TAU + Math.random() * 0.2;
        const v = speed * (0.7 + Math.random() * 0.3);
        s.x[j] = bx; s.y[j] = by; s.vx[j] = Math.cos(a) * v; s.vy[j] = Math.sin(a) * v;
      }
      s.count[k] = n;
      s.born[k] = api.now;
      s.ink[k] = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const cv = scratch(api, 'buf');
      const g = s.bufCtx;
      const k = cv.width / W;
      g.setTransform(k, 0, 0, k, 0, 0);
      const night = nightOf(pal);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = night;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 24; b++) {
        const age = api.now - s.born[b];
        if (age < 0 || age > 3200 || !s.count[b]) continue;
        const fade = 1 - age / 3200;
        const col = lighten(s.ink[b] || pal.alert, 0.15);
        g.strokeStyle = col;
        g.lineWidth = 1.8;
        g.globalAlpha = Math.min(1, fade * 1.3);
        g.beginPath();
        for (let i = 0; i < s.count[b]; i++) {
          const j = b * 120 + i;
          const ox = s.x[j];
          const oy = s.y[j];
          s.vy[j] += dt * 0.0000012 * Math.min(W, H) * 0.01;
          s.vx[j] *= Math.exp(-dt / 1400);
          s.vy[j] *= Math.exp(-dt / 1400);
          s.x[j] += s.vx[j] * dt;
          s.y[j] += s.vy[j] * dt;
          g.moveTo(ox, oy);
          g.lineTo(s.x[j] + (s.x[j] - ox) * 3, s.y[j] + (s.y[j] - oy) * 3);
        }
        g.stroke();
        if (age < 250) glow(g, s.x[b * 120], s.y[b * 120], Math.min(W, H) * 0.12, col, (1 - age / 250) * 0.4);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      const shore = H * 0.72;
      ctx.drawImage(cv, 0, 0, cv.width, shore * k, 0, 0, W, shore);
      // The far shore: a low line of hills and a few lit windows.
      ctx.fillStyle = mixColors(night, '#000000', 0.6);
      ctx.beginPath();
      ctx.moveTo(0, shore);
      for (let x = 0; x <= W; x += 14) ctx.lineTo(x, shore - H * 0.02 - Math.abs(noise2(x * 0.006, 4)) * H * 0.07);
      ctx.lineTo(W, shore);
      ctx.closePath();
      ctx.fill();
      // The bay: the sky upside down, dimmer, and broken into ripples.
      ctx.fillStyle = mixColors(night, '#000000', 0.3);
      ctx.fillRect(0, shore, W, H - shore);
      const bands = 26;
      const bh = (H - shore) / bands;
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < bands; i++) {
        const wobble = noise2(i * 0.9, api.now / 700) * 6 * (1 + i / bands);
        const sy = shore - (i + 1) * ((shore * 0.6) / bands);
        ctx.drawImage(cv, 0, sy * k, cv.width, ((shore * 0.6) / bands) * k, wobble, shore + i * bh, W, bh + 0.5);
      }
      ctx.globalAlpha = 1;
    },
  },
};
