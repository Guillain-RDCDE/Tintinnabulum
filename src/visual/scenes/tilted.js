// Two pictures on the tilt.
//
//   tilted   tiles   a floor of square tiles, every one a flat colour, the
//                    whole floor turned through an angle and, if asked, bent
//                    as though laid on a very large arc, with a white joint
//                    between the tiles or none
//            boards  long boards laid one over another at nearly the same
//                    angle, or fanned, until no ground is left, now and then
//                    one edged in another colour
//
// Both cover the sheet entirely: there is no ground to see, only the colours
// and, on the floor, the joints. The colours are four or five inks from a set
// of colourways, the way the prints they come from were made, or the
// palette's own. They are the scene's because the prints put a cream, a
// yellow or a pale grey beside white, and a palette may not carry marks that
// close to its ground.
//
// House rules as everywhere: both are printed once onto a buffer and only
// what changes is drawn again -- a tile re-coloured, a board laid on top --
// and a picture that works when nothing arrives works slowly.

import { scratch } from './paint.js';
import { TAU, sizeOf, ambient, clampTo } from './shared.js';
import { sheets } from './sheets.js';

/** The colourways the prints were made in; the first is the palette's own. */
const WAYS = [
  null,
  { name: 'harbour', inks: ['#fa831e', '#e14d2a', '#3e6d9c', '#021152'] },
  { name: 'sunday', inks: ['#fce5b4', '#fca502', '#204790', '#3a5ba0'] },
  { name: 'primary', inks: ['#225095', '#f9c803', '#dc0302', '#fcfcfc'] },
  { name: 'carmine', inks: ['#c70239', '#f37121', '#fcbd69', '#111d5e'] },
  { name: 'petrol', inks: ['#042839', '#074663', '#06324a', '#ebb264'] },
  { name: 'lagoon', inks: ['#eb6440', '#497174', '#d6e4e5', '#eff5f5'] },
  { name: 'graphite', inks: ['#020202', '#313131', '#4d4d4d', '#b3b3b3', '#fcfcfc'] },
];
const WAY_NAMES = WAYS.map((w) => (w ? w.name : 'palette'));
const JOINT = '#ffffff';
const TURN = 300;

const between = (a, b) => a + Math.random() * (b - a);

/** The inks, and the colour the joints are cut in. */
function inksOf(api) {
  const way = WAYS[clampTo(Math.round(api.param('colours')), 0, WAYS.length - 1)];
  if (way) return { inks: way.inks, joint: JOINT };
  const pal = api.palette;
  return { inks: [pal.user, pal.anon, pal.bot, pal.alert].filter(Boolean), joint: pal.background };
}

/** An ink index unlike `not`. */
function another(n, not) {
  if (n < 2) return 0;
  const k = (Math.random() * (n - 1)) | 0;
  return k >= not ? k + 1 : k;
}

/** The ink an event brings: its own kind's, in turn through the inks. */
const KINDS = ['user', 'anon', 'bot', 'alert'];
function inkOfEvent(s, p, not) {
  const k = KINDS.indexOf(p.category);
  const i = k < 0 ? (Math.random() * s.inks.length) | 0 : k % s.inks.length;
  return i === not ? another(s.inks.length, not) : i;
}

// --- the floor -------------------------------------------------------------------------

/**
 * Where a point of the floor lies on the sheet: (u, v) in tiles from the
 * middle. Straight, the floor is a grid turned through the angle; bent, the
 * rows become arcs round a centre far off to one side and the columns rays
 * from it, which is a floor laid on a very large circle.
 */
function floorAt(s, u, v) {
  if (!s.R) return [s.cx + (u * s.e1x + v * s.e2x) * s.c, s.cy + (u * s.e1y + v * s.e2y) * s.c];
  const r = s.R - v * s.c;
  const a = s.a0 + (u * s.c) / s.R;
  return [s.ox + Math.cos(a) * r, s.oy + Math.sin(a) * r];
}

