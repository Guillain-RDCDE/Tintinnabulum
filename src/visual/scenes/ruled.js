// Four pictures ruled onto a sheet.
//
//   spindles   a sheet divided into cells, each filled with lines that swell
//              and thin along their length, or struck solid, or left bare
//   lattice    a fine screen of small black bars whose size runs in waves
//              along the rows and down the columns, so the wall seems to move
//   desordres  a plotter drawing one square many times, never quite in the
//              same place, on a grid of nine
//   scanlines  a relief drawn with nothing but level lines: where the ground
//              rises the line is lifted and hides the lines behind it
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
import { TAU, seeded, hashOf, sizeOf, inkOf, clampTo, enqueue, drain, ambient, nearestRect } from './shared.js';
import { sheets } from './sheets.js';

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
  spindles: sheets({
    label: 'Spindle lines',
    note: 'A sheet divided into cells, and every cell filled with lines drawn from one edge to the other -- lines that swell and thin along their length like thread wound unevenly on a spindle, so that a cell of them reads as a woven thing rather than a ruled one. Some cells are struck solid black, some are drawn so lightly they are only grain, and some are left bare. Behind them, when you want it, the ruled construction the sheet was laid out on, running past the cells into the margin. Every event takes a cell and fills it again: a small one as grain, a middling one as lines, a large one solid. The second sheet is a stack: bands of upright pen lines laid one on another in a leaning column, each solid at one end and breaking into dashes at the other, with a dark crossed triangle or half disc hanging from its top edge; an event re-hatches its band, and a large one shifts it along.',
    how: 'The sheet is tiled by columns, each cell spanning one to three rows and now and then left out, and the rules are the edges of that tiling drawn end to end. A line is forty-eight short strokes at a width read off a profile; the profile is a few bumps placed by the event\'s own number, or, when the piece is sounding, the waveform of the note at the instant it was struck, a different window of it for each line. Grain is the same line drawn dashed and pale. A cell is re-struck only when it changes, one a frame, so the picture costs what has just been redrawn and not what is on it.',
    positional: true,
    preview: { frames: 200, dt: 50 },
    list: [
      {
        name: 'cells',
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
        },
        event(p, api) {
          const s = api.scene;
          if (!s.cells || !s.cells.length) return;
          // The cell it landed in, or the nearest when it landed in a gutter or a
          // gap: every event must take a place on the sheet.
          const cell = s.cells[nearestRect(s.cells, p.x, p.y)];
          const q = sizeOf(p, api);
          cell.kind = q < 0.22 ? 'grain' : q < 0.66 ? 'lines' : 'solid';
          cell.vertical = (p.pick === undefined ? Math.random() : p.pick) < 0.55;
          cell.color = Math.random() < api.param('colour') ? p.color : inkOf(api);
          cell.seed = hashOf(p, { fine: true });
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
          ambient(s, api, 1600, () => {
            const cell = s.cells[(Math.random() * s.cells.length) | 0];
            const pick = Math.random();
            cell.kind = pick < 0.12 ? 'blank' : pick < 0.36 ? 'grain' : pick < 0.86 ? 'lines' : 'solid';
            cell.vertical = Math.random() < 0.55;
            cell.color = inkOf(api);
            cell.seed = Math.floor(Math.random() * 1e9);
            cell.profiles = null;
            cell.heard = 0;
            cell.done = false;
          });
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
      // The second sheet: bands of hatching laid one on another in a leaning
      // column, each solid at one end and breaking into dashes at the other.
      {
        name: 'stack',
        params: {
          hatch: { label: 'How close the lines', min: 0.5, max: 2, step: 0.05, default: 1 },
          colour: { label: 'How much colour against the black', min: 0, max: 1, step: 0.02, default: 0.12 },
        },
        init(api) {
          stackUp(api.scene, api);
        },
        event(p, api) {
          const s = api.scene;
          if (!s.cells || !s.cells.length) return;
          const cell = s.cells[nearestRect(s.cells, p.x, p.y)];
          restack(s, api, cell, sizeOf(p, api), Math.random() < api.param('colour') ? p.color : inkOf(api));
          s.lastAt = api.now;
        },
        frame(ctx, api) {
          const s = api.scene;
          if (!s.cells) return;
          const buf = scratch(api, 'buf');
          const b = s.bufCtx;
          // Blocks lie over one another, so a changed block cannot be struck
          // alone without cutting into its neighbours. The whole stack is struck
          // again instead, and at most a few times a second.
          ambient(s, api, 2600, () => restack(s, api, s.cells[(Math.random() * s.cells.length) | 0], 0.1, inkOf(api)));
          if (s.dirty && api.now - s.struckAt > 140) {
            b.fillStyle = api.palette.background;
            b.fillRect(0, 0, api.w, api.h);
            for (const cell of s.cells) strikeStacked(b, cell, s, api);
            s.dirty = false;
            s.struckAt = api.now;
          }
          ctx.drawImage(buf, 0, 0);
        },
      },
    ],
  }),

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
    sheets: ['squares', 'letters', 'mesh'],
    note: 'A plotter drawing the same square over and over on a grid of nine, and never quite in the same place: each pass is turned a few degrees and moved a hair, so a square drawn ten times is a nest of squares and one drawn fifty times is a scribble with a square in it. Every event picks a cell and draws it again, a small event neatly and a large one wildly, so the sheet is a record of how disorderly the day was, cell by cell. Or the same hand at a different task: a scatter of small letters thickening towards the middle of the page, or a mesh of short crossed strokes filling a square until it is a fabric.',
    how: 'One figure, redrawn with two errors: a rotation and an offset, both drawn at random from a range the event\'s size sets and the dial scales. That is the whole of it, and it is Molnar\'s (Dés)Ordres of 1974, done by a machine because a hand cannot be that nearly right that many times. A cell that has been drawn too often is wiped and begun again, so the sheet accumulates without ever going black. The letters and the mesh are the same machine with a different figure: a serifed I, or two short strokes crossed, placed where the event fell. Strokes are queued and struck a few dozen a frame onto a buffer.',
    positional: true,
    preview: { frames: 200, dt: 50 },
    params: {
      figure: { label: 'Which figure', options: ['squares', 'letters', 'mesh'], min: 0, max: 2, step: 1, default: 0, rebuild: true, vary: false },
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
      ambient(s, api, 1100, () => {
        const x = s.left + Math.random() * s.side;
        const y = s.top + Math.random() * s.side;
        order(s, api, x, y, 0.05, inkOf(api), 1);
      }, 2000);
      // A few dozen strokes a frame and no more; a burst is a queue, not a
      // spike, and it still shows within a few frames.
      drain(s, b, 48);
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- scanlines --------------------------------------------------------------------------
  scanlines: {
    label: 'Ruled relief',
    note: 'A landscape drawn with nothing but level lines, a hundred of them ruled across the sheet. Where the ground rises the line is lifted with it, and a lifted line hides whatever lies behind, so a block reads as a block and its near face -- the lines climbing its side -- comes out as a dark wall of hatching. Every event raises something: a small one a cube, a middling one a crystal with faceted sides, a large one a rounded mass. They stand until the sheet is crowded, then the oldest sink back into the plain.',
    how: 'A height field on a grid, the maximum of every form standing on it: a box, a pyramid cut by a few random facet planes, a dome. Each row is a polyline whose y is the row\'s level minus the height under it, drawn from the front row to the back with a running skyline per column -- a point is drawn only where it stands above everything already drawn in front of it, which is hidden-line removal in one pass and one array. The steep sides are not drawn separately: they are the rows themselves stepping up, stacked. A form rises over half a second and sinks over four when its turn comes, and the field is re-taken from scratch only when something has gone.',
    positional: true,
    preview: { frames: 160, dt: 50 },
    params: {
      lines: { label: 'How many lines', min: 50, max: 240, step: 5, default: 160, rebuild: true },
      height: { label: 'How high the relief', min: 0.3, max: 2, step: 0.05, default: 1 },
      keep: { label: 'How many forms before the oldest sink', min: 8, max: 150, step: 1, default: 45 },
      lean: { label: 'How sharp the facets', min: 0, max: 1, step: 0.02, default: 0.5 },
      colour: { label: 'How much colour in the lines', min: 0, max: 1, step: 0.02, default: 0 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      const rows = Math.max(20, Math.min(240, Math.round(api.param('lines'))));
      const margin = m * 0.08;
      s.margin = margin;
      s.rows = rows;
      // Columns fine enough that a facet edge is a clean step and not a
      // staircase, coarse enough that a frame is a few tens of thousands of
      // points and no more.
      s.cols = Math.max(60, Math.min(260, Math.round((api.w - margin * 2) / (m * 0.0045))));
      s.top = margin + m * 0.12;
      s.foot = api.h - margin;
      s.left = margin;
      s.right = api.w - margin;
      s.field = new Float32Array(s.cols * rows);
      s.skyline = new Float32Array(s.cols);
      s.forms = [];
      s.dirty = false;
      s.lastAt = 0;
      s.ambient = 0;
      s.cleanAt = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.field) return;
      raise(s, api, p.x, p.y, sizeOf(p, api), p);
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.field) return;
      const m = Math.min(api.w, api.h);
      // The plain grows a small cube now and then when nothing arrives, and
      // never while the feed is working.
      ambient(s, api, 1800, () => raise(s, api, s.left + Math.random() * (s.right - s.left), s.top + Math.random() * (s.foot - s.top), 0.08 + Math.random() * 0.1, null));

      // Forms rise, stand and sink. Rising is stamped into the field as it
      // goes (a maximum only ever grows); a sinking form means the field has
      // to be re-taken from what is left, which is done once per frame for
      // as long as anything is sinking, and not otherwise.
      let sinking = false;
      const keep = Math.round(api.param('keep'));
      const cap = Math.max(8, Math.min(keep, Math.floor((api.budget || 800) / 3)));
      let standing = 0;
      for (const f of s.forms) if (!f.sinkAt) standing++;
      // Too many standing: the oldest begin to sink.
      for (let i = 0; i < s.forms.length && standing > cap; i++) {
        const f = s.forms[i];
        if (f.sinkAt) continue;
        f.sinkAt = api.now;
        standing--;
      }
      for (let i = s.forms.length - 1; i >= 0; i--) {
        const f = s.forms[i];
        const rise = Math.min(1, (api.now - f.born) / 550);
        let level = rise;
        if (f.sinkAt) {
          level = rise * Math.max(0, 1 - (api.now - f.sinkAt) / 4000);
          sinking = true;
          if (level <= 0) {
            s.forms.splice(i, 1);
            continue;
          }
        }
        if (level !== f.level) {
          f.level = level;
          if (!f.sinkAt) stamp(s, f);
        }
      }
      if (sinking) retake(s);

      // The rows, front to back, with a running skyline per column.
      const ink = inkOf(api);
      const scale = m * 0.15 * api.param('height');
      const dx = (s.right - s.left) / (s.cols - 1);
      const pitch = (s.foot - s.top) / (s.rows - 1);
      const sky = s.skyline;
      sky.fill(Infinity);
      ctx.lineWidth = Math.max(0.5, m * 0.0011);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.strokeStyle = ink;
      for (let r = s.rows - 1; r >= 0; r--) {
        const base = s.top + r * pitch;
        const row = r * s.cols;
        let tinted = null;
        for (const f of s.forms) {
          if (f.color && f.row === r) tinted = f.color;
        }
        ctx.strokeStyle = tinted || ink;
        ctx.beginPath();
        let open = false;
        let px = 0;
        let py = 0;
        for (let c = 0; c < s.cols; c++) {
          const x = s.left + c * dx;
          const y = base - s.field[row + c] * scale;
          // Above everything in front of it: seen. A hair of slack, or the
          // level plain in front hides the level plain behind by a rounding
          // error and the whole picture is one line.
          const seen = y < sky[c] - 0.35;
          if (seen) {
            if (!open) {
              // Begin at the last hidden point rather than here, so a line
              // emerging from behind a block starts at the block's edge.
              ctx.moveTo(c ? px : x, c ? py : y);
              open = true;
            }
            ctx.lineTo(x, y);
            sky[c] = y;
          } else if (open) {
            // Run into the hidden point, so a line going behind a block
            // reaches the edge; then close the run.
            ctx.lineTo(x, Math.min(y, sky[c]));
            open = false;
          }
          px = x;
          py = seen ? y : Math.min(y, sky[c]);
        }
        ctx.stroke();
      }
    },
  },
};

