// Things that build themselves: recursion, packing and tiling.
//
// The family the drawing machines are not. A spirograph traces one curve and
// stops; these have no natural length, and what they draw at minute ten is not
// what they drew at minute one. That is the property worth having when the pen
// is a live feed rather than a hand, and it is the same reason Truchet is the
// scene people stop on.
//
//   Hilbert     David Hilbert, 1891. A curve that visits every cell of a grid.
//   Dragon      The Heighway dragon, folded from a strip of paper.
//   Chaos game  Half-way to a random corner, forever. Sierpinski, 1915, from
//               a rule that mentions no triangle at all.
//   Mondrian    Recursive subdivision, after the compositions of 1917-1930.
//   Packing     Circles that grow until they touch, and then stop.
//   Quasicrystal Waves at incommensurable angles, which never repeat.
//
// Everything here that accumulates paints onto an offscreen canvas: the record
// of an hour is hundreds of thousands of marks and no machine will redraw that
// sixty times a second.

import { scratch, toRgb } from './paint.js';

const TAU = Math.PI * 2;

/** The scene's accumulation buffer, cleared the first time it is asked for. */
function canvasFor(api, key = 'buf', readBack = false) {
  const cv = scratch(api, key, readBack);
  const g = api.scene[key + 'Ctx'];
  if (!api.scene[key + 'Clean']) {
    g.clearRect(0, 0, cv.width, cv.height);
    api.scene[key + 'Clean'] = true;
  }
  return g;
}

