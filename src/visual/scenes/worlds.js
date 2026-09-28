// A composition assembled out of a fixed vocabulary of forms.
//
// The model is the Bauhaus print: a near-white sheet, one heavy diagonal that
// everything else is hung on, a large circle set apart in a corner to balance
// the mass, and between them a kit of forms that recurs from sheet to sheet --
// bundles of ruled lines crossing at an angle, a chequerboard sheared until it
// reads as a plane going away, filled wedges, swelling arcs, wavy ribbons
// strung with dots, masses filled with lithographic grain, tiny cells divided
// into coloured squares, and a scatter of dots and triangles holding the empty
// corners. Density falls off from an off-centre point; the corners are nearly
// bare.
//
// WHAT DECIDES WHICH FORM
//
// The sound does, when there is any to read. Every event is a note, and at the
// instant it sounds the spectrum is asked where its energy is sitting: low and
// the form is heavy -- a bar, a planet, a grain mass; in the middle and it is
// a curve -- an arc, a ribbon, a wedge; high and it is fine -- ruled lines, a
// chequer, a string of dots. How loud it is sets how large.
//
// That is the whole point of the project and it is worth saying plainly: the
// picture is not decorated with a soundtrack, and the soundtrack is not
// illustrated by a picture. One event makes both, and the form the event takes
// on the page is chosen from what it actually sounds like.
//
// When nothing is listening -- a preview, an export, the projected wall, which
// has no audio engine of its own -- the mark's own size stands in for the
// spectrum, since a large mark is a large event and sounds low. The dial says
// which of the two is in charge, so the difference can be seen rather than
// taken on trust.

import { scratch } from './paint.js';
import { lightnessOf, parseColor, rgbToOklab, toOklch } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'alert', 'default'];

/**
 * The three inks a sheet of this kind is printed in.
 *
 * Black carries it, one warm and one cool punctuate it. They are found in the
 * palette by hue rather than named, so every palette in the catalogue prints
 * its own version of the same composition instead of this scene carrying a
 * palette of its own.
 */
function inksOf(api) {
  const ground = api.palette.background;
  const pale = lightnessOf(ground) > 0.5;
  let ink = pale ? '#141414' : '#f0ece4';
  let dark = pale ? 2 : -2;
  let warm = null;
  let cool = null;
  let warmAway = 999;
  let coolAway = 999;
  for (const role of ROLES.concat(['text'])) {
    const c = api.palette[role];
    if (!c) continue;
    const L = lightnessOf(c);
    if (pale ? L < dark : L > dark) {
      dark = L;
      ink = c;
    }
    const { h, C } = toOklch(rgbToOklab(parseColor(c)));
    if (C < 0.04) continue; // a grey is neither
    const toWarm = Math.abs(((h - 35 + 540) % 360) - 180);
    const toCool = Math.abs(((h - 245 + 540) % 360) - 180);
    if (180 - toWarm < warmAway) {
      warmAway = 180 - toWarm;
      warm = c;
    }
    if (180 - toCool < coolAway) {
      coolAway = 180 - toCool;
      cool = c;
    }
  }
  return { ink, warm: warm || ink, cool: cool || ink, ground, pale };
}

/**
 * What the piece sounds like at this instant, as three numbers.
 *
 * `weight` is where the energy sits, from 0 for a spectrum all in the bass to
 * 1 for one all in the top; `loud` is how loud; `spread` is how much of the
 * range is speaking at once, which separates a single struck rod from a chord.
 * Null when nothing is listening.
 */