// --- the stack ---------------------------------------------------------------------------

/**
 * A column of blocks laid one above another, each a little to the left or the
 * right of the one below, as in a pen drawing of stacked hatched bands.
 */
function stackUp(s, api) {
  const span = api.h * 0.76;
  const side = Math.min(api.w * 0.42, api.h * 0.32);
  const top = (api.h - span) / 2;
  s.cells = [];
  let y = top;
  let cx = api.w / 2;
  while (y < top + span - span * 0.02) {
    const h = Math.min(top + span - y, span * (0.025 + Math.random() * 0.055));
    const w = side * (0.5 + Math.random() * 0.5);
    cx = clampTo(cx + (Math.random() - 0.5) * side * 0.5, api.w / 2 - side * 0.45, api.w / 2 + side * 0.45);
    const cell = { x: cx - w / 2, y, w, h, kind: 'stack', done: true };
    dressStacked(cell, 0.3 + Math.random() * 0.4, inkOf(api));
    s.cells.push(cell);
    // A sliver of overlap now and then, so the blocks read as laid on one
    // another rather than ruled in a column.
    y += h * (Math.random() < 0.4 ? 0.85 : 1.0);
  }
  s.side = side;
  s.dirty = true;
  s.struckAt = -1e9;
  s.lastAt = 0;
  s.ambient = 0;
}

