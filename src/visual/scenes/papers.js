// Two pictures made of paper.
//
//   cutpaper  shapes cut with a blade and butted edge to edge, flat, opaque
//   planes    a few very large shapes laid over one another, all transparent
//
// They are opposites on purpose. The first is additive and permanent: a cut
// is laid down, it covers what was under it, and the picture is the whole
// history of the cutting. The second holds only a handful of forms at a time
// and lets them through each other, so its colours are mostly colours that
// are in none of its shapes.
//
// House rules as everywhere: the collage is struck once onto a buffer and
// never redrawn, the transparent one keeps a pool with a hard ceiling.

import { scratch } from './paint.js';
import { lighten, mixColors } from '../color.js';
import { TAU, papers, ambient } from './shared.js';

/** One sheet, drawn as cut. Everything is inside the box it was given. */
function cut(b, kind, x, y, w, h, turn) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  b.save();
  b.beginPath();
  b.rect(x, y, w, h);
  b.clip();
  switch (kind) {
    case 'plain':
      b.fillRect(x, y, w, h);
      break;
    case 'half': {
      // A half disc on one of the four edges, filling the box across.
      const r = Math.max(w, h);
      b.save();
      b.translate(cx, cy);
      b.rotate(turn * (TAU / 4));
      b.beginPath();
      b.arc(0, h / 2, r, Math.PI, TAU);
      b.fill();
      b.restore();
      break;
    }
    case 'quarter': {
      const ox = turn === 1 || turn === 2 ? x : x + w;
      const oy = turn >= 2 ? y : y + h;
      b.beginPath();
      b.moveTo(ox, oy);
      b.arc(ox, oy, Math.max(w, h), 0, TAU);
      b.fill();
      break;
    }
    case 'disc':
      b.beginPath();
      b.arc(cx, cy, Math.min(w, h) * 0.46, 0, TAU);
      b.fill();
      break;
    case 'stadium': {
      const r = Math.min(w, h) / 2;
      b.beginPath();
      if (typeof b.roundRect === 'function') b.roundRect(x, y, w, h, r);
      else b.rect(x, y, w, h);
      b.fill();
      break;
    }
    case 'wedge':
      b.beginPath();
      if (turn % 2) {
        b.moveTo(x, y);
        b.lineTo(x + w, y);
        b.lineTo(turn === 1 ? x : x + w, y + h);
      } else {
        b.moveTo(x, y + h);
        b.lineTo(x + w, y + h);
        b.lineTo(turn === 0 ? x : x + w, y);
      }
      b.closePath();
      b.fill();
      break;
    case 'stem': {
      const t = Math.min(w, h) * 0.3;
      if (turn % 2) b.fillRect(x, cy - t / 2, w, t);
      else b.fillRect(cx - t / 2, y, t, h);
      break;
    }
    default:
      b.fillRect(x, y, w, h);
  }
  b.restore();
}

const KINDS = ['plain', 'plain', 'plain', 'half', 'quarter', 'disc', 'stadium', 'wedge', 'stem'];

