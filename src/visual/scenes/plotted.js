// Three pictures a machine put down on paper.
//
//   orbs     discs filled with ruled or crossed hatching, in a black pen and a
//            red one, hung on a construction grid or over a horizon of reeds
//            and water
//   tartan   a sheet woven of columns and rows of unequal width, every cell
//            taking its treatment from the column and the row it lies in, and
//            some of them punched through with a disc
//   peals    rings struck in a cloud of dots, dense at the centre and thinning
//            outwards, the way a bell's note spreads and is lost
//
// What they share is the pen: nothing here is painted, everything is a line or
// a dot of one ink, and the tone of a passage is how close the lines or dots
// were put. An event decides where the pen goes and how much it lays down, and
// with nothing arriving the pen is almost still.
//
// House rules as everywhere: what accumulates is struck once onto a buffer from
// the renderer's pool, the strokes are queued and struck a few at a time so a
// burst is a queue and not a spike, and the sheet is washed back only as events
// arrive, so a silent minute leaves it as it was.

import { scratch, toRgb } from './paint.js';
import { papers } from './papers.js';
import { lighten } from '../color.js';

const TAU = Math.PI * 2;

/** A small deterministic generator, so a mark belongs to its event for good. */
function seeded(n) {
  let s = (n >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
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

/**
 * The second pen: the reddest colour the palette carries, if it carries one
 * worth the name, and otherwise the first ink again. The drawings these are
 * modelled on are black and vermilion, and a palette without a red should
 * give a sheet in one ink rather than a red it does not have.
 */
function redOf(api) {
  let best = null;
  let most = 50;
  for (const role of ['user', 'anon', 'bot', 'alert', 'default']) {
    const c = api.palette[role];
    if (!c) continue;
    const [r, g, b] = toRgb(c);
    const lead = r - Math.max(g, b);
    if (lead > most) {
      most = lead;
      best = c;
    }
  }
  return best || inkOf(api);
}

/**
 * Where the tone of the piece sits, 0 low to 1 high: the centre of mass of
 * the spectrum when something is sounding, and otherwise the event's own
 * number, so the same event always answers the same way.
 */
function toneOf(p, api) {
  const sp = api.sound && api.sound.spectrum;
  if (sp && sp.length > 16) {
    let sum = 0;
    let mass = 0;
    const top = Math.min(sp.length, 256);
    for (let i = 1; i < top; i++) {
      sum += sp[i] * i;
      mass += sp[i];
    }
    if (mass > top * 4) return Math.max(0, Math.min(1, (sum / mass) / (top * 0.35)));
  }
  return p.pick === undefined ? Math.random() : p.pick;
}

/** Queue one job within the renderer's budget; the oldest go first. */
function enqueue(s, api, job) {
  s.queue.push(job);
  const most = Math.max(60, Math.min(1200, api.budget || 800));
  if (s.queue.length > most) s.queue.splice(0, s.queue.length - most);
}

/** Strike queued jobs onto the buffer, up to a budget a frame. */
function drain(s, b, budget) {
  while (s.queue.length && budget-- > 0) {
    const job = s.queue.shift();
    job(b);
  }
}

function clampTo(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- the pen ------------------------------------------------------------------------------

/**
 * One line as a plotter draws it on soft paper: not ruled but nearly, the
 * nib wandering a hair either side. `shake` is a window of the waveform when
 * the piece is sounding, so the line trembles with the note that drew it.
 */
function penLine(b, x0, y0, x1, y1, wander, rnd, shake) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(2, Math.min(60, Math.round(len / 7)));
  const p1 = rnd() * TAU;
  const p2 = rnd() * TAU;
  const f1 = 1.5 + rnd() * 3;
  const f2 = 6 + rnd() * 9;
  b.moveTo(x0, y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    let off = (Math.sin(p1 + t * f1) * 0.7 + Math.sin(p2 + t * f2) * 0.3) * wander;
    if (shake) off += shake[(i * 5) % shake.length] * wander * 2.2;
    // Pinned at the ends a little, the way a pen lands and lifts.
    const pin = Math.min(1, t * 6, (1 - t) * 6 + 0.35);
    b.lineTo(x0 + dx * t + nx * off * pin, y0 + dy * t + ny * off * pin);
  }
}

/** A short window of the waveform, centred on zero, or null in silence. */
function shakeOf(api, listen) {
  const wave = listen > 0 && api.sound && api.sound.wave;
  if (!wave || wave.length < 64) return null;
  const out = new Float32Array(48);
  const start = Math.floor(Math.random() * (wave.length - 49));
  let peak = 0;
  for (let i = 0; i < 48; i++) {
    out[i] = (wave[start + i] - 128) / 128;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  if (peak < 0.02) return null;
  for (let i = 0; i < 48; i++) out[i] = (out[i] / peak) * listen;
  return out;
}

/**
 * A disc of hatching: ruled lines across it, and crossed lines too when
 * `cross` is set. The ends of the lines are where the circle is, give or take
 * a nib, rather than clipped to it, which is what gives the plotted edge its
 * slight fray. `side` keeps only the part to one side of a vertical line, for
 * the half discs that hang off a construction line.
 */
function hatchDisc(b, cx, cy, r, { pitch, hair, wander, cross, color, side, rnd, shake }) {
  b.save();
  b.strokeStyle = color;
  b.lineWidth = hair;
  b.lineCap = 'round';
  b.globalAlpha = 0.9;
  b.beginPath();
  const fray = pitch * 0.35;
  const n = Math.floor((r * 2) / pitch);
  const lead = cy - r + (r * 2 - n * pitch) / 2 + pitch / 2;
  for (let i = 0; i < n; i++) {
    const y = lead + i * pitch;
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
    if (half < pitch * 0.4) continue;
    let x0 = cx - half + (rnd() - 0.5) * fray * 2;
    let x1 = cx + half + (rnd() - 0.5) * fray * 2;
    if (side) {
      if (side.dir > 0) x0 = Math.max(x0, side.x);
      else x1 = Math.min(x1, side.x);
      if (x1 - x0 < pitch) continue;
    }
    penLine(b, x0, y, x1, y, wander, rnd, shake);
  }
  if (cross) {
    const lead2 = cx - r + (r * 2 - n * pitch) / 2 + pitch / 2;
    for (let i = 0; i < n; i++) {
      const x = lead2 + i * pitch;
      if (side && (side.dir > 0 ? x < side.x : x > side.x)) continue;
      const half = Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));
      if (half < pitch * 0.4) continue;
      const y0 = cy - half + (rnd() - 0.5) * fray * 2;
      const y1 = cy + half + (rnd() - 0.5) * fray * 2;
      penLine(b, x, y0, x, y1, wander, rnd, shake);
    }
  }
  b.stroke();
  b.restore();
}

/**
 * A hexagon of upright strokes with a crossed core, flat at top and bottom
 * and pointed at the sides: the one heavy figure of the horizon sheet.
 */
function hatchHexagon(b, cx, cy, R, { pitch, hair, wander, color, rnd, shake }) {
  b.save();
  b.strokeStyle = color;
  b.lineWidth = hair;
  b.lineCap = 'round';
  b.globalAlpha = 0.9;
  b.beginPath();
  const s3 = Math.sqrt(3);
  const fray = pitch * 0.6;
  for (let x = cx - R + pitch * 0.5; x < cx + R; x += pitch) {
    const dx = Math.abs(x - cx);
    const half = dx <= R / 2 ? (R * s3) / 2 : s3 * (R - dx);
    if (half < pitch) continue;
    penLine(b, x, cy - half + (rnd() - 0.5) * fray, x, cy + half + (rnd() - 0.5) * fray, wander, rnd, shake);
  }
  b.stroke();
  // The core: the same hexagon smaller, crossed on its two diagonals.
  const r = R * 0.72;
  b.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (k) b.lineTo(x, y);
    else b.moveTo(x, y);
  }
  b.closePath();
  b.clip();
  b.beginPath();
  const step = pitch * 1.1;
  for (const lean of [1, -1]) {
    for (let t = -r * 2; t < r * 2; t += step) {
      penLine(b, cx + t - r * lean, cy - r, cx + t + r * lean, cy + r, wander, rnd, shake);
    }
  }
  b.stroke();
  b.restore();
}