/** A block's own hatching: where its lines break up, and what hangs from its top. */
function dressStacked(cell, q, color) {
  cell.fade = 0.35 + Math.random() * 0.4;
  cell.color = color;
  cell.seed = Math.floor(Math.random() * 1e9);
  // A dark figure hanging from the top edge: a triangle point down, or a
  // half disc, more often and larger on a larger event.
  cell.notch = Math.random() < 0.35 + q * 0.6
    ? { at: 0.12 + Math.random() * 0.62, wide: 0.6 + q * 1.4, deep: 0.45 + Math.random() * 0.4, round: Math.random() < 0.45 }
    : null;
}

/** Change the stack for an event: the block re-hatched, and a large one moved. */
function restack(s, api, cell, q, color) {
  dressStacked(cell, q, color);
  if (q > 0.6) {
    const dx = (Math.random() - 0.5) * s.side * 0.4;
    cell.x = clampTo(cell.x + dx, api.w * 0.08, api.w * 0.92 - cell.w);
  }
  s.dirty = true;
}

/** One block: upright pen lines, solid to the left and breaking into dashes to the right. */
function strikeStacked(b, cell, s, api) {
  const unit = Math.min(api.w, api.h);
  const pitch = Math.max(2.4, (unit * 0.0085) / api.param('hatch'));
  const hair = Math.max(0.6, pitch * 0.32);
  const rnd = seeded(cell.seed);
  b.save();
  b.strokeStyle = cell.color;
  b.lineWidth = hair;
  b.lineCap = 'butt';
  const n = Math.max(2, Math.floor(cell.w / pitch));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = cell.x + (i + 0.5) * (cell.w / n) + (rnd() - 0.5) * pitch * 0.15;
    const y0 = cell.y + (rnd() - 0.5) * pitch * 0.5;
    const y1 = cell.y + cell.h + (rnd() - 0.5) * pitch * 0.5;
    if (t > cell.fade) {
      // Past the fade the pen skips: dashes that shorten and gaps that
      // open as the line goes right.
      const k = (t - cell.fade) / (1 - cell.fade);
      b.setLineDash([Math.max(1, pitch * (2.6 - 1.8 * k)), Math.max(0.8, pitch * (0.35 + 1.4 * k))]);
      b.lineDashOffset = rnd() * pitch * 3;
    } else {
      b.setLineDash([]);
    }
    b.beginPath();
    b.moveTo(x, y0);
    b.lineTo(x + (rnd() - 0.5) * hair, y1);
    b.stroke();
  }
  b.setLineDash([]);
  const nt = cell.notch;
  if (nt) {
    const cx = cell.x + cell.w * nt.at;
    const half = Math.min(cell.w * 0.3, (cell.h * nt.wide) / 2);
    const deep = cell.h * nt.deep;
    b.beginPath();
    if (nt.round) {
      b.ellipse(cx, cell.y, half, deep, 0, 0, Math.PI);
    } else {
      b.moveTo(cx - half, cell.y);
      b.lineTo(cx + half, cell.y);
      b.lineTo(cx + half * 0.15, cell.y + deep);
    }
    b.closePath();
    b.clip();
    // Crossed: level lines over the upright ones, so the figure is a mesh.
    b.lineWidth = hair * 0.9;
    b.beginPath();
    for (let y = cell.y + pitch * 0.25; y < cell.y + deep; y += pitch * 0.55) {
      b.moveTo(cx - half, y);
      b.lineTo(cx + half, y);
    }
    b.stroke();
  }
  b.restore();
}

