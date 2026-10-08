// A sketchbook: drawing done the way a hand does it.
//
//   sketchbook   washes      watercolour laid where events land, in their
//                            colours, mixed with what is under it as paint
//                            mixes, and now and then drawn round in pencil
//                hatching    shapes hatched in graphite, coloured pencil,
//                            charcoal or ink, a large one cross-hatched over
//                            a wash
//                landscape   a sky, a sun, hills washed and hatched and
//                            inked along the ridge; events bring birds,
//                            trees and new hills
//
// Every mark goes through the brush engine in ../brush.js, a port of
// p5.brush to Canvas 2D: pencils are many small soft dots under a pressure
// curve, watercolour is twenty translucent layers of a deformed polygon with
// the paper rubbed through and the rim darkened, and colours are mixed by
// their reflectance spectra, so blue over yellow is green and not grey.
//
// Paint takes time to lay, and a wash costs a frame or more of work, so
// marks are queued and each frame lays a few layers of them. The page turns
// when it is full: the old sheet slides away and a fresh one is under it.
// House rules as everywhere: the sheet is a buffer, only new marks are drawn
// on it, and when nothing arrives a hand adds one small mark now and then.

import { scratch } from './paint.js';
import { TAU, sizeOf, ambient, clampTo } from './shared.js';
import { sheets } from './sheets.js';
import { Paper, circlePoints, rectPoints, hatchLines, drainJobs, spectralMix, packColour } from '../brush.js';
import { lightnessOf } from '../color.js';

const CREAM = '#f6f1e6';
const GRAPHITE = '#2f2c29';
const KINDS = ['user', 'anon', 'bot', 'alert'];
const TURN = 700;
const QUEUE = 12;

const between = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];

// --- the sheet and the queue ----------------------------------------------------------------

/**
 * The paper the sketchbook draws on, fresh. The engine's masks are the size
 * of the sheet, so they are kept with the renderer's buffers and reused, as
 * the buffers are, rather than made again on every rebuild.
 */
function openBook(api) {
  const s = api.scene;
  const cv = scratch(api, 'brushbuf', true);
  const pool = api.buffers;
  let paper = pool && pool.brushPaper;
  if (!paper || paper.cv !== cv || paper.W !== cv.width || paper.H !== cv.height) {
    paper = new Paper(cv, { scale: Math.min(api.w, api.h) / 200 });
    if (pool) pool.brushPaper = paper;
  }
  paper.reset();
  s.paper = paper;
  const pal = api.palette;
  s.sheetColour = lightnessOf(pal.background) >= 0.5 ? pal.background : CREAM;
  s.pigments = KINDS.map((k) => pal[k]).filter(Boolean);
  if (!s.pigments.length) s.pigments = [pal.default];
  s.lead = lightnessOf(pal.text) < 0.35 ? pal.text : GRAPHITE;
  s.W = api.w;
  s.H = api.h;
  s.D = Math.min(api.w, api.h);
  s.U = paper.scale;
  // Steps a frame: a few layers of a wash, or a few lines of hatching, and
  // never more than one mixing-in of a wash.
  s.steps = 6;
  s.jobs = [];
  s.marks = 0;
  s.pages = Math.round(api.param('pages'));
  s.turnedAt = -Infinity;
  s.lastAt = 0;
  s.ambient = 0;
}

/**
 * Queue some work. A burst beyond what can be laid soon lets go of the
 * oldest marks still waiting rather than the newest, so the sheet keeps up
 * with the feed instead of painting what arrived seconds ago; the mark
 * being laid is finished, and a page's opening is never let go.
 */
function queue(s, ...jobs) {
  for (const j of jobs) {
    if (!j) continue;
    if (s.opening) j.keep = true;
    s.jobs.push(j);
  }
  while (s.jobs.length > QUEUE) {
    const k = s.jobs.findIndex((j, i) => i > 0 && !j.keep);
    if (k < 0) break;
    s.jobs.splice(k, 1);
  }
}

/** Lay a few layers of whatever is queued, and mix in the pencil laid so far. */
function work(s) {
  drainJobs(s.jobs, s.steps);
  s.paper.flush();
}

/** A mark counted towards the page; a full page is turned, after the marks before it are down. */
function counted(api, open) {
  const s = api.scene;
  s.marks++;
  if (s.marks < s.pages) return;
  s.marks = 0;
  const turn = () => {
    const old = scratch(api, 'brushold', true);
    const g = s.brusholdCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'copy';
    g.drawImage(s.paper.cv, 0, 0);
    g.globalCompositeOperation = 'source-over';
    s.paper.ground(s.sheetColour);
    s.turnedAt = api.now;
  };
  turn.keep = true;
  s.jobs.push(turn);
  begin(api, open);
}

/** A sheet's opening marks, queued whatever is already waiting: a page is never left blank. */
function begin(api, open) {
  const s = api.scene;
  s.opening = true;
  open(api);
  s.opening = false;
}

function show(ctx, api) {
  const s = api.scene;
  ctx.drawImage(s.paper.cv, 0, 0, api.w, api.h);
  // A page being turned: the old sheet lifted off to the left, its shadow on the new one.
  const k = (api.now - s.turnedAt) / TURN;
  if (k >= 0 && k < 1 && s.brushold) {
    const e = k * k * (3 - 2 * k);
    const x = Math.round(-e * api.w * 1.05);
    // On whole pixels, and the shadow a gradient beside its edge: a sheet
    // drawn between pixels, or with a blurred shadow, costs a canvas without
    // a graphics card a twentieth to a fifth of a second a frame.
    const fall = s.D * 0.05;
    const shade = ctx.createLinearGradient(x + api.w, 0, x + api.w + fall, 0);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(x + api.w, 0, fall, api.h);
    ctx.drawImage(s.brushold, x, 0, api.w, api.h);
  }
}

// --- shapes as a hand draws them ----------------------------------------------------------

/** A blob: a circle out of round, squashed and turned. */
function blob(x, y, r) {
  const sq = between(0.6, 1);
  const a = Math.random() * TAU;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return circlePoints(0, 0, r, { wobble: between(0.6, 1.4) }).map(([u, v]) => {
    v *= sq;
    return [x + u * c - v * sn, y + u * sn + v * c];
  });
}

/** A shape for an event: mostly a blob, now and then a block drawn freehand. */
function shapeAt(x, y, r) {
  if (Math.random() < 0.7) return blob(x, y, r);
  const w = r * between(1.4, 2.4);
  const h = r * between(1, 1.8);
  return rectPoints(x - w / 2, y - h / 2, w, h, { wobble: 1 });
}

/** The same shape drawn again a little off, as a contour never quite meets its wash. */
function offset(points, by) {
  const dx = between(-1, 1) * by;
  const dy = between(-1, 1) * by;
  return points.map(([x, y]) => [x + dx, y + dy]);
}

/** A contour round a shape, overshooting where it closes, as a pencil does. */
function* contour(paper, points, pen) {
  const ring = [...points, points[0], points[1 % points.length]];
  paper.stroke(ring, { wobble: 0.6, ...pen });
  yield;
}

/** Hatching across a shape, a few lines a step. */
function* hatching(paper, points, h, pen, per = 6) {
  const lines = hatchLines(points, h);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    paper.stroke([[l.x1, l.y1], [l.x2, l.y2]], { ...pen, weight: (pen.weight || 1) * between(0.85, 1.15) });
    if (i % per === per - 1) yield;
  }
}

/** A pencil line, one step. */
function* line(paper, points, pen) {
  paper.stroke(points, pen);
  yield;
}

/** The mark an event makes, in the scene's terms. */
function markOf(p, api) {
  const s = api.scene;
  const k = KINDS.indexOf(p.category);
  return {
    x: p.x,
    y: p.y,
    q: sizeOf(p, api),
    kind: k < 0 ? (Math.random() * KINDS.length) | 0 : k,
    colour: p.color || s.pigments[Math.max(0, k) % s.pigments.length],
  };
}

/** A small mark from nowhere, for the hand that works in a quiet room. */
function idleMark(s) {
  return {
    x: between(0.1, 0.9) * s.W,
    y: between(0.1, 0.9) * s.H,
    q: between(0.05, 0.25),
    kind: (Math.random() * KINDS.length) | 0,
    colour: pick(s.pigments),
  };
}

// --- washes ------------------------------------------------------------------------------

function washAt(api, m) {
  const s = api.scene;
  const P = s.paper;
  const r = s.D * (0.04 + 0.2 * m.q);
  if (m.q < 0.12) {
    // A small event is only a pencil ring, quick and light.
    queue(s, contour(P, blob(m.x, m.y, r * 1.4), { colour: s.lead, brush: pick(['HB', '2H']) }));
    return;
  }
  const pts = shapeAt(m.x, m.y, r);
  const wet = { colour: m.colour, bleed: between(0.1, 0.25), texture: between(0.25, 0.6), opacity: between(150, 210) };
  const jobs = [P.watercolourSteps(pts, wet)];
  // A large one is glazed again, smaller, so its middle is deeper.
  if (m.q > 0.7) jobs.push(P.watercolourSteps(shapeAt(m.x + between(-0.2, 0.2) * r, m.y + between(-0.2, 0.2) * r, r * 0.55), { ...wet, opacity: 120 }));
  if (Math.random() < 0.3) jobs.push(contour(P, offset(pts, r * 0.08), { colour: s.lead, brush: 'HB', wobble: 1.5 }));
  queue(s, ...jobs);
}

function openWashes(api) {
  const s = api.scene;
  for (let i = 0; i < 4; i++) washAt(api, { ...idleMark(s), q: between(0.3, 0.6) });
}

// --- hatching ------------------------------------------------------------------------------

/** Which hand: graphite, soft graphite, coloured pencil and charcoal, by the event's kind. */
const LEADS = ['HB', '2B', 'cpencil', 'charcoal'];

function hatchAt(api, m) {
  const s = api.scene;
  const P = s.paper;
  const r = s.D * (0.04 + 0.18 * m.q);
  const pts = shapeAt(m.x, m.y, r);
  const brush = LEADS[m.kind % LEADS.length];
  const pen = { brush, colour: brush === 'cpencil' ? m.colour : s.lead, weight: brush === 'charcoal' ? 1.3 : 1 };
  // One hand hatches the page, at much the same slant throughout.
  const angle = s.hand + between(-8, 8);
  const dist = s.U * between(3, 4.5) * (brush === 'charcoal' ? 1.5 : 1);
  const jobs = [];
  if (m.q > 0.5) {
    // A large one: a wash under it, then hatched, and the largest across.
    jobs.push(P.watercolourSteps(offset(pts, r * 0.12), { colour: m.colour, opacity: 180, bleed: 0.15, texture: 0.4 }));
  }
  jobs.push(hatching(P, pts, { dist, angle, rand: 0.1, gradient: Math.random() < 0.3 ? 0.4 : 0 }, pen));
  if (m.q > 0.75) jobs.push(hatching(P, shapeAt(m.x + r * 0.2, m.y + r * 0.2, r * 0.6), { dist: dist * 1.2, angle: angle - between(75, 95), rand: 0.1 }, pen));
  if (Math.random() < 0.25) jobs.push(contour(P, pts, { colour: s.lead, brush: 'HB', wobble: 1.2 }));
  queue(s, ...jobs);
}

function openHatching(api) {
  const s = api.scene;
  s.hand = pick([1, -1]) * between(35, 55);
  for (let i = 0; i < 3; i++) hatchAt(api, { ...idleMark(s), q: between(0.3, 0.55) });
}

// --- landscape --------------------------------------------------------------------------

/** A ridge across the sheet: its line, the hill under it down to the foot, and the band of shade under the line. */
function hill(s, y, amp) {
  const top = [];
  const n = 28;
  const seed = Math.random() * 100;
  const f1 = between(1.5, 3);
  const f2 = between(4, 7);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const h = Math.sin((u * f1 + seed) * Math.PI) * 0.6 + Math.sin((u * f2 + seed * 1.7) * Math.PI) * 0.25;
    top.push([-0.05 * s.W + u * 1.1 * s.W, y - amp * h]);
  }
  const depth = s.H * between(0.04, 0.07);
  const under = top.map(([x, yy], i) => [x, yy + depth * (0.6 + 0.4 * Math.sin(i * 0.7 + seed))]).reverse();
  return { top, body: [...top, [1.05 * s.W, 1.04 * s.H], [-0.05 * s.W, 1.04 * s.H]], shade: [...top, ...under] };
}

function hillAt(api, y, colour) {
  const s = api.scene;
  const P = s.paper;
  const h = hill(s, y, s.H * between(0.05, 0.1));
  s.ridges.push(h.top);
  queue(
    s,
    P.watercolourSteps(h.body, { colour, opacity: 170, bleed: 0.12, texture: 0.45 }),
    // Shade under the ridge, drawn along the hill rather than across it.
    hatching(P, h.shade, { dist: s.U * between(2, 2.8), angle: between(-6, 6), rand: 0.2, gradient: 0.3 }, { brush: '2H', colour: s.lead }, 8),
    line(P, h.top, { brush: 'pen', colour: s.lead, wobble: 0.6 }),
  );
}

/** A bird: two strokes of the pen, a wing either side. */
function birdAt(api, x, y, size) {
  const s = api.scene;
  const lift = size * between(0.2, 0.45);
  const wing = (dir) => {
    const out = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      out.push([x + dir * size * t, y - lift * Math.sin(t * Math.PI * 0.85)]);
    }
    return out.reverse();
  };
  queue(s, line(s.paper, wing(-1), { brush: 'pen', colour: s.lead }), line(s.paper, wing(1).reverse(), { brush: 'pen', colour: s.lead }));
}

/** A tree: a trunk in pen, a crown in wash, its shaded side hatched in a deeper tone of it. */
function treeAt(api, x, y, size, colour) {
  const s = api.scene;
  const P = s.paper;
  const crown = blob(x, y - size * 1.2, size * 0.8);
  const shade = blob(x + size * 0.25, y - size * 1.05, size * 0.5);
  queue(
    s,
    line(P, [[x, y], [x + between(-0.1, 0.1) * size, y - size * 1.1]], { brush: 'pen', colour: s.lead, weight: 1.4 }),
    P.watercolourSteps(crown, { colour, opacity: 230, bleed: 0.2, texture: 0.25 }),
    hatching(P, shade, { dist: s.U * 2.6, angle: s.hand, rand: 0.2 }, { brush: 'cpencil', colour: spectralMix(colour, s.lead, 0.5), weight: 1.2 }),
  );
}

function landscapeAt(api, m) {
  const s = api.scene;
  if (m.q < 0.3 || m.y < s.H * 0.4) {
    return birdAt(api, m.x, Math.min(m.y, s.H * 0.45) * 0.8 + s.H * 0.05, s.D * (0.015 + 0.04 * m.q));
  }
  // A new hill now and then, two to a page at most; otherwise a tree.
  if (m.q > 0.85 && s.hills < 5) {
    s.hills++;
    return hillAt(api, clampTo(m.y, s.H * 0.55, s.H * 0.92), m.colour);
  }
  // A tree stands on the ground, never in the sky above the hills.
  return treeAt(api, m.x, Math.max(m.y, groundAt(s, m.x) + s.H * 0.02), s.D * (0.04 + 0.08 * m.q), m.colour);
}

/** How high the land is at x: the highest ridge there. */
function groundAt(s, x) {
  let y = s.H;
  for (const top of s.ridges) {
    const u = clampTo((x - top[0][0]) / (top[top.length - 1][0] - top[0][0]), 0, 1) * (top.length - 1);
    const i = Math.min(top.length - 2, Math.floor(u));
    const f = u - i;
    y = Math.min(y, top[i][1] + (top[i + 1][1] - top[i][1]) * f);
  }
  return y;
}

/** The pigment nearest the blue of a sky, for the sky. */
function skyOf(pigments) {
  let best = pigments[0];
  let d = Infinity;
  for (const c of pigments) {
    const v = packColour(c);
    const r = (v >> 16) & 255;
    const g = (v >> 8) & 255;
    const b = v & 255;
    const e = (r - 70) ** 2 + (g - 130) ** 2 + (b - 200) ** 2;
    if (e < d) {
      d = e;
      best = c;
    }
  }
  return best;
}