export const RECURSIVE_SCENES = {
  hilbert: {
    label: 'Hilbert curve',
    positional: false,
    note: 'David Hilbert, 1891: one unbroken line that reaches every cell of a grid and never crosses itself. Events light the stretch of it that covers where they landed.',
    params: {
      order: { label: 'Order', min: 2, max: 8, step: 1, default: 6, rebuild: true },
      weight: { label: 'Line weight', min: 0.4, max: 6, step: 0.1, default: 1.6 },
      glow: { label: 'How long it stays lit', min: 500, max: 20000, step: 250, default: 6000 },
    },
    init(api) {
      const s = api.scene;
      const order = Math.max(1, Math.round(api.param('order')));
      const n = 1 << order;          // cells across
      const total = n * n;
      // The curve is computed once. It depends only on the order, and at order
      // eight it is sixty-five thousand points -- not something to rebuild on a
      // frame, and not something that ever changes on its own.
      s.n = n;
      s.pts = new Float32Array(total * 2);
      for (let d = 0; d < total; d++) {
        const [x, y] = d2xy(n, d);
        s.pts[d * 2] = x;
        s.pts[d * 2 + 1] = y;
      }
      s.heat = new Float32Array(total);
      s.color = null;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.pts) return;
      // Where the event landed becomes a cell, the cell becomes a distance
      // along the curve, and a run of the curve lights up. This is the whole
      // point of a space-filling curve: it turns two dimensions into one, and
      // nearby places stay nearby along it.
      const gx = Math.min(s.n - 1, Math.max(0, Math.floor((p.x / api.w) * s.n)));
      const gy = Math.min(s.n - 1, Math.max(0, Math.floor((p.y / api.h) * s.n)));
      const d = xy2d(s.n, gx, gy);
      const run = Math.max(2, Math.round(Math.min(60, p.r * 0.6)));
      for (let k = -run; k <= run; k++) {
        const i = d + k;
        if (i < 0 || i >= s.heat.length) continue;
        const near = 1 - Math.abs(k) / (run + 1);
        s.heat[i] = Math.max(s.heat[i], near);
      }
      s.color = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.pts) return;
      const n = s.n;
      const total = n * n;
      // Square and centred: a space-filling curve stretched to a wide canvas
      // stops being a square grid, which is the only thing it is.
      const side = Math.min(api.w, api.h) * 0.94;
      const ox = (api.w - side) / 2;
      const oy = (api.h - side) / 2;
      const cell = side / n;
      const px = (i) => ox + (s.pts[i * 2] + 0.5) * cell;
      const py = (i) => oy + (s.pts[i * 2 + 1] + 0.5) * cell;

      const decay = Math.min(1, api.dt / api.param('glow'));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // The whole curve, faint, in one path.
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = api.palette.default;
      ctx.lineWidth = Math.max(0.4, api.param('weight') * 0.5);
      ctx.beginPath();
      ctx.moveTo(px(0), py(0));
      for (let i = 1; i < total; i++) ctx.lineTo(px(i), py(i));
      ctx.stroke();

      // Then the lit stretches over the top, brightest where an event landed.
      ctx.lineWidth = api.param('weight');
      ctx.strokeStyle = s.color || api.palette.user;
      let run = false;
      for (let i = 0; i < total; i++) {
        s.heat[i] = Math.max(0, s.heat[i] - decay);
        const hot = s.heat[i] > 0.02;
        if (hot && !run) {
          ctx.beginPath();
          ctx.moveTo(px(i), py(i));
          run = true;
        } else if (hot) {
          ctx.lineTo(px(i), py(i));
        } else if (run) {
          ctx.globalAlpha = 0.9;
          ctx.stroke();
          run = false;
        }
      }
      if (run) {
        ctx.globalAlpha = 0.9;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },

  dragon: {
    label: 'Dragon curve',
    positional: false,
    preview: { dt: 40, frames: 200 },
    note: 'Fold a strip of paper in half, again and again, then open every crease to a right angle. The Heighway dragon: it tiles the plane with copies of itself and never crosses.',
    params: {
      order: { label: 'Folds', min: 6, max: 17, step: 1, default: 13, rebuild: true },
      speed: { label: 'Unfolding speed', min: 0.02, max: 1, step: 0.01, default: 0.12 },
      weight: { label: 'Line weight', min: 0.3, max: 4, step: 0.1, default: 1.1 },
    },
    init(api) {
      const s = api.scene;
      const order = Math.max(1, Math.round(api.param('order')));
      // The turn sequence, built by the fold rule: the first 2^k - 1 turns of
      // order k+1 are the turns of order k, then a left, then those same turns
      // reversed and flipped. Seventeen folds is 131071 segments.
      const n = (1 << order) - 1;
      const turns = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        // The closed form: look at the lowest set bit of i+1.
        const k = (i + 1) & -(i + 1);
        turns[i] = (((i + 1) / k) & 2) === 0 ? 1 : 0;
      }
      s.turns = turns;
      s.drawn = 0;
      s.bufClean = false;
      s.pos = null;
    },
    event(p, api) {
      // An event pays out more of the strip. A quiet feed leaves the dragon
      // half unfolded, which is a true statement about the feed.
      const s = api.scene;
      s.owed = (s.owed || 0) + 20 + Math.min(400, p.r * 5);
      s.color = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.turns) return;
      const cv = scratch(api);
      const g = canvasFor(api);
      if (!g) return;

      // The dragon of order k fits a box roughly 1.5 by 1 in units of its
      // segment, offset from its start. Rather than derive that, the first
      // pass walks it once to find its true extent and the scene then draws
      // into that -- which also means the fit is exact at every order.
      if (!s.box) s.box = walkExtent(s.turns);
      const { minX, minY, maxX, maxY } = s.box;
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const scale = Math.min((api.w * 0.9) / spanX, (api.h * 0.9) / spanY);
      const ox = (api.w - spanX * scale) / 2 - minX * scale;
      const oy = (api.h - spanY * scale) / 2 - minY * scale;

      if (!s.pos) s.pos = { x: 0, y: 0, dir: 0, i: 0 };

      // Pay out what events have earned, plus a slow trickle so an idle feed
      // still finishes what it started.
      const budget = Math.min(
        s.turns.length - s.pos.i,
        Math.floor((s.owed || 0) + (api.dt / 1000) * api.param('speed') * s.turns.length * 0.08)
      );
      s.owed = Math.max(0, (s.owed || 0) - budget);

      if (budget > 0) {
        const DX = [1, 0, -1, 0];
        const DY = [0, 1, 0, -1];
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.lineWidth = api.param('weight');
        g.strokeStyle = s.color || api.palette.user;
        g.globalAlpha = 0.8;
        g.beginPath();
        g.moveTo(ox + s.pos.x * scale, oy + s.pos.y * scale);
        for (let k = 0; k < budget; k++) {
          const i = s.pos.i;
          s.pos.x += DX[s.pos.dir];
          s.pos.y += DY[s.pos.dir];
          g.lineTo(ox + s.pos.x * scale, oy + s.pos.y * scale);
          s.pos.dir = (s.pos.dir + (s.turns[i] ? 1 : 3)) & 3;
          s.pos.i++;
        }
        g.stroke();
        g.globalAlpha = 1;
      }

      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  chaosgame: {
    label: 'Chaos game',
    positional: false,
    preview: { dt: 40, frames: 200 },
    note: 'Pick a corner at random, jump part of the way to it, mark the spot, repeat. The rule says nothing about a triangle, and a triangle is what appears. Sierpinski, 1915.',
    params: {
      corners: { label: 'Corners', min: 3, max: 9, step: 1, default: 3, rebuild: true },
      jump: { label: 'How far it jumps', min: 0.25, max: 0.75, step: 0.005, default: 0.5 },
      rate: { label: 'Points per second', min: 200, max: 12000, step: 100, default: 3000 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.96 },
    },
    init(api) {
      const s = api.scene;
      s.x = 0.5;
      s.y = 0.5;
      s.bufClean = false;
      s.burn = 0;
    },
    event(p, api) {
      // An event throws the point somewhere new. The attractor pulls it back
      // within a handful of steps, so the feed shows up as a faint spray of
      // stragglers on the way home rather than as a mark of its own.
      const s = api.scene;
      s.x = p.x / Math.max(1, api.w);
      s.y = p.y / Math.max(1, api.h);
      s.burn = 6;
      s.color = p.color;
      s.rate = Math.min(3, (s.rate || 1) + 0.5);
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = canvasFor(api);
      if (!g) return;

      const k = Math.max(3, Math.round(api.param('corners')));
      const ratio = api.param('jump');
      const side = Math.min(api.w, api.h) * 0.94;
      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = side / 2;
      // The corners, in canvas units, with one at the top.
      const vx = new Float64Array(k);
      const vy = new Float64Array(k);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * TAU - Math.PI / 2;
        vx[i] = (cx + Math.cos(a) * R) / api.w;
        vy[i] = (cy + Math.sin(a) * R) / api.h;
      }

      s.rate = Math.max(1, (s.rate || 1) * 0.97);
      const n = Math.min(20000, Math.round(api.param('rate') * (api.dt / 1000) * s.rate));
      g.fillStyle = s.color || api.palette.user;
      for (let i = 0; i < n; i++) {
        const c = (Math.random() * k) | 0;
        s.x += (vx[c] - s.x) * ratio;
        s.y += (vy[c] - s.y) * ratio;
        // The first few steps after a throw are not on the attractor yet, and
        // plotting them speckles the empty regions that are the whole picture.
        if (s.burn > 0) {
          s.burn--;
          continue;
        }
        g.globalAlpha = 0.5;
        g.fillRect(s.x * api.w, s.y * api.h, 1, 1);
      }
      g.globalAlpha = 1;

      const keep = api.param('hold');
      if (keep < 0.999) {
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = `rgba(0,0,0,${(1 - keep) * Math.min(0.05, api.dt / 1000) * 1.6})`;
        g.fillRect(0, 0, cv.width, cv.height);
        g.restore();
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  mondrian: {
    label: 'Subdivision',
    positional: true,
    note: 'Every event splits the rectangle it lands in, across its longer side. Nothing here decides where the lines go except the data; the composition is a record of where things happened.',
    params: {
      minimum: { label: 'Smallest cell', min: 8, max: 160, step: 2, default: 34 },
      bias: { label: 'How near the middle', min: 0, max: 0.5, step: 0.01, default: 0.34 },
      fill: { label: 'Filled cells', min: 0, max: 1, step: 0.02, default: 0.3 },
      weight: { label: 'Line weight', min: 0.5, max: 8, step: 0.5, default: 3 },
    },
    init(api) {
      // One rectangle, in fractions of the canvas, so a resize does not throw
      // the composition away.
      api.scene.cells = [{ x: 0, y: 0, w: 1, h: 1, fill: null }];
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cells) return;
      const fx = p.x / Math.max(1, api.w);
      const fy = p.y / Math.max(1, api.h);
      const idx = s.cells.findIndex(
        (c) => fx >= c.x && fx < c.x + c.w && fy >= c.y && fy < c.y + c.h
      );
      if (idx < 0) return;
      const c = s.cells[idx];
      const minW = api.param('minimum') / Math.max(1, api.w);
      const minH = api.param('minimum') / Math.max(1, api.h);
      // A cell that cannot be split is coloured instead, so a busy region goes
      // on saying something after it has run out of room to divide.
      const vertical = c.w / Math.max(1e-6, minW) > c.h / Math.max(1e-6, minH);
      if ((vertical && c.w < minW * 2) || (!vertical && c.h < minH * 2)) {
        c.fill = Math.random() < api.param('fill') ? p.color : null;
        return;
      }
      // The cut is where the event landed, pulled towards the middle: cuts
      // hard against an edge leave slivers, and a composition of slivers is a
      // composition of nothing.
      const bias = api.param('bias');
      const at = (u) => 0.5 + (u - 0.5) * (1 - bias * 2);
      if (vertical) {
        const t = Math.min(1 - 0.15, Math.max(0.15, at((fx - c.x) / c.w)));
        s.cells.splice(idx, 1,
          { x: c.x, y: c.y, w: c.w * t, h: c.h, fill: c.fill },
          { x: c.x + c.w * t, y: c.y, w: c.w * (1 - t), h: c.h, fill: null });
      } else {
        const t = Math.min(1 - 0.15, Math.max(0.15, at((fy - c.y) / c.h)));
        s.cells.splice(idx, 1,
          { x: c.x, y: c.y, w: c.w, h: c.h * t, fill: c.fill },
          { x: c.x, y: c.y + c.h * t, w: c.w, h: c.h * (1 - t), fill: p.color });
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.cells) return;
      ctx.lineWidth = api.param('weight');
      ctx.strokeStyle = api.palette.default;
      ctx.lineJoin = 'miter';
      for (const c of s.cells) {
        const x = c.x * api.w;
        const y = c.y * api.h;
        const w = c.w * api.w;
        const h = c.h * api.h;
        if (c.fill) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = c.fill;
          ctx.fillRect(x, y, w, h);
        }
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
    },
  },

  packing: {
    label: 'Circle packing',
    positional: true,
    preview: { dt: 40, frames: 190 },
    note: 'Each event drops a circle where it landed and lets it grow until it touches another. What is left is the shape of the space nothing has used yet.',
    params: {
      growth: { label: 'Growth', min: 4, max: 200, step: 2, default: 46 },
      largest: { label: 'Largest', min: 10, max: 300, step: 5, default: 95 },
      gap: { label: 'Gap', min: 0, max: 12, step: 0.5, default: 2 },
      fill: { label: 'Filled', min: 0, max: 1, step: 0.02, default: 0.22 },
    },
    init(api) {
      api.scene.discs = [];
    },
    event(p, api) {
      const s = api.scene;
      if (!s.discs) return;
      const cap = Math.max(60, Math.min(900, Math.round((api.budget || 800) * 1.1)));
      if (s.discs.length >= cap) s.discs.shift();
      // A circle only starts if there is room for it: dropping one inside
      // another gives a spot that can never grow and reads as a blemish.
      const gap = api.param('gap');
      for (const d of s.discs) {
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        if (dx * dx + dy * dy < (d.r + gap + 2) * (d.r + gap + 2)) return;
      }
      s.discs.push({
        x: p.x, y: p.y, r: 1,
        // Magnitude is a ceiling, not a size: a large event may still land in a
        // tight corner, and it should be the space that decides.
        max: Math.max(4, Math.min(api.param('largest'), p.r * 1.3)),
        done: false,
        color: p.color,
        rim: p.rim,
        fill: Math.random() < api.param('fill'),
      });
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.discs) return;
      const gap = api.param('gap');
      const step = (api.dt / 1000) * api.param('growth');

      // Only the circles still growing are tested, and each is tested against
      // all of them: a few dozen live circles against a few hundred settled
      // ones is affordable, where all against all would not be.
      for (const d of s.discs) {
        if (d.done) continue;
        let limit = d.max;
        limit = Math.min(limit, d.x - gap, d.y - gap, api.w - d.x - gap, api.h - d.y - gap);
        for (const o of s.discs) {
          if (o === d) continue;
          const dx = o.x - d.x;
          const dy = o.y - d.y;
          limit = Math.min(limit, Math.hypot(dx, dy) - o.r - gap);
        }
        if (d.r >= limit) {
          d.r = Math.max(0.5, limit);
          d.done = true;
        } else {
          d.r = Math.min(limit, d.r + step);
        }
      }

      ctx.lineWidth = 1.2;
      for (const d of s.discs) {
        if (d.r < 0.6) continue;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        if (d.fill) {
          ctx.globalAlpha = 0.32;
          ctx.fillStyle = d.color;
          ctx.fill();
        }
        ctx.globalAlpha = d.done ? 0.75 : 0.95;
        ctx.strokeStyle = d.done ? d.color : d.rim || d.color;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },

  quasicrystal: {
    label: 'Quasicrystal',
    positional: false,
    note: 'Five or more plane waves at angles that share no common measure. The interference never repeats, which is what makes a quasicrystal one -- Shechtman, 1982, and a Nobel eight years after the ridicule.',
    params: {
      waves: { label: 'Waves', min: 3, max: 13, step: 1, default: 7 },
      period: { label: 'Wavelength', min: 4, max: 60, step: 0.5, default: 16 },
      grain: { label: 'Grain', min: 2, max: 10, step: 1, default: 3, rebuild: true },
      drift: { label: 'Drift', min: 0, max: 2, step: 0.02, default: 0.35 },
    },
    init(api) {
      const s = api.scene;
      const grain = Math.max(2, Math.round(api.param('grain')));
      // A quarter-million samples of a sum of seven cosines is not a per-frame
      // job at full resolution, so it is computed coarse and scaled up. The
      // pattern has no fine detail to lose: it is all low frequencies.
      s.gw = Math.max(40, Math.min(340, Math.round(api.w / grain)));
      s.gh = Math.max(30, Math.min(240, Math.round(api.h / grain)));
      s.img = null;
      s.phase = 0;
      s.kick = 0;
    },
    event(p, api) {
      // An event shifts every wave's phase at once, so the whole pattern
      // lurches and then settles -- the closest thing this scene has to a mark.
      const s = api.scene;
      s.kick = Math.min(6, s.kick + 0.4 + Math.min(1.6, p.r / 60));
      s.color = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.gw) return;
      const { gw, gh } = s;
      const n = Math.max(3, Math.round(api.param('waves')));
      const period = api.param('period');
      s.kick *= 0.94;
      s.phase += (api.dt / 1000) * (api.param('drift') + s.kick);

      const cv = scratch(api, 'qc', true);
      const g = s.qcCtx;
      if (!s.img || s.img.width !== gw || s.img.height !== gh) {
        s.img = g.createImageData(gw, gh);
      }
      const d = s.img.data;
      const bg = toRgb(api.palette.background);
      const ink = toRgb(api.palette.user || api.palette.default);
      const hot = toRgb(api.palette.alert || api.palette.user);

      // The wave directions, evenly spread over half a turn. Sines and cosines
      // are hoisted: they are the same for every one of the sixty thousand
      // samples below.
      const cs = new Float64Array(n);
      const sn = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI;
        cs[k] = Math.cos(a);
        sn[k] = Math.sin(a);
      }
      // Radians per grid cell. The wavelength is given in canvas pixels, and a
      // grid cell is api.w / gw of those, so this is TAU over the wavelength
      // measured in cells. An earlier version multiplied a pile of ratios
      // together and landed on about one cycle across the whole image, which
      // renders as a smooth blur rather than as interference -- there was
      // nothing to interfere with.
      const scale = (TAU * api.w) / Math.max(1, period * gw);
      const warm = Math.min(1, s.kick / 3);

      for (let y = 0; y < gh; y++) {
        const fy = y - gh / 2;
        for (let x = 0; x < gw; x++) {
          const fx = x - gw / 2;
          let sum = 0;
          for (let k = 0; k < n; k++) {
            sum += Math.cos((fx * cs[k] + fy * sn[k]) * scale + s.phase * (1 + k * 0.03));
          }
          // Sum of n cosines is in -n..n; folded to 0..1 and squared, which is
          // what turns a smooth interference into the hard cells of a tiling.
          const v = 0.5 + sum / (2 * n);
          // Smoothstep twice. Once gives a soft interference; a quasicrystal
          // reads as a tiling, and the second pass is what pushes the troughs
          // down to the ground colour so the cells have edges.
          const w1 = v * v * (3 - 2 * v);
          const a = w1 * w1 * (3 - 2 * w1);
          const r = ink[0] + (hot[0] - ink[0]) * warm;
          const g2 = ink[1] + (hot[1] - ink[1]) * warm;
          const b2 = ink[2] + (hot[2] - ink[2]) * warm;
          const i = (y * gw + x) * 4;
          d[i] = bg[0] + (r - bg[0]) * a;
          d[i + 1] = bg[1] + (g2 - bg[1]) * a;
          d[i + 2] = bg[2] + (b2 - bg[2]) * a;
          d[i + 3] = 255;
        }
      }
      g.putImageData(s.img, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cv, 0, 0, gw, gh, 0, 0, api.w, api.h);
    },
  },
};

