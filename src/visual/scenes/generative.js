// Four pieces from the canon of generative art, driven by live data.
//
// Truchet is the one people stop on, and the reason is worth naming: it
// accumulates. The picture is the history of the feed rather than its present
// moment, so leaving it running produces something, where a scene that fades
// only ever shows you the last few seconds. These four were chosen on that
// criterion.
//
//   Chladni      Ernst Chladni, 1787. The nodal lines of a vibrating plate --
//                the literal image of sound, which is what this project is.
//   10 PRINT     Commodore 64, 1982. One line of BASIC, and Truchet's sibling.
//   Substrate    Jared Tarbell, 2003. Cracks that grow until they meet.
//   Reaction     Gray-Scott. Turing's 1952 morphogenesis, as a texture.
//
// Two of them paint through an offscreen canvas rather than stroking every
// frame: a plate mode is a hundred thousand samples and a reaction grid is
// sixteen thousand cells, and neither can be redrawn sixty times a second in
// this budget. They are computed when they change and blitted when they do not.

import { noise2 } from './noise.js';
import { scratch, hexToRgb } from './paint.js';

const TAU = Math.PI * 2;

export const GENERATIVE_SCENES = {
  wavefield: {
    label: 'Wave field',
    positional: false,
    note: 'A grid of short strokes, each turned to face a slowly moving noise field. Events bend it where they land. The quietest thing here, and the one that holds up largest.',
    params: {
      grid: { label: 'Grid size', min: 8, max: 70, step: 1, default: 33 },
      scale: { label: 'Flow scale', min: 1, max: 100, step: 0.5, default: 35 },
      length: { label: 'Line length', min: 2, max: 40, step: 0.5, default: 11.5 },
      turn: { label: 'Drift', min: 0, max: 3, step: 0.02, default: 0.5 },
    },
    init(api) {
      api.scene.seed = Math.random() * 500;
      api.scene.bends = [];
    },
    event(p, api) {
      const s = api.scene;
      // An event is a local twist in the field, not a mark. It decays, so the
      // field always returns to the shape the noise gives it.
      s.bends.push({ x: p.x, y: p.y, r: Math.max(40, p.r * 2.4), turn: (p.pick - 0.5) * 3.4, born: api.now, color: p.color });
      const capB = Math.max(12, Math.min(90, Math.round((api.budget || 800) * 0.06)));
      if (s.bends.length > capB) s.bends.shift();
    },
    frame(ctx, api) {
      const s = api.scene;
      const n = Math.max(4, Math.round(api.param('grid')));
      const scale = api.param('scale') * 8;
      const len = api.param('length');
      const t = (api.now / 12000) * api.param('turn') + s.seed;

      // The field is square and centred, because a stroke grid stretched to a
      // wide canvas stops reading as a field and starts reading as a mistake.
      const side = Math.min(api.w, api.h) * 0.92;
      const ox = (api.w - side) / 2;
      const oy = (api.h - side) / 2;
      const step = side / n;

      // Bends are read once per frame rather than per stroke: a hundred strokes
      // times ninety bends is nine thousand distance checks, every frame.
      const live = s.bends.filter((b) => api.now - b.born < 14000);
      s.bends = live;

      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, step * 0.09);
      const base = api.palette.default;
      for (let gy = 0; gy < n; gy++) {
        for (let gx = 0; gx < n; gx++) {
          const cx = ox + (gx + 0.5) * step;
          const cy = oy + (gy + 0.5) * step;
          let a = noise2(cx / scale + t, cy / scale - t) * TAU * 2;
          let tint = null;
          let lift = 0;
          for (const b of live) {
            const dx = cx - b.x;
            const dy = cy - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > b.r * b.r) continue;
            const near = 1 - Math.sqrt(d2) / b.r;
            const age = 1 - (api.now - b.born) / 14000;
            const pull = near * near * age;
            a += b.turn * pull;
            if (pull > lift) { lift = pull; tint = b.color; }
          }
          const half = Math.min(step * 0.48, len * 0.5);
          ctx.globalAlpha = 0.35 + lift * 0.6;
          ctx.strokeStyle = lift > 0.04 ? tint || base : base;
          ctx.beginPath();
          ctx.moveTo(cx - Math.cos(a) * half, cy - Math.sin(a) * half);
          ctx.lineTo(cx + Math.cos(a) * half, cy + Math.sin(a) * half);
          ctx.stroke();
        }
      }
    },
  },

  chladni: {
    label: 'Chladni',
    positional: false,
    note: 'The nodal lines of a vibrating plate, after Ernst Chladni, 1787. Sand settles where the plate is still. Each event retunes it, and the figure walks to its new shape.',
    params: {
      sharpness: { label: 'Line sharpness', min: 4, max: 40, step: 0.5, default: 14 },
      travel: { label: 'Travel speed', min: 0.2, max: 6, step: 0.1, default: 1.6 },
      highest: { label: 'Highest mode', min: 5, max: 22, step: 1, default: 14 },
    },
    init(api) {
      const s = api.scene;
      s.n = 3;
      s.m = 2;
      s.tn = 3;
      s.tm = 2;
      s.dirty = true;
      s.age = 0;
    },
    event(p, api) {
      const s = api.scene;
      // Size chooses the mode. Higher modes are finer figures, so a large
      // event is a coarse, calm plate and a small one a dense lattice --
      // which is the inversion the whole project runs on.
      // Modes below about three give one enormous figure filling the plate,
      // which reads as a zoom rather than as a pattern. Real Chladni plates
      // are photographed well into double digits.
      const k = 1 - Math.min(1, p.r / 90);
      const top = api.param('highest');
      s.tn = 3 + Math.round(k * (top - 3));
      s.tm = 2 + Math.round(((p.pick + k) % 1) * (top - 2));
      if (s.tn === s.tm) s.tm += 1; // n === m is a blank plate
      s.hot = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      // Ease towards the new mode instead of cutting to it: the walk between
      // two figures is the part worth watching.
      const step = Math.min(1, (api.dt / 1000) * api.param('travel'));
      const near = (a, b) => Math.abs(a - b) < 0.01;
      if (!near(s.n, s.tn) || !near(s.m, s.tm)) {
        s.n += (s.tn - s.n) * step;
        s.m += (s.tm - s.m) * step;
        s.dirty = true;
      }

      const cv = scratch(api);
      if (s.dirty) {
        const g = api.scene.bufCtx;
        const w = cv.width;
        const h = cv.height;
        const img = g.createImageData(w, h);
        const d = img.data;
        const { n, m } = s;
        const sharp = api.param('sharpness');
        // The colour of the lines comes from the palette like everything else.
        const rgb = hexToRgb(api.palette.user || api.palette.default);
        for (let y = 0; y < h; y++) {
          const v = y / h;
          for (let x = 0; x < w; x++) {
            const u = x / w;
            // The standard square-plate solution: the difference of two
            // products, whose zero set is the pattern the sand draws.
            const f =
              Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) -
              Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v);
            // Near zero is a line. The falloff is what makes it sand rather
            // than a wireframe.
            const a = Math.max(0, 1 - Math.abs(f) * sharp);
            const i = (y * w + x) * 4;
            d[i] = rgb[0];
            d[i + 1] = rgb[1];
            d[i + 2] = rgb[2];
            d[i + 3] = Math.round(a * a * 235);
          }
        }
        g.putImageData(img, 0, 0);
        s.dirty = false;
      }

      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);

      // A brief flare on the plate each time it is struck.
      const since = api.now - (s.hot || -1e9);
      if (since < 600) {
        ctx.globalAlpha = (1 - since / 600) * 0.22;
        ctx.fillStyle = api.palette.alert;
        ctx.fillRect(0, 0, api.w, api.h);
      }
    },
  },

  tenprint: {
    label: '10 PRINT',
    positional: false,
    note: 'PRINT CHR$(205.5+RND(1)) — one line of Commodore BASIC from 1982, and the maze it draws forever. Truchet\'s sibling: each event flips one tile.',
    params: {
      cell: { label: 'Cell size', min: 8, max: 80, step: 1, default: 26, rebuild: true },
      weight: { label: 'Line weight', min: 0.03, max: 0.3, step: 0.005, default: 0.11 },
    },
    init(api) {
      const s = api.scene;
      const cell = api.param('cell');
      s.cols = Math.max(2, Math.ceil(api.w / cell));
      s.rows = Math.max(2, Math.ceil(api.h / cell));
      s.tile = new Uint8Array(s.cols * s.rows);
      s.heat = new Float32Array(s.cols * s.rows);
      for (let i = 0; i < s.tile.length; i++) s.tile[i] = Math.random() < 0.5 ? 1 : 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.tile) return;
      const cx = Math.min(s.cols - 1, Math.max(0, Math.floor((p.x / api.w) * s.cols)));
      const cy = Math.min(s.rows - 1, Math.max(0, Math.floor((p.y / api.h) * s.rows)));
      const i = cy * s.cols + cx;
      s.tile[i] ^= 1;
      s.heat[i] = 1;
      s.lastColor = p.color;
      s.lastRim = p.rim;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.tile) return;
      const w = api.w / s.cols;
      const h = api.h / s.rows;
      const decay = Math.min(0.05, api.dt / 1000) * 0.6;
      ctx.lineCap = 'square';
      const weight = api.param('weight');
      ctx.lineWidth = Math.max(1, Math.min(w, h) * weight);
      for (let y = 0; y < s.rows; y++) {
        for (let x = 0; x < s.cols; x++) {
          const i = y * s.cols + x;
          s.heat[i] = Math.max(0, s.heat[i] - decay);
          const x0 = x * w;
          const y0 = y * h;
          const hot = s.heat[i] > 0.02;
          ctx.globalAlpha = 0.42 + s.heat[i] * 0.58;
          ctx.strokeStyle = hot ? s.lastColor || api.palette.default : api.palette.default;
          ctx.beginPath();
          if (s.tile[i]) {
            ctx.moveTo(x0, y0 + h);
            ctx.lineTo(x0 + w, y0);
          } else {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + w, y0 + h);
          }
          ctx.stroke();
          if (api.depth && hot) {
            ctx.globalAlpha = s.heat[i] * 0.85;
            ctx.strokeStyle = s.lastRim || ctx.strokeStyle;
            ctx.lineWidth = Math.max(0.6, Math.min(w, h) * weight * 0.4);
            ctx.stroke();
            ctx.lineWidth = Math.max(1, Math.min(w, h) * weight);
          }
        }
      }
    },
  },

  substrate: {
    label: 'Substrate',
    positional: false,
    preview: { dt: 30, frames: 220 }, // cracks need time to travel
    note: 'Cracks that travel until they meet another, then split off at right angles. After Jared Tarbell, 2003. The longer it runs, the more it looks like a city nobody planned.',
    params: {
      branch: { label: 'Branching', min: 0, max: 0.9, step: 0.01, default: 0.45 },
      speed: { label: 'Crack speed', min: 20, max: 300, step: 5, default: 90 },
      sand: { label: 'Sand', min: 0, max: 1, step: 0.02, default: 0.4 },
    },
    init(api) {
      const s = api.scene;
      // A coarse occupancy grid rather than pixel reads: reading the canvas
      // back per crack per frame is the one thing that would make this
      // unaffordable.
      s.gw = Math.max(8, Math.round(api.w / 3));
      s.gh = Math.max(8, Math.round(api.h / 3));
      s.grid = new Int16Array(s.gw * s.gh).fill(-1);
      s.cracks = [];
      s.painted = null;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.grid) return;
      const cap = Math.max(24, Math.min(260, Math.round((api.budget || 800) * 0.2)));
      if (s.cracks.length >= cap) return;
      // Large events start along a cardinal, small ones anywhere: a big change
      // lays down structure, a small one fills it in.
      const straight = p.r > 45;
      const angle = straight
        ? Math.round(p.pick * 4) * (Math.PI / 2)
        : p.pick * TAU;
      s.cracks.push({
        x: p.x, y: p.y, a: angle,
        colour: p.color, rim: p.rim,
        life: 0, width: Math.max(0.6, Math.min(2.2, p.r * 0.03)),
      });
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.grid) return;

      // Everything already drawn lives on the offscreen canvas, so the visible
      // one is a single blit and the picture never has to be redrawn.
      const cv = scratch(api);
      const g = s.bufCtx;
      if (!s.painted) {
        g.clearRect(0, 0, cv.width, cv.height);
        s.painted = true;
      }

      const step = Math.min(4, Math.max(1, (api.dt / 1000) * api.param('speed')));
      g.lineCap = 'butt';
      for (let i = s.cracks.length - 1; i >= 0; i--) {
        const c = s.cracks[i];
        const px = c.x;
        const py = c.y;
        c.x += Math.cos(c.a) * step;
        c.y += Math.sin(c.a) * step;
        c.life += step;

        const gx = Math.floor((c.x / api.w) * s.gw);
        const gy = Math.floor((c.y / api.h) * s.gh);
        const off = gy * s.gw + gx;
        const outside = gx < 0 || gy < 0 || gx >= s.gw || gy >= s.gh;
        // A crack ends where it meets one that is not itself.
        const hit = !outside && s.grid[off] >= 0 && s.grid[off] !== i && c.life > 6;

        if (!outside) {
          g.globalAlpha = 0.85;
          g.strokeStyle = c.colour;
          g.lineWidth = c.width;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(c.x, c.y);
          g.stroke();
          // A sand trail beside the line, which is Tarbell's own touch and
          // most of why the original looks like paper rather than vector art.
          if (api.depth && Math.random() < api.param('sand')) {
            g.globalAlpha = 0.05;
            g.strokeStyle = c.rim || c.colour;
            const spread = 6 + Math.random() * 10;
            g.lineWidth = 0.7;
            g.beginPath();
            g.moveTo(px + Math.cos(c.a + Math.PI / 2) * spread, py + Math.sin(c.a + Math.PI / 2) * spread);
            g.lineTo(c.x + Math.cos(c.a + Math.PI / 2) * spread, c.y + Math.sin(c.a + Math.PI / 2) * spread);
            g.stroke();
          }
          s.grid[off] = i;
        }

        if (outside || hit || c.life > Math.max(api.w, api.h) * 1.6) {
          s.cracks.splice(i, 1);
          // A meeting spawns two children at right angles, which is what turns
          // a handful of lines into a lattice.
          if (hit && s.cracks.length < 200) {
            for (const turn of [Math.PI / 2, -Math.PI / 2]) {
              if (Math.random() < api.param('branch')) {
                s.cracks.push({
                  x: c.x, y: c.y, a: c.a + turn,
                  colour: c.colour, rim: c.rim, life: 0, width: c.width * 0.85,
                });
              }
            }
          }
        }
      }

      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  reaction: {
    label: 'Reaction',
    positional: false,
    preview: { dt: 60, frames: 200 },
    note: 'Two substances, one feeding on the other. Gray-Scott, after Turing\'s 1952 account of how a uniform thing becomes a patterned one. Each event drops reagent in, and the pattern eats outward.',
    // Feed and kill are the two numbers that decide whether this makes spots,
    // stripes, or a culture that divides forever. The whole zoo of Gray-Scott
    // behaviour lives in a small region of them, so they are worth a dial each.
    params: {
      feed: { label: 'Feed', min: 0.01, max: 0.08, step: 0.0005, default: 0.037 },
      kill: { label: 'Kill', min: 0.04, max: 0.075, step: 0.0002, default: 0.06 },
      grain: { label: 'Grain', min: 2, max: 12, step: 0.5, default: 4, rebuild: true },
    },
    init(api) {
      const s = api.scene;
      // Fine enough that the upscale is not a blur. Eighty cells across a
      // laptop screen is fourteen pixels a cell, and smoothing turns that into
      // porridge; this is about four.
      const grain = api.param('grain') || 4;
      s.gw = Math.max(30, Math.min(260, Math.round(api.w / grain)));
      s.gh = Math.max(20, Math.min(190, Math.round(api.h / grain)));
      const n = s.gw * s.gh;
      s.a = new Float32Array(n).fill(1);
      s.b = new Float32Array(n);
      s.a2 = new Float32Array(n).fill(1);
      s.b2 = new Float32Array(n);
      s.img = null;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.b) return;
      const gx = Math.floor((p.x / api.w) * s.gw);
      const gy = Math.floor((p.y / api.h) * s.gh);
      // Small. A large seed floods the plate and the pattern never forms;
      // Gray-Scott wants a nudge, not a dose.
      const rad = Math.max(1, Math.min(3, Math.round(p.r / 34)));
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const x = (gx + dx + s.gw) % s.gw;
          const y = (gy + dy + s.gh) % s.gh;
          s.b[y * s.gw + x] = 1;
        }
      }
      s.lastColor = p.color;
      // Polarity nudges the chemistry: additions make the pattern spread,
      // removals make it break up. The same event reads differently.
      s.kill = Math.max(0.045, Math.min(0.07, s.kill + (p.rot > Math.PI ? 0.0004 : -0.0004)));
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.b) return;
      const { gw, gh } = s;
      // Read live, so turning a dial changes the chemistry under a pattern that
      // is already growing rather than after a restart.
      const feed = api.param('feed');
      const kill = api.param('kill');
      const dA = 1.0;
      const dB = 0.5;

      // The grid wraps. Leaving the border rows out of the simulation makes
      // them a reservoir that never runs out of A, and the pattern then dies
      // everywhere except in a bright rim around the edge -- which is exactly
      // what the first version drew. A torus has no edge to be privileged.
      if (!s.up) {
        s.up = new Int32Array(gh);
        s.dn = new Int32Array(gh);
        s.lf = new Int32Array(gw);
        s.rt = new Int32Array(gw);
        for (let y = 0; y < gh; y++) {
          s.up[y] = ((y - 1 + gh) % gh) * gw;
          s.dn[y] = ((y + 1) % gh) * gw;
        }
        for (let x = 0; x < gw; x++) {
          s.lf[x] = (x - 1 + gw) % gw;
          s.rt[x] = (x + 1) % gw;
        }
      }
      const { up, dn, lf, rt } = s;

      // Two passes a frame reads as alive; on a large grid one is all the
      // budget allows, and the pattern simply evolves at half the speed.
      const passes = gw * gh > 22000 ? 1 : 2;
      for (let pass = 0; pass < passes; pass++) {
        const a = s.a;
        const b = s.b;
        const a2 = s.a2;
        const b2 = s.b2;
        for (let y = 0; y < gh; y++) {
          const row = y * gw;
          const u = up[y];
          const d = dn[y];
          for (let x = 0; x < gw; x++) {
            const i = row + x;
            const l = lf[x];
            const r = rt[x];
            // The nine-point Laplacian Gray-Scott is normally written with:
            // 0.2 on the sides, 0.05 on the corners, minus the centre.
            const lapA =
              (a[row + l] + a[row + r] + a[u + x] + a[d + x]) * 0.2 +
              (a[u + l] + a[u + r] + a[d + l] + a[d + r]) * 0.05 - a[i];
            const lapB =
              (b[row + l] + b[row + r] + b[u + x] + b[d + x]) * 0.2 +
              (b[u + l] + b[u + r] + b[d + l] + b[d + r]) * 0.05 - b[i];
            const abb = a[i] * b[i] * b[i];
            a2[i] = Math.min(1, Math.max(0, a[i] + dA * lapA - abb + feed * (1 - a[i])));
            b2[i] = Math.min(1, Math.max(0, b[i] + dB * lapB + abb - (kill + feed) * b[i]));
          }
        }
        s.a = a2;
        s.b = b2;
        s.a2 = a;
        s.b2 = b;
      }

      const cv = scratch(api, 'rd', true);
      const g = s.rdCtx;
      if (!s.img || s.img.width !== gw || s.img.height !== gh) {
        s.img = g.createImageData(gw, gh);
      }
      const d = s.img.data;
      // The palette's own category colour, not the last event's shade: with
      // colour variety on, that shade can be a near-white, and a Turing pattern
      // rendered in bathroom-tile grey is a waste of a palette.
      const ink = hexToRgb(api.palette.user || api.palette.default);
      const hot = hexToRgb(api.palette.alert || api.palette.user);
      const bg = hexToRgb(api.palette.background);
      for (let i = 0; i < gw * gh; i++) {
        const raw = s.b[i];
        const v = Math.min(1, raw * 2.4);
        // The densest cores take the alert colour, so a pattern that is merely
        // spreading looks different from one that is thriving.
        const heat = Math.min(1, Math.max(0, (raw - 0.32) * 4));
        const r = ink[0] + (hot[0] - ink[0]) * heat;
        const g2 = ink[1] + (hot[1] - ink[1]) * heat;
        const b3 = ink[2] + (hot[2] - ink[2]) * heat;
        const j = i * 4;
        d[j] = bg[0] + (r - bg[0]) * v;
        d[j + 1] = bg[1] + (g2 - bg[1]) * v;
        d[j + 2] = bg[2] + (b3 - bg[2]) * v;
        d[j + 3] = 255;
      }
      g.putImageData(s.img, 0, 0);

      // Smoothing on the way up is what turns a coarse grid into something
      // that reads as a membrane rather than as pixels.
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cv, 0, 0, gw, gh, 0, 0, api.w, api.h);
    },
  },
};
