// Two pictures that are documents rather than images.
//
// Everything else in the catalogue makes a mark where an event landed. These
// two make a PAGE: one writes it in a script nobody can read, the other
// assembles it out of tiles that are only allowed to sit beside tiles they
// join up with. Both are legible as objects -- a manuscript, a plan -- before
// they are legible as pictures, which is a thing a generator almost never is.
//
// They keep the house rules: fixed-size typed arrays, the page kept on a
// buffer from the renderer's pool, and nothing that grows without a ceiling.

import { scratch } from './paint.js';
import { shadeOf, lightnessOf, lighten } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'default', 'alert'];

const inkOf = (api, k) =>
  shadeOf(api.palette[ROLES[k % ROLES.length]] || api.palette.default,
    [Math.random(), Math.random(), Math.random()],
    Number.isFinite(api.richness) ? api.richness : 0.45);

/** A small deterministic generator from a number, so a glyph is always itself. */
function seeded(n) {
  let s = (n | 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** The darkest thing in the palette: what a scribe would have in the pot. */
function scribeInk(api) {
  let best = api.palette.default || api.palette.text || '#1b1712';
  let dark = lightnessOf(best);
  for (const role of ROLES) {
    const c = api.palette[role];
    if (!c) continue;
    const L = lightnessOf(c);
    if (L < dark) {
      dark = L;
      best = c;
    }
  }
  // On a dark ground a scribe would be writing in something pale.
  return lightnessOf(api.palette.background) > 0.5 ? best : lighten(api.palette.text || '#f0ece2', 0.1);
}

export const WRITTEN_SCENES = {
  // --- asemic ---------------------------------------------------------------------------
  asemic: {
    label: 'Manuscript',
    note: 'A page in a script nobody can read. Asemic writing is writing without language -- the shapes of it, the rhythm of it, the way a line of it sits on a page -- and the eye reads all of that long before it notices there are no words. Every event writes one character, and the character is drawn from the event\'s own identity, so the same event always writes the same letter and the page is a faithful transcription of a text in a language that does not exist. Words end, lines fill, the margin holds, and now and then a larger letter is set in red.',
    how: 'A glyph is a handful of strokes over a three-by-five lattice, chosen by a generator seeded from the event\'s identity: the same identity gives the same letter, always. The pen keeps a cursor, breaks words on a run of its own, wraps at the measure and turns the page when the last line is full.',
    preview: { frames: 200, dt: 45 },
    params: {
      size: { label: 'Size of the hand', min: 0.6, max: 2.2, step: 0.05, default: 1 },
      measure: { label: 'Width of the column', min: 0.5, max: 1, step: 0.02, default: 0.82 },
      slant: { label: 'Slant of the hand', min: -0.4, max: 0.4, step: 0.02, default: 0.08 },
      rubric: { label: 'How often a red letter', min: 0, max: 1, step: 0.02, default: 0.22 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.em = Math.max(7, m * 0.034);
      s.margin = Math.max(12, m * 0.085);
      s.x = s.margin;
      s.y = s.margin + s.em;
      s.word = 0;
      s.line = 0;
      s.cleared = false;
      s.ambient = 0;
      s.turning = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.em) return;
      // The identity writes the letter, not the position: the same event is
      // always the same character, wherever on the page it happens to fall.
      write(api, hashOf(p), p.color);
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
      // A page writes itself even when nothing arrives: a scribe at work, and
      // fast enough that a still of this scene is a page rather than an
      // opening paragraph.
      s.ambient += api.dt;
      const every = 55;
      while (s.ambient > every) {
        s.ambient -= every;
        write(api, (Math.random() * 1e9) | 0, null);
      }
      // Turning the page: the old one goes under, slowly.
      if (s.turning > 0) {
        s.turning -= api.dt;
        b.fillStyle = api.palette.background;
        b.globalAlpha = 0.06;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- collapse -------------------------------------------------------------------------
  collapse: {
    label: 'Collapse',
    note: 'Wave function collapse: not a drawing but a solver. Every cell of the grid begins as every tile at once; the emptiest cell -- the one with fewest possibilities left -- is chosen, one of its tiles is picked, and the consequences are propagated to its neighbours, and to theirs, until nothing more is forced. A tile may only sit beside a tile it joins up with, so the picture that comes out is continuous everywhere, which is why this method took over generative architecture and tile art in a few years. Every event drops a fixed tile into the grid and makes the solver find a way round it.',
    how: 'Twelve tiles, each described by what it offers on its four edges -- a line or nothing -- and the only rule is that touching edges must agree. Possibilities are a bitmask per cell, so propagation is a queue and a handful of bitwise ands; a contradiction clears a small neighbourhood and lets it settle again rather than restarting the page.',
    preview: { frames: 150, dt: 50 },
    params: {
      scale: { label: 'Size of a tile', min: 0.5, max: 2.5, step: 0.05, default: 1, rebuild: true },
      density: { label: 'How much line', min: 0.2, max: 1, step: 0.02, default: 0.62 },
      weight: { label: 'Line weight', min: 0.4, max: 2.5, step: 0.05, default: 1 },
      speed: { label: 'How fast it settles', min: 0.3, max: 3, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      // The grid is laid once, at the size the dial asks for: a tile that
      // changed size while the page was solving would leave lines that no
      // longer meet, and the whole point of the method is that they meet.
      s.tile = Math.max(10, Math.round((Math.min(api.w, api.h) / 18) * api.param('scale')));
      s.cols = Math.max(3, Math.ceil(api.w / s.tile));
      s.rows = Math.max(3, Math.ceil(api.h / s.tile));
      const n = s.cols * s.rows;
      // A cell is a bitmask of the tiles still possible for it.
      s.cells = new Uint16Array(n).fill(ALL);
      s.chosen = new Int8Array(n).fill(-1);
      s.drawn = new Uint8Array(n);
      s.tint = new Uint8Array(n);
      s.queue = new Int32Array(n * 4);
      s.inks = [];
      s.settled = 0;
      s.cleared = false;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cells) return;
      const cx = Math.max(0, Math.min(s.cols - 1, Math.floor(p.x / s.tile)));
      const cy = Math.max(0, Math.min(s.rows - 1, Math.floor(p.y / s.tile)));
      const k = s.inks.length;
      s.inks.push(p.color || inkOf(api, k));
      if (s.inks.length > 20) s.inks.shift();
      // A constraint arrives: this cell is a crossing, and the solver has to
      // find a way to live with it.
      force(s, cy * s.cols + cx, CROSS, Math.min(255, k));
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
      const steps = Math.max(1, Math.round(3 * api.param('speed')));
      for (let i = 0; i < steps; i++) observe(s, api.param('density'));
      paint(b, s, api);
      // A page that has settled everywhere is let go and begun again, so a
      // wall never stops on a finished pattern.
      if (s.settled >= s.cols * s.rows) {
        s.ambient += api.dt;
        if (s.ambient > 2500) {
          s.ambient = 0;
          s.cells.fill(ALL);
          s.chosen.fill(-1);
          s.drawn.fill(0);
          s.settled = 0;
          b.fillStyle = api.palette.background;
          b.globalAlpha = 0.5;
          b.fillRect(0, 0, api.w, api.h);
          b.globalAlpha = 1;
        }
      }
      ctx.drawImage(buf, 0, 0);
    },
  },
};

// --- the manuscript ---------------------------------------------------------------------

/** A number that belongs to this event and to no other. */
function hashOf(p) {
  const id = String(p.id ?? `${p.x | 0},${p.y | 0}`);
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * One character, and the pen moves on.
 *
 * The lattice is three wide and five tall, as a pen's is: the middle band is
 * the body of the letter, the row above is where ascenders go and the row
 * below is where descenders hang. Strokes join lattice points with a curve
 * through a point pulled off the line, which is what keeps them from looking
 * like a circuit diagram.
 */
function write(api, seed, color) {
  const s = api.scene;
  const b = s.bufCtx;
  if (!b) return;
  const rnd = seeded(seed);
  const em = s.em * api.param('size');
  const slant = api.param('slant');
  const measure = s.margin + (api.w - s.margin * 2) * api.param('measure');
  const ink = scribeInk(api);
  const rubric = rnd() < api.param('rubric') * 0.25;

  const w = em * 0.62;
  const h = em;
  // A word is three to seven letters, then a space.
  if (s.word <= 0) s.word = 3 + ((rnd() * 5) | 0);

  b.save();
  b.strokeStyle = rubric ? (color || api.palette.alert || ink) : ink;
  b.lineCap = 'round';
  b.lineJoin = 'round';
  b.lineWidth = Math.max(0.8, em * (rubric ? 0.14 : 0.09));
  b.globalAlpha = 0.92;

  const x0 = s.x;
  const y0 = s.y;
  const px = (u) => x0 + u * w + (0.5 - rnd() * 0.2) * em * 0.02;
  const py = (v) => y0 + (v - 0.5) * h * 0.62 + slant * (v - 0.5) * -h * 0.3;
  const strokes = 2 + ((rnd() * 3) | 0);
  for (let i = 0; i < strokes; i++) {
    const u0 = (rnd() * 3 | 0) / 2;
    const v0 = (rnd() * 3 | 0) / 2 + (rnd() < 0.18 ? -0.6 : 0);
    const u1 = (rnd() * 3 | 0) / 2;
    const v1 = (rnd() * 3 | 0) / 2 + (rnd() < 0.18 ? 0.7 : 0);
    if (u0 === u1 && v0 === v1) continue;
    const bend = (rnd() - 0.5) * 0.9;
    const mx = (px(u0) + px(u1)) / 2 - (py(v1) - py(v0)) * bend * 0.5;
    const my = (py(v0) + py(v1)) / 2 + (px(u1) - px(u0)) * bend * 0.5;
    b.beginPath();
    b.moveTo(px(u0), py(v0));
    b.quadraticCurveTo(mx, my, px(u1), py(v1));
    b.stroke();
  }
  b.restore();

  // The pen advances, the word ends, the line wraps, the page turns.
  s.x += w * (rubric ? 1.5 : 1.12);
  s.word--;
  if (s.word <= 0) s.x += w * 0.7;
  if (s.x > measure) {
    s.x = s.margin;
    s.y += em * 1.62;
    s.line++;
    s.word = 0;
  }
  if (s.y > api.h - s.margin) {
    s.x = s.margin;
    s.y = s.margin + em;
    s.line = 0;
    s.turning = 900;
  }
}

// --- the solver -------------------------------------------------------------------------
//
// Twelve tiles. Each is four bits -- north, east, south, west -- and a bit set
// means the tile offers a line at the middle of that edge. Two tiles may sit
// side by side only if the edges they share agree, which is the entire rule
// set; everything that looks designed in the result comes out of it.
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const TILES = [
  0,                    // blank
  N | S, E | W,         // straights
  N | E, E | S, S | W, W | N, // corners
  N | E | S, E | S | W, S | W | N, W | N | E, // tees
  N | E | S | W,        // cross
];
const CROSS = TILES.length - 1;
const ALL = (1 << TILES.length) - 1;

/** Which tiles offer a line on a given edge, as a mask. */
const OFFERS = [N, E, S, W].map((edge) => {
  let mask = 0;
  for (let i = 0; i < TILES.length; i++) if (TILES[i] & edge) mask |= 1 << i;
  return mask;
});
const OPPOSITE = [2, 3, 0, 1];
const STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Force one cell to a tile, and let the consequences travel. */
function force(s, at, tile, tint) {
  if (at < 0 || at >= s.cells.length) return;
  s.cells[at] = 1 << tile;
  s.chosen[at] = tile;
  s.tint[at] = tint;
  s.drawn[at] = 0;
  propagate(s, at);
}

/**
 * Choose the cell with the fewest possibilities left, pick one of them, and
 * propagate. Entropy first is what makes the result coherent rather than a
 * field of tiles that happen to fit: the solver always works where it is most
 * constrained, so it never paints itself into a corner it cannot leave.
 */
function observe(s, density) {
  let best = -1;
  let bestCount = 99;
  for (let i = 0; i < s.cells.length; i++) {
    if (s.chosen[i] >= 0) continue;
    const count = bits(s.cells[i]);
    if (count === 0) {
      // A contradiction: clear a little around it and let it settle again,
      // rather than throwing the whole page away.
      relax(s, i);
      return;
    }
    if (count < bestCount) {
      bestCount = count;
      best = i;
      if (count === 1) break;
    }
  }
  if (best < 0) return;
  const mask = s.cells[best];
  // Weighted: the blank tile is what keeps a page from being solid line, and
  // the dial says how much of the picture is drawn on.
  const options = [];
  for (let i = 0; i < TILES.length; i++) {
    if (!(mask & (1 << i))) continue;
    const weight = i === 0 ? Math.max(0.05, 1.6 * (1 - density)) : TILES[i] === (N | E | S | W) ? 0.25 : 1;
    options.push([i, weight]);
  }
  if (!options.length) {
    relax(s, best);
    return;
  }
  let total = 0;
  for (const [, w] of options) total += w;
  let pick = Math.random() * total;
  let tile = options[0][0];
  for (const [i, w] of options) {
    pick -= w;
    if (pick <= 0) {
      tile = i;
      break;
    }
  }
  s.cells[best] = 1 << tile;
  s.chosen[best] = tile;
  s.settled++;
  propagate(s, best);
}

/** What a neighbour is still allowed to be, given what this cell can be. */
function propagate(s, from) {
  let head = 0;
  let tail = 0;
  s.queue[tail++] = from;
  while (head < tail) {
    const at = s.queue[head++];
    const x = at % s.cols;
    const y = (at / s.cols) | 0;
    const mask = s.cells[at];
    for (let dir = 0; dir < 4; dir++) {
      const nx = x + STEP[dir][0];
      const ny = y + STEP[dir][1];
      if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
      const nAt = ny * s.cols + nx;
      if (s.chosen[nAt] >= 0) continue;
      // If any tile here offers a line on this edge, the neighbour may offer
      // one back; if any tile here offers nothing, the neighbour may offer
      // nothing. Anything else is impossible.
      const offers = (mask & OFFERS[dir]) !== 0;
      const withholds = (mask & ~OFFERS[dir]) !== 0;
      let allowed = 0;
      if (offers) allowed |= OFFERS[OPPOSITE[dir]];
      if (withholds) allowed |= ALL & ~OFFERS[OPPOSITE[dir]];
      const before = s.cells[nAt];
      const after = before & allowed;
      if (after !== before) {
        s.cells[nAt] = after;
        if (tail < s.queue.length) s.queue[tail++] = nAt;
      }
    }
  }
}

/** Undo a small neighbourhood, so a contradiction costs a patch and not a page. */
function relax(s, at) {
  const x = at % s.cols;
  const y = (at / s.cols) | 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
      const i = ny * s.cols + nx;
      if (s.chosen[i] >= 0) s.settled--;
      s.cells[i] = ALL;
      s.chosen[i] = -1;
      s.drawn[i] = 0;
    }
  }
}

const bits = (v) => {
  let n = 0;
  let x = v;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
};

/** Draw whatever has settled since the last frame. */
function paint(b, s, api) {
  const t = s.tile;
  const weight = api.param('weight');
  b.lineCap = 'round';
  b.lineWidth = Math.max(1, t * 0.16 * weight);
  for (let i = 0; i < s.chosen.length; i++) {
    const tile = s.chosen[i];
    if (tile < 0 || s.drawn[i]) continue;
    s.drawn[i] = 1;
    const edges = TILES[tile];
    if (!edges) continue;
    const x = (i % s.cols) * t;
    const y = ((i / s.cols) | 0) * t;
    // Exactly half a tile, so an arc leaves each edge at its middle and
    // meets whatever the neighbour drew there.
    const r = t / 2;
    const cx = x + t / 2;
    const cy = y + t / 2;
    b.strokeStyle = s.inks[s.tint[i] % (s.inks.length || 1)] || inkOf(api, i);
    // A corner is drawn as a quarter turn rather than two straight halves:
    // it is the difference between a plan and a piece of ornament.
    const corners = [[N | E, 0], [E | S, 1], [S | W, 2], [W | N, 3]];
    const corner = corners.find(([mask]) => edges === mask);
    if (corner) {
      const [, turn] = corner;
      // A quarter turn about the corner the two edges share: the arc starts
      // on one edge's middle and ends on the other's.
      const ox = [x + t, x + t, x, x][turn];
      const oy = [y, y + t, y + t, y][turn];
      const from = [TAU / 4, TAU / 2, (TAU * 3) / 4, 0][turn];
      b.beginPath();
      b.arc(ox, oy, r, from, from + TAU / 4);
      b.stroke();
      continue;
    }
    b.beginPath();
    if (edges & N) {
      b.moveTo(cx, y);
      b.lineTo(cx, cy);
    }
    if (edges & S) {
      b.moveTo(cx, y + t);
      b.lineTo(cx, cy);
    }
    if (edges & E) {
      b.moveTo(x + t, cy);
      b.lineTo(cx, cy);
    }
    if (edges & W) {
      b.moveTo(x, cy);
      b.lineTo(cx, cy);
    }
    b.stroke();
  }
}