// --- the tartan ---------------------------------------------------------------------------

/** Widths for a run of stripes: wide ones, with a thin one now and then between. */
function stripes(total, count, thinChance, firstTall) {
  const parts = [];
  let lastThin = true;
  for (let i = 0; i < count; i++) {
    let w;
    if (!lastThin && Math.random() < thinChance) {
      w = 0.18 + Math.random() * 0.08;
      lastThin = true;
    } else {
      w = 0.7 + Math.random() * 1.1;
      if (firstTall && i === 0) w = 2.6 + Math.random() * 1.6;
      lastThin = false;
    }
    parts.push(w);
  }
  const sum = parts.reduce((a, v) => a + v, 0);
  return parts.map((v) => (v / sum) * total);
}

/** A column's or a row's own treatment, for the cut sheet. */
function threadCut(axis) {
  const pick = Math.random();
  if (axis === 'col') {
    return {
      diag: Math.random() < 0.85,
      steep: pick < 0.3,
      solid: pick > 0.9,
    };
  }
  return {
    horiz: pick < 0.32,
    fine: pick > 0.32 && pick < 0.42,
    solid: pick > 0.93,
  };
}

/** A column's or a row's own treatment, for the ruled sheet. */
function threadRuled(sheets, ink) {
  const pick = Math.random();
  const kind = pick < 0.5 ? 'blank' : pick < 0.74 ? 'flat' : pick < 0.87 ? 'black' : 'stripes';
  const color = sheets.length ? sheets[(Math.random() * sheets.length) | 0] : ink;
  return { kind, color, vertical: Math.random() < 0.5 };
}

/** Parallel lines at angle `a` across a box, struck as one path. */
function ruleBox(b, x, y, w, h, a, pitch, width, color) {
  b.save();
  b.beginPath();
  b.rect(x, y, w, h);
  b.clip();
  b.strokeStyle = color;
  b.lineWidth = width;
  b.lineCap = 'butt';
  b.beginPath();
  const cx = x + w / 2;
  const cy = y + h / 2;
  const reach = Math.hypot(w, h) / 2 + pitch;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const nx = -uy;
  const ny = ux;
  for (let t = -reach; t <= reach; t += pitch) {
    const px = cx + nx * t;
    const py = cy + ny * t;
    b.moveTo(px - ux * reach, py - uy * reach);
    b.lineTo(px + ux * reach, py + uy * reach);
  }
  b.stroke();
  b.restore();
}

/** What a cell of the cut sheet is: the crossing of its column and its row. */
function treatCut(cell, col, row) {
  if (cell.override) return cell.override;
  if (col.solid || row.solid) return { solid: true };
  const lines = [];
  if (col.diag || (!col.steep && !row.horiz && !row.fine)) lines.push('diag');
  if (col.steep) lines.push('steep');
  if (row.horiz) lines.push('horiz');
  if (row.fine) lines.push('fine');
  return { lines };
}

/** What a cell of the ruled sheet is: two threads crossing, as in a weave. */
function treatRuled(cell, col, row) {
  if (cell.override) return cell.override;
  const a = col;
  const c = row;
  if (a.kind === 'blank') return c;
  if (c.kind === 'blank') return a;
  if (a.kind === 'stripes' && c.kind !== 'stripes') return { ...a, under: c };
  if (c.kind === 'stripes' && a.kind !== 'stripes') return { ...c, under: a };
  if (a.kind === 'flat' && c.kind === 'flat') return a.color === c.color ? a : { kind: 'black' };
  // Black crossing anything is black; two stripes cross as the column.
  return a.kind === 'black' || c.kind === 'black' ? { kind: 'black' } : a;
}