function voiceOf(api) {
  const heard = api.sound;
  if (!heard || !heard.spectrum || !heard.spectrum.length) return null;
  const sp = heard.spectrum;
  const n = sp.length;
  let total = 0;
  let weighted = 0;
  let live = 0;
  for (let i = 0; i < n; i++) {
    const v = sp[i];
    if (v > 24) live++;
    total += v;
    weighted += v * i;
  }
  // Below this the engine is running but nothing is sounding, and a centroid
  // computed from the noise floor is a number about nothing.
  if (total < n * 3) return null;
  // The centroid is compressed towards the bottom of the range -- almost all
  // the energy of a struck bell is in its first few bins -- so it is opened
  // out with a root, or every note in the catalogue reads as bass.
  const centroid = weighted / total / n;
  return {
    weight: Math.min(1, Math.pow(centroid * 6, 0.55)),
    loud: Math.min(1, heard.loudness * 1.6),
    spread: Math.min(1, live / (n * 0.35)),
  };
}

// The kit, in three families by weight: heavy, curved, fine.
const HEAVY = ['bar', 'planet', 'mass', 'wedge'];
const CURVED = ['arc', 'arc', 'ribbon', 'wedge', 'serpent'];
const FINE = ['bundle', 'net', 'net', 'chequer', 'chequer', 'beads', 'cell', 'tick'];

export const WORLD_SCENES = {
  worlds: {
    label: 'Small worlds',
    note: 'A sheet composed the way the Bauhaus printers composed one: a single heavy diagonal that everything else is hung on, one large circle set apart in a corner to balance the mass, and between them a kit of forms that comes back sheet after sheet -- bundles of ruled lines crossing in a net, a chequerboard sheared until it reads as a plane going away, filled wedges, swelling arcs, ribbons strung with dots, masses of lithographic grain, and a scatter of small marks holding the empty corners. Which form an event takes is decided by what it sounds like: low and it lands heavy, high and it lands fine. When the sheet is full it is set aside and a new world begins.',
    how: 'At the instant a note sounds the spectrum is read and reduced to three numbers -- where the energy sits, how loud, how much of the range is speaking -- and those choose the family, the size and whether the form is drawn in colour or in black. Position is polar about an off-centre point and an axis: a cube law along the axis concentrates the mass at the middle and lets the punctuation reach the corners. With nothing listening the mark\'s own size stands in for the spectrum, and the dial says which is in charge.',
    positional: true,
    preview: { frames: 220, dt: 45 },
    params: {
      scale: { label: 'Size of the forms', min: 0.4, max: 2, step: 0.05, default: 1 },
      axis: { label: 'How strictly it follows one diagonal', min: 0, max: 1, step: 0.02, default: 0.62 },
      density: { label: 'How full before a new sheet', min: 0.2, max: 2.5, step: 0.05, default: 1 },
      colour: { label: 'How much colour against the black', min: 0, max: 1, step: 0.02, default: 0.34 },
      listen: { label: 'How much the sound chooses the form', min: 0, max: 1, step: 0.02, default: 1 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.m = m;
      s.cleared = false;
      s.ambient = 0;
      newSheet(api);
    },
    event(p, api) {
      const s = api.scene;
      if (!s.m || !s.bufCtx) return;
      place(api, p);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.m) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
        // The furniture of the sheet: the diagonal and the planet. Without
        // them a still of this scene is a scatter, and the whole construction
        // is that everything else is hung on these two.
        furnish(api);
      }
      // A sheet composes itself very slowly when nothing is arriving -- one
      // form every few seconds, against the ten or twenty a second a working
      // feed puts down. It is here so a silent wall is not frozen, and it is
      // deliberately too slow to be mistaken for the feed.
      s.ambient += api.dt;
      while (s.ambient > 2400) {
        s.ambient -= 2400;
        place(api, null);
      }

      ctx.drawImage(buf, 0, 0);
    },
  },
};

/** Begin a new world: a new axis, a new centre, a clean sheet. */
function newSheet(api, b) {
  const s = api.scene;
  // Never level and never upright: the whole arrangement is a diagonal, and
  // an axis that came out horizontal would read as a horizon.
  const lean = 0.35 + Math.random() * 0.7;
  s.angle = (Math.random() < 0.5 ? -1 : 1) * lean;
  s.cx = api.w * (0.38 + Math.random() * 0.24);
  s.cy = api.h * (0.4 + Math.random() * 0.22);
  s.laid = 0;
  s.planet = false;
  if (b) {
    b.fillStyle = api.palette.background;
    b.globalAlpha = 1;
    b.fillRect(0, 0, api.w, api.h);
    b.globalAlpha = 1;
    s.cleared = false;
  }
}

