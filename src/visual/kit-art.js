// A plate for each kit, cut rather than drawn.
//
// These were pictograms once -- an arc for a bell, a sine for a synth, a
// teardrop for water. Accurate, and flat: eighteen of them side by side looked
// like a stationery catalogue, and nothing in them said this was a tool for
// making anything.
//
// They are now engraved vignettes, in the manner of a nineteenth-century
// headpiece: one ink, and every tone made by how thick the line runs and how
// close it lies to its neighbour. The engine is in engrave.js and the reason
// it works is there too. What is here is only the subjects.
//
// Two rules hold the set together, and they are the reason it reads as a set:
//
//   One ink. An engraving has one plate and one colour, and the accent is used
//   for a single thing per card at most -- the struck note, the lit window.
//   The eighteen-colour version of this was the old one.
//
//   The light comes from the upper left, on every card, always. Nothing looks
//   more like clip art than a collection of objects each lit from its own
//   direction.

import {
  burin, hatch, crossHatch, contour, stipple, whiteLine,
  sphereTone, cylinderTone, gradientTone, flat, inside, over, scale, vignette, plate,
  seeded,
} from './engrave.js';

const TAU = Math.PI * 2;

/** Palette roles, named for what they do here rather than where they came from. */
function ink(palette) {
  return {
    bg: palette.background,
    line: palette.default,
    bright: palette.user || palette.default,
    accent: palette.anon,
    deep: palette.bot,
    hot: palette.alert,
  };
}

/** The whole card as a box, which is what every hatch is run over. */
const box = (w, h) => ({ x: 0, y: 0, w, h });

/**
 * A ruled sky: close horizontal lines, thinning towards the horizon.
 *
 * The most recognisable mark in the whole tradition. It costs one hatch and it
 * turns any subject into an engraving.
 */
function sky(ctx, w, h, horizon, { spacing = 5, weight = 1.3, from = 0.55, to = 0.05 } = {}) {
  hatch(ctx, { x: 0, y: 0, w, h: horizon }, 0,
    vignette(gradientTone(from, to, 0, horizon), w, h, { inset: 0.03, soft: 0.1 }),
    { spacing, weight, steps: 46, gamma: 1.1 });
}

/** A sphere, contour-hatched along its latitudes. The volume comes free. */
function sphere(ctx, cx, cy, r, o = {}) {
  const tone = vignette(sphereTone(cx, cy, r, o), 1e9, 1e9, { inset: -1, soft: 1 });
  contour(ctx, (u, v) => {
    // Latitudes: each line is an ellipse squashed by how far up the sphere it
    // sits, which is the parameterisation that makes the lines look wrapped.
    const lat = (v - 0.5) * Math.PI * 0.94;
    const rr = Math.cos(lat) * r;
    const yy = cy + Math.sin(lat) * r;
    const a = (u - 0.5) * Math.PI * 1.06;
    return [cx + Math.sin(a) * rr, yy + Math.cos(a) * rr * 0.16];
  }, tone, { lines: o.lines ?? 15, steps: 34, weight: o.weight ?? 1.7, min: 0.05 });
}

/** An upright tube: hatched across, so the tone reads as a curved surface. */
function tube(ctx, x, y, w, h, o = {}) {
  const tone = cylinderTone(x, x + w, o);
  hatch(ctx, { x, y, w, h }, Math.PI / 2, (px, py) =>
    py < y || py > y + h ? 0 : tone(px, py), { spacing: o.spacing ?? 2.2, weight: o.weight ?? 1.7, steps: 14 });
}