function strikeCut(b, cell, s, api) {
  const col = s.cols[cell.c];
  const row = s.rows[cell.r];
  const t = treatCut(cell, col, row);
  const pitch = s.pitch;
  const ink = cell.ink || s.ink;
  b.save();
  b.fillStyle = api.palette.background;
  b.fillRect(cell.x - 0.5, cell.y - 0.5, cell.w + 1, cell.h + 1);
  if (t.solid) {
    b.fillStyle = ink;
    b.fillRect(cell.x, cell.y, cell.w, cell.h);
  } else {
    for (const kind of t.lines) {
      if (kind === 'diag') ruleBox(b, cell.x, cell.y, cell.w, cell.h, Math.PI / 4, pitch, pitch * 0.4, ink);
      else if (kind === 'steep') ruleBox(b, cell.x, cell.y, cell.w, cell.h, Math.PI * 0.4, pitch * 1.45, pitch * 0.42, ink);
      else if (kind === 'horiz') ruleBox(b, cell.x, cell.y, cell.w, cell.h, 0, pitch * 1.25, pitch * 0.42, ink);
      else ruleBox(b, cell.x, cell.y, cell.w, cell.h, 0, pitch * 0.55, pitch * 0.2, ink);
    }
  }
  if (cell.hole > 0) {
    const r = Math.max(1.5, Math.min(cell.w, cell.h) * 0.5 * cell.hole);
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h * cell.hy;
    b.beginPath();
    b.arc(cx, cy, r, 0, TAU);
    b.fillStyle = api.palette.background;
    b.fill();
    b.strokeStyle = s.ink;
    b.lineWidth = Math.max(0.8, pitch * 0.38);
    b.stroke();
  }
  b.restore();
}

function strikeRuled(b, cell, s, api) {
  const col = s.cols[cell.c];
  const row = s.rows[cell.r];
  const t = treatRuled(cell, col, row);
  b.save();
  b.fillStyle = api.palette.background;
  b.fillRect(cell.x, cell.y, cell.w, cell.h);
  const fill = (k) => {
    if (!k) return;
    if (k.kind === 'flat') {
      b.fillStyle = k.color;
      b.fillRect(cell.x, cell.y, cell.w, cell.h);
    } else if (k.kind === 'black') {
      b.fillStyle = s.ink;
      b.fillRect(cell.x, cell.y, cell.w, cell.h);
    }
  };
  if (t.kind === 'stripes') {
    fill(t.under);
    const dark = t.under && t.under.kind === 'black';
    ruleBox(b, cell.x, cell.y, cell.w, cell.h, t.vertical ? Math.PI / 2 : 0, s.pitch * 0.62, s.hair, dark ? t.color : s.ink);
  } else {
    fill(t);
  }
  if (cell.hole > 0) {
    const r = Math.max(1.2, Math.min(cell.w, cell.h) * 0.3 * cell.hole);
    b.beginPath();
    b.arc(cell.x + cell.w / 2, cell.y + cell.h * cell.hy, r, 0, TAU);
    b.fillStyle = cell.dot || s.ink;
    b.fill();
    b.strokeStyle = s.ink;
    b.lineWidth = s.hair;
    b.stroke();
  }
  b.restore();
  // The ruling again where it crosses this cell, so a re-struck cell keeps it.
  b.save();
  b.beginPath();
  b.rect(cell.x - 1, cell.y - 1, cell.w + 2, cell.h + 2);
  b.clip();
  rulings(b, s);
  b.restore();
}

/** The lines of the ruled sheet, run past the grid by a different amount each. */
function rulings(b, s) {
  b.strokeStyle = s.ink;
  b.lineWidth = s.hair;
  b.beginPath();
  for (const l of s.lines) {
    b.moveTo(l.x0, l.y0);
    b.lineTo(l.x1, l.y1);
  }
  b.stroke();
}

// --- the quilt ----------------------------------------------------------------------------

/**
 * A patch of the quilt: one of the palette's colours, pushed a little lighter
 * or darker so no two patches of one colour match, or now and then white
 * with a few black dots on it, like a domino.
 */
function patchOf(s, color) {
  if (!color && Math.random() < 0.08) return { kind: 'domino', dots: 1 + ((Math.random() * 3) | 0) };
  const base = color || s.quiltInks[(Math.random() * s.quiltInks.length) | 0];
  return { kind: 'patch', color: lighten(base, (Math.random() - 0.55) * 0.16), seed: Math.floor(Math.random() * 1e9) };
}

/** One patch, mottled as dyed cloth is, so a flat colour has a weather in it. */
function strikeQuilt(b, cell, s) {
  const t = cell.override || patchOf(s, null);
  cell.override = t;
  b.save();
  b.beginPath();
  b.rect(cell.x, cell.y, cell.w, cell.h);
  b.clip();
  if (t.kind === 'domino') {
    b.fillStyle = s.card;
    b.fillRect(cell.x, cell.y, cell.w, cell.h);
    b.fillStyle = s.ink;
    const r = Math.max(1.5, Math.min(cell.w, cell.h) * 0.08);
    for (let i = 0; i < t.dots; i++) {
      b.beginPath();
      b.arc(cell.x + cell.w * (0.3 + 0.4 * ((i * 0.618) % 1)), cell.y + cell.h * ((i + 1) / (t.dots + 1)), r, 0, TAU);
      b.fill();
    }
  } else {
    b.fillStyle = t.color;
    b.fillRect(cell.x, cell.y, cell.w, cell.h);
    const rnd = seeded(t.seed);
    const reach = Math.max(cell.w, cell.h);
    for (let i = 0; i < 7; i++) {
      b.globalAlpha = 0.08 + rnd() * 0.1;
      b.fillStyle = lighten(t.color, rnd() < 0.5 ? 0.12 : -0.12);
      b.beginPath();
      b.ellipse(cell.x + rnd() * cell.w, cell.y + rnd() * cell.h, reach * (0.15 + rnd() * 0.35), reach * (0.08 + rnd() * 0.2), rnd() * Math.PI, 0, TAU);
      b.fill();
    }
    b.globalAlpha = 1;
  }
  b.restore();
}

