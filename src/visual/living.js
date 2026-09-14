// Living colour: a palette that changes by itself, slowly.
//
// The palette rotation that already exists jumps from one scheme to another at
// intervals. That suits a demonstration and not a room: every change is an
// event, and in a room nobody wants events from the wall. These three modes
// never change anything at once. Each computes, from the chosen palette, the
// colours it should have right now, and the canvas walks to them a few times a
// second -- so the change is continuous and, at any one moment, invisible.
//
//   drift     through the palettes nearest the chosen one and back, a leg
//             every few minutes
//   daylight  tinted by the real hour: rose at dawn, plain at noon, amber at
//             dusk, blue at night
//   mood      warmer when the feed is busy, cooler when it is quiet
//
// Everything here is a pure function of its inputs, so it can be tested
// without a canvas and previewed at any hour.

import { PALETTES } from './palettes.js';
import { lightnessOf, mixColors, lighten, parseColor } from './color.js';

export const LIVING_ORDER = ['still', 'drift', 'daylight', 'mood'];

export const LIVING = {
  still: { label: 'Still', note: 'The palette stays exactly as chosen.' },
  drift: {
    label: 'Slow drift',
    note: 'The colours wander to the palettes nearest this one and come back, a few minutes each way. You never see it move; after a while it is simply different.',
  },
  daylight: {
    label: 'Time of day',
    note: 'The colours follow the clock: rose at dawn, plain at midday, amber at the end of the afternoon, blue at night. For a screen that stays on all day.',
  },
  mood: {
    label: 'Mood of the feed',
    note: 'The colours warm as the feed gets busy and cool as it quietens, over tens of seconds rather than event by event.',
  },
};

/** The colour keys a living palette moves. Banner and HUD strings are left alone. */
const MOVING = ['background', 'default', 'user', 'anon', 'bot', 'alert'];

/**
 * The palettes a drift visits: the same dominant colour and a ground of about
 * the same lightness, nearest first. Drifting from paper to a night palette
 * would not be a drift.
 */
export function driftNeighbours(name, max = 3) {
  const base = PALETTES[name];
  if (!base) return [];
  const L = lightnessOf(base.colors.background);
  const near = (n) => Math.abs(lightnessOf(PALETTES[n].colors.background) - L);
  const others = Object.keys(PALETTES).filter((n) => n !== name && near(n) < 0.16);
  const same = others.filter((n) => PALETTES[n].family === base.family);
  const pool = same.length ? same : others;
  return pool.sort((a, b) => near(a) - near(b)).slice(0, max);
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Blend every moving key of two colour sets. */
function blend(from, to, t) {
  const out = { ...from };
  for (const k of MOVING) if (from[k] && to[k]) out[k] = mixColors(from[k], to[k], t);
  return out;
}

/**
 * Where a drift is at a given time. The walk always returns to the chosen
 * palette between neighbours, so the palette you picked stays the one the
 * room keeps coming back to.
 *
 * @param {string} name   the chosen palette
 * @param {number} t      ms since the drift began
 * @param {number} legMs  how long one way takes
 */
export function driftColours(name, t, legMs = 6 * 60000) {
  const base = PALETTES[name].colors;
  const neighbours = driftNeighbours(name);
  if (!neighbours.length) return { ...base };
  const legs = Math.max(0, t) / Math.max(1, legMs);
  const leg = Math.floor(legs);
  // Out to a neighbour, back to the base, out to the next.
  const target = PALETTES[neighbours[Math.floor(leg / 2) % neighbours.length]].colors;
  const within = smooth(legs - leg);
  return blend(base, target, leg % 2 === 0 ? within : 1 - within);
}

/**
 * The light of an hour. Anchors round the clock, interpolated in between: the
 * tint, how far the ground takes it, how far the marks do, and how much
 * lighter or darker the ground gets.
 */
const DAY = [
  [0, '#1d3a78', 0.3, 0.18, -0.05],
  [5, '#27477f', 0.26, 0.16, -0.03],
  [7, '#f4a38a', 0.22, 0.16, 0.0],
  [10, '#ffe6b8', 0.1, 0.08, 0.03],
  [13, '#ffffff', 0.04, 0.0, 0.04],
  [17, '#f5b25a', 0.16, 0.12, 0.01],
  [19, '#f08a3c', 0.26, 0.18, -0.01],
  [21, '#2f5a8a', 0.24, 0.15, -0.04],
  [24, '#1d3a78', 0.3, 0.18, -0.05],
];

export function lightOfHour(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  let i = 0;
  while (i < DAY.length - 2 && DAY[i + 1][0] <= h) i++;
  const [h0, c0, g0, m0, l0] = DAY[i];
  const [h1, c1, g1, m1, l1] = DAY[i + 1];
  const t = smooth((h - h0) / (h1 - h0));
  return {
    tint: mixColors(c0, c1, t),
    ground: g0 + (g1 - g0) * t,
    marks: m0 + (m1 - m0) * t,
    lift: l0 + (l1 - l0) * t,
  };
}

export function daylightColours(name, hour) {
  const base = PALETTES[name].colors;
  const light = lightOfHour(hour);
  const out = { ...base };
  out.background = unviolet(base.background, light.tint, light.ground, light.lift);
  for (const k of MOVING) {
    if (k !== 'background' && base[k]) out[k] = mixColors(base[k], light.tint, light.marks);
  }
  return out;
}

/** Red and blue both well above green: what reads as violet on a ground. */
const isViolet = (c) => {
  const { r, g, b } = parseColor(c);
  return b > g + 25 && r > g + 25;
};

/**
 * A ground tinted by the hour, never into violet. A wine or rose ground under
 * the blue of night goes purple, which is not a colour this project shows, so
 * the tint is backed off and, failing that, the night is a neutral slate.
 */
function unviolet(ground, tint, amount, lift) {
  let a = amount;
  for (let i = 0; i < 4; i++) {
    const c = lighten(mixColors(ground, tint, a), lift);
    if (!isViolet(c)) return c;
    a /= 2;
  }
  const slate = lighten(mixColors(ground, '#1f2a2e', amount), lift);
  return isViolet(slate) ? lighten(mixColors(ground, '#26302c', Math.max(0.5, amount)), lift) : slate;
}

/**
 * How busy a rate is, on a 0..1 dial. Compressed, because a feed can run at
 * two events an hour or two thousand a minute and both must land somewhere.
 */
export const busyness = (perMinute, busyAt = 240) =>
  Math.max(0, Math.min(1, Math.log1p(Math.max(0, perMinute)) / Math.log1p(busyAt)));

const WARM = '#ff9a52';
const COOL = '#5b9bd5';

/** The palette warmed or cooled by how busy the feed is (0 quiet .. 1 busy). */
export function moodColours(name, busy) {
  const base = PALETTES[name].colors;
  // Neutral at 0.4, which is roughly a feed at its ordinary pace: fully cool
  // at silence, fully warm at the busy mark.
  const lean = busy >= 0.4 ? Math.min(1, (busy - 0.4) / 0.6) : Math.max(-1, (busy - 0.4) / 0.4);
  const tint = lean >= 0 ? WARM : COOL;
  const a = Math.abs(lean);
  const out = { ...base };
  out.background = mixColors(base.background, tint, 0.14 * a);
  for (const k of MOVING) {
    if (k !== 'background' && base[k]) out[k] = mixColors(base[k], tint, 0.22 * a);
  }
  return out;
}