// --- the relief --------------------------------------------------------------------------

/** Raise a form where an event fell: a cube, a crystal or a mass, by size. */
function raise(s, api, x, y, q, p) {
  if (x < s.left || x > s.right || y < s.top || y > s.foot) {
    x = clampTo(x, s.left, s.right);
    y = clampTo(y, s.top, s.foot);
  }
  const dx = (s.right - s.left) / (s.cols - 1);
  const pitch = (s.foot - s.top) / (s.rows - 1);
  const cx = (x - s.left) / dx;
  const cy = (y - s.top) / pitch;
  const m = Math.min(api.w, api.h);
  const kind = q < 0.3 ? 'cube' : q < 0.72 ? 'crystal' : 'mass';
  // Footprint in columns and rows, and height as a share of the full
  // relief. A cube is small and sheer, a crystal middling and pointed, a
  // mass wide and low-shouldered.
  const reach = (kind === 'cube' ? 0.03 + q * 0.08 : kind === 'crystal' ? 0.06 + q * 0.12 : 0.12 + q * 0.14) * m;
  const peak = kind === 'cube' ? 0.18 + q * 0.4 : kind === 'crystal' ? 0.35 + q * 0.5 : 0.5 + q * 0.5;
  const f = {
    kind, cx, cy,
    rx: reach / dx,
    ry: reach / pitch,
    peak,
    turn: Math.random() * TAU,
    // The facet planes of a crystal: a few directions, each cutting the
    // cone at its own slope, which is what makes one crystal unlike another.
    facets: [],
    tiers: kind === 'cube' ? (Math.random() < 0.5 ? 2 : 1) : kind === 'crystal' ? 3 + Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 5),
    level: 0,
    born: api.now,
    sinkAt: 0,
    color: p && Math.random() < api.param('colour') ? p.color : null,
    row: Math.round(cy),
  };
  const n = 4 + Math.floor(Math.random() * 4);
  const lean = api.param('lean');
  for (let i = 0; i < n; i++) {
    const a = f.turn + (i / n) * TAU + (Math.random() - 0.5) * 0.6;
    f.facets.push({ nx: Math.cos(a), ny: Math.sin(a), slope: 0.7 + Math.random() * 0.8 * (0.5 + lean) });
  }
  s.forms.push(f);
  if (s.forms.length > 400) s.forms.splice(0, s.forms.length - 400);
}

