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
import { lightnessOf, lighten, mixColors } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'alert', 'default'];

/**
 * The papers on the table.
 *
 * The palette's categories, plus the two the palette always implies: the
 * ground itself, and something close to black -- or to white on a dark
 * ground. A collage of this kind is mostly those two, with the colours used
 * sparingly, and getting that ratio right is most of the look.
 */
export function papers(api) {
  const bg = api.palette.background;
  const pale = lightnessOf(bg) > 0.5;
  const sheets = [];
  for (const role of ROLES) {
    const c = api.palette[role];
    if (c) sheets.push(c);
  }
  const ink = pale ? mixColors(api.palette.text || '#111', '#000000', 0.45) : '#0e0e0e';
  const card = pale ? lighten(bg, 0.06) : mixColors(bg, '#f2ece0', 0.9);
  // Weighted: the two neutrals carry the picture, the colours punctuate it.
  return { sheets, ink, card, pale };
}

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
    note: 'Shapes cut out of coloured paper with a blade and butted up against one another until there is no ground left showing. Everything is flat -- no shadow, no edge, no depth of any kind -- so the picture holds together by how the pieces pack rather than by what is in front of what, and a face or a bird appears now and then out of nothing more than a half disc landing above two dots. Every event cuts one more piece and lays it down over whatever was there, which means the picture is the whole history of the cutting and the oldest of it is buried.',
    how: 'Every cut is aligned to a module, so pieces meet exactly and the mosaic never shows a seam of ground. A piece is a flat field of one colour, and on better than half of them a second shape -- half disc, quarter, wedge, stem -- is cut into the same box in another. The two neutrals of the palette carry most of the area and the categories punctuate it, which is the ratio the thing is built on. Struck onto a buffer and never redrawn.',
    preview: { frames: 220, dt: 45 },
    params: {
      scale: { label: 'Size of a piece', min: 0.5, max: 2.4, step: 0.05, default: 1, rebuild: true },
      colour: { label: 'How much colour against the neutrals', min: 0, max: 1, step: 0.02, default: 0.4 },
      faces: { label: 'How often an eye', min: 0, max: 1, step: 0.02, default: 0.22 },
      wear: { label: 'Wear on the paper', min: 0, max: 1, step: 0.02, default: 0.35 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.module = Math.max(8, (m / 11) * api.param('scale'));
      s.cols = Math.max(2, Math.ceil(api.w / s.module));
      s.rows = Math.max(2, Math.ceil(api.h / s.module));
      s.cleared = false;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.module || !s.bufCtx) return;
      lay(api, Math.floor(p.x / s.module), Math.floor(p.y / s.module), p.color);
    },
    frame(ctx, api) {
      const s = api.scene;
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
      s.ambient += api.dt;
      const every = 110;
      while (s.ambient > every) {
        s.ambient -= every;
        lay(api, (Math.random() * s.cols) | 0, (Math.random() * s.rows) | 0, null);
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- planes -----------------------------------------------------------------------------
  planes: {
    label: 'Planes',
    note: 'Half a dozen very large shapes at a time, laid over one another on a sheet of paper, and every one of them transparent. Where two cross, the colour belongs to neither: a black wash over a green disc is a green nobody mixed, and most of what you see in this picture is that. A few forms are hard-edged and printed; the rest are wet, and their edges have run. Each event brings one more plane in and pushes the oldest out, so the composition is never still and never crowded.',
    how: 'A bounded pool of forms, redrawn whole every frame -- affordable precisely because there are so few -- and combined with multiply on a pale ground or screen on a dark one, which is how transparent pigment behaves and what makes the crossings their own colours. A wash is the same form struck four or five times at a low opacity with its edges nudged, which is cheaper than a blur and looks more like water.',
    positional: true,
    preview: { frames: 160, dt: 50 },
    params: {
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
      // A sheet with something already on it: four planes, so the first frame
      // of this scene is a composition and not an empty page.
      for (let i = 0; i < 4; i++) {
        add(api, api.w * (0.3 + Math.random() * 0.4), api.h * (0.3 + Math.random() * 0.4), null, false);
        s.forms[i].age = 1200;
      }
    },
    event(p, api) {
      const s = api.scene;
      if (!s.forms) return;
      s.quiet = Math.max(0, (s.quiet || 0) - 0.3);
      s.focus.x = s.focus.x * 0.7 + p.x * 0.3;
      s.focus.y = s.focus.y * 0.7 + p.y * 0.3;
      add(api, p.x, p.y, p.color, p.accent);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.forms) return;
      const paper = papers(api);
      const cap = Math.max(2, Math.round(api.param('count')));
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
        const alpha = veil * arrived * (0.4 + 0.6 * standing);
        ctx.fillStyle = f.color;
        ctx.strokeStyle = f.color;
        if (f.wet) {
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

/** Draw one plane, its edge nudged by `j` when it is a wash. */
function form(ctx, f, j) {
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
