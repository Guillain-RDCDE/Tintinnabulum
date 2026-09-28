// Three pictures ruled onto a sheet.
//
//   spindles   a sheet divided into cells, each filled with lines that swell
//              and thin along their length, or struck solid, or left bare
//   lattice    a fine screen of small black bars whose size runs in waves
//              along the rows and down the columns, so the wall seems to move
//   desordres  a plotter drawing one square many times, never quite in the
//              same place, on a grid of nine
//
// What they have in common is the ruler. Every other family in the catalogue
// lets an event land where it lands; here the sheet is divided before anything
// arrives, and an event can only take one of the places already laid out for
// it. The pictures are the same three kinds of thing a plotter made in the
// 1970s: a grid of cells, a screen, and a figure repeated with small errors.
// The grid is Vera Molnar's, as the registry says of the whole family.
//
// House rules as everywhere: what accumulates is bounded, the drawing is struck
// once onto a buffer from the renderer's pool and never redrawn, and a scene
// that goes on working when nothing arrives works slowly enough that it can
// never be mistaken for the feed.

import { scratch } from './paint.js';
import { papers } from './papers.js';

const TAU = Math.PI * 2;

/** A small deterministic generator, so a cell belongs to its event for good. */
function seeded(n) {
  let s = (n >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** A number that belongs to this event and to no other. */
function hashOf(p) {
  const id = String(p.label || '') + '@' + (p.x | 0) + ',' + (p.y | 0) + '/' + Math.round((p.pick || 0) * 1e6) + '/' + (p.r | 0);
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

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

const SAMPLES = 48;

/**
 * The profile of a line: how far it swells at each of forty-eight points along
 * its length, 0 to 1.
 *
 * From the sound when there is any -- the waveform at the instant the note
 * sounds, a window of it per line, so the lines in one cell are the same note
 * read at different moments -- and otherwise from a few bumps placed by the
 * event's own number, so the same event always swells in the same places.
 */
function profileOf(rnd, api, line, listen) {
  const out = new Float32Array(SAMPLES);
  const bumps = 1 + Math.floor(rnd() * 4);
  for (let k = 0; k < bumps; k++) {
    const c = 0.06 + rnd() * 0.88;
    const sig = 0.03 + rnd() * 0.1;
    const amp = 0.3 + rnd() * 0.7;
    for (let i = 0; i < SAMPLES; i++) {
      const t = (i + 0.5) / SAMPLES;
      const d = (t - c) / sig;
      out[i] += amp * Math.exp(-d * d);
    }
  }
  const wave = listen > 0 && api.sound && api.sound.wave;
  if (wave && wave.length >= SAMPLES * 4) {
    // A window of the waveform, one per line, rectified and smoothed. The
    // envelope of a struck note is a swell and a decay, which is exactly the
    // shape of the lines in the drawings these are modelled on.
    const stride = Math.max(1, Math.floor(wave.length / 6));
    const start = (line * stride) % Math.max(1, wave.length - SAMPLES * 4);
    let peak = 0;
    const heard = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) sum += Math.abs(wave[start + i * 4 + j] - 128) / 128;
      heard[i] = sum / 4;
      if (heard[i] > peak) peak = heard[i];
    }
    if (peak > 0.02) {
      for (let i = 0; i < SAMPLES; i++) {
        out[i] = out[i] * (1 - listen) + (heard[i] / peak) * listen;
      }
    }
  }
  for (let i = 0; i < SAMPLES; i++) out[i] = Math.min(1, out[i]);
  return out;
}

export const RULED_SCENES = {
  // --- spindles ---------------------------------------------------------------------------
  spindles: {
    label: 'Spindle lines',
    note: 'A sheet divided into cells, and every cell filled with lines drawn from one edge to the other -- lines that swell and thin along their length like thread wound unevenly on a spindle, so that a cell of them reads as a woven thing rather than a ruled one. Some cells are struck solid black, some are drawn so lightly they are only grain, and some are left bare. Behind them, when you want it, the ruled construction the sheet was laid out on, running past the cells into the margin. Every event takes a cell and fills it again: a small one as grain, a middling one as lines, a large one solid.',
    how: 'The sheet is tiled by columns, each cell spanning one to three rows and now and then left out, and the rules are the edges of that tiling drawn end to end. A line is forty-eight short strokes at a width read off a profile; the profile is a few bumps placed by the event\'s own number, or, when the piece is sounding, the waveform of the note at the instant it was struck, a different window of it for each line. Grain is the same line drawn dashed and pale. A cell is re-struck only when it changes, one a frame, so the picture costs what has just been redrawn and not what is on it.',
    positional: true,
    preview: { frames: 200, dt: 50 },
    params: {
      columns: { label: 'How many columns', min: 3, max: 10, step: 1, default: 7, rebuild: true },
      hatch: { label: 'How close the lines', min: 0.5, max: 2, step: 0.05, default: 1 },
      rules: { label: 'How much of the ruled grid shows', min: 0, max: 1, step: 0.02, default: 0.5 },
      colour: { label: 'How much colour against the black', min: 0, max: 1, step: 0.02, default: 0.12 },
      listen: { label: 'How much the sound shapes the line', min: 0, max: 1, step: 0.02, default: 0.7 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      const cols = Math.max(2, Math.min(12, Math.round(api.param('columns'))));
      const margin = m * 0.1;
      const spanW = Math.max(1, api.w - margin * 2);
      const spanH = Math.max(1, api.h - margin * 2);
      const rows = Math.max(3, Math.min(14, Math.round((cols * spanH) / spanW * 1.15)));
      const gutter = Math.min(spanW / cols, spanH / rows) * 0.12;
      const cw = (spanW - gutter * (cols - 1)) / cols;
      const ch = (spanH - gutter * (rows - 1)) / rows;
      s.xs = [];
      s.ys = [];
      for (let c = 0; c < cols; c++) {
        const x = margin + c * (cw + gutter);
        s.xs.push(x, x + cw);
      }
      for (let r = 0; r < rows; r++) {
        const y = margin + r * (ch + gutter);
        s.ys.push(y, y + ch);
      }
      s.cells = [];
      // Tiled by columns, so a tall cell is a cell that spans rows, which is
      // what the drawings do; a column left out now and then is what keeps
      // the sheet from reading as a chequerboard.
      for (let c = 0; c < cols; c++) {
        let r = 0;
        while (r < rows) {
          const pick = Math.random();
          const span = Math.min(rows - r, pick < 0.7 ? 1 : pick < 0.92 ? 2 : 3);
          if (Math.random() < 0.14) {
            r += span;
            continue;
          }
          const x = margin + c * (cw + gutter);
          const y = margin + r * (ch + gutter);
          s.cells.push({
            x, y, w: cw, h: ch * span + gutter * (span - 1),
            kind: 'blank', vertical: true, color: null, profiles: null, done: true, wobble: 0,
          });
          r += span;
        }
      }
      s.top = margin * 0.35;
      s.foot = api.h - margin * 0.35;
      s.left = margin * 0.35;
      s.right = api.w - margin * 0.35;
      // A first sheet, dressed by hand so the picture is not bare before the
      // first event.
      const ink = inkOf(api);
      const hand = seeded(Math.floor(Math.random() * 1e9));
      for (const cell of s.cells) {
        const pick = hand();
        cell.kind = pick < 0.1 ? 'blank' : pick < 0.32 ? 'grain' : pick < 0.86 ? 'lines' : 'solid';
        cell.vertical = hand() < 0.55;
        cell.color = ink;
        cell.profiles = [];
        cell.seed = Math.floor(hand() * 1e9);
        cell.done = false;
      }
      s.cleared = false;
      s.lastAt = 0;
      s.ambient = 0;
      s.queue = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cells || !s.cells.length) return;
      // The cell it landed in, or the nearest when it landed in a gutter or a
      // gap: every event must take a place on the sheet.
      let cell = null;
      let best = Infinity;
      for (const c of s.cells) {
        const dx = p.x < c.x ? c.x - p.x : p.x > c.x + c.w ? p.x - c.x - c.w : 0;
        const dy = p.y < c.y ? c.y - p.y : p.y > c.y + c.h ? p.y - c.y - c.h : 0;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          cell = c;
        }
      }
      if (!cell) return;
      const q = sizeOf(p, api);
      cell.kind = q < 0.22 ? 'grain' : q < 0.66 ? 'lines' : 'solid';
      cell.vertical = (p.pick === undefined ? Math.random() : p.pick) < 0.55;
      cell.color = Math.random() < api.param('colour') ? p.color : inkOf(api);
      cell.seed = hashOf(p);
      cell.profiles = null;
      cell.heard = api.sound && api.sound.wave ? api.param('listen') : 0;
      cell.done = false;
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.cells) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
        rules(b, s, api);
      }
      // A hand goes on filling cells when nothing arrives, and only then: at
      // any real rate the feed has the sheet to itself.
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 1600) {
          s.ambient = 0;
          const cell = s.cells[(Math.random() * s.cells.length) | 0];
          const pick = Math.random();
          cell.kind = pick < 0.12 ? 'blank' : pick < 0.36 ? 'grain' : pick < 0.86 ? 'lines' : 'solid';
          cell.vertical = Math.random() < 0.55;
          cell.color = inkOf(api);
          cell.seed = Math.floor(Math.random() * 1e9);
          cell.profiles = null;
          cell.heard = 0;
          cell.done = false;
        }
      } else {
        s.ambient = 0;
      }
      // One cell a frame: a cell is a thousand strokes and a burst is a dozen
      // cells, and a dozen thousand strokes in one frame is a spike with no
      // reason to exist. A burst still shows within a few frames.
      for (const cell of s.cells) {
        if (cell.done) continue;
        strike(b, cell, s, api);
        cell.done = true;
        break;
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- lattice ----------------------------------------------------------------------------
  lattice: {
    label: 'Bar lattice',
    note: 'A fine screen of small black bars, thousands of them, set in rows and columns on a pale ground. No bar is anything on its own; what the eye reads is how their size runs in waves along the rows and down the columns, so that one part of the wall is nearly black and another nearly white and the passage between them seems to move as you look. The sheet may be cut into panels that each run their own wave. Every event widens the bars in its column and its row, a cross through the screen that fades over a few seconds, and a busy minute is a wall that shudders.',
    how: 'A column profile and a row profile, each a slow sine over its own axis plus whatever the events have added, and a bar in each cell whose width is the column\'s value and whose height is the row\'s. Multiplying two one-dimensional profiles is what gives the two-dimensional weave for the cost of a few hundred numbers a frame. An event adds a bell to the two profiles near where it fell, and both decay on their own clock. The profiles breathe very slowly on their own, over a minute, which is far below anything the feed does. Redrawn every frame: a few thousand rectangles are cheaper than remembering which ones changed.',
    positional: true,
    preview: { frames: 120, dt: 50 },
    params: {
      pitch: { label: 'How fine the screen', min: 0.5, max: 2, step: 0.05, default: 1, rebuild: true },
      panels: { label: 'How many panels', min: 1, max: 4, step: 1, default: 2, rebuild: true },
      contrast: { label: 'How hard the waves', min: 0.3, max: 2, step: 0.05, default: 1 },
      breath: { label: 'How much it moves on its own', min: 0, max: 2, step: 0.05, default: 1 },
      colour: { label: 'How much colour in the bars', min: 0, max: 1, step: 0.02, default: 0.04 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      const margin = m * 0.06;
      const pitch = api.param('pitch');
      const cell = Math.max(3, (m * 0.022) / pitch);
      const cols = Math.max(8, Math.min(120, Math.floor((api.w - margin * 2) / cell)));
      const rows = Math.max(8, Math.min(120, Math.floor((api.h - margin * 2) / cell)));
      s.cols = cols;
      s.rows = rows;
      s.cw = (api.w - margin * 2) / cols;
      s.ch = (api.h - margin * 2) / rows;
      s.x0 = margin;
      s.y0 = margin;
      // Panels: the columns cut into a few ranges, each with a wave of its
      // own, so the wall can be two different screens butted together.
      const n = Math.max(1, Math.min(4, Math.round(api.param('panels'))));
      s.panels = [];
      let at = 0;
      for (let i = 0; i < n; i++) {
        const left = i === n - 1 ? cols - at : Math.max(4, Math.round((cols - at) / (n - i) * (0.7 + Math.random() * 0.6)));
        const to = Math.min(cols, at + left);
        s.panels.push({
          from: at, to,
          // Which axis the wave runs on: both, only across, or only down.
          mode: Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2,
          fx: 0.5 + Math.random() * 2.5,
          fy: 0.5 + Math.random() * 2.5,
          px: Math.random() * TAU,
          py: Math.random() * TAU,
          slope: (Math.random() - 0.5) * 1.4,
        });
        at = to;
        if (at >= cols) break;
      }
      s.colHeat = new Float32Array(cols);
      s.rowHeat = new Float32Array(rows);
      s.colInk = new Array(cols).fill(null);
      s.colInkUntil = new Float32Array(cols);
      s.t = Math.random() * 1000;
      s.lastAt = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cols) return;
      const q = sizeOf(p, api);
      const c0 = (p.x - s.x0) / s.cw;
      const r0 = (p.y - s.y0) / s.ch;
      // A bell over a few cells either side: wide enough to read as a cross
      // through the screen, narrow enough that two events are two crosses.
      const reachC = 1.5 + q * 5;
      const reachR = 1.5 + q * 5;
      // Modest, and capped: a burst must read as a few crosses on a screen
      // that is still mostly white, not as the whole wall going black.
      const gain = 0.25 + q * 0.5;
      for (let c = 0; c < s.cols; c++) {
        const d = (c + 0.5 - c0) / reachC;
        s.colHeat[c] = Math.min(1, s.colHeat[c] + gain * Math.exp(-d * d));
      }
      for (let r = 0; r < s.rows; r++) {
        const d = (r + 0.5 - r0) / reachR;
        s.rowHeat[r] = Math.min(1, s.rowHeat[r] + gain * Math.exp(-d * d));
      }
      if (Math.random() < api.param('colour')) {
        const c = Math.max(0, Math.min(s.cols - 1, Math.floor(c0)));
        s.colInk[c] = p.color;
        s.colInkUntil[c] = api.now + 4000;
      }
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.cols) return;
      const ink = inkOf(api);
      const contrast = api.param('contrast');
      // Slowly on its own: a whole cycle takes about a minute, which no feed
      // could be mistaken for.
      s.t += api.dt * 0.0001 * api.param('breath');
      const decay = Math.exp(-api.dt / 2600);
      for (let c = 0; c < s.cols; c++) s.colHeat[c] *= decay;
      for (let r = 0; r < s.rows; r++) s.rowHeat[r] *= decay;

      const colW = new Float32Array(s.cols);
      const rowH = new Float32Array(s.rows);
      for (const panel of s.panels) {
        const width = panel.to - panel.from;
        for (let c = panel.from; c < panel.to; c++) {
          const u = (c - panel.from + 0.5) / width;
          let w = 0.5;
          if (panel.mode !== 2) {
            w = 0.5 + 0.5 * Math.sin(u * panel.fx * TAU + panel.px + s.t) + panel.slope * (u - 0.5);
          }
          colW[c] = Math.max(0, Math.min(1, 0.5 + (w - 0.5) * contrast + s.colHeat[c] * 0.5));
        }
        // Rows are shared across panels, but each panel reads them through
        // its own wave; the last panel's reading stands for the row, and the
        // difference between panels is carried by the columns. Enough for
        // the eye and a third of the arithmetic.
        for (let r = 0; r < s.rows; r++) {
          const v = (r + 0.5) / s.rows;
          let h = 0.5;
          if (panel.mode !== 1) {
            h = 0.5 + 0.5 * Math.sin(v * panel.fy * TAU + panel.py - s.t * 0.7);
          }
          rowH[r] = Math.max(0, Math.min(1, 0.5 + (h - 0.5) * contrast + s.rowHeat[r] * 0.5));
        }
      }

      ctx.fillStyle = ink;
      // Whole pixels, so a wall that is breathing does not shimmer at every
      // edge: a bar moves when it has a pixel to move by, and not before.
      const cw = s.cw;
      const ch = s.ch;
      for (let c = 0; c < s.cols; c++) {
        // A bar is at most three quarters of its cell and at least a
        // hairline, so the screen stays mostly white: the picture is in the
        // gradient of the bars, not in the bars.
        const bw = Math.max(1, Math.round(cw * (0.06 + 0.7 * colW[c])));
        const x = Math.round(s.x0 + c * cw + (cw - bw) / 2);
        const tinted = s.colInk[c] && s.colInkUntil[c] > api.now;
        if (tinted) ctx.fillStyle = s.colInk[c];
        for (let r = 0; r < s.rows; r++) {
          const bh = Math.max(1, Math.round(ch * (0.06 + 0.7 * rowH[r])));
          const y = Math.round(s.y0 + r * ch + (ch - bh) / 2);
          ctx.fillRect(x, y, bw, bh);
        }
        if (tinted) ctx.fillStyle = ink;
      }
    },
  },

  // --- desordres --------------------------------------------------------------------------
  desordres: {
    label: 'Squares, disordered',
    note: 'A plotter drawing the same square over and over on a grid of nine, and never quite in the same place: each pass is turned a few degrees and moved a hair, so a square drawn ten times is a nest of squares and one drawn fifty times is a scribble with a square in it. Every event picks a cell and draws it again, a small event neatly and a large one wildly, so the sheet is a record of how disorderly the day was, cell by cell. Or the same hand at a different task: a scatter of small letters thickening towards the middle of the page, or a mesh of short crossed strokes filling a square until it is a fabric.',
    how: 'One figure, redrawn with two errors: a rotation and an offset, both drawn at random from a range the event\'s size sets and the dial scales. That is the whole of it, and it is Molnar\'s (Dés)Ordres of 1974, done by a machine because a hand cannot be that nearly right that many times. A cell that has been drawn too often is wiped and begun again, so the sheet accumulates without ever going black. The letters and the mesh are the same machine with a different figure: a serifed I, or two short strokes crossed, placed where the event fell. Strokes are queued and struck a few dozen a frame onto a buffer.',
    positional: true,
    preview: { frames: 200, dt: 50 },
    params: {
      figure: { label: 'Which figure: squares, letters, mesh', min: 0, max: 2, step: 1, default: 0, rebuild: true },
      grid: { label: 'How many squares across', min: 1, max: 6, step: 1, default: 3, rebuild: true },
      passes: { label: 'How many times an event draws it', min: 1, max: 12, step: 1, default: 5 },
      disorder: { label: 'How far out of true', min: 0.2, max: 3, step: 0.05, default: 1 },
      colour: { label: 'How much colour against the black', min: 0, max: 1, step: 0.02, default: 0.3 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.figure = Math.max(0, Math.min(2, Math.round(api.param('figure'))));
      const n = Math.max(1, Math.min(6, Math.round(api.param('grid'))));
      const side = m * 0.76;
      s.side = side;
      s.left = (api.w - side) / 2;
      s.top = (api.h - side) / 2;
      s.n = n;
      s.cell = side / n;
      s.cells = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          s.cells.push({
            cx: s.left + (c + 0.5) * s.cell,
            cy: s.top + (r + 0.5) * s.cell,
            passes: 0,
          });
        }
      }
      s.queue = [];
      s.marks = 0;
      s.cleared = false;
      s.lastAt = 0;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cells) return;
      const q = sizeOf(p, api);
      const color = Math.random() < api.param('colour') ? p.color : inkOf(api);
      order(s, api, p.x, p.y, q, color, api.param('passes'));
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.cells) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      // The neat hand, when nothing arrives: one careful pass every second
      // or so, and nothing at all while the feed is working.
      if (api.now - s.lastAt > 2000) {
        s.ambient += api.dt;
        if (s.ambient > 1100) {
          s.ambient = 0;
          const x = s.left + Math.random() * s.side;
          const y = s.top + Math.random() * s.side;
          order(s, api, x, y, 0.05, inkOf(api), 1);
        }
      } else {
        s.ambient = 0;
      }
      // A few dozen strokes a frame and no more; a burst is a queue, not a
      // spike, and it still shows within a few frames.
      let budget = 48;
      while (s.queue.length && budget-- > 0) {
        const job = s.queue.shift();
        job(b);
      }
      ctx.drawImage(buf, 0, 0);
    },
  },
};