/**
 * Hilbert: distance along the curve to grid position.
 *
 * The standard iterative form. It walks the quadrants from the coarsest to the
 * finest, rotating the frame as it goes, which is the whole trick -- the curve
 * is the same shape at every scale, turned.
 */
function d2xy(n, d) {
  let rx = 0;
  let ry = 0;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t / 2);
    ry = 1 & (t ^ rx);
    [x, y] = rot(s, x, y, rx, ry);
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return [x, y];
}

/** Hilbert: grid position to distance along the curve. */
function xy2d(n, x, y) {
  let rx = 0;
  let ry = 0;
  let d = 0;
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    rx = (x & s) > 0 ? 1 : 0;
    ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    [x, y] = rot(n, x, y, rx, ry);
  }
  return d;
}

/** The quadrant rotation both Hilbert conversions share. */
function rot(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx === 1) {
      x = n - 1 - x;
      y = n - 1 - y;
    }
    return [y, x];
  }
  return [x, y];
}

/**
 * Walk a turn sequence once to find the box it covers.
 *
 * The dragon's bounding box has a closed form, but it is different for every
 * order mod four and easy to get subtly wrong; walking it costs one pass over
 * an array that was just built anyway, and it cannot disagree with the curve.
 */
function walkExtent(turns) {
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let x = 0;
  let y = 0;
  let dir = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < turns.length; i++) {
    x += DX[dir];
    y += DY[dir];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    dir = (dir + (turns[i] ? 1 : 3)) & 3;
  }
  return { minX, minY, maxX, maxY };
}