/**
 * A wire: a black line run along a row or down a column for a cell or three,
 * with a short spur or two off it, every free end a round dot.
 */
function wire(s, api, x, y, q) {
  const m = Math.min(api.w, api.h);
  const across = Math.random() < 0.5;
  const len = m * (0.06 + q * 0.18);
  const dir = Math.random() < 0.5 ? -1 : 1;
  // Kept on the quilt: a wire that ran off the edge would hang in the air.
  const lo = s.margin;
  const hiX = api.w - s.margin;
  const hiY = api.h - s.margin;
  const w = { x, y, x1: across ? clampTo(x + len * dir, lo, hiX) : x, y1: across ? y : clampTo(y + len * dir, lo, hiY), spurs: [] };
  const n = 1 + ((Math.random() * 2.5) | 0);
  for (let i = 0; i < n; i++) {
    const t = 0.2 + Math.random() * 0.7;
    const sl = m * (0.025 + Math.random() * 0.04) * (Math.random() < 0.5 ? -1 : 1);
    w.spurs.push({ t, len: sl });
  }
  s.wires.push(w);
  const most = Math.max(8, Math.min(20, Math.floor((api.budget || 800) / 6)));
  if (s.wires.length > most) s.wires.splice(0, s.wires.length - most);
}

/** The wires, over the patches, redrawn each frame -- there are never many. */
function wires(ctx, s, api) {
  const m = Math.min(api.w, api.h);
  const lw = Math.max(1, m * 0.0035);
  const dot = lw * 2.2;
  ctx.save();
  ctx.strokeStyle = s.ink;
  ctx.fillStyle = s.ink;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const ends = [];
  ctx.beginPath();
  for (const w of s.wires) {
    ctx.moveTo(w.x, w.y);
    ctx.lineTo(w.x1, w.y1);
    ends.push([w.x, w.y], [w.x1, w.y1]);
    const across = w.y1 === w.y;
    for (const sp of w.spurs) {
      const px = w.x + (w.x1 - w.x) * sp.t;
      const py = w.y + (w.y1 - w.y) * sp.t;
      const ex = across ? px : clampTo(px + sp.len, s.margin, api.w - s.margin);
      const ey = across ? clampTo(py + sp.len, s.margin, api.h - s.margin) : py;
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ends.push([ex, ey]);
    }
  }
  ctx.stroke();
  for (const [x, y] of ends) {
    ctx.beginPath();
    ctx.arc(x, y, dot, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** An event on the quilt: a wire, a patch dyed again, or a whole row or column. */
function requilt(s, api, cell, q, color) {
  const own = Math.random() < Math.max(0.35, api.param('colour')) ? color : null;
  if (q < 0.2) {
    wire(s, api, cell.x + cell.w * (0.2 + Math.random() * 0.6), cell.y + cell.h * (0.2 + Math.random() * 0.6), q);
    return;
  }
  if (q < 0.72) {
    cell.override = patchOf(s, own);
    cell.done = false;
    return;
  }
  const base = own || s.quiltInks[(Math.random() * s.quiltInks.length) | 0];
  const byCol = Math.random() < 0.5;
  for (const c of s.cells) {
    if (byCol ? c.c !== cell.c : c.r !== cell.r) continue;
    if (Math.random() < 0.6) c.override = patchOf(s, base);
    c.done = false;
  }
}

// --- the peals ----------------------------------------------------------------------------

/** Scatter `n` dots of dust over the whole sheet. */
function dust(b, api, n, color) {
  const d = Math.max(1, Math.min(api.w, api.h) * 0.0016);
  b.fillStyle = color;
  b.globalAlpha = 0.55;
  for (let i = 0; i < n; i++) {
    b.fillRect(Math.random() * api.w, Math.random() * api.h, d, d);
  }
  b.globalAlpha = 1;
}

/** Put down up to `n` dots of one peal, by rejection against its ring profile. */
function sow(b, pl, n, d) {
  b.fillStyle = pl.color;
  b.globalAlpha = 0.9;
  const reach = pl.R * 1.25;
  let tries = n * 4;
  let laid = 0;
  while (laid < n && tries-- > 0) {
    // Uniform over the disc, then kept with the probability of the profile.
    const r = reach * Math.sqrt(Math.random());
    const u = r / pl.R;
    if (r < pl.hole) continue;
    const env = Math.exp(-2.4 * u * u);
    const ring = 0.5 + 0.5 * Math.cos(((r - pl.hole) / pl.wave) * TAU);
    const keep = env * (0.03 + 0.97 * ring * ring * ring);
    if (Math.random() > keep) continue;
    const a = Math.random() * TAU;
    b.fillRect(pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r, d, d);
    laid++;
  }
  b.globalAlpha = 1;
  return laid;
}

export const PLOTTED_SCENES = {
  // --- orbs ------------------------------------------------------------------------------
  orbs: {
    label: 'Hatched orbs',
    note: 'Discs drawn by a plotter in two pens, black and vermilion: the black ones ruled with level lines, the red ones crossed into a fine mesh, and where two overlap a third texture that neither pen drew. On the first sheet they hang on a few ruled construction lines, centred on a line or on a crossing, the largest sometimes cut in half by the line it hangs from. On the second they are planets over a horizon of reeds and slow water, with one heavy hexagon in the middle of the sky. Every event is a disc: small ones in red, large ones in black.',
    how: 'A disc is a run of chords, each drawn as a pen line that wanders a hair either side and whose ends fall where the circle is, give or take a nib, instead of being clipped -- that is the fray at the edge of a plotted disc. Crossed discs add the vertical chords. When the piece is sounding, a short window of the waveform is added to the wander, so a disc drawn on a loud note trembles. The construction, or the reeds and the water, is drawn once at the start and again after every wash; the sheet is washed back a little when it has taken enough discs, and never in silence.',
    positional: true,
    preview: { frames: 180, dt: 50 },
    params: {
      figure: { label: 'Which sheet: construction, horizon', min: 0, max: 1, step: 1, default: 0, rebuild: true },
      pitch: { label: 'How close the hatching', min: 0.6, max: 2, step: 0.05, default: 1 },
      tremor: { label: 'How much the pen wanders', min: 0, max: 2, step: 0.05, default: 1 },
      colour: { label: 'How much of the red pen', min: 0, max: 1, step: 0.02, default: 0.6 },
      listen: { label: 'How much the sound shakes the pen', min: 0, max: 1, step: 0.02, default: 0.6 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.figure = Math.max(0, Math.min(1, Math.round(api.param('figure'))));
      s.m = m;
      s.queue = [];
      s.cleared = false;
      s.discs = 0;
      s.lastAt = 0;
      s.ambient = 0;
      if (s.figure === 0) {
        // The proportions of the sheet it is modelled on: three uprights at a
        // quarter, a half and three quarters, two levels at a quarter and
        // three quarters, all running nearly to the edge.
        s.xs = [0.275, 0.5, 0.725].map((f) => api.w * f);
        s.ys = [0.275, 0.725].map((f) => api.h * f);
        s.top = api.h * 0.05;
        s.foot = api.h * 0.95;
        s.left = api.w * 0.05;
        s.right = api.w * 0.95;
      } else {
        s.horizon = api.h * 0.75;
        s.skyTop = api.h * 0.07;
        s.skyFoot = api.h * 0.3;
        // Two layers of reeds, their tops on slow curves of their own.
        s.backPhase = Math.random() * TAU;
        s.frontPhase = Math.random() * TAU;
        s.frontLean = 0.4 + Math.random() * 0.6;
      }
    },
    event(p, api) {
      const s = api.scene;
      if (!s.queue) return;
      placeOrb(s, api, p.x, p.y, sizeOf(p, api), p);
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.queue) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
        construction(b, s, api);
      }
      // A small disc now and then when nothing arrives, and nothing at all
      // while the feed is working.
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 2200) {
          s.ambient = 0;
          placeOrb(s, api, Math.random() * api.w, Math.random() * api.h, 0.04 + Math.random() * 0.08, null);
        }
      } else {
        s.ambient = 0;
      }
      drain(s, b, 3);
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- tartan ----------------------------------------------------------------------------
  tartan: {
    label: 'Woven cells',
    note: 'A sheet woven like cloth from columns and rows of unequal width, wide ones with a thin one between, and every cell the crossing of the two: a column of diagonal ruling crossed by a row of level lines comes out as a mesh, a black stripe crossing anything stays black. On the first sheet the cells are cut apart by narrow gutters and printed in one black on cream, some punched through with a white disc. On the second they are laid edge to edge on lines that run on past the grid, in flat colour, black and fine stripes, with dots set in them. A small event punches a disc, a middling one re-treats its cell, a large one re-dyes a whole column or row.',
    how: 'Column widths and row heights are drawn from a few sizes, never two thin ones together, and normalised to the sheet. Each column and each row carries a treatment of its own -- which line families it adds, or whether it is solid -- and a cell is the union of the two, unless an event has overridden it. The ruled sheet crosses its threads the way a weave does: blank lets the other through, two colours make black, stripes lie over whatever is under them. The quilt is a third sheet: every patch dyed its own colour and mottled like cloth, set in a dark frame with thin dark seams, a few patches white with black dots, and black wires run across it with a round dot at every end. A small event runs a new wire, a middling one dyes a patch again, a large one a row or a column. A cell is struck onto a buffer only when it changes, a few a frame, so a re-dyed column draws itself down the sheet in a fraction of a second.',
    positional: true,
    preview: { frames: 160, dt: 50 },
    params: {
      figure: { label: 'Which sheet: cut, ruled, quilt', min: 0, max: 2, step: 1, default: 0, rebuild: true },
      columns: { label: 'How many columns', min: 4, max: 12, step: 1, default: 7, rebuild: true },
      pitch: { label: 'How close the ruling', min: 0.6, max: 2, step: 0.05, default: 1, rebuild: true },
      holes: { label: 'How many discs', min: 0, max: 1, step: 0.02, default: 0.45 },
      colour: { label: 'How much colour', min: 0, max: 1, step: 0.02, default: 0 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.figure = Math.max(0, Math.min(2, Math.round(api.param('figure'))));
      const ncol = Math.max(3, Math.min(14, Math.round(api.param('columns'))));
      const nrow = Math.max(4, Math.min(16, Math.round((ncol * api.h) / api.w * 1.25)));
      const paper = papers(api);
      s.ink = inkOf(api);
      // Two colours and black, as on the sheets this is modelled on: the
      // whole palette at once is a sampler, not a picture.
      s.sheets = paper.sheets.slice().sort(() => Math.random() - 0.5).slice(0, 2);
      s.pitch = Math.max(2.6, (m * 0.017) / api.param('pitch'));
      s.hair = Math.max(0.6, m * 0.0014);
      // The quilt dyes with every colour the palette has, and a white.
      s.card = paper.card;
      s.quiltInks = paper.sheets.length ? paper.sheets : [s.ink];
      const margin = s.figure === 0 ? m * 0.04 : s.figure === 1 ? m * 0.11 : m * 0.07;
      const gutter = s.figure === 0 ? Math.max(2, m * 0.013) : s.figure === 1 ? 0 : Math.max(1, m * 0.005);
      s.margin = margin;
      const spanW = api.w - margin * 2 - gutter * (ncol - 1);
      const spanH = api.h - margin * 2 - gutter * (nrow - 1);
      const ws = stripes(spanW, ncol, 0.3, false);
      const hs = s.figure === 2 ? stripes(spanH, nrow, 0.2, false) : stripes(spanH, nrow, 0.35, s.figure === 0);
      s.colX = [];
      s.rowY = [];
      let x = margin;
      for (const w of ws) {
        s.colX.push([x, w]);
        x += w + gutter;
      }
      let y = margin;
      for (const h of hs) {
        s.rowY.push([y, h]);
        y += h + gutter;
      }
      const hole = api.param('holes');
      s.cols = ws.map(() => (s.figure === 0 ? threadCut('col') : threadRuled(s.sheets, s.ink)));
      s.rows = hs.map(() => (s.figure === 0 ? threadCut('row') : threadRuled(s.sheets, s.ink)));
      s.wires = [];
      s.cells = [];
      for (let r = 0; r < nrow; r++) {
        for (let c = 0; c < ncol; c++) {
          const [cx, cw] = s.colX[c];
          const [cy, ch] = s.rowY[r];
          s.cells.push({
            c, r, x: cx, y: cy, w: cw, h: ch,
            override: null, ink: null, dot: null,
            hole: Math.random() < hole * 0.3 ? (s.figure === 0 ? 0.35 + Math.random() * 0.5 : 0.15 + Math.random() * 0.3) : 0,
            hy: 0.5,
            done: false,
          });
        }
      }
      // The ruled sheet's lines: every edge of the grid, run on past it by
      // its own amount at each end, and a few that stop short.
      s.lines = [];
      if (s.figure === 1) {
        const x0 = margin;
        const x1 = api.w - margin;
        const y0 = margin;
        const y1 = api.h - margin;
        const over = () => Math.random() * margin * 0.9;
        const edgesX = [x0, ...s.colX.map(([cx, cw]) => cx + cw)];
        const edgesY = [y0, ...s.rowY.map(([cy, ch]) => cy + ch)];
        for (const ex of edgesX) s.lines.push({ x0: ex, y0: y0 - over(), x1: ex, y1: y1 + over() });
        for (const ey of edgesY) s.lines.push({ x0: x0 - over(), y0: ey, x1: x1 + over(), y1: ey });
        for (let i = 0; i < 4; i++) {
          const ey = y0 + Math.random() * (y1 - y0);
          s.lines.push({ x0: x0 - over(), y0: ey, x1: x0 + (x1 - x0) * (0.3 + Math.random() * 0.7), y1: ey });
        }
      }
      if (s.figure === 2) {
        // The quilt: every patch its own colour, a few of them white with
        // dots, and a dozen wires already run across it.
        for (const cell of s.cells) {
          cell.hole = 0;
          cell.override = patchOf(s, null);
        }
        for (let i = 0; i < 12; i++) {
          const cell = s.cells[(Math.random() * s.cells.length) | 0];
          wire(s, api, cell.x + Math.random() * cell.w, cell.y + Math.random() * cell.h, 0.4);
        }
      }
      s.cleared = false;
      s.lastAt = 0;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.cells) return;
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
      reweave(s, api, cell, sizeOf(p, api), p.color);
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
        if (s.figure === 1) rulings(b, s);
        if (s.figure === 2) {
          // The quilt's own dark ground, a frame round it and the seams.
          b.fillStyle = s.ink;
          const fr = s.margin * 0.35;
          b.fillRect(s.margin - fr, s.margin - fr, api.w - (s.margin - fr) * 2, api.h - (s.margin - fr) * 2);
        }
        s.cleared = true;
      }
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 1900) {
          s.ambient = 0;
          const cell = s.cells[(Math.random() * s.cells.length) | 0];
          if (s.figure === 2) cell.override = patchOf(s, null);
          else cell.hole = cell.hole > 0 ? 0 : 0.3 + Math.random() * 0.4;
          cell.done = false;
        }
      } else {
        s.ambient = 0;
      }
      // A few cells a frame: a re-dyed column is a dozen cells and shows as
      // a stroke running down the sheet rather than a spike.
      let budget = 4;
      for (const cell of s.cells) {
        if (cell.done) continue;
        if (s.figure === 0) strikeCut(b, cell, s, api);
        else if (s.figure === 1) strikeRuled(b, cell, s, api);
        else strikeQuilt(b, cell, s);
        cell.done = true;
        if (--budget <= 0) break;
      }
      ctx.drawImage(buf, 0, 0);
      if (s.figure === 2) wires(ctx, s, api);
    },
  },

  // --- peals -----------------------------------------------------------------------------
  peals: {
    label: 'Stippled peals',
    note: 'Bells struck in a cloud of dots. Every event is a peal: a disc of red grain, dense in rings round a bright point at its centre and thinning outwards until it is only dust on the paper, as a note spreads and is lost. A high note rings in close rings, a low one in wide ones; a small event is a small peal, a large one fills a corner of the sheet, and where two overlap the rings run through each other. The whole sheet is dusted with the same grain, and it fades back a little with every peal, so the old ones are always under the new.',
    how: 'A peal is laid down over about a second and a half, a few thousand dots a frame, each placed uniformly in the disc and kept with the probability of a profile: a Gaussian fall-off times a squared cosine in the radius, with a hole at the centre. The ring spacing is the spectral centroid of the sound at the moment the event arrives, or the event\'s own number in silence. Every peal washes the buffer back by a few percent before it begins, and nothing else does, so a sheet left in silence keeps what it has.',
    positional: true,
    preview: { frames: 160, dt: 50 },
    params: {
      rings: { label: 'How close the rings', min: 0.5, max: 2, step: 0.05, default: 1 },
      spread: { label: 'How large a peal', min: 0.5, max: 2, step: 0.05, default: 1 },
      grain: { label: 'How much dust on the sheet', min: 0, max: 1, step: 0.02, default: 0.4 },
      memory: { label: 'How long the sheet remembers', min: 0, max: 1, step: 0.02, default: 0.6 },
      colour: { label: 'How much colour from the event', min: 0, max: 1, step: 0.02, default: 0 },
    },
    init(api) {
      const s = api.scene;
      s.peals = [];
      s.cleared = false;
      s.lastAt = 0;
      s.ambient = 0;
      s.ink = redOf(api);
      s.dot = Math.max(1, Math.min(api.w, api.h) * 0.0016);
    },
    event(p, api) {
      const s = api.scene;
      if (!s.peals) return;
      strikePeal(s, api, p.x, p.y, sizeOf(p, api), toneOf(p, api), Math.random() < api.param('colour') ? p.color : s.ink, 1);
      s.lastAt = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.peals) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        dust(b, api, Math.round(api.w * api.h * 0.012 * api.param('grain')), s.ink);
        s.cleared = true;
      }
      if (api.now - s.lastAt > 2500) {
        s.ambient += api.dt;
        if (s.ambient > 2600) {
          s.ambient = 0;
          strikePeal(s, api, Math.random() * api.w, Math.random() * api.h, 0.05, Math.random(), s.ink, 0.35);
        }
      } else {
        s.ambient = 0;
      }
      // The washes first, then the dots: a peal is always over the fade it
      // brought with it.
      for (const pl of s.peals) {
        if (pl.wash > 0) {
          b.globalAlpha = pl.wash;
          b.fillStyle = api.palette.background;
          b.fillRect(0, 0, api.w, api.h);
          b.globalAlpha = 1;
          dust(b, api, pl.dust, s.ink);
          pl.wash = 0;
        }
      }
      // Each peal lays down a share of what it has left, so it comes in fast
      // and tails away; a ceiling a frame across all of them keeps a burst a
      // queue and not a spike.
      let room = 20000;
      for (let i = 0; i < s.peals.length && room > 0; i++) {
        const pl = s.peals[i];
        const n = Math.min(room, pl.left, Math.max(60, Math.ceil(pl.left * Math.min(1, api.dt / 420))));
        sow(b, pl, n, s.dot);
        pl.left -= n;
        room -= n;
      }
      for (let i = s.peals.length - 1; i >= 0; i--) if (s.peals[i].left <= 0) s.peals.splice(i, 1);
      ctx.drawImage(buf, 0, 0);
    },
  },
};