export const PAPER_SCENES = {
  // --- cutpaper ---------------------------------------------------------------------------
  cutpaper: {
    label: 'Cut paper',
    note: 'Shapes cut out of coloured paper with a blade and butted up against one another until there is no ground left showing. Everything is flat -- no shadow, no edge, no depth of any kind -- so the picture holds together by how the pieces pack rather than by what is in front of what, and a face or a bird appears now and then out of nothing more than a half disc landing above two dots. Every event cuts one more piece and lays it down over whatever was there, which means the picture is the whole history of the cutting and the oldest of it is buried. The second sheet is a totem: a standing figure cut in bands, every band a strip of triangles between two ragged edges, in red, blue, yellow, cream and black on a coloured ground, its outline jutting out in points here and there. A small event re-colours the triangle it falls on, a middling one its whole band, and a large one re-cuts the band so the figure changes shape. The third sheet is a collage of large sheets: rectangles cut from charcoal and a few colours, laid over one another on a module and turned together through an angle, the ground-coloured ones on top cutting the dark into frames and elbows. Every event lays one more sheet in the colour of its kind, so the commonest kind of event is the charcoal that carries the picture.',
    how: 'Every cut is aligned to a module, so pieces meet exactly and the mosaic never shows a seam of ground. A piece is a flat field of one colour, and on better than half of them a second shape -- half disc, quarter, wedge, stem -- is cut into the same box in another. The two neutrals of the palette carry most of the area and the categories punctuate it, which is the ratio the thing is built on. Struck onto a buffer and never redrawn.',
    preview: { frames: 220, dt: 45 },
    params: {
      figure: { label: 'Which sheet: collage, totem, sheets', min: 0, max: 2, step: 1, default: 0, rebuild: true, vary: false },
      tilt: { label: 'How far the sheets are turned', min: 0, max: 40, step: 1, default: 16, rebuild: true },
      scatter: { label: 'How freely each sheet is thrown', min: 0, max: 1, step: 0.02, default: 0, rebuild: true },
      dark: { label: 'Ground: paper or dark', min: 0, max: 1, step: 1, default: 0, rebuild: true, vary: false },
      edge: { label: 'How much the scissors wander', min: 0, max: 1, step: 0.02, default: 0.35, rebuild: true },
      scale: { label: 'Size of a piece', min: 0.5, max: 2.4, step: 0.05, default: 1, rebuild: true },
      colour: { label: 'How much colour against the neutrals', min: 0, max: 1, step: 0.02, default: 0.4 },
      faces: { label: 'How often an eye', min: 0, max: 1, step: 0.02, default: 0.22 },
      wear: { label: 'Wear on the paper', min: 0, max: 1, step: 0.02, default: 0.35 },
    },
    init(api) {
      const s = api.scene;
      s.figure = Math.max(0, Math.min(2, Math.round(api.param('figure') || 0)));
      if (s.figure === 1) {
        raiseTotem(api);
        return;
      }
      if (s.figure === 2) {
        laySheets(api);
        return;
      }
      const m = Math.min(api.w, api.h);
      s.module = Math.max(8, (m / 11) * api.param('scale'));
      s.cols = Math.max(2, Math.ceil(api.w / s.module));
      s.rows = Math.max(2, Math.ceil(api.h / s.module));
      s.cleared = false;
      s.ambient = 0;
      s.lastAt = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (s.figure === 1) {
        if (s.levels) recutTotem(api, p.x, p.y, Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34))));
        return;
      }
      if (s.figure === 2) {
        if (s.sheets) dropSheet(api, p.x, p.y, Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34))), p);
        return;
      }
      if (!s.module || !s.bufCtx) return;
      // A few pieces round where it fell, more for a larger event: one piece
      // alone is lost in a collage of hundreds.
      const q = Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34)));
      const col = Math.floor(p.x / s.module);
      const row = Math.floor(p.y / s.module);
      const n = 1 + Math.round(q * 3);
      for (let i = 0; i < n; i++) {
        lay(api, col + ((Math.random() * 3) | 0) - 1, row + ((Math.random() * 3) | 0) - 1, i === 0 ? p.color : null);
      }
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (s.figure === 1) {
        drawTotem(ctx, api);
        return;
      }
      if (s.figure === 2) {
        drawSheets(ctx, api);
        return;
      }
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        // The table is laid before anything is cut: alternating neutrals on
        // the module, so a still is a collage rather than a blank ground with
        // three shapes on it.
        const paper = papers(api);
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        for (let r = 0; r < s.rows; r++) {
          for (let c = 0; c < s.cols; c++) {
            b.fillStyle = (c + r) % 2 ? paper.card : paper.ink;
            b.fillRect(c * s.module, r * s.module, s.module + 1, s.module + 1);
          }
        }
        s.cleared = true;
        for (let i = 0; i < 90; i++) {
          lay(api, (Math.random() * s.cols) | 0, (Math.random() * s.rows) | 0, null);
        }
      }
      // The blade works on its own only after a pause, and slowly. It used to
      // cut a piece every hundred and ten milliseconds whatever arrived, so
      // a silent minute put down as many pieces as a busy one.
      ambient(s, api, 1800, () => lay(api, (Math.random() * s.cols) | 0, (Math.random() * s.rows) | 0, null));
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- planes -----------------------------------------------------------------------------
  planes: {
    label: 'Planes',
    note: 'Half a dozen very large shapes at a time, laid over one another on a sheet of paper, and every one of them transparent. Where two cross, the colour belongs to neither: a black wash over a green disc is a green nobody mixed, and most of what you see in this picture is that. A few forms are hard-edged and printed; the rest are wet, and their edges have run. Each event brings one more plane in and pushes the oldest out, so the composition is never still and never crowded. The second sheet is a scatter: many smaller slabs tilted every way in three colours that darken where they cross, among as many pieces only drawn round in graphite, all gathered into a band across the sheet. The third sheet is stairs: long bars laid one after another in a progression -- a drift up the diagonal, two flights meeting at a corner, a slope, or two halves turned on the diagonal either side of a gap -- each bar either a veil of colour or ruled fine across its length, so that where they cross the colours multiply. Every event lays a step again.',
    how: 'A bounded pool of forms, redrawn whole every frame -- affordable precisely because there are so few -- and combined with multiply on a pale ground or screen on a dark one, which is how transparent pigment behaves and what makes the crossings their own colours. A wash is the same form struck four or five times at a low opacity with its edges nudged, which is cheaper than a blur and looks more like water.',
    positional: true,
    preview: { frames: 160, dt: 50 },
    params: {
      figure: { label: 'Which sheet: planes, scatter, stairs', min: 0, max: 2, step: 1, default: 0, rebuild: true, vary: false },
      layout: { label: 'How the stairs are laid: drift, corner, slope, split', min: 0, max: 3, step: 1, default: 0, rebuild: true, vary: false },
      cool: { label: 'How much of the cool ink, on the stairs', min: 0, max: 1, step: 0.02, default: 0.12 },
      count: { label: 'How many planes', min: 2, max: 18, step: 1, default: 10 },
      scale: { label: 'How large', min: 0.4, max: 1.6, step: 0.05, default: 1 },
      wash: { label: 'How much is wet', min: 0, max: 1, step: 0.02, default: 0.45 },
      veil: { label: 'How transparent', min: 0.15, max: 1, step: 0.02, default: 0.62 },
    },
    init(api) {
      const s = api.scene;
      s.forms = [];
      s.focus = { x: api.w * 0.5, y: api.h * 0.5 };
      s.ambient = 0;
      s.figure = Math.max(0, Math.min(2, Math.round(api.param('figure') || 0)));
      if (s.figure === 2) {
        layStairs(api);
        return;
      }
      // A sheet with something already on it: four planes, so the first frame
      // of this scene is a composition and not an empty page.
      const first = s.figure === 1 ? 16 : 4;
      for (let i = 0; i < first; i++) {
        const spread = s.figure === 1 ? 0.84 : 0.4;
        add(api, api.w * (0.5 - spread / 2 + Math.random() * spread), api.h * (0.3 + Math.random() * 0.4), null, false);
        s.forms[i].age = 1200;
      }
    },
    event(p, api) {
      const s = api.scene;
      if (s.figure === 2) {
        if (s.bars) stepStairs(api, p.x, p.y, Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34))), p.color);
        return;
      }
      if (!s.forms) return;
      s.quiet = Math.max(0, (s.quiet || 0) - 0.3);
      s.focus.x = s.focus.x * 0.7 + p.x * 0.3;
      s.focus.y = s.focus.y * 0.7 + p.y * 0.3;
      add(api, p.x, p.y, p.color, p.accent);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (s.figure === 2) {
        drawStairs(ctx, api);
        return;
      }
      if (!s.forms) return;
      const paper = papers(api);
      // The scatter is many small pieces rather than a few large ones.
      const cap = Math.max(2, Math.round(api.param('count'))) * (s.figure === 1 ? 4 : 1);
      // The sheet works on its own only while nothing is arriving.
      //
      // It used to bring a plane in every nine hundred milliseconds whatever
      // happened, and with a pool of ten that is the whole composition
      // replaced every nine seconds by the clock alone -- so a silent minute
      // and a busy one put down about the same amount of work, and the feed
      // was not driving the picture so much as decorating it.
      // Four seconds, not one. Every plane that arrives shifts the standing of
      // all the others -- the pool is drawn oldest-faintest -- so one ambient
      // plane repaints the whole sheet, and at one a second the sheet was
      // never still for long enough for an arrival to be the thing that
      // changed it.
      s.quiet = Math.min(1, (s.quiet || 0) + api.dt / 3000);
      s.ambient += api.dt * s.quiet;
      while (s.ambient > 4000) {
        s.ambient -= 4000;
        add(api, s.focus.x + (Math.random() - 0.5) * api.w * 0.5,
          s.focus.y + (Math.random() - 0.5) * api.h * 0.5, null, false);
      }
      while (s.forms.length > cap) s.forms.shift();

      ctx.save();
      ctx.fillStyle = paper.pale ? lighten(api.palette.background, 0.03) : api.palette.background;
      ctx.fillRect(0, 0, api.w, api.h);
      const blend = paper.pale ? 'multiply' : 'screen';
      const veil = api.param('veil');
      for (let i = 0; i < s.forms.length; i++) {
        const f = s.forms[i];
        f.age += api.dt;
        const arrived = Math.min(1, f.age / 1200);
        // The oldest plane on the sheet is the faintest: it is on its way
        // out, and it goes out by being seen through rather than by vanishing.
        const standing = (i + 1) / s.forms.length;
        // The scatter is coloured pencil pressed hard: a piece stays nearly
        // as strong as it was laid until it is close to going.
        const alpha = s.figure === 1
          ? Math.min(1, veil * 1.3 * arrived * (0.7 + 0.3 * standing))
          : veil * arrived * (0.4 + 0.6 * standing);
        ctx.fillStyle = f.color;
        ctx.strokeStyle = f.color;
        if (f.outline) {
          // Only drawn round, in graphite: the shape of a piece that was
          // never coloured in, which is half of what the scatter is.
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = Math.min(1, 0.3 + arrived * 0.6) * (0.55 + 0.45 * standing);
          ctx.strokeStyle = paper.pale ? paper.ink : paper.card;
          ctx.lineWidth = Math.max(0.7, Math.min(api.w, api.h) * 0.0016);
          ctx.lineJoin = 'round';
          outline(ctx, f);
        } else if (f.wet) {
          // A wash: the same form several times, low, with its edges moved.
          ctx.globalCompositeOperation = blend;
          for (let i = 0; i < 5; i++) {
            ctx.globalAlpha = alpha * 0.32;
            const j = f.r * 0.05 * (i - 2);
            form(ctx, f, j);
          }
        } else if (f.solid) {
          // Printed rather than painted: opaque, hard-edged, and laid over
          // whatever it covers. Without a few of these the sheet has no
          // structure and reads as weather.
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = Math.min(1, 0.55 + arrived * 0.42);
          form(ctx, f, 0);
        } else {
          ctx.globalCompositeOperation = blend;
          ctx.globalAlpha = alpha;
          form(ctx, f, 0);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },
};

