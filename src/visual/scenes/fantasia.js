// Twelve more constructions, none of them invented here.
//
// Everything in this file is something anyone can look up, which is the rule
// the other families follow too: the value is in wiring a live feed into a
// known machine, not in claiming the machine.
//
//   Lorenz        Edward Lorenz, 1963. Convection reduced to three equations,
//                 and the first picture of deterministic chaos.
//   De Jong       Peter de Jong's attractor: four sines, folded on themselves.
//   Rose          Guido Grandi's rhodonea, 1723. r = cos(k.theta), and k
//                 decides how many petals and whether they overlap.
//   Moire         Two ring gratings, their centres apart. The fringes are in
//                 neither of them; the eye supplies them.
//   Apollonian    Circles packed in the gaps between circles, after Apollonius
//                 of Perga and Descartes's theorem on their curvatures.
//   Koch          Helge von Koch, 1904. A curve of infinite length around a
//                 finite area, which is what a coastline is.
//   Maze          Recursive division: cut the room in two, leave a door, repeat.
//   Rule 30       Stephen Wolfram's elementary automaton. Eight bits of rule
//                 produce a column that passes randomness tests.
//   Boids         Craig Reynolds, 1986. Three local rules and a flock appears,
//                 with nothing in the code that mentions a flock.
//   Metaballs     Jim Blinn, 1982. Fields that add, so two blobs become one
//                 before they touch.
//   Delaunay      The triangulation dual to a Voronoi diagram, 1934.
//   Interruptions Vera Molnar, 1968-69. A field of identical strokes with some
//                 of them removed, which is the whole piece.

import { scratch } from './paint.js';
import { cap } from './budget.js';

const TAU = Math.PI * 2;

/** The scene's accumulation buffer, cleared the first time it is asked for. */
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

/** Fade an accumulation buffer, so a scene that builds up also forgets. */
function fade(g, cv, keep, dt) {
  if (keep >= 0.999) return;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = `rgba(0,0,0,${(1 - keep) * Math.min(0.06, dt / 1000) * 1.8})`;
  g.fillRect(0, 0, cv.width, cv.height);
  g.restore();
}