// --- placing --------------------------------------------------------------------------------

/** The construction or the horizon, drawn onto a fresh or washed sheet. */
function construction(b, s, api) {
  const ink = inkOf(api);
  const rnd = seeded(s.figure === 0 ? 7 : 11);
  const hair = Math.max(0.7, s.m * 0.0016);
  const wander = Math.max(0.3, s.m * 0.0009) * api.param('tremor');
  b.save();
  b.strokeStyle = ink;
  b.lineCap = 'round';
  if (s.figure === 0) {
    b.lineWidth = hair * 1.4;
    b.beginPath();
    for (const x of s.xs) penLine(b, x, s.top, x, s.foot, wander, rnd, null);
    for (const y of s.ys) penLine(b, s.left, y, s.right, y, wander, rnd, null);
    b.stroke();
  } else {
    const m = s.m;
    b.lineWidth = hair;
    b.beginPath();
    // The water: level lines below the horizon, closer and more troubled the
    // nearer they come.
    const below = api.h - s.horizon;
    const count = Math.max(12, Math.round(below / Math.max(3, m * 0.011)));
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const y = s.horizon + below * Math.pow(t, 0.85);
      penLine(b, 0, y, api.w, y, wander * (0.4 + t * 5), rnd, null);
    }
    // The reeds: two layers of upright strokes from the horizon, the back
    // ones taller and sparser, the front ones packed close and rising.
    const pitchBack = Math.max(3, m * 0.0125);
    for (let x = pitchBack * 0.5; x < api.w; x += pitchBack) {
      const u = x / api.w;
      const top = api.h * (0.56 + 0.04 * Math.sin(u * TAU * 0.9 + s.backPhase)) + (rnd() - 0.5) * m * 0.01;
      penLine(b, x, s.horizon, x, top, wander * 1.4, rnd, null);
    }
    const pitchFront = Math.max(2.2, m * 0.0062);
    for (let x = pitchFront * 0.3; x < api.w; x += pitchFront) {
      const u = x / api.w;
      const rise = 0.74 - 0.1 * s.frontLean * u - 0.025 * Math.sin(u * TAU * 1.3 + s.frontPhase);
      const top = api.h * rise + rnd() * m * 0.03;
      if (top < s.horizon - 2) penLine(b, x + (rnd() - 0.5) * pitchFront * 0.4, s.horizon, x, top, wander * 1.2, rnd, null);
    }
    b.stroke();
    b.beginPath();
    b.lineWidth = hair * 1.3;
    penLine(b, 0, s.horizon, api.w, s.horizon, wander * 0.3, rnd, null);
    b.stroke();
    // The hexagon in the middle of the sky, there from the start; large
    // events strike it again until it is nearly solid.
    hatchHexagon(b, api.w * 0.5, api.h * 0.4, m * 0.11, {
      pitch: Math.max(2.2, (m * 0.0085) / api.param('pitch')) * 1.35, hair: hair * 0.9, wander: wander * 1.2, color: ink, rnd, shake: null,
    });
  }
  b.restore();
}

