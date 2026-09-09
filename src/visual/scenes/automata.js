// Six things that are run rather than drawn.
//
// A drawing machine traces a figure and stops. These have a state and a rule,
// and the picture is wherever the rule has got to -- which is the property
// worth having when the pen is a live feed rather than a hand. All six are
// somebody else's, and all six can be looked up.
//
//   Life        John Conway, 1970. Two rules about neighbours, and the whole
//               of cellular automata as a popular subject.
//   Langton     Chris Langton's ant, 1986. Turn, flip, step. After ten
//               thousand steps of apparent chaos it builds a highway, and
//               nobody has proved it always does.
//   Walk        The drunkard's walk. Brownian motion, which is what Robert
//               Brown saw pollen do in 1827 and Einstein explained in 1905.
//   Poisson     Mitchell's best-candidate, 1991: the cheap way to a blue-noise
//               scatter, which is how a retina arranges its cones.
//   Worley      Steven Worley, 1996. Distance to the nearest of a set of
//               points, which is a Voronoi diagram seen as a height map.
//   Pursuit     The mice problem, in Martin Gardner's phrasing: four mice at
//               the corners of a square, each running at the next.

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

/** A generator that gives the same picture on every visit. */
function seeded(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const AUTOMATA_SCENES = {
  life: {
    label: 'Life',
    positional: false,
    preview: { dt: 90, frames: 90 },
    note: "John Conway, 1970. A cell with three live neighbours is born, one with two or three survives, everything else dies. That is the entire rule, and it is Turing complete. Events drop a glider where they land -- the five-cell shape that walks across the board forever.",
    params: {
      cell: { label: 'Cell size', min: 2, max: 16, step: 1, default: 5, rebuild: true },
      rate: { label: 'Generations per second', min: 1, max: 30, step: 1, default: 9 },
    },
    init(api) {
      const s = api.scene;
      const cell = Math.max(2, Math.round(api.param('cell')));
      s.cell = cell;
      s.cols = Math.max(8, Math.ceil(api.w / cell));
      s.rows = Math.max(8, Math.ceil(api.h / cell));
      const rnd = seeded(1970);
      s.grid = new Uint8Array(s.cols * s.rows);
      // A quarter alive: dense enough to be interesting, sparse enough that
      // the first few generations are not one collapsing blob.
      for (let i = 0; i < s.grid.length; i++) s.grid[i] = rnd() < 0.25 ? 1 : 0;
      s.acc = 0;
      s.tint = null;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.grid) return;
      // A glider, the smallest thing that moves. Dropping live cells at random
      // mostly makes a puff that dies; a glider is a mark that travels.
      const c = Math.min(s.cols - 4, Math.max(1, Math.round((p.x / api.w) * s.cols)));
      const r = Math.min(s.rows - 4, Math.max(1, Math.round((p.y / api.h) * s.rows)));
      for (const [dx, dy] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) {
        s.grid[(r + dy) * s.cols + (c + dx)] = 1;
      }
      s.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.grid) return;
      s.acc += (api.param('rate') * api.dt) / 1000;
      const steps = Math.min(4, Math.floor(s.acc));
      s.acc -= steps;
      const { cols, rows } = s;
      for (let n = 0; n < steps; n++) {
        const next = new Uint8Array(cols * rows);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let live = 0;
            // Wrapped edges: a board with walls fills its corners with still
            // lifes and stops being interesting within a minute.
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                live += s.grid[((r + dy + rows) % rows) * cols + ((c + dx + cols) % cols)];
              }
            }
            const here = s.grid[r * cols + c];
            next[r * cols + c] = live === 3 || (here && live === 2) ? 1 : 0;
          }
        }
        s.grid = next;
      }
      ctx.fillStyle = s.tint || api.palette.user;
      const cell = s.cell;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (s.grid[r * cols + c]) ctx.fillRect(c * cell, r * cell, cell - 0.6, cell - 0.6);
        }
      }
    },
  },

  langton: {
    label: "Langton's ant",
    positional: false,
    preview: { dt: 40, frames: 160 },
    note: "Chris Langton, 1986. On a white square turn right, flip it, step; on a black square turn left, flip it, step. For ten thousand steps it makes a mess, and then it builds a diagonal highway and runs down it forever. Nobody has proved it always does. Events move the ant.",
    params: {
      cell: { label: 'Cell size', min: 1, max: 10, step: 1, default: 3, rebuild: true },
      rate: { label: 'Steps per second', min: 50, max: 6000, step: 50, default: 1400 },
    },
    init(api) {
      const s = api.scene;
      const cell = Math.max(1, Math.round(api.param('cell')));
      s.cell = cell;
      s.cols = Math.max(16, Math.ceil(api.w / cell));
      s.rows = Math.max(16, Math.ceil(api.h / cell));
      s.grid = new Uint8Array(s.cols * s.rows);
      s.x = s.cols >> 1;
      s.y = s.rows >> 1;
      s.dir = 0;
      s.acc = 0;
      s.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      s.x = Math.min(s.cols - 1, Math.max(0, Math.round((p.x / api.w) * s.cols)));
      s.y = Math.min(s.rows - 1, Math.max(0, Math.round((p.y / api.h) * s.rows)));
      s.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g || !s.grid) return;
      s.acc += (api.param('rate') * api.dt) / 1000;
      let steps = Math.min(20000, Math.floor(s.acc));
      s.acc -= steps;
      const cell = s.cell;
      const on = s.tint || api.palette.user;
      const off = api.palette.background;
      const dx = [0, 1, 0, -1];
      const dy = [-1, 0, 1, 0];
      while (steps-- > 0) {
        const i = s.y * s.cols + s.x;
        if (s.grid[i]) {
          s.dir = (s.dir + 3) % 4;
          s.grid[i] = 0;
          g.fillStyle = off;
        } else {
          s.dir = (s.dir + 1) % 4;
          s.grid[i] = 1;
          g.fillStyle = on;
        }
        g.fillRect(s.x * cell, s.y * cell, cell, cell);
        s.x = (s.x + dx[s.dir] + s.cols) % s.cols;
        s.y = (s.y + dy[s.dir] + s.rows) % s.rows;
      }
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },


  walk: {
    label: 'Random walk',
    positional: false,
    preview: { dt: 50, frames: 150 },
    note: "The drunkard's walk: a step in a random direction, forever. Robert Brown watched pollen do it in 1827 and could not say why; Einstein explained it in 1905 and gave the first good estimate of the size of an atom. Every event starts a walker, in its own colour.",
    params: {
      walkers: { label: 'How many', min: 1, max: 40, step: 1, default: 9 },
      step: { label: 'Step', min: 0.5, max: 8, step: 0.1, default: 2.4 },
      tail: { label: 'Tail length', min: 20, max: 400, step: 10, default: 150 },
    },
    init(api) {
      const s = api.scene;
      s.rnd = seeded(1827);
      s.w = [];
    },
    event(p, api) {
      const s = api.scene;
      s.w.push({ x: p.x, y: p.y, a: s.rnd() * TAU, c: p.color, trail: [p.x, p.y] });
      if (s.w.length > 60) s.w.shift();
    },
    frame(ctx, api) {
      const s = api.scene;
      const want = Math.round(api.param('walkers'));
      while (s.w.length < want) {
        s.w.push({ x: api.w / 2, y: api.h / 2, a: s.rnd() * TAU, c: null, trail: [api.w / 2, api.h / 2] });
      }
      while (s.w.length > want + 20) s.w.shift();
      const step = api.param('step');
      // A kept tail rather than an accumulation buffer. Buffered, the ink only
      // ever grows: a fade proportional to the frame gap is far too gentle to
      // keep up with wrapped walkers, and the card came out ninety-six per
      // cent covered. A tail of fixed length cannot do that.
      const keep = Math.round(api.param('tail')) * 2;
      const n = Math.max(1, Math.round(api.dt / 8));
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      for (const k of s.w) {
        for (let i = 0; i < n; i++) {
          // The turn is what makes it a walk rather than a jitter: a fresh
          // direction every step gives a fuzzy dot and goes nowhere.
          k.a += (s.rnd() - 0.5) * 1.6;
          k.x += Math.cos(k.a) * step;
          k.y += Math.sin(k.a) * step;
          // Bounced, not wrapped: a wrapped trail draws a line right across
          // the card every time it leaves one.
          if (k.x < 0 || k.x > api.w) { k.a = Math.PI - k.a; k.x = Math.max(0, Math.min(api.w, k.x)); }
          if (k.y < 0 || k.y > api.h) { k.a = -k.a; k.y = Math.max(0, Math.min(api.h, k.y)); }
          k.trail.push(k.x, k.y);
        }
        if (k.trail.length > keep) k.trail.splice(0, k.trail.length - keep);
        ctx.strokeStyle = k.c || api.palette.default;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(k.trail[0], k.trail[1]);
        for (let i = 2; i < k.trail.length; i += 2) ctx.lineTo(k.trail[i], k.trail[i + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },

  poisson: {
    label: 'Blue noise',
    positional: false,
    note: "Mitchell's best-candidate, 1991: to place a point, try a handful at random and keep the one furthest from everything already placed. The result has no clumps and no lattice, which is how a retina arranges its cones and why it is the scatter that looks deliberate.",
    params: {
      points: { label: 'How many', min: 40, max: 900, step: 10, default: 320, rebuild: true },
      tries: { label: 'Candidates each', min: 3, max: 30, step: 1, default: 12, rebuild: true },
      dot: { label: 'Dot size', min: 0.5, max: 6, step: 0.1, default: 1.8 },
    },
    init(api) {
      const s = api.scene;
      const rnd = seeded(1991);
      const want = Math.round(api.param('points'));
      const tries = Math.round(api.param('tries'));
      const pts = [];
      for (let i = 0; i < want; i++) {
        let best = null;
        let bestD = -1;
        for (let t = 0; t < tries; t++) {
          const x = rnd() * api.w;
          const y = rnd() * api.h;
          let near = Infinity;
          for (const q of pts) {
            const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
            if (d < near) near = d;
          }
          if (near > bestD) { bestD = near; best = [x, y]; }
        }
        pts.push(best);
      }
      s.pts = pts;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.pts) return;
      const dot = api.param('dot');
      ctx.fillStyle = api.palette.default;
      ctx.globalAlpha = 0.65;
      for (const [x, y] of s.pts) {
        ctx.beginPath();
        ctx.arc(x, y, dot, 0, TAU);
        ctx.fill();
      }
      // Events swell the points nearest them, so the feed reads as a pressure
      // on an even field rather than as marks on top of one.
      for (const p of api.particles.slice(-cap(api, 0.4))) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        const R = Math.max(12, p.r);
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.fillStyle = p.color;
        for (const [x, y] of s.pts) {
          const d = Math.hypot(x - p.x, y - p.y);
          if (d > R) continue;
          ctx.beginPath();
          ctx.arc(x, y, dot * (1 + 2.4 * (1 - d / R)), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  worley: {
    label: 'Cellular noise',
    positional: false,
    note: 'Steven Worley, 1996: the distance to the nearest of a scatter of points, drawn as a height. It is a Voronoi diagram seen from the side, and it is why computer-generated stone, scales and cracked mud all look the way they do. Events are the points.',
    params: {
      grid: { label: 'Resolution', min: 3, max: 16, step: 1, default: 6 },
      order: { label: 'Which neighbour', min: 1, max: 3, step: 1, default: 1 },
      contrast: { label: 'Contrast', min: 0.4, max: 3, step: 0.05, default: 1.2 },
    },
    frame(ctx, api) {
      const marks = api.particles.slice(-Math.min(36, cap(api, 0.06)));
      if (marks.length < 2) return;
      const step = Math.max(3, Math.round(api.param('grid')));
      const order = Math.round(api.param('order'));
      const contrast = api.param('contrast');
      const scale = Math.hypot(api.w, api.h) * 0.22;
      const cols = Math.ceil(api.w / step) + 1;
      const rows = Math.ceil(api.h / step) + 1;
      const d = new Float64Array(4);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * step;
          const y = r * step;
          d[0] = d[1] = d[2] = d[3] = Infinity;
          let owner = marks[0];
          for (const p of marks) {
            const dist = Math.hypot(x - p.x, y - p.y);
            // The three nearest, kept in order by insertion: a sort per cell
            // would be several thousand sorts a frame for three numbers.
            if (dist < d[0]) { d[2] = d[1]; d[1] = d[0]; d[0] = dist; owner = p; }
            else if (dist < d[1]) { d[2] = d[1]; d[1] = dist; }
            else if (dist < d[2]) { d[2] = dist; }
          }
          const v = Math.min(1, Math.pow(Math.min(1, d[order - 1] / scale), 1 / contrast));
          ctx.globalAlpha = 1 - v;
          ctx.fillStyle = owner.color;
          ctx.fillRect(x - step / 2, y - step / 2, step, step);
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  pursuit: {
    label: 'Pursuit',
    positional: false,
    note: 'The mice problem, in Martin Gardner\'s phrasing: four mice at the corners of a square, each running straight at the next. They spiral into the middle, and the path each traces is a logarithmic spiral. Events set them off again from where they landed.',
    params: {
      chasers: { label: 'How many', min: 3, max: 12, step: 1, default: 5, rebuild: true },
      speed: { label: 'Speed', min: 0.2, max: 4, step: 0.1, default: 1.1 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.99 },
    },
    init(api) {
      const s = api.scene;
      const n = Math.max(3, Math.round(api.param('chasers')));
      const R = Math.min(api.w, api.h) * 0.42;
      s.p = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2;
        s.p.push({ x: api.w / 2 + Math.cos(a) * R, y: api.h / 2 + Math.sin(a) * R, c: null });
      }
      s.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.p || !s.p.length) return;
      // One chaser is thrown to the event and given its colour. The others run
      // at it, so a single event bends the whole figure.
      const k = s.p[(s.at = ((s.at || 0) + 1) % s.p.length)];
      k.x = p.x;
      k.y = p.y;
      k.c = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g || !s.p) return;
      const n = s.p.length;
      const speed = api.param('speed') * Math.min(3, api.dt / 16);
      g.lineWidth = 1.1;
      g.globalAlpha = 0.8;
      for (let i = 0; i < n; i++) {
        const a = s.p[i];
        const b = s.p[(i + 1) % n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const m = Math.hypot(dx, dy) || 1;
        const px = a.x;
        const py = a.y;
        a.x += (dx / m) * speed;
        a.y += (dy / m) * speed;
        g.strokeStyle = a.c || api.palette.default;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(a.x, a.y);
        g.stroke();
      }
      // They meet in the middle and there is nothing left to draw, so when the
      // ring has collapsed it is set out again.
      let spread = 0;
      for (let i = 0; i < n; i++) {
        spread = Math.max(spread, Math.hypot(s.p[i].x - s.p[0].x, s.p[i].y - s.p[0].y));
      }
      if (spread < Math.min(api.w, api.h) * 0.02) {
        const R = Math.min(api.w, api.h) * 0.42;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU - Math.PI / 2 + api.now / 4000;
          s.p[i].x = api.w / 2 + Math.cos(a) * R;
          s.p[i].y = api.h / 2 + Math.sin(a) * R;
        }
      }
      g.globalAlpha = 1;
      fade(g, cv, api.param('hold'), api.dt);
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },
};