/** The height of one form over one cell, in shares of the full relief. */
function heightAt(f, c, r) {
  const u = (c - f.cx) / f.rx;
  const v = (r - f.cy) / f.ry;
  if (f.kind === 'cube') {
    const ct = Math.cos(f.turn);
    const st = Math.sin(f.turn);
    const a = u * ct + v * st;
    const b = -u * st + v * ct;
    if (Math.abs(a) > 1 || Math.abs(b) > 1) return 0;
    // A smaller block stacked on the first, off centre, one time in two.
    if (f.tiers > 1 && Math.abs(a - 0.2) <= 0.5 && Math.abs(b + 0.15) <= 0.5) return f.peak;
    return f.peak * (f.tiers > 1 ? 0.62 : 1);
  }
  if (f.kind === 'mass') {
    const d = u * u + v * v;
    if (d >= 1) return 0;
    // In terraces, so the round mass has the stepped sides the drawing has
    // -- a smooth dome comes out as a hill, and this is not a hill.
    return f.peak * (Math.ceil(Math.sqrt(1 - d) * f.tiers) / f.tiers);
  }
  // A crystal: a cone cut by facet planes, the lowest plane wins, and the
  // result cut into a few flat steps with sheer faces between them.
  let h = 1;
  for (const k of f.facets) {
    const d = (u * k.nx + v * k.ny) * k.slope;
    if (d > 0 && 1 - d < h) h = 1 - d;
  }
  if (h <= 0) return 0;
  return f.peak * (Math.ceil(h * f.tiers) / f.tiers);
}

/** Stamp a form into the field, as a maximum, over its own footprint only. */
function stamp(s, f) {
  const c0 = Math.max(0, Math.floor(f.cx - f.rx - 1));
  const c1 = Math.min(s.cols - 1, Math.ceil(f.cx + f.rx + 1));
  const r0 = Math.max(0, Math.floor(f.cy - f.ry - 1));
  const r1 = Math.min(s.rows - 1, Math.ceil(f.cy + f.ry + 1));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const h = heightAt(f, c, r) * f.level;
      const i = r * s.cols + c;
      if (h > s.field[i]) s.field[i] = h;
    }
  }
}

/** The field again from scratch, from every form still standing or sinking. */
function retake(s) {
  s.field.fill(0);
  for (const f of s.forms) stamp(s, f);
}

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

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
}