/** Queue the disc, or the hexagon, for an event: its place, its pen, its fill. */
function placeOrb(s, api, x, y, q, p) {
  const m = s.m;
  const ink = inkOf(api);
  const red = redOf(api);
  const hair = Math.max(0.6, m * 0.0012);
  const wander = Math.max(0.25, m * 0.0008) * api.param('tremor');
  const pitchBase = Math.max(2.2, (m * 0.0085) / api.param('pitch'));
  const shake = shakeOf(api, api.param('listen'));
  const seed = Math.floor(Math.random() * 1e9);
  const useRed = Math.random() < api.param('colour');
  // Red from the event when it has its own and the sheet is not two-pen.
  const redPen = p && red === ink ? p.color : red;
  let job;
  if (s.figure === 0) {
    // On an upright, at whatever height; pulled onto a level when it is near.
    let best = s.xs[0];
    for (const lx of s.xs) if (Math.abs(lx - x) < Math.abs(best - x)) best = lx;
    let cy = clampTo(y, s.top + m * 0.05, s.foot - m * 0.05);
    for (const ly of s.ys) if (Math.abs(ly - cy) < api.h * 0.09) cy = ly;
    const cx = best;
    if (q > 0.64) {
      const r = m * (0.09 + q * 0.15);
      const half = Math.random() < 0.4 ? { x: cx, dir: Math.random() < 0.5 ? 1 : -1 } : null;
      const off = half ? 0 : (Math.random() - 0.5) * r * 0.9;
      const pupil = Math.random() < 0.35;
      job = (b) => {
        const rnd = seeded(seed);
        hatchDisc(b, cx + off, cy, r, { pitch: pitchBase * 1.15, hair, wander, cross: false, color: ink, side: half, rnd, shake });
        if (pupil) {
          const pr = r * 0.22;
          hatchDisc(b, cx + off + (rnd() - 0.6) * r * 0.5, cy + pr * 0.4, pr, { pitch: pitchBase * 0.7, hair, wander, cross: true, color: ink, side: null, rnd, shake });
        }
      };
    } else {
      const r = m * (0.02 + q * 0.1);
      const color = useRed ? redPen : ink;
      job = (b) => hatchDisc(b, cx, cy, r, { pitch: pitchBase * 0.85, hair, wander, cross: true, color, side: null, rnd: seeded(seed), shake });
    }
  } else {
    // In the sky, wherever it fell across, at the height it fell scaled into
    // the sky; the heavy ones are hexagons towards the middle.
    const cx = clampTo(x, m * 0.06, api.w - m * 0.06);
    const cy = s.skyTop + (clampTo(y, 0, api.h) / api.h) * (s.skyFoot - s.skyTop);
    if (q > 0.72) {
      const R = m * (0.07 + q * 0.07);
      // Always the same place, the middle of the sky: the one heavy figure,
      // struck again by every large event until it is nearly solid.
      const hx = api.w * 0.5 + (cx - api.w * 0.5) * 0.08;
      const hy = api.h * 0.4;
      job = (b) => hatchHexagon(b, hx, hy, R, { pitch: pitchBase * 1.35, hair: hair * 1.3, wander: wander * 1.3, color: ink, rnd: seeded(seed), shake });
    } else {
      const r = m * (0.012 + q * 0.07);
      const color = useRed || !p ? redPen : ink;
      job = (b) => hatchDisc(b, cx, cy, r, { pitch: pitchBase * 1.5, hair: hair * 1.4, wander: wander * 1.3, cross: true, color, side: null, rnd: seeded(seed), shake });
    }
  }
  // A sheet that has taken enough discs is washed back and drawn again, so
  // it accumulates without ever going black; only events bring that about.
  s.discs++;
  if (s.discs > 16) {
    s.discs = 0;
    enqueue(s, api, (b) => {
      b.globalAlpha = 0.96;
      b.fillStyle = api.palette.background;
      b.fillRect(0, 0, api.w, api.h);
      b.globalAlpha = 1;
      construction(b, s, api);
    });
  }
  enqueue(s, api, job);
}