// --- the collage -------------------------------------------------------------------------

/** Cut one piece on the module and lay it down. */
function lay(api, col, row, color) {
  const s = api.scene;
  const b = s.bufCtx;
  if (!b) return;
  const paper = papers(api);
  const m = s.module;
  const wide = 1 + ((Math.random() * 3) | 0);
  const tall = 1 + ((Math.random() * 3) | 0);
  const x = Math.max(0, Math.min(s.cols - wide, col)) * m;
  const y = Math.max(0, Math.min(s.rows - tall, row)) * m;
  const w = wide * m;
  const h = tall * m;
  const coloured = () => paper.sheets[(Math.random() * paper.sheets.length) | 0];
  const chance = api.param('colour');
  const sheet = (given) => {
    if (given && Math.random() < 0.55) return given;
    if (Math.random() < chance) return coloured();
    return Math.random() < 0.58 ? paper.ink : paper.card;
  };

  b.save();
  // The field first, then a shape cut into the same box: the second is what
  // keeps a collage from being a chequerboard.
  b.fillStyle = sheet(color);
  b.fillRect(x, y, w + 0.5, h + 0.5);
  if (Math.random() < 0.62) {
    let second = sheet(color);
    if (second === b.fillStyle) second = Math.random() < 0.5 ? paper.card : paper.ink;
    b.fillStyle = second;
    cut(b, KINDS[(Math.random() * KINDS.length) | 0], x, y, w, h, (Math.random() * 4) | 0);
  }
  // An eye: a small disc of the ground inside a dark field, which is the
  // whole of what makes a face appear in a picture of shapes.
  if (Math.random() < api.param('faces') * 0.5) {
    b.fillStyle = paper.card;
    b.beginPath();
    b.arc(x + w * (0.3 + Math.random() * 0.4), y + h * (0.3 + Math.random() * 0.4),
      m * 0.13, 0, TAU);
    b.fill();
  }
  // Wear: the paper is old, and a scratch or two says so more cheaply than a
  // texture over the whole picture.
  const wear = api.param('wear');
  if (Math.random() < wear * 0.6) {
    b.strokeStyle = paper.pale ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.12)';
    b.lineWidth = Math.max(0.5, m * 0.012);
    b.beginPath();
    const sx = x + Math.random() * w;
    const sy = y + Math.random() * h;
    b.moveTo(sx, sy);
    b.lineTo(sx + (Math.random() - 0.5) * m * 1.6, sy + (Math.random() - 0.5) * m * 0.4);
    b.stroke();
  }
  b.restore();
}