// --- the ruled sheet ---------------------------------------------------------------------

/** The construction the sheet was laid out on, drawn end to end past the cells. */
function rules(b, s, api) {
  const strength = api.param('rules');
  if (!(strength > 0)) return;
  b.save();
  b.strokeStyle = inkOf(api);
  b.globalAlpha = 0.25 + 0.5 * strength;
  b.lineWidth = Math.max(0.5, Math.min(api.w, api.h) * 0.0012);
  b.beginPath();
  for (const x of s.xs) {
    b.moveTo(x, s.top);
    b.lineTo(x, s.foot);
  }
  for (const y of s.ys) {
    b.moveTo(s.left, y);
    b.lineTo(s.right, y);
  }
  b.stroke();
  b.restore();
}

/** The rules again, only where they cross this cell, so a re-struck cell keeps them. */
function rulesOver(b, cell, s, api) {
  const strength = api.param('rules');
  if (!(strength > 0)) return;
  b.save();
  b.beginPath();
  b.rect(cell.x - 1, cell.y - 1, cell.w + 2, cell.h + 2);
  b.clip();
  b.strokeStyle = inkOf(api);
  b.globalAlpha = 0.25 + 0.5 * strength;
  b.lineWidth = Math.max(0.5, Math.min(api.w, api.h) * 0.0012);
  b.beginPath();
  for (const x of s.xs) {
    if (x < cell.x - 1 || x > cell.x + cell.w + 1) continue;
    b.moveTo(x, cell.y - 1);
    b.lineTo(x, cell.y + cell.h + 1);
  }
  for (const y of s.ys) {
    if (y < cell.y - 1 || y > cell.y + cell.h + 1) continue;
    b.moveTo(cell.x - 1, y);
    b.lineTo(cell.x + cell.w + 1, y);
  }
  b.stroke();
  b.restore();
}

