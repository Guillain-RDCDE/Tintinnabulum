// Three pictures that are printed rather than painted.
//
// The manuscript in written.js invents a script and writes it by hand. These
// three use type that already exists: a case of sorts -- letters, marks,
// ideographs and a drawer of ornaments -- set one piece at a time by the feed.
//
//   sorts      a plate of type, packed solid, one red sort in the whole page
//   emergence  the same case, but a sentence in it losing its sense
//   nodes      plotter plates: dots on a lattice, joined by runs and arcs
//
// They share the house rules: the bulk is a typed array of fixed size, the
// page lives on a buffer from the renderer's pool, and what has been set is
// never re-set -- a plate is composed once and then only added to, which is
// also why a page of a thousand glyphs costs no more per frame than a page of
// ten.

import { scratch } from './paint.js';
import { lightnessOf, lighten, mixColors } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'default', 'alert'];

// The case. Letters and marks are set as type; the ornaments are cut here,
// because a drawer of dingbats is the one thing a browser cannot be relied on
// to have, and the ornaments are most of what gives the plate its texture.
const LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
const MARKS = '©$&@%#?!*+=~/\\[]{}<>;:,.\'"|';
// A handful of ideographs, for the same reason a specimen sheet carries them:
// they are the densest marks in any case, and they break up a page of Latin.
const EAST = '上人木水火天目非山口田';
const FONT = 'Arial, Helvetica, "MS Gothic", "Noto Sans CJK JP", sans-serif';
const MONO = '"DejaVu Sans Mono", "Consolas", "Menlo", "MS Gothic", monospace';

// The ornaments, by name, so the code below reads as what it draws.
const ORNAMENTS = [
  'disc', 'ring', 'block', 'frame', 'up', 'down', 'right', 'left',
  'checker2', 'checker3', 'halftone', 'rules', 'stripes', 'bar', 'stem',
  'halfdisc', 'quarter', 'heart', 'crossed', 'dot', 'pair', 'corner', 'equals',
];
const HEART = ORNAMENTS.indexOf('heart');

/** A small deterministic generator, so a sort belongs to its event for good. */
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
  const id = String(p.label || '') + '@' + (p.x | 0) + ',' + (p.y | 0);
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** What a printer would have in the press: the darkest thing there is. */
function pressInk(api) {
  const ground = lightnessOf(api.palette.background);
  let best = api.palette.default || '#1b1712';
  let far = -1;
  for (const role of ROLES.concat(['text'])) {
    const c = api.palette[role];
    if (!c) continue;
    const d = Math.abs(lightnessOf(c) - ground);
    if (d > far) {
      far = d;
      best = c;
    }
  }
  return best;
}

