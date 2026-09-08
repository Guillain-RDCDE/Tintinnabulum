// A burin, and the things you can cut with one.
//
// The kit cards used to be pictograms: an arc for a bell, a sine for a synth,
// a teardrop for water. Accurate labels, and flat -- twelve of them side by
// side looked like a stationery catalogue.
//
// Engraving is a better answer than a better pictogram, and not for nostalgia.
// An engraving is built from exactly what a canvas is good at: one ink, one
// line at a time, and every tone in the picture made by how thick that line is
// and how close it runs to its neighbour. It stays sharp at any size, it costs
// nothing to ship, and it takes the palette like everything else here.
//
// The one detail that matters more than all the others is that a burin line
// SWELLS AND TAPERS. A comb of even lines reads as a screen door; a line that
// thickens where the form turns away from the light and thins to nothing where
// it faces the light reads as a solid object. So no line here is stroked --
// each is a filled polygon whose width follows the tone underneath it. That is
// the whole engine, and everything else is a shape to run it over.
//
// The vocabulary is the trade's own:
//
//   hatch          parallel lines, one direction
//   crossHatch     a second set over the darkest passages only
//   contour        lines that follow the form, which is what gives volume
//   stipple        dots between the lines, so mid-tones are not mechanical
//   whiteLine      cutting light out of a dark ground, after Bewick
//
// A `tone` is a function (x, y) -> 0..1, where 1 is fully dark. Every mark
// asks the tone what to do; the composition only has to say where the form is.

const TAU = Math.PI * 2;

/** A small deterministic generator, so a repaint is identical to the last. */
export function seeded(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * One burin line, cut along a path.
 *
 * The path is a function of t in 0..1 returning [x, y]; the width at each
 * point comes from `tone`. Where the tone falls to nothing the line tapers to
 * nothing, which is how an engraved highlight is made -- by the absence of the
 * line rather than by painting anything white.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {(t: number) => number[]} at
 * @param {(x: number, y: number) => number} tone
 * @param {object} [o]
 * @param {number} [o.weight]   width of the line at full dark, in pixels
 * @param {number} [o.steps]    samples along the line
 * @param {number} [o.gamma]    <1 spreads the darks, >1 holds them back
 * @param {number} [o.min]      tone below this cuts the line entirely
 */
export function burin(ctx, at, tone, { weight = 1.5, steps = 26, gamma = 1, min = 0.04 } = {}) {
  const upper = [];
  const lower = [];
  const flush = () => {
    if (upper.length < 2) {
      upper.length = 0;
      lower.length = 0;
      return;
    }
    ctx.beginPath();
    ctx.moveTo(upper[0][0], upper[0][1]);
    for (let i = 1; i < upper.length; i++) ctx.lineTo(upper[i][0], upper[i][1]);
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i][0], lower[i][1]);
    ctx.closePath();
    ctx.fill();
    upper.length = 0;
    lower.length = 0;
  };

  let prev = at(0);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = at(t);
    // The normal comes from the direction of travel, so a curved line swells
    // outward from its own path rather than from the page.
    const nx = p[0] - prev[0];
    const ny = p[1] - prev[1];
    const len = Math.hypot(nx, ny) || 1;
    const ux = -ny / len;
    const uy = nx / len;
    const v = Math.max(0, Math.min(1, tone(p[0], p[1])));
    if (v < min) {
      // A break in the line. Engravers do this deliberately at a highlight,
      // and it is the reason a burin drawing has air in it.
      flush();
    } else {
      const w = (Math.pow(v, gamma) * weight) / 2;
      upper.push([p[0] + ux * w, p[1] + uy * w]);
      lower.push([p[0] - ux * w, p[1] - uy * w]);
    }
    prev = p;
  }
  flush();
}

/**
 * Parallel burin lines across a box.
 *
 * @param {object} box   {x, y, w, h}
 * @param {number} angle radians
 */
export function hatch(ctx, box, angle, tone, o = {}) {
  const { spacing = 4, weight = 1.6, gamma = 1, min = 0.04 } = o;
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  // Long enough to cross the box at any angle, so no line stops short of the
  // form it is meant to be shading.
  const reach = Math.hypot(w, h) / 2;
  // A sample every pixel and a half, unless the caller says otherwise. A fixed
  // count was the first version and it was wrong in a way that showed: where
  // the tone is a hard edge -- the inside of a shape -- twenty samples along a
  // line crossing the whole card cannot find the edge, and the shape came out
  // as a rectangle with the corners cut off.
  const steps = o.steps ?? Math.max(24, Math.min(260, Math.round((reach * 2) / 1.5)));
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy;
  const py = dx;
  const lines = Math.ceil((reach * 2) / spacing);
  for (let i = -lines; i <= lines; i++) {
    const ox = cx + px * i * spacing;
    const oy = cy + py * i * spacing;
    burin(
      ctx,
      (t) => [ox + dx * (t * 2 - 1) * reach, oy + dy * (t * 2 - 1) * reach],
      tone,
      { weight, steps, gamma, min }
    );
  }
}

/**
 * A second set of lines, over the dark passages only.
 *
 * Cross-hatching everywhere turns a picture into tartan. The remapped tone is
 * what keeps the second set where it belongs: it appears only past the point
 * where one set of lines has run out of darkness to give.
 */
export function crossHatch(ctx, box, angle, tone, o = {}) {
  const from = o.from ?? 0.45;
  hatch(ctx, box, angle, (x, y) => {
    const v = tone(x, y);
    return v <= from ? 0 : (v - from) / (1 - from);
  }, o);
}