// --- the transparent sheet ---------------------------------------------------------------

/** One more plane on the sheet. */
function add(api, x, y, color, accent) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  const paper = papers(api);
  const scale = api.param('scale');
  if (s.figure === 1) {
    scatter(api, x, y, color);
    return;
  }
  const kind = accent ? 'spot'
    : Math.random() < 0.18 ? 'disc'
      : Math.random() < 0.3 ? 'bar'
        : 'rect';
  const r = kind === 'spot' ? m * 0.018 : m * (0.14 + Math.random() * 0.3) * scale;
  // Printed rather than painted: opaque and hard-edged. Two fifths of the
  // sheet is this, and the accent always is -- it is a spot of pure colour
  // and a wash would take the point out of it.
  const solid = kind === 'spot' || Math.random() < 0.45;
  s.forms.push({
    kind,
    x,
    y,
    r,
    w: kind === 'bar' ? r * (2 + Math.random() * 2) : r * (1.2 + Math.random()),
    h: kind === 'bar' ? r * 0.16 : r * (1.2 + Math.random()),
    turn: Math.random() < 0.5 ? 0 : 1,
    color: color || (Math.random() < 0.45
      ? (paper.pale ? paper.ink : paper.card)
      : paper.sheets[(Math.random() * paper.sheets.length) | 0]),
    solid: solid,
    wet: !solid && Math.random() < api.param('wash'),
    age: 0,
  });
  // The ceiling is the parameter, but a hard one stands behind it so a flood
  // between two frames cannot outrun the trim in the draw.
  if (s.forms.length > 64) s.forms.splice(0, s.forms.length - 64);
}

/**
 * One piece of the scatter: a tilted slab of colour, or a tilted outline in
 * graphite with a notch cut in one side, gathered towards a band across the
 * middle of the sheet. Colours are the palette's own and overlap with
 * multiply, so a red over a blue is the dark that neither is.
 */
function scatter(api, x, y, color) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  const paper = papers(api);
  const scale = api.param('scale');
  const r = m * (0.05 + Math.random() * 0.1) * scale;
  const outlined = Math.random() < 0.38;
  s.forms.push({
    kind: 'slab',
    x: Math.max(m * 0.04, Math.min(api.w - m * 0.04, x)),
    // Pulled towards the middle band, as the drawing keeps to one.
    y: api.h * 0.5 + (y - api.h * 0.5) * 0.45,
    r,
    w: r * (1 + Math.random() * 1.2),
    h: r * (1 + Math.random() * 1.8),
    tilt: (Math.random() - 0.5) * 0.9,
    notch: outlined && Math.random() < 0.6 ? { side: (Math.random() * 4) | 0, at: 0.2 + Math.random() * 0.5, size: 0.12 + Math.random() * 0.18 } : null,
    color: color || paper.sheets[(Math.random() * paper.sheets.length) | 0] || paper.ink,
    solid: false,
    wet: false,
    outline: outlined,
    age: 0,
  });
  if (s.forms.length > 96) s.forms.splice(0, s.forms.length - 96);
}

/** A slab's corners, tilted about its centre, with its notch if it has one. */
function slabPath(ctx, f, j) {
  const hw = f.w / 2 + j;
  const hh = f.h / 2 + j;
  let pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  if (f.notch) {
    // A step cut into one side: two extra corners, so an outline reads as a
    // piece of paper with a bite taken out rather than a ruled box.
    const n = f.notch;
    const a = pts[n.side];
    const b = pts[(n.side + 1) % 4];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const len = Math.hypot(ux, uy) || 1;
    const nx = -uy / len;
    const ny = ux / len;
    const d = Math.min(f.w, f.h) * n.size;
    const p1 = [a[0] + ux * n.at, a[1] + uy * n.at];
    const p2 = [a[0] + ux * (n.at + 0.25), a[1] + uy * (n.at + 0.25)];
    const cut = [p1, [p1[0] - nx * d, p1[1] - ny * d], [p2[0] - nx * d, p2[1] - ny * d], p2];
    pts = [...pts.slice(0, n.side + 1), ...cut, ...pts.slice(n.side + 1)];
  }
  const c = Math.cos(f.tilt);
  const sn = Math.sin(f.tilt);
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const X = f.x + px * c - py * sn;
    const Y = f.y + px * sn + py * c;
    if (i) ctx.lineTo(X, Y);
    else ctx.moveTo(X, Y);
  });
  ctx.closePath();
}

function outline(ctx, f) {
  slabPath(ctx, f, 0);
  ctx.stroke();
}