/** Fill one cell: bare, grain, spindle lines or solid. */
function strike(b, cell, s, api) {
  const unit = Math.min(api.w, api.h);
  b.save();
  b.beginPath();
  b.rect(cell.x, cell.y, cell.w, cell.h);
  b.clip();
  b.fillStyle = api.palette.background;
  b.fillRect(cell.x - 1, cell.y - 1, cell.w + 2, cell.h + 2);
  if (cell.kind === 'solid') {
    b.fillStyle = cell.color;
    b.fillRect(cell.x, cell.y, cell.w, cell.h);
  } else if (cell.kind !== 'blank') {
    const rnd = seeded(cell.seed);
    const across = cell.vertical ? cell.w : cell.h;
    const along = cell.vertical ? cell.h : cell.w;
    const pitch = Math.max(2.5, (unit * 0.016) / api.param('hatch'));
    const count = Math.max(2, Math.min(80, Math.floor(across / pitch)));
    const lead = (across - count * pitch) / 2 + pitch / 2;
    const hair = Math.max(0.5, pitch * 0.14);
    const swell = pitch * 0.42;
    b.strokeStyle = cell.color;
    b.lineCap = 'butt';
    if (cell.kind === 'grain') {
      b.globalAlpha = 0.5;
      b.setLineDash([Math.max(0.6, hair * 0.9), Math.max(0.6, hair * 1.3)]);
    }
    for (let i = 0; i < count; i++) {
      const profile = profileOf(rnd, api, i, cell.heard || 0);
      const at = lead + i * pitch;
      // A hand's waver along the line, so a cell of them is not a ruling.
      const phase = rnd() * TAU;
      const inset = along * 0.01 * rnd();
      for (let j = 0; j < SAMPLES; j++) {
        const t0 = j / SAMPLES;
        const t1 = (j + 1) / SAMPLES;
        const wob0 = Math.sin(phase + t0 * 3.1) * hair * 0.5;
        const wob1 = Math.sin(phase + t1 * 3.1) * hair * 0.5;
        b.lineWidth = hair + swell * profile[j];
        b.beginPath();
        if (cell.vertical) {
          b.moveTo(cell.x + at + wob0, cell.y + inset + t0 * (cell.h - inset * 2));
          b.lineTo(cell.x + at + wob1, cell.y + inset + t1 * (cell.h - inset * 2));
        } else {
          b.moveTo(cell.x + inset + t0 * (cell.w - inset * 2), cell.y + at + wob0);
          b.lineTo(cell.x + inset + t1 * (cell.w - inset * 2), cell.y + at + wob1);
        }
        b.stroke();
      }
    }
    b.setLineDash([]);
    b.globalAlpha = 1;
  }
  b.restore();
  rulesOver(b, cell, s, api);
}