/** The two things every one of these sheets has before anything else. */
function furnish(api) {
  const s = api.scene;
  const inks = inksOf(api);
  draw(api, 'bar', { along: 0, across: 0, size: 1, ink: inks.ink, inks, turn: 0, spine: true });
  // The planet sits well away from the mass, which is what it is for.
  const away = 0.62 + Math.random() * 0.3;
  const side = Math.random() < 0.5 ? -1 : 1;
  draw(api, 'planet', {
    along: -side * away * s.m,
    across: side * (0.2 + Math.random() * 0.3) * s.m,
    size: 0.9 + Math.random() * 0.5,
    ink: inks.ink,
    inks,
    turn: 0,
  });
  s.planet = true;
  s.laid += 2;
}

/**
 * One more form on the sheet.
 *
 * `p` is the mark the event made, or null for the slow ambient hand. The form
 * comes from the sound if anything is listening and the dial allows it, and
 * from the mark's own size otherwise.
 */
function place(api, p) {
  const s = api.scene;
  // A finished sheet is renewed by the next arrival rather than on a timer.
  // A timer meant the sheet went on taking forms while it waited, so a sheet
  // set to hold forty ended up with a hundred and twenty on it; and holding
  // the arrivals back instead would have been a stretch of seconds in which
  // the feed changed nothing, which is the one thing this scene must not do.
  if (s.laid > 42 * api.param('density')) {
    newSheet(api, s.bufCtx);
    s.cleared = true;
    furnish(api);
  }
  const inks = inksOf(api);
  const heard = voiceOf(api);
  const trust = api.param('listen');
  // Where the energy is sitting, from 0 for all bass to 1 for all top.
  //
  // With nothing listening the mark's own size stands in, because a large
  // event is a low note -- the mapper gives the biggest events the lowest
  // ones. It is measured against the running average of what has arrived and
  // not against a fixed size: the renderer's radius has no ceiling this scene
  // can know, so a fixed divisor read almost every mark as large and the
  // sheet came out all bars and planets. Against its own average, half the
  // events land heavy and half land fine whatever the feed is made of.
  if (p) {
    s.rSum = (s.rSum || 0) + p.r;
    s.rN = (s.rN || 0) + 1;
  }
  const mean = s.rN ? s.rSum / s.rN : 24;
  const fromMark = p ? mean / (mean + p.r) : Math.random();
  const weight = heard ? heard.weight * trust + fromMark * (1 - trust) : fromMark;
  const bigness = p ? Math.min(1, p.r / (mean * 2.2)) : 0.4;
  const loud = heard ? heard.loud * trust + bigness * (1 - trust) : bigness;
  const spread = heard ? heard.spread : 0.4;

  const family = weight < 0.34 ? HEAVY : weight < 0.62 ? CURVED : FINE;
  let kind = family[(Math.random() * family.length) | 0];
  // One planet to a sheet. A second is not a balance, it is a pair.
  if (kind === 'planet') {
    if (s.planet) kind = 'mass';
    else s.planet = true;
  }

  // Colour rather than black when the note is full rather than plain: a chord
  // reads as colour, a single struck rod as black. Deaf, the dial alone.
  const chance = api.param('colour') * (heard ? 0.5 + spread : 1);
  const ink = Math.random() < chance
    ? (weight < 0.5 ? inks.warm : inks.cool)
    : inks.ink;

  // Two populations, not one falling off from the middle.
  //
  // A single distribution concentrated on the axis gives a knot: everything
  // lands in the same square inch and the sheet is a scribble with clean
  // corners. These prints are built the other way round -- a loose cluster
  // that can still be read through, and a real scatter out in the field that
  // holds the corners -- so a little over half the forms belong to the
  // cluster and the rest are thrown wide.
  const strict = api.param('axis');
  const t = Math.random() * 2 - 1;
  let along;
  let across;
  if (Math.random() < 0.58) {
    along = Math.sign(t) * Math.pow(Math.abs(t), 1.6) * 0.62 * s.m;
    across = (Math.random() * 2 - 1) * s.m * (0.3 - strict * 0.17);
  } else {
    along = t * 1.05 * s.m;
    across = (Math.random() * 2 - 1) * s.m * (0.7 - strict * 0.3);
  }

  draw(api, kind, {
    along,
    across,
    size: (0.4 + loud * 0.7) * api.param('scale'),
    ink,
    inks,
    turn: (Math.random() - 0.5) * (1 - strict) * 2.2,
  });
  s.laid++;
  // The last few forms laid, by name.
  //
  // Kept because the claim this scene makes -- that the sound chooses the
  // form -- cannot be checked from the pixels: a net of ruled lines covers as
  // much of the sheet as a solid bar does, so ink tells you nothing about
  // which family was picked. Sixteen names is a bounded list and it lets the
  // suite read the choice directly instead of guessing at it.
  if (!s.recent) s.recent = [];
  s.recent.push(kind);
  if (s.recent.length > 16) s.recent.shift();
  s.heard = Boolean(heard);
}