function layFloor(api) {
  const s = api.scene;
  const W = api.w;
  const H = api.h;
  Object.assign(s, inksOf(api));
  s.c = Math.max(W, H) / Math.max(2, Math.round(api.param('tiles')));
  const th = (api.param('angle') * Math.PI) / 180;
  s.e1x = Math.cos(th);
  s.e1y = Math.sin(th);
  s.e2x = -Math.sin(th);
  s.e2y = Math.cos(th);
  s.cx = W / 2;
  s.cy = H / 2;
  const bend = api.param('bend');
  // A bend of nothing is a straight floor; a full bend lays it on a circle
  // a sheet and a half across.
  s.R = bend > 0.01 ? Math.max(W, H) * (0.75 + 6 * (1 - bend) * (1 - bend)) : 0;
  if (s.R) {
    s.ox = s.cx + s.e2x * s.R;
    s.oy = s.cy + s.e2y * s.R;
    s.a0 = Math.atan2(-s.e2y, -s.e2x);
  }
  s.shrink = 1 - api.param('joint') * 0.06;
  const n = Math.ceil(Math.hypot(W, H) / s.c / 2) + 3;
  const span = s.R ? n + 4 : n;
  s.tiles = [];
  const at = new Map();
  for (let v = -span; v <= span; v++) {
    for (let u = -span; u <= span; u++) {
      const corners = [floorAt(s, u - 0.5, v - 0.5), floorAt(s, u + 0.5, v - 0.5), floorAt(s, u + 0.5, v + 0.5), floorAt(s, u - 0.5, v + 0.5)];
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      if (Math.max(...xs) < 0 || Math.min(...xs) > W || Math.max(...ys) < 0 || Math.min(...ys) > H) continue;
      // Neighbours often share a colour, so the floor has runs and blocks
      // in it rather than a confetti of single tiles.
      const left = at.get(`${u - 1},${v}`);
      const up = at.get(`${u},${v - 1}`);
      const r = Math.random();
      const ink = left && r < 0.2 ? left.ink : up && r < 0.36 ? up.ink : (Math.random() * s.inks.length) | 0;
      const t = { u, v, corners, cx: xs.reduce((a, b) => a + b) / 4, cy: ys.reduce((a, b) => a + b) / 4, ink };
      at.set(`${u},${v}`, t);
      s.tiles.push(t);
    }
  }
  s.byKey = at;
  s.turning = [];
  s.drawn = false;
  s.lastAt = 0;
  s.ambient = 0;
}

/**
 * One tile, shrunk about its middle by the joint. With `reach` below one, only
 * the part of it from one edge along its row that far across: a new colour
 * sliding over the old, which never shows the joint through a tile.
 */
function tilePath(g, s, t, reach = 1) {
  g.beginPath();
  t.corners.forEach(([x, y], i) => {
    let dx = (x - t.cx) * s.shrink;
    let dy = (y - t.cy) * s.shrink;
    if (reach < 1) {
      // Along the row, from the leading edge: corners on the trailing side
      // are pulled back to where the colour has reached.
      const along = dx * s.e1x + dy * s.e1y;
      if (along > 0) {
        const pull = along * (1 - reach) * 2;
        dx -= pull * s.e1x;
        dy -= pull * s.e1y;
      }
    }
    if (i === 0) g.moveTo(t.cx + dx, t.cy + dy);
    else g.lineTo(t.cx + dx, t.cy + dy);
  });
  g.closePath();
}

function paintTile(g, s, t) {
  // The same shape as the tile it replaces, so the joints round it are untouched.
  g.fillStyle = s.inks[t.ink];
  tilePath(g, s, t);
  g.fill();
}

function nearestTile(s, x, y) {
  let best = null;
  let d = Infinity;
  for (const t of s.tiles) {
    const e = (t.cx - x) ** 2 + (t.cy - y) ** 2;
    if (e < d) { d = e; best = t; }
  }
  return best;
}

function turnTile(api, t, ink, delay = 0) {
  const s = api.scene;
  if (!t) return;
  s.turning.push({ t, born: api.now + delay });
  t.ink = ink;
}

function strikeFloor(p, api) {
  const s = api.scene;
  if (!s.tiles) return;
  s.lastAt = api.now;
  const t = nearestTile(s, p.x, p.y);
  if (!t) return;
  const q = sizeOf(p, api);
  const ink = inkOfEvent(s, p, t.ink);
  if (q >= 0.78) {
    // A row turns, tile after tile along it, outward from the one struck.
    for (const o of s.tiles) if (o.v === t.v) turnTile(api, o, o === t ? ink : another(s.inks.length, o.ink), Math.abs(o.u - t.u) * 45);
  } else if (q >= 0.45) {
    // A block: two by two, or three by three round the tile for a larger one.
    const lo = q >= 0.6 ? -1 : 0;
    for (let dv = lo; dv <= 1; dv++) {
      for (let du = lo; du <= 1; du++) {
        const o = s.byKey.get(`${t.u + du},${t.v + dv}`);
        if (o) turnTile(api, o, ink, (Math.abs(du) + Math.abs(dv)) * 60);
      }
    }
  } else {
    turnTile(api, t, ink);
  }
  if (s.turning.length > 400) s.turning.splice(0, s.turning.length - 400);
}

