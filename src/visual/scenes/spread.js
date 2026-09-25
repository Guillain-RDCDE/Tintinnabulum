// Two ways a surface is taken over.
//
// The catalogue already grows things -- a mould that searches, roots that
// reach, a line that folds. These two are neither: frost does not look for
// anything, it takes whatever drifts into it and keeps it; a crack does not
// grow at all, it releases. Both are propagation rather than growth, and both
// read at a glance as something that happened to a surface rather than
// something drawn on it.
//
// They share the house rules of the grown scenes: the bulk lives in typed
// arrays of a fixed size, so neither can grow past its ceiling however much
// arrives, and the picture is kept on a buffer of the renderer's pool rather
// than redrawn every frame.

import { toRgb, scratch } from './paint.js';
import { shadeOf, lighten, lightnessOf, mixColors } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'default', 'alert'];

const inkOf = (api, k) =>
  shadeOf(api.palette[ROLES[k % ROLES.length]] || api.palette.default,
    [Math.random(), Math.random(), Math.random()],
    Number.isFinite(api.richness) ? api.richness : 0.45);

export const SPREAD_SCENES = {
  // --- frost ----------------------------------------------------------------------------
  frost: {
    label: 'Frost',
    note: 'Diffusion-limited aggregation, the oldest growth model in the book and still the one that looks most like the world: a particle wanders at random until it touches what is already frozen, and there it stays for good. Nothing decides the shape. The branches come out feathered because a wanderer is far more likely to meet a tip than to find its way down into a hollow, so what sticks out gathers more and what is sheltered gathers none -- which is exactly why frost on a window is feathered too. Every event is a fresh nucleus, and the cold spreads from all of them at once.',
    how: 'Walkers are released on a ring just outside the frozen edge rather than from the frame, because a walk from the corner of a large picture almost never arrives; each takes a step a cell wide until one of its four neighbours is frozen, and then it freezes where it stands and a line is drawn to what it caught on.',
    shelf: 'Materials',
    positional: true,
    preview: { frames: 340, dt: 40 },
    params: {
      cold: { label: 'How fast it spreads', min: 0.3, max: 3, step: 0.05, default: 1 },
      reach: { label: 'How far a walker roams', min: 0.5, max: 2.5, step: 0.05, default: 1 },
      weight: { label: 'Branch weight', min: 0.4, max: 2.4, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.cell = Math.max(2, Math.round(m / 420));
      s.cols = Math.ceil(api.w / s.cell) + 1;
      s.rows = Math.ceil(api.h / s.cell) + 1;
      // Which cells are frozen, and how far each is from the nucleus it grew
      // from -- the depth is what the drawing thins with, so a branch tapers
      // away from its seed the way a real one does.
      s.ice = new Uint8Array(s.cols * s.rows);
      s.depth = new Uint16Array(s.cols * s.rows);
      s.tint = new Uint8Array(s.cols * s.rows);
      s.seeds = [];
      s.inks = [];
      s.frozen = 0;
      s.radius = 0;
      s.cleared = false;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.ice) return;
      nucleus(api, p.x, p.y, p.color);
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
      // A picture with nothing in it yet: one nucleus in the middle, so a
      // still of this scene is never a blank sheet.
      if (!s.seeds.length) nucleus(api, api.w / 2, api.h / 2, null);

      const m = Math.min(api.w, api.h);
      const cold = api.param('cold');
      const roam = m * 0.26 * api.param('reach');
      const weight = api.param('weight');
      // Walkers per frame. A walk is a handful of arithmetic per step, so
      // hundreds of them cost less than a single fill -- and frost needs tens
      // of thousands of particles before it looks like anything. The first
      // version released twenty-six a frame and grew specks.
      const walkers = Math.max(60, Math.min(1200, Math.round(460 * cold)));
      const steps = 70;

      b.lineCap = 'round';
      for (let n = 0; n < walkers; n++) {
        const seed = s.seeds[(Math.random() * s.seeds.length) | 0];
        if (!seed) break;
        // Released on a ring just outside what is already frozen. From the
        // frame, almost every walk wanders off and is wasted; from the ring,
        // nearly every one arrives.
        const ring = seed.r + s.cell * 1.6;
        const a = Math.random() * TAU;
        let x = seed.x + Math.cos(a) * ring;
        let y = seed.y + Math.sin(a) * ring;
        for (let step = 0; step < steps; step++) {
          const cx = (x / s.cell) | 0;
          const cy = (y / s.cell) | 0;
          if (cx < 1 || cy < 1 || cx >= s.cols - 1 || cy >= s.rows - 1) break;
          const at = cy * s.cols + cx;
          // Touching anything frozen ends the walk there.
          const left = s.ice[at - 1];
          const right = s.ice[at + 1];
          const up = s.ice[at - s.cols];
          const down = s.ice[at + s.cols];
          const caught = left || right || up || down;
          if (caught) {
            const from = left ? at - 1 : right ? at + 1 : up ? at - s.cols : at + s.cols;
            const depth = Math.min(65535, s.depth[from] + 1);
            s.ice[at] = 1;
            s.depth[at] = depth;
            s.tint[at] = s.tint[from];
            s.frozen++;
            const d = Math.hypot(x - seed.x, y - seed.y);
            if (d > seed.r) seed.r = d;
            const ink = s.inks[s.tint[at]] || inkOf(api, s.tint[at]);
            b.strokeStyle = ink;
            // Thinner the further from the nucleus, so a branch tapers.
            b.lineWidth = Math.max(0.6, s.cell * weight * (1.4 - Math.min(0.9, depth / 300)));
            b.globalAlpha = 0.85;
            b.beginPath();
            b.moveTo((from % s.cols) * s.cell, ((from / s.cols) | 0) * s.cell);
            b.lineTo(cx * s.cell, cy * s.cell);
            b.stroke();
            break;
          }
          // A step of one cell, in one of eight directions: a walk on the grid
          // rather than in the plane, which is both faster and how the model
          // is defined.
          const dir = (Math.random() * 8) | 0;
          x += Math.cos((dir * TAU) / 8) * s.cell;
          y += Math.sin((dir * TAU) / 8) * s.cell;
          // Wandered too far from its seed: let it go rather than following it
          // round the picture for nothing.
          if (Math.hypot(x - seed.x, y - seed.y) > seed.r + roam) break;
        }
      }
      b.globalAlpha = 1;

      // A sheet that has frozen over is let go slowly, so the picture keeps
      // moving on a feed that never stops.
      if (s.frozen > s.cols * s.rows * 0.18) {
        b.fillStyle = api.palette.background;
        b.globalAlpha = 0.02;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
        s.ice.fill(0);
        s.depth.fill(0);
        s.frozen = 0;
        s.seeds.length = 0;
        s.inks.length = 0;
      }

      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- fracture -------------------------------------------------------------------------
  fracture: {
    label: 'Fracture',
    note: 'Glass, and what an impact does to it. Each event is a blow: cracks leave it in every direction, wander as they run because the sheet is never perfectly even, fork where the stress divides, and stop dead the moment they meet a crack that is already there. That last rule is the whole of it -- it is why a broken window is a map of the order it was struck in, and why the second blow is always the smaller pattern.',
    how: 'Every crack is a tip walking a step at a time with a little noise in its heading; an occupancy grid a few pixels across holds what has already been cut, and a tip that steps into an occupied cell that is not its own ends there. Tips are a fixed-size pool, so a hail of events cannot grow the work without limit.',
    shelf: 'Materials',
    positional: true,
    preview: { frames: 180, dt: 45 },
    params: {
      rays: { label: 'Cracks per blow', min: 3, max: 16, step: 1, default: 7 },
      brittle: { label: 'How readily they fork', min: 0, max: 2, step: 0.05, default: 1 },
      wander: { label: 'How much they wander', min: 0, max: 2, step: 0.05, default: 1 },
      speed: { label: 'How fast they run', min: 0.3, max: 3, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.cell = Math.max(2, Math.round(m / 260));
      s.cols = Math.ceil(api.w / s.cell) + 1;
      s.rows = Math.ceil(api.h / s.cell) + 1;
      s.cut = new Uint16Array(s.cols * s.rows);
      s.max = 900;
      s.tx = new Float32Array(s.max);
      s.ty = new Float32Array(s.max);
      s.ta = new Float32Array(s.max);
      s.tlife = new Float32Array(s.max);
      s.tblow = new Uint16Array(s.max);
      s.twidth = new Float32Array(s.max);
      s.alive = new Uint8Array(s.max);
      s.next = 0;
      s.blow = 0;
      s.inks = [];
      s.cleared = false;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cut) return;
      blow(api, p.x, p.y, p.color, 0.7 + p.pick * 0.9);
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
      s.ambient += api.dt;
      if (s.ambient > 2600) {
        s.ambient = 0;
        blow(api, Math.random() * api.w, Math.random() * api.h, null, 0.8);
      }

      const m = Math.min(api.w, api.h);
      const step = Math.max(1, s.cell * 0.9 * api.param('speed'));
      const wander = 0.22 * api.param('wander');
      const fork = 0.012 * api.param('brittle');
      b.lineCap = 'round';

      for (let i = 0; i < s.max; i++) {
        if (!s.alive[i]) continue;
        const x0 = s.tx[i];
        const y0 = s.ty[i];
        s.ta[i] += (Math.random() - 0.5) * wander;
        const x = x0 + Math.cos(s.ta[i]) * step;
        const y = y0 + Math.sin(s.ta[i]) * step;
        const cx = (x / s.cell) | 0;
        const cy = (y / s.cell) | 0;
        if (cx < 0 || cy < 0 || cx >= s.cols || cy >= s.rows) {
          s.alive[i] = 0;
          continue;
        }
        const at = cy * s.cols + cx;
        const held = s.cut[at];
        // Meeting another crack ends this one. Meeting its own blow does not,
        // or a ray would die on the cell it was born in.
        if (held && held !== s.tblow[i]) {
          s.alive[i] = 0;
          continue;
        }
        s.cut[at] = s.tblow[i];
        s.tx[i] = x;
        s.ty[i] = y;
        s.tlife[i] -= step;
        b.strokeStyle = s.inks[s.tblow[i] % s.inks.length] || inkOf(api, i);
        b.lineWidth = Math.max(0.5, s.twidth[i]);
        b.globalAlpha = 0.9;
        b.beginPath();
        b.moveTo(x0, y0);
        b.lineTo(x, y);
        b.stroke();
        // A crack thins as it runs, and gives out.
        s.twidth[i] *= 0.997;
        if (s.tlife[i] <= 0) {
          s.alive[i] = 0;
          continue;
        }
        // Forking: the stress divides and two cracks leave where one arrived.
        if (Math.random() < fork) {
          tip(s, x, y, s.ta[i] + (Math.random() < 0.5 ? -0.6 : 0.6), s.tlife[i] * 0.55, s.tblow[i], s.twidth[i] * 0.75);
          s.tlife[i] *= 0.8;
        }
      }
      b.globalAlpha = 1;

      // When the sheet is thoroughly broken it is replaced, slowly: the old
      // pattern fades under the new rather than being swept away.
      let cutCells = 0;
      for (let i = 0; i < s.cut.length; i += 7) if (s.cut[i]) cutCells++;
      if (cutCells * 7 > s.cols * s.rows * 0.2) {
        b.fillStyle = api.palette.background;
        b.globalAlpha = 0.025;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
        s.cut.fill(0);
        s.inks.length = 0;
      }

      ctx.drawImage(buf, 0, 0);
    },
  },
};

// --- frost ------------------------------------------------------------------------------

/** A speck of ice for the cold to spread from. */
function nucleus(api, x, y, color) {
  const s = api.scene;
  const cx = Math.max(1, Math.min(s.cols - 2, (x / s.cell) | 0));
  const cy = Math.max(1, Math.min(s.rows - 2, (y / s.cell) | 0));
  const at = cy * s.cols + cx;
  const k = s.inks.length;
  // Frost is pale, whatever it grows on: the event's own colour, lifted
  // towards the light so a branch reads as ice rather than as a scratch.
  const base = color || inkOf(api, k);
  s.inks.push(lightnessOf(api.palette.background) > 0.55 ? base : lighten(base, 0.28));
  s.ice[at] = 1;
  s.depth[at] = 0;
  s.tint[at] = Math.min(255, k);
  s.seeds.push({ x: cx * s.cell, y: cy * s.cell, r: s.cell * 2 });
  if (s.seeds.length > 8) {
    s.seeds.shift();
    s.inks.shift();
  }
}

// --- fracture ---------------------------------------------------------------------------

/** One crack tip, taken from the pool. */
function tip(s, x, y, angle, life, blowId, width) {
  const i = s.next;
  s.next = (s.next + 1) % s.max;
  s.tx[i] = x;
  s.ty[i] = y;
  s.ta[i] = angle;
  s.tlife[i] = life;
  s.tblow[i] = blowId;
  s.twidth[i] = width;
  s.alive[i] = 1;
}

/** A blow: cracks leaving one point in every direction. */
function blow(api, x, y, color, force) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  // Blow numbers start at one, because zero means "not cut" in the grid.
  s.blow = (s.blow % 60000) + 1;
  // A sheet is one material. The event's colour is kept but pulled most of
  // the way towards the palette's ink, so the blows differ as glass differs
  // from glass rather than as paint differs from paint.
  const ink = api.palette.default || api.palette.text;
  s.inks.push(mixColors(color || inkOf(api, s.blow), ink, 0.72));
  if (s.inks.length > 24) s.inks.shift();
  const rays = Math.round(api.param('rays'));
  const start = Math.random() * TAU;
  for (let i = 0; i < rays; i++) {
    const a = start + (i / rays) * TAU + (Math.random() - 0.5) * 0.3;
    tip(s, x, y, a, m * (0.18 + Math.random() * 0.5) * force, s.blow, Math.max(0.8, m * 0.0035 * force));
  }
}
