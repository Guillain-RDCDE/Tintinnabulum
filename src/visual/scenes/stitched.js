// Three pictures laid on a lattice.
//
//   lanes    white bars ruled across a black field, each one stepping down
//            half a bar here and there, like a dropped stitch
//   meshes   a square cut and cut again into blocks, every block a tint and
//            a mesh of its own -- coarse, fine, crossed with diagonals
//   lineage  discs set on the crossings of a grid, joined into a tree, each
//            one numbered in the order it came
//
// What they share is the lattice: the sheet is divided into units before
// anything arrives, and an event can only take a unit, split one, or join one
// to another. The pictures are of the kind a plotter or a printer of knitting
// charts would make, with nothing in them that is not on the grid.
//
// House rules as everywhere: what accumulates is bounded by the renderer's
// budget, and with nothing arriving the sheet stays as it was.

import { scratch } from './paint.js';
import { papers } from './papers.js';
import { mixColors, lighten } from '../color.js';

const TAU = Math.PI * 2;

/** How big an event is, 0 to 1, against the largest mark the renderer makes. */
function sizeOf(p, api) {
  const most = Math.min(api.w, api.h) * 0.34;
  return Math.max(0, Math.min(1, p.r / most));
}

/** The darkest ink against the ground, or the palest on a dark one. */
function inkOf(api) {
  const paper = papers(api);
  return paper.pale ? paper.ink : paper.card;
}