function drawFloor(ctx, api) {
  const s = api.scene;
  if (!s.tiles) return;
  const buf = scratch(api, 'tiltbuf');
  const g = s.tiltbufCtx;
  if (!s.drawn) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = s.joint;
    g.fillRect(0, 0, buf.width, buf.height);
    for (const t of s.tiles) {
      g.fillStyle = s.inks[t.ink];
      tilePath(g, s, t);
      g.fill();
    }
    s.drawn = true;
  }
  ambient(s, api, 5000, () => {
    const t = s.tiles[(Math.random() * s.tiles.length) | 0];
    turnTile(api, t, another(s.inks.length, t.ink));
  });
  // A tile that has finished turning is laid into the floor for good.
  const live = [];
  for (const f of s.turning) {
    if (api.now - f.born >= TURN) paintTile(g, s, f.t);
    else live.push(f);
  }
  s.turning = live;
  ctx.drawImage(buf, 0, 0, api.w, api.h);
  // One being re-coloured: the old colour still in the buffer, the new one
  // sliding across it along the row.
  for (const f of live) {
    const k = (api.now - f.born) / TURN;
    if (k <= 0) continue;
    ctx.fillStyle = s.inks[f.t.ink];
    tilePath(ctx, s, f.t, 1 - (1 - k) * (1 - k));
    ctx.fill();
  }
}

// --- the boards ------------------------------------------------------------------------

/** A board's angle at a place: the sheet's angle, fanned across the sheet if asked, and a little off true. */
function boardAngle(s, x, y) {
  const across = ((x - s.W / 2) * s.e2x + (y - s.H / 2) * s.e2y) / Math.max(s.W, s.H);
  return s.th + s.fan * across * 1.2 + (Math.random() - 0.5) * 0.05;
}

function boardOf(s, x, y, ink, scale = 1) {
  const D = Math.max(s.W, s.H);
  return {
    x, y, ink,
    a: boardAngle(s, x, y),
    len: between(0.3, 1.25) * D * scale,
    wid: between(0.03, 0.17) * D * s.breadth * Math.sqrt(scale),
    // Now and then a board is edged in another colour, a hairline inside it.
    edge: Math.random() < s.edge ? another(s.inks.length, ink) : -1,
    from: Math.random() < 0.5 ? -1 : 1,
  };
}

function boardPath(g, b, grow = 1) {
  const ca = Math.cos(b.a);
  const sa = Math.sin(b.a);
  // Grown from one end: the far end of a board being laid is still travelling.
  const l0 = b.from < 0 ? -b.len / 2 : b.len / 2 - b.len * grow;
  const l1 = l0 + b.len * grow;
  const w = b.wid / 2;
  g.beginPath();
  g.moveTo(b.x + ca * l0 - sa * w, b.y + sa * l0 + ca * w);
  g.lineTo(b.x + ca * l1 - sa * w, b.y + sa * l1 + ca * w);
  g.lineTo(b.x + ca * l1 + sa * w, b.y + sa * l1 - ca * w);
  g.lineTo(b.x + ca * l0 + sa * w, b.y + sa * l0 - ca * w);
  g.closePath();
}

function paintBoard(g, s, b, grow = 1) {
  g.fillStyle = s.inks[b.ink];
  boardPath(g, b, grow);
  g.fill();
  if (b.edge >= 0) {
    g.save();
    g.clip();
    g.strokeStyle = s.inks[b.edge];
    g.lineWidth = Math.max(1, Math.max(s.W, s.H) * 0.003);
    g.stroke();
    g.restore();
  }
}

function layBoards(api) {
  const s = api.scene;
  s.W = api.w;
  s.H = api.h;
  Object.assign(s, inksOf(api));
  s.th = (api.param('angle') * Math.PI) / 180;
  s.e2x = -Math.sin(s.th);
  s.e2y = Math.cos(s.th);
  s.fan = api.param('fan');
  s.edge = api.param('edge');
  s.breadth = api.param('breadth');
  s.base = (Math.random() * s.inks.length) | 0;
  s.boards = [];
  let last = s.base;
  const n = Math.round(api.param('boards'));
  for (let i = 0; i < n; i++) {
    // Spread over the sheet and a little past it, so boards run off the edges.
    const x = between(-0.15, 1.15) * s.W;
    const y = between(-0.1, 1.1) * s.H;
    const b = boardOf(s, x, y, another(s.inks.length, last));
    last = b.ink;
    s.boards.push(b);
  }
  s.laying = [];
  s.drawn = false;
  s.lastAt = 0;
  s.ambient = 0;
}