// --- the ornament drawer -----------------------------------------------------------------
//
// Everything is cut inside a box of one em at (x, y), so an ornament sets
// beside a letter without anything having to know which it is.
function ornament(b, kind, x, y, em) {
  const k = ORNAMENTS[kind % ORNAMENTS.length];
  const cx = x + em / 2;
  const cy = y + em / 2;
  const r = em * 0.34;
  b.beginPath();
  switch (k) {
    case 'disc':
      b.arc(cx, cy, r, 0, TAU);
      b.fill();
      break;
    case 'ring':
      b.lineWidth = Math.max(0.8, em * 0.12);
      b.arc(cx, cy, r * 0.82, 0, TAU);
      b.stroke();
      break;
    case 'block':
      b.fillRect(x + em * 0.16, y + em * 0.16, em * 0.68, em * 0.68);
      break;
    case 'frame':
      b.lineWidth = Math.max(0.8, em * 0.12);
      b.strokeRect(x + em * 0.2, y + em * 0.2, em * 0.6, em * 0.6);
      break;
    case 'up':
    case 'down':
    case 'right':
    case 'left': {
      // One triangle, turned. A quarter turn per name, so the set reads as a
      // family rather than as four unrelated marks.
      const turn = { up: 0, right: 1, down: 2, left: 3 }[k] * (TAU / 4);
      b.save();
      b.translate(cx, cy);
      b.rotate(turn);
      b.moveTo(0, -r);
      b.lineTo(r * 0.92, r * 0.72);
      b.lineTo(-r * 0.92, r * 0.72);
      b.closePath();
      b.fill();
      b.restore();
      break;
    }
    case 'checker2':
    case 'checker3': {
      const n = k === 'checker2' ? 2 : 3;
      const cell = (em * 0.68) / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if ((i + j) % 2) continue;
          b.fillRect(x + em * 0.16 + i * cell, y + em * 0.16 + j * cell, cell, cell);
        }
      }
      break;
    }
    case 'halftone': {
      const n = 3;
      const cell = (em * 0.7) / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          b.beginPath();
          b.arc(x + em * 0.15 + (i + 0.5) * cell, y + em * 0.15 + (j + 0.5) * cell, cell * 0.27, 0, TAU);
          b.fill();
        }
      }
      break;
    }
    case 'rules':
    case 'stripes': {
      const n = 4;
      const gap = (em * 0.7) / n;
      for (let i = 0; i < n; i++) {
        if (k === 'rules') b.fillRect(x + em * 0.15, y + em * 0.15 + i * gap, em * 0.7, gap * 0.45);
        else b.fillRect(x + em * 0.15 + i * gap, y + em * 0.15, gap * 0.45, em * 0.7);
      }
      break;
    }
    case 'bar':
      b.fillRect(x + em * 0.08, cy - em * 0.12, em * 0.84, em * 0.24);
      break;
    case 'stem':
      b.fillRect(cx - em * 0.12, y + em * 0.08, em * 0.24, em * 0.84);
      break;
    case 'halfdisc':
      b.arc(cx, cy + r * 0.3, r, Math.PI, TAU);
      b.fill();
      break;
    case 'quarter':
      b.moveTo(x + em * 0.16, y + em * 0.84);
      b.arc(x + em * 0.16, y + em * 0.84, em * 0.68, -TAU / 4, 0);
      b.closePath();
      b.fill();
      break;
    case 'heart': {
      // Cut rather than typed, because the one red sort in the plate is the
      // whole point of the picture and it cannot depend on a font.
      const w = em * 0.38;
      b.moveTo(cx, cy + w * 0.95);
      b.bezierCurveTo(cx - w * 2, cy - w * 0.4, cx - w * 0.6, cy - w * 1.35, cx, cy - w * 0.35);
      b.bezierCurveTo(cx + w * 0.6, cy - w * 1.35, cx + w * 2, cy - w * 0.4, cx, cy + w * 0.95);
      b.fill();
      break;
    }
    case 'crossed':
      b.lineWidth = Math.max(0.8, em * 0.1);
      b.strokeRect(x + em * 0.2, y + em * 0.2, em * 0.6, em * 0.6);
      b.beginPath();
      b.moveTo(x + em * 0.2, y + em * 0.2);
      b.lineTo(x + em * 0.8, y + em * 0.8);
      b.moveTo(x + em * 0.8, y + em * 0.2);
      b.lineTo(x + em * 0.2, y + em * 0.8);
      b.stroke();
      break;
    case 'dot':
      b.arc(cx, cy, em * 0.12, 0, TAU);
      b.fill();
      break;
    case 'pair':
      b.arc(cx - em * 0.17, cy, em * 0.13, 0, TAU);
      b.fill();
      b.beginPath();
      b.arc(cx + em * 0.17, cy, em * 0.13, 0, TAU);
      b.fill();
      break;
    case 'corner':
      b.lineWidth = Math.max(0.8, em * 0.13);
      b.moveTo(x + em * 0.7, y + em * 0.18);
      b.lineTo(x + em * 0.24, y + em * 0.18);
      b.lineTo(x + em * 0.24, y + em * 0.82);
      b.stroke();
      break;
    case 'equals':
    default:
      b.fillRect(x + em * 0.14, cy - em * 0.24, em * 0.72, em * 0.16);
      b.fillRect(x + em * 0.14, cy + em * 0.08, em * 0.72, em * 0.16);
      break;
  }
}

/**
 * One sort, set at (x, y), and how wide it turned out to be.
 *
 * The width comes back measured rather than assumed, which is what leaves the
 * right-hand edge of a plate ragged: a page of type is only as square as the
 * pieces in it, and these are not all the same width.
 */
function setSort(b, pick, x, y, em) {
  if (pick.ornament >= 0) {
    ornament(b, pick.ornament, x, y, em);
    return em * 0.92;
  }
  b.font = `${Math.max(4, Math.round(em))}px ${FONT}`;
  b.textBaseline = 'alphabetic';
  b.fillText(pick.ch, x, y + em * 0.82);
  const w = b.measureText(pick.ch).width;
  return Math.max(em * 0.32, Math.min(em * 1.1, w));
}

/** What to set next: an ornament, a letter, a mark, an ideograph. */
function pickSort(rnd, shapes) {
  if (rnd() < shapes) return { ornament: (rnd() * ORNAMENTS.length) | 0, ch: '' };
  const r = rnd();
  const from = r < 0.62 ? LETTERS : r < 0.88 ? MARKS : EAST;
  return { ornament: -1, ch: from[(rnd() * from.length) | 0] };
}