function clampTo(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- meshes -------------------------------------------------------------------------------

/** A block's look: a tint and a mesh, drawn from the sheet's own few. */
function dressBlock(blk, s, color) {
  if (s.figure === 1) {
    dressStriped(blk, s, color);
    return;
  }
  const pick = Math.random();
  if (color && color === s.accent && blk.w * blk.h > 6) color = null;
  blk.tint = color || s.tints[(Math.random() * s.tints.length) | 0];
  // Coarse grid, fine grid, coarse crossed, fine crossed: the four meshes
  // the sheet is modelled on, the crossed ones the commonest.
  blk.step = pick < 0.4 ? 1 : 0.5;
  blk.cross = Math.random() < 0.55;
  // A crossed fine mesh is nearly solid, so it goes on the darkest tint.
  if (blk.cross && blk.step < 1 && Math.random() < 0.45) blk.tint = s.dark;
  blk.done = false;
}

/** Cut a block into two or four along the lattice, if it is big enough. */
function split(s, blk) {
  const { c, r, w, h } = blk;
  const kids = [];
  if (w >= 2 && h >= 2 && Math.random() < 0.5) {
    const cw = Math.max(1, Math.round(w * (0.3 + Math.random() * 0.4)));
    const rh = Math.max(1, Math.round(h * (0.3 + Math.random() * 0.4)));
    kids.push({ c, r, w: cw, h: rh }, { c: c + cw, r, w: w - cw, h: rh },
      { c, r: r + rh, w: cw, h: h - rh }, { c: c + cw, r: r + rh, w: w - cw, h: h - rh });
  } else if (w >= h && w >= 2) {
    const cw = Math.max(1, Math.round(w * (0.3 + Math.random() * 0.4)));
    kids.push({ c, r, w: cw, h }, { c: c + cw, r, w: w - cw, h });
  } else if (h >= 2) {
    const rh = Math.max(1, Math.round(h * (0.3 + Math.random() * 0.4)));
    kids.push({ c, r, w, h: rh }, { c, r: r + rh, w, h: h - rh });
  }
  return kids.filter((k) => k.w > 0 && k.h > 0);
}

/** Lay a region out afresh: a few cuts down to blocks of a sensible size. */
function layout(s, region, depth) {
  const out = [];
  const go = (blk, d) => {
    const big = blk.w * blk.h;
    if (d <= 0 || big <= (s.figure === 1 ? 30 : 9) || (d < depth && Math.random() < 0.3)) {
      dressBlock(blk, s, null);
      out.push(blk);
      return;
    }
    const kids = split(s, blk);
    if (!kids.length) {
      dressBlock(blk, s, null);
      out.push(blk);
      return;
    }
    for (const k of kids) go(k, d - 1);
  };
  go({ ...region }, depth);
  return out;
}

/**
 * A block of the striped sheet: bare, a flat colour, black, or ruled with
 * upright or level lines, fine or wide -- the five things the sheets it
 * follows do, and nothing else.
 */
function dressStriped(blk, s, color) {
  const pick = Math.random();
  const flat = s.fill * 0.5;
  const black = flat + s.black * 0.3;
  const ruled = black + 0.36;
  if (color || pick < flat) {
    blk.kind = 'flat';
    blk.tint = color || s.flats[(Math.random() * s.flats.length) | 0];
  } else if (pick < black) {
    blk.kind = 'black';
  } else if (pick < ruled) {
    blk.kind = Math.random() < 0.6 ? 'upright' : 'level';
    // Fine or wide: the upright rulings are mostly fine, the level ones
    // mostly wide, as on the sheets.
    const fine = blk.kind === 'upright' ? Math.random() < 0.7 : Math.random() < 0.3;
    blk.step = fine ? 1 : 2.4 + Math.random() * 2.4;
  } else {
    blk.kind = 'blank';
  }
  blk.done = false;
}

function strikeStriped(b, blk, s) {
  const x = s.x0 + blk.c * s.unit;
  const y = s.y0 + blk.r * s.unit;
  const w = blk.w * s.unit;
  const h = blk.h * s.unit;
  b.save();
  b.fillStyle = s.ground;
  b.fillRect(x, y, w, h);
  if (blk.kind === 'flat') {
    b.fillStyle = blk.tint;
    b.fillRect(x, y, w, h);
  } else if (blk.kind === 'black') {
    b.fillStyle = s.ink;
    b.fillRect(x, y, w, h);
  } else if (blk.kind === 'upright' || blk.kind === 'level') {
    b.beginPath();
    b.rect(x, y, w, h);
    b.clip();
    const step = s.stripe * blk.step;
    b.strokeStyle = s.line;
    b.lineWidth = s.rule;
    b.beginPath();
    if (blk.kind === 'upright') {
      for (let gx = x + step; gx < x + w - s.rule; gx += step) {
        b.moveTo(Math.round(gx) + 0.5, y);
        b.lineTo(Math.round(gx) + 0.5, y + h);
      }
    } else {
      for (let gy = y + step; gy < y + h - s.rule; gy += step) {
        b.moveTo(x, Math.round(gy) + 0.5);
        b.lineTo(x + w, Math.round(gy) + 0.5);
      }
    }
    b.stroke();
  }
  b.restore();
  // The edge of every block in the heavy line, so the cuts read as drawn.
  b.strokeStyle = s.line;
  b.lineWidth = s.edge;
  b.strokeRect(x, y, w, h);
}

function strikeBlock(b, blk, s) {
  if (s.figure === 1) {
    strikeStriped(b, blk, s);
    return;
  }
  const x = s.x0 + blk.c * s.unit;
  const y = s.y0 + blk.r * s.unit;
  const w = blk.w * s.unit;
  const h = blk.h * s.unit;
  b.save();
  b.fillStyle = blk.tint;
  b.fillRect(x, y, w, h);
  b.beginPath();
  b.rect(x, y, w, h);
  b.clip();
  const step = s.cell * blk.step;
  b.strokeStyle = s.ink;
  b.lineWidth = s.hair;
  b.beginPath();
  for (let gx = x; gx <= x + w + 0.5; gx += step) {
    b.moveTo(Math.round(gx) + 0.5, y);
    b.lineTo(Math.round(gx) + 0.5, y + h);
  }
  for (let gy = y; gy <= y + h + 0.5; gy += step) {
    b.moveTo(x, Math.round(gy) + 0.5);
    b.lineTo(x + w, Math.round(gy) + 0.5);
  }
  if (blk.cross) {
    for (let gx = x; gx < x + w - 0.5; gx += step) {
      for (let gy = y; gy < y + h - 0.5; gy += step) {
        b.moveTo(gx, gy);
        b.lineTo(gx + step, gy + step);
        b.moveTo(gx + step, gy);
        b.lineTo(gx, gy + step);
      }
    }
  }
  b.stroke();
  b.restore();
  // The block's own edge, a little heavier, so the cut reads as a cut.
  b.strokeStyle = s.ink;
  b.lineWidth = s.hair * 1.6;
  b.strokeRect(x, y, w, h);
}

// --- lineage ------------------------------------------------------------------------------

/** The free crossing nearest to (i, j), searching outwards ring by ring. */
function freeNear(s, i, j) {
  const taken = (a, b) => s.nodes.some((n) => n.i === a && n.j === b);
  if (!taken(i, j)) return [i, j];
  for (let ring = 1; ring <= 3; ring++) {
    const options = [];
    for (let di = -ring; di <= ring; di++) {
      for (let dj = -ring; dj <= ring; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const a = i + di;
        const b = j + dj;
        if (a < -1 || a > s.n + 1 || b < -1 || b > s.n + 1) continue;
        if (!taken(a, b)) options.push([a, b]);
      }
    }
    if (options.length) return options[(Math.random() * options.length) | 0];
  }
  return null;
}

export const STITCHED_SCENES = {
  // --- lanes -----------------------------------------------------------------------------
  lanes: {
    label: 'Dropped stitches',
    note: 'White bars ruled across a black field, one above another like the rows of a knitting chart, and every so often a bar steps down half its height for the space of one stitch and carries on, leaving a black notch above and a white tooth below. Every event drops a stitch where it falls; a large one drops a run of them, each a step further along and a row further down, a staircase through the field. As the field fills, the oldest stitches are picked up again and the bars run straight. The second sheet is bunting: the rows bent into a slow wave and cut into runs of small triangles in five colours, coarse in one run and fine as teeth in the next, with gaps between; an event re-cuts the run it falls on, and a large one a stretch of its row.',
    how: 'A lattice of units: each row a bar one unit high with a gap of one unit under it. A dropped stitch is two units of bar taken out and one unit put back in the gap below, on the second of the two, which is the whole figure of the drawing it is modelled on. Stitches are a list, capped by the renderer\'s budget and by the dial; the field is redrawn every frame as a few hundred rectangles, which costs less than remembering what changed. A new stitch shows for a moment in the colour of its event before it settles into the bar.',
    positional: true,
    preview: { frames: 120, dt: 50 },
    params: {
      figure: { label: 'Which sheet: stitches, bunting', min: 0, max: 1, step: 1, default: 0, rebuild: true },
      rows: { label: 'How many rows', min: 12, max: 60, step: 1, default: 36, rebuild: true },
      keep: { label: 'How many stitches before the oldest are picked up', min: 10, max: 200, step: 1, default: 60 },
      run: { label: 'How long a staircase a large event drops', min: 1, max: 8, step: 1, default: 3 },
      colour: { label: 'How long a new stitch keeps its colour', min: 0, max: 1, step: 0.02, default: 0.3 },
    },
    init(api) {
      const s = api.scene;
      s.figure = Math.max(0, Math.min(1, Math.round(api.param('figure') || 0)));
      if (s.figure === 1) {
        hangBunting(s, api);
        return;
      }
      const m = Math.min(api.w, api.h);
      const rows = Math.max(8, Math.min(80, Math.round(api.param('rows'))));
      const margin = m * 0.02;
      // A row is a bar and a gap, two units; the columns are the same unit.
      s.unit = Math.max(2, (api.h - margin * 2) / (rows * 2));
      s.rows = rows;
      s.cols = Math.max(8, Math.floor((api.w - margin * 2) / s.unit));
      s.x0 = (api.w - s.cols * s.unit) / 2;
      s.y0 = (api.h - rows * 2 * s.unit) / 2;
      s.stitches = [];
      s.lastAt = 0;
      s.ambient = 0;
      s.gone = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (s.figure === 1) {
        if (!s.bands) return;
        rebunt(s, api, p.x, p.y, sizeOf(p, api), Math.random() < api.param('colour') ? p.color : null);
        s.lastAt = api.now;
        return;
      }
      if (!s.stitches) return;
      const q = sizeOf(p, api);
      const col = clampTo(Math.floor((p.x - s.x0) / s.unit), 0, s.cols - 2);
      const row = clampTo(Math.floor((p.y - s.y0) / (s.unit * 2)), 0, s.rows - 1);
      const n = q > 0.6 ? Math.max(1, Math.round(api.param('run') * (0.5 + q))) : 1;
      for (let k = 0; k < n && row + k < s.rows; k++) {
        drop(s, api, row + k, Math.min(s.cols - 2, col + k), p.color);
      }
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (s.figure === 1) {
        if (!s.bands) return;
        if (api.now - s.lastAt > 2500) {
          s.ambient += api.dt;
          if (s.ambient > 2600) {
            s.ambient = 0;
            rebunt(s, api, Math.random() * api.w, Math.random() * api.h, 0.1, null);
          }
        } else {
          s.ambient = 0;
        }
        drawBunting(ctx, s, api);
        return;
      }
      if (!s.stitches) return;
      const ink = inkOf(api);
      // A stitch now and then in silence, after a pause; never while the
      // feed is working.
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 2400) {
          s.ambient = 0;
          drop(s, api, (Math.random() * s.rows) | 0, (Math.random() * (s.cols - 1)) | 0, null);
        }
      } else {
        s.ambient = 0;
      }
      const keep = Math.max(4, Math.min(Math.round(api.param('keep')), Math.floor((api.budget || 800) * 0.6)));
      while (s.stitches.length > keep) s.stitches.shift();

      const u = s.unit;
      ctx.fillStyle = ink;
      ctx.fillRect(s.x0 - u, s.y0 - u, s.cols * u + u * 2, s.rows * 2 * u + u);
      const ground = api.palette.background;
      // Each row's notches, left to right, so the bar is drawn as runs.
      const byRow = new Map();
      for (const st of s.stitches) {
        if (!byRow.has(st.row)) byRow.set(st.row, []);
        byRow.get(st.row).push(st);
      }
      const hold = 300 + 2400 * api.param('colour');
      for (let r = 0; r < s.rows; r++) {
        const y = Math.round(s.y0 + r * 2 * u);
        const yh = Math.round(s.y0 + (r * 2 + 1) * u) - y;
        const notches = (byRow.get(r) || []).slice().sort((a, b) => a.col - b.col);
        let at = 0;
        ctx.fillStyle = ground;
        for (const st of notches) {
          if (st.col > at) ctx.fillRect(Math.round(s.x0 + at * u), y, Math.round(s.x0 + st.col * u) - Math.round(s.x0 + at * u), yh);
          at = Math.max(at, st.col + 2);
        }
        if (at < s.cols) ctx.fillRect(Math.round(s.x0 + at * u), y, Math.round(s.x0 + s.cols * u) - Math.round(s.x0 + at * u), yh);
        for (const st of notches) {
          const age = api.now - st.born;
          ctx.fillStyle = st.color && age < hold ? st.color : ground;
          const x = Math.round(s.x0 + (st.col + 1) * u);
          ctx.fillRect(x, y + yh, Math.round(s.x0 + (st.col + 2) * u) - x, yh);
        }
      }
    },
  },

  // --- meshes ----------------------------------------------------------------------------
  meshes: {
    label: 'Cut meshes',
    note: 'A square cut into blocks and the blocks cut again, every one ruled with a mesh of its own: a coarse grid, a fine grid, a grid crossed with diagonals into stars, laid over tints of stone, sand, chalk and dark umber, with a square of orange somewhere to keep the eye moving. Every event cuts the block it falls in and gives the pieces new meshes; a block already as small as the sheet allows is re-ruled instead, and a large event lays out a whole quarter afresh. The second sheet keeps the cuts and drops the meshes: every block drawn round in a heavy line and left bare, laid in a flat colour or in black, or ruled with upright or level lines, fine or wide, all in one family of inks -- or in nothing but the line, when the colour is turned down.',
    how: 'A lattice of units over a square, and a list of blocks, each a rectangle of whole units with a tint, a mesh pitch and a flag for the diagonals. The first sheet is cut recursively a few levels deep. An event finds its block and splits it in two or four at a point between a third and two thirds of the way, or re-dresses it if it is a single unit; a large event takes every block in its quarter away and cuts the quarter again. The blocks are struck onto a buffer only when they change, a few a frame, so the sheet costs what was just cut.',
    positional: true,
    preview: { frames: 140, dt: 50 },
    params: {
      figure: { label: 'Which sheet: meshes, stripes', min: 0, max: 1, step: 1, default: 0, rebuild: true },
      lattice: { label: 'How fine the lattice of blocks', min: 6, max: 20, step: 1, default: 12, rebuild: true },
      fill: { label: 'How much flat colour, on the stripes', min: 0, max: 1, step: 0.02, default: 0.55, rebuild: true },
      black: { label: 'How much black, on the stripes', min: 0, max: 1, step: 0.02, default: 0.25, rebuild: true },
      tone: { label: 'Lines in ink or in the colour, on the stripes', min: 0, max: 1, step: 1, default: 0, rebuild: true },
      mesh: { label: 'How fine the mesh', min: 0.5, max: 2, step: 0.05, default: 1, rebuild: true },
      accent: { label: 'How much of the accent colour', min: 0, max: 1, step: 0.02, default: 0.3 },
      colour: { label: 'How much colour from the event', min: 0, max: 1, step: 0.02, default: 0 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.figure = Math.max(0, Math.min(1, Math.round(api.param('figure') || 0)));
      // The striped sheet is cut more freely: twice as many places to cut.
      const n = Math.max(4, Math.min(48, Math.round(api.param('lattice')) * (s.figure === 1 ? 2 : 1)));
      const side = m * (s.figure === 1 ? 0.78 : 0.86);
      s.n = n;
      s.unit = side / n;
      s.x0 = (api.w - side) / 2;
      s.y0 = (api.h - side) / 2;
      // Each lattice unit carries a whole number of mesh cells, so a grid
      // never ends in a sliver at a block's edge.
      const per = Math.max(1, Math.round((s.unit / (m * 0.018)) * api.param('mesh')));
      s.cell = s.unit / per;
      s.hair = Math.max(0.6, m * 0.0011);
      const paper = papers(api);
      const bg = api.palette.background;
      s.ink = inkOf(api);
      s.dark = mixColors(s.ink, bg, 0.35);
      // The sheet's tints: the ground itself, one lighter, one darker, a
      // cool stone between ground and ink, and the accent sometimes.
      s.tints = [bg, bg, lighten(bg, paper.pale ? 0.05 : 0.08), lighten(bg, -0.06), mixColors(bg, '#9a9c9e', 0.35)];
      const warm = paper.sheets.find((c) => c) || s.ink;
      s.accent = warm;
      if (s.figure === 1) {
        // One family of inks: the line, the black, two or three colours
        // close to each other, and the ground left bare.
        s.fill = api.param('fill');
        s.black = api.param('black');
        s.ground = api.palette.background;
        // One hue, the palette's alert, in two or three strengths: the
        // sheets this follows are red and black, or orange and amber, never
        // a sampler of the whole palette.
        const hue = api.palette.alert || paper.sheets[0] || s.ink;
        s.flats = [hue, lighten(hue, -0.1), lighten(hue, 0.09)];
        s.line = Math.round(api.param('tone')) === 1 ? hue : s.ink;
        s.edge = Math.max(1.2, m * 0.0045);
        s.rule = Math.max(0.8, m * 0.0028);
        s.stripe = Math.max(2.5, (m * 0.011) / api.param('mesh'));
      }
      s.blocks = layout(s, { c: 0, r: 0, w: n, h: n }, s.figure === 1 ? 3 : 3);
      s.cleared = false;
      s.lastAt = 0;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.blocks) return;
      const q = sizeOf(p, api);
      const c = clampTo(Math.floor((p.x - s.x0) / s.unit), 0, s.n - 1);
      const r = clampTo(Math.floor((p.y - s.y0) / s.unit), 0, s.n - 1);
      // The accent is a punctuation mark: rare, and only on a small block.
      const color = Math.random() < api.param('colour') ? p.color
        : s.figure !== 1 && Math.random() < api.param('accent') * 0.12 ? s.accent : null;
      recut(s, api, c, r, q, color);
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.blocks) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 2600) {
          s.ambient = 0;
          // Only a small block: a quiet sheet may twitch, not repaint itself.
          const small = s.blocks.filter((k) => k.w * k.h <= 4);
          if (small.length) dressBlock(small[(Math.random() * small.length) | 0], s, null);
        }
      } else {
        s.ambient = 0;
      }
      let budget = 4;
      for (const blk of s.blocks) {
        if (blk.done) continue;
        strikeBlock(b, blk, s);
        blk.done = true;
        if (--budget <= 0) break;
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- lineage ---------------------------------------------------------------------------
  lineage: {
    label: 'Numbered lineage',
    note: 'A pale square grid, and coloured discs set on its crossings, each joined by a black line to the one it came from, so that the picture is a family tree drawn on squared paper. Beside every disc, small, the number it arrived with. Every event is a new disc: it takes the free crossing nearest where it fell and is joined to the nearest disc already there, in the colour of its kind and the size of its weight. When the tree is full it fades and the next event starts another.',
    how: 'A grid of crossings, one ring of them outside the drawn square, and a list of nodes, each holding its crossing, its parent, its number and its colour. A newcomer looks for a free crossing ring by ring outwards from where it fell, and its parent is the nearest live node by straight-line distance. Discs grow in over a third of a second; the lines are drawn over the discs, as on the sheet this follows. The tree is held to a dial and to the renderer\'s budget, and is let go all at once, in under a second, rather than leaf by leaf, because a family tree with its elders missing is no longer one.',
    positional: true,
    preview: { frames: 120, dt: 50 },
    params: {
      grid: { label: 'How many squares across', min: 4, max: 12, step: 1, default: 7, rebuild: true },
      keep: { label: 'How many discs before the tree starts again', min: 6, max: 40, step: 1, default: 18 },
      size: { label: 'How large the discs', min: 0.5, max: 1.4, step: 0.05, default: 1 },
      numbers: { label: 'How plainly the numbers show', min: 0, max: 1, step: 0.02, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      const n = Math.max(3, Math.min(14, Math.round(api.param('grid'))));
      s.n = n;
      s.side = m * 0.56;
      s.cell = s.side / n;
      s.x0 = (api.w - s.side) / 2;
      s.y0 = (api.h - s.side) / 2;
      s.nodes = [];
      s.count = 0;
      s.lastAt = 0;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.nodes) return;
      // The flat colour of its kind, not the event's own shade: the sheet
      // this follows has five colours and no more.
      grow(s, api, p.x, p.y, sizeOf(p, api), p.base || p.color);
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.nodes) return;
      const m = Math.min(api.w, api.h);
      const ink = inkOf(api);
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 3000) {
          s.ambient = 0;
          grow(s, api, Math.random() * api.w, Math.random() * api.h, 0.3, null);
        }
      } else {
        s.ambient = 0;
      }
      for (let i = s.nodes.length - 1; i >= 0; i--) {
        if (s.nodes[i].goneAt && api.now - s.nodes[i].goneAt > 900) s.nodes.splice(i, 1);
      }
      // The grid, pale.
      ctx.save();
      ctx.strokeStyle = mixColors(api.palette.background, ink, 0.16);
      ctx.lineWidth = Math.max(1, m * 0.003);
      ctx.beginPath();
      for (let k = 0; k <= s.n; k++) {
        const t = k * s.cell;
        ctx.moveTo(s.x0 + t, s.y0);
        ctx.lineTo(s.x0 + t, s.y0 + s.side);
        ctx.moveTo(s.x0, s.y0 + t);
        ctx.lineTo(s.x0 + s.side, s.y0 + t);
      }
      ctx.stroke();
      const at = (nd) => [s.x0 + nd.i * s.cell, s.y0 + nd.j * s.cell];
      const fade = (nd) => (nd.goneAt ? Math.max(0, 1 - (api.now - nd.goneAt) / 900) : 1);
      const grown = (nd) => Math.min(1, (api.now - nd.born) / 330);
      // Discs, then the lines over them, then the numbers.
      for (const nd of s.nodes) {
        const [x, y] = at(nd);
        const r = s.cell * nd.r * (0.6 + 0.4 * grown(nd));
        ctx.globalAlpha = fade(nd);
        ctx.fillStyle = nd.color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, m * 0.0035);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const nd of s.nodes) {
        if (!nd.parent) continue;
        const [x, y] = at(nd);
        const [px, py] = at(nd.parent);
        const g = grown(nd);
        ctx.globalAlpha = fade(nd);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (x - px) * g, py + (y - py) * g);
        ctx.stroke();
      }
      const shown = api.param('numbers');
      if (shown > 0) {
        ctx.fillStyle = ink;
        ctx.font = `${Math.max(7, Math.round(s.cell * 0.2))}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const nd of s.nodes) {
          const [x, y] = at(nd);
          ctx.globalAlpha = fade(nd) * shown;
          ctx.fillText(String(nd.number), x + s.cell * 0.75, y + s.cell * 0.72);
        }
      }
      ctx.restore();
    },
  },
};

// --- bunting ------------------------------------------------------------------------------

/** A run of the bunting: where it starts and ends, how fine it is cut, and its colours. */
function runOf(x0, x1, h, color) {
  const fine = Math.random() < 0.25;
  return {
    x0, x1,
    pitch: fine ? h * (0.3 + Math.random() * 0.15) : h * (0.9 + Math.random() * 1.6),
    fine,
    lean: (Math.random() < 0.5 ? -1 : 1) * h * (0.2 + Math.random() * 0.5),
    seed: Math.floor(Math.random() * 1e9),
    color,
  };
}

/** Cut a stretch of a row into runs with gaps between them. */
function layRuns(x0, x1, h, W) {
  const runs = [];
  let x = x0;
  while (x < x1) {
    const len = W * (0.12 + Math.random() * 0.36);
    const end = Math.min(x1, x + len);
    runs.push(runOf(x, end, h, null));
    x = end + (Math.random() < 0.45 ? W * (0.01 + Math.random() * 0.045) : 0);
  }
  return runs;
}

function hangBunting(s, api) {
  const W = api.w;
  const H = api.h;
  const n = Math.max(6, Math.round(api.param('rows') / 2.4));
  const margin = Math.min(W, H) * 0.07;
  s.left = margin;
  s.right = W - margin;
  s.top = margin;
  s.foot = H - margin;
  const pitch = (s.foot - s.top) / n;
  s.bandH = pitch * 0.55;
  s.phase = Math.random() * TAU;
  s.sway = pitch * (0.6 + Math.random() * 0.8);
  s.bands = [];
  for (let i = 0; i < n; i++) {
    s.bands.push({ y: s.top + (i + 0.5) * pitch, runs: layRuns(s.left - W * 0.05, s.right, s.bandH, W) });
  }
  const paper = papers(api);
  s.inks = paper.sheets.length >= 3 ? paper.sheets : [...paper.sheets, inkOf(api)];
  s.lastAt = 0;
  s.ambient = 0;
}

/** The middle of a band at x: a slow wave the rows share, each a little behind the one above. */
function bandY(s, band, i, x, W) {
  const u = x / W;
  return band.y + Math.sin(u * Math.PI * 1.3 + s.phase + i * 0.22) * s.sway * 0.5 - u * s.sway * 0.4;
}

/** Re-cut the bunting where an event falls: one run, or a stretch of the row. */
function rebunt(s, api, x, y, q, color) {
  let best = 0;
  let bd = Infinity;
  s.bands.forEach((b, i) => {
    const d = Math.abs(bandY(s, b, i, x, api.w) - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  const band = s.bands[best];
  if (q < 0.5) {
    const run = band.runs.find((r) => x >= r.x0 && x <= r.x1);
    if (run) {
      const fresh = runOf(run.x0, run.x1, s.bandH, color);
      band.runs.splice(band.runs.indexOf(run), 1, fresh);
      return;
    }
    // In a gap: a short run fills part of it.
    band.runs.push(runOf(x - api.w * 0.03, x + api.w * 0.03, s.bandH, color));
  } else {
    const span = api.w * (0.15 + q * 0.3);
    const a = x - span / 2;
    const b = x + span / 2;
    // The runs it cuts across are trimmed to the stretch, not dropped whole:
    // dropping them left holes far wider than the event.
    const kept = [];
    for (const r of band.runs) {
      if (r.x1 < a || r.x0 > b) kept.push(r);
      else {
        if (r.x0 < a) kept.push({ ...r, x1: a });
        if (r.x1 > b) kept.push({ ...r, x0: b });
      }
    }
    band.runs = kept.concat(layRuns(a, b, s.bandH, api.w));
    if (color) band.runs[band.runs.length - 1].color = color;
  }
  band.runs.sort((r1, r2) => r1.x0 - r2.x0);
  // Runs never pile up: past a row's share of the budget the oldest overlaps go.
  // Past the ceiling the shortest go, not the leftmost: the runs are kept in
  // order along the row, and cutting from the front emptied its left end.
  const most = 40;
  while (band.runs.length > most) {
    let k = 0;
    band.runs.forEach((r, i) => { if (r.x1 - r.x0 < band.runs[k].x1 - band.runs[k].x0) k = i; });
    band.runs.splice(k, 1);
  }
}

function drawBunting(ctx, s, api) {
  const W = api.w;
  const h = s.bandH;
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.left, s.top - h, s.right - s.left, s.foot - s.top + h * 2);
  ctx.clip();
  s.bands.forEach((band, i) => {
    for (const run of band.runs) {
      const rnd = (() => {
        let k = run.seed >>> 0 || 1;
        return () => {
          k ^= k << 13; k >>>= 0;
          k ^= k >>> 17;
          k ^= k << 5; k >>>= 0;
          return k / 4294967296;
        };
      })();
      for (let xa = run.x0; xa < run.x1 - 0.5; xa += run.pitch) {
        const xb = Math.min(run.x1, xa + run.pitch);
        const ya = bandY(s, band, i, xa, W);
        const yb = bandY(s, band, i, xb, W);
        // A parallelogram leaning by the run's own amount, cut on its
        // diagonal into two triangles of two colours.
        const tl = [xa, ya - h / 2];
        const tr = [xb, yb - h / 2];
        const br = [xb - run.lean, yb + h / 2];
        const bl = [xa - run.lean, ya + h / 2];
        const c1 = run.color && rnd() < 0.4 ? run.color : s.inks[(rnd() * s.inks.length) | 0];
        let c2 = s.inks[(rnd() * s.inks.length) | 0];
        if (rnd() < 0.2) c2 = c1;
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.moveTo(tl[0], tl[1]);
        ctx.lineTo(tr[0], tr[1]);
        ctx.lineTo(br[0], br[1]);
        ctx.closePath();
        ctx.fill();
        // A fine run is teeth: one triangle a cell and the ground between.
        if (!run.fine) {
          ctx.fillStyle = c2;
          ctx.beginPath();
          ctx.moveTo(tl[0], tl[1]);
          ctx.lineTo(br[0], br[1]);
          ctx.lineTo(bl[0], bl[1]);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  });
  ctx.restore();
}

/** Drop a stitch at one place, unless one is already there or beside it. */
function drop(s, api, row, col, color) {
  for (let i = s.stitches.length - 1; i >= 0; i--) {
    const st = s.stitches[i];
    if (st.row === row && Math.abs(st.col - col) < 3) {
      // A stitch dropped onto one already dropped picks it up instead, so
      // a busy spot flickers rather than smearing into a hole.
      s.stitches.splice(i, 1);
      return;
    }
  }
  s.stitches.push({ row, col, color, born: api.now });
}

/** Cut, re-dress or lay out afresh, by the size of the event. */
function recut(s, api, c, r, q, color) {
  const i = s.blocks.findIndex((b) => c >= b.c && c < b.c + b.w && r >= b.r && r < b.r + b.h);
  if (i < 0) return;
  const blk = s.blocks[i];
  if (q > 0.75) {
    // A quarter laid out again: every block wholly inside it goes.
    const half = Math.ceil(s.n / 2);
    const qc = c < half ? 0 : half;
    const qr = r < half ? 0 : half;
    const qw = qc ? s.n - half : half;
    const qh = qr ? s.n - half : half;
    const inside = (b) => b.c >= qc && b.r >= qr && b.c + b.w <= qc + qw && b.r + b.h <= qr + qh;
    if (s.blocks.every((b) => inside(b) || b.c + b.w <= qc || b.c >= qc + qw || b.r + b.h <= qr || b.r >= qr + qh)) {
      s.blocks = s.blocks.filter((b) => !inside(b)).concat(layout(s, { c: qc, r: qr, w: qw, h: qh }, 2));
      return;
    }
    // The quarter is straddled by a block: that block is laid out afresh
    // instead, which is the same gesture at the size the sheet allows.
    s.blocks.splice(i, 1, ...layout(s, { c: blk.c, r: blk.r, w: blk.w, h: blk.h }, 2));
    return;
  }
  // A small event re-rules its block; a middling one cuts it, while the
  // block is big enough to be worth cutting and the sheet is not yet busy.
  // The striped sheet holds a dozen or two blocks and no more, as the
  // sheets it follows do; cut finer it reads as a sampler.
  const most = s.figure === 1 ? 22 : Math.max(12, Math.min(48, Math.floor((api.budget || 800) * 0.2)));
  const least = s.figure === 1 ? 16 : 4;
  const kids = q > 0.4 && blk.w * blk.h >= least && s.blocks.length < most ? split(s, blk) : [];
  if (!kids.length) {
    dressBlock(blk, s, color);
    return;
  }
  for (const k of kids) dressBlock(k, s, Math.random() < 0.5 ? color : null);
  s.blocks.splice(i, 1, ...kids);
}

/** A new disc in the tree, or a new tree when this one is full. */
function grow(s, api, x, y, q, color) {
  const live = s.nodes.filter((n) => !n.goneAt);
  const keep = Math.max(3, Math.min(Math.round(api.param('keep')), Math.floor((api.budget || 800) / 4)));
  if (live.length >= keep) {
    for (const n of live) n.goneAt = api.now;
  }
  const fi = (x - s.x0) / s.cell;
  const fj = (y - s.y0) / s.cell;
  // The parent is the live disc nearest where the event fell; the child
  // takes a free crossing beside it -- one step, square or diagonal, or now
  // and then a knight's move -- the one nearest the event. A disc with no
  // room beside it passes the child on to the next nearest.
  // Fading discs still hold their crossings, so a new tree grows round
  // the old one as it goes rather than through it.
  const taken = (a, b) => s.nodes.some((n) => n.i === a && n.j === b);
  const parents = s.nodes.filter((n) => !n.goneAt)
    .sort((a, b) => ((a.i - fi) ** 2 + (a.j - fj) ** 2) - ((b.i - fi) ** 2 + (b.j - fj) ** 2));
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  if (Math.random() < 0.25) steps.push([2, 1], [1, 2], [-2, 1], [2, -1]);
  let parent = null;
  let spot = null;
  for (const pa of parents) {
    let best = Infinity;
    for (const [di, dj] of steps) {
      const a = pa.i + di;
      const b = pa.j + dj;
      if (a < -1 || a > s.n + 1 || b < -1 || b > s.n + 1 || taken(a, b)) continue;
      const d = (a - fi) ** 2 + (b - fj) ** 2;
      if (d < best) {
        best = d;
        spot = [a, b];
      }
    }
    if (spot) {
      parent = pa;
      break;
    }
  }
  if (!spot) spot = freeNear(s, clampTo(Math.round(fi), -1, s.n + 1), clampTo(Math.round(fj), -1, s.n + 1));
  if (!spot) return;
  const [i, j] = spot;
  s.count = (s.count % 99) + 1;
  s.nodes.push({
    i, j, parent,
    number: s.count,
    color: color || inkOf(api),
    r: (0.34 + q * 0.22) * api.param('size'),
    born: api.now,
    goneAt: 0,
  });
}