/** Change the woven sheet for an event: a disc, a cell, or a whole thread. */
function reweave(s, api, cell, q, color) {
  if (s.figure === 2) {
    requilt(s, api, cell, q, color);
    return;
  }
  const tinted = Math.random() < api.param('colour');
  // On the ruled sheet an event speaks in the sheet's own two inks unless
  // the colour dial lets its own through.
  if (s.figure === 1 && !tinted) color = s.sheets.length && Math.random() < 0.75 ? s.sheets[(Math.random() * s.sheets.length) | 0] : s.ink;
  if (q < 0.3) {
    cell.hole = cell.hole > 0 && q < 0.12 ? 0 : 0.25 + q * 2;
    if (s.figure === 1) {
      cell.dot = color;
    }
    cell.hy = 0.5;
    cell.done = false;
    return;
  }
  if (q < 0.7) {
    if (s.figure === 0) {
      const pick = Math.random();
      cell.override = pick < 0.15 ? { solid: true } : { lines: pick < 0.45 ? ['diag', 'horiz'] : pick < 0.7 ? ['diag', 'steep'] : pick < 0.85 ? ['steep'] : ['diag'] };
      cell.ink = tinted ? color : null;
    } else {
      const t = threadRuled(s.sheets, s.ink);
      if (tinted || t.kind === 'blank' || t.kind === 'flat') {
        t.kind = 'flat';
        t.color = color;
      }
      cell.override = t;
    }
    cell.hole = Math.random() < api.param('holes') * 0.6 ? 0.3 + Math.random() * 0.5 : cell.hole;
    cell.done = false;
    return;
  }
  // A whole thread re-dyed: the column or the row the event fell in, and
  // every cell along it struck again with its overrides dropped.
  const byCol = Math.random() < 0.5;
  if (byCol) {
    s.cols[cell.c] = s.figure === 0 ? threadCut('col') : threadRuled(s.sheets, s.ink);
    if (s.figure === 1 && tinted) s.cols[cell.c] = { kind: 'flat', color, vertical: true };
  } else {
    s.rows[cell.r] = s.figure === 0 ? threadCut('row') : threadRuled(s.sheets, s.ink);
    if (s.figure === 1 && tinted) s.rows[cell.r] = { kind: 'flat', color, vertical: false };
  }
  for (const c of s.cells) {
    if (byCol ? c.c !== cell.c : c.r !== cell.r) continue;
    c.override = null;
    c.ink = s.figure === 0 && tinted ? color : null;
    c.done = false;
  }
}

/** Begin a peal: its size, its rings, and the fade it brings with it. */
function strikePeal(s, api, x, y, q, tone, color, weight) {
  const m = Math.min(api.w, api.h);
  const R = m * (0.05 + q * 0.13) * api.param('spread');
  // Higher tones ring closer: five rings across a low peal, twelve across a
  // high one, and the dial on top.
  const count = (5 + tone * 7) * api.param('rings');
  const wave = R / count;
  const area = Math.PI * (R / s.dot) * (R / s.dot);
  const total = Math.round(clampTo(area * 0.5 * weight, 300, 40000));
  const memory = api.param('memory');
  s.peals.push({
    x, y, R, wave,
    hole: wave * 0.3,
    color,
    left: total,
    wash: weight * (0.01 + 0.12 * (1 - memory)) * (0.5 + q),
    dust: Math.round(api.w * api.h * 0.0004 * api.param('grain') * weight),
  });
  if (s.peals.length > 40) s.peals.splice(0, s.peals.length - 40);
}