const PLATES = {
  // A bell in section, with the ring spreading from its mouth. The bell is a
  // solid; the ring is the absence of one, so it is cut as open arcs.
  hatnote(ctx, w, h, c) {
    const cx = w * 0.5;
    const cy = h * 0.66;
    const R = h * 0.3;
    // The profile of a bell, as a function of height: this is what the contour
    // lines are wrapped around, so the shape and the shading cannot disagree.
    // The first version hatched inside a Path2D and the lines mostly missed it.
    const half = (v) => R * (0.32 + Math.pow(v, 1.9) * 0.72);
    const top = cy - R * 1.15;
    const bottom = cy + R * 0.72;
    contour(ctx, (u, v) => {
      const hw = half(v);
      const yy = top + v * (bottom - top);
      const a = (u - 0.5) * Math.PI;
      // Each line is the visible half of a horizontal section, bulging towards
      // the viewer -- which is what turns a silhouette into a solid.
      return [cx + Math.sin(a) * hw, yy + Math.cos(a) * hw * 0.2];
    }, cylinderTone(cx - R, cx + R, { lit: 0.3, ambient: 0.14 }),
      { lines: 13, steps: 34, weight: 2.1 });
    // The lip and the crown: the two edges that catch light on a real bell.
    burin(ctx, (t) => {
      const a = (t - 0.5) * Math.PI;
      return [cx + Math.sin(a) * R * 1.04, bottom + Math.cos(a) * R * 0.21];
    }, flat(0.95), { weight: 2.6, steps: 30 });
    burin(ctx, (t) => [cx - R * 0.3 + t * R * 0.6, top - h * 0.04 + Math.pow(t - 0.5, 2) * h * 0.1],
      flat(0.8), { weight: 1.8, steps: 16 });
    // The ring, cut as open arcs so it reads as sound and not as a bowl.
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
      const rr = R * (1.45 + i * 0.5);
      burin(ctx, (t) => {
        const a = Math.PI * (1.2 + t * 0.6);
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8];
      }, flat(0.8 - i * 0.22), { weight: 1.7, steps: 22 });
    }
    ctx.globalAlpha = 1;
  },

  // A handbell: the same body as the tower bell, with the handle that makes it
  // one you could hold.
  handbells(ctx, w, h, c) {
    const cx = w * 0.46;
    const cy = h * 0.6;
    const R = h * 0.26;
    const half = (v) => R * (0.3 + Math.pow(v, 1.9) * 0.74);
    const top = cy - R * 1.05;
    const bottom = cy + R * 0.66;
    contour(ctx, (u, v) => {
      const hw = half(v);
      const a = (u - 0.5) * Math.PI;
      return [cx + Math.sin(a) * hw, top + v * (bottom - top) + Math.cos(a) * hw * 0.2];
    }, cylinderTone(cx - R, cx + R, { lit: 0.3, ambient: 0.14 }),
      { lines: 11, steps: 30, weight: 2 });
    burin(ctx, (t) => {
      const a = (t - 0.5) * Math.PI;
      return [cx + Math.sin(a) * R * 1.04, bottom + Math.cos(a) * R * 0.2];
    }, flat(0.95), { weight: 2.4, steps: 28 });
    // The handle, and the clapper hanging below the lip.
    burin(ctx, (t) => {
      const a = Math.PI * (1.15 + t * 0.7);
      return [cx + Math.cos(a) * R * 0.42, top - h * 0.02 + Math.sin(a) * R * 0.5];
    }, flat(0.85), { weight: 2.6, steps: 20 });
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(cx + R * 0.1, bottom + h * 0.05, h * 0.035, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.line;
    // A second bell, further off and smaller: a set, not a bell.
    ctx.globalAlpha = 0.5;
    contour(ctx, (u, v) => {
      const hw = R * 0.55 * (0.3 + Math.pow(v, 1.9) * 0.74);
      const a = (u - 0.5) * Math.PI;
      return [w * 0.81 + Math.sin(a) * hw, h * 0.3 + v * R * 0.95 + Math.cos(a) * hw * 0.2];
    }, flat(0.7), { lines: 8, steps: 22, weight: 1.5 });
    ctx.globalAlpha = 1;
  },

  // A thrown pot and a tuned bar: the two things in the kit, side by side, the
  // way a plate of specimens would show them.
  clay(ctx, w, h, c) {
    hatch(ctx, { x: 0, y: h * 0.74, w, h: h * 0.26 }, 0,
      (x, y) => (y < h * 0.74 ? 0 : 0.3 + (y - h * 0.74) / h * 1.2), { spacing: 4, weight: 1.7 });
    // The pot: a profile, wide at the shoulder and drawn in at the neck.
    const px = w * 0.33;
    const top = h * 0.24;
    const foot = h * 0.76;
    const half = (v) => w * 0.15 * (0.42 + Math.sin(Math.pow(v, 0.85) * Math.PI * 0.92) * 0.62);
    contour(ctx, (u, v) => {
      const hw = half(v);
      const a = (u - 0.5) * Math.PI;
      return [px + Math.sin(a) * hw, top + v * (foot - top) + Math.cos(a) * hw * 0.24];
    }, cylinderTone(px - w * 0.16, px + w * 0.16, { lit: 0.28, ambient: 0.2 }),
      { lines: 13, steps: 30, weight: 2 });
    burin(ctx, (t) => {
      const a = (t - 0.5) * Math.PI * 2;
      return [px + Math.cos(a) * half(0) , top + Math.sin(a) * h * 0.035];
    }, flat(0.9), { weight: 1.8, steps: 34 });
    // The bar, on its two cords, with the arch cut out underneath.
    const bx = w * 0.72;
    tube(ctx, bx - w * 0.09, h * 0.42, w * 0.18, h * 0.16, { lit: 0.3, spacing: 2.6, weight: 1.9 });
    ctx.globalAlpha = 0.85;
    burin(ctx, (t) => [bx - w * 0.09 + t * w * 0.18, h * 0.42], flat(0.95), { weight: 1.6, steps: 12 });
    burin(ctx, (t) => [bx - w * 0.09 + t * w * 0.18, h * 0.58 + Math.sin(t * Math.PI) * h * 0.05],
      flat(0.8), { weight: 1.4, steps: 20 });
    ctx.globalAlpha = 0.5;
    for (const dx of [-0.06, 0.06]) burin(ctx, (t) => [bx + w * dx, h * 0.3 + t * h * 0.12],
      flat(0.6), { weight: 1, steps: 6 });
    ctx.globalAlpha = 1;
  },

  // A koto: long strings over movable bridges, seen down the length of it.
  koto(ctx, w, h, c) {
    hatch(ctx, { x: 0, y: h * 0.2, w, h: h * 0.62 }, Math.PI * 0.5,
      vignette((x, y) => (y < h * 0.2 || y > h * 0.82 ? 0 : 0.26), w, h, { inset: 0.03, soft: 0.12 }),
      { spacing: 4.4, weight: 1.5 });
    // The body, in perspective: wider at the near end.
    ctx.globalAlpha = 0.9;
    burin(ctx, (t) => [t * w, h * 0.2 + t * h * 0.04], flat(0.85), { weight: 2, steps: 24 });
    burin(ctx, (t) => [t * w, h * 0.82 - t * h * 0.06], flat(0.85), { weight: 2.4, steps: 24 });
    ctx.globalAlpha = 1;
    // Thirteen strings is the instrument; seven is what reads at this size.
    for (let i = 0; i < 7; i++) {
      const v = i / 6;
      const y = h * (0.28 + v * 0.46);
      burin(ctx, (t) => [t * w, y + t * h * 0.02 * (1 - v * 2)],
        (x) => 0.35 + 0.55 * Math.sin((x / w) * Math.PI), { weight: 0.8 + v * 0.9, steps: 50 });
      // The bridge under each: a koto is tuned by sliding them, so they are
      // deliberately not in a line.
      const bx = w * (0.3 + ((i * 1.618033988749895) % 1) * 0.42);
      ctx.globalAlpha = 0.95;
      burin(ctx, (t) => [bx + (t - 0.5) * w * 0.02, y - t * h * 0.06], flat(0.9),
        { weight: 2, steps: 8 });
      ctx.globalAlpha = 1;
    }
  },

  // The dawn chorus taken apart: many small birds, none of them the subject.
  aviary(ctx, w, h, c) {
    sky(ctx, w, h, h * 0.98, { spacing: 7, from: 0.3, to: 0.03 });
    const rnd = seeded(61);
    const gull = (cx, cy, s2, alpha) => {
      ctx.globalAlpha = alpha;
      for (const dir of [-1, 1]) {
        const lead = (t) => [cx + dir * t * s2,
          cy - Math.sin(Math.pow(t, 0.75) * Math.PI * 0.85) * s2 * 0.46];
        contour(ctx, (t, v) => {
          const [x, y] = lead(t);
          return [x, y + v * s2 * 0.16 * (1 - t)];
        }, flat(0.7), { lines: 3, steps: 18, weight: 1.5 });
        burin(ctx, lead, flat(0.95), { weight: 1.7, steps: 20 });
      }
      ctx.globalAlpha = 1;
    };
    // Scattered by size and height, so the flock has depth rather than being
    // a row of the same bird.
    for (let i = 0; i < 11; i++) {
      const s2 = Math.min(w, h) * (0.07 + rnd() * 0.16);
      gull(w * (0.06 + rnd() * 0.88), h * (0.14 + rnd() * 0.72), s2, 0.35 + rnd() * 0.6);
    }
  },

  // A physics plate: an oscillogram ruled on a hatched ground, the way a
  // vibrating-plate figure was published in 1870.
  synth(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    hatch(ctx, box(w, h), Math.PI / 2,
      vignette(gradientTone(0.2, 0.06, 0, h), w, h, { inset: 0.05, soft: 0.12 }),
      { spacing: 4.2, weight: 1.2, steps: 22 });
    // The trace itself, cut heavy: a plate always has one line that is the
    // measurement and everything else is the ground it sits on.
    burin(ctx, (t) => [t * w, h / 2 + Math.sin(t * TAU * 2.2) * h * 0.27], (x) => {
      const u = x / w;
      return 0.45 + 0.55 * Math.abs(Math.sin(u * TAU * 1.1));
    }, { weight: 3.4, steps: 130 });
    ctx.globalAlpha = 0.5;
    burin(ctx, (t) => [0, t * h], flat(0.6), { weight: 1.2, steps: 4 });
    burin(ctx, (t) => [t * w, h / 2], flat(0.35), { weight: 0.9, steps: 4 });
    ctx.globalAlpha = 1;
  },

  // A drop, and the rings it is about to make on a ruled surface.
  water(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    hatch(ctx, { x: 0, y: h * 0.6, w, h: h * 0.4 }, 0,
      vignette((x, y) => (y < h * 0.6 ? 0 : 0.42 - (y - h * 0.6) / h * 0.4), w, h, { inset: 0.04, soft: 0.1 }),
      { spacing: 3, weight: 1.6, steps: 40 });
    for (let i = 0; i < 4; i++) {
      const rr = w * (0.08 + i * 0.1);
      ctx.globalAlpha = 0.85 - i * 0.16;
      burin(ctx, (t) => {
        const a = t * TAU;
        return [w * 0.5 + Math.cos(a) * rr, h * 0.78 + Math.sin(a) * rr * 0.26];
      }, (x) => 0.35 + 0.6 * Math.max(0, Math.cos(((x - w * 0.42) / w) * 3)), { weight: 1.9, steps: 46 });
    }
    ctx.globalAlpha = 1;
    sphere(ctx, w * 0.5, h * 0.3, h * 0.15, { lines: 10, weight: 1.6 });
  },

  // The comb of a cylinder music box: graduated tines, each a lit edge.
  musicbox(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    const n = 13;
    for (let i = 0; i < n; i++) {
      const x = w * 0.14 + (i / (n - 1)) * w * 0.72;
      const len = h * (0.24 + (1 - i / (n - 1)) * 0.42);
      // The tine, and the shadow it throws to its right: two lines, and the
      // pair is what lifts it off the plate.
      burin(ctx, (t) => [x, h * 0.78 - t * len], (px, py) => 0.35 + 0.6 * (1 - (h * 0.78 - py) / len), { weight: 2.6, steps: 16 });
      ctx.globalAlpha = 0.4;
      burin(ctx, (t) => [x + 1.6, h * 0.78 - t * len * 0.96], flat(0.5), { weight: 1.2, steps: 10 });
      ctx.globalAlpha = 1;
    }
    // The bedplate they are cut from.
    hatch(ctx, { x: w * 0.08, y: h * 0.78, w: w * 0.84, h: h * 0.1 }, 0,
      (x, y) => (y < h * 0.78 || y > h * 0.88 ? 0 : 0.75), { spacing: 2.4, weight: 1.8, steps: 12 });
  },

  // Tuned bars seen along the row, each a lit cylinder.
  // Bars seen from a little above, with the frame under them. The resonators
  // are left off: at this size a tube under every bar merged with the bar and
  // the row read as a barcode, which is what the first two versions were.
  marimba(ctx, w, h, c) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const bw = w * (0.115 - u * 0.035);
      const x = w * 0.1 + u * w * 0.76;
      const bh = h * (0.6 - u * 0.24);
      const y = h * 0.46 - bh / 2;
      // The top face, lit: a bar is a box, and one visible face is what makes
      // it read as a solid rather than a stripe.
      contour(ctx, (t, v) => [x + t * bw + v * w * 0.02, y - v * h * 0.05],
        (px) => 0.22 + ((px - x) / bw) * 0.3, { lines: 4, steps: 10, weight: 1.5 });
      // The front face, shaded across.
      tube(ctx, x, y, bw, bh, { lit: 0.26, ambient: 0.2, spacing: 3, weight: 1.9 });
      burin(ctx, (t) => [x, y + t * bh], flat(0.95), { weight: 1.4, steps: 6 });
      burin(ctx, (t) => [x + bw, y + t * bh], flat(0.55), { weight: 1.2, steps: 6 });
    }
    // The two rails the bars rest on, which is the only thing that says frame.
    ctx.globalAlpha = 0.7;
    for (const yy of [0.24, 0.72]) {
      burin(ctx, (t) => [w * 0.05 + t * w * 0.9, h * yy + t * h * 0.06],
        flat(0.6), { weight: 1.6, steps: 20 });
    }
    ctx.globalAlpha = 1;
  },

  // A gong: one disc, hatched radially, with the hammer that struck it.
  gongs(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    const cx = w * 0.46;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.38;
    const tone = sphereTone(cx, cy, R, { ambient: 0.3, bounce: 0.5 });
    // Radial rather than latitudinal: a gong is hammered from the centre out,
    // and the marks on a real one run that way.
    contour(ctx, (u, v) => {
      const a = v * TAU;
      const rr = u * R;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    }, tone, { lines: 34, steps: 18, weight: 1.5, min: 0.06 });
    ctx.globalAlpha = 0.9;
    burin(ctx, (t) => [cx + Math.cos(t * TAU) * R, cy + Math.sin(t * TAU) * R],
      flat(0.95), { weight: 2.4, steps: 60 });
    ctx.globalAlpha = 1;
    // The beater, in the accent: the one struck thing on the plate.
    ctx.fillStyle = c.accent;
    burin(ctx, (t) => [w * 0.9 - t * w * 0.16, h * 0.24 + t * h * 0.14], flat(0.85), { weight: 2, steps: 8 });
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.38, h * 0.06, 0, TAU);
    ctx.fill();
  },

  // A glass: the highlight is where the line stops, not where anything white
  // is painted. That is the whole difference between engraving and drawing.
  glassy(ctx, w, h, c) {
    const cx = w * 0.5;
    const rim = h * 0.16;
    const foot = h * 0.7;
    // Same trick as the bell: the form is a profile, and the lines are its
    // sections. Hatching inside a Path2D gave a rectangle with the corners cut
    // off, because the tone was sampled far too coarsely to find the edge.
    const half = (v) => w * 0.15 * (1 - Math.pow(v, 2.6) * 0.94);
    contour(ctx, (u, v) => {
      const hw = half(v);
      const yy = rim + v * (foot - rim);
      const a = (u - 0.5) * Math.PI;
      return [cx + Math.sin(a) * hw, yy + Math.cos(a) * hw * 0.28];
    }, (x) => {
      // Two highlights, near and far, because glass is lit twice: through it
      // and off it. The line simply stops at each, which is how a highlight is
      // made when the only material you have is ink.
      const u = (x - (cx - w * 0.15)) / (w * 0.3);
      const lit = Math.exp(-Math.pow((u - 0.24) * 6, 2)) + 0.6 * Math.exp(-Math.pow((u - 0.86) * 8, 2));
      return Math.max(0, 0.78 - lit);
    }, { lines: 12, steps: 30, weight: 2 });
    // Rim, stem and foot: the drawing that makes it a glass rather than a bowl.
    burin(ctx, (t) => {
      const a = (t - 0.5) * Math.PI * 2;
      return [cx + Math.cos(a) * w * 0.15, rim + Math.sin(a) * h * 0.045];
    }, flat(0.95), { weight: 1.8, steps: 44 });
    burin(ctx, (t) => [cx, foot + t * h * 0.16], flat(0.85), { weight: 2.2, steps: 8 });
    burin(ctx, (t) => {
      const a = (t - 0.5) * Math.PI * 2;
      return [cx + Math.cos(a) * w * 0.1, h * 0.88 + Math.sin(a) * h * 0.03];
    }, flat(0.9), { weight: 2, steps: 34 });
  },

  // Hanging tubes, graduated, each catching the light down one side.
  chimes(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = w * 0.2 + u * w * 0.6;
      const len = h * (0.68 - u * 0.3);
      tube(ctx, x - w * 0.022, h * 0.2, w * 0.044, len, { lit: 0.32, spacing: 1.8, weight: 1.6 });
      ctx.globalAlpha = 0.45;
      burin(ctx, (t) => [x, h * 0.08 + t * h * 0.12], flat(0.7), { weight: 0.9, steps: 4 });
      ctx.globalAlpha = 1;
    }
    // The bar they hang from.
    hatch(ctx, { x: w * 0.12, y: h * 0.06, w: w * 0.76, h: h * 0.04 }, 0,
      (x, y) => (y < h * 0.06 || y > h * 0.1 ? 0 : 0.8), { spacing: 2, weight: 1.6, steps: 10 });
  },

  // A steel pan: a dome beaten into facets, each facet a note.
  steelpan(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    const cx = w * 0.5;
    const cy = h * 0.54;
    const R = Math.min(w, h) * 0.4;
    contour(ctx, (u, v) => {
      const a = (v - 0.5) * Math.PI * 0.9;
      const rr = R * (0.15 + u * 0.85);
      return [cx + Math.sin(a) * rr, cy - Math.cos(a) * rr * 0.5 + rr * 0.16];
    }, sphereTone(cx, cy - R * 0.2, R * 1.2, { ambient: 0.2 }), { lines: 16, steps: 22, weight: 1.6 });
    ctx.globalAlpha = 0.9;
    burin(ctx, (t) => [cx + Math.cos(t * TAU) * R, cy + Math.sin(t * TAU) * R * 0.62],
      flat(0.9), { weight: 2.2, steps: 54 });
    // The note faces, in the accent: the only thing on the plate that is tuned.
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.8;
    for (const [ax, ay, rr] of [[-0.42, -0.1, 0.2], [0.1, -0.26, 0.16], [0.34, 0.12, 0.18]]) {
      burin(ctx, (t) => [cx + ax * R + Math.cos(t * TAU) * rr * R,
        cy + ay * R + Math.sin(t * TAU) * rr * R * 0.6], flat(0.8), { weight: 1.4, steps: 26 });
    }
    ctx.globalAlpha = 1;
  },

  // Strings over a bridge, and the body under them.
  // An f-hole and four strings. The bridge-and-belly version said nothing at
  // this size; an f-hole is the one shape nobody mistakes for anything else.
  strings(ctx, w, h, c) {
    hatch(ctx, box(w, h), Math.PI * 0.5,
      vignette((x, y) => 0.3 - Math.abs(y / h - 0.5) * 0.3, w, h, { inset: 0.05, soft: 0.16 }),
      { spacing: 4.6, weight: 1.4 });
    const fx = w * 0.32;
    const cy = h * 0.5;
    const fs = h * 0.34;
    // The f: a slanted stem with a curl at each end, the curls turning
    // opposite ways. That opposition is the whole character of the shape.
    for (const dir of [-1, 1]) {
      const ex = fx + dir * fs * 0.22;
      const ey = cy + dir * fs;
      burin(ctx, (t) => {
        const a = (dir > 0 ? 1 : -1) * (t * Math.PI * 1.5) + (dir > 0 ? 0.6 : -0.6);
        return [ex + Math.cos(a) * fs * 0.2, ey + Math.sin(a) * fs * 0.2];
      }, flat(0.9), { weight: 1.8, steps: 22 });
      // The nick halfway up, which every f-hole has.
      burin(ctx, (t) => [fx + dir * fs * 0.06 + t * dir * fs * 0.16, cy - dir * fs * 0.06],
        flat(0.7), { weight: 1.3, steps: 6 });
    }
    burin(ctx, (t) => [fx - fs * 0.22 + t * fs * 0.44, cy + fs * (1 - t * 2)],
      (px, py) => 0.55 + 0.45 * Math.sin((py / h) * Math.PI), { weight: 3.4, steps: 30 });
    // The strings, graduated: the whole visual idea of a string instrument,
    // and it costs four lines.
    for (let i = 0; i < 4; i++) {
      const y = h * (0.24 + i * 0.17);
      ctx.globalAlpha = 0.9;
      burin(ctx, (t) => [w * 0.02 + t * w * 0.96, y],
        (x) => 0.3 + 0.6 * Math.sin((x / w) * Math.PI), { weight: 0.8 + i * 0.75, steps: 60 });
    }
    ctx.globalAlpha = 1;
  },

  // A bird against a ruled sky, cut as a silhouette with the light behind it.
  // A gull, drawn as two hatched wings rather than as a set of rays. The rays
  // version came out as a fountain: they all radiated from one point, and a
  // wing does not.
  birds(ctx, w, h, c) {
    sky(ctx, w, h, h * 0.98, { spacing: 6.5, from: 0.32, to: 0.03 });
    const gull = (cx, cy, s, alpha) => {
      ctx.globalAlpha = alpha;
      for (const dir of [-1, 1]) {
        // Leading and trailing edge of one wing; the lines between them are
        // what fills it. A gull's wing rises from the body, peaks at the
        // wrist, and falls to the tip -- which is the shape of the curve.
        const lead = (t) => [cx + dir * t * s, cy - Math.sin(Math.pow(t, 0.75) * Math.PI * 0.85) * s * 0.46];
        const thick = (t) => s * 0.2 * (1 - t) * (0.35 + Math.sin(t * Math.PI));
        contour(ctx, (t, v) => {
          const [x, y] = lead(t);
          return [x, y + v * thick(t)];
        }, (px, py) => 0.45 + 0.5 * (1 - Math.abs(px - cx) / s), { lines: 5, steps: 26, weight: 1.7 });
        // The leading edge, heavier: on a bird against the sky it is the one
        // line that is genuinely sharp.
        burin(ctx, lead, flat(0.95), { weight: 2, steps: 28 });
      }
      // The body, tucked between the wings, and the head in front of it.
      contour(ctx, (t, v) => [cx - s * 0.16 + t * s * 0.34, cy + v * s * 0.1 + Math.sin(t * Math.PI) * s * 0.03],
        flat(0.9), { lines: 3, steps: 12, weight: 2 });
      burin(ctx, (t) => [cx + s * 0.18 + t * s * 0.12, cy - t * s * 0.03], flat(0.85), { weight: 1.4, steps: 6 });
      ctx.globalAlpha = 1;
    };
    gull(w * 0.4, h * 0.46, Math.min(w, h) * 0.46, 1);
    gull(w * 0.78, h * 0.26, Math.min(w, h) * 0.15, 0.6);
    gull(w * 0.86, h * 0.5, Math.min(w, h) * 0.1, 0.45);
  },

  // A moon over a ruled night, with the stars pricked in.
  night(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    sky(ctx, w, h, h, { spacing: 3, from: 0.78, to: 0.3 });
    stipple(ctx, box(w, h), vignette(gradientTone(0.5, 0.15, 0, h), w, h, { inset: 0.05, soft: 0.1 }),
      { count: 220, size: 0.55, seed: 5, band: [0.1, 0.6] });
    // The moon is the one place the plate is left bare, which is how a bright
    // thing is made when the ink is the only material you have.
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.arc(w * 0.68, h * 0.36, h * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.line;
    sphere(ctx, w * 0.68, h * 0.36, h * 0.2, { lx: -0.75, ly: -0.35, lines: 12, weight: 1.5, ambient: 0.06 });
  },

  // A breaking wave, cut white-line: the subject is light, so the light is
  // what gets carved out of the block.
  // A wave with a hollow under it. The first version drew the crest as a plain
  // arc and it read as a hill: what makes a wave a wave is the overhang, so
  // the underside is drawn before anything else.
  // One wave, seen along the beach, with the crest rolling over into a curl.
  //
  // Two earlier versions failed the same way: they drew the top of the wave as
  // a curve and left it there, and a curve with nothing under it is a hill.
  // What makes a wave is that the top has travelled further than the bottom --
  // so every line here rises, reaches the crest, and then keeps going, into a
  // spiral that ends pointing back the way it came.
  shore(ctx, w, h, c) {
    sky(ctx, w, h, h * 0.4, { spacing: 6.5, from: 0.26, to: 0.03 });
    // The sea behind, and the horizon that puts the wave in front of it.
    hatch(ctx, { x: 0, y: h * 0.4, w, h: h * 0.16 }, 0,
      (x, y) => (y < h * 0.4 || y > h * 0.56 ? 0 : 0.3), { spacing: 4.5, weight: 1.4 });
    const crestX = w * 0.66;
    const crestY = h * 0.34;
    const curlR = h * 0.15;
    // v is depth into the wave: 0 is the lip, 1 the trough. Each line runs the
    // whole way and its curl is a touch tighter than the one above it.
    const line = (t, v) => {
      if (t < 0.72) {
        const u = t / 0.72;
        const x = w * 0.02 + u * (crestX - w * 0.02);
        const rise = Math.pow(u, 2.1);
        return [x, h * 0.82 - rise * (h * 0.82 - crestY) + v * h * 0.2 * (1 - rise * 0.55)];
      }
      // Past the crest the line rolls forward and under, which is the curl.
      const a = ((t - 0.72) / 0.28) * Math.PI * 1.55;
      const rr = curlR * (1 - v * 0.5) * (1 - a / (Math.PI * 2.6));
      return [crestX + Math.sin(a) * rr, crestY + curlR * (1 - v * 0.5) - Math.cos(a) * rr];
    };
    contour(ctx, line, (px, py) => 0.3 + 0.55 * (px / w) + 0.2 * (1 - py / h),
      { lines: 8, steps: 64, weight: 2.1 });
    // The lip itself, heaviest, and the hollow under it left as bare plate.
    burin(ctx, (t) => line(t, 0), flat(0.95), { weight: 2.8, steps: 70 });
    whiteLine(ctx, c.bg, () => {
      burin(ctx, (t) => {
        const a = 0.4 + t * 2.2;
        return [crestX + Math.sin(a) * curlR * 0.52, crestY + curlR * 0.9 - Math.cos(a) * curlR * 0.52];
      }, flat(0.9), { weight: 3, steps: 26 });
    });
    // Spray off the lip, thrown forward.
    const rnd = seeded(23);
    for (let i = 0; i < 40; i++) {
      const x = crestX + (rnd() - 0.6) * w * 0.36;
      const y = crestY - rnd() * h * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, 0.4 + rnd() * 1.1, 0, TAU);
      ctx.fill();
    }
  },

  // Flame, also white-line, and for the same reason.
  // The ground runs across and the flames run up. In the first version both
  // ran the same way, so the white-line flames disappeared into the hatching
  // they were supposed to be cut out of.
  fire(ctx, w, h, c) {
    hatch(ctx, box(w, h), 0,
      vignette(gradientTone(0.9, 0.22, h, 0), w, h, { inset: 0.03, soft: 0.12 }),
      { spacing: 3.2, weight: 2.4 });
    whiteLine(ctx, c.bg, () => {
      const rnd = seeded(41);
      for (let i = 0; i < 6; i++) {
        const x0 = w * (0.2 + i * 0.12 + (rnd() - 0.5) * 0.05);
        const lean = (rnd() - 0.5) * w * 0.22;
        const top = h * (0.08 + rnd() * 0.24);
        const fat = 5 + rnd() * 3;
        burin(ctx, (t) => [
          x0 + lean * t * t + Math.sin(t * 5 + i) * w * 0.022,
          h * 0.9 - t * (h * 0.9 - top),
        ], (px, py) => {
          const u = (h * 0.9 - py) / (h * 0.9 - top);
          return Math.max(0, 1 - Math.pow(u, 0.65));
        }, { weight: fat, steps: 32 });
      }
    });
    ctx.fillStyle = c.hot;
    const rnd = seeded(7);
    for (let i = 0; i < 16; i++) {
      ctx.globalAlpha = 0.35 + rnd() * 0.55;
      ctx.beginPath();
      ctx.arc(w * (0.18 + rnd() * 0.64), h * (0.2 + rnd() * 0.5), 0.6 + rnd() * 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.line;
  },

  // Reeds against a low sky, and a heron standing in it.
  // Reeds, and a heron standing in them. The heron is drawn to a real bird's
  // proportions -- the body is small and the neck is most of the height --
  // because the version that was not looked like a chair.
  camargue(ctx, w, h, c) {
    sky(ctx, w, h, h * 0.7, { spacing: 6, from: 0.34, to: 0.03 });
    hatch(ctx, { x: 0, y: h * 0.7, w, h: h * 0.3 }, Math.PI * 0.02,
      (x, y) => (y < h * 0.7 ? 0 : 0.22 + (y - h * 0.7) / h * 1.5),
      { spacing: 4.4, weight: 1.8 });
    const hx = w * 0.34;
    const ground = h * 0.82;
    const bodyY = ground - h * 0.24;
    // Legs: long, thin, and slightly apart.
    burin(ctx, (t) => [hx - w * 0.012 + t * w * 0.004, ground - t * h * 0.22], flat(0.9), { weight: 1.4, steps: 8 });
    burin(ctx, (t) => [hx + w * 0.022 - t * w * 0.006, ground - t * h * 0.22], flat(0.6), { weight: 1.2, steps: 8 });
    // Body: a small hatched oval, and the tail behind it.
    contour(ctx, (t, v) => {
      const a = t * Math.PI;
      return [hx - w * 0.05 + Math.cos(a) * w * 0.055, bodyY + v * h * 0.035 + Math.sin(a) * h * 0.03];
    }, flat(0.85), { lines: 4, steps: 20, weight: 1.8 });
    burin(ctx, (t) => [hx - w * 0.1 - t * w * 0.05, bodyY + t * h * 0.03], flat(0.75), { weight: 1.6, steps: 8 });
    // Neck: the S, which is the whole recognition of a heron.
    burin(ctx, (t) => [
      hx - w * 0.01 + Math.sin(t * 2.6) * w * 0.045,
      bodyY - t * h * 0.3,
    ], flat(0.9), { weight: 1.7, steps: 24 });
    // Head and dagger beak.
    burin(ctx, (t) => [hx + w * 0.018 + t * w * 0.03, bodyY - h * 0.3 - t * h * 0.008], flat(0.95), { weight: 2, steps: 8 });
    burin(ctx, (t) => [hx + w * 0.048 + t * w * 0.06, bodyY - h * 0.302 + t * h * 0.012], flat(0.9), { weight: 1.1, steps: 6 });
    // Reeds in front, thin and few: they frame the bird instead of hiding it.
    const rnd = seeded(17);
    for (let i = 0; i < 13; i++) {
      const x = w * (0.02 + rnd() * 0.96);
      if (Math.abs(x - hx) < w * 0.06) continue;
      const top = h * (0.34 + rnd() * 0.28);
      const lean = (rnd() - 0.5) * w * 0.06;
      burin(ctx, (t) => [x + lean * t * t, h * 0.86 - t * (h * 0.86 - top)],
        (px, py) => 0.25 + 0.6 * ((py - top) / (h * 0.86 - top)), { weight: 1.7, steps: 16 });
    }
  },

  // A rose window: tracery, and the light behind it.
  cathedral(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    hatch(ctx, box(w, h), Math.PI / 2,
      vignette(flat(0.75), w, h, { inset: 0.03, soft: 0.14 }), { spacing: 2.8, weight: 2, steps: 20 });
    const cx = w * 0.5;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.42;
    // The window is bare plate: light comes through it, so no ink is laid.
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = c.line;
    // Tracery: the spokes, the inner ring, and the foils between them.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      burin(ctx, (t) => [cx + Math.cos(a) * R * (0.28 + t * 0.72), cy + Math.sin(a) * R * (0.28 + t * 0.72)],
        flat(0.85), { weight: 1.9, steps: 10 });
    }
    for (const rr of [0.28, 0.62, 1]) {
      burin(ctx, (t) => [cx + Math.cos(t * TAU) * R * rr, cy + Math.sin(t * TAU) * R * rr],
        flat(rr === 1 ? 0.95 : 0.7), { weight: rr === 1 ? 2.6 : 1.7, steps: 56 });
    }
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * TAU;
      const px = cx + Math.cos(a) * R * 0.81;
      const py = cy + Math.sin(a) * R * 0.81;
      burin(ctx, (t) => [px + Math.cos(t * TAU) * R * 0.13, py + Math.sin(t * TAU) * R * 0.13],
        flat(0.6), { weight: 1.3, steps: 20 });
    }
    // One lit pane, in the accent.
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.arc(cx + R * 0.4, cy - R * 0.34, R * 0.12, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  // Two tape reels, which is literally what the piece is made of.
  airports(ctx, w, h, c) {
    ctx.fillStyle = c.line;
    hatch(ctx, box(w, h), 0,
      vignette(gradientTone(0.34, 0.1, h, 0), w, h, { inset: 0.04, soft: 0.12 }),
      { spacing: 3.4, weight: 1.4, steps: 30 });
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.3;
    for (const [cx, rr] of [[w * 0.28, R], [w * 0.72, R * 0.78]]) {
      // The wound tape: close concentric lines, which is exactly what a reel
      // looks like and exactly what an engraver does anyway.
      contour(ctx, (u, v) => {
        const a = u * TAU;
        const radius = rr * (0.34 + v * 0.66);
        return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius];
      }, sphereTone(cx, cy, rr * 1.4, { ambient: 0.42, bounce: 0 }), { lines: 11, steps: 40, weight: 1.5 });
      burin(ctx, (t) => [cx + Math.cos(t * TAU) * rr, cy + Math.sin(t * TAU) * rr],
        flat(0.9), { weight: 2, steps: 48 });
      ctx.beginPath();
      ctx.arc(cx, cy, rr * 0.14, 0, TAU);
      ctx.fill();
    }
    // The tape between them, which is the loop.
    ctx.globalAlpha = 0.9;
    burin(ctx, (t) => [w * 0.28 + t * w * 0.44, cy - R * 1.02 + Math.sin(t * Math.PI) * h * 0.05],
      flat(0.8), { weight: 1.6, steps: 26 });
    burin(ctx, (t) => [w * 0.28 + t * w * 0.44, cy + R * 1.02 - Math.sin(t * Math.PI) * h * 0.05],
      flat(0.8), { weight: 1.6, steps: 26 });
    ctx.globalAlpha = 1;
  },

  // An ice face: flat planes, and one crevasse.
  // Three planes and the edges between them. The four-plane version was a
  // muddle: at this size each face has to be big enough to show its own
  // direction of line, which is the only thing telling you it is a plane.
  // An ice front: three planes, lit from the left, with the crevasse between
  // the two that face away from each other.
  //
  // The symmetric version read as a tent. A glacier does not have a summit in
  // the middle of the frame, so the ridge is off to one side and the faces are
  // deliberately unequal.
  glacier(ctx, w, h, c) {
    sky(ctx, w, h, h * 0.3, { spacing: 6.5, from: 0.26, to: 0.03 });
    const faces = [
      // The lit face is not white: on ice it still takes a line, or it reads
      // as a hole in the plate.
      { pts: [[0, 0.44], [0.34, 0.16], [0.46, 0.62], [0, 0.78]], angle: 1.32, tone: 0.42 },
      { pts: [[0.34, 0.16], [1, 0.44], [1, 0.8], [0.46, 0.62]], angle: -0.36, tone: 0.72 },
      { pts: [[0, 0.78], [0.46, 0.62], [1, 0.8], [1, 1], [0, 1]], angle: 0.05, tone: 0.95 },
    ];
    for (const f of faces) {
      const path = new Path2D();
      f.pts.forEach(([px, py], i) =>
        i === 0 ? path.moveTo(px * w, py * h) : path.lineTo(px * w, py * h));
      path.closePath();
      hatch(ctx, box(w, h), f.angle, inside(ctx, path, flat(f.tone)),
        { spacing: 3.6, weight: 2.1 });
    }
    ctx.globalAlpha = 0.95;
    for (const [a, b] of [[[0, 0.44], [0.34, 0.16]], [[0.34, 0.16], [1, 0.44]],
      [[0.34, 0.16], [0.46, 0.62]], [[0, 0.78], [0.46, 0.62]], [[0.46, 0.62], [1, 0.8]]]) {
      burin(ctx, (t) => [(a[0] + (b[0] - a[0]) * t) * w, (a[1] + (b[1] - a[1]) * t) * h],
        flat(0.95), { weight: 2, steps: 24 });
    }
    ctx.globalAlpha = 1;
    // The crevasse: bare plate, because the light inside ice is the subject.
    whiteLine(ctx, c.bg, () => {
      burin(ctx, (t) => [w * (0.49 + t * 0.06), h * (0.26 + t * 0.5)],
        (px, py) => 1 - ((py / h) - 0.26) * 0.8, { weight: 3.8, steps: 26 });
    });
  },

};

/** Anything without a plate of its own gets a ruled ground and a rule. */
function fallback(ctx, w, h, c) {
  ctx.fillStyle = c.line;
  hatch(ctx, box(w, h), Math.PI * 0.25,
    vignette(gradientTone(0.45, 0.12, 0, h), w, h, { inset: 0.06, soft: 0.14 }),
    { spacing: 4, weight: 1.6, steps: 26 });
}

export const KIT_ART_NAMES = Object.keys(PLATES);

/**
 * Cut a kit's plate onto a context. Synchronous, and never throws.
 *
 * Everything is drawn in one ink -- `fillStyle` is set once by each subject and
 * the burin only ever fills -- so a card cannot end up in a colour the palette
 * does not have.
 */
export function drawKitArt(ctx, kitName, { w, h, palette } = {}) {
  const c = ink(palette);
  ctx.save();
  try {
    plate(ctx, w, h, { ground: c.bg, ink: c.line });
    ctx.fillStyle = c.line;
    (PLATES[kitName] || fallback)(ctx, w, h, c);
  } catch (e) {
    ctx.restore();
    ctx.globalAlpha = 1;
    return false;
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}