// --- the plotter -------------------------------------------------------------------------

/**
 * Queue the figure for an event: a few passes of a square in its cell, or a
 * handful of letters or crossed strokes around where it fell.
 */
function order(s, api, x, y, q, color, passes) {
  const unit = Math.min(api.w, api.h);
  const hair = Math.max(0.5, unit * 0.0013);
  const disorder = api.param('disorder');
  if (s.figure === 0) {
    const c = Math.max(0, Math.min(s.n - 1, Math.floor((x - s.left) / s.cell)));
    const r = Math.max(0, Math.min(s.n - 1, Math.floor((y - s.top) / s.cell)));
    const cell = s.cells[r * s.n + c];
    const count = Math.max(1, Math.round(passes * (0.4 + q * 1.2)));
    // How far out of true: a small event is nearly right and a large one is
    // nowhere near, which is what makes the sheet a reading of the day.
    const turn = (0.015 + q * 0.22) * disorder;
    const shift = s.cell * (0.008 + q * 0.07) * disorder;
    const half = s.cell * 0.38;
    // A cell drawn too often is a blot: wipe it and begin again, so the
    // sheet accumulates without ever going black.
    if (cell.passes + count > 80) {
      cell.passes = 0;
      const reach = s.cell * 0.5;
      enqueue(s, api, (b) => {
        b.fillStyle = api.palette.background;
        b.fillRect(cell.cx - reach, cell.cy - reach, reach * 2, reach * 2);
      });
    }
    cell.passes += count;
    for (let i = 0; i < count; i++) {
      const a = (Math.random() - 0.5) * 2 * turn;
      const dx = (Math.random() - 0.5) * 2 * shift;
      const dy = (Math.random() - 0.5) * 2 * shift;
      enqueue(s, api, (b) => {
        b.save();
        b.translate(cell.cx + dx, cell.cy + dy);
        b.rotate(a);
        b.strokeStyle = color;
        b.lineWidth = hair;
        b.globalAlpha = 0.85;
        b.strokeRect(-half, -half, half * 2, half * 2);
        b.restore();
      });
    }
  } else if (s.figure === 1) {
    // A serifed I, scattered in a cloud round the event and thickening
    // towards the middle of the sheet, the way the drawing does.
    const count = 2 + Math.round(q * 10 * passes / 5);
    const spread = s.side * (0.03 + q * 0.12) * disorder;
    const size = s.side * 0.018;
    marks(s, api, count, () => {
      const mx = x + gauss() * spread;
      const my = y + gauss() * spread;
      const a = (Math.random() - 0.5) * 0.3 * disorder;
      return (b) => {
        b.save();
        b.translate(clampTo(mx, s.left, s.left + s.side), clampTo(my, s.top, s.top + s.side));
        b.rotate(a);
        b.strokeStyle = color;
        b.lineWidth = hair;
        b.globalAlpha = 0.9;
        b.beginPath();
        b.moveTo(0, -size);
        b.lineTo(0, size);
        b.moveTo(-size * 0.45, -size);
        b.lineTo(size * 0.45, -size);
        b.moveTo(-size * 0.45, size);
        b.lineTo(size * 0.45, size);
        b.stroke();
        b.restore();
      };
    });
  } else {
    // Two short strokes crossed, dropped round the event until the square is
    // a fabric.
    const count = 3 + Math.round(q * 14 * passes / 5);
    const spread = s.side * (0.05 + q * 0.1) * disorder;
    const len = s.side * 0.03;
    marks(s, api, count, () => {
      const mx = clampTo(x + gauss() * spread, s.left, s.left + s.side);
      const my = clampTo(y + gauss() * spread, s.top, s.top + s.side);
      const a = (Math.random() - 0.5) * 0.35 * disorder;
      return (b) => {
        b.save();
        b.translate(mx, my);
        b.rotate(a);
        b.strokeStyle = color;
        b.lineWidth = hair;
        b.globalAlpha = 0.85;
        b.beginPath();
        b.moveTo(-len, 0);
        b.lineTo(len * (0.4 + Math.random() * 0.6), 0);
        b.moveTo(0, -len);
        b.lineTo(0, len * (0.4 + Math.random() * 0.6));
        b.stroke();
        b.restore();
      };
    });
  }
}

/** Queue `count` marks, and a fresh sheet first when the last one is full. */
function marks(s, api, count, make) {
  if (s.marks + count > 5000) {
    s.marks = 0;
    enqueue(s, api, (b) => {
      b.fillStyle = api.palette.background;
      b.globalAlpha = 0.92;
      b.fillRect(0, 0, api.w, api.h);
      b.globalAlpha = 1;
    });
  }
  s.marks += count;
  for (let i = 0; i < count; i++) enqueue(s, api, make());
}

/**
 * Queue one stroke, within the renderer's budget.
 *
 * A flood of a thousand events is a queue that would take seconds to strike;
 * past the budget the oldest orders are dropped, since what they would have
 * drawn is under what came after anyway.
 */
function enqueue(s, api, job) {
  s.queue.push(job);
  const most = Math.max(60, Math.min(1200, api.budget || 800));
  if (s.queue.length > most) s.queue.splice(0, s.queue.length - most);
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
}

function clampTo(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
