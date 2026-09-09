// Nine tilings, fractals and figures.
//
// Constructions with a closed form, as against the automata next door which
// have a state and a rule. What the feed turns here is a parameter, not a
// simulation, and the figure follows within a frame.
//
//   Penrose   Roger Penrose, 1974. Two rhombs that tile the plane and cannot
//             tile it periodically -- the first proof that such a thing exists.
//   Girih     The strapwork of Islamic architecture: a star polygon at every
//             node of a grid, laced together. Five tile shapes, and the
//             fifteenth-century craftsmen were doing quasiperiodic tiling five
//             hundred years before Penrose.
//   Carpet    Sierpinski's carpet, 1916. Cut the middle ninth, repeat.
//   Fern      Michael Barnsley, 1988. Four affine maps applied at random, and
//             a fern appears -- the demonstration that made iterated function
//             systems famous.
//   Julia     Gaston Julia, 1918, drawn sixty years before anyone could see it.
//   L-system  Aristid Lindenmayer, 1968: a biologist's grammar for growth.
//   Ulam      Stanisław Ulam, 1963, doodling in a dull lecture: the integers
//             on a square spiral, and the primes fall on diagonals nobody has
//             explained.
//   Collatz   Halve it if even, treble and add one if odd. Every number tried
//             reaches one and nobody can prove they all do.
//   Riley     Bridget Riley's wave paintings of the 1960s.

import { cap } from './budget.js';
import { scratch } from './paint.js';

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
function fadeBuffer(g, cv, keep, dt) {
  if (keep >= 0.999) return;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = `rgba(0,0,0,${(1 - keep) * Math.min(0.06, dt / 1000) * 1.8})`;
  g.fillRect(0, 0, cv.width, cv.height);
  g.restore();
}

