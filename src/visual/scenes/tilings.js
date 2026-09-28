// Four tilings, fractals and figures.
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
//   Ulam      Stanisław Ulam, 1963, doodling in a dull lecture: the integers
//             on a square spiral, and the primes fall on diagonals nobody has
//             explained.
//   Op waves  Op art of the 1960s: bands that swell and turn.

import { cap } from './budget.js';
import { scratch } from './paint.js';

const TAU = Math.PI * 2;

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

  opwaves: {
    label: 'Optical waves',
    positional: false,
    note: 'Op art, as painted in the 1960s: parallel bands whose curvature changes across the canvas, so a flat surface appears to swell and turn. The subject is what the eye does with a repeated line, which is the moire next door approached from the other side. Named for the movement rather than for any one painter, several of whom are still working.',
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
        // Every other band is inked; the gaps are the ground. The op-art
        // originals are black on white and the reversal is the palette's business.
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