export const PRINTED_SCENES = {
  // --- sorts ------------------------------------------------------------------------------
  sorts: {
    label: 'Type case',
    note: 'A plate of type set solid: letters, marks, ideographs and ornaments packed line upon line until the page is full, with the right edge left ragged because the pieces are not all the same width. It is a specimen sheet for a language that has none -- the eye reads it as a document, then as a texture, then gives up and reads it as a picture. One sort in the whole plate is set in colour, and it is a heart, and it is always an event the feed called out: the single thing worth noticing in a page of noise, which is what a page of noise is for.',
    how: 'Every event picks its sort from a generator seeded on its own identity, so the same event always sets the same piece. Ornaments are cut on the canvas rather than typed, because no font can be relied on for them; letters are measured as they are set, and the measured width is the advance, which is where the ragged edge comes from. The plate is composed on a buffer and never re-set: a full page costs the same per frame as an empty one.',
    preview: { frames: 260, dt: 40 },
    params: {
      size: { label: 'Size of the type', min: 0.5, max: 2.4, step: 0.05, default: 1 },
      measure: { label: 'Width of the plate', min: 0.4, max: 1, step: 0.02, default: 0.88 },
      shapes: { label: 'Ornaments against letters', min: 0, max: 1, step: 0.02, default: 0.42 },
      accent: { label: 'How often a red sort', min: 0, max: 1, step: 0.02, default: 0.3 },
    },
    init(api) {
      const s = api.scene;
      const m = Math.min(api.w, api.h);
      s.em = Math.max(5, m * 0.026);
      s.margin = Math.max(8, m * 0.055);
      s.x = s.margin;
      s.y = s.margin;
      s.cleared = false;
      s.ambient = 0;
      s.turning = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.em) return;
      // A burst, not a piece: a compositor picks up a handful at a time, and
      // one letter per event is invisible beside the ambient hand.
      s.quiet = Math.max(0, (s.quiet || 0) - 0.22);
      compose(api, hashOf(p), p.accent ? (p.color || api.palette.alert) : null);
      const more = 3 + ((Math.random() * 4) | 0);
      for (let i = 0; i < more; i++) compose(api, (hashOf(p) + i * 2654435761) >>> 0, null);
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      // A compositor works whether or not anything is arriving, and fast
      // enough that a still of this scene is a plate rather than a first line.
      // How much of the plate is the feed's doing.
      //
      // The ambient hand used to set a piece every eighth of a frame whatever
      // happened, which is a hundred and twenty a second -- so a busy feed
      // adding ten more changed almost nothing about the page. It now sets
      // pieces only in proportion to how quiet the feed has been, and an
      // event sets a short burst of its own, so a plate composed during a
      // busy minute is visibly the feed's work.
      s.quiet = Math.min(1, (s.quiet || 0) + api.dt / 2600);
      s.ambient += api.dt * s.quiet;
      const every = 26;
      while (s.ambient > every) {
        s.ambient -= every;
        compose(api, (Math.random() * 4294967295) >>> 0, null);
      }
      if (s.turning > 0) {
        s.turning -= api.dt;
        b.fillStyle = api.palette.background;
        b.globalAlpha = 0.1;
        b.fillRect(0, 0, api.w, api.h);
        b.globalAlpha = 1;
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- emergence --------------------------------------------------------------------------
  emergence: {
    label: 'Emergence',
    note: 'The same case of type, and a sentence in it coming apart. Line after line repeats whatever the feed last said, and across a band that drifts through the page the words lose their footing: letters drop out, ornaments take their place, and for a few lines there is a field of pure sign with no sense left in it at all. Below the band the sentence finds itself again. Every event throws a stone into the page and the words break up around where it landed -- so the picture is a sentence being read at exactly the rate the world will let it be read. The second sheet is a grid of hexadecimal digits, and every event writes its own fingerprint into it where it falls, lit for a moment and then settled; dressed plain, with runs of one digit marked in red, every digit on a chip of its own colour, a field of colour with a dark square ring through it, or broken into words with empty blocks between.',
    how: 'A printing head walks the cells of a monospaced grid in reading order, several hundred a frame, and never stops: each cell is cleared and re-set from a disorder field, high inside the drifting band and around each recent event, low everywhere else. Below the threshold the cell takes the next character of the sentence, above it a sort from the case or nothing at all. Two colours and no more, as the thing it is quoting has.',
    positional: true,
    preview: { frames: 200, dt: 45 },
    params: {
      figure: { label: 'Which sheet: sentence, hex', min: 0, max: 1, step: 1, default: 0, rebuild: true },
      dress: { label: 'How the hex is dressed: plain, repeats, chips, shape, blocks', min: 0, max: 4, step: 1, default: 0, rebuild: true },
      size: { label: 'Size of the type', min: 0.5, max: 2.5, step: 0.05, default: 1, rebuild: true },
      band: { label: 'How wide the breakdown', min: 0.05, max: 1, step: 0.02, default: 0.3 },
      drift: { label: 'How fast the band moves', min: 0, max: 3, step: 0.05, default: 1 },
      voice: { label: 'How much an event colours its own', min: 0, max: 1, step: 0.02, default: 0.15 },
    },
    init(api) {
      const s = api.scene;
      s.figure = Math.max(0, Math.min(1, Math.round(api.param('figure') || 0)));
      if (s.figure === 1) {
        hexInit(api);
        return;
      }
      const m = Math.min(api.w, api.h);
      s.em = Math.max(6, m * 0.022 * api.param('size'));
      s.cw = s.em * 0.62;
      s.ch = s.em * 1.18;
      s.cols = Math.max(8, Math.floor(api.w / s.cw));
      s.rows = Math.max(6, Math.floor(api.h / s.ch));
      s.head = 0;
      s.band = s.rows * 0.5;
      s.dir = 1;
      s.phrase = 'emergence and signification   ';
      s.blobs = [];
      s.cleared = false;
    },
    event(p, api) {
      const s = api.scene;
      if (s.figure === 1) {
        hexEvent(p, api);
        return;
      }
      if (!s.cols) return;
      // The sentence is whatever the world last said, reduced to something a
      // press could set: the page is then a reading of the feed rather than a
      // decoration with a feed behind it.
      const said = String(p.label || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (said.length >= 6) s.phrase = said.slice(0, 64) + '   ';
      s.blobs.push({
        col: (p.x / s.cw) | 0,
        row: (p.y / s.ch) | 0,
        r: 3 + Math.random() * 6,
        life: 1,
        color: p.color,
      });
      // A ceiling, as everywhere: a page that kept every stone ever thrown
      // would cost more to print with every event that arrived.
      if (s.blobs.length > 48) s.blobs.shift();
      s.drive = Math.min(1.4, (s.drive || 0) + 0.16);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (s.figure === 1) {
        hexFrame(ctx, api);
        return;
      }
      if (!s.cols) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      const ink = pressInk(api);
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }

      // The band walks up and down the page and turns at the edges.
      const drift = api.param('drift');
      s.band += s.dir * drift * (api.dt / 1000) * s.rows * 0.08;
      if (s.band > s.rows * 0.92) { s.band = s.rows * 0.92; s.dir = -1; }
      if (s.band < s.rows * 0.08) { s.band = s.rows * 0.08; s.dir = 1; }
      const spread = Math.max(1.2, s.rows * api.param('band') * 0.5);
      for (const blob of s.blobs) blob.life -= api.dt / 9000;
      while (s.blobs.length && s.blobs[0].life <= 0) s.blobs.shift();

      // The head advances at the feed's rate, with a slow floor so a silent
      // page still breathes. A fixed rate meant the page was re-set just as
      // fast in a silent minute as in a busy one, and the only thing the feed
      // changed was where the breakdown was -- which is too subtle to read as
      // an answer at all.
      s.drive = Math.max(0, (s.drive || 0) - api.dt / 900);
      const total = s.cols * s.rows;
      const cells = Math.max(24, Math.min(2400, Math.round(total * (0.012 + 0.06 * Math.min(1, s.drive)))));
      const voice = api.param('voice');
      b.textBaseline = 'alphabetic';
      b.font = `${Math.max(5, Math.round(s.em))}px ${MONO}`;
      for (let n = 0; n < cells; n++) {
        const i = s.head;
        s.head = (s.head + 1) % total;
        const col = i % s.cols;
        const row = (i / s.cols) | 0;
        const x = col * s.cw;
        const y = row * s.ch;
        b.fillStyle = api.palette.background;
        b.fillRect(x, y, s.cw + 1, s.ch + 1);

        const away = (row - s.band) / spread;
        let d = Math.exp(-(away * away));
        let tint = null;
        for (const blob of s.blobs) {
          const dx = (col - blob.col) / (blob.r * 1.6);
          const dy = (row - blob.row) / blob.r;
          const near = Math.exp(-(dx * dx + dy * dy)) * Math.max(0, blob.life);
          if (near > 0.08 && near > d * 0.5 && Math.random() < voice) tint = blob.color;
          d = Math.max(d, near);
        }

        b.fillStyle = tint || ink;
        if (Math.random() > d) {
          const ch = s.phrase[(col + row * 5) % s.phrase.length];
          if (ch !== ' ') b.fillText(ch, x, y + s.em * 0.86);
          continue;
        }
        // Inside the breakdown: mostly nothing, and now and then a sort with
        // no sentence left to belong to.
        if (Math.random() < 0.62) continue;
        const rnd = Math.random;
        const pick = pickSort(rnd, 0.55);
        b.save();
        b.strokeStyle = b.fillStyle;
        setSort(b, pick, x - s.cw * 0.1, y, s.em * (0.7 + Math.random() * 0.7));
        b.restore();
      }
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- nodes ------------------------------------------------------------------------------
  nodes: {
    label: 'Node plates',
    note: 'Plates from a plotter that never existed: fat dots of ink on a lattice, joined by level runs, by stems, and by long arcs swung about the middle of the plate. Nothing is decided by hand. A new dot lands beside one already there -- along a row, down a column, or round a circle it shares -- and the drawing gets its bilateral symmetry the way a moth does, from being made twice about one axis. Several plates share a sheet and fill at their own rates, so one is always finishing while another has barely begun.',
    how: 'Each plate keeps a bounded list of dots on a lattice of its own. A run lays a dot at every lattice point it crosses, which is where the ladders come from; an arc is a true circular arc about the plate centre, which is why arcs that start at the same distance from the middle come out parallel. Dots and lines are struck onto a buffer once and never redrawn, and a plate that has filled is wiped and begun again on its own clock.',
    positional: true,
    preview: { frames: 240, dt: 45 },
    params: {
      plates: { label: 'How many plates', min: 1, max: 4, step: 1, default: 4, rebuild: true },
      lattice: { label: 'How fine the lattice', min: 0.5, max: 2, step: 0.05, default: 1, rebuild: true },
      arcs: { label: 'How much is arc', min: 0, max: 1, step: 0.02, default: 0.3 },
      weight: { label: 'Weight of the dot', min: 0.4, max: 2.2, step: 0.05, default: 1 },
      mirror: { label: 'How symmetrical', min: 0, max: 1, step: 0.02, default: 0.85 },
    },
    init(api) {
      const s = api.scene;
      const n = Math.max(1, Math.min(4, Math.round(api.param('plates'))));
      const [cols, rows] = LAYOUT[n];
      const fine = api.param('lattice');
      s.plates = [];
      for (let i = 0; i < n; i++) {
        const w = api.w / cols;
        const h = api.h / rows;
        const x = (i % cols) * w;
        const y = ((i / cols) | 0) * h;
        const pad = Math.min(w, h) * 0.12;
        const lat = Math.max(4, Math.round(11 * fine));
        s.plates.push({
          x: x + pad,
          y: y + pad,
          w: w - pad * 2,
          h: h - pad * 2,
          box: { x, y, w, h },
          cols: lat,
          rows: Math.max(4, Math.round(lat * 1.15)),
          dots: [],
          full: 0,
        });
      }
      s.cap = Math.max(40, Math.round(360 / n));
      s.cleared = false;
      s.ambient = 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.plates || !s.bufCtx) return;
      // The plate under the event, so where a thing happened decides which
      // drawing it joins.
      let at = 0;
      for (let i = 0; i < s.plates.length; i++) {
        const box = s.plates[i].box;
        if (p.x >= box.x && p.x < box.x + box.w && p.y >= box.y && p.y < box.y + box.h) at = i;
      }
      // Several strikes to an arrival. Slowing the ambient hand was right --
      // the drawing should be the feed's -- but on its own it only made the
      // sheet emptier; what the feed loses in the timer it has to gain here.
      const runs = 3 + ((Math.random() * 4) | 0);
      for (let i = 0; i < runs; i++) strike(api, s.plates[at], p.color);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.plates) return;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      // A plotter draws on its own, so a still is a sheet of plates rather
      // than a sheet with one dot on it.
      s.ambient += api.dt;
      // Slow: the plotter keeps working when nothing arrives so a wall is
      // never frozen, but a working feed strikes ten times as often, and the
      // drawing has to be plainly the feed's rather than the timer's.
      const every = 90;
      while (s.ambient > every) {
        s.ambient -= every;
        strike(api, s.plates[(Math.random() * s.plates.length) | 0], null);
      }
      // A plate that has filled is given a moment and then wiped, one at a
      // time, so the sheet is never all new and never all finished.
      for (const plate of s.plates) {
        if (plate.dots.length < s.cap) continue;
        plate.full += api.dt;
        if (plate.full < 4000) continue;
        plate.full = 0;
        plate.dots.length = 0;
        b.fillStyle = api.palette.background;
        b.fillRect(plate.box.x, plate.box.y, plate.box.w, plate.box.h);
      }
      ctx.drawImage(buf, 0, 0);
    },
  },
};

// --- the type case -----------------------------------------------------------------------

/** Set one sort, and move the compositor's stick along. */
function compose(api, seed, accent) {
  const s = api.scene;
  const b = s.bufCtx;
  if (!b) return;
  const rnd = seeded(seed);
  const em = s.em * api.param('size');
  const measure = s.margin + (api.w - s.margin * 2) * api.param('measure');
  const ink = pressInk(api);
  // The one coloured sort. Rare by construction -- a page holds something
  // like a thousand pieces, and at the default this is one or two of them.
  const red = accent || (rnd() < api.param('accent') * 0.005
    ? (api.palette.alert || api.palette.default)
    : null);
  const pick = red ? { ornament: HEART, ch: '' } : pickSort(rnd, api.param('shapes'));

  b.save();
  b.fillStyle = red || ink;
  b.strokeStyle = red || ink;
  b.globalAlpha = red ? 1 : 0.88 + rnd() * 0.12;
  const width = setSort(b, pick, s.x, s.y, em);
  b.restore();

  s.x += width * 1.08 + em * 0.06;
  if (s.x > measure) {
    s.x = s.margin;
    s.y += em * 1.16;
  }
  if (s.y > api.h - s.margin - em) {
    s.x = s.margin;
    s.y = s.margin;
    s.turning = 1400;
  }
}

// --- the plates --------------------------------------------------------------------------

const LAYOUT = { 1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2] };

/** Where a lattice point falls on the sheet. */
const latX = (plate, col) => plate.x + (col / (plate.cols - 1)) * plate.w;
const latY = (plate, row) => plate.y + (row / (plate.rows - 1)) * plate.h;

/**
 * One more dot on a plate, and the line that brought it there.
 *
 * Three ways to arrive, and they are the whole grammar of the drawing: along
 * a row, down a column, or round a circle about the middle of the plate. The
 * ladders, the stems and the parallel arcs of the original all fall out of
 * those three and of the fact that everything is done twice, mirrored.
 */
function strike(api, plate, color) {
  const s = api.scene;
  const b = s.bufCtx;
  if (!plate || !b) return;
  // A finished plate is wiped by the next arrival rather than on its own
  // clock. It used to wait four seconds, and every event that landed on it in
  // the meantime was dropped on the floor -- which measured, on the whole
  // scene, as a feed that changed nothing at all for seconds at a time.
  if (plate.dots.length >= s.cap) {
    plate.full = 0;
    plate.dots.length = 0;
    b.fillStyle = api.palette.background;
    b.fillRect(plate.box.x, plate.box.y, plate.box.w, plate.box.h);
  }
  const ink = color && Math.random() < 0.25 ? color : pressInk(api);
  const cell = Math.min(plate.w / (plate.cols - 1), plate.h / (plate.rows - 1));
  const weight = api.param('weight');
  const mirror = api.param('mirror');
  const cx = plate.x + plate.w / 2;
  const cy = plate.y + plate.h / 2;

  b.save();
  b.fillStyle = ink;
  b.strokeStyle = ink;
  b.lineWidth = Math.max(0.8, cell * 0.075 * weight);
  b.lineCap = 'round';

  const dot = (x, y, big) => {
    if (plate.dots.length >= s.cap) return;
    plate.dots.push({ x, y });
    const r = cell * (big ? 0.24 : 0.18) * weight;
    b.beginPath();
    b.ellipse(x, y, r * (1 + Math.random() * 0.25), r * (0.9 + Math.random() * 0.3),
      Math.random() * TAU, 0, TAU);
    b.fill();
  };

  if (!plate.dots.length) {
    for (let i = 0; i < 3; i++) {
      const col = 1 + ((Math.random() * (plate.cols - 2)) | 0);
      const row = 1 + ((Math.random() * (plate.rows - 2)) | 0);
      dot(latX(plate, col), latY(plate, row), true);
    }
    b.restore();
    return;
  }

  const from = plate.dots[(Math.random() * plate.dots.length) | 0];
  const mode = Math.random();
  const twin = Math.random() < mirror;
  const flip = (x) => 2 * cx - x;

  const r = Math.hypot(from.x - cx, from.y - cy);
  if (mode < api.param('arcs') && r > cell * 0.6) {
    // An arc about the middle of the plate: the target shares the radius, so
    // two arcs struck at the same distance come out parallel.
    const a0 = Math.atan2(from.y - cy, from.x - cx);
    const sweep = (0.25 + Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1);
    const a1 = a0 + sweep;
    const to = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    b.beginPath();
    b.arc(cx, cy, r, a0, a1, sweep < 0);
    b.stroke();
    dot(to.x, to.y, true);
    if (twin) {
      const m0 = Math.PI - a0;
      const m1 = Math.PI - a1;
      b.beginPath();
      b.arc(cx, cy, r, m0, m1, sweep > 0);
      b.stroke();
      dot(flip(to.x), to.y, true);
    }
    b.restore();
    return;
  }

  // A run: level or upright, laying a dot at every lattice point it crosses.
  const level = mode < api.param('arcs') + (1 - api.param('arcs')) * 0.6;
  const span = 1 + ((Math.random() * 6) | 0);
  const step = Math.random() < 0.5 ? -1 : 1;
  const way = level ? cell * step : 0;
  const down = level ? 0 : cell * step;
  let x = from.x;
  let y = from.y;
  for (let i = 0; i < span; i++) {
    const nx = x + way;
    const ny = y + down;
    if (nx < plate.x - cell * 0.5 || nx > plate.x + plate.w + cell * 0.5) break;
    if (ny < plate.y - cell * 0.5 || ny > plate.y + plate.h + cell * 0.5) break;
    b.beginPath();
    b.moveTo(x, y);
    b.lineTo(nx, ny);
    b.stroke();
    dot(nx, ny, i === span - 1);
    if (twin) {
      b.beginPath();
      b.moveTo(flip(x), y);
      b.lineTo(flip(nx), ny);
      b.stroke();
      dot(flip(nx), ny, i === span - 1);
    }
    x = nx;
    y = ny;
  }
  b.restore();
}

// --- the hex sheet -----------------------------------------------------------------------
//
// The second sheet of `emergence`: a monospaced grid of hexadecimal digits,
// and every event writing its own fingerprint into it where it falls. Five
// ways of dressing the same grid, on one dial:
//
//   0 plain    the digits, one ink on the ground
//   1 repeats  a run of three or more of one digit marked in red, as chance makes them
//   2 chips    every digit on a square of its own colour, sixteen colours
//   3 shape    a field of colour with a square ring cut through it in the dark
//   4 blocks   the grid broken into words of eight with gaps, some blocks left empty

const HEX = '0123456789abcdef';

/** Sixteen colours for sixteen digits, drawn from the palette and stepped in lightness. */
function chipsOf(api) {
  const pal = api.palette;
  const base = ROLES.map((r) => pal[r]).filter(Boolean);
  const out = [];
  for (let d = 0; d < 16; d++) {
    const a = base[d % base.length];
    const b = base[(d * 7 + 3) % base.length];
    out.push(lighten(mixColors(a, b, (d % 4) / 6), ((d >> 2) - 1.5) * 0.09));
  }
  return out;
}

/** A fingerprint of `n` hex digits for an event, from its own number. */
function digitsOf(seed, n) {
  const rnd = seeded(seed);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (rnd() * 16) | 0;
  return out;
}

/** The palette's role colour that scores highest. */
function hexMost(pal, score) {
  let best = pal.default;
  let top = -Infinity;
  for (const role of ROLES) {
    const c = pal[role];
    if (!c || !/^#[0-9a-f]{6}$/i.test(c)) continue;
    const n = parseInt(c.slice(1), 16);
    const v = score((n >> 16) & 255, (n >> 8) & 255, n & 255);
    if (v > top) {
      top = v;
      best = c;
    }
  }
  return best;
}

function hexInit(api) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  s.dress = Math.max(0, Math.min(4, Math.round(api.param('dress'))));
  s.em = Math.max(6, m * 0.03 * api.param('size'));
  s.cw = s.em * 0.62;
  s.ch = s.em * 1.32;
  s.cols = Math.max(8, Math.floor(api.w / s.cw));
  s.rows = Math.max(6, Math.floor(api.h / s.ch));
  s.x0 = (api.w - s.cols * s.cw) / 2;
  s.y0 = (api.h - s.rows * s.ch) / 2;
  const n = s.cols * s.rows;
  s.cells = new Uint8Array(n);
  for (let i = 0; i < n; i++) s.cells[i] = (Math.random() * 16) | 0;
  // When a cell was last written, on the sheet's own clock; 0 is never.
  s.wrote = new Float32Array(n);
  s.dirty = new Uint8Array(n).fill(1);
  s.all = true;
  s.clock = 1;
  s.drive = 0;
  s.chips = chipsOf(api);
  // One square ring, from the start; a large event moves it.
  const outer = Math.max(3, Math.round(Math.min(s.cols, s.rows * (s.ch / s.cw)) * 0.3));
  s.rings = [{ c: s.cols >> 1, r: s.rows >> 1, outer, inner: outer - Math.max(2, Math.round(outer * 0.3)) }];
  // Blocks: words of eight digits with a gap of three, lines in fours with a
  // blank line between; a block shows or does not.
  s.bw = 11;
  s.bh = 5;
  const bcols = Math.ceil(s.cols / s.bw);
  const brows = Math.ceil(s.rows / s.bh);
  s.blocks = new Uint8Array(bcols * brows);
  for (let i = 0; i < s.blocks.length; i++) s.blocks[i] = Math.random() < 0.45 ? 1 : 0;
  s.bcols = bcols;
  s.lastAt = 0;
  s.ambient = 0;
  s.cleared = false;
}

/** Is this cell shown at all? Only the blocks dress hides any. */
function hexShown(s, c, r) {
  if (s.dress !== 4) return true;
  if (c % s.bw >= 8 || r % s.bh >= 4) return false;
  return s.blocks[((r / s.bh) | 0) * s.bcols + ((c / s.bw) | 0)] === 1;
}

/** Inside the dark band of a ring? */
function hexInRing(s, c, r) {
  for (const g of s.rings) {
    const dx = Math.abs(c - g.c);
    const dy = Math.abs(r - g.r) * (s.ch / s.cw);
    const d = Math.max(dx, dy);
    if (d <= g.outer && d >= g.inner) return true;
  }
  return false;
}

/** Length of the run of equal digits through cell i along its row. */
function hexRun(s, c, r) {
  const row = r * s.cols;
  const v = s.cells[row + c];
  let a = c;
  let b = c;
  while (a > 0 && s.cells[row + a - 1] === v) a--;
  while (b < s.cols - 1 && s.cells[row + b + 1] === v) b++;
  return b - a + 1;
}

function hexEvent(p, api) {
  const s = api.scene;
  if (!s.cells) return;
  const q = Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34)));
  const c0 = Math.max(0, Math.min(s.cols - 1, Math.floor((p.x - s.x0) / s.cw)));
  const r0 = Math.max(0, Math.min(s.rows - 1, Math.floor((p.y - s.y0) / s.ch)));
  // A fingerprint of eight digits, or thirty-two for a large event, written
  // from where it fell along the line and on to the next.
  const n = q > 0.6 ? 32 : q > 0.25 ? 16 : 8;
  hexWrite(s, c0, r0, digitsOf(hashOf(p) ^ (Math.random() * 1e9), n));
  if (s.dress === 3 && q > 0.55) {
    const outer = Math.max(3, Math.round(Math.min(s.cols, s.rows * (s.ch / s.cw)) * (0.18 + q * 0.2)));
    s.rings.push({ c: c0, r: r0, outer, inner: outer - Math.max(2, Math.round(outer * 0.3)) });
    if (s.rings.length > 1) s.rings.shift();
    s.all = true;
  }
  if (s.dress === 4) {
    const bi = ((r0 / s.bh) | 0) * s.bcols + ((c0 / s.bw) | 0);
    if (!s.blocks[bi]) {
      s.blocks[bi] = 1;
      s.all = true;
    }
    if (q > 0.7) {
      const off = (Math.random() * s.blocks.length) | 0;
      if (off !== bi && s.blocks[off]) {
        s.blocks[off] = 0;
        s.all = true;
      }
    }
  }
  s.drive = Math.min(1.6, s.drive + 0.3);
  s.lastAt = api.now;
}