/** Put one form on the sheet, in the sheet's own coordinates. */
function draw(api, kind, o) {
  const s = api.scene;
  const b = s.bufCtx;
  if (!b) return;
  const m = s.m;
  const a = s.angle + o.turn;
  // Brought back inside the sheet. The polar placement is what gives the
  // composition its fall-off, but a form that lands off the paper is a form
  // the sheet paid for and does not get -- and the planet, which is placed
  // furthest out of anything, was the one that kept going over the edge.
  const edge = m * 0.07;
  const x = Math.max(edge, Math.min(api.w - edge,
    s.cx + Math.cos(s.angle) * o.along - Math.sin(s.angle) * o.across));
  const y = Math.max(edge, Math.min(api.h - edge,
    s.cy + Math.sin(s.angle) * o.along + Math.cos(s.angle) * o.across));
  const size = o.size;
  b.save();
  b.translate(x, y);
  b.rotate(a);
  b.fillStyle = o.ink;
  b.strokeStyle = o.ink;
  b.lineCap = 'butt';
  b.lineJoin = 'miter';

  switch (kind) {
    case 'bar': {
      // The spine of the sheet when it is the furniture, a baton when an
      // event puts one down. One sheet can carry one long diagonal; a second
      // is not a composition, it is a fence.
      const spine = o.spine === true;
      const len = m * (spine ? 0.95 : 0.1 + size * 0.24);
      const thick = m * (spine ? 0.026 : 0.005 + size * 0.014);
      b.fillRect(-len / 2, -thick / 2, len, thick);
      break;
    }
    case 'planet': {
      const r = m * (0.05 + size * 0.055);
      const style = Math.random();
      if (style < 0.4) {
        // Concentric rings, in the three inks, as a target.
        const rings = 3 + ((Math.random() * 3) | 0);
        for (let i = rings; i > 0; i--) {
          b.fillStyle = i % 2 ? o.ink : i % 3 ? o.inks.warm : o.inks.cool;
          b.beginPath();
          b.arc(0, 0, (r * i) / rings, 0, TAU);
          b.fill();
        }
        b.fillStyle = o.inks.ground;
        b.beginPath();
        b.arc(0, 0, r * 0.18, 0, TAU);
        b.fill();
      } else if (style < 0.72) {
        // A grained disc: the lithographer's crayon.
        b.beginPath();
        b.arc(0, 0, r, 0, TAU);
        b.save();
        b.clip();
        grain(b, -r, -r, r * 2, r * 2, o.ink, 0.9);
        b.restore();
        b.lineWidth = Math.max(0.7, r * 0.03);
        b.stroke();
      } else {
        // An outline with a diameter drawn through it, and a chord.
        b.lineWidth = Math.max(1, r * 0.09);
        b.beginPath();
        b.arc(0, 0, r, 0, TAU);
        b.stroke();
        b.beginPath();
        b.moveTo(-r * 1.25, 0);
        b.lineTo(r * 1.25, 0);
        b.moveTo(-r * 0.8, -r * 0.6);
        b.lineTo(r * 0.9, r * 0.5);
        b.stroke();
      }
      break;
    }
    case 'mass': {
      // An irregular closed shape, filled with grain rather than with ink.
      const r = m * (0.035 + size * 0.065);
      const n = 5 + ((Math.random() * 4) | 0);
      b.beginPath();
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        const rr = r * (0.55 + Math.random() * 0.75);
        const px = Math.cos(t) * rr;
        const py = Math.sin(t) * rr * 0.8;
        if (i) b.lineTo(px, py);
        else b.moveTo(px, py);
      }
      b.closePath();
      b.save();
      b.clip();
      grain(b, -r, -r, r * 2, r * 2, o.ink, 0.75);
      b.restore();
      break;
    }
    case 'wedge': {
      const r = m * (0.035 + size * 0.085);
      const open = 0.16 + Math.random() * 0.5;
      b.beginPath();
      b.moveTo(0, 0);
      b.arc(0, 0, r, -open / 2, open / 2);
      b.closePath();
      b.fill();
      break;
    }
    case 'arc': {
      // A swelling curve: two arcs of the same centre, the gap between them
      // widest at the middle, filled. A stroked arc of constant width reads
      // as wire; this reads as a brush.
      const r = m * (0.05 + size * 0.11);
      const open = 0.7 + Math.random() * 1.6;
      const thick = m * (0.006 + size * 0.016);
      b.beginPath();
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const t = -open / 2 + (open * i) / steps;
        const swell = Math.sin((i / steps) * Math.PI);
        const rr = r + thick * swell;
        const px = Math.cos(t) * rr;
        const py = Math.sin(t) * rr;
        if (i) b.lineTo(px, py);
        else b.moveTo(px, py);
      }
      for (let i = steps; i >= 0; i--) {
        const t = -open / 2 + (open * i) / steps;
        b.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
      b.closePath();
      b.fill();
      break;
    }
    case 'ribbon':
    case 'serpent': {
      // Parallel wavy bands, sometimes strung with dots along the crest.
      const len = m * (0.07 + size * 0.16);
      const bands = kind === 'serpent' ? 1 : 2 + ((Math.random() * 3) | 0);
      const gap = m * 0.012 * (0.7 + size);
      const amp = m * (0.02 + size * 0.05);
      const beads = Math.random() < 0.4;
      const waves = 2.4 + Math.random() * 5;
      const phase = Math.random() * TAU;
      b.lineWidth = Math.max(1, m * 0.004 * (0.6 + size));
      for (let k = 0; k < bands; k++) {
        b.strokeStyle = k % 2 || bands === 1 ? o.ink : o.inks.warm;
        b.beginPath();
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const px = -len / 2 + len * t;
          const py = Math.sin(phase + t * waves) * amp + k * gap;
          if (i) b.lineTo(px, py);
          else b.moveTo(px, py);
        }
        b.stroke();
      }
      if (beads) {
        b.fillStyle = o.ink;
        for (let i = 0; i <= 7; i++) {
          const t = i / 7;
          b.beginPath();
          b.arc(-len / 2 + len * t, Math.sin(phase + t * waves) * amp - gap, m * 0.006, 0, TAU);
          b.fill();
        }
      }
      break;
    }
    case 'bundle':
    case 'net': {
      // Ruled lines, in threes and sixes, crossing another rule at an angle.
      const len = m * (0.06 + size * 0.16);
      const n = 3 + ((Math.random() * 4) | 0);
      const gap = m * 0.011 * (0.6 + size);
      b.lineWidth = Math.max(0.8, m * 0.0032);
      const rule = (turn) => {
        b.save();
        b.rotate(turn);
        b.beginPath();
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * gap;
          b.moveTo(-len / 2, off);
          b.lineTo(len / 2, off);
        }
        b.stroke();
        b.restore();
      };
      rule(0);
      if (kind === 'net') rule(0.9 + Math.random() * 0.7);
      break;
    }
    case 'chequer': {
      // Sheared, so it reads as a plane going away rather than as a grid.
      const cols = 3 + ((Math.random() * 6) | 0);
      const rows = 2 + ((Math.random() * 4) | 0);
      const cell = m * 0.024 * (0.6 + size);
      b.transform(1, 0, (Math.random() - 0.5) * 1.1, 1, 0, 0);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if ((i + j) % 2) continue;
          b.fillRect((i - cols / 2) * cell, (j - rows / 2) * cell, cell + 0.4, cell + 0.4);
        }
      }
      break;
    }
    case 'cell': {
      // A tiny rectangle divided into coloured squares: the whole sheet in
      // miniature, which is the device these prints keep returning to.
      const cols = 2 + ((Math.random() * 3) | 0);
      const rows = 2 + ((Math.random() * 2) | 0);
      const cell = m * 0.017 * (0.6 + size);
      const palette = [o.ink, o.inks.warm, o.inks.cool, o.inks.ground];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          b.fillStyle = palette[(Math.random() * palette.length) | 0];
          b.fillRect((i - cols / 2) * cell, (j - rows / 2) * cell, cell + 0.4, cell + 0.4);
        }
      }
      b.lineWidth = Math.max(0.6, m * 0.0018);
      b.strokeStyle = o.ink;
      b.strokeRect((-cols / 2) * cell, (-rows / 2) * cell, cols * cell, rows * cell);
      break;
    }
    case 'beads': {
      const n = 3 + ((Math.random() * 6) | 0);
      const gap = m * 0.016 * (0.6 + size);
      const r = m * 0.0055 * (0.6 + size);
      for (let i = 0; i < n; i++) {
        b.beginPath();
        b.arc((i - (n - 1) / 2) * gap, 0, r, 0, TAU);
        b.fill();
      }
      break;
    }
    case 'tick':
    default: {
      // The punctuation that holds an empty corner: a dot, a small square, a
      // triangle, a short wave. Never more than one mark.
      const r = m * 0.009 * (0.6 + size);
      const which = Math.random();
      if (which < 0.34) {
        b.beginPath();
        b.arc(0, 0, r, 0, TAU);
        b.fill();
      } else if (which < 0.6) {
        b.fillRect(-r, -r, r * 2, r * 2);
      } else if (which < 0.82) {
        b.beginPath();
        b.moveTo(0, -r * 1.4);
        b.lineTo(r * 1.2, r);
        b.lineTo(-r * 1.2, r);
        b.closePath();
        b.fill();
      } else {
        b.lineWidth = Math.max(0.8, m * 0.0025);
        b.beginPath();
        for (let i = 0; i <= 18; i++) {
          const t = i / 18;
          const px = -r * 3 + r * 6 * t;
          const py = Math.sin(t * 7) * r;
          if (i) b.lineTo(px, py);
          else b.moveTo(px, py);
        }
        b.stroke();
      }
      break;
    }
  }
  b.restore();
}

/** Lithographic grain: sprayed dots, denser towards the middle. */
function grain(b, x, y, w, h, ink, density) {
  b.fillStyle = ink;
  const dots = Math.min(2600, Math.round((w * h) / 14) * density);
  for (let i = 0; i < dots; i++) {
    const px = x + Math.random() * w;
    const py = y + Math.random() * h;
    b.fillRect(px, py, 1.1, 1.1);
  }
}
