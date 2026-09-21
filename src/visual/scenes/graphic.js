// Graphic scenes: the vocabulary of posters, prints and backgrounds.
//
// Four constructions every graphic designer reaches for -- the soft gradient,
// op-art stripes pulled out of true, the dot screen of cheap colour printing
// and counterchanged rings -- rebuilt so that the data does the pulling. Each
// is cheap enough to run full screen, because each is drawn with what a canvas
// does quickly: gradients, filled paths, and dots batched by colour.

import { noise2 } from './noise.js';
import { toRgb, scratch } from './paint.js';
import { mixColors } from '../color.js';

const TAU = Math.PI * 2;

/** A colour at some opacity, whatever form it came in. */
const alpha = (c, a) => {
  const [r, g, b] = toRgb(c);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

export const GRAPHIC_SCENES = {
  aura: {
    label: 'Soft gradient',
    note: 'A mesh gradient, the backdrop of a thousand album covers: wide radial clouds of colour laid over one another, each fading to nothing, so where two meet they mix rather than edge. Every event lays a cloud where it happened; the oldest is taken away. The clouds wander on a slow value-noise field, so the picture never stands still and never repeats.',
    params: {
      scale: { label: 'Size of the clouds', min: 0.4, max: 2.5, step: 0.05, default: 1.2 },
      churn: { label: 'How much they wander', min: 0, max: 2, step: 0.05, default: 0.8 },
      punch: { label: 'Strength of colour', min: 0.2, max: 1, step: 0.02, default: 0.8 },
    },
    init(api) {
      const s = api.scene;
      // Three clouds of the palette's own before any event, so a quiet start is
      // a colour and not a blank ground.
      s.base = [
        { x: 0.22, y: 0.3, r: 0.55, color: api.palette.user, seed: 1.3, born: -1e9 },
        { x: 0.78, y: 0.35, r: 0.5, color: api.palette.anon, seed: 4.1, born: -1e9 },
        { x: 0.5, y: 0.8, r: 0.6, color: api.palette.bot, seed: 7.7, born: -1e9 },
      ];
      s.clouds = [];
    },
    event(p, api) {
      const s = api.scene;
      if (!s.clouds) s.clouds = [];
      s.clouds.push({ x: p.x / api.w, y: p.y / api.h, r: 0.22 + p.pick * 0.32, color: p.color, seed: p.rot * 3, born: api.now });
      if (s.clouds.length > 9) s.clouds.shift();
    },
    frame(ctx, api) {
      const s = api.scene;
      const W = api.w;
      const H = api.h;
      const m = Math.max(W, H);
      const scale = api.param('scale');
      const punch = api.param('punch');
      const t = (api.now / 1000) * api.param('churn');
      for (const c of [...(s.base || []), ...(s.clouds || [])]) {
        const grow = Math.min(1, (api.now - c.born) / 1400);
        const x = (c.x + (noise2(c.seed * 9.1, t * 0.12) - 0.5) * 0.5) * W;
        const y = (c.y + (noise2(c.seed * 5.3 + 40, t * 0.12) - 0.5) * 0.5) * H;
        const r = Math.max(4, c.r * scale * m * (0.6 + 0.4 * grow));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, alpha(c.color, punch * grow));
        g.addColorStop(0.5, alpha(c.color, punch * 0.5 * grow));
        g.addColorStop(1, alpha(c.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    },
  },

  whorl: {
    label: 'Whorl',
    note: 'Op art by displacement. Parallel stripes are drawn as filled bands, and every point on their edges is turned about each nearby centre by an angle that falls away with distance -- a Gaussian twist -- and drawn a little towards it. Each event becomes a centre, turning one way or the other; only the most recent few are kept, so the whirlpools move on with the data while the stripes flow slowly through them.',
    params: {
      centres: { label: 'Centres', min: 1, max: 8, step: 1, default: 4 },
      twist: { label: 'Twist', min: 0, max: 2.5, step: 0.05, default: 1 },
      pull: { label: 'Pull', min: 0, max: 1, step: 0.02, default: 0.35 },
      stripes: { label: 'Stripes', min: 6, max: 70, step: 1, default: 26 },
      weight: { label: 'Weight', min: 0.15, max: 0.85, step: 0.01, default: 0.5 },
    },
    init(api) {
      api.scene.centres = [
        { x: api.w * 0.3, y: api.h * 0.4, k: 1, seed: 0.7, color: api.palette.user, born: -1e9 },
        { x: api.w * 0.72, y: api.h * 0.62, k: -1, seed: 2.9, color: api.palette.anon, born: -1e9 },
      ];
    },
    event(p, api) {
      const list = api.scene.centres || (api.scene.centres = []);
      list.push({ x: p.x, y: p.y, k: p.pick < 0.5 ? -1 : 1, seed: p.rot, color: p.color, born: api.now });
      if (list.length > 8) list.shift();
    },
    frame(ctx, api) {
      const W = api.w;
      const H = api.h;
      const all = api.scene.centres || [];
      const list = all.slice(-Math.round(api.param('centres')));
      const twist = api.param('twist');
      const pull = api.param('pull');
      const stripes = Math.round(api.param('stripes'));
      const weight = api.param('weight');
      const t = api.now / 1000;
      const R = Math.min(W, H) * 0.42;
      const R2 = R * R;
      // Each centre's angle, eased in as it arrives and breathing slowly after.
      const cs = list.map((c) => {
        const grow = Math.min(1, (api.now - c.born) / 1600);
        return { x: c.x, y: c.y, a: twist * c.k * grow * (1 + 0.25 * Math.sin(t * 0.6 + c.seed * 5)), p: pull * grow };
      });
      const warp = (x, y, out) => {
        let dx = 0;
        let dy = 0;
        for (const c of cs) {
          const ex = x - c.x;
          const ey = y - c.y;
          const g = Math.exp(-(ex * ex + ey * ey) / R2);
          if (g < 0.002) continue;
          const a = c.a * g;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          dx += ex * ca - ey * sa - ex - ex * c.p * g * 0.6;
          dy += ex * sa + ey * ca - ey - ey * c.p * g * 0.6;
        }
        out[0] = x + dx;
        out[1] = y + dy;
      };
      const gap = H / stripes;
      const flow = ((t * gap * 0.35) % (gap * 2)) - gap * 2;
      const pad = R * 0.6;
      const step = Math.max(5, W / 130);
      const pt = [0, 0];
      const latest = all.length ? all[all.length - 1].color : api.palette.user;
      for (let i = -3; i <= stripes + 3; i++) {
        const y0 = i * gap + flow;
        const y1 = y0 + gap * weight;
        ctx.fillStyle = i % 6 === 0 ? latest : api.palette.default;
        ctx.beginPath();
        for (let x = -pad; x <= W + pad; x += step) {
          warp(x, y0, pt);
          if (x === -pad) ctx.moveTo(pt[0], pt[1]);
          else ctx.lineTo(pt[0], pt[1]);
        }
        for (let x = W + pad; x >= -pad; x -= step) {
          warp(x, y1, pt);
          ctx.lineTo(pt[0], pt[1]);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
  },

  benday: {
    label: 'Ben-Day dots',
    note: 'The dot screen of cheap colour printing, named for Benjamin Day, who patented it in 1879 and whom Lichtenstein made famous by painting it large. A heat map is built from the recent events -- each one a Gaussian that cools as it ages, over a slow noise so the page is never bare -- and printed through a rotated grid: each dot is sized by the heat under it and inked from a ramp through the palette, coolest to hottest. Dots are batched by ink, so a full screen of them is a dozen fills.',
    params: {
      cell: { label: 'Dot spacing', min: 6, max: 36, step: 1, default: 13 },
      angle: { label: 'Screen angle', min: 0, max: 90, step: 1, default: 22 },
      spread: { label: 'How far the heat spreads', min: 0.3, max: 3, step: 0.05, default: 1.2 },
    },
    init(api) {
      api.scene.rampFor = null;
    },
    frame(ctx, api) {
      const s = api.scene;
      const W = api.w;
      const H = api.h;
      const pal = api.palette;
      const LEVELS = 12;
      if (s.rampFor !== pal) {
        const stops = [pal.bot, pal.anon, pal.user, pal.alert];
        s.ramp = [];
        for (let i = 0; i < LEVELS; i++) {
          const u = (i / (LEVELS - 1)) * (stops.length - 1);
          const k = Math.min(stops.length - 2, Math.floor(u));
          s.ramp.push(mixColors(stops[k], stops[k + 1], u - k));
        }
        s.rampFor = pal;
      }
      const cell = api.param('cell');
      const angle = (api.param('angle') * Math.PI) / 180;
      const sigma = Math.min(W, H) * 0.1 * api.param('spread');
      const s2 = sigma * sigma;
      const t = api.now / 1000;
      // The most recent events only: a dot asks each of them for its heat.
      const src = api.particles.slice(-16).map((p) => {
        const age = (api.now - p.born) / (p.life || 12000);
        return { x: p.x, y: p.y, w: Math.max(0, 1 - age) * (0.22 + 0.3 * p.pick) };
      });
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const half = Math.hypot(W, H) / 2 + cell;
      const cx = W / 2;
      const cy = H / 2;
      // The dots are written straight into pixels, a row of each at a time,
      // and the frame is put down once. Traced as arcs, or stamped from a
      // sprite, five thousand dots cost thirty to seventy milliseconds a frame
      // wherever the canvas is drawn without a graphics card; written as rows
      // they cost a few, anywhere. The edge is hard, which is what a printed
      // dot has.
      const buf = scratch(api, 'buf', true);
      const bctx = s.bufCtx;
      const BW = buf.width;
      const BH = buf.height;
      if (!s.img || s.img.width !== BW || s.img.height !== BH) {
        s.img = bctx.createImageData(BW, BH);
        s.px = new Uint32Array(s.img.data.buffer);
      }
      const pack = (c) => {
        const [r, g, b] = toRgb(c);
        return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
      };
      if (s.inkFor !== s.ramp) {
        s.inks = s.ramp.map(pack);
        s.inkFor = s.ramp;
      }
      const px = s.px;
      px.fill(pack(pal.background));
      const ns = sigma * 2.2;
      for (let v = -half; v <= half; v += cell) {
        for (let u = -half; u <= half; u += cell) {
          const x = cx + u * cos - v * sin;
          const y = cy + u * sin + v * cos;
          if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
          let sum = Math.max(0, noise2(x / ns + t * 0.08, y / ns - t * 0.05) - 0.35) * 0.5;
          for (const p of src) {
            const dx = x - p.x;
            const dy = y - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < s2 * 9) sum += p.w * Math.exp(-d2 / s2);
          }
          // Saturating rather than clipping: a busy patch fills up towards the
          // hottest ink without the whole page going to it at once.
          const h = 1 - Math.exp(-sum * 1.6);
          if (h <= 0.05) continue;
          const r = cell * 0.52 * Math.sqrt(h);
          const ink = s.inks[Math.min(LEVELS - 1, Math.floor(h * LEVELS))];
          const y0 = Math.max(0, Math.ceil(y - r));
          const y1 = Math.min(BH - 1, Math.floor(y + r));
          for (let yy = y0; yy <= y1; yy++) {
            const dy = yy + 0.5 - y;
            const span = Math.sqrt(Math.max(0, r * r - dy * dy));
            const x0 = Math.max(0, Math.round(x - span));
            const x1 = Math.min(BW, Math.round(x + span));
            if (x1 > x0) px.fill(ink, yy * BW + x0, yy * BW + x1);
          }
        }
      }
      bctx.putImageData(s.img, 0, 0);
      ctx.drawImage(buf, 0, 0, api.w, api.h);
    },
  },

  rise: {
    label: 'Rising rings',
    note: 'Counterchange, the oldest trick in pattern: rings and rays in two colours that swap wherever they cross, so the figure and the ground keep trading places. The rings grow slowly outwards from a centre that may sit anywhere from the top edge to the bottom one, the rays turn, and every event sends a wave of its own colour out through the rings.',
    positional: false,
    params: {
      rings: { label: 'Rings', min: 4, max: 40, step: 1, default: 14 },
      rays: { label: 'Rays', min: 0, max: 36, step: 2, default: 12 },
      centre: { label: 'Where the centre sits', min: 0, max: 1, step: 0.01, default: 0.82 },
      spin: { label: 'Turn', min: 0, max: 1, step: 0.02, default: 0.3 },
    },
    init(api) {
      api.scene.waves = [];
    },
    event(p, api) {
      const waves = api.scene.waves || (api.scene.waves = []);
      waves.push({ born: api.now, color: p.color, speed: 0.25 + p.pick * 0.35 });
      if (waves.length > 12) waves.shift();
    },
    frame(ctx, api) {
      const W = api.w;
      const H = api.h;
      const rings = Math.round(api.param('rings'));
      const rays = Math.round(api.param('rays'));
      const cx = W / 2;
      const cy = H * api.param('centre');
      const t = api.now / 1000;
      const Rmax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
      const ring = Rmax / rings;
      const grow = (t * ring * 0.12) % (ring * 2);
      const turn = t * api.param('spin') * 0.12;
      const sector = rays ? TAU / rays : TAU;
      const waves = (api.scene.waves || []).map((w) => ({
        r: ((api.now - w.born) / 1000) * w.speed * Rmax,
        color: w.color,
      }));
      api.scene.waves = (api.scene.waves || []).filter((w) => ((api.now - w.born) / 1000) * w.speed * Rmax < Rmax + ring * 2);
      const plain = new Path2D();
      const lit = new Map();
      for (let j = -2; j <= rings + 1; j++) {
        const r0 = Math.max(0, j * ring + grow);
        const r1 = Math.max(0, r0 + ring);
        if (r1 <= 0) continue;
        const mid = (r0 + r1) / 2;
        let color = null;
        for (const w of waves) if (Math.abs(mid - w.r) < ring * 1.1) color = w.color;
        const path = color ? lit.get(color) || lit.set(color, new Path2D()).get(color) : plain;
        const count = rays || 1;
        for (let k = 0; k < count; k++) {
          if ((j + k) % 2 !== 0) continue;
          const a0 = k * sector + turn;
          const a1 = a0 + sector;
          if (!rays) {
            path.moveTo(cx + r1, cy);
            path.arc(cx, cy, r1, 0, TAU);
            path.moveTo(cx + r0, cy);
            path.arc(cx, cy, r0, TAU, 0, true);
          } else {
            path.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1);
            path.arc(cx, cy, r1, a0, a1);
            path.arc(cx, cy, r0, a1, a0, true);
            path.closePath();
          }
        }
      }
      ctx.fillStyle = api.palette.default;
      ctx.fill(plain, 'evenodd');
      for (const [color, path] of lit) {
        ctx.fillStyle = color;
        ctx.fill(path, 'evenodd');
      }
    },
  },
};