function hexWrite(s, c0, r0, digits) {
  let c = c0;
  let r = r0;
  for (const d of digits) {
    const i = r * s.cols + c;
    s.cells[i] = d;
    s.wrote[i] = s.clock;
    // The run marks reach three either side, so a run made or broken here
    // is redrawn whole.
    for (let k = -3; k <= 3; k++) {
      const cc = c + k;
      if (cc >= 0 && cc < s.cols) s.dirty[r * s.cols + cc] = 1;
    }
    c++;
    if (c >= s.cols) {
      c = 0;
      r = (r + 1) % s.rows;
    }
  }
}

function hexFrame(ctx, api) {
  const s = api.scene;
  if (!s.cells) return;
  const buf = scratch(api, 'buf');
  const b = s.bufCtx;
  const pal = api.palette;
  // The sheet's clock runs at the rate things arrive: a freshly written
  // fingerprint stays lit until the next ones come, not for a fixed time.
  s.drive = Math.max(0, s.drive - api.dt / 1200);
  const step = api.dt * (0.03 + s.drive);
  s.clock += step;
  // In silence, after a pause, a short fingerprint now and then.
  if (api.now - s.lastAt > 2500) {
    s.ambient += api.dt;
    if (s.ambient > 2600) {
      s.ambient = 0;
      hexWrite(s, (Math.random() * s.cols) | 0, (Math.random() * s.rows) | 0, digitsOf((Math.random() * 4294967295) >>> 0, 8));
    }
  } else {
    s.ambient = 0;
  }
  // The repeats sheet is set in the palette's most orange ink and marks its
  // runs in the reddest, as the sheet it follows does; the others in the press's ink.
  const ink = s.dress === 1 ? hexMost(pal, (r, g, b) => r + g / 2 - b) : pressInk(api);
  const dark = lightnessOf(pal.background) < 0.5;
  const mark = lighten(hexMost(pal, (r, g, b) => r - g - b), dark ? 0.14 : 0);
  const accent = pal.alert || pal.user;
  const field = s.dress === 3 ? accent : pal.background;
  if (!s.cleared) {
    b.fillStyle = field;
    b.fillRect(0, 0, api.w, api.h);
    s.cleared = true;
  }
  b.font = `${Math.max(5, Math.round(s.em))}px ${MONO}`;
  b.textBaseline = 'middle';
  b.textAlign = 'center';
  const fresh = 900;
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const i = r * s.cols + c;
      // A cell still lit from its writing is redrawn while it settles.
      const age = s.wrote[i] ? s.clock - s.wrote[i] : Infinity;
      if (!s.all && !s.dirty[i] && !(age < fresh + 200)) continue;
      s.dirty[i] = 0;
      const x = s.x0 + c * s.cw;
      const y = s.y0 + r * s.ch;
      const d = s.cells[i];
      let ground = field;
      let colour = ink;
      if (s.dress === 2) {
        ground = s.chips[d];
        colour = lightnessOf(ground) > 0.6 ? '#111111' : '#f4f4f4';
      } else if (s.dress === 3) {
        ground = hexInRing(s, c, r) ? '#050505' : accent;
        colour = '#f6f0ea';
      } else if (s.dress === 1 && hexRun(s, c, r) >= 3) {
        colour = mark;
      }
      b.fillStyle = ground;
      b.fillRect(x - 0.5, y - 0.5, s.cw + 1, s.ch + 1);
      if (!hexShown(s, c, r)) continue;
      b.fillStyle = colour;
      b.globalAlpha = 1;
      b.fillText(HEX[d], x + s.cw / 2, y + s.ch / 2);
      if (age < fresh) {
        // Freshly written: struck over in the accent and let go.
        b.globalAlpha = (1 - age / fresh) * 0.85;
        b.fillStyle = s.dress === 3 ? '#050505' : accent;
        b.fillText(HEX[d], x + s.cw / 2, y + s.ch / 2);
        b.globalAlpha = 1;
      }
    }
  }
  s.all = false;
  ctx.drawImage(buf, 0, 0);
}