/** Draw one plane, its edge nudged by `j` when it is a wash. */
function form(ctx, f, j) {
  if (f.kind === 'slab') {
    slabPath(ctx, f, j);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  if (f.kind === 'disc' || f.kind === 'spot') {
    ctx.arc(f.x, f.y, Math.max(1, f.r + j), 0, TAU);
  } else if (f.kind === 'bar') {
    const w = f.turn ? f.h : f.w;
    const h = f.turn ? f.w : f.h;
    ctx.rect(f.x - w / 2 - j, f.y - h / 2 - j, w + j * 2, h + j * 2);
  } else {
    ctx.rect(f.x - f.w / 2 - j, f.y - f.h / 2 - j, f.w + j * 2, f.h + j * 2);
  }
  ctx.fill();
}

// --- the totem ----------------------------------------------------------------------------

// The five inks of the totem, the same on every ground, as on the sheets it
// follows: pulled a little towards the palette's own colours so it belongs.
const TOTEM_INKS = ['#e0432f', '#2d5fb0', '#efc43f', '#ece2d3', '#222222'];
const TOTEM_WEIGHTS = [0.17, 0.17, 0.16, 0.25, 0.25];

function totemInk(s) {
  let r = Math.random();
  for (let i = 0; i < TOTEM_WEIGHTS.length; i++) {
    r -= TOTEM_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 4;
}

/**
 * The points of one level: its two ends and a few between, sorted across.
 * Some are set straight under a point of the level above, which is what
 * gives the sheets their shared corners and long upright seams.
 */
function levelPoints(cx, half, n, above) {
  const xs = [cx - half, cx + half];
  for (let i = 0; i < n; i++) {
    if (above && Math.random() < 0.45) {
      const x = above[(Math.random() * above.length) | 0];
      if (x > cx - half && x < cx + half) {
        xs.push(x);
        continue;
      }
    }
    xs.push(cx - half + Math.random() * half * 2);
  }
  return xs.sort((a, b) => a - b);
}

/** Stand the figure up: levels down the sheet, each with its ragged width. */
function raiseTotem(api) {
  const s = api.scene;
  const W = api.w;
  const H = api.h;
  const span = H * 0.8;
  const top = (H - span) / 2;
  const n = 9;
  const gaps = [];
  for (let i = 0; i < n; i++) gaps.push(0.7 + Math.random() * 0.6);
  const sum = gaps.reduce((a, v) => a + v, 0);
  const reach = Math.min(W * 0.36, H * 0.26);
  s.levels = [];
  let y = top;
  let cx = W / 2;
  let half = reach * 0.4;
  for (let k = 0; k <= n; k++) {
    // A narrow head and foot, a body that wanders in width and centre, and
    // now and then a level that juts out on one side into a point.
    const edge = k === 0 || k === n;
    half = edge ? reach * (0.15 + Math.random() * 0.45) : Math.max(reach * 0.5, Math.min(reach, half + (Math.random() - 0.5) * reach * 0.5));
    cx = Math.max(W / 2 - reach * 0.3, Math.min(W / 2 + reach * 0.3, cx + (Math.random() - 0.5) * reach * 0.25));
    const above = s.levels.length ? s.levels[s.levels.length - 1].xs : null;
    const xs = levelPoints(cx, half, edge ? (Math.random() * 3) | 0 : 2 + ((Math.random() * 4) | 0), above);
    if (!edge && Math.random() < 0.3) {
      if (Math.random() < 0.5) xs[0] -= reach * (0.2 + Math.random() * 0.3);
      else xs[xs.length - 1] += reach * (0.2 + Math.random() * 0.3);
    }
    s.levels.push({ y, xs, cx, half });
    if (k < n) y += (gaps[k] / sum) * span;
  }
  s.inks = TOTEM_INKS.map((c) => c);
  const pal = api.palette;
  const pulls = [pal.alert, pal.user, pal.anon, null, null];
  s.inks = TOTEM_INKS.map((c, i) => (pulls[i] && /^#/.test(pulls[i]) ? mixColors(c, pulls[i], 0.12) : c));
  s.bands = [];
  for (let k = 0; k < n; k++) s.bands.push(stripOf(s, k, null));
  s.lastAt = 0;
  s.ambient = 0;
}

/**
 * The triangles of one band, between level k and level k+1: walk both edges
 * from left to right and always advance the one whose next point is nearer,
 * which is the strip the sheets are cut as. Colours are kept where the
 * number of triangles has not changed.
 */
function stripOf(s, k, old) {
  const a = s.levels[k];
  const b = s.levels[k + 1];
  const tris = [];
  let i = 0;
  let j = 0;
  while (i < a.xs.length - 1 || j < b.xs.length - 1) {
    const takeA = j >= b.xs.length - 1 || (i < a.xs.length - 1 && a.xs[i + 1] <= b.xs[j + 1]);
    if (takeA) {
      tris.push([[a.xs[i], a.y], [a.xs[i + 1], a.y], [b.xs[j], b.y]]);
      i++;
    } else {
      tris.push([[a.xs[i], a.y], [b.xs[j], b.y], [b.xs[j + 1], b.y]]);
      j++;
    }
  }
  const inks = tris.map((_, t) => {
    if (old && old.inks.length === tris.length) return old.inks[t];
    return totemInk(s);
  });
  // No two neighbours in one ink: the sheet reads as cut pieces only if the
  // cuts can be seen.
  for (let t = 1; t < inks.length; t++) if (inks[t] === inks[t - 1]) inks[t] = (inks[t] + 1 + ((Math.random() * 3) | 0)) % 5;
  return { tris, inks };
}

function insideTri(px, py, [[x1, y1], [x2, y2], [x3, y3]]) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** An event on the totem: one triangle, one band, or a band cut again. */
function recutTotem(api, x, y, q) {
  const s = api.scene;
  // The band at that height, whether or not the event fell on the figure.
  let k = s.bands.length - 1;
  for (let i = 0; i < s.bands.length; i++) {
    if (y < s.levels[i + 1].y) {
      k = i;
      break;
    }
  }
  const band = s.bands[k];
  if (q < 0.4) {
    let t = band.tris.findIndex((tri) => insideTri(x, y, tri));
    if (t < 0) {
      // Off the figure: the nearest triangle of the band, by its centre.
      let best = Infinity;
      band.tris.forEach((tri, i) => {
        const d = Math.abs((tri[0][0] + tri[1][0] + tri[2][0]) / 3 - x);
        if (d < best) {
          best = d;
          t = i;
        }
      });
    }
    if (t >= 0) band.inks[t] = (band.inks[t] + 1 + ((Math.random() * 4) | 0)) % 5;
  } else if (q < 0.75) {
    band.inks = band.inks.map(() => totemInk(s));
  } else {
    // The band's lower edge cut again, so the figure changes shape there
    // and the band below follows it.
    const lv = s.levels[k + 1];
    const last = k + 1 === s.levels.length - 1;
    lv.xs = levelPoints(lv.cx, lv.half * (0.8 + Math.random() * 0.4), last ? (Math.random() * 3) | 0 : 2 + ((Math.random() * 4) | 0), s.levels[k].xs);
    if (!last && Math.random() < 0.35) lv.xs[Math.random() < 0.5 ? 0 : lv.xs.length - 1] += (Math.random() < 0.5 ? -1 : 1) * lv.half * 0.4;
    lv.xs.sort((a, b) => a - b);
    s.bands[k] = stripOf(s, k, null);
    if (k + 1 < s.bands.length) s.bands[k + 1] = stripOf(s, k + 1, null);
  }
  s.lastAt = api.now;
}

function drawTotem(ctx, api) {
  const s = api.scene;
  if (!s.bands) return;
  // A triangle re-coloured now and then in silence, after a pause.
  ambient(s, api, 2600, () => {
    const band = s.bands[(Math.random() * s.bands.length) | 0];
    const t = (Math.random() * band.inks.length) | 0;
    band.inks[t] = (band.inks[t] + 1 + ((Math.random() * 4) | 0)) % 5;
  });
  ctx.fillStyle = api.palette.background;
  ctx.fillRect(0, 0, api.w, api.h);
  for (const band of s.bands) {
    band.tris.forEach((tri, t) => {
      ctx.fillStyle = s.inks[band.inks[t]];
      // Stroked in its own colour too, a hair wide, so neighbours meet
      // without the hairline of ground antialiasing leaves between them.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(tri[0][0], tri[0][1]);
      ctx.lineTo(tri[1][0], tri[1][1]);
      ctx.lineTo(tri[2][0], tri[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }
}

// --- the stairs ---------------------------------------------------------------------------

/** The inks of the stairs: the palette's warm and slate ones, and its cool one now and then. */
function stairInk(api, given) {
  if (given && Math.random() < 0.3) return given;
  const pal = api.palette;
  if (pal.alert && Math.random() < api.param('cool')) return pal.alert;
  const warm = [pal.user, pal.anon, pal.bot, pal.default].filter(Boolean);
  return warm[(Math.random() * warm.length) | 0];
}

/** One bar of a layout, at step k: where it lies, which way it runs. */
function stairGeometry(s, k) {
  const S = s.S;
  const N = s.N;
  const th = s.th;
  const r = Math.random;
  if (s.layout === 0) {
    // A drift up the diagonal: bars of random length centred on a line from
    // the bottom left to the top right, with a jitter either side.
    const t = k / (N - 1);
    const len = S * (0.24 + r() * 0.24);
    const cx = S * (0.14 + t * 0.72) + (r() - 0.5) * S * 0.2;
    const x = Math.max(0, Math.min(S - len, cx - len / 2));
    const y = S - th * 1.25 - k * th * 0.82;
    // A short solid block now and then, as the sheets set at the joins.
    if (r() < 0.2) return { x: Math.min(S - th * 1.5, Math.max(0, cx + len / 2 - th * 0.75)), y, w: th * 1.5, h: th * 1.25, dir: 'h', block: true };
    return { x, y, w: len, h: th * 1.25, dir: 'h' };
  }
  if (s.layout === 1) {
    // Two flights meeting at a corner: rows from the left, shortening as
    // they go down, and columns from the foot, rising as they go right.
    const gap = s.gap;
    if (k < N) {
      const len = Math.max(th, S - k * th - gap);
      return { x: 0, y: k * th, w: len, h: th, dir: 'h' };
    }
    const j = k - N;
    const tall = Math.max(th, (j + 1) * th - gap);
    return { x: j * th, y: S - tall, w: th, h: tall, dir: 'v' };
  }
  if (s.layout === 2) {
    // A slope: rows set flush right, each longer than the one above, and a
    // little deeper than its step so neighbours overlap into a darker seam.
    const len = S * ((k + 1) / N);
    return { x: S - len, y: k * th, w: len, h: th * 1.18, dir: 'h' };
  }
  // Split: rows either side of a gap down the middle, their reach shaped
  // by a diamond so the whole stands as a lozenge once turned.
  const half = k < N ? -1 : 1;
  const i = k % N;
  const env = 1 - Math.abs((2 * i) / (N - 1) - 1);
  const len = S * 0.5 * Math.max(0.1, env * (0.55 + r() * 0.5));
  const mid = S / 2;
  const g = S * 0.012;
  return half < 0
    ? { x: mid - g - len, y: i * th, w: len, h: th, dir: 'h' }
    : { x: mid + g, y: i * th, w: len, h: th, dir: 'h' };
}

function stairBar(api, s, k, color) {
  const geo = stairGeometry(s, k);
  return {
    ...geo,
    k,
    kind: geo.block || Math.random() < 0.28 ? 'veil' : 'lines',
    color: stairInk(api, color),
    born: api.now,
  };
}

function layStairs(api) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  s.layout = Math.max(0, Math.min(3, Math.round(api.param('layout'))));
  s.S = m * (s.layout === 3 ? 0.78 : 0.82);
  s.N = s.layout === 0 ? 24 : s.layout === 1 ? 22 : s.layout === 2 ? 20 : 15;
  s.th = s.S / (s.layout === 0 ? 21 : s.N);
  s.gap = Math.random() < 0.5 ? 0 : s.th * 0.6;
  s.ox = (api.w - s.S) / 2;
  s.oy = (api.h - s.S) / 2;
  // Which way round: the sheets are the same layout mirrored and turned.
  s.fx = Math.random() < 0.5 ? 1 : -1;
  s.fy = s.layout === 0 || s.layout === 3 ? 1 : Math.random() < 0.5 ? 1 : -1;
  const count = s.layout === 1 || s.layout === 3 ? s.N * 2 : s.N;
  s.bars = [];
  for (let k = 0; k < count; k++) {
    const b = stairBar(api, s, k, null);
    b.born = -1e9;
    s.bars.push(b);
  }
  s.pitch = Math.max(2.2, s.S * 0.0045);
  s.lastAt = 0;
  s.ambient = 0;
}

/** Where a point of the canvas falls in the stairs' own frame. */
function toStairs(s, x, y) {
  let u = x - s.ox - s.S / 2;
  let v = y - s.oy - s.S / 2;
  if (s.layout === 3) {
    const c = Math.SQRT1_2;
    const ru = u * c + v * c;
    const rv = -u * c + v * c;
    u = ru;
    v = rv;
  }
  return [u * s.fx + s.S / 2, v * s.fy + s.S / 2];
}

/** An event: the step nearest it laid again, or a run of steps for a large one. */
function stepStairs(api, x, y, q, color) {
  const s = api.scene;
  const [u, v] = toStairs(s, x, y);
  let best = 0;
  let d = Infinity;
  s.bars.forEach((b, i) => {
    const dx = u < b.x ? b.x - u : u > b.x + b.w ? u - b.x - b.w : 0;
    const dy = v < b.y ? b.y - v : v > b.y + b.h ? v - b.y - b.h : 0;
    const e = dx * dx + dy * dy;
    if (e < d) {
      d = e;
      best = i;
    }
  });
  const run = q > 0.65 ? 3 + ((Math.random() * 3) | 0) : 1;
  for (let n = 0; n < run; n++) {
    const i = (best + n) % s.bars.length;
    const old = s.bars[i];
    const fresh = stairBar(api, s, old.k, n === 0 ? color : null);
    // A small event keeps the step where it is and only re-inks it; the
    // layout's own randomness moves it only when the event is large.
    if (q < 0.35) Object.assign(fresh, { x: old.x, y: old.y, w: old.w, h: old.h, dir: old.dir });
    s.bars[i] = fresh;
  }
  s.lastAt = api.now;
}

function drawStairs(ctx, api) {
  const s = api.scene;
  if (!s.bars) return;
  // A whole bar is a lot of the sheet, so the quiet hand is slow.
  ambient(s, api, 4500, () => {
    const b = s.bars[(Math.random() * s.bars.length) | 0];
    b.color = stairInk(api, null);
    b.born = api.now;
  });
  const paper = papers(api);
  ctx.fillStyle = api.palette.background;
  ctx.fillRect(0, 0, api.w, api.h);
  ctx.save();
  ctx.translate(s.ox + s.S / 2, s.oy + s.S / 2);
  if (s.layout === 3) ctx.rotate(-Math.PI / 4);
  ctx.scale(s.fx, s.fy);
  ctx.translate(-s.S / 2, -s.S / 2);
  ctx.globalCompositeOperation = paper.pale ? 'multiply' : 'screen';
  const pitch = s.pitch;
  const hair = Math.max(0.6, pitch * 0.3);
  for (const b of s.bars) {
    const arrive = Math.min(1, (api.now - b.born) / 450);
    if (b.kind === 'veil') {
      ctx.globalAlpha = 0.55 * arrive;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      continue;
    }
    // Ruled across the bar's length: upright lines in a lying bar, level
    // ones in a standing bar, fine enough that a bar reads as a tint.
    ctx.globalAlpha = 0.8 * arrive;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = hair;
    ctx.beginPath();
    if (b.dir === 'h') {
      for (let x = b.x + pitch / 2; x < b.x + b.w; x += pitch) {
        ctx.moveTo(x, b.y);
        ctx.lineTo(x, b.y + b.h);
      }
    } else {
      for (let y = b.y + pitch / 2; y < b.y + b.h; y += pitch) {
        ctx.moveTo(b.x, y);
        ctx.lineTo(b.x + b.w, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// --- the sheets ---------------------------------------------------------------------------

/**
 * The colour a sheet is cut from. An event brings its own kind's colour from
 * the palette, flat, so the picture is a census of the feed: the commonest
 * kind is the charcoal that carries the sheet, the rare ones its accents.
 */
function sheetColour(s, api, p) {
  if (Math.random() < 0.24) return s.paper;
  const pal = api.palette;
  // The commonest kind lays the charcoal; the rarer kinds their own colour,
  // half the time, and charcoal otherwise -- so the accents stay accents
  // even when the kinds arrive in equal numbers, and a real feed, where one
  // kind dominates, comes out mostly dark with a few colours.
  if (p && p.category && p.category !== 'user' && pal[p.category] && Math.random() < 0.5) return pal[p.category];
  if (p) return s.dark;
  return Math.random() < 0.8 ? s.dark : [pal.anon, pal.bot, pal.alert, pal.default][(Math.random() * 4) | 0] || s.dark;
}

/** A rectangle's outline, cut: points along each side nudged a hair in and out. */
function cutOutline(x, y, w, h, wander, step) {
  const pts = [];
  const side = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(y1 - y0) / (len || 1);
    const ny = (x1 - x0) / (len || 1);
    const phase = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const o = wander ? (Math.sin(phase + t * 9) * 0.6 + (Math.random() - 0.5) * 0.8) * wander : 0;
      pts.push(x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o);
    }
  };
  side(x, y, x + w, y);
  side(x + w, y, x + w, y + h);
  side(x + w, y + h, x, y + h);
  side(x, y + h, x, y);
  return pts;
}

/** A sheet of a size drawn from a few kinds: strip, block, slab, now and then a very large one. */
function sheetOf(s, api, cx, cy, q, colour) {
  const mod = s.mod;
  const r = Math.random();
  let w;
  let h;
  if (r < 0.25) {
    // A strip: long and thin, lying or standing.
    w = mod * (6 + Math.random() * 14);
    h = mod * (0.4 + Math.random() * 1.6);
  } else if (r < 0.85) {
    w = mod * (3 + Math.random() * 7);
    h = mod * (3 + Math.random() * 7);
  } else {
    w = mod * (9 + Math.random() * 10);
    h = mod * (7 + Math.random() * 9);
  }
  // A colour is a smaller piece than the charcoal it punctuates.
  const accent = colour !== s.dark && colour !== s.paper;
  const grow = (0.6 + q * 1.1) * (accent ? 0.55 : 1);
  w *= grow;
  h *= grow;
  if (r < 0.25 && Math.random() < 0.5) [w, h] = [h, w];
  // On the module, so neighbouring sheets share their edges as the sheets do.
  const snap = (v) => Math.round(v / mod) * mod;
  w = Math.max(mod * 0.4, snap(w));
  h = Math.max(mod * 0.4, snap(h));
  const x = snap(cx - w / 2);
  const y = snap(cy - h / 2);
  const turn = s.scatter > 0 && Math.random() < s.scatter ? (Math.random() - 0.5) * 1.2 : 0;
  return {
    pts: cutOutline(x, y, w, h, s.wander, Math.max(6, mod * 0.9)),
    cx: x + w / 2,
    cy: y + h / 2,
    turn,
    colour,
  };
}

/** Where a point of the canvas falls in the turned frame the sheets are laid in. */
function toSheetFrame(s, x, y) {
  const dx = x - s.ox;
  const dy = y - s.oy;
  const c = Math.cos(-s.angle);
  const n = Math.sin(-s.angle);
  return [s.ox + dx * c - dy * n, s.oy + dx * n + dy * c];
}

function laySheets(api) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  const pal = api.palette;
  const darkGround = Math.round(api.param('dark')) === 1;
  s.dark = darkGround ? pal.background : pal.user || pal.default;
  s.paper = darkGround ? pal.user || pal.default : pal.background;
  s.ground = darkGround ? pal.user || pal.default : pal.background;
  // The dark ground is the charcoal itself; the paper laid on it is the
  // palette's ground colour. Swapped, the same collage reads as its negative.
  if (darkGround) {
    s.ground = pal.user || pal.default;
    s.dark = pal.background;
  }
  s.mod = m / 34;
  const tilt = (api.param('tilt') * Math.PI) / 180;
  s.angle = (Math.random() < 0.5 ? -1 : 1) * tilt;
  s.scatter = api.param('scatter');
  s.wander = api.param('edge') * m * 0.0035;
  s.ox = api.w / 2;
  s.oy = api.h / 2;
  s.sheets = [];
  const reach = Math.hypot(api.w, api.h) / 2;
  for (let i = 0; i < 46; i++) {
    const cx = s.ox + (Math.random() - 0.5) * reach * 2;
    const cy = s.oy + (Math.random() - 0.5) * reach * 2;
    s.sheets.push(sheetOf(s, api, cx, cy, Math.random() * 0.8, sheetColour(s, api, null)));
  }
  s.dirty = true;
  s.lastAt = 0;
  s.ambient = 0;
}

function dropSheet(api, x, y, q, p) {
  const s = api.scene;
  const [fx, fy] = toSheetFrame(s, x, y);
  s.sheets.push(sheetOf(s, api, fx, fy, q, sheetColour(s, api, p)));
  const most = Math.max(30, Math.min(140, Math.floor((api.budget || 800) / 3)));
  if (s.sheets.length > most) s.sheets.splice(0, s.sheets.length - most);
  s.dirty = true;
  s.lastAt = api.now;
}

function drawSheets(ctx, api) {
  const s = api.scene;
  if (!s.sheets) return;
  ambient(s, api, 4000, () => {
    const [fx, fy] = [s.ox + (Math.random() - 0.5) * api.w, s.oy + (Math.random() - 0.5) * api.h];
    s.sheets.push(sheetOf(s, api, fx, fy, 0, Math.random() < 0.5 ? s.paper : s.dark));
    if (s.sheets.length > 140) s.sheets.shift();
    s.dirty = true;
  });
  const buf = scratch(api, 'buf');
  const b = s.bufCtx;
  if (s.dirty) {
    b.save();
    b.fillStyle = s.ground;
    b.fillRect(0, 0, api.w, api.h);
    b.translate(s.ox, s.oy);
    b.rotate(s.angle);
    b.translate(-s.ox, -s.oy);
    for (const sh of s.sheets) {
      b.save();
      if (sh.turn) {
        b.translate(sh.cx, sh.cy);
        b.rotate(sh.turn);
        b.translate(-sh.cx, -sh.cy);
      }
      b.fillStyle = sh.colour;
      b.beginPath();
      for (let i = 0; i < sh.pts.length; i += 2) {
        if (i) b.lineTo(sh.pts[i], sh.pts[i + 1]);
        else b.moveTo(sh.pts[i], sh.pts[i + 1]);
      }
      b.closePath();
      b.fill();
      b.restore();
    }
    b.restore();
    s.dirty = false;
  }
  ctx.drawImage(buf, 0, 0);
}