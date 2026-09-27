// Three pictures drawn by a hand that does not lift the pen.
//
//   comb      ninety pens combing down the page, and a band where they lose
//             their composure
//   hatched   fields of colour that are not flat: every one is filled in by
//             hand, with hatching, rules or graphite scribble
//   skein     one continuous line looping round itself, opening and closing
//
// What they have in common is that none of them makes a MARK per event. The
// catalogue is otherwise full of scenes where an event is a disc, a ring, a
// tile, a letter. Here an event is a disturbance: it does not appear anywhere,
// it changes what a pen that is already moving does next, and you read it off
// the drawing afterwards the way you read a tremor off a seismograph.
//
// House rules: everything that accumulates is a bounded array, the drawing is
// struck once onto a buffer from the renderer's pool and never redrawn.

import { scratch } from './paint.js';
import { papers } from './papers.js';

const TAU = Math.PI * 2;

/** The darkest ink against the ground, or the palest on a dark one. */
function penInk(api) {
  const paper = papers(api);
  return paper.pale ? paper.ink : paper.card;
}

export const DRAWN_SCENES = {
  // --- comb -------------------------------------------------------------------------------
  comb: {
    label: 'Comb',
    note: 'Ninety pens set out along the top of the page and drawn straight down, all at the same rate. Nothing else happens to them: the waver in a quiet line is just a hand, and a line that is scribbling is a line that was passing through when something arrived. Because every pen is at the same depth at the same moment, a busy minute becomes a band of chaos straight across the sheet and a quiet one becomes clear air, so the page reads as a chart of the day without anything on it ever having been drawn as a mark. Pens that take too much of it break off and hang, and the page is begun again when the last of them reaches the foot.',
    how: 'Each pen keeps a depth, a phase and an agitation that decays on its own clock; an event raises the agitation of the pens near it and, a little, of the whole comb. Below its threshold a pen advances with a slow lateral wave; above it the step is thrown sideways and sometimes backwards, which is what ties the knots. Segments are struck onto a buffer as they are drawn, so a full page costs no more per frame than an empty one.',
    positional: true,
    preview: { frames: 300, dt: 40 },
    params: {
      teeth: { label: 'How many pens', min: 12, max: 200, step: 2, default: 90, rebuild: true },
      speed: { label: 'How fast they descend', min: 0.2, max: 3, step: 0.05, default: 1 },
      unrest: { label: 'How violent the disturbance', min: 0.2, max: 3, step: 0.05, default: 1 },
      breaks: { label: 'How often a pen breaks off', min: 0, max: 1, step: 0.02, default: 0.3 },
      tint: { label: 'How much colour in the disturbance', min: 0, max: 1, step: 0.02, default: 0.06 },
    },
    init(api) {
      const s = api.scene;
      const n = Math.max(4, Math.min(200, Math.round(api.param('teeth'))));
      const margin = Math.min(api.w, api.h) * 0.1;
      const span = Math.max(1, api.w - margin * 2);
      s.top = margin;
      s.foot = api.h - margin * 0.6;
      s.pens = [];
      for (let i = 0; i < n; i++) {
        const x = margin + (span * (i + 0.5)) / n;
        s.pens.push({
          home: x,
          x,
          y: s.top,
          phase: Math.random() * TAU,
          heat: 0,
          broken: false,
          ink: null,
        });
      }
      s.gap = span / n;
      s.cleared = false;
      s.done = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.pens || !s.pens.length) return;
      // A disturbance, not a mark: the nearest pens take most of it and the
      // whole comb feels a little of it, which is what makes a band rather
      // than a single frayed line.
      const reach = Math.max(s.gap * 2.5, api.w * 0.06);
      // The gain is small and the decay is quick on purpose: what turns a pen
      // over is several arrivals near it in the same moment, not one. A single
      // event on a quiet sheet is a waver; a burst is a knot. The first
      // version gained nearly a whole threshold per event and decayed over
      // two and a half seconds, so any feed at all held every pen at full
      // agitation from the top of the page and the drawing was fur.
      // Nothing is added to the comb as a whole. A flat share for every pen,
      // however small, is a term that grows with the rate and not with where
      // anything happened: at any real rate it carried the whole comb over
      // the threshold and held it there, and the drawing became one field of
      // scribble with no quiet in it to read the disturbance against.
      for (const pen of s.pens) {
        if (pen.broken) continue;
        const away = Math.abs(pen.home - p.x) / reach;
        const share = Math.exp(-away * away);
        pen.heat = Math.min(4, pen.heat + 0.55 * share);
        if (share > 0.6 && !pen.ink && Math.random() < api.param('tint')) pen.ink = p.color;
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.pens) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      const ink = penInk(api);
      const unrest = api.param('unrest');
      const breaks = api.param('breaks');
      const step = Math.max(0.4, Math.min(6, (api.dt / 16) * 1.2 * api.param('speed')));
      b.lineCap = 'round';
      b.lineJoin = 'round';
      b.lineWidth = Math.max(0.6, Math.min(2, s.gap * 0.1));

      let running = 0;
      for (const pen of s.pens) {
        if (pen.broken || pen.y >= s.foot) continue;
        running++;
        // Long enough that a pen that has been knocked scribbles for a
        // stretch of page rather than leaving a blot: a disturbance is a
        // passage in the drawing, not a dot.
        pen.heat *= Math.exp(-api.dt / 1100);
        const hot = pen.heat * unrest;
        if (hot < 0.85) pen.ink = null;
        b.strokeStyle = hot > 1.3 && pen.ink ? pen.ink : ink;
        b.beginPath();
        b.moveTo(pen.x, pen.y);
        // A few sub-steps per frame, so a pen at speed still draws a line and
        // not a ladder.
        const sub = hot > 0.85 ? 3 : 1;
        for (let k = 0; k < sub; k++) {
          pen.phase += 0.09;
          if (hot < 0.85) {
            // Quiet: down, with the slow lateral wave of a hand.
            pen.y += step / sub;
            pen.x = pen.home + Math.sin(pen.phase * 0.5) * s.gap * 0.14;
          } else {
            // Disturbed: thrown sideways, sometimes backwards, and held near
            // its own column so the comb does not simply come apart.
            const swing = Math.min(s.gap * 1.7, s.gap * 0.55 * hot);
            pen.x += (Math.random() - 0.5) * swing * 2;
            pen.x += (pen.home - pen.x) * 0.22;
            pen.y += (step / sub) * (Math.random() < 0.28 ? -0.7 : 0.55);
          }
          b.lineTo(pen.x, pen.y);
        }
        b.stroke();
        if (pen.y < s.top) pen.y = s.top;
        // Taking too much of it, a pen breaks off -- with the little sideways
        // hook the original has at the end of a broken line.
        if (hot > 1.6 && Math.random() < breaks * 0.004) {
          pen.broken = true;
          b.beginPath();
          b.moveTo(pen.x, pen.y);
          b.lineTo(pen.x + s.gap * (Math.random() < 0.5 ? -1.4 : 1.4), pen.y);
          b.stroke();
        }
      }

      // The last pen down turns the page.
      if (!running) {
        s.done += api.dt;
        if (s.done > 2600) {
          s.done = 0;
          b.fillStyle = api.palette.background;
          b.globalAlpha = 0.85;
          b.fillRect(0, 0, api.w, api.h);
          b.globalAlpha = 1;
          for (const pen of s.pens) {
            pen.y = s.top;
            pen.x = pen.home;
            pen.heat = 0;
            pen.broken = false;
            pen.ink = null;
          }
        }
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- hatched ----------------------------------------------------------------------------
  hatched: {
    label: 'Hatchwork',
    note: 'A picture divided into fields, and not one of them flat: every field is filled in by hand, with parallel rules, with crossed hatching, with graphite scribbled until it is nearly solid. That is the whole difference between this and a picture of coloured shapes -- the eye can see that somebody sat and filled each one, and it reads the work that went in before it reads the composition. Now and then a division comes out as a thin slice rather than a field, and those are the coloured rails that cross the whole sheet. Every event picks a field and fills it again, in its own colour.',
    how: 'The sheet is split in two, and each half in two, down to a depth the dial sets, with the split placed off centre and now and then so far off that one side is a rail. A field is re-hatched only when it changes, at a few fields a frame, so the cost of the picture is the cost of what has just been redrawn rather than of everything on it. The wobble in a rule is a sine with a random phase, which is nearer a hand than noise is: a hand wanders, it does not jitter.',
    positional: true,
    preview: { frames: 200, dt: 50 },
    params: {
      fields: { label: 'How many fields', min: 1, max: 6, step: 1, default: 5, rebuild: true },
      hatch: { label: 'How close the hatching', min: 0.4, max: 2.2, step: 0.05, default: 1 },
      colour: { label: 'How much colour against the greys', min: 0, max: 1, step: 0.02, default: 0.26 },
      wobble: { label: 'How unsteady the hand', min: 0, max: 2, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const depth = Math.max(1, Math.min(6, Math.round(api.param('fields'))));
      s.panels = [];
      split(s.panels, { x: 0, y: 0, w: api.w, h: api.h }, depth);
      const paper = papers(api);
      for (const panel of s.panels) dress(panel, api, paper, null);
      s.cleared = false;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.panels || !s.panels.length) return;
      const paper = papers(api);
      for (const panel of s.panels) {
        if (p.x < panel.x || p.x >= panel.x + panel.w) continue;
        if (p.y < panel.y || p.y >= panel.y + panel.h) continue;
        dress(panel, api, paper, p.color);
        return;
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.panels) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      // A hand goes on working whether or not anything arrives.
      s.ambient += api.dt;
      const every = 700;
      while (s.ambient > every) {
        s.ambient -= every;
        const paper = papers(api);
        dress(s.panels[(Math.random() * s.panels.length) | 0], api, paper, null);
      }
      // One field a frame, and no more. Filling a field is a few thousand
      // strokes and three at once is ten thousand, which is a spike with no
      // reason to exist: a field that waits one more frame to be filled costs
      // nobody anything, and a page showing several of these at once has only
      // the one main thread between them.
      for (const panel of s.panels) {
        if (panel.done) continue;
        fill(b, panel, api);
        panel.done = true;
        break;
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- skein ------------------------------------------------------------------------------
  skein: {
    label: 'Skein',
    note: 'One line, and the pen never leaves the paper. It goes round and round, and the loop it is going round is slowly closing: at the beginning a hundred turns fall almost on top of one another and make a solid black cap, and by the end they are small, tilted every which way, and tangled into a knot no bigger than a thumbnail. What the events do is not open it again -- nothing does -- but throw it off true. A quiet room winds down into a neat nest of rings; a busy one tilts, drifts and squashes every turn as it goes, and comes out a tangle. Then the page is turned and it begins again wide.',
    how: 'One ellipse -- a centre, a radius, how far from round, a tilt -- and the pen steps round it by a fixed angle, the segment struck between the old point and the new. The radius closes on its own clock, slowly at first and faster as it tightens, which is what puts the dense cap at the top rather than at the end; an event does not touch it, and instead knocks the tilt, the squash and the drift of the centre. The picture is therefore a measure of how disturbed the winding-down was, not of how much of it there was.',
    positional: true,
    preview: { frames: 260, dt: 45 },
    params: {
      speed: { label: 'How fast the pen goes round', min: 0.2, max: 3, step: 0.05, default: 1 },
      settle: { label: 'How fast it winds down', min: 0.1, max: 3, step: 0.05, default: 1 },
      wander: { label: 'How much it drifts', min: 0, max: 3, step: 0.05, default: 1 },
      weight: { label: 'Weight of the line', min: 0.3, max: 2.5, step: 0.05, default: 1 },
      tint: { label: 'How much colour in the line', min: 0, max: 1, step: 0.02, default: 0.06 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.cx = api.w / 2;
      s.cy = api.h * 0.42;
      s.rx = m * 0.3;
      s.ry = m * 0.3;
      s.rot = 0;
      s.t = 0;
      s.vx = 0;
      s.vy = 0;
      s.spin = 0.00018;
      // How far from round the loop is. A skein of true circles is a ring,
      // not a nest -- the nest is what happens when each turn is a slightly
      // different ellipse at a slightly different tilt.
      s.squash = 1;
      s.ink = null;
      s.px = null;
      s.cleared = false;
      s.resting = 0;
      s.full = m * 0.32;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.full) return;
      const m = Math.min(api.w, api.h);
      // An event does not change the size of the loop.
      //
      // Two versions did, and both drew a ring: whatever the gain, a steady
      // rate of arrival finds the size at which opening balances closing and
      // then stays there for ever, and a loop of constant radius is a circle
      // drawn a thousand times. The picture needs the radius to sweep the
      // whole way down, so the radius answers to nothing but its own clock
      // and an event throws the loop off true instead.
      s.vx += (p.x - s.cx) * 0.005 * api.param('wander');
      s.vy += (p.y - s.cy) * 0.005 * api.param('wander');
      s.spin += (Math.random() - 0.5) * 0.0006 * api.param('wander');
      s.squash += (Math.random() - 0.5) * 0.3;
      s.squash = Math.max(0.4, Math.min(1.45, s.squash));
      if (Math.random() < api.param('tint')) {
        s.ink = p.color;
        s.inkLife = 500;
      }
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.full) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      const m = Math.min(api.w, api.h);
      const ink = penInk(api);
      // A colour belongs to the turn it arrived on and not to the drawing:
      // held, it turns a skein of one ink into a ball of wool.
      s.inkLife = Math.max(0, (s.inkLife || 0) - api.dt);
      if (!s.inkLife) s.ink = null;
      b.strokeStyle = s.ink || ink;
      b.lineWidth = Math.max(0.4, 0.9 * api.param('weight'));
      b.lineCap = 'round';

      // Winding down, slowly at first and faster as it tightens. A plain
      // exponential takes most of the radius off in the first seconds, which
      // puts the dense passage at the end; here the first turns hardly move
      // at all, so they pile into the cap the original has at the top, and
      // the opening out happens afterwards.
      const open = Math.max(0, Math.min(1, s.rx / s.full));
      const rate = 0.045 + 0.5 * (1 - open) * (1 - open);
      s.rx = Math.max(0, s.rx - s.full * rate * api.param('settle') * (api.dt / 1000));
      s.ry = s.rx * s.squash;
      s.rot += s.spin * api.dt;
      s.spin *= 0.9995;
      s.squash += (Math.random() - 0.5) * 0.0015 * (api.dt / 16);
      s.squash = Math.max(0.4, Math.min(1.45, s.squash));
      s.cx += s.vx * (api.dt / 16);
      s.cy += s.vy * (api.dt / 16);
      // As it winds down it also settles: the knot ends up below where the
      // wide turns were, which is what leaves the dense cap standing above an
      // open nest instead of a target with a dot in the middle.
      const closed = 1 - open;
      const restY = api.h * (0.34 + closed * 0.3);
      s.vx = s.vx * 0.94 + (api.w / 2 - s.cx) * 0.0008;
      s.vy = s.vy * 0.94 + (restY - s.cy) * 0.0022;

      const turn = 0.075 * api.param('speed');
      const steps = Math.max(1, Math.min(90, Math.round((api.dt / 16) * 14 * api.param('speed'))));
      b.beginPath();
      if (s.px === null) {
        s.px = s.cx + Math.cos(s.t) * s.rx;
        s.py = s.cy + Math.sin(s.t) * s.ry;
      }
      b.moveTo(s.px, s.py);
      for (let i = 0; i < steps; i++) {
        s.t += turn;
        const ex = Math.cos(s.t) * s.rx;
        const ey = Math.sin(s.t) * s.ry;
        const c = Math.cos(s.rot);
        const sn = Math.sin(s.rot);
        s.px = s.cx + ex * c - ey * sn;
        s.py = s.cy + ex * sn + ey * c;
        b.lineTo(s.px, s.py);
      }
      b.stroke();

      // Wound right down: let the knot stand a moment, then begin again wide.
      if (s.rx < m * 0.01) {
        s.resting += api.dt;
        if (s.resting > 2600) {
          s.resting = 0;
          b.fillStyle = api.palette.background;
          b.globalAlpha = 0.88;
          b.fillRect(0, 0, api.w, api.h);
          b.globalAlpha = 1;
          s.rx = m * 0.34;
          s.ry = m * 0.32;
          s.squash = 1;
          s.cx = api.w / 2;
          s.cy = api.h * 0.36;
          s.rot = 0;
          s.spin = 0.00018;
          s.ink = null;
          s.px = null;
        }
      }
      ctx.drawImage(buf, 0, 0);
    },
  },
};

// --- the hatched sheet -------------------------------------------------------------------

/**
 * Split a rectangle in two, and each half again, down to `depth`.
 *
 * The split is placed off centre, and one time in six it is placed so far off
 * that what comes out is a slice rather than a field -- which is where the
 * thin coloured rails that cross the whole sheet come from. They are not a
 * separate feature; they are a division that went to an extreme.
 */
function split(out, box, depth) {
  // A branch that stops early is what leaves one field large beside four
  // small ones. Splitting every branch to the same depth gives a grid, and a
  // grid is the one arrangement a hand would never arrive at.
  //
  // One level at a time, and never to the floor: dropping a branch straight
  // to its last split can fire at the root, and then the whole sheet is two
  // fields. It did, and the picture was a horizon.
  if (depth > 1 && Math.random() < 0.3) depth -= 1;
  if (depth <= 0 || out.length > 40) {
    out.push({ ...box, style: 'rules', color: '#888', done: false, turn: 0, seed: Math.random() });
    return;
  }
  const across = box.w > box.h ? Math.random() < 0.72 : Math.random() < 0.28;
  const rail = Math.random() < 0.17;
  const at = rail
    ? (Math.random() < 0.5 ? 0.04 + Math.random() * 0.05 : 0.91 + Math.random() * 0.05)
    : 0.18 + Math.random() * 0.64;
  if (across) {
    const cut = Math.max(2, box.w * at);
    split(out, { x: box.x, y: box.y, w: cut, h: box.h }, depth - 1);
    split(out, { x: box.x + cut, y: box.y, w: box.w - cut, h: box.h }, depth - 1);
  } else {
    const cut = Math.max(2, box.h * at);
    split(out, { x: box.x, y: box.y, w: box.w, h: cut }, depth - 1);
    split(out, { x: box.x, y: box.y + cut, w: box.w, h: box.h - cut }, depth - 1);
  }
}

const STYLES = ['rules', 'rules', 'cross', 'scribble', 'scribble', 'scribble', 'dense', 'dense', 'blank', 'blank'];

/** Give a field a filling and a colour, and mark it to be redrawn. */
function dress(panel, api, paper, color) {
  if (!panel) return;
  const slim = Math.min(panel.w, panel.h) < Math.min(api.w, api.h) * 0.06;
  const chance = api.param('colour');
  panel.color = color && Math.random() < 0.7
    ? color
    : slim || Math.random() < chance
      ? paper.sheets[(Math.random() * paper.sheets.length) | 0]
      : paper.pale ? paper.ink : paper.card;
  if (!color && !slim && Math.random() < 0.3) panel.color = paper.pale ? paper.ink : paper.card;
  // A rail is always filled solid: a thin slice hatched loosely reads as a
  // mistake rather than as a line.
  panel.style = slim ? 'dense' : STYLES[(Math.random() * STYLES.length) | 0];
  panel.turn = Math.random() < 0.5 ? 0 : 1;
  panel.seed = Math.random();
  panel.done = false;
}

/** Fill one field by hand. */
function fill(b, p, api) {
  const paper = papers(api);
  const hatchDial = api.param('hatch');
  const wob = api.param('wobble');
  const unit = Math.min(api.w, api.h);
  b.save();
  b.beginPath();
  b.rect(p.x, p.y, p.w, p.h);
  b.clip();
  // The ground under the field, so a re-hatched field is not laid over the
  // last one and read as mud.
  b.fillStyle = paper.pale ? paper.card : api.palette.background;
  b.fillRect(p.x, p.y, p.w + 1, p.h + 1);

  b.strokeStyle = p.color;
  b.lineCap = 'round';
  const gap = Math.max(1.2, (unit * 0.0075) / hatchDial);
  const amp = unit * 0.0035 * wob;

  /** One wobbly rule across the field. */
  const rule = (x0, y0, x1, y1, phase) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.min(28, Math.round(len / 22)));
    const nx = -(y1 - y0) / (len || 1);
    const ny = (x1 - x0) / (len || 1);
    b.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = Math.sin(phase + t * 5.4) * amp;
      const x = x0 + (x1 - x0) * t + nx * off;
      const y = y0 + (y1 - y0) * t + ny * off;
      if (i) b.lineTo(x, y);
      else b.moveTo(x, y);
    }
    b.stroke();
  };

  if (p.style === 'blank') {
    b.restore();
    return;
  }
  if (p.style === 'scribble') {
    // Graphite: short strokes in every direction until the field is nearly
    // solid, which is what a pencil does and what no fill can imitate.
    b.lineWidth = Math.max(0.35, gap * 0.13);
    b.globalAlpha = 0.34;
    const strokes = Math.min(1800, Math.round((p.w * p.h) / (gap * gap * 1.5)));
    // A pencil goes back and forth along one rough direction rather than in
    // every direction at once: a scatter of sticks reads as confetti, and
    // that is what the first version drew.
    const lean = Math.random() * TAU;
    for (let i = 0; i < strokes; i++) {
      const x = p.x + Math.random() * p.w;
      const y = p.y + Math.random() * p.h;
      const a = lean + (Math.random() - 0.5) * 0.9;
      const r = gap * (1.2 + Math.random() * 3);
      b.beginPath();
      b.moveTo(x, y);
      b.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      b.stroke();
    }
    b.globalAlpha = 1;
    b.restore();
    return;
  }

  const tight = p.style === 'dense' ? 0.42 : 1;
  // A ceiling on how many rules a field may take, whatever its size and
  // however fine the dial. A wobbly rule is a polyline, not a line, so a
  // large field at a fine pitch came to over thirty thousand segments struck
  // in a single frame -- and at that pitch they overlap anyway, so the cap
  // costs the picture nothing it can show.
  const MOST = 240;
  const run = p.turn ? p.h : p.w;
  const pitch = Math.max(1.1, gap * tight, run / MOST);
  b.lineWidth = Math.max(0.4, pitch * (p.style === 'dense' ? 0.85 : 0.26));
  const lines = Math.ceil(run / pitch);
  for (let i = 0; i <= lines; i++) {
    const at = i * pitch;
    if (p.turn) rule(p.x, p.y + at, p.x + p.w, p.y + at, p.seed * 9 + i * 0.7);
    else rule(p.x + at, p.y, p.x + at, p.y + p.h, p.seed * 9 + i * 0.7);
  }
  if (p.style === 'cross') {
    const other = p.turn ? p.w : p.h;
    const crossPitch = Math.max(pitch, other / MOST);
    const across = Math.ceil(other / crossPitch);
    for (let i = 0; i <= across; i++) {
      const at = i * crossPitch;
      if (p.turn) rule(p.x + at, p.y, p.x + at, p.y + p.h, p.seed * 5 + i * 0.4);
      else rule(p.x, p.y + at, p.x + p.w, p.y + at, p.seed * 5 + i * 0.4);
    }
  }
  // The division itself, drawn rather than left as the edge of a fill: a
  // ruled boundary is what tells the eye a hand made the arrangement too, and
  // not only the shading inside it.
  if (p.seed > 0.55) {
    b.strokeStyle = paper.pale ? paper.ink : paper.card;
    b.lineWidth = Math.max(0.6, unit * 0.0016);
    b.globalAlpha = 0.8;
    if (p.seed > 0.78) rule(p.x, p.y, p.x, p.y + p.h, p.seed * 3);
    rule(p.x, p.y, p.x + p.w, p.y, p.seed * 7);
    b.globalAlpha = 1;
  }
  b.restore();
}
