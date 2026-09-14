// Air and night: things that float, rise and fall.
//
// Lanterns let go over a lake, jellyfish in deep water, soap bubbles, snow
// past lit windows, and a forest cut from paper and set in layers. Each keeps
// a small fixed population and lets the feed disturb it -- a lantern released,
// a pulse through a jellyfish, a breath that blows a bubble, a light switched
// on, a bird sent across.
//
// Fixed, typed collections; offscreen work only on the shared 'layer' buffer.

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
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export const AIR_SCENES = {
  // --- lanterns on the lake ------------------------------------------------------------
  lanterns: {
    label: 'Lanterns on the lake',
    positional: false,
    note: 'Paper lanterns let go from the edge of a lake at night, rising slowly and swaying as they go, getting smaller until each is one more star, their light lying in the water beneath them. Each event lets one go.',
    params: {
      drift: { label: 'How much the air moves', min: 0, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1123);
      s.x = new Float32Array(48);
      s.y = new Float32Array(48);
      s.vy = new Float32Array(48);
      s.ph = new Float32Array(48);
      s.size = new Float32Array(48);
      s.on = new Uint8Array(48);
      s.ink = new Array(48).fill('');
      const horizon = api.h * 0.62;
      for (let i = 0; i < 8; i++) {
        s.x[i] = rnd() * api.w;
        s.y[i] = horizon * (0.15 + rnd() * 0.8);
        s.vy[i] = 0.012 + rnd() * 0.01;
        s.ph[i] = rnd() * TAU;
        s.size[i] = 10 + rnd() * 6;
        s.on[i] = 1;
      }
      s.next = 8;
      s.stars = new Float32Array(150 * 3);
      for (let i = 0; i < 150; i++) {
        s.stars[i * 3] = rnd();
        s.stars[i * 3 + 1] = rnd() * 0.6;
        s.stars[i * 3 + 2] = rnd();
      }
    },
    event(p, api) {
      const s = api.scene;
      const i = s.next++ % 48;
      s.x[i] = p.x;
      s.y[i] = api.h * 0.62 - 4;
      s.vy[i] = 0.014 + Math.random() * 0.012;
      s.ph[i] = Math.random() * TAU;
      s.size[i] = 10 + Math.min(10, p.r * 0.08);
      s.on[i] = 1;
      s.ink[i] = mixColors('#ffb347', p.color, 0.3);
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const t = api.now / 1000;
      const horizon = H * 0.62;
      const night = nightOf(pal);
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, night);
      sky.addColorStop(1, mixColors(night, '#5a4035', 0.35));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);
      ctx.fillStyle = mixColors(night, '#ffffff', 0.7);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let i = 0; i < 150; i++) ctx.rect(s.stars[i * 3] * W, s.stars[i * 3 + 1] * horizon, s.stars[i * 3 + 2] > 0.9 ? 1.6 : 1, s.stars[i * 3 + 2] > 0.9 ? 1.6 : 1);
      ctx.fill();
      ctx.globalAlpha = 1;
      const lake = ctx.createLinearGradient(0, horizon, 0, H);
      lake.addColorStop(0, mixColors(night, '#3a2e2a', 0.25));
      lake.addColorStop(1, mixColors(night, '#000000', 0.45));
      ctx.fillStyle = lake;
      ctx.fillRect(0, horizon, W, H - horizon);
      ctx.fillStyle = mixColors(night, '#000000', 0.6);
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= W; x += 14) ctx.lineTo(x, horizon - 2 - Math.abs(noise2(x * 0.005, 7)) * H * 0.06);
      ctx.lineTo(W, horizon + 1);
      ctx.lineTo(0, horizon + 1);
      ctx.closePath();
      ctx.fill();
      const drift = api.param('drift');
      const base = [mixColors('#ffb347', pal.alert, 0.25), mixColors('#ffcf73', pal.user, 0.15), '#ff9f5a'];
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 48; i++) {
        if (!s.on[i]) continue;
        // Higher is further away: slower, smaller.
        const far = Math.max(0, Math.min(1, s.y[i] / horizon));
        const k = 0.22 + 0.78 * far;
        s.y[i] -= s.vy[i] * dt * (0.35 + 0.65 * far);
        s.x[i] += (Math.sin(t * 0.6 + s.ph[i]) * 0.006 + noise2(i * 0.7, t * 0.05) * 0.012) * dt * drift * k;
        if (s.y[i] < -30) { s.on[i] = 0; continue; }
        const colour = s.ink[i] || base[i % 3];
        const flicker = 0.85 + 0.15 * Math.sin(t * 7 + s.ph[i] * 3);
        const sz = s.size[i] * k;
        if (k > 0.3) glow(ctx, s.x[i], s.y[i], sz * 3.4, colour, 0.32 * flicker);
        ctx.globalAlpha = 0.9 * flicker;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(s.x[i] - sz * 0.45, s.y[i] - sz * 0.6);
        ctx.lineTo(s.x[i] + sz * 0.45, s.y[i] - sz * 0.6);
        ctx.lineTo(s.x[i] + sz * 0.55, s.y[i] + sz * 0.6);
        ctx.lineTo(s.x[i] - sz * 0.55, s.y[i] + sz * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff2c4';
        ctx.beginPath();
        ctx.ellipse(s.x[i], s.y[i] + sz * 0.5, sz * 0.4, sz * 0.14, 0, 0, TAU);
        ctx.fill();
        // Its light on the lake: a broken column that wobbles.
        const ry = horizon + (horizon - s.y[i]) * 0.28;
        if (ry < H) {
          ctx.fillStyle = colour;
          for (let q = 0; q < 3; q++) {
            const yy = ry + q * sz * 0.6;
            if (yy > H) break;
            ctx.globalAlpha = 0.24 * k * (1 - q / 3) * flicker;
            const wob = Math.sin(t * 2 + q + s.ph[i]) * sz * 0.4;
            ctx.beginPath();
            ctx.ellipse(s.x[i] + wob, yy, sz * (0.9 - q * 0.1), Math.max(0.8, sz * 0.09), 0, 0, TAU);
            ctx.fill();
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  },

  // --- jellyfish ---------------------------------------------------------------------------
  jellyfish: {
    label: 'Jellyfish',
    positional: false,
    note: 'Jellyfish drifting in deep water and lit from inside: each bell closes to push itself upward and opens again, trailing its threads behind it. Events send a pulse through the nearest one and make it glow.',
    params: {
      count: { label: 'How many', min: 3, max: 14, step: 1, default: 7, rebuild: true },
    },
    init(api) {
      const s = api.scene;
      const n = Math.round(api.param('count'));
      const rnd = seeded(1758);
      s.n = n;
      s.x = new Float32Array(n);
      s.y = new Float32Array(n);
      s.vx = new Float32Array(n);
      s.vy = new Float32Array(n);
      s.size = new Float32Array(n);
      s.ph = new Float32Array(n);
      s.rate = new Float32Array(n);
      s.glow = new Float32Array(n);
      s.ink = new Array(n).fill('');
      const U = Math.min(api.w, api.h);
      for (let i = 0; i < n; i++) {
        s.x[i] = rnd() * api.w;
        s.y[i] = api.h * (0.35 + rnd() * 0.55);
        s.size[i] = U * (0.05 + rnd() * 0.06);
        s.ph[i] = rnd();
        s.rate[i] = 0.8 + rnd() * 0.5;
      }
      s.snow = new Float32Array(160 * 3);
      for (let i = 0; i < 160; i++) {
        s.snow[i * 3] = rnd();
        s.snow[i * 3 + 1] = rnd();
        s.snow[i * 3 + 2] = rnd();
      }
    },
    event(p, api) {
      const s = api.scene;
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < s.n; i++) {
        const d = Math.hypot(s.x[i] - p.x, s.y[i] - p.y);
        if (d < bd) { bd = d; best = i; }
      }
      s.glow[best] = 1;
      s.ph[best] = Math.floor(s.ph[best]) + 0.98;
      s.ink[best] = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const t = api.now / 1000;
      const deep = mixColors(pal.background, '#04182a', lightnessOf(pal.background) > 0.5 ? 0.88 : 0.55);
      const sea = ctx.createLinearGradient(0, 0, 0, H);
      sea.addColorStop(0, lighten(deep, 0.07));
      sea.addColorStop(1, lighten(deep, -0.04));
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, W, H);
      // Light from far above, in faint shafts.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,190,210,0.03)';
      for (let k = 0; k < 3; k++) {
        const x0 = W * (0.2 + k * 0.3) + Math.sin(t * 0.1 + k) * W * 0.05;
        ctx.beginPath();
        ctx.moveTo(x0 - W * 0.03, 0);
        ctx.lineTo(x0 + W * 0.03, 0);
        ctx.lineTo(x0 + W * 0.12, H);
        ctx.lineTo(x0 - W * 0.02, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // Marine snow, rising slowly past.
      ctx.fillStyle = 'rgba(210,230,235,0.35)';
      ctx.beginPath();
      for (let i = 0; i < 160; i++) {
        s.snow[i * 3 + 1] -= dt * 0.000008 * (0.5 + s.snow[i * 3 + 2]);
        if (s.snow[i * 3 + 1] < 0) s.snow[i * 3 + 1] += 1;
        const z = s.snow[i * 3 + 2];
        ctx.rect(s.snow[i * 3] * W, s.snow[i * 3 + 1] * H, 0.8 + z * 1.2, 0.8 + z * 1.2);
      }
      ctx.fill();
      const base = [pal.user, pal.anon, pal.alert];
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < s.n; i++) {
        s.ph[i] += dt * 0.00055 * s.rate[i];
        const cycle = s.ph[i] % 1;
        // A pulse: the bell closes quickly and opens slowly.
        const c = cycle < 0.3 ? Math.sin((cycle / 0.3) * Math.PI) : 0;
        if (cycle < 0.3) s.vy[i] -= s.size[i] * 0.0000025 * dt * c;
        s.vy[i] = s.vy[i] * Math.exp(-dt / 1400) + 0.000006 * dt;
        s.vx[i] = s.vx[i] * Math.exp(-dt / 2000) + noise2(i * 1.7, t * 0.05) * 0.000004 * dt;
        s.x[i] += s.vx[i] * dt;
        s.y[i] += s.vy[i] * dt;
        const sz = s.size[i];
        if (s.y[i] < -sz * 4) s.y[i] = H + sz * 1.5;
        if (s.y[i] > H + sz * 5) s.y[i] = -sz * 3;
        if (s.x[i] < -sz * 2) s.x[i] = W + sz * 2;
        if (s.x[i] > W + sz * 2) s.x[i] = -sz * 2;
        s.glow[i] *= Math.exp(-dt / 2500);
        const colour = mixColors(s.ink[i] || base[i % 3], '#ffffff', 0.35);
        const x = s.x[i];
        const y = s.y[i];
        const w = sz * (1 - 0.22 * c);
        const hgt = sz * (0.75 + 0.18 * c);
        glow(ctx, x, y - hgt * 0.3, w * 2.6, colour, 0.1 + s.glow[i] * 0.3);
        // Threads first, so the bell sits over their roots.
        ctx.globalAlpha = 0.3 + s.glow[i] * 0.3;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const len = sz * 2.8 * (1 + 0.1 * c);
        for (let q = 0; q < 7; q++) {
          const bx = x - w * 0.8 + (q * 1.6 * w) / 6;
          ctx.moveTo(bx, y);
          for (let j = 1; j <= 12; j++) {
            const yy = y + (j * len) / 12;
            ctx.lineTo(bx + Math.sin(j * 0.55 - s.ph[i] * TAU + q) * j * 0.8, yy);
          }
        }
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.25 + s.glow[i] * 0.25;
        ctx.beginPath();
        for (let q = 0; q < 2; q++) {
          const bx = x + (q ? 1 : -1) * w * 0.2;
          ctx.moveTo(bx, y);
          for (let j = 1; j <= 10; j++) ctx.lineTo(bx + Math.sin(j * 0.7 - s.ph[i] * TAU * 0.7 + q * 2) * j * 0.6, y + (j * len * 0.55) / 10);
        }
        ctx.stroke();
        // The bell: a dome over a scalloped rim, lit from within.
        const lit = ctx.createRadialGradient(x, y - hgt * 0.45, 0, x, y - hgt * 0.3, w * 1.3);
        lit.addColorStop(0, colour);
        lit.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.6 + s.glow[i] * 0.4;
        ctx.fillStyle = lit;
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.bezierCurveTo(x - w, y - hgt * 1.35, x + w, y - hgt * 1.35, x + w, y);
        ctx.quadraticCurveTo(x, y + hgt * 0.22, x - w, y);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  },

  // --- soap bubbles --------------------------------------------------------------------------
  bubbles: {
    label: 'Soap bubbles',
    positional: false,
    note: 'Soap bubbles drifting across a soft light, their skins swirling with colour where the film is thinnest, until each one wobbles and is gone. Events blow a new bubble where they land.',
    params: {
      size: { label: 'Size', min: 0.4, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1665);
      s.x = new Float32Array(36);
      s.y = new Float32Array(36);
      s.r = new Float32Array(36);
      s.vx = new Float32Array(36);
      s.vy = new Float32Array(36);
      s.born = new Float32Array(36).fill(-1e9);
      s.life = new Float32Array(36);
      s.seed = new Float32Array(36);
      const U = Math.min(api.w, api.h);
      for (let i = 0; i < 10; i++) {
        s.x[i] = rnd() * api.w;
        s.y[i] = rnd() * api.h;
        s.r[i] = U * (0.03 + rnd() * 0.06);
        s.vx[i] = (rnd() - 0.5) * 0.02;
        s.vy[i] = -0.005 - rnd() * 0.015;
        s.born[i] = api.now - rnd() * 6000;
        s.life[i] = 9000 + rnd() * 9000;
        s.seed[i] = rnd() * TAU;
      }
      s.next = 10;
    },
    event(p, api) {
      const s = api.scene;
      const i = s.next++ % 36;
      s.x[i] = p.x;
      s.y[i] = p.y;
      s.r[i] = (14 + Math.min(60, p.r * 0.6)) * api.param('size');
      s.vx[i] = (Math.random() - 0.5) * 0.03;
      s.vy[i] = -0.008 - Math.random() * 0.02;
      s.born[i] = api.now;
      s.life[i] = 8000 + Math.random() * 10000;
      s.seed[i] = Math.random() * TAU;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const t = api.now / 1000;
      const light = lightnessOf(pal.background) > 0.5;
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, light ? mixColors(pal.background, '#ffffff', 0.35) : mixColors(pal.background, '#1b2430', 0.3));
      bg.addColorStop(1, light ? mixColors(pal.background, pal.user, 0.12) : mixColors(pal.background, pal.anon, 0.14));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 36; i++) {
        const age = api.now - s.born[i];
        const life = s.life[i];
        if (age < 0 || age > life + 260) continue;
        s.x[i] += (s.vx[i] + noise2(i * 0.9, t * 0.1) * 0.012) * dt;
        s.y[i] += s.vy[i] * dt;
        const x = s.x[i];
        const y = s.y[i];
        const r = s.r[i];
        if (age > life) {
          // Gone: a faint ring and a few droplets flung outward.
          const u = (age - life) / 260;
          ctx.globalAlpha = (1 - u) * 0.5;
          ctx.strokeStyle = light ? '#6f8a96' : '#dfeef2';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let q = 0; q < 10; q++) {
            const a = (q / 10) * TAU + s.seed[i];
            ctx.moveTo(x + Math.cos(a) * r * (1 + u * 0.3), y + Math.sin(a) * r * (1 + u * 0.3));
            ctx.lineTo(x + Math.cos(a) * r * (1.15 + u * 0.5), y + Math.sin(a) * r * (1.15 + u * 0.5));
          }
          ctx.stroke();
          continue;
        }
        const wob = 1 + 0.03 * Math.sin(t * 3 + s.seed[i]);
        const fadeIn = Math.min(1, age / 400);
        // The film: teal, gold and coral, never a blue beside a red, which is
        // where a gradient passes through violet.
        const a0 = s.seed[i] + t * 0.3;
        const film = ctx.createLinearGradient(x + Math.cos(a0) * r, y + Math.sin(a0) * r, x - Math.cos(a0) * r, y - Math.sin(a0) * r);
        film.addColorStop(0, 'rgba(120,220,210,0.6)');
        film.addColorStop(0.35, 'rgba(255,215,120,0.55)');
        film.addColorStop(0.65, 'rgba(255,160,140,0.5)');
        film.addColorStop(1, 'rgba(120,220,210,0.6)');
        ctx.globalAlpha = fadeIn;
        const inner = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
        inner.addColorStop(0, 'rgba(255,255,255,0)');
        inner.addColorStop(1, light ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)');
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.ellipse(x, y, r * wob, r / wob, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = film;
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.stroke();
        // A band of colour swirling round the skin.
        ctx.globalAlpha = 0.3 * fadeIn;
        ctx.lineWidth = Math.max(1.5, r * 0.12);
        ctx.beginPath();
        ctx.ellipse(x, y, r * wob * 0.9, (r / wob) * 0.9, 0, a0, a0 + 1.6);
        ctx.stroke();
        ctx.globalAlpha = 0.75 * fadeIn;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.16, r * 0.08, -0.6, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.3 * fadeIn;
        ctx.beginPath();
        ctx.ellipse(x + r * 0.42, y + r * 0.4, r * 0.08, r * 0.04, -0.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- snow on the city -----------------------------------------------------------------------
  snowfall: {
    label: 'Snow on the city',
    positional: false,
    note: 'Snow falling past the windows of a city at night, thickest close by, settling on the roofs a little more every minute. Events switch a light on somewhere, or off, and the wind catches the snow for a moment.',
    params: {
      snow: { label: 'How hard it snows', min: 0.2, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1947);
      s.N = 900;
      s.fx = new Float32Array(s.N);
      s.fy = new Float32Array(s.N);
      s.fz = new Float32Array(s.N);
      s.fp = new Float32Array(s.N);
      for (let i = 0; i < s.N; i++) {
        s.fx[i] = rnd();
        s.fy[i] = rnd();
        s.fz[i] = rnd();
        s.fp[i] = rnd() * TAU;
      }
      s.roofs = new Float32Array(64 * 3);
      s.nroofs = 0;
      s.wx = new Float32Array(1200);
      s.wy = new Float32Array(1200);
      s.ww = new Float32Array(1200);
      s.wh = new Float32Array(1200);
      s.won = new Uint8Array(1200);
      s.nw = 0;
      s.built = '';
      s.settle = 0;
      s.wind = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.nw) return;
      for (let tries = 0; tries < 12; tries++) {
        const i = Math.floor(Math.random() * s.nw);
        if (Math.abs(s.wx[i] - p.x) < 90) {
          s.won[i] = s.won[i] ? 0 : 1;
          break;
        }
      }
      s.wind += (Math.random() - 0.5) * 0.04;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const t = api.now / 1000;
      const night = nightOf(pal);
      const ground = H * 0.94;
      const layer = scratch(api, 'layer');
      const lg = s.layerCtx;
      const key = `${layer.width}x${layer.height}:${pal.background}`;
      const silhouette = mixColors(night, '#000000', 0.55);
      if (s.built !== key) {
        const k = layer.width / W;
        lg.setTransform(k, 0, 0, k, 0, 0);
        lg.clearRect(0, 0, W, H);
        const rnd = seeded(8);
        lg.fillStyle = silhouette;
        s.nroofs = 0;
        s.nw = 0;
        let x = -10;
        while (x < W + 10 && s.nroofs < 64) {
          const bw = 30 + rnd() * 70;
          const top = ground - H * (0.12 + rnd() * 0.36);
          lg.fillRect(x, top, bw, ground - top);
          s.roofs[s.nroofs * 3] = x;
          s.roofs[s.nroofs * 3 + 1] = x + bw;
          s.roofs[s.nroofs * 3 + 2] = top;
          s.nroofs++;
          for (let wy = top + 8; wy < ground - 12; wy += 14) {
            for (let wx = x + 6; wx < x + bw - 10; wx += 11) {
              if (s.nw >= 1200) break;
              s.wx[s.nw] = wx;
              s.wy[s.nw] = wy;
              s.ww[s.nw] = 5;
              s.wh[s.nw] = 7;
              s.won[s.nw] = rnd() < 0.3 ? 1 : 0;
              s.nw++;
            }
          }
          x += bw + 2 + rnd() * 8;
        }
        lg.fillRect(0, ground, W, H - ground);
        s.built = key;
      }
      const sky = ctx.createLinearGradient(0, 0, 0, ground);
      sky.addColorStop(0, night);
      sky.addColorStop(1, mixColors(night, '#6a4a3a', 0.3));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // Far snow first, behind the buildings.
      const snow = api.param('snow');
      s.wind *= Math.exp(-dt / 3000);
      const layerOf = (z) => (z < 0.33 ? 0 : z < 0.7 ? 1 : 2);
      const flakes = (which) => {
        ctx.beginPath();
        for (let i = 0; i < s.N; i++) {
          const z = s.fz[i];
          if (layerOf(z) !== which) continue;
          const sz = 0.8 + z * 2.6;
          ctx.moveTo(s.fx[i] * W + sz, s.fy[i] * H);
          ctx.arc(s.fx[i] * W, s.fy[i] * H, sz, 0, TAU);
        }
        ctx.globalAlpha = which === 0 ? 0.45 : which === 1 ? 0.7 : 0.9;
        ctx.fillStyle = '#f4f7fa';
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      for (let i = 0; i < s.N; i++) {
        const z = s.fz[i];
        s.fy[i] += ((0.00002 + 0.00007 * z) * snow * dt * 1000) / H;
        s.fx[i] += ((Math.sin(t * 0.8 + s.fp[i]) * 0.008 * z + s.wind) * dt) / W;
        if (s.fy[i] > 1.02) { s.fy[i] = -0.02; s.fx[i] = Math.random(); }
        if (s.fx[i] > 1.02) s.fx[i] -= 1.04;
        if (s.fx[i] < -0.02) s.fx[i] += 1.04;
      }
      flakes(0);
      ctx.drawImage(layer, 0, 0, W, H);
      const warm = mixColors('#ffd68a', pal.alert, 0.2);
      ctx.fillStyle = warm;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i < s.nw; i++) if (s.won[i]) ctx.rect(s.wx[i], s.wy[i], s.ww[i], s.wh[i]);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = mixColors(silhouette, '#ffffff', 0.08);
      ctx.beginPath();
      for (let i = 0; i < s.nw; i++) if (!s.won[i]) ctx.rect(s.wx[i], s.wy[i], s.ww[i], s.wh[i]);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Snow settling on the roofs and the ground.
      s.settle = Math.min(1, s.settle + (dt / 240000) * snow);
      const thick = 1.5 + 4 * s.settle;
      ctx.fillStyle = '#eef2f5';
      ctx.beginPath();
      for (let r = 0; r < s.nroofs; r++) ctx.rect(s.roofs[r * 3], s.roofs[r * 3 + 2] - thick, s.roofs[r * 3 + 1] - s.roofs[r * 3], thick);
      ctx.rect(0, ground - thick * 0.6, W, thick + 2);
      ctx.fill();
      flakes(1);
      flakes(2);
    },
  },

  // --- paper forest --------------------------------------------------------------------------------
  paperforest: {
    label: 'Paper forest',
    positional: false,
    note: 'A forest cut from paper and set in layers like a toy theatre, palest at the back, each layer casting a soft shadow on the one behind; the trees lean a little when the wind moves. Events send a paper bird across.',
    params: {
      layers: { label: 'Layers', min: 3, max: 7, step: 1, default: 5, rebuild: true },
    },
    init(api) {
      const s = api.scene;
      const L = Math.round(api.param('layers'));
      const rnd = seeded(1890);
      s.L = L;
      s.edge = new Float32Array(L * 201);
      for (let li = 0; li < L; li++) {
        const depth = L === 1 ? 1 : li / (L - 1);
        const baseY = 0.5 + depth * 0.36;
        const off = li * 201;
        for (let k = 0; k <= 200; k++) s.edge[off + k] = baseY;
        const trees = 8 + Math.floor(rnd() * 8);
        for (let q = 0; q < trees; q++) {
          const cx = rnd() * 1.1 - 0.05;
          const h = (0.1 + rnd() * 0.18) * (0.6 + depth * 0.8);
          const w = h * (0.28 + rnd() * 0.15);
          const round = rnd() < 0.3;
          for (let k = 0; k <= 200; k++) {
            const x = k / 200;
            const dx = Math.abs(x - cx);
            if (dx > w) continue;
            let top;
            if (round) {
              top = baseY - h * 0.35 - h * 0.65 * Math.sqrt(Math.max(0, 1 - (dx / w) ** 2));
            } else {
              // A pine: a triangle with its branches stepped.
              const u = dx / w;
              const notch = ((1 - u) * 5) % 1;
              top = baseY - h * (1 - u) + h * 0.05 * notch;
            }
            if (top < s.edge[off + k]) s.edge[off + k] = top;
          }
        }
      }
      s.bx = new Float32Array(6);
      s.by = new Float32Array(6);
      s.bv = new Float32Array(6);
      s.bon = new Uint8Array(6);
      s.next = 0;
      s.gust = 0;
    },
    event(p, api) {
      const s = api.scene;
      const i = s.next++ % 6;
      const fromLeft = p.x > api.w / 2;
      s.bx[i] = fromLeft ? -20 : api.w + 20;
      s.by[i] = api.h * (0.15 + (p.y / api.h) * 0.35);
      s.bv[i] = (fromLeft ? 1 : -1) * (0.05 + Math.random() * 0.04);
      s.bon[i] = 1;
      s.gust = Math.min(1.5, s.gust + 0.3);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.edge) return;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const t = api.now / 1000;
      const light = lightnessOf(pal.background) > 0.5;
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
      sky.addColorStop(0, mixColors(pal.background, '#ffffff', light ? 0.4 : 0.12));
      sky.addColorStop(1, mixColors(pal.background, pal.alert, 0.2));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = mixColors('#fff6e0', pal.alert, 0.1);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(W * 0.74, H * 0.26, Math.min(W, H) * 0.07, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      s.gust *= Math.exp(-dt / 3000);
      const back = mixColors(pal.background, '#ffffff', light ? 0.5 : 0.3);
      const front = mixColors(mixColors(pal.background, '#000000', light ? 0.35 : 0.55), pal.user, 0.2);
      const birdLayer = Math.floor(s.L / 2);
      for (let li = 0; li < s.L; li++) {
        const depth = s.L === 1 ? 1 : li / (s.L - 1);
        const tone = mixColors(back, front, depth);
        const sway = Math.sin(t * 0.4 + li) * (2 + li * 1.5) * (1 + s.gust);
        const off = li * 201;
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(-30, H);
          for (let k = 0; k <= 200; k++) ctx.lineTo(-20 + (k / 200) * (W + 40) + sway, s.edge[off + k] * H);
          ctx.lineTo(W + 30, H);
          ctx.closePath();
        };
        ctx.save();
        ctx.translate(3, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        path();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = tone;
        path();
        ctx.fill();
        if (li === birdLayer) {
          ctx.strokeStyle = mixColors(front, '#000000', 0.2);
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          for (let b = 0; b < 6; b++) {
            if (!s.bon[b]) continue;
            s.bx[b] += s.bv[b] * dt;
            s.by[b] += Math.sin(t * 2 + b) * 0.004 * dt;
            if (s.bx[b] < -40 || s.bx[b] > W + 40) { s.bon[b] = 0; continue; }
            const flap = Math.sin(t * 9 + b) * 6;
            ctx.beginPath();
            ctx.moveTo(s.bx[b] - 9, s.by[b] - flap);
            ctx.lineTo(s.bx[b], s.by[b]);
            ctx.lineTo(s.bx[b] + 9, s.by[b] - flap);
            ctx.stroke();
          }
        }
      }
    },
  },
};
