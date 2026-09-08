// Systems: six that are run rather than drawn.
//
// A drawing machine traces a curve and stops. These are simulations -- a
// growth, a physics, an iterated map -- and what they show at minute ten is
// not what they showed at minute one. The feed is not choosing a picture from
// them; it is disturbing something that then goes on by itself.
//
//   Coral        Diffusion-limited aggregation. Witten and Sander, 1981.
//   Sandpile     The Abelian sandpile. Bak, Tang and Wiesenfeld, 1987.
//   Ripple tank  The wave equation, integrated on a grid.
//   Burin        The canvas engraved, with event density as the tone.
//   Attractor    Clifford's map, iterated a few thousand times a frame.
//   Voronoi      Every point coloured by which event is nearest.
//
// Four of them keep an offscreen canvas: what they draw is the history of the
// feed, and no machine redraws an hour of history sixty times a second.

import { scratch, toRgb } from './paint.js';
import { burin, hatch, vignette, gradientTone } from '../engrave.js';

const TAU = Math.PI * 2;

/** The scene's buffer, cleared the first time it is asked for. */
function canvasFor(api, key = 'buf', readBack = false) {
  const cv = scratch(api, key, readBack);
  const g = api.scene[key + 'Ctx'];
  if (!api.scene[key + 'Clean']) {
    g.clearRect(0, 0, cv.width, cv.height);
    api.scene[key + 'Clean'] = true;
  }
  return g;
}