export const TILING_SCENES = {
  penrose: {
    label: 'Penrose tiling',
    positional: false,
    note: 'Roger Penrose, 1974: two rhombs, a fat one and a thin one, that tile the plane and cannot do it periodically. The first proof that aperiodic tiling was possible with so few shapes, and the reason quasicrystals were taken seriously when Shechtman found them. Events light the tiles they land on.',
    params: {
      depth: { label: 'Subdivisions', min: 2, max: 6, step: 1, default: 4, rebuild: true },
      weight: { label: 'Line weight', min: 0.2, max: 3, step: 0.1, default: 0.8 },
      glow: { label: 'How long it stays lit', min: 500, max: 20000, step: 250, default: 5000 },
    },
    init(api) {
      const s = api.scene;
      const depth = Math.max(1, Math.round(api.param('depth')));
      const phi = (1 + Math.sqrt(5)) / 2;
      // The deflation construction: start with ten thin triangles round a
      // point, and repeatedly cut each one according to the golden ratio.
      // Triangles rather than rhombs, because the subdivision rule is stated
      // for half-tiles and the rhombs are the pairs it leaves behind.
      let tris = [];
      for (let i = 0; i < 10; i++) {
        let b = { x: Math.cos((2 * i - 1) * Math.PI / 10), y: Math.sin((2 * i - 1) * Math.PI / 10) };
        let c = { x: Math.cos((2 * i + 1) * Math.PI / 10), y: Math.sin((2 * i + 1) * Math.PI / 10) };
        if (i % 2 === 0) { const t = b; b = c; c = t; }
        tris.push({ kind: 0, a: { x: 0, y: 0 }, b, c });
      }
      const mix = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      for (let n = 0; n < depth; n++) {
        const next = [];
        for (const t of tris) {
          if (t.kind === 0) {
            const p = mix(t.a, t.b, 1 / phi);
            next.push({ kind: 0, a: t.c, b: p, c: t.b }, { kind: 1, a: p, b: t.c, c: t.a });
          } else {
            const q = mix(t.b, t.a, 1 / phi);
            const r = mix(t.b, t.c, 1 / phi);
            next.push({ kind: 1, a: r, b: t.c, c: t.a }, { kind: 1, a: q, b: r, c: t.b },
                      { kind: 0, a: r, b: q, c: t.a });
          }
        }
        tris = next;
        if (tris.length > 2600) break;
      }
      s.tris = tris;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.tris) return;
      const R = Math.min(api.w, api.h) * 0.52;
      const cx = api.w / 2;
      const cy = api.h / 2;
      const at = (p) => [cx + p.x * R, cy + p.y * R];
      const glow = api.param('glow');
      const lit = api.particles.slice(-cap(api, 0.4)).filter((p) => api.now - p.born < glow);

      ctx.lineWidth = api.param('weight');
      // The two kinds of half-tile in one pass each, so the fill and the
      // stroke are set twice rather than once per tile. Setting a fill style
      // three thousand times a frame was most of what this scene cost.
      for (const kind of [0, 1]) {
        ctx.beginPath();
        for (const t of s.tris) {
          if (t.kind !== kind) continue;
          const [ax, ay] = at(t.a);
          const [bx, by] = at(t.b);
          const [ccx, ccy] = at(t.c);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineTo(ccx, ccy);
          ctx.closePath();
        }
        // The two half-tiles are told apart by their fill, which is what makes
        // the rhombs read as two shapes rather than as a mesh of triangles.
        ctx.globalAlpha = kind === 0 ? 0.16 : 0.06;
        ctx.fillStyle = api.palette.default;
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = api.palette.default;
        ctx.stroke();
      }
      // The lit tiles are a handful; walking every tile for every event was
      // the other half of the cost. Walked the other way round instead.
      for (const p of lit) {
        const age = (api.now - p.born) / glow;
        ctx.globalAlpha = 0.85 * (1 - age);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (const t of s.tris) {
          const [ax, ay] = at(t.a);
          const [bx, by] = at(t.b);
          const [ccx, ccy] = at(t.c);
          const mx = (ax + bx + ccx) / 3;
          const my = (ay + by + ccy) / 3;
          if (Math.hypot(mx - p.x, my - p.y) > Math.max(10, p.r * 0.7)) continue;
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineTo(ccx, ccy);
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  girih: {
    label: 'Girih',
    positional: false,
    note: 'The strapwork of Islamic architecture: a star polygon at every node of a grid, its points laced into its neighbours. The craftsmen who cut these in the fifteenth century were building quasiperiodic patterns five hundred years before anyone in Europe proved they existed.',
    params: {
      pitch: { label: 'Star spacing', min: 40, max: 220, step: 5, default: 90, rebuild: true },
      points: { label: 'Points per star', min: 5, max: 16, step: 1, default: 10 },
      weight: { label: 'Line weight', min: 0.4, max: 4, step: 0.1, default: 1.3 },
    },
    frame(ctx, api) {
      const pitch = api.param('pitch');
      const k = Math.round(api.param('points'));
      const cols = Math.ceil(api.w / pitch) + 2;
      const rows = Math.ceil(api.h / pitch) + 2;
      const R = pitch * 0.46;
      const inner = R * (k > 8 ? 0.52 : 0.42);
      ctx.lineWidth = api.param('weight');
      ctx.strokeStyle = api.palette.default;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          // Every other row is offset by half a pitch, which is what laces the
          // stars together instead of leaving them in a grid of medallions.
          const x = c * pitch + (r % 2 ? pitch / 2 : 0);
          const y = r * pitch * 0.87;
          for (let i = 0; i < k * 2; i++) {
            const a = (i / (k * 2)) * TAU - Math.PI / 2;
            const rad = i % 2 ? inner : R;
            const px = x + Math.cos(a) * rad;
            const py = y + Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }
      }
      ctx.stroke();

      // An event fills the star nearest it, so the pattern is a ground and the
      // data is what is picked out in it -- which is how these are coloured.
      for (const p of api.particles.slice(-cap(api, 0.4))) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        const r = Math.round(p.y / (pitch * 0.87));
        const c = Math.round((p.x - (r % 2 ? pitch / 2 : 0)) / pitch);
        const x = c * pitch + (r % 2 ? pitch / 2 : 0);
        const y = r * pitch * 0.87;
        ctx.globalAlpha = (1 - age) * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (let i = 0; i < k * 2; i++) {
          const a = (i / (k * 2)) * TAU - Math.PI / 2;
          const rad = i % 2 ? inner : R;
          const px = x + Math.cos(a) * rad;
          const py = y + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  carpet: {
    label: 'Sierpinski carpet',
    positional: false,
    note: 'Wacław Sierpiński, 1916: cut the middle ninth out of a square, and do the same to the eight that are left. Every curve in the plane can be embedded in what remains, which is the property he was after and is not obvious from looking at it.',
    params: {
      depth: { label: 'Depth', min: 1, max: 5, step: 1, default: 4 },
      gap: { label: 'Gap', min: 0, max: 0.2, step: 0.005, default: 0.02 },
    },
    frame(ctx, api) {
      const depth = Math.round(api.param('depth'));
      const gap = api.param('gap');
      const side = Math.min(api.w, api.h) * 0.92;
      const x0 = (api.w - side) / 2;
      const y0 = (api.h - side) / 2;
      const marks = api.particles.slice(-cap(api, 0.5));
      ctx.fillStyle = api.palette.default;
      const draw = (x, y, s, d) => {
        if (d === 0) {
          const inset = s * gap;
          // An event colours the square it landed in, at whatever depth that
          // square happens to be: a big event lands in a big square.
          ctx.fillRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
          return;
        }
        const t = s / 3;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (r === 1 && c === 1) continue;   // the middle ninth, removed
            draw(x + c * t, y + r * t, t, d - 1);
          }
        }
      };
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = api.palette.default;
      draw(x0, y0, side, depth);

      // The events afterwards, each colouring the one square it landed in.
      // Testing every square against every mark was four thousand squares
      // against four hundred marks; this is one walk down the tree per mark.
      const leaf = side / Math.pow(3, depth);
      for (const p of marks) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        const gx = Math.floor((p.x - x0) / leaf);
        const gy = Math.floor((p.y - y0) / leaf);
        if (gx < 0 || gy < 0) continue;
        // A square is in the carpet unless any base-three digit pair is the
        // middle one, which is the carpet stated as arithmetic.
        let inCarpet = true;
        let a = gx;
        let b = gy;
        for (let d = 0; d < depth; d++) {
          if (a % 3 === 1 && b % 3 === 1) { inCarpet = false; break; }
          a = (a / 3) | 0;
          b = (b / 3) | 0;
        }
        if (!inCarpet || a > 0 || b > 0) continue;
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.fillStyle = p.color;
        const inset = leaf * gap;
        ctx.fillRect(x0 + gx * leaf + inset, y0 + gy * leaf + inset, leaf - inset * 2, leaf - inset * 2);
      }
      ctx.globalAlpha = 1;
    },
  },

  fern: {
    label: 'Barnsley fern',
    positional: false,
    preview: { dt: 30, frames: 130 },
    note: 'Michael Barnsley, 1988. Four affine maps, chosen at random with fixed probabilities: one draws the stem, one the whole fern shrunk and tilted, two the left and right fronds. Twenty-four numbers, and a plant. It is the demonstration that made iterated function systems famous.',
    params: {
      rate: { label: 'Points per second', min: 500, max: 40000, step: 500, default: 9000 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.99 },
      lean: { label: 'Lean', min: -0.1, max: 0.1, step: 0.002, default: 0.04 },
    },
    init(api) {
      const s = api.scene;
      s.x = 0;
      s.y = 0;
      s.tint = null;
      s.bufClean = false;
    },
    event(p, api) {
      api.scene.tint = p.color;
      api.scene.push = 1;
    },
    frame(ctx, api) {
      const s = api.scene;
      const lean = api.param('lean');
      const n = Math.min(30000, Math.round((api.param('rate') * api.dt) / 1000) + (s.push ? 4000 : 0));
      s.push = 0;
      // Onto a buffer, because a fern is built out of a hundred thousand
      // points and a frame only ever draws a few hundred of them. Drawn
      // straight to the canvas it was one frame's worth of dots: about a
      // twentieth of the plant, and it read as a smear.
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;
      const scale = Math.min(api.w / 6.6, api.h / 10.6);
      const cx = api.w / 2;
      const cy = api.h;
      g.fillStyle = s.tint || api.palette.anon;
      g.globalAlpha = 0.5;
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        let nx;
        let ny;
        if (r < 0.01) { nx = 0; ny = 0.16 * s.y; }
        else if (r < 0.86) { nx = (0.85 + lean) * s.x + 0.04 * s.y; ny = -0.04 * s.x + 0.85 * s.y + 1.6; }
        else if (r < 0.93) { nx = 0.2 * s.x - 0.26 * s.y; ny = 0.23 * s.x + 0.22 * s.y + 1.6; }
        else { nx = -0.15 * s.x + 0.28 * s.y; ny = 0.26 * s.x + 0.24 * s.y + 0.44; }
        s.x = nx; s.y = ny;
        g.fillRect(cx + s.x * scale, cy - s.y * scale, 1, 1);
      }
      g.globalAlpha = 1;
      fadeBuffer(g, cv, api.param('hold'), api.dt);
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  julia: {
    label: 'Julia set',
    positional: false,
    note: 'Gaston Julia described these in 1918, sixty years before anyone could see one. Iterate z -> z² + c and colour each point by how long it takes to escape; move c a little and the shape changes completely. Events move c, so the figure is never the same twice.',
    params: {
      re: { label: 'c, real', min: -1.2, max: 0.6, step: 0.005, default: -0.7 },
      im: { label: 'c, imaginary', min: -1, max: 1, step: 0.005, default: 0.27 },
      grid: { label: 'Resolution', min: 2, max: 10, step: 1, default: 5 },
      iter: { label: 'Iterations', min: 20, max: 160, step: 5, default: 70 },
    },
    init(api) {
      api.scene.dx = 0;
      api.scene.dy = 0;
    },
    event(p, api) {
      const s = api.scene;
      // A nudge to c, easing back. Moving c is the only interesting thing you
      // can do to a Julia set, and a small move is a large change.
      s.dx += (p.x / api.w - 0.5) * 0.12;
      s.dy += (p.y / api.h - 0.5) * 0.12;
      s.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      s.dx = (s.dx || 0) * 0.97;
      s.dy = (s.dy || 0) * 0.97;
      const cre = api.param('re') + s.dx;
      const cim = api.param('im') + s.dy;
      const step = Math.max(2, Math.round(api.param('grid')));
      const iter = Math.round(api.param('iter'));
      const cols = Math.ceil(api.w / step) + 1;
      const rows = Math.ceil(api.h / step) + 1;
      const scale = 2.6 / Math.min(api.w, api.h);
      const ink = s.tint || api.palette.user;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let zx = (c * step - api.w / 2) * scale;
          let zy = (r * step - api.h / 2) * scale;
          let n = 0;
          // Squared magnitude against four, which saves a square root per
          // iteration and there are a few million of them a second.
          while (n < iter && zx * zx + zy * zy < 4) {
            const t = zx * zx - zy * zy + cre;
            zy = 2 * zx * zy + cim;
            zx = t;
            n++;
          }
          if (n >= iter) continue;         // inside: left as ground
          // Banded on the logarithm of the escape count: linear in n, almost
          // everything outside escapes in under ten steps and the picture is a
          // silhouette with no structure round it.
          ctx.globalAlpha = Math.min(0.92, 0.12 + Math.log(1 + n) / Math.log(1 + iter) * 0.9);
          ctx.fillStyle = ink;
          ctx.fillRect(c * step - step / 2, r * step - step / 2, step, step);
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  lsystem: {
    label: 'L-system',
    positional: false,
    note: 'Aristid Lindenmayer, 1968: a biologist wanting to describe how algae grow wrote a grammar instead of an equation. Replace every symbol at once, read the result as instructions for a pen, and a plant comes out. Events add another generation of growth.',
    params: {
      depth: { label: 'Generations', min: 2, max: 6, step: 1, default: 4, rebuild: true },
      angle: { label: 'Branch angle', min: 8, max: 40, step: 1, default: 22 },
      weight: { label: 'Line weight', min: 0.3, max: 3, step: 0.1, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const depth = Math.max(1, Math.round(api.param('depth')));
      // The classic bracketed system: F -> FF+[+F-F-F]-[-F+F+F].
      let str = 'F';
      for (let i = 0; i < depth; i++) {
        let out = '';
        for (const ch of str) out += ch === 'F' ? 'FF+[+F-F-F]-[-F+F+F]' : ch;
        str = out;
        if (str.length > 24000) break;
      }
      s.word = str;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.word) return;
      const turn = (api.param('angle') * Math.PI) / 180;
      const len = Math.min(api.w, api.h) / (12 * Math.max(1, Math.round(api.param('depth'))));
      ctx.lineWidth = api.param('weight');
      ctx.lineCap = 'round';
      ctx.strokeStyle = api.palette.default;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      let x = api.w / 2;
      let y = api.h;
      let a = -Math.PI / 2;
      const stack = [];
      for (const ch of s.word) {
        if (ch === 'F') {
          const nx = x + Math.cos(a) * len;
          const ny = y + Math.sin(a) * len;
          ctx.moveTo(x, y);
          ctx.lineTo(nx, ny);
          x = nx; y = ny;
        } else if (ch === '+') a += turn;
        else if (ch === '-') a -= turn;
        else if (ch === '[') stack.push([x, y, a]);
        else if (ch === ']') { const t = stack.pop(); if (t) { x = t[0]; y = t[1]; a = t[2]; } }
      }
      ctx.stroke();
      // Events sit on the plant as buds, at whatever tip is nearest.
      for (const p of api.particles.slice(-cap(api, 0.4))) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        ctx.globalAlpha = (1 - age) * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, p.r * 0.18), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },

  ulam: {
    label: 'Ulam spiral',
    positional: false,
    note: 'Stanisław Ulam, 1963, doodling through a dull lecture: write the integers on a square spiral and mark the primes. They fall on diagonals, in numbers nobody has explained. The most famous unsolved thing anyone has found by being bored.',
    params: {
      cell: { label: 'Cell size', min: 2, max: 14, step: 1, default: 5, rebuild: true },
      dot: { label: 'Dot size', min: 0.3, max: 1, step: 0.02, default: 0.62 },
    },
    init(api) {
      const s = api.scene;
      const cell = Math.max(2, Math.round(api.param('cell')));
      const cols = Math.max(9, Math.floor(api.w / cell));
      const rows = Math.max(9, Math.floor(api.h / cell));
      const total = cols * rows;
      // The sieve, once. Trial division per cell would be a hundred thousand
      // divisions a frame for a picture that never changes.
      //
      // Kept as the sieve rather than as a list of the positions it produced:
      // that list was thirteen hundred entries against a ceiling of four
      // hundred, and it is the same rule the maze next door had to learn.
      // Bounded by the grid is not the same as bounded by the budget. Walking
      // the spiral again each frame is one pass over the same array, and it
      // keeps every prime rather than the first four hundred.
      const sieve = new Uint8Array(total + 2).fill(1);
      sieve[0] = 0;
      sieve[1] = 0;
      for (let i = 2; i * i <= total; i++) {
        if (!sieve[i]) continue;
        for (let j = i * i; j <= total; j += i) sieve[j] = 0;
      }
      s.sieve = sieve;
      s.cell = cell;
      s.cols = cols;
      s.rows = rows;
      s.total = total;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.sieve) return;
      const cell = s.cell;
      const cx = api.w / 2;
      const cy = api.h / 2;
      const r = cell * api.param('dot') * 0.5;
      const marks = api.particles.slice(-cap(api, 0.4)).filter(
        (p) => api.now - p.born < Math.max(1, p.life)
      );

      // The marks go into a coarse grid first, so asking "is there an event
      // near this prime" is one array read rather than a walk of every mark.
      // Asked the other way it is three thousand primes against four hundred
      // marks every frame, and that alone took the whole test suite past its
      // eighteen-minute ceiling.
      const GW = 40;
      const GH = 24;
      // Indices into `marks`, in a typed array. A plain array of objects here
      // was a thousand-odd entries and fell foul of the same ceiling the maze
      // and the prime list did -- and a fixed lookup table is exactly what the
      // grids in the automata next door use for the same reason.
      const near = s.near && s.near.length === GW * GH ? s.near : (s.near = new Int16Array(GW * GH));
      near.fill(-1);
      marks.forEach((m, mi) => {
        const R = Math.max(cell * 3, m.r);
        const c0 = Math.max(0, Math.floor(((m.x - R) / api.w) * GW));
        const c1 = Math.min(GW - 1, Math.floor(((m.x + R) / api.w) * GW));
        const r0 = Math.max(0, Math.floor(((m.y - R) / api.h) * GH));
        const r1 = Math.min(GH - 1, Math.floor(((m.y + R) / api.h) * GH));
        for (let rr = r0; rr <= r1; rr++) {
          for (let cc = c0; cc <= c1; cc++) near[rr * GW + cc] = mi;
        }
      });

      // One walk of the spiral, drawing as it goes. A prime near an event is
      // drawn in that event's colour and larger, which is the whole of what
      // the feed does here.
      let x = 0;
      let y = 0;
      let dx = 1;
      let dy = 0;
      let run = 1;
      let done = 0;
      const halfC = s.cols / 2;
      const halfR = s.rows / 2;
      ctx.fillStyle = api.palette.default;
      ctx.globalAlpha = 0.7;
      for (let n = 1; n <= s.total; n++) {
        if (s.sieve[n] && Math.abs(x) < halfC && Math.abs(y) < halfR) {
          const px = cx + x * cell;
          const py = cy + y * cell;
          const gc = Math.min(GW - 1, Math.max(0, (px / api.w * GW) | 0));
          const gr = Math.min(GH - 1, Math.max(0, (py / api.h * GH) | 0));
          const hitIndex = near[gr * GW + gc];
          const hit = hitIndex >= 0 ? marks[hitIndex] : null;
          if (hit) {
            const age = (api.now - hit.born) / Math.max(1, hit.life);
            ctx.globalAlpha = (1 - age) * 0.9;
            ctx.fillStyle = hit.color;
            ctx.fillRect(px - r * 1.6, py - r * 1.6, r * 3.2, r * 3.2);
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = api.palette.default;
          } else {
            ctx.fillRect(px - r, py - r, r * 2, r * 2);
          }
        }
        x += dx;
        y += dy;
        done++;
        if (done === run) {
          done = 0;
          const t = dx;
          dx = -dy;
          dy = t;                        // turn left
          if (dy === 0) run++;
        }
      }
      ctx.globalAlpha = 1;
    },
  },

  collatz: {
    label: 'Collatz tree',
    positional: false,
    note: 'Take a number: halve it if it is even, treble it and add one if it is odd, and repeat. Every number tried so far reaches one, and nobody can prove they all do -- Erdos said mathematics is not yet ready for such problems. Grown backwards from one it is a tree, and each event lights a branch of it.',
    params: {
      depth: { label: 'How far back', min: 6, max: 26, step: 1, default: 17, rebuild: true },
      turn: { label: 'Bend', min: 2, max: 24, step: 0.5, default: 9 },
      weight: { label: 'Line weight', min: 0.2, max: 3, step: 0.1, default: 0.9 },
    },
    init(api) {
      const s = api.scene;
      const depth = Math.round(api.param('depth'));
      // The tree run backwards, which is the picture people know. Every n has
      // 2n above it, and some also have (n-1)/3 -- that second branch is where
      // the tree gets its shape, and it is the step nobody can account for.
      //
      // Drawing each number's path down to one instead, which was the first
      // attempt, gives a bundle of curves and not a tree: two steps in three
      // are halvings, so every path bends the same way and they all lie on top
      // of one another.
      const nodes = [{ n: 1, parent: -1, depth: 0, side: 0 }];
      for (let i = 0; i < nodes.length && nodes.length < 4000; i++) {
        const n = nodes[i].n;
        const d = nodes[i].depth;
        if (d >= depth) continue;
        nodes.push({ n: n * 2, parent: i, depth: d + 1, side: 0 });
        const m = (n - 1) / 3;
        if (n > 4 && (n - 1) % 3 === 0 && m % 2 === 1) {
          nodes.push({ n: m, parent: i, depth: d + 1, side: 1 });
        }
      }
      s.nodes = nodes;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.nodes) return;
      const bend = (api.param('turn') * Math.PI) / 180;
      const depth = Math.round(api.param('depth'));
      const seg = (api.h * 0.9) / Math.max(1, depth);
      // Positions are computed once per frame from the parent's, which is one
      // pass over the array because a parent is always earlier in it.
      const X = new Float64Array(s.nodes.length);
      const Y = new Float64Array(s.nodes.length);
      const A = new Float64Array(s.nodes.length);
      X[0] = api.w / 2;
      Y[0] = api.h * 0.98;
      A[0] = -Math.PI / 2;
      for (let i = 1; i < s.nodes.length; i++) {
        const nd = s.nodes[i];
        const a = A[nd.parent] + (nd.side ? bend * 2.2 : -bend * 0.5);
        A[i] = a;
        X[i] = X[nd.parent] + Math.cos(a) * seg;
        Y[i] = Y[nd.parent] + Math.sin(a) * seg;
      }
      ctx.lineWidth = api.param('weight');
      ctx.lineCap = 'round';
      ctx.strokeStyle = api.palette.default;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (let i = 1; i < s.nodes.length; i++) {
        ctx.moveTo(X[s.nodes[i].parent], Y[s.nodes[i].parent]);
        ctx.lineTo(X[i], Y[i]);
      }
      ctx.stroke();

      // An event lights the path from one node back down to the root, which is
      // exactly that number's Collatz sequence read backwards.
      for (const p of api.particles.slice(-cap(api, 0.2))) {
        const age = (api.now - p.born) / Math.max(1, p.life);
        if (age >= 1) continue;
        let i = Math.abs(Math.round(p.x * 131 + p.y * 917)) % s.nodes.length;
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        while (i > 0) {
          const par = s.nodes[i].parent;
          ctx.moveTo(X[par], Y[par]);
          ctx.lineTo(X[i], Y[i]);
          i = par;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },

  riley: {
    label: 'Riley waves',
    positional: false,
    note: "Bridget Riley's wave paintings of the 1960s: parallel bands whose curvature changes across the canvas, so a flat surface appears to swell and turn. She was painting what the eye does with a repeated line, which is the same subject as the moire next door approached from the other side.",
    params: {
      bands: { label: 'How many bands', min: 8, max: 60, step: 1, default: 26 },
      amp: { label: 'Swell', min: 0, max: 1, step: 0.02, default: 0.5 },
      period: { label: 'Period', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    },
    init(api) {
      api.scene.phase = 0;
    },
    event(p, api) {
      // Each event pushes the phase along, so the swell travels across the
      // picture at the rate the feed arrives.
      api.scene.phase = (api.scene.phase || 0) + 0.22;
      api.scene.tint = p.color;
    },
    frame(ctx, api) {
      const s = api.scene;
      const bands = Math.round(api.param('bands'));
      const amp = api.param('amp');
      const period = api.param('period');
      const h = api.h / bands;
      const phase = (s.phase || 0) + api.now / 6000;
      const steps = Math.max(16, Math.round(api.w / 8));
      for (let i = 0; i < bands; i++) {
        // Every other band is inked; the gaps are the ground. Riley's are
        // black on white and the reversal is the palette's business.
        if (i % 2) continue;
        ctx.fillStyle = i % 4 === 0 ? (s.tint || api.palette.default) : api.palette.default;
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const x = (k / steps) * api.w;
          const swell = Math.sin((x / api.w) * TAU * period + phase) * h * amp * 2;
          const y = i * h + swell;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let k = steps; k >= 0; k--) {
          const x = (k / steps) * api.w;
          const swell = Math.sin((x / api.w) * TAU * period + phase) * h * amp * 2;
          ctx.lineTo(x, i * h + swell + h);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
};