/**
 * Lines that follow a form rather than the page.
 *
 * This is what makes an engraved sphere a sphere. `path` maps (u, v) to a
 * point, where u runs along each line and v selects the line: give it the
 * parameterisation of the surface and the shading comes out right.
 */
export function contour(ctx, path, tone, { lines = 14, steps = 30, weight = 1.6, gamma = 1, min = 0.04 } = {}) {
  for (let i = 0; i < lines; i++) {
    const v = lines === 1 ? 0.5 : i / (lines - 1);
    burin(ctx, (u) => path(u, v), tone, { weight, steps, gamma, min });
  }
}

/**
 * Dots, where the tone is neither dark enough for a line nor light enough for
 * nothing. Real engravers call it flick work and use it to stop mid-tones
 * looking ruled; here it does the same job.
 */
export function stipple(ctx, box, tone, { count = 260, size = 0.7, seed = 11, band = [0.12, 0.7] } = {}) {
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const x = box.x + rnd() * box.w;
    const y = box.y + rnd() * box.h;
    const v = tone(x, y);
    if (v < band[0] || v > band[1]) continue;
    // Rejection against the tone, so the density follows the shading rather
    // than being uniform inside a band.
    if (rnd() > (v - band[0]) / (band[1] - band[0])) continue;
    ctx.beginPath();
    ctx.arc(x, y, size * (0.6 + v * 0.8), 0, TAU);
    ctx.fill();
  }
}

/**
 * Cut light lines out of a dark ground: wood engraving rather than copper.
 *
 * Bewick's technique, and the right one for flame, water and anything else
 * whose subject is light. The caller has already laid the dark ground; this
 * runs the burin in the background colour over it.
 */
export function whiteLine(ctx, ground, draw) {
  ctx.save();
  ctx.fillStyle = ground;
  draw();
  ctx.restore();
}

// --- tone fields ----------------------------------------------------------
//
// The shapes a composition is built from. Each returns a tone function, so
// they can be combined with `max`, `mask` and the rest below rather than each
// carrying its own drawing code.

/** A lit sphere: Lambert, a terminator, and reflected light at the far rim. */
export function sphereTone(cx, cy, r, { lx = -0.55, ly = -0.6, ambient = 0.14, bounce = 0.3 } = {}) {
  const ll = Math.hypot(lx, ly, 0.6) || 1;
  const nx = lx / ll;
  const ny = ly / ll;
  const nz = 0.6 / ll;
  return (x, y) => {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return 0;
    const dz = Math.sqrt(1 - d2);
    const lam = Math.max(0, dx * nx + dy * ny + dz * nz);
    // Reflected light along the unlit rim is what stops an engraved sphere
    // reading as a disc with a gradient on it.
    const rim = Math.pow(d2, 3) * bounce * (1 - lam);
    return Math.max(0, Math.min(1, 1 - lam - rim + ambient * (1 - lam)));
  };
}

/** An upright cylinder, lit from the same side. */
export function cylinderTone(x0, x1, { lit = 0.3, ambient = 0.12 } = {}) {
  return (x) => {
    const u = (x - x0) / (x1 - x0);
    if (u < 0 || u > 1) return 0;
    const lam = Math.max(0, Math.cos((u - lit) * Math.PI));
    return Math.max(0, Math.min(1, 1 - lam + ambient));
  };
}

/** A flat wash that darkens towards one edge: sky, water, a wall. */
export function gradientTone(from, to, top, bottom) {
  return (x, y) => {
    const t = Math.max(0, Math.min(1, (y - top) / (bottom - top)));
    return from + (to - from) * t;
  };
}

/** Constant. */
export function flat(v) {
  return () => v;
}

/** Keep a tone only inside a path; zero outside it. Needs a Path2D. */
export function inside(ctx, path, tone) {
  return (x, y) => (ctx.isPointInPath(path, x, y) ? tone(x, y) : 0);
}

/** The darker of two tones, which is how forms are laid over one another. */
export function over(a, b) {
  return (x, y) => Math.max(a(x, y), b(x, y));
}

/** Multiply a tone, for putting a form into shadow or lifting it out. */
export function scale(tone, k) {
  return (x, y) => Math.max(0, Math.min(1, tone(x, y) * k));
}

/**
 * Fade a tone out towards the edge of the card.
 *
 * Nineteenth-century vignettes fade rather than stop, which is why a headpiece
 * sits on a page instead of being stuck to it. It also keeps the hatching off
 * the plate border, where it would look like a mistake.
 */
export function vignette(tone, w, h, { inset = 0.06, soft = 0.16 } = {}) {
  return (x, y) => {
    const u = Math.min(x / w, 1 - x / w, (y / h) * 1.4, (1 - y / h) * 1.4);
    const k = Math.max(0, Math.min(1, (u - inset) / soft));
    return tone(x, y) * k * k * (3 - 2 * k);
  };
}

/**
 * The plate: a ground and the fine rule round it.
 *
 * Two rules, a heavy one and a hair, is the ordinary way a plate was finished,
 * and the pair reads as printing where a single line reads as a box.
 */
export function plate(ctx, w, h, { ground, ink, rule = true }) {
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  if (!rule) return;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.strokeRect(2.5, 2.5, w - 5, h - 5);
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 0.6;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.globalAlpha = 1;
}