function strikeBoards(p, api) {
  const s = api.scene;
  if (!s.boards) return;
  s.lastAt = api.now;
  const q = sizeOf(p, api);
  const last = s.laying.length ? s.laying[s.laying.length - 1].b.ink : -1;
  const b = boardOf(s, p.x, p.y, inkOfEvent(s, p, last), 0.25 + q * 0.9);
  s.laying.push({ b, born: api.now });
  if (s.laying.length > 120) {
    // A flood: what would be laid at once is laid now, and only the last few travel.
    const done = s.laying.splice(0, s.laying.length - 120);
    for (const f of done) paintBoard(s.tiltbufCtx, s, f.b);
  }
}

function drawBoards(ctx, api) {
  const s = api.scene;
  if (!s.boards) return;
  const buf = scratch(api, 'tiltbuf');
  const g = s.tiltbufCtx;
  if (!s.drawn) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = s.inks[s.base];
    g.fillRect(0, 0, buf.width, buf.height);
    for (const b of s.boards) paintBoard(g, s, b);
    s.drawn = true;
  }
  ambient(s, api, 6000, () => {
    const b = boardOf(s, between(0, 1) * s.W, between(0, 1) * s.H, (Math.random() * s.inks.length) | 0, 0.6);
    s.laying.push({ b, born: api.now });
  });
  // Laid boards go into the buffer for good: the pile is the history.
  const live = [];
  for (const f of s.laying) {
    if (api.now - f.born >= TURN + 50) paintBoard(g, s, f.b);
    else live.push(f);
  }
  s.laying = live;
  ctx.drawImage(buf, 0, 0, api.w, api.h);
  for (const f of live) {
    const k = clampTo((api.now - f.born) / (TURN + 50), 0, 1);
    paintBoard(ctx, s, f.b, 1 - (1 - k) * (1 - k));
  }
}

export const TILTED_SCENES = {
  tilted: sheets({
    label: 'On the tilt',
    note: 'Two pictures that cover the whole sheet and lean. The first is a floor of square tiles, each a flat colour from four or five, the whole floor turned through an angle and, if asked, bent as though laid on a very large arc, so the rows curve and the tiles open into wedges; a white joint between them, or none. Every event slides another colour across the tile it falls on, a middling one across a small block of them, a large one along a whole row, tile after tile outward. The second sheet is boards: long flat boards laid one over another at nearly the same angle, or fanned across the sheet, until no ground is left, now and then one edged in a hairline of another colour. Every event lays a new board where it lands, longer and broader the larger it is, sliding in from one end; the pile is never cleared, so the sheet is the history of the feed. The colours are a set of colourways, the way the prints were made, or the palette\'s own.',
    positional: true,
    preview: { frames: 30, dt: 60 },
    params: {
      colours: { label: 'Colourway', options: WAY_NAMES, min: 0, max: WAY_NAMES.length - 1, step: 1, default: 0, rebuild: true },
      angle: { label: 'How far it leans', min: -90, max: 90, step: 1, default: -28, rebuild: true },
    },
    list: [
      {
        name: 'tiles',
        how: 'The floor is a map from tile coordinates to the sheet: a turned grid, or, bent, rows on arcs round a centre far off to one side and columns on rays from it. Every tile is its four mapped corners, shrunk about its middle by the joint, printed once onto a buffer; a new colour slides across a tile along its row over the old one, and is printed in when it covers it.',
        params: {
          tiles: { label: 'Tiles across', min: 3, max: 30, step: 1, default: 10, rebuild: true },
          bend: { label: 'How much the floor bends', min: 0, max: 1, step: 0.02, default: 0.3, rebuild: true },
          joint: { label: 'How wide the joints are', min: 0, max: 1, step: 0.02, default: 0.4, rebuild: true },
        },
        init: layFloor,
        event: strikeFloor,
        frame: drawFloor,
      },
      {
        name: 'boards',
        how: 'A pile of rectangles at the sheet\'s angle, each a little off true, or turned more the further across the sheet it lies, laid onto a buffer over a ground of one of the inks and never taken up. A new board is drawn over the buffer growing from one end and printed in when it is down.',
        params: {
          boards: { label: 'How many boards to begin with', min: 8, max: 90, step: 1, default: 34, rebuild: true },
          fan: { label: 'How much they fan', min: 0, max: 1, step: 0.02, default: 0, rebuild: true },
          edge: { label: 'How many are edged', min: 0, max: 1, step: 0.02, default: 0.15, rebuild: true },
          breadth: { label: 'How broad', min: 0.4, max: 2, step: 0.05, default: 1, rebuild: true },
        },
        init: layBoards,
        event: strikeBoards,
        frame: drawBoards,
      },
    ],
  }),
};