/** A per-scene generator that gives the same picture on every visit. */
function seeded(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const FANTASIA_SCENES = {
  // --- attractors ---------------------------------------------------------
  lorenz: {
    label: 'Lorenz',
    positional: false,
    preview: { dt: 30, frames: 150 },
    note: 'Edward Lorenz, 1963: convection reduced to three equations, and the first picture anybody had of deterministic chaos. Two starts a millionth apart end up on opposite wings. Each event nudges the state, and the butterfly absorbs it within a second.',
    params: {
      rho: { label: 'Rho', min: 14, max: 60, step: 0.5, default: 28 },
      speed: { label: 'Speed', min: 0.2, max: 4, step: 0.1, default: 1.2 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.97 },
    },
    init(api) {
      const s = api.scene;
      s.x = 0.1; s.y = 0; s.z = 20;
      s.bufClean = false;
      s.tint = null;
    },
    event(p, api) {
      const s = api.scene;
      // A nudge, not a jump: the point stays on the attractor and the feed
      // shows as a change of wing rather than as a mark.
      s.x += (p.x / api.w - 0.5) * 4;
      s.z += (p.y / api.h - 0.5) * 4;
      s.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      const rho = api.param('rho');
      const sigma = 10;
      const beta = 8 / 3;
      const steps = Math.min(3000, Math.round(600 * api.param('speed')));
      const h = 0.004;
      const scale = Math.min(api.w, api.h) / 62;
      const cx = api.w / 2;
      const cy = api.h * 0.62;
      g.fillStyle = s.tint || api.palette.user;
      g.globalAlpha = 0.5;
      for (let i = 0; i < steps; i++) {
        const dx = sigma * (s.y - s.x);
        const dy = s.x * (rho - s.z) - s.y;
        const dz = s.x * s.y - beta * s.z;
        s.x += dx * h; s.y += dy * h; s.z += dz * h;
        // Seen from the front: x across, z up, which is the view the shape is
        // always drawn in and the only one where both wings are open.
        g.fillRect(cx + s.x * scale, cy - (s.z - 25) * scale, 1, 1);
      }
      g.globalAlpha = 1;
      fade(g, cv, api.param('hold'), api.dt);
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  dejong: {
    label: 'De Jong',
    positional: false,
    preview: { dt: 30, frames: 140 },
    note: "Peter de Jong's attractor: four sines folded on themselves. The four constants decide everything, and a hundredth of a change to any of them gives a different creature entirely.",
    params: {
      a: { label: 'a', min: -3, max: 3, step: 0.01, default: 1.641 },
      b: { label: 'b', min: -3, max: 3, step: 0.01, default: 1.902 },
      c: { label: 'c', min: -3, max: 3, step: 0.01, default: 0.316 },
      d: { label: 'd', min: -3, max: 3, step: 0.01, default: 1.525 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.985 },
    },
    init(api) {
      const s = api.scene;
      s.x = 0.1; s.y = 0.1;
      s.bufClean = false;
      s.tint = null;
    },
    event(p, api) {
      api.scene.tint = p.color;
      api.scene.push = 1;
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      const a = api.param('a');
      const b = api.param('b');
      const c = api.param('c');
      const d = api.param('d');
      const scale = Math.min(api.w, api.h) * 0.24;
      const cx = api.w / 2;
      const cy = api.h / 2;
      const n = Math.min(9000, 2200 + (s.push ? 3000 : 0));
      s.push = 0;
      g.fillStyle = s.tint || api.palette.anon;
      g.globalAlpha = 0.32;
      for (let i = 0; i < n; i++) {
        const nx = Math.sin(a * s.y) - Math.cos(b * s.x);
        const ny = Math.sin(c * s.x) - Math.cos(d * s.y);
        s.x = nx; s.y = ny;
        g.fillRect(cx + s.x * scale, cy + s.y * scale, 1, 1);
      }
      g.globalAlpha = 1;
      fade(g, cv, api.param('hold'), api.dt);
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  // --- curves -------------------------------------------------------------
  rose: {
    label: 'Rose curve',
    note: 'Guido Grandi named these in 1723: r = cos(k.theta), one equation whose single number k decides how many petals there are and whether they overlap. An odd k gives k petals, an even one gives twice as many, and a fraction gives a figure that takes several turns to close.',
    params: {
      k: { label: 'Petals (k)', min: 1, max: 12, step: 0.25, default: 5 },
      turns: { label: 'Turns', min: 1, max: 12, step: 1, default: 4 },
      weight: { label: 'Line weight', min: 0.4, max: 4, step: 0.1, default: 1.3 },
    },
    frame(ctx, api) {
      const k = api.param('k');
      const turns = Math.round(api.param('turns'));
      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.44;
      ctx.lineWidth = api.param('weight');
      ctx.lineCap = 'round';
      const marks = api.particles.slice(-cap(api, 0.3));
      // One rose per event, each a little further round and a little smaller,
      // so a busy feed is a bouquet rather than one curve redrawn.
      marks.forEach((p, i) => {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) return;
        const scale = R * (0.25 + 0.75 * (p.r / Math.max(1, R)));
        const spin = (i * 0.21) + api.now / 9000;
        ctx.globalAlpha = (1 - age) * 0.75;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        const steps = 220;
        for (let j = 0; j <= steps; j++) {
          const t = (j / steps) * TAU * turns;
          const r = Math.cos(k * t) * scale;
          const x = cx + Math.cos(t + spin) * r;
          const y = cy + Math.sin(t + spin) * r;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    },
  },

  koch: {
    label: 'Koch snowflake',
    positional: false,
    note: 'Helge von Koch, 1904: replace the middle third of every line with two sides of a triangle, and repeat. The result has infinite length around a finite area, which is the property a coastline has and the reason this was drawn in the first place. Events raise the order.',
    params: {
      order: { label: 'Order', min: 1, max: 6, step: 1, default: 4 },
      weight: { label: 'Line weight', min: 0.4, max: 4, step: 0.1, default: 1.2 },
      spin: { label: 'Turn', min: 0, max: 40, step: 1, default: 6 },
    },
    frame(ctx, api) {
      const order = Math.round(api.param('order'));
      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.42;
      const spin = (api.now / 100000) * api.param('spin');
      // Three sides of an equilateral triangle, each replaced by a Koch curve.
      let pts = [];
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * TAU - Math.PI / 2;
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
      pts.push(pts[0]);
      for (let step = 0; step < order; step++) {
        const next = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[i + 1];
          const dx = (x2 - x1) / 3;
          const dy = (y2 - y1) / 3;
          const ax = x1 + dx;
          const ay = y1 + dy;
          const bx = x1 + 2 * dx;
          const by = y1 + 2 * dy;
          // The apex: the middle third rotated sixty degrees outward.
          const px = ax + dx * Math.cos(-Math.PI / 3) - dy * Math.sin(-Math.PI / 3);
          const py = ay + dx * Math.sin(-Math.PI / 3) + dy * Math.cos(-Math.PI / 3);
          next.push([ax, ay], [px, py], [bx, by], [x2, y2]);
        }
        pts = next;
        if (pts.length > 12000) break;
      }
      ctx.lineWidth = api.param('weight');
      ctx.strokeStyle = api.palette.default;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();

      // Events sit on the edge, at the point of it nearest where they landed.
      for (const p of api.particles.slice(-cap(api, 0.5))) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        const idx = Math.abs(Math.round(p.x * 7919 + p.y * 104729)) % pts.length;
        ctx.globalAlpha = (1 - age) * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pts[idx][0], pts[idx][1], Math.max(1.5, p.r * 0.16), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- interference -------------------------------------------------------
  moire: {
    label: 'Moire',
    positional: false,
    note: 'Two sets of concentric rings, their centres a little apart. The fringes you see are in neither of them: they are the beat between two spacings, and the eye supplies them. Silk weavers named the effect, printers spend their lives avoiding it, and Bridget Riley built a career on it. Each event moves the second centre.',
    params: {
      pitch: { label: 'Ring spacing', min: 3, max: 20, step: 0.5, default: 7 },
      apart: { label: 'How far apart', min: 0.01, max: 0.4, step: 0.005, default: 0.11 },
      weight: { label: 'Line weight', min: 0.4, max: 3, step: 0.1, default: 1.2 },
    },
    init(api) {
      api.scene.dx = 0;
      api.scene.dy = 0;
    },
    event(p, api) {
      // The second centre drifts towards the event and eases back. Moving a
      // centre by a few pixels swings the fringes right across the card,
      // which is the property that makes this worth wiring to a feed.
      const s = api.scene;
      s.dx += (p.x / api.w - 0.5) * 0.5;
      s.dy += (p.y / api.h - 0.5) * 0.5;
      s.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const pitch = api.param('pitch');
      const w = api.w;
      const h = api.h;
      const max = Math.hypot(w, h) * 0.8;
      s.dx = (s.dx || 0) * 0.94;
      s.dy = (s.dy || 0) * 0.94;
      ctx.lineWidth = api.param('weight');
      const rings = (cx, cy, colour) => {
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        // One path for every ring, stroked once: a stroke per circle is a
        // hundred state changes a frame for the same picture.
        for (let r = pitch; r < max; r += pitch) {
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, TAU);
        }
        ctx.stroke();
      };
      const d = w * api.param('apart');
      rings(w / 2 - d / 2 + s.dx * w * 0.1, h / 2 + s.dy * h * 0.1, api.palette.default);
      rings(w / 2 + d / 2 - s.dx * w * 0.1, h / 2 - s.dy * h * 0.1, s.tint || api.palette.default);
      ctx.globalAlpha = 1;
    },
  },

  metaballs: {
    label: 'Metaballs',
    positional: false,
    note: 'Jim Blinn, 1982. Every event is a field that falls off with distance, the fields add, and a line is drawn where the total crosses a threshold. Two blobs merge before they touch, which is what makes this look like liquid and not like circles.',
    params: {
      threshold: { label: 'Threshold', min: 0.4, max: 3, step: 0.05, default: 1 },
      reach: { label: 'Reach', min: 0.4, max: 3, step: 0.05, default: 1.2 },
      grid: { label: 'Resolution', min: 3, max: 14, step: 1, default: 6 },
    },
    frame(ctx, api) {
      const marks = api.particles.slice(-Math.min(28, cap(api, 0.05)));
      if (!marks.length) return;
      const step = Math.max(3, Math.round(api.param('grid')));
      const thr = api.param('threshold');
      const reach = api.param('reach');
      const cols = Math.ceil(api.w / step) + 1;
      const rows = Math.ceil(api.h / step) + 1;
      // A field sampled on a grid, and every cell above the threshold filled.
      // Marching squares would give a smoother edge for four times the work,
      // and at this cell size the difference is a pixel.
      ctx.globalAlpha = 0.85;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * step;
          const y = r * step;
          let sum = 0;
          let rr = 0;
          let gg = 0;
          let bb = 0;
          for (const p of marks) {
            const age = (api.now - p.born) / Math.max(1, p.life);
            if (age >= 1) continue;
            const dx = x - p.x;
            const dy = y - p.y;
            const d2 = dx * dx + dy * dy + 1;
            const q = ((p.r * reach) * (p.r * reach)) / d2 * (1 - age);
            sum += q;
            // The colour is the field-weighted average, so where two blobs
            // merge the colour merges too rather than one winning.
            const col = p._rgb || (p._rgb = parseRgb(p.color));
            rr += col[0] * q; gg += col[1] * q; bb += col[2] * q;
          }
          if (sum < thr) continue;
          ctx.fillStyle = `rgb(${Math.round(rr / sum)},${Math.round(gg / sum)},${Math.round(bb / sum)})`;
          ctx.fillRect(x - step / 2, y - step / 2, step, step);
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- packings and partitions -------------------------------------------
  apollonian: {
    label: 'Apollonian gasket',
    positional: false,
    note: 'Circles packed into the gaps between circles, forever. Apollonius of Perga posed it; Descartes gave the relation between four mutually touching curvatures in 1643, and Frederick Soddy put it into verse in 1936. This fills gaps in order of size, so an event always lands somewhere still open.',
    params: {
      depth: { label: 'How many circles', min: 40, max: 900, step: 10, default: 260, rebuild: true },
      weight: { label: 'Line weight', min: 0.3, max: 3, step: 0.1, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(20250909);
      const R = Math.min(api.w, api.h) * 0.46;
      const cx = api.w / 2;
      const cy = api.h / 2;
      const want = Math.round(api.param('depth'));
      // Not the true Descartes construction: circles are grown in the largest
      // remaining gap until they touch, which converges on the same picture
      // and needs no complex arithmetic.
      const circles = [{ x: cx, y: cy, r: R, outer: true }];
      let guard = want * 60;
      while (circles.length < want && guard-- > 0) {
        const a = rnd() * TAU;
        const d = Math.sqrt(rnd()) * R;
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d;
        let room = R - Math.hypot(x - cx, y - cy);
        for (let i = 1; i < circles.length; i++) {
          const c = circles[i];
          room = Math.min(room, Math.hypot(x - c.x, y - c.y) - c.r);
          if (room < 1.2) break;
        }
        if (room >= 1.2) circles.push({ x, y, r: room });
      }
      s.circles = circles;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.circles) return;
      ctx.lineWidth = api.param('weight');
      ctx.strokeStyle = api.palette.default;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (const c of s.circles) {
        ctx.moveTo(c.x + c.r, c.y);
        ctx.arc(c.x, c.y, c.r, 0, TAU);
      }
      ctx.stroke();

      // An event fills the circle it landed in, largest first among those it
      // fits, so a big event takes a big circle.
      const marks = api.particles.slice(-cap(api, 0.4));
      for (const p of marks) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        let best = null;
        for (const c of s.circles) {
          if (c.outer) continue;
          if (Math.hypot(p.x - c.x, p.y - c.y) <= c.r && (!best || c.r > best.r)) best = c;
        }
        if (!best) continue;
        ctx.globalAlpha = (1 - age) * 0.72;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(best.x, best.y, best.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  maze: {
    label: 'Maze',
    positional: false,
    note: 'Recursive division: cut the room in two with a wall, leave one door in it, and do the same to both halves. The oldest maze algorithm there is, and the only one whose output looks built rather than grown. Events light the corridor they landed in.',
    params: {
      cell: { label: 'Cell size', min: 8, max: 60, step: 2, default: 28, rebuild: true },
      weight: { label: 'Wall weight', min: 0.5, max: 4, step: 0.1, default: 1.4 },
      glow: { label: 'How long it stays lit', min: 500, max: 20000, step: 250, default: 5000 },
    },
    init(api) {
      const s = api.scene;
      const cell = Math.max(6, api.param('cell'));
      const cols = Math.max(2, Math.floor(api.w / cell));
      const rows = Math.max(2, Math.floor(api.h / cell));
      const rnd = seeded(4711);
      const walls = [];
      // The same ceiling every other scene keeps to. A maze is bounded by its
      // grid rather than growing without end, but a wide screen at a small
      // cell size still asked for hundreds of walls, and "bounded by
      // something" is not the same as "bounded by the budget".
      const limit = Math.min(360, cap(api, 0.45));
      // Divide, recursively, and stop when a room is one cell across.
      const divide = (x, y, w, h, depth) => {
        if (w < 2 || h < 2 || depth > 24 || walls.length >= limit) return;
        const horizontal = h > w || (h === w && rnd() < 0.5);
        if (horizontal) {
          const wy = y + 1 + Math.floor(rnd() * (h - 1));
          const door = x + Math.floor(rnd() * w);
          walls.push([x, wy, x + w, wy, door, wy]);
          divide(x, y, w, wy - y, depth + 1);
          divide(x, wy, w, y + h - wy, depth + 1);
        } else {
          const wx = x + 1 + Math.floor(rnd() * (w - 1));
          const door = y + Math.floor(rnd() * h);
          walls.push([wx, y, wx, y + h, wx, door]);
          divide(x, y, wx - x, h, depth + 1);
          divide(wx, y, x + w - wx, h, depth + 1);
        }
      };
      divide(0, 0, cols, rows, 0);
      s.cols = cols;
      s.rows = rows;
      s.walls = walls;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.walls) return;
      const cw = api.w / s.cols;
      const ch = api.h / s.rows;
      // The lit cells first, so the walls sit on top of them.
      const glow = api.param('glow');
      for (const p of api.particles.slice(-cap(api, 0.5))) {
        const age = (api.now - p.born) / glow;
        if (age >= 1) continue;
        const c = Math.min(s.cols - 1, Math.max(0, Math.floor(p.x / cw)));
        const r = Math.min(s.rows - 1, Math.max(0, Math.floor(p.y / ch)));
        ctx.globalAlpha = (1 - age) * 0.7;
        ctx.fillStyle = p.color;
        ctx.fillRect(c * cw, r * ch, cw, ch);
      }
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = api.palette.default;
      ctx.lineWidth = api.param('weight');
      ctx.beginPath();
      for (const [x1, y1, x2, y2, dx, dy] of s.walls) {
        if (y1 === y2) {
          ctx.moveTo(x1 * cw, y1 * ch);
          ctx.lineTo(dx * cw, y1 * ch);
          ctx.moveTo((dx + 1) * cw, y1 * ch);
          ctx.lineTo(x2 * cw, y1 * ch);
        } else {
          ctx.moveTo(x1 * cw, y1 * ch);
          ctx.lineTo(x1 * cw, dy * ch);
          ctx.moveTo(x1 * cw, (dy + 1) * ch);
          ctx.lineTo(x1 * cw, y2 * ch);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  delaunay: {
    label: 'Delaunay',
    positional: false,
    note: 'The triangulation dual to a Voronoi diagram: join two events when their territories share a border. Boris Delaunay proved in 1934 that the result is the triangulation whose smallest angle is as large as possible, which is why it is the one every mesh generator wants.',
    params: {
      weight: { label: 'Line weight', min: 0.3, max: 3, step: 0.1, default: 1 },
      fill: { label: 'Fill', min: 0, max: 1, step: 0.02, default: 0.35 },
      points: { label: 'How many events', min: 6, max: 90, step: 1, default: 36 },
    },
    frame(ctx, api) {
      const marks = api.particles.slice(-Math.round(api.param('points')));
      if (marks.length < 3) return;
      const pts = marks.map((p) => [p.x, p.y, p]);
      // The naive O(n^3) construction: a triangle is Delaunay when no other
      // point is inside its circumcircle. At forty points that is sixty
      // thousand tests a frame, which is nothing, and the alternative is
      // several hundred lines of divide and conquer.
      const n = pts.length;
      const fillA = api.param('fill');
      ctx.lineWidth = api.param('weight');
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (let k = j + 1; k < n; k++) {
            const c = circumcircle(pts[i], pts[j], pts[k]);
            if (!c) continue;
            let empty = true;
            for (let m = 0; m < n; m++) {
              if (m === i || m === j || m === k) continue;
              const dx = pts[m][0] - c.x;
              const dy = pts[m][1] - c.y;
              if (dx * dx + dy * dy < c.r2 - 0.01) { empty = false; break; }
            }
            if (!empty) continue;
            ctx.beginPath();
            ctx.moveTo(pts[i][0], pts[i][1]);
            ctx.lineTo(pts[j][0], pts[j][1]);
            ctx.lineTo(pts[k][0], pts[k][1]);
            ctx.closePath();
            if (fillA > 0.01) {
              ctx.globalAlpha = fillA * 0.5;
              ctx.fillStyle = pts[i][2].color;
              ctx.fill();
            }
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = api.palette.default;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  // --- rules --------------------------------------------------------------
  rule30: {
    label: 'Rule 30',
    positional: false,
    note: "Stephen Wolfram's elementary cellular automaton. Each cell looks at itself and its two neighbours, and eight bits of rule decide what it becomes. Rule 30 passes randomness tests from a single black cell and no randomness anywhere in it; Mathematica used it as a generator for years. Events flip cells in the top row.",
    params: {
      rule: { label: 'Rule', min: 0, max: 255, step: 1, default: 30, rebuild: true },
      cell: { label: 'Cell size', min: 1, max: 10, step: 1, default: 3, rebuild: true },
      rate: { label: 'Rows per second', min: 2, max: 90, step: 1, default: 26 },
    },
    init(api) {
      const s = api.scene;
      const cell = Math.max(1, Math.round(api.param('cell')));
      s.cell = cell;
      s.cols = Math.max(8, Math.ceil(api.w / cell));
      s.row = new Uint8Array(s.cols);
      s.row[s.cols >> 1] = 1;
      s.y = 0;
      s.bufClean = false;
      s.acc = 0;
    },
    event(p, api) {
      // A live cell dropped into the current row, where the event landed.
      const s = api.scene;
      if (!s.row) return;
      s.row[Math.min(s.cols - 1, Math.max(0, Math.round((p.x / api.w) * s.cols)))] = 1;
      s.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g || !s.row) return;
      const rule = Math.round(api.param('rule')) & 255;
      s.acc += (api.param('rate') * api.dt) / 1000;
      const rows = Math.min(30, Math.floor(s.acc));
      s.acc -= rows;
      const cell = s.cell;
      g.fillStyle = s.tint || api.palette.user;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < s.cols; i++) {
          if (s.row[i]) g.fillRect(i * cell, s.y, cell, cell);
        }
        // The next generation, from the three-cell neighbourhood.
        const next = new Uint8Array(s.cols);
        for (let i = 0; i < s.cols; i++) {
          const l = s.row[(i - 1 + s.cols) % s.cols];
          const c = s.row[i];
          const rr = s.row[(i + 1) % s.cols];
          next[i] = (rule >> ((l << 2) | (c << 1) | rr)) & 1;
        }
        s.row = next;
        s.y += cell;
        if (s.y >= cv.height) {
          // Scroll rather than wrap: the picture is a history and it should
          // read downwards without a seam.
          g.globalCompositeOperation = 'copy';
          g.drawImage(cv, 0, -cv.height * 0.5);
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = s.tint || api.palette.user;
          s.y = Math.floor(cv.height * 0.5);
        }
      }
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  boids: {
    label: 'Boids',
    positional: false,
    note: 'Craig Reynolds, 1986: keep your distance, match your neighbours, head for the middle of them. Three local rules, nothing anywhere that mentions a flock, and a flock is what happens. Every event releases another bird, coloured by its category.',
    params: {
      count: { label: 'How many', min: 20, max: 400, step: 10, default: 140, rebuild: true },
      speed: { label: 'Speed', min: 0.2, max: 4, step: 0.1, default: 1.4 },
      sight: { label: 'How far each sees', min: 10, max: 120, step: 2, default: 64 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(31337);
      const n = Math.round(api.param('count'));
      s.b = [];
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU;
        s.b.push({ x: rnd() * api.w, y: rnd() * api.h, vx: Math.cos(a), vy: Math.sin(a), c: null });
      }
    },
    event(p, api) {
      const s = api.scene;
      if (!s.b || !s.b.length) return;
      // The oldest bird takes the event's colour and its position: the flock
      // stays the same size and the feed is a change of who is where.
      const b = s.b[(s.next = ((s.next || 0) + 1) % s.b.length)];
      b.x = p.x; b.y = p.y; b.c = p.color;
      b.born = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.b) return;
      const sight = api.param('sight');
      const sight2 = sight * sight;
      const speed = api.param('speed') * Math.min(2.5, api.dt / 16);
      const n = s.b.length;
      for (let i = 0; i < n; i++) {
        const a = s.b[i];
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, seen = 0;
        // Every pair, which at a hundred and forty birds is ten thousand
        // tests a frame. A grid would be faster and is not needed here.
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const b = s.b[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > sight2 || d2 < 0.0001) continue;
          seen++;
          cx += b.x; cy += b.y;
          ax += b.vx; ay += b.vy;
          if (d2 < sight2 * 0.09) { sx -= dx / d2; sy -= dy / d2; }
        }
        if (seen) {
          // Cohesion, alignment, separation, in that order. The first two
          // were ten times weaker than this and the separation term won every
          // time: the birds spread out evenly and never flocked at all.
          a.vx += ((cx / seen - a.x) * 0.006) + ((ax / seen - a.vx) * 0.16) + sx * 5;
          a.vy += ((cy / seen - a.y) * 0.006) + ((ay / seen - a.vy) * 0.16) + sy * 5;
        }
        const m = Math.hypot(a.vx, a.vy) || 1;
        a.vx /= m; a.vy /= m;
        a.x += a.vx * speed;
        a.y += a.vy * speed;
        // Wrapped, not bounced: a flock that hits a wall stops being a flock.
        if (a.x < 0) a.x += api.w; else if (a.x > api.w) a.x -= api.w;
        if (a.y < 0) a.y += api.h; else if (a.y > api.h) a.y -= api.h;
      }
      for (const b of s.b) {
        ctx.globalAlpha = b.c ? 0.9 : 0.45;
        ctx.fillStyle = b.c || api.palette.default;
        ctx.beginPath();
        ctx.moveTo(b.x + b.vx * 5, b.y + b.vy * 5);
        ctx.lineTo(b.x - b.vy * 2.2 - b.vx * 2, b.y + b.vx * 2.2 - b.vy * 2);
        ctx.lineTo(b.x + b.vy * 2.2 - b.vx * 2, b.y - b.vx * 2.2 - b.vy * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  interruptions: {
    label: 'Interruptions',
    positional: false,
    note: "Vera Molnar, 1968: a field of identical short strokes, each turned a little, with some of them taken away. The piece is the absence -- she called the removals the interruptions and the rest the material. Here the feed decides what is missing, so the holes are the data.",
    params: {
      pitch: { label: 'Spacing', min: 6, max: 40, step: 1, default: 14, rebuild: true },
      jitter: { label: 'How much they turn', min: 0, max: 1.6, step: 0.05, default: 0.55 },
      hole: { label: 'How much is missing', min: 0, max: 0.6, step: 0.02, default: 0.12 },
    },
    init(api) {
      const s = api.scene;
      const pitch = Math.max(4, Math.round(api.param('pitch')));
      const cols = Math.ceil(api.w / pitch) + 1;
      const rows = Math.ceil(api.h / pitch) + 1;
      const rnd = seeded(19680101);
      s.pitch = pitch;
      s.cols = cols;
      s.rows = rows;
      s.a = new Float32Array(cols * rows);
      s.gone = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        s.a[i] = rnd() * TAU;
        s.gone[i] = rnd();
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.a) return;
      const pitch = s.pitch;
      const jitter = api.param('jitter');
      const hole = api.param('hole');
      const half = pitch * 0.42;
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = api.palette.default;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          const i = r * s.cols + c;
          if (s.gone[i] < hole) continue;
          const x = c * pitch;
          const y = r * pitch;
          const a = s.a[i] * jitter;
          ctx.moveTo(x - Math.cos(a) * half, y - Math.sin(a) * half);
          ctx.lineTo(x + Math.cos(a) * half, y + Math.sin(a) * half);
        }
      }
      ctx.stroke();

      // An event clears a disc of strokes and leaves its colour there: the
      // interruption is the mark.
      for (const p of api.particles.slice(-cap(api, 0.4))) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        const R = Math.max(pitch, p.r * 0.8);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = (1 - age) * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 0.72, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
};

/** The circle through three points, or null if they are in a line. */
function circumcircle(a, b, c) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const dx = ax - x;
  const dy = ay - y;
  return { x, y, r2: dx * dx + dy * dy };
}

/** `rgb(r, g, b)` or `#rrggbb` to a triple. */
function parseRgb(c) {
  const s = String(c);
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(s);
  if (m) return [+m[1], +m[2], +m[3]];
  const h = /^#([0-9a-f]{6})$/i.exec(s.trim());
  if (h) {
    const n = parseInt(h[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [200, 200, 200];
}
