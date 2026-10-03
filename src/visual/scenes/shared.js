// What the scene families kept copying from one another.
//
// Each family file was written to stand on its own, and for a while that was
// cheap: a seeded generator, a clamp, the size of an event. By the time there
// were thirty families the generator existed in twelve of them, the "ambient
// hand" that works only when the feed is quiet in eighteen, and the clock that
// runs at the rate things arrive in twenty-seven -- each copied by hand, each
// drifting a little from the last. One variant of the generator could be
// handed a fractional seed and return zero forever.
//
// Nothing here knows anything about drawing. These are the few arithmetic
// habits every scene shares, and the two patterns the project's highest rule
// rests on: a picture may move on its own, but the amount of work it does has
// to come from the feed.

import { lightnessOf, lighten, mixColors, parseColor } from '../color.js';

export const TAU = Math.PI * 2;

/**
 * A small deterministic generator, so a mark belongs to its event for good.
 *
 * xorshift32. The state is forced to a non-zero integer -- `(n >>> 0) || 1`
 * and not `(n || 1) >>> 0`: the second lets a seed between zero and one
 * through as a state of zero, and xorshift stays at zero from then on.
 */
export function seeded(n) {
  let s = (n >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** FNV-1a of a string, as an unsigned 32-bit number. */
export function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A number that belongs to this event and to no other: its label and where it
 * fell, and, when asked, its draw and its size as well, so two events of the
 * same name in the same place still differ.
 */
export function hashOf(p, { fine = false } = {}) {
  let id = String(p.label || '') + '@' + (p.x | 0) + ',' + (p.y | 0);
  if (fine) id += '/' + Math.round((p.pick || 0) * 1e6) + '/' + (p.r | 0);
  return fnv(id);
}

/** How big an event is, 0 to 1, against the largest mark the renderer makes. */
export function sizeOf(p, api) {
  const most = Math.min(api.w, api.h) * 0.34;
  return Math.max(0, Math.min(1, p.r / most));
}

export function clampTo(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** An event's own draw when it has one, and chance otherwise: the renderer's
 *  cards and Create give every event a `pick`; the live canvas does not. */
export function pickOf(p) {
  return p.pick === undefined ? Math.random() : p.pick;
}

// --- the palette, read as paper ------------------------------------------------------------

const PAPER_ROLES = ['user', 'anon', 'bot', 'alert', 'default'];

/**
 * The palette read as a drawer of papers: the coloured sheets, the darkest
 * ink, a card a shade off the ground, and whether the ground is pale. Five
 * families cut, rule and print on these.
 */
export function papers(api) {
  const bg = api.palette.background;
  const pale = lightnessOf(bg) > 0.5;
  const sheets = [];
  for (const role of PAPER_ROLES) {
    const c = api.palette[role];
    if (c) sheets.push(c);
  }
  const ink = pale ? mixColors(api.palette.text || '#111', '#000000', 0.45) : '#0e0e0e';
  const card = pale ? lighten(bg, 0.06) : mixColors(bg, '#f2ece0', 0.9);
  return { sheets, ink, card, pale };
}

/** A night sky from the palette: its ground, taken down towards ink. */
export const nightOf = (pal) => mixColors(pal.background, '#05080d', lightnessOf(pal.background) > 0.5 ? 0.86 : 0.45);

/** The darkest ink against a pale ground, or the palest card on a dark one. */
export function inkOf(api) {
  const paper = papers(api);
  return paper.pale ? paper.ink : paper.card;
}

/**
 * The palette colour that scores highest on `score(r, g, b)`: the reddest, the
 * most orange, the coolest. Ties go to the first role in order, so `roles`
 * decides them; `floor` says what score is too low to count, and `fallback`
 * what to answer then.
 */
export function mostOf(pal, score, { roles = PAPER_ROLES, floor = -Infinity, fallback = null } = {}) {
  let best = null;
  let top = floor;
  for (const role of roles) {
    const c = pal[role];
    if (!c) continue;
    const { r, g, b } = parseColor(c);
    const v = score(r, g, b);
    if (v > top) {
      top = v;
      best = c;
    }
  }
  return best || fallback || pal.default;
}

// --- the feed's clock -------------------------------------------------------------------

/**
 * The hand that works when nothing arrives, and only then.
 *
 * After `quiet` milliseconds without an event, `fn` runs every `every`
 * milliseconds; while the feed is working the hand rests. Two and a half
 * seconds, because the scenes that keep a drive take a second and a quarter
 * to let it go, and a hand that started sooner was counted as the feed's own
 * aftermath. Needs `s.lastAt` set by the scene's event handler.
 */
export function ambient(s, api, every, fn, quiet = 2500) {
  if (api.now - (s.lastAt || 0) > quiet) {
    s.ambient = (s.ambient || 0) + api.dt;
    if (s.ambient > every) {
      s.ambient = 0;
      fn();
    }
  } else {
    s.ambient = 0;
  }
}

/** An arrival: the drive rises by `add`, to a ceiling. Call from `event`. */
export function kick(s, add = 0.3, ceiling = 1.6) {
  s.drive = Math.min(ceiling, (s.drive || 0) + add);
}

/**
 * The rate the world runs at this frame, `floor` plus the drive -- which falls
 * back to nothing over `decayMs`, so a silent minute leaves the picture nearly
 * still and a busy one runs it. Call from `frame`, once, and multiply `api.dt`
 * by what comes back. The floor is low on purpose: 0.02 to 0.06 in every
 * scene that uses it, which is a world that barely breathes on its own.
 */
export function tempo(s, api, floor, decayMs = 1200) {
  s.drive = Math.max(0, (s.drive || 0) - api.dt / decayMs);
  return floor + Math.min(1, s.drive);
}

// --- bounded work -------------------------------------------------------------------------

/**
 * A collection's ceiling, as a share of the renderer's budget between two
 * bounds. The scenes keep lists of their own -- bars, sheets, targets -- and
 * each used to write this out by hand with its own floor and rounding.
 */
export function budgetFor(api, share, least, most) {
  return Math.max(least, Math.min(most, Math.floor((api.budget || 800) * share)));
}

/** Queue a stroke, within the budget: past it the oldest orders are dropped,
 *  since what they would have drawn is under what came after anyway. */
export function enqueue(s, api, job) {
  s.queue.push(job);
  const most = Math.max(60, Math.min(1200, api.budget || 800));
  if (s.queue.length > most) s.queue.splice(0, s.queue.length - most);
}

/** Strike up to `budget` queued jobs onto `b`: a burst is a queue, not a spike. */
export function drain(s, b, budget) {
  while (s.queue.length && budget-- > 0) {
    const job = s.queue.shift();
    job(b);
  }
}

/**
 * The index of the rectangle nearest a point, by the gap between them -- zero
 * when the point is inside -- or -1 for an empty list. Every event must take a
 * place on a ruled sheet, even one that fell in a gutter.
 */
export function nearestRect(rects, x, y) {
  let at = -1;
  let best = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const c = rects[i];
    const dx = x < c.x ? c.x - x : x > c.x + c.w ? x - c.x - c.w : 0;
    const dy = y < c.y ? c.y - y : y > c.y + c.h ? y - c.y - c.h : 0;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      at = i;
    }
  }
  return at;
}