export const SYSTEM_SCENES = {
  coral: {
    label: 'Coral',
    positional: true,
    preview: { dt: 34, frames: 220 },
    note: 'Diffusion-limited aggregation, after Witten and Sander, 1981. A particle wanders until it touches what is already there, and sticks. It is how frost, soot, copper and coral all grow, and the branching is not in the rule -- it emerges because the tips reach the wanderers first.',
    params: {
      grain: { label: 'Grain', min: 1.5, max: 8, step: 0.5, default: 3, rebuild: true },
      walkers: { label: 'Walkers per event', min: 1, max: 60, step: 1, default: 14 },
      steps: { label: 'Steps per frame', min: 200, max: 9000, step: 100, default: 2600 },
      stick: { label: 'Stickiness', min: 0.05, max: 1, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const grain = api.param('grain');
      s.gw = Math.max(40, Math.min(420, Math.round(api.w / grain)));
      s.gh = Math.max(30, Math.min(300, Math.round(api.h / grain)));
      s.grid = new Uint8Array(s.gw * s.gh);
      s.walkers = [];
      s.bufClean = false;
      // A seed. Without one there is nothing for the first walker to touch and
      // it wanders until the heat death of the session.
      const cx = s.gw >> 1;
      const cy = s.gh >> 1;
      s.grid[cy * s.gw + cx] = 1;
      s.radius = 2;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.grid) return;
      const n = Math.round(api.param('walkers'));
      const cap = Math.max(60, Math.min(1400, Math.round((api.budget || 800) * 1.2)));
      for (let i = 0; i < n && s.walkers.length < cap; i++) {
        // Released on a circle a little outside the cluster, which is the
        // standard trick: a walker started far away spends its whole life
        // getting here and contributes nothing.
        const a = Math.random() * TAU;
        const r = s.radius + 3 + Math.random() * 4;
        s.walkers.push({
          x: (s.gw >> 1) + Math.cos(a) * r,
          y: (s.gh >> 1) + Math.sin(a) * r,
          color: p.color,
        });
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.grid) return;
      const cv = scratch(api);
      const g = canvasFor(api);
      if (!g) return;
      const { gw, gh, grid } = s;
      const cx = gw >> 1;
      const cy = gh >> 1;
      const stick = api.param('stick');
      const budget = Math.round(api.param('steps'));
      const cellW = api.w / gw;
      const cellH = api.h / gh;
      const kill = Math.min(gw, gh) * 0.48;

      const occupied = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && grid[y * gw + x];

      let spent = 0;
      for (let i = s.walkers.length - 1; i >= 0 && spent < budget; i--) {
        const w = s.walkers[i];
        let alive = true;
        // Each walker gets a slice of the frame's budget rather than running
        // to completion: one unlucky walker must not stall the others.
        for (let step = 0; step < 40 && spent < budget; step++) {
          spent++;
          w.x += Math.random() * 2 - 1;
          w.y += Math.random() * 2 - 1;
          const gx = Math.round(w.x);
          const gy = Math.round(w.y);
          const dist = Math.hypot(gx - cx, gy - cy);
          if (dist > kill) {
            // Wandered out of the arena. Put it back on the release circle
            // rather than deleting it: the cluster is still hungry.
            const a = Math.random() * TAU;
            const r = s.radius + 3 + Math.random() * 4;
            w.x = cx + Math.cos(a) * r;
            w.y = cy + Math.sin(a) * r;
            continue;
          }
          if (occupied(gx - 1, gy) || occupied(gx + 1, gy) ||
              occupied(gx, gy - 1) || occupied(gx, gy + 1)) {
            // Stickiness below one lets a walker slide along the cluster
            // before it settles, which fills the fjords in and makes the form
            // denser -- the difference between frost and a sponge.
            if (Math.random() > stick) continue;
            if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) break;
            grid[gy * gw + gx] = 1;
            if (dist + 1 > s.radius) s.radius = dist + 1;
            g.globalAlpha = 0.92;
            g.fillStyle = w.color;
            g.fillRect(gx * cellW, gy * cellH, Math.max(1, cellW), Math.max(1, cellH));
            s.walkers.splice(i, 1);
            alive = false;
            break;
          }
        }
        if (!alive) continue;
      }
      g.globalAlpha = 1;
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  sandpile: {
    label: 'Sandpile',
    positional: true,
    note: 'Drop grains on a square. Any square holding four gives one to each neighbour, which may push those over too. Bak, Tang and Wiesenfeld called it self-organised criticality in 1987: the pile arranges itself so that the next grain may do nothing at all, or set off an avalanche across the whole field.',
    params: {
      grain: { label: 'Grain', min: 2, max: 14, step: 1, default: 5, rebuild: true },
      drop: { label: 'Grains per event', min: 1, max: 400, step: 1, default: 40 },
      topple: { label: 'Topples per frame', min: 500, max: 60000, step: 500, default: 12000 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const grain = api.param('grain');
      s.gw = Math.max(24, Math.min(260, Math.round(api.w / grain)));
      s.gh = Math.max(18, Math.min(200, Math.round(api.h / grain)));
      s.pile = new Uint16Array(s.gw * s.gh);
      s.next = new Uint16Array(s.gw * s.gh);
      s.img = null;
      s.colors = null;
      s.active = true;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.pile) return;
      const gx = Math.min(s.gw - 1, Math.max(0, Math.floor((p.x / api.w) * s.gw)));
      const gy = Math.min(s.gh - 1, Math.max(0, Math.floor((p.y / api.h) * s.gh)));
      s.pile[gy * s.gw + gx] += Math.round(api.param('drop'));
      s.active = true;
      s.lastColor = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.pile) return;
      const { gw, gh, pile } = s;

      // Topple in sweeps over the whole grid rather than from a work queue.
      //
      // A queue is the obvious way and it is unbounded: one avalanche pushes a
      // cell for every topple, and a busy feed measured twenty thousand
      // entries against a ceiling of eight hundred. A sweep is O(cells), which
      // for this grid is fifty thousand and costs less than the queue did --
      // and because the pile is Abelian, toppling every ready cell at once
      // reaches exactly the same final state as toppling them one at a time.
      const sweeps = Math.max(1, Math.min(24, Math.round(api.param('topple') / (gw * gh) * 6)));
      for (let pass = 0; pass < sweeps && s.active; pass++) {
        let moved = false;
        for (let i = 0; i < gw * gh; i++) {
          if (pile[i] < 4) continue;
          moved = true;
          const x = i % gw;
          const y = (i / gw) | 0;
          const give = pile[i] >> 2;
          pile[i] -= give * 4;
          // Sand that falls off the edge is gone, which is what stops the pile
          // filling the whole field and going flat.
          if (x > 0) pile[i - 1] += give;
          if (x < gw - 1) pile[i + 1] += give;
          if (y > 0) pile[i - gw] += give;
          if (y < gh - 1) pile[i + gw] += give;
        }
        s.active = moved;
      }

      const cv = scratch(api, 'sp', true);
      const g = s.spCtx;
      if (!s.img || s.img.width !== gw || s.img.height !== gh) {
        s.img = g.createImageData(gw, gh);
        s.colors = null;
      }
      if (!s.colors) {
        // Four heights, four colours, straight from the palette. The classic
        // pictures of this use four and no more, and the reason is that the
        // pile only ever rests at nought to three.
        // Four heights, and they have to be four steps of ONE progression
        // rather than four different colours: a pile is a height field, and
        // rendering it in four unrelated hues turns a landscape into confetti.
        const ground = toRgb(api.palette.background);
        const ink = toRgb(api.palette.user || api.palette.default);
        const hot = toRgb(api.palette.alert || api.palette.anon);
        const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
        s.colors = [
          mix(ground, ink, 0.12),
          mix(ground, ink, 0.45),
          mix(ground, ink, 0.85),
          mix(ink, hot, 0.75),
        ];
      }
      const d = s.img.data;
      for (let i = 0; i < gw * gh; i++) {
        const c = s.colors[Math.min(3, pile[i])];
        const j = i * 4;
        d[j] = c[0];
        d[j + 1] = c[1];
        d[j + 2] = c[2];
        d[j + 3] = 255;
      }
      g.putImageData(s.img, 0, 0);
      ctx.globalAlpha = 1;
      // Not smoothed: the whole subject is which square holds how many, and
      // interpolating between them is a lie about the state.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cv, 0, 0, gw, gh, 0, 0, api.w, api.h);
      ctx.imageSmoothingEnabled = true;
    },
  },

  ripple: {
    label: 'Ripple tank',
    positional: true,
    note: 'The wave equation, integrated on a grid: each cell is pulled towards the average of its neighbours and overshoots. Two events near each other interfere, and the pattern between them is the same one a ripple tank makes in a lecture theatre.',
    params: {
      grain: { label: 'Grain', min: 2, max: 10, step: 1, default: 3, rebuild: true },
      speed: { label: 'Wave speed', min: 0.05, max: 0.5, step: 0.01, default: 0.42 },
      // Damping is per frame, so it compounds sixty times a second: 0.996
      // leaves four fifths of the energy after a second and a busy feed then
      // pours in faster than the tank can lose it. The picture went flat, which
      // is what a tank looks like when every wave is over the top of the scale.
      damping: { label: 'Damping', min: 0.9, max: 0.9999, step: 0.001, default: 0.986 },
      force: { label: 'Force', min: 0.05, max: 2, step: 0.05, default: 0.18 },
    },
    init(api) {
      const s = api.scene;
      const grain = api.param('grain');
      s.gw = Math.max(40, Math.min(340, Math.round(api.w / grain)));
      s.gh = Math.max(30, Math.min(240, Math.round(api.h / grain)));
      const n = s.gw * s.gh;
      s.a = new Float32Array(n);
      s.b = new Float32Array(n);
      s.img = null;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.a) return;
      const gx = Math.min(s.gw - 2, Math.max(1, Math.floor((p.x / api.w) * s.gw)));
      const gy = Math.min(s.gh - 2, Math.max(1, Math.floor((p.y / api.h) * s.gh)));
      // A drop, not a spike: a single cell excites every wavelength the grid
      // can hold, most of which it cannot propagate, and the result is noise.
      const r = Math.max(1, Math.min(6, Math.round(p.r / 22)));
      const force = api.param('force') * (0.5 + Math.min(1.5, p.r / 70));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r * r) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (x < 1 || y < 1 || x >= s.gw - 1 || y >= s.gh - 1) continue;
          s.a[y * s.gw + x] -= force * (1 - Math.sqrt(d2) / (r + 1));
        }
      }
      s.color = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.a) return;
      const { gw, gh } = s;
      const c2 = api.param('speed');
      const damp = api.param('damping');
      const a = s.a;
      const b = s.b;

      // u(t+1) = 2u(t) - u(t-1) + c^2 . laplacian(u), damped. The edges are
      // held at zero, so a wave reflects off them exactly as it would off the
      // wall of a real tank.
      for (let y = 1; y < gh - 1; y++) {
        const row = y * gw;
        for (let x = 1; x < gw - 1; x++) {
          const i = row + x;
          const lap = a[i - 1] + a[i + 1] + a[i - gw] + a[i + gw] - 4 * a[i];
          b[i] = (2 * a[i] - b[i] + c2 * lap) * damp;
        }
      }
      s.a = b;
      s.b = a;

      const cv = scratch(api, 'rp', true);
      const g = s.rpCtx;
      if (!s.img || s.img.width !== gw || s.img.height !== gh) {
        s.img = g.createImageData(gw, gh);
      }
      const d = s.img.data;
      const bg = toRgb(api.palette.background);
      const up = toRgb(api.palette.user || api.palette.default);
      const down = toRgb(api.palette.anon || api.palette.default);
      const u = s.a;
      for (let i = 0; i < gw * gh; i++) {
        const v = u[i];
        // Crest and trough take different colours. A single colour by
        // magnitude gives twice as many rings as there really are, and the
        // picture stops being a wave.
        //
        // Through a soft curve, not a hard clamp. The first version scaled by
        // 2.2 and clipped, so a busy feed pushed most of the tank past the top
        // of the scale and the rings became two flat continents. tanh keeps
        // every level distinguishable however hard the water is hit.
        const k = Math.tanh(Math.abs(v) * 3.4);
        const c = v > 0 ? up : down;
        const j = i * 4;
        d[j] = bg[0] + (c[0] - bg[0]) * k;
        d[j + 1] = bg[1] + (c[1] - bg[1]) * k;
        d[j + 2] = bg[2] + (c[2] - bg[2]) * k;
        d[j + 3] = 255;
      }
      g.putImageData(s.img, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cv, 0, 0, gw, gh, 0, 0, api.w, api.h);
    },
  },

  attractor: {
    label: 'Attractor',
    positional: false,
    preview: { dt: 30, frames: 200 },
    note: 'Clifford Pickover\'s map, iterated: take a point, apply two lines of trigonometry, plot it, repeat. The set of places it can settle is the attractor, and four numbers decide the whole of it. Events move those numbers, so the form is never quite the same twice.',
    params: {
      a: { label: 'a', min: -2.5, max: 2.5, step: 0.01, default: -1.4 },
      b: { label: 'b', min: -2.5, max: 2.5, step: 0.01, default: 1.6 },
      c: { label: 'c', min: -2.5, max: 2.5, step: 0.01, default: 1 },
      d: { label: 'd', min: -2.5, max: 2.5, step: 0.01, default: 0.7 },
      rate: { label: 'Points per second', min: 2000, max: 90000, step: 1000, default: 26000 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.97 },
    },
    init(api) {
      const s = api.scene;
      s.x = 0.1;
      s.y = 0.1;
      s.nudge = { a: 0, b: 0, c: 0, d: 0 };
      s.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      // An event pushes the constants and the push bleeds away, so the form
      // drifts while the feed is busy and settles when it is not.
      const k = 0.05 + Math.min(0.25, p.r / 400);
      s.nudge.a += (p.pick - 0.5) * k;
      s.nudge.b += (((p.pick * 7) % 1) - 0.5) * k;
      s.nudge.c += (((p.pick * 13) % 1) - 0.5) * k * 0.6;
      s.nudge.d += (((p.pick * 29) % 1) - 0.5) * k * 0.6;
      s.color = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = canvasFor(api);
      if (!g) return;

      const decay = Math.pow(0.6, api.dt / 1000);
      for (const k of ['a', 'b', 'c', 'd']) s.nudge[k] *= decay;
      const A = api.param('a') + s.nudge.a;
      const B = api.param('b') + s.nudge.b;
      const C = api.param('c') + s.nudge.c;
      const D = api.param('d') + s.nudge.d;

      // The map lives inside roughly |x| < 1 + |c|, so the fit is exact
      // rather than a guess, and changing c does not push it off the canvas.
      const ext = 1 + Math.max(Math.abs(C), Math.abs(D));
      const scale = Math.min(api.w, api.h) / (2.1 * ext);
      const ox = api.w / 2;
      const oy = api.h / 2;

      const n = Math.min(40000, Math.round(api.param('rate') * (api.dt / 1000)));
      g.fillStyle = s.color || api.palette.user;
      g.globalAlpha = 0.22;
      let x = s.x;
      let y = s.y;
      for (let i = 0; i < n; i++) {
        const nx = Math.sin(A * y) + C * Math.cos(A * x);
        const ny = Math.sin(B * x) + D * Math.cos(B * y);
        x = nx;
        y = ny;
        g.fillRect(ox + x * scale, oy + y * scale, 1, 1);
      }
      s.x = x;
      s.y = y;
      g.globalAlpha = 1;

      const keep = api.param('hold');
      if (keep < 0.999) {
        g.save();
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = `rgba(0,0,0,${(1 - keep) * Math.min(0.05, api.dt / 1000) * 2})`;
        g.fillRect(0, 0, cv.width, cv.height);
        g.restore();
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  voronoi: {
    label: 'Voronoi',
    positional: true,
    note: 'Every point on the canvas takes the colour of the event nearest to it. The cell boundaries are exactly halfway between two events, so the picture is a map of which one owns where -- and it redraws itself completely each time one arrives.',
    params: {
      grain: { label: 'Grain', min: 2, max: 12, step: 1, default: 4, rebuild: true },
      sites: { label: 'Events kept', min: 3, max: 120, step: 1, default: 34 },
      edges: { label: 'Edges', min: 0, max: 1, step: 0.02, default: 0.55 },
      shade: { label: 'Cell shading', min: 0, max: 1, step: 0.02, default: 0.35 },
    },
    init(api) {
      const s = api.scene;
      const grain = api.param('grain');
      s.gw = Math.max(30, Math.min(320, Math.round(api.w / grain)));
      s.gh = Math.max(20, Math.min(220, Math.round(api.h / grain)));
      s.img = null;
      s.dirty = true;
    },
    event(p, api) {
      // Only a redraw is scheduled. The cells are a function of the events on
      // screen, so recomputing them per frame would be recomputing the same
      // answer sixty times a second.
      api.scene.dirty = true;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.gw) return;
      const { gw, gh } = s;
      const keep = Math.round(api.param('sites'));
      const live = api.particles.slice(-keep);
      const cv = scratch(api, 'vr', true);
      const g = s.vrCtx;
      if (!s.img || s.img.width !== gw || s.img.height !== gh) {
        s.img = g.createImageData(gw, gh);
        s.dirty = true;
      }
      // Redrawn when the set of owners changes, which is when an event arrives
      // or one ages out -- not every frame.
      if (s.dirty || live.length !== s.count) {
        s.count = live.length;
        s.dirty = false;
        const d = s.img.data;
        const bg = toRgb(api.palette.background);
        if (!live.length) {
          for (let i = 0; i < gw * gh; i++) {
            const j = i * 4;
            d[j] = bg[0];
            d[j + 1] = bg[1];
            d[j + 2] = bg[2];
            d[j + 3] = 255;
          }
        } else {
          const sx = live.map((p) => (p.x / api.w) * gw);
          const sy = live.map((p) => (p.y / api.h) * gh);
          const rgb = live.map((p) => toRgb(p.color));
          const edge = api.param('edges');
          const shade = api.param('shade');
          for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
              let best = Infinity;
              let second = Infinity;
              let owner = 0;
              for (let k = 0; k < live.length; k++) {
                const dx = x - sx[k];
                const dy = y - sy[k];
                const dd = dx * dx + dy * dy;
                if (dd < best) {
                  second = best;
                  best = dd;
                  owner = k;
                } else if (dd < second) {
                  second = dd;
                }
              }
              // The distance to the second-nearest site is what draws the
              // boundary: where two owners are equally near, this goes to
              // zero, and that set of points IS the edge. No edge detection,
              // no second pass.
              const gap = Math.sqrt(second) - Math.sqrt(best);
              const line = edge > 0 ? Math.max(0, 1 - gap / (1.2 + edge * 2.5)) : 0;
              // Shading by distance gives each cell a soft centre, so a field
              // of flat colours becomes a field of objects.
              const lit = 1 - Math.min(1, Math.sqrt(best) / (gw * 0.22)) * shade;
              const c = rgb[owner];
              const j = (y * gw + x) * 4;
              const k2 = (1 - line) * lit;
              d[j] = bg[0] + (c[0] - bg[0]) * k2;
              d[j + 1] = bg[1] + (c[1] - bg[1]) * k2;
              d[j + 2] = bg[2] + (c[2] - bg[2]) * k2;
              d[j + 3] = 255;
            }
          }
        }
        g.putImageData(s.img, 0, 0);
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cv, 0, 0, gw, gh, 0, 0, api.w, api.h);
    },
  },

  burin: {
    label: 'Burin',
    positional: true,
    preview: { dt: 60, frames: 90 },
    note: 'The canvas cut as an engraving, with the density of events as the tone. Every line swells where the feed has been busy and tapers to nothing where it has not, which is exactly how a nineteenth-century plate is shaded -- and it is the same engine that cuts the kit cards.',
    params: {
      spacing: { label: 'Line spacing', min: 3, max: 22, step: 0.5, default: 9 },
      weight: { label: 'Line weight', min: 0.5, max: 8, step: 0.1, default: 3.4 },
      angle: { label: 'Angle', min: 0, max: 180, step: 1, default: 22 },
      cross: { label: 'Cross-hatching', min: 0, max: 1, step: 0.02, default: 0.35 },
      memory: { label: 'How long the tone holds', min: 1000, max: 60000, step: 500, default: 14000 },
    },
    init(api) {
      const s = api.scene;
      // A coarse field of "how much has happened here", blurred: the tone of
      // an engraving is a smooth thing, and a per-event field is not.
      s.tw = 26;
      s.th = 16;
      s.heat = new Float32Array(s.tw * s.th);
      s.blur = new Float32Array(s.tw * s.th);
      s.last = -1e9;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.heat) return;
      const gx = Math.min(s.tw - 1, Math.max(0, Math.floor((p.x / api.w) * s.tw)));
      const gy = Math.min(s.th - 1, Math.max(0, Math.floor((p.y / api.h) * s.th)));
      s.heat[gy * s.tw + gx] += 0.5 + Math.min(1.6, p.r / 60);
      s.color = p.color;
      s.rim = p.rim;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.heat) return;
      const { tw, th } = s;
      // The tone fades, so the plate is a record of the last minute rather
      // than of the session. Without it the whole thing goes black and stays.
      const fade = Math.pow(0.5, api.dt / api.param('memory'));
      for (let i = 0; i < s.heat.length; i++) s.heat[i] *= fade;

      // A box blur, twice, which is close enough to a Gaussian and is what
      // turns a grid of counts into a field of tone.
      for (let pass = 0; pass < 2; pass++) {
        const src = pass ? s.blur : s.heat;
        const dst = pass ? s.heat : s.blur;
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            let sum = 0;
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx;
                const yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue;
                sum += src[yy * tw + xx];
                n++;
              }
            }
            dst[y * tw + x] = sum / n;
          }
        }
      }

      // The tone is relative, not absolute.
      //
      // An absolute floor was the first fix for a flat plate, and it broke the
      // preview cards: thirty-four events on a thumbnail never reach it, so
      // the card came out blank. An engraving is a tone MAP -- the darkest
      // passage is the darkest passage, whatever the absolute numbers -- so
      // the field is scaled by its own maximum, with a floor on the divisor so
      // that a nearly empty plate stays nearly empty instead of being
      // amplified into a screen of lines.
      const field = s.heat;
      let top = 0;
      let low = Infinity;
      for (let i = 0; i < field.length; i++) {
        if (field[i] > top) top = field[i];
        if (field[i] < low) low = field[i];
      }
      if (!Number.isFinite(low)) low = 0;
      // Contrast from the range, darkness from the level -- and both are
      // needed. Scaling by the maximum alone made a uniform field uniformly
      // black, because on a uniform field the maximum is also the average;
      // an absolute floor made a preview card blank, because thirty-four
      // events never reach it. Stretching between the field's own ends gives
      // the plate its contrast, and multiplying by how much has actually
      // happened keeps a quiet plate quiet.
      const span = 1 / Math.max(0.05, top - low);
      // The gate is only there to keep a plate with nothing on it blank, so
      // the threshold is low: measured, a preview card of thirty-four events
      // reaches about a tenth, and against a threshold of 1.6 it drew nothing
      // at all. Any real activity clears this; a field that has decayed away
      // does not.
      const level = Math.min(1, top / 0.09);
      const tone = (x, y) => {
        const u = Math.max(0, Math.min(tw - 1.001, (x / api.w) * tw - 0.5));
        const v = Math.max(0, Math.min(th - 1.001, (y / api.h) * th - 0.5));
        const x0 = u | 0;
        const y0 = v | 0;
        const fx = u - x0;
        const fy = v - y0;
        const i = y0 * tw + x0;
        const a = field[i] * (1 - fx) + field[i + 1] * fx;
        const b = field[i + tw] * (1 - fx) + field[i + tw + 1] * fx;
        // Compressed: a busy patch is thousands of times busier than a quiet
        // one, and a linear tone would be one black blot on a white plate.
        // The gain is large because the field is: a blurred count over a
        // 26 by 16 grid is a small number everywhere, and the first version
        // multiplied it by 0.62 and drew a plate with no tone on it at all.
        const raw = ((a * (1 - fy) + b * fy) - low) * span;
        // Curved, so the middle of the range gets the contrast rather than the
        // extremes: events land all over the canvas, and a straight mapping
        // gives an even screen of lines -- a texture, not a picture.
        return Math.min(1, Math.pow(Math.max(0, raw), 0.8) * level);
      };

      const shaded = vignette(tone, api.w, api.h, { inset: 0.02, soft: 0.08 });
      const angle = (api.param('angle') * Math.PI) / 180;
      const spacing = api.param('spacing');
      const weight = api.param('weight');

      ctx.fillStyle = s.color || api.palette.user;
      hatch(ctx, { x: 0, y: 0, w: api.w, h: api.h }, angle, shaded, { spacing, weight });
      const cross = api.param('cross');
      if (cross > 0.02) {
        // The second set only where the first has run out of darkness to give.
        ctx.fillStyle = s.rim || api.palette.default;
        hatch(ctx, { x: 0, y: 0, w: api.w, h: api.h }, angle + Math.PI / 2.6, (x, y) => {
          const v = shaded(x, y);
          return v <= 0.5 ? 0 : ((v - 0.5) / 0.5) * cross;
        }, { spacing: spacing * 1.15, weight });
      }
      ctx.globalAlpha = 1;
    },
  },
};