function openLandscape(api) {
  const s = api.scene;
  const P = s.paper;
  s.hand = between(-50, -35);
  s.hills = 3;
  s.ridges = [];
  // The sky: a pale wash down to the hills, and a deeper one at the top
  // whose lower edge runs in loose clouds.
  const sky = skyOf(s.pigments);
  queue(s, P.watercolourSteps(rectPoints(-0.05 * s.W, -0.05 * s.H, 1.1 * s.W, 0.62 * s.H, { wobble: 0.5 }), { colour: sky, opacity: 45, bleed: 0.12, texture: 0.6 }));
  const cloud = [];
  const seed = Math.random() * 10;
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    cloud.push([1.05 * s.W - u * 1.1 * s.W, s.H * (0.2 + 0.06 * Math.sin(u * 9 + seed) + 0.03 * Math.sin(u * 23 + seed * 3))]);
  }
  queue(s, P.watercolourSteps([[-0.05 * s.W, -0.05 * s.H], [1.05 * s.W, -0.05 * s.H], ...cloud], { colour: sky, opacity: 95, bleed: 0.25, texture: 0.5 }));
  const warm = s.pigments.filter((c) => c !== sky);
  const sun = warm[warm.length - 1] || sky;
  queue(s, P.watercolourSteps(circlePoints(between(0.55, 0.85) * s.W, between(0.15, 0.28) * s.H, s.D * 0.07, { wobble: 0.6 }), { colour: sun, opacity: 210, bleed: 0.2, texture: 0.3 }));
  const ys = [0.52, 0.66, 0.82];
  ys.forEach((y, i) => hillAt(api, s.H * y, warm[i % warm.length] || sky));
}

// --- the scene -------------------------------------------------------------------------------

/** One sheet of the book: how it opens, and the mark an event makes on it. */
function sheet(name, how, open, mark, idle) {
  return {
    name,
    how,
    init(api) {
      openBook(api);
      api.scene.paper.ground(api.scene.sheetColour);
      begin(api, open);
    },
    event(p, api) {
      const s = api.scene;
      if (!s.paper) return;
      s.lastAt = api.now;
      mark(api, markOf(p, api));
      counted(api, open);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.paper) return;
      ambient(s, api, 6000, () => {
        idle(api);
        counted(api, open);
      });
      work(s);
      show(ctx, api);
    },
  };
}

export const BRUSHED_SCENES = {
  sketchbook: sheets({
    label: 'Sketchbook',
    note: 'A sketchbook drawn the way a hand draws, with pencils that skip on the grain of the paper and watercolour that runs, pools at its rim and lets the paper through. Three sheets. Washes: every event lays a wash in its colour where it lands, larger the larger it is, glazed again if it is large, and now and then drawn round in pencil a little off the paint; where two washes cross they mix as paint mixes, so blue over yellow is green. Hatching: every event hatches a shape in graphite, soft graphite, coloured pencil or charcoal, by its kind, and a large one is washed and then cross-hatched. Landscape: a sky, a sun and three hills, washed, hatched and inked along the ridge; events bring birds into the sky, trees onto the hills and, the largest, another hill in front. When the page is full it is turned, and a fresh one is under it.',
    how: 'Every mark goes through a port of p5.brush to Canvas 2D. A pencil stroke is a run of small soft dots, scattered across the path, under a pressure curve drawn afresh for each stroke, gathered in a mask and mixed in; dense graphite is darker. A wash is a polygon grown by midpoint displacement, laid as twenty translucent layers of three sizes with paper rubbed out between them, its rim darkened where the layers end. Colours mix by Kubelka-Munk over thirty-eight bands of reflectance, after spectral.js. Marks are queued and a few layers laid each frame, so paint is seen going down.',
    positional: true,
    preview: { frames: 60, dt: 60 },
    params: {
      pages: { label: 'Marks before the page turns', min: 10, max: 150, step: 5, default: 45, rebuild: true },
    },
    list: [
      sheet('washes', 'Washes where events land, mixed spectrally with what is under them, and pencil contours.', openWashes, washAt, (api) => washAt(api, idleMark(api.scene))),
      sheet('hatching', 'Shapes hatched in four leads by the event\'s kind; a large one washed and cross-hatched.', openHatching, hatchAt, (api) => hatchAt(api, { ...idleMark(api.scene), q: 0.1 })),
      sheet('landscape', 'Sky, sun and hills laid on opening; birds, trees and hills from events.', openLandscape, landscapeAt, (api) => {
        const s = api.scene;
        return birdAt(api, between(0.1, 0.9) * s.W, between(0.1, 0.4) * s.H, s.D * 0.02);
      }),
    ],
  }),
};
