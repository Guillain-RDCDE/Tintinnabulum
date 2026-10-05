// Graphic scenes: the vocabulary of posters, prints and backgrounds.
//
// Five constructions every graphic designer reaches for -- the soft gradient,
// the dot screen of cheap colour printing, counterchanged rings, stripes
// fanned out from a point beyond the edge of the sheet, and a board of cut
// screentone swatches round one square of coloured paper -- rebuilt so that
// the data does the pulling. Each is cheap enough to run full screen, because each
// is drawn with what a canvas does quickly: gradients, filled paths, and dots
// batched by colour.

import { noise2 } from './noise.js';
import { toRgb, scratch, packRgba } from './paint.js';
import { mixColors, parseColor, rgbToOklab, toOklch, fromOklch, toCss } from '../color.js';
import { TAU, sizeOf, ambient, clampTo, papers } from './shared.js';

/** The tints the screens came in, as the sheets were sold; the first is the palette's own. */
const TONE_SETS = [null, ['#2f6f7c'], ['#e8c45a', '#2f6f7c', '#28abdb'], ['#28abdb', '#e8c45a'], ['#e8c45a'], ['#e8687a']];
const TONE_NAMES = ['palette', 'teal', 'yellow, teal and cyan', 'cyan and yellow', 'yellow', 'pink'];
/** The papers the square was cut from; the first is the palette's own. */
const SQUARES = [null, '#f0c646', '#057da1', '#f4687a', '#c96fa8', '#f9356a'];
const SQUARE_NAMES = ['palette', 'yellow', 'blue', 'coral', 'magenta', 'pink'];

/** A colour at some opacity, whatever form it came in. */
const alpha = (c, a) => {
  const [r, g, b] = toRgb(c);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

export const GRAPHIC_SCENES = {
  aura: {
    label: 'Soft gradient',
    note: 'A mesh gradient, the backdrop of a thousand album covers: wide radial clouds of colour laid over one another, each fading to nothing, so where two meet they mix rather than edge. Every event lays a cloud where it happened; the oldest is taken away. The clouds wander on a slow value-noise field, so the picture never stands still and never repeats.',
    params: {
      scale: { label: 'Size of the clouds', min: 0.4, max: 2.5, step: 0.05, default: 1.2 },
      churn: { label: 'How much they wander', min: 0, max: 2, step: 0.05, default: 0.8 },
      punch: { label: 'Strength of colour', min: 0.2, max: 1, step: 0.02, default: 0.8 },
    },
    init(api) {
      const s = api.scene;
      // Three clouds of the palette's own before any event, so a quiet start is
      // a colour and not a blank ground.
      s.base = [
        { x: 0.22, y: 0.3, r: 0.55, color: api.palette.user, seed: 1.3, born: -1e9 },
        { x: 0.78, y: 0.35, r: 0.5, color: api.palette.anon, seed: 4.1, born: -1e9 },
        { x: 0.5, y: 0.8, r: 0.6, color: api.palette.bot, seed: 7.7, born: -1e9 },
      ];
      s.clouds = [];
    },
    event(p, api) {
      const s = api.scene;
      if (!s.clouds) s.clouds = [];
      s.clouds.push({ x: p.x / api.w, y: p.y / api.h, r: 0.22 + p.pick * 0.32, color: p.color, seed: p.rot * 3, born: api.now });
      if (s.clouds.length > 9) s.clouds.shift();
    },
    frame(ctx, api) {
      const s = api.scene;
      const W = api.w;
      const H = api.h;
      const m = Math.max(W, H);
      const scale = api.param('scale');
      const punch = api.param('punch');
      const t = (api.now / 1000) * api.param('churn');
      for (const c of [...(s.base || []), ...(s.clouds || [])]) {
        const grow = Math.min(1, (api.now - c.born) / 1400);
        const x = (c.x + (noise2(c.seed * 9.1, t * 0.12) - 0.5) * 0.5) * W;
        const y = (c.y + (noise2(c.seed * 5.3 + 40, t * 0.12) - 0.5) * 0.5) * H;
        const r = Math.max(4, c.r * scale * m * (0.6 + 0.4 * grow));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, alpha(c.color, punch * grow));
        g.addColorStop(0.5, alpha(c.color, punch * 0.5 * grow));
        g.addColorStop(1, alpha(c.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    },
  },

  benday: {
    label: 'Ben-Day dots',
    note: 'The dot screen of cheap colour printing, named for Benjamin Day, who patented it in 1879 and whom Lichtenstein made famous by painting it large. A heat map is built from the recent events -- each one a Gaussian that cools as it ages, over a slow noise so the page is never bare -- and printed through a rotated grid: each dot is sized by the heat under it and inked from a ramp through the palette, coolest to hottest. Dots are batched by ink, so a full screen of them is a dozen fills.',
    params: {
      cell: { label: 'Dot spacing', min: 6, max: 36, step: 1, default: 13 },
      angle: { label: 'Screen angle', min: 0, max: 90, step: 1, default: 22 },
      spread: { label: 'How far the heat spreads', min: 0.3, max: 3, step: 0.05, default: 1.2 },
    },
    init(api) {
      api.scene.rampFor = null;
    },
    frame(ctx, api) {
      const s = api.scene;
      const W = api.w;
      const H = api.h;
      const pal = api.palette;
      const LEVELS = 12;
      if (s.rampFor !== pal) {
        const stops = [pal.bot, pal.anon, pal.user, pal.alert];
        s.ramp = [];
        for (let i = 0; i < LEVELS; i++) {
          const u = (i / (LEVELS - 1)) * (stops.length - 1);
          const k = Math.min(stops.length - 2, Math.floor(u));
          s.ramp.push(mixColors(stops[k], stops[k + 1], u - k));
        }
        s.rampFor = pal;
      }
      const cell = api.param('cell');
      const angle = (api.param('angle') * Math.PI) / 180;
      const sigma = Math.min(W, H) * 0.1 * api.param('spread');
      const s2 = sigma * sigma;
      const t = api.now / 1000;
      // The most recent events only: a dot asks each of them for its heat.
      const src = api.particles.slice(-16).map((p) => {
        const age = (api.now - p.born) / (p.life || 12000);
        return { x: p.x, y: p.y, w: Math.max(0, 1 - age) * (0.22 + 0.3 * p.pick) };
      });
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const half = Math.hypot(W, H) / 2 + cell;
      const cx = W / 2;
      const cy = H / 2;
      // The dots are written straight into pixels, a row of each at a time,
      // and the frame is put down once. Traced as arcs, or stamped from a
      // sprite, five thousand dots cost thirty to seventy milliseconds a frame
      // wherever the canvas is drawn without a graphics card; written as rows
      // they cost a few, anywhere. The edge is hard, which is what a printed
      // dot has.
      const buf = scratch(api, 'buf', true);
      const bctx = s.bufCtx;
      const BW = buf.width;
      const BH = buf.height;
      if (!s.img || s.img.width !== BW || s.img.height !== BH) {
        s.img = bctx.createImageData(BW, BH);
        s.px = new Uint32Array(s.img.data.buffer);
      }
      if (s.inkFor !== s.ramp) {
        s.inks = s.ramp.map(packRgba);
        s.inkFor = s.ramp;
      }
      const px = s.px;
      px.fill(packRgba(pal.background));
      const ns = sigma * 2.2;
      for (let v = -half; v <= half; v += cell) {
        for (let u = -half; u <= half; u += cell) {
          const x = cx + u * cos - v * sin;
          const y = cy + u * sin + v * cos;
          if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
          let sum = Math.max(0, noise2(x / ns + t * 0.08, y / ns - t * 0.05) - 0.35) * 0.5;
          for (const p of src) {
            const dx = x - p.x;
            const dy = y - p.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < s2 * 9) sum += p.w * Math.exp(-d2 / s2);
          }
          // Saturating rather than clipping: a busy patch fills up towards the
          // hottest ink without the whole page going to it at once.
          const h = 1 - Math.exp(-sum * 1.6);
          if (h <= 0.05) continue;
          const r = cell * 0.52 * Math.sqrt(h);
          const ink = s.inks[Math.min(LEVELS - 1, Math.floor(h * LEVELS))];
          const y0 = Math.max(0, Math.ceil(y - r));
          const y1 = Math.min(BH - 1, Math.floor(y + r));
          for (let yy = y0; yy <= y1; yy++) {
            const dy = yy + 0.5 - y;
            const span = Math.sqrt(Math.max(0, r * r - dy * dy));
            const x0 = Math.max(0, Math.round(x - span));
            const x1 = Math.min(BW, Math.round(x + span));
            if (x1 > x0) px.fill(ink, yy * BW + x0, yy * BW + x1);
          }
        }
      }
      bctx.putImageData(s.img, 0, 0);
      ctx.drawImage(buf, 0, 0, api.w, api.h);
    },
  },

  rise: {
    label: 'Rising rings',
    note: 'Counterchange, the oldest trick in pattern: rings and rays in two colours that swap wherever they cross, so the figure and the ground keep trading places. The rings grow slowly outwards from a centre that may sit anywhere from the top edge to the bottom one, the rays turn, and every event sends a wave of its own colour out through the rings.',
    positional: false,
    params: {
      rings: { label: 'Rings', min: 4, max: 40, step: 1, default: 14 },
      rays: { label: 'Rays', min: 0, max: 36, step: 2, default: 12 },
      centre: { label: 'Where the centre sits', min: 0, max: 1, step: 0.01, default: 0.82 },
      spin: { label: 'Turn', min: 0, max: 1, step: 0.02, default: 0.3 },
    },
    init(api) {
      api.scene.waves = [];
    },
    event(p, api) {
      api.scene.drive = Math.min(1.6, (api.scene.drive || 0) + 0.3);
      const waves = api.scene.waves || (api.scene.waves = []);
      waves.push({ born: api.now, color: p.color, speed: 0.25 + p.pick * 0.35 });
      if (waves.length > 12) waves.shift();
    },
    frame(ctx, api) {
      const W = api.w;
      const H = api.h;
      const rings = Math.round(api.param('rings'));
      const rays = Math.round(api.param('rays'));
      const cx = W / 2;
      const cy = H * api.param('centre');
      const s = api.scene;
      s.drive = Math.max(0, (s.drive || 0) - api.dt / 1200);
      const pace = 0.04 + Math.min(1, s.drive);
      s.clock = (s.clock || 0) + api.dt * pace;
      const t = s.clock / 1000;
      const Rmax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
      const ring = Rmax / rings;
      const grow = (t * ring * 0.12) % (ring * 2);
      const turn = t * api.param('spin') * 0.12;
      const sector = rays ? TAU / rays : TAU;
      const waves = (api.scene.waves || []).map((w) => ({
        r: ((api.now - w.born) / 1000) * w.speed * Rmax,
        color: w.color,
      }));
      api.scene.waves = (api.scene.waves || []).filter((w) => ((api.now - w.born) / 1000) * w.speed * Rmax < Rmax + ring * 2);
      const plain = new Path2D();
      const lit = new Map();
      for (let j = -2; j <= rings + 1; j++) {
        const r0 = Math.max(0, j * ring + grow);
        const r1 = Math.max(0, r0 + ring);
        if (r1 <= 0) continue;
        const mid = (r0 + r1) / 2;
        let color = null;
        for (const w of waves) if (Math.abs(mid - w.r) < ring * 1.1) color = w.color;
        const path = color ? lit.get(color) || lit.set(color, new Path2D()).get(color) : plain;
        const count = rays || 1;
        for (let k = 0; k < count; k++) {
          if ((j + k) % 2 !== 0) continue;
          const a0 = k * sector + turn;
          const a1 = a0 + sector;
          if (!rays) {
            path.moveTo(cx + r1, cy);
            path.arc(cx, cy, r1, 0, TAU);
            path.moveTo(cx + r0, cy);
            path.arc(cx, cy, r0, TAU, 0, true);
          } else {
            path.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1);
            path.arc(cx, cy, r1, a0, a1);
            path.arc(cx, cy, r0, a1, a0, true);
            path.closePath();
          }
        }
      }
      ctx.fillStyle = api.palette.default;
      ctx.fill(plain, 'evenodd');
      for (const [color, path] of lit) {
        ctx.fillStyle = color;
        ctx.fill(path, 'evenodd');
      }
    },
  },
  sheaf: {
    label: 'Converging stripes',
    note: 'Stripes fanned from one point, as a sign painter rules them for an awning or a racing livery and an op-art canvas pulls them out of true. The stripes are angles, not positions: each is a wedge between two rays from one vanishing point set on the diagonal through the corner, and the whole picture is a list of those wedges, sorted, so finding the stripe under an event is a search on its angle. Widths are laid outward from the seam on either side, in units on one side and freely on the other, and every stripe takes an ink unlike its neighbour, the ground first and most often. Each ink also has a deeper and a lighter twin a little way off in OKLCH, so a black stripe is now and then a blacker one; with a single ink the twins become seven depths of it. A change is drawn as the old stripe still showing beyond a window that widens from the struck point, which is a pair of wedge segments, and nothing is struck onto a buffer. Every event re-inks the stripe it falls on, the new colour running out along it both ways from the point struck; a middling one re-inks a run, a beat apart, and a large one cuts its stripe into several.',
    positional: true,
    preview: { frames: 50, dt: 60 },
    params: {
      stripes: { label: 'How many stripes', min: 12, max: 140, step: 1, default: 48, rebuild: true },
      seam: { label: 'Hairlines in the seam', min: 0, max: 40, step: 1, default: 16, rebuild: true },
      inks: { label: 'How many inks', min: 1, max: 5, step: 1, default: 3, rebuild: true },
      tone: { label: 'How far a stripe strays from its ink', min: 0, max: 1, step: 0.02, default: 0.3 },
      drift: { label: 'How far it strays in hue', min: 0, max: 1, step: 0.02, default: 0.12 },
      converge: { label: 'How hard the stripes converge', min: 0, max: 1, step: 0.02, default: 0.5, rebuild: true },
    },
    init: laySheaf,
    event(p, api) {
      const s = api.scene;
      if (!s.stripes) return;
      s.lastAt = api.now;
      strikeSheaf(api, p);
    },
    frame: drawSheaf,
  },
  screentone: {
    label: 'Screentones',
    note: 'A designer\'s board of screentone swatches, the adhesive sheets of printed texture an illustrator cut out and burnished down before anything was done on a screen: fine and coarse dot screens, broken rules, grids of black squares, white spots, fields of short dashes, bands of crossed zigzags and of hatching, a pair of soft figures made of blurred dashes, and over all of it one square of coloured paper, upright or turned. The screens are black and white and a few tints, as the sheets were sold; the square and the ground are the colour. Every event cuts a new swatch where it lands and the oldest is peeled away: a small event a patch of dashes, a middling one a screen, a larger one a band run out to the edge of the board, and the largest a figure. The square never moves. Each swatch is printed once onto a sheet of its own and laid down whole each frame, revealed from the point where it was cut; the dots, squares, spots and dashes are tiles repeated as a pattern, the broken rules and the figures are drawn stroke by stroke, and the figures\' dashes are blurred by drawing only their shadows.',
    positional: true,
    preview: { frames: 40, dt: 60 },
    params: {
      tones: { label: 'Tints of the screens', options: TONE_NAMES, min: 0, max: TONE_NAMES.length - 1, step: 1, default: 0, rebuild: true },
      square: { label: 'The square', options: SQUARE_NAMES, min: 0, max: SQUARE_NAMES.length - 1, step: 1, default: 0 },
      turn: { label: 'How far the square is turned', min: -45, max: 45, step: 1, default: 0 },
      count: { label: 'How many swatches', min: 6, max: 20, step: 1, default: 10, rebuild: true },
      scale: { label: 'How large', min: 0.6, max: 1.4, step: 0.05, default: 1, rebuild: true },
    },
    init: layScreens,
    event(p, api) {
      const s = api.scene;
      if (!s.patches) return;
      s.lastAt = api.now;
      cutSwatch(api, p);
    },
    frame: drawScreens,
  },
};

// --- the sheaf ------------------------------------------------------------------------

/** The diagonal the seam runs along, and the vanishing point sits on. */
const SEAM = Math.PI / 4;

/** The inks a sheaf is cut from: the ground first, then the categories in order. */
function sheafInks(api) {
  const pal = api.palette;
  const all = [pal.background, pal.user, pal.anon, pal.bot, pal.alert].filter(Boolean);
  const n = clampTo(Math.round(api.param('inks')), 1, all.length);
  return all.slice(0, n);
}

/** A colour moved in OKLCH lightness and hue, kept in gamut by giving up chroma. */
function toneOf(c, dL, dh) {
  const { r, g, b } = parseColor(c);
  const o = toOklch(rgbToOklab({ r, g, b }));
  return toCss(fromOklch({ L: clampTo(o.L + dL, 0.04, 0.98), C: o.C, h: o.h + dh }));
}

/**
 * Every ink at each of its depths. Several inks: the ink, a deeper twin and a
 * lighter one, which is what makes a sheet of black read as two blacks. One
 * ink: seven depths of it, which is the whole picture when a sheaf is cut from
 * a single colour. The seven reach further up than down -- a tan worn to
 * biscuit more than to bark, a coral turning to peach -- and the hue moves
 * mostly on the way up, so the light end warms and the dark end barely cools.
 */
function sheafShades(s, api) {
  const tone = api.param('tone');
  const drift = api.param('drift');
  const key = s.inks.join() + '|' + tone + '|' + drift;
  if (s.shadeKey === key) return s.shades;
  s.shadeKey = key;
  if (s.inks.length === 1) {
    const steps = [];
    for (let j = 0; j < 7; j++) {
      const t = (j / 6) * 1.6 - 0.6;
      steps.push(toneOf(s.inks[0], t * 0.19 * tone, t * drift * (t > 0 ? 0.6 : 0.2)));
    }
    s.shades = [steps];
  } else {
    s.shades = s.inks.map((c) => [c, toneOf(c, -0.11 * tone, drift * 0.35), toneOf(c, 0.08 * tone, -drift * 0.35)]);
  }
  return s.shades;
}

/** A depth for a stripe: mostly the ink itself when there are several. */
function depthOf(s) {
  if (s.inks.length === 1) return (Math.random() * 7) | 0;
  const r = Math.random();
  return r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
}

/** An ink unlike `not`, the ground most often and each later ink less. */
function inkUnlike(s, not) {
  const n = s.inks.length;
  if (n === 1) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) if (i !== not) total += Math.pow(0.5, i);
  let r = Math.random() * total;
  for (let i = 0; i < n; i++) {
    if (i === not) continue;
    r -= Math.pow(0.5, i);
    if (r <= 0) return i;
  }
  return n - 1 === not ? 0 : n - 1;
}

/** Ink and depth for the next stripe of a run, so that no two neighbours match. */
function nextColour(s, prev) {
  if (s.inks.length === 1) {
    let lvl = depthOf(s);
    if (prev && lvl === prev.lvl) lvl = (lvl + 1 + ((Math.random() * 6) | 0)) % 7;
    return { ink: 0, lvl };
  }
  return { ink: inkUnlike(s, prev ? prev.ink : -1), lvl: depthOf(s) };
}

/**
 * Stripes laid outward from the seam, each an ink and then a width, as an
 * angle. Towards the top right a unit and its doubles, narrowing a little as
 * they near the seam; towards the bottom left cut freely, smallest at the
 * seam, with a broad band now and then. A stripe in the ground's own ink is
 * laid wider, because the ground is what a striping is known by: the black of
 * a black-and-yellow, the grey of a grey with navy and amber.
 */
function sideStripes(s, from, to, regular, prev) {
  const out = [];
  const dir = Math.sign(to - from);
  let at = from;
  while ((to - at) * dir > 0) {
    const d = Math.abs(at - from);
    const c = nextColour(s, prev);
    let w;
    if (regular) {
      const r = Math.random();
      const mult = r < 0.68 ? 1 : r < 0.88 ? 2 : r < 0.96 ? 3 : 4;
      w = s.unit * mult * (0.62 + 0.38 * Math.min(1, d / (s.unit * 5)));
    } else if (Math.random() < 0.06 && d > s.unit * 3) {
      w = s.unit * (4 + Math.random() * 8);
    } else {
      w = s.unit * (0.25 + Math.random() * 1.15) * (0.3 + 0.7 * Math.min(1, d / (s.unit * 4)));
    }
    if (c.ink === 0 && s.inks.length > 1) w *= 1.25 + Math.random() * 0.9;
    w = Math.max(s.hair, w);
    out.push({ w, ...c });
    prev = c;
    at += w * dir;
  }
  return out;
}

function laySheaf(api) {
  const s = api.scene;
  const W = api.w;
  const H = api.h;
  const m = Math.min(W, H);
  // The vanishing point, on the diagonal through the top left corner and a
  // few sheet widths out: far enough that the stripes read as nearly parallel,
  // near enough that they visibly are not.
  s.D = m * 3.4 * Math.pow(2.5, 1 - 2 * api.param('converge'));
  s.vx = -s.D * Math.cos(SEAM);
  s.vy = -s.D * Math.sin(SEAM);
  const angle = (x, y) => Math.atan2(y - s.vy, x - s.vx);
  const reach = (x, y) => Math.hypot(x - s.vx, y - s.vy);
  const lo = angle(W, 0);
  const hi = angle(0, H);
  s.r0 = reach(0, 0) - 2;
  s.r1 = Math.max(reach(W, H), reach(W, 0), reach(0, H)) + 2;
  const mid = reach(W / 2, H / 2);
  // A hairline is a pixel or two wide in the middle of the sheet, and a
  // stripe a share of the whole fan.
  s.hair = Math.max(0.7, m / 700) / mid;
  s.unit = (hi - lo) / Math.max(4, Math.round(api.param('stripes')));
  s.eps = 0.6 / mid;
  s.inks = sheafInks(api);
  s.shadeKey = null;

  // The seam: a run of hairlines just below the corner.
  const seam = [];
  const count = Math.round(api.param('seam'));
  for (let i = 0; i < count; i++) seam.push(s.hair * (0.6 + Math.random() * (Math.random() < 0.15 ? 5 : 1.8)));
  const seamWidth = seam.reduce((a, b) => a + b, 0);
  const centre = angle(0, m * 0.015);
  const top = centre - seamWidth / 2;
  const foot = centre + seamWidth / 2;

  // The seam's hairlines first, then each side laid outward from it, so that
  // no stripe matches the one beside it anywhere along the fan.
  const hairs = [];
  let prev = null;
  for (const w of seam) {
    const c = nextColour(s, prev);
    hairs.push({ w, ...c });
    prev = c;
  }
  const above = sideStripes(s, top, lo - s.unit, true, hairs[0] || null);
  const below = sideStripes(s, foot, hi + s.unit, false, hairs[hairs.length - 1] || above[0] || null);
  // Laid from the top right corner round to the bottom left, in angle order.
  s.stripes = [];
  let at = top;
  for (const st of above) at -= st.w;
  const put = (st, hair) => {
    s.stripes.push({ a0: at, a1: at + st.w, hair, ink: st.ink, lvl: st.lvl });
    at += st.w;
  };
  for (let i = above.length - 1; i >= 0; i--) put(above[i], false);
  for (const st of hairs) put(st, true);
  for (const st of below) put(st, false);
  // Large events cut stripes, and every cut adds some; past this they only re-ink.
  s.cap = Math.round(s.stripes.length * 1.4) + 8;
  s.wipes = [];
  s.lastAt = 0;
  s.ambient = 0;
}

/** The stripe at an angle: the last whose near edge is at or before it. */
function stripeAt(s, th) {
  const list = s.stripes;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid].a0 <= th) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Give stripe i a new colour, unlike the one it had, running out from radius r. */
function reink(api, s, i, r, base, delay = 0) {
  const st = s.stripes[i];
  const old = { a0: st.a0, a1: st.a1, ink: st.ink, lvl: st.lvl };
  let ink = st.ink;
  let lvl = st.lvl;
  // The event's own colour a third of the time, when the sheaf is cut from
  // it; otherwise any ink but this stripe's, so a re-inking always shows. Not
  // every time: the commonest kind of event would take the whole sheet over
  // within a minute and the ground, which is most of the picture, would go.
  const own = base && Math.random() < 0.35 ? s.inks.findIndex((c) => String(c).toLowerCase() === String(base).toLowerCase()) : -1;
  if (s.inks.length === 1) {
    lvl = (st.lvl + 1 + ((Math.random() * 6) | 0)) % 7;
  } else if (own >= 0 && own !== st.ink) {
    ink = own;
    lvl = 0;
  } else {
    ink = inkUnlike(s, st.ink);
    lvl = depthOf(s);
  }
  st.ink = ink;
  st.lvl = lvl;
  s.wipes.push({ r, born: api.now + delay, under: [old] });
}

/** A large event: the stripe cut into a few narrower ones, in fresh inks. */
function recut(api, s, i, r) {
  const st = s.stripes[i];
  const parts = 2 + ((Math.random() * 4) | 0);
  const weights = [];
  for (let k = 0; k < parts; k++) weights.push(0.3 + Math.random());
  const sum = weights.reduce((a, b) => a + b, 0);
  const span = st.a1 - st.a0;
  const fresh = [];
  let at = st.a0;
  let prev = i > 0 ? s.stripes[i - 1] : null;
  for (let k = 0; k < parts; k++) {
    const a1 = k === parts - 1 ? st.a1 : at + (span * weights[k]) / sum;
    const c = nextColour(s, prev);
    fresh.push({ a0: at, a1, hair: false, ...c });
    prev = c;
    at = a1;
  }
  s.stripes.splice(i, 1, ...fresh);
  s.wipes.push({ r, born: api.now, under: [{ a0: st.a0, a1: st.a1, ink: st.ink, lvl: st.lvl }] });
}

function strikeSheaf(api, p) {
  const s = api.scene;
  const th = Math.atan2(p.y - s.vy, p.x - s.vx);
  const r = Math.hypot(p.x - s.vx, p.y - s.vy);
  const i = stripeAt(s, th);
  const q = sizeOf(p, api);
  if (q >= 0.78 && !s.stripes[i].hair && s.stripes[i].a1 - s.stripes[i].a0 > s.hair * 4 && s.stripes.length < s.cap) {
    recut(api, s, i, r);
  } else if (q >= 0.45) {
    // A run either side, each a beat after the last, so it ripples across.
    const half = 1 + ((q - 0.45) * 6) | 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < s.stripes.length) reink(api, s, j, r, k === 0 ? p.base : null, Math.abs(k) * 70);
    }
  } else {
    reink(api, s, i, r, p.base);
  }
  // Wipes are short-lived; a flood of them is held to a ceiling.
  if (s.wipes.length > 160) s.wipes.splice(0, s.wipes.length - 160);
}

/** One stripe between two radii, as a filled quadrilateral from the vanishing point. */
function wedge(ctx, s, a0, a1, r0, r1) {
  const c0 = Math.cos(a0);
  const n0 = Math.sin(a0);
  const c1 = Math.cos(a1);
  const n1 = Math.sin(a1);
  ctx.beginPath();
  ctx.moveTo(s.vx + c0 * r0, s.vy + n0 * r0);
  ctx.lineTo(s.vx + c0 * r1, s.vy + n0 * r1);
  ctx.lineTo(s.vx + c1 * r1, s.vy + n1 * r1);
  ctx.lineTo(s.vx + c1 * r0, s.vy + n1 * r0);
  ctx.closePath();
  ctx.fill();
}

function drawSheaf(ctx, api) {
  const s = api.scene;
  if (!s.stripes) return;
  // The quiet hand: one stripe every five seconds, and only while nothing arrives.
  ambient(s, api, 5200, () => {
    const i = (Math.random() * s.stripes.length) | 0;
    reink(api, s, i, s.r0 + Math.random() * (s.r1 - s.r0), null);
  });
  const shades = sheafShades(s, api);
  for (const st of s.stripes) {
    ctx.fillStyle = shades[st.ink][st.lvl];
    // A hair past the far edge, under the next stripe, so no ground shows
    // between two stripes where the antialiasing of their edges meets.
    wedge(ctx, s, st.a0, st.a1 + s.eps, s.r0, s.r1);
  }
  // What a stripe was, still showing beyond the window the new colour has
  // reached. The window opens from the point struck as ink runs along a
  // ruled line: fast at first and slowing, so most of the stripe has turned
  // within a fifth of a second and the last of it takes half a second.
  const span = s.r1 - s.r0;
  const live = [];
  for (const w of s.wipes) {
    const t = (api.now - w.born) / 520;
    const open = t <= 0 ? 0 : span * Math.sqrt(t);
    const near = w.r - Math.max(0, open);
    const far = w.r + Math.max(0, open);
    if (near <= s.r0 && far >= s.r1) continue;
    live.push(w);
    for (const u of w.under) {
      ctx.fillStyle = shades[u.ink][u.lvl];
      if (near > s.r0) wedge(ctx, s, u.a0, u.a1 + s.eps, s.r0, near);
      if (far < s.r1) wedge(ctx, s, u.a0, u.a1 + s.eps, far, s.r1);
    }
  }
  s.wipes = live;
}

// --- the screentones --------------------------------------------------------------------

/** Which layer a swatch lies in: screens at the bottom, bands above, the square over all. */
const LAYER = { dots: 0, lines: 0, grid: 1, discs: 1, figure: 2, dashes: 3, lattice: 4, hatch: 4 };
const REVEAL = 380;
/** Whether a swatch is being peeled. By the time it was, not its truth: a
 *  board developed from a clock at zero peels its first swatches at zero. */
const peeled = (sw) => sw.leftAt !== undefined;
/** How long a peeled swatch takes to go: quicker than one arriving, so a burst never shows two boards at once. */
const PEEL = 200;
/** Which swatches stand in for one another when the board is re-cut. */
const FAMILY = { dots: 'screen', lines: 'screen', grid: 'screen', discs: 'screen', dashes: 'dashes', lattice: 'band', hatch: 'band', figure: 'figure' };

/** A sheet of its own for one swatch. */
function sheetFor(w, h) {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  return typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
}

/** A tile with one mark on it, for a screen repeated as a pattern. */
function tileOf(w, h, mark) {
  const t = sheetFor(w, h);
  mark(t.getContext('2d'));
  return t;
}

const pickFrom = (list) => list[(Math.random() * list.length) | 0];
const between = (a, b) => a + Math.random() * (b - a);

/** A tint for a swatch: the event's own colour on the palette's screens, a sheet's tint otherwise, black now and then. */
function toneFor(s, base) {
  if (Math.random() < 0.3) return s.ink;
  if (!s.tones) return base || pickFrom([s.pal.user, s.pal.anon, s.pal.bot]);
  return pickFrom(s.tones);
}

/**
 * Where a swatch of this size goes: at the spot asked for, or at whichever of
 * a few spots round it overlaps least what is already down. A board is mostly
 * air between its swatches, and a swatch laid straight over another hides
 * both; so it lands near where it was cut, in the clearest place there.
 */
function placed(s, w, h, x, y, snap) {
  const W = s.W;
  const H = s.H;
  const down = (s.patches || []).filter((p) => !peeled(p) && FAMILY[p.kind] !== 'band');
  let best = null;
  for (let k = 0; k < 9; k++) {
    const ang = (k / 8) * TAU;
    const reach = k === 0 ? 0 : Math.min(W, H) * 0.18;
    const bx = snap(clampTo(x + Math.cos(ang) * reach - w / 2, -w * 0.1, W - w * 0.9));
    const by = snap(clampTo(y + Math.sin(ang) * reach - h / 2, -h * 0.1, H - h * 0.9));
    let cover = 0;
    for (const p of down) {
      const ox = Math.max(0, Math.min(bx + w, p.x + p.w) - Math.max(bx, p.x));
      const oy = Math.max(0, Math.min(by + h, p.y + p.h) - Math.max(by, p.y));
      cover += ox * oy;
    }
    // A little against moving at all, so a clear spot near the cut wins.
    const score = cover / (w * h) + (k === 0 ? 0 : 0.08);
    if (!best || score < best.score) best = { x: bx, y: by, w, h, score };
  }
  return { x: best.x, y: best.y, w, h };
}

/** A swatch of a kind, somewhere near (x, y), its geometry only: it is printed when it is first drawn. */
function swatch(s, kind, x, y, colour, round = Math.random() < 0.5) {
  const u = s.u;
  const W = s.W;
  const H = s.H;
  const snap = (v) => Math.round(v / s.g) * s.g;
  const box = (w, h) => placed(s, w, h, x, y, snap);
  if (kind === 'dots') {
    const fine = Math.random() < 0.6;
    return { kind, ...box(between(0.25, 0.45) * W, between(0.2, 0.36) * H), pitch: (fine ? 7 : 14) * u, r: Math.max(0.55, (fine ? 0.9 : 1.6) * u), colour: s.ink };
  }
  if (kind === 'lines') {
    return { kind, ...box(between(0.2, 0.36) * W, between(0.14, 0.3) * H), pitch: between(4.5, 7) * u, across: Math.random() < 0.55, colour: s.ink };
  }
  if (kind === 'grid') {
    return { kind, ...box(between(0.2, 0.4) * W, between(0.12, 0.28) * H), pitch: pickFrom([16, 16, 12]) * u, colour: s.ink };
  }
  if (kind === 'discs') {
    const n = 4 + ((Math.random() * 4) | 0);
    const m = 4 + ((Math.random() * 4) | 0);
    return { kind, ...box(n * 22 * u, m * 22 * u), pitch: 22 * u, colour: s.chalk };
  }
  if (kind === 'dashes') {
    const up = Math.random() < 0.4;
    return { kind, ...box(between(0.18, 0.3) * W, between(0.14, 0.3) * H), up, colour: colour || (Math.random() < 0.3 ? s.chalk : toneFor(s, null)) };
  }
  if (kind === 'lattice' || kind === 'hatch') {
    const h = kind === 'lattice' ? (Math.random() < 0.3 ? 40 : 36) * u : between(30, 72) * u;
    // A band runs from where it was cut to one edge of the board, or now and
    // then across the whole of it.
    const reach = Math.random();
    let x0 = snap(clampTo(x, 0, W));
    let x1 = W;
    if (reach < 0.4) { x1 = x0 + 6 * u; x0 = 0; }
    if (reach > 0.85) { x0 = snap(between(0.05, 0.4) * W); x1 = x0 + between(0.3, 0.6) * W; }
    const w = Math.max(80 * u, Math.min(W, x1) - x0);
    return { kind, x: x0, y: snap(clampTo(y - h / 2, 0, H - h)), w, h, rows: kind === 'lattice' && h > 38 * u ? 2 : 1, colour: colour || toneFor(s, null) };
  }
  // A figure: a disc of level dashes or a tall capsule of upright ones.
  const disc = round;
  const w = (disc ? between(300, 340) : between(250, 300)) * u;
  const h = disc ? w : between(430, 620) * u;
  return { kind: 'figure', ...box(w, h), disc, colour: s.ink };
}

/** Print a swatch onto its own sheet. */
function printSwatch(s, sw) {
  const u = s.u;
  const pad = 4;
  const sheet = sheetFor(sw.w + pad * 2, sw.h + pad * 2);
  const g = sheet.getContext('2d');
  g.translate(pad, pad);
  const line = Math.max(1, 1.7 * u);
  const fillPattern = (tile) => {
    g.fillStyle = g.createPattern(tile, 'repeat');
    g.fillRect(0, 0, sw.w, sw.h);
  };
  if (sw.kind === 'dots' || sw.kind === 'discs') {
    const r = sw.kind === 'dots' ? sw.r : sw.pitch * 0.36;
    fillPattern(tileOf(sw.pitch, sw.pitch, (t) => {
      t.fillStyle = sw.colour;
      t.beginPath();
      t.arc(sw.pitch / 2, sw.pitch / 2, r, 0, TAU);
      t.fill();
    }));
  } else if (sw.kind === 'grid') {
    const side = sw.pitch * 0.62;
    fillPattern(tileOf(sw.pitch, sw.pitch, (t) => {
      t.fillStyle = sw.colour;
      t.fillRect((sw.pitch - side) / 2, (sw.pitch - side) / 2, side, side);
    }));
  } else if (sw.kind === 'dashes') {
    // Three by three dashes to a tile, each a little turned and a little
    // longer or shorter, so the field is hand-cut rather than printed.
    const px = (sw.up ? 13 : 24) * u;
    const py = (sw.up ? 34 : 13) * u;
    const len = (sw.up ? 16 : 12) * u;
    fillPattern(tileOf(px * 3, py * 3, (t) => {
      t.strokeStyle = sw.colour;
      t.lineWidth = Math.max(1, 2 * u);
      t.lineCap = 'butt';
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const cx = (i + 0.5) * px;
          const cy = (j + 0.5) * py;
          const a = (sw.up ? Math.PI / 2 : 0) + (Math.random() - 0.5) * 0.18;
          const l = len * between(0.8, 1.15) / 2;
          t.beginPath();
          t.moveTo(cx - Math.cos(a) * l, cy - Math.sin(a) * l);
          t.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
          t.stroke();
        }
      }
    }));
  } else if (sw.kind === 'lines') {
    // Broken rules: each one cut into runs of random length, as a worn
    // sheet of line tone comes away from the backing.
    g.fillStyle = sw.colour;
    const thick = Math.max(0.8, 1.2 * u);
    const along = sw.across ? sw.w : sw.h;
    const over = sw.across ? sw.h : sw.w;
    for (let a = 0; a < over; a += sw.pitch) {
      let b = Math.random() * 6 * u;
      while (b < along) {
        const run = between(4, 42) * u;
        const end = Math.min(along, b + run);
        if (sw.across) g.fillRect(b, a, end - b, thick);
        else g.fillRect(a, b, thick, end - b);
        b = end + between(2, 10) * u;
      }
    }
  } else if (sw.kind === 'lattice') {
    // Two zigzags in opposite phase, which cross into a row of diamonds.
    g.strokeStyle = sw.colour;
    g.lineWidth = line;
    const rowH = sw.h / sw.rows;
    const step = rowH * 0.85;
    g.beginPath();
    for (let r = 0; r < sw.rows; r++) {
      const y0 = r * rowH + line;
      const y1 = (r + 1) * rowH - line;
      for (const phase of [0, 1]) {
        let up = phase === 0;
        g.moveTo(0, up ? y0 : y1);
        for (let x = step; x <= sw.w + step; x += step) {
          up = !up;
          g.lineTo(Math.min(x, sw.w), up ? y0 : y1);
        }
      }
    }
    g.stroke();
  } else if (sw.kind === 'hatch') {
    g.strokeStyle = sw.colour;
    g.lineWidth = line;
    const gap = 13 * u;
    const lean = sw.h * 0.85;
    g.save();
    g.beginPath();
    g.rect(0, 0, sw.w, sw.h);
    g.clip();
    g.beginPath();
    for (let x = -lean; x < sw.w; x += gap) {
      g.moveTo(x, 0);
      g.lineTo(x + lean, sw.h);
    }
    g.stroke();
    g.restore();
  } else if (sw.kind === 'figure') {
    // Dashes in rows across a disc or in columns down a capsule, soft at
    // every edge: only their shadows are drawn, which are blurred, and the
    // dashes themselves land off the sheet.
    const off = sw.w + sw.h + 100;
    g.save();
    g.beginPath();
    if (sw.disc) g.arc(sw.w / 2, sw.h / 2, sw.w / 2, 0, TAU);
    else {
      const r = sw.w / 2;
      g.arc(r, r, r, Math.PI, 0);
      g.arc(r, sw.h - r, r, 0, Math.PI);
      g.closePath();
    }
    g.clip();
    g.strokeStyle = sw.colour;
    g.shadowColor = sw.colour;
    g.shadowOffsetX = off;
    g.lineCap = 'round';
    const pitch = 19 * u;
    const along = sw.disc ? sw.w : sw.h;
    const over = sw.disc ? sw.h : sw.w;
    for (let a = pitch * 0.5; a < over; a += pitch * between(0.85, 1.2)) {
      let b = Math.random() * 40 * u;
      while (b < along) {
        const run = between(10, 120) * u;
        const end = Math.min(along, b + run);
        g.globalAlpha = between(0.6, 1);
        g.lineWidth = between(2.5, 5.5) * u;
        g.shadowBlur = between(0.8, 2.6) * u;
        g.beginPath();
        if (sw.disc) { g.moveTo(b - off, a); g.lineTo(end - off, a); }
        else { g.moveTo(a - off, b); g.lineTo(a - off, end); }
        g.stroke();
        b = end + between(14, 80) * u;
      }
    }
    g.restore();
  }
  sw.sheet = sheet;
  sw.pad = pad;
}

/** The kinds a board is laid with at the start, in the proportions the boards have. */
function boardKinds(n) {
  const kinds = ['figure', 'figure', 'dots', 'lattice', 'hatch', 'dashes', 'dots', 'grid', 'lattice', 'lines', 'discs', 'hatch', 'dots', 'dashes', 'grid', 'lattice', 'hatch', 'dots', 'lines', 'dashes'];
  return kinds.slice(0, n);
}

function layScreens(api) {
  const s = api.scene;
  s.W = api.w;
  s.H = api.h;
  s.u = (Math.min(api.w, api.h) / 800) * api.param('scale');
  s.g = Math.max(4, Math.min(api.w, api.h) / 40);
  s.pal = api.palette;
  const paper = papers(api);
  s.ink = paper.pale ? '#111111' : '#f2eee6';
  // White screens stay white on any ground: they were sheets of white tone.
  s.chalk = '#fbfaf6';
  s.tones = TONE_SETS[clampTo(Math.round(api.param('tones')), 0, TONE_SETS.length - 1)];
  s.cap = Math.round(api.param('count'));
  s.patches = [];
  const kinds = boardKinds(s.cap);
  // The pair of figures one above the other, overlapping, near the middle,
  // and both of a kind: two discs or two capsules.
  const fx = between(0.4, 0.6) * s.W;
  const fy = between(0.28, 0.38) * s.H;
  const disc = Math.random() < 0.5;
  s.round = disc;
  let figures = 0;
  for (const kind of kinds) {
    let x = between(0.1, 0.9) * s.W;
    let y = between(0.06, 0.94) * s.H;
    if (kind === 'figure') {
      x = fx + figures * between(-0.1, 0.1) * s.W;
      y = fy + figures * (disc ? between(0.2, 0.26) : between(0.24, 0.3)) * s.H;
      figures++;
    }
    const sw = swatch(s, kind, x, y, null, disc);
    sw.born = -1e9;
    sw.ox = sw.x;
    sw.oy = sw.y;
    s.patches.push(sw);
  }
  // The square: a third of the board or so, never at its very edge.
  const side = between(0.26, 0.42) * Math.min(s.W, s.H * 0.8);
  s.square = { x: between(0.12, 0.88) * s.W, y: between(0.18, 0.82) * s.H, side };
  s.square.x = clampTo(s.square.x, side * 0.55, s.W - side * 0.55);
  s.square.y = clampTo(s.square.y, side * 0.55, s.H - side * 0.55);
  s.lastAt = 0;
  s.ambient = 0;
}

/** An event: a new swatch cut where it landed, and the oldest peeled away. */
function cutSwatch(api, p) {
  const s = api.scene;
  const q = sizeOf(p, api);
  const kind = q < 0.18 ? 'dashes'
    : q < 0.42 ? pickFrom(['dots', 'dots', 'grid', 'discs', 'lines'])
    : q < 0.72 ? pickFrom(['lattice', 'hatch'])
    : 'figure';
  const colour = kind === 'dashes' || kind === 'lattice' || kind === 'hatch' ? toneFor(s, p.base) : null;
  const sw = swatch(s, kind, p.x, p.y, colour, s.round);
  if (kind === 'figure') {
    // The figures are a pair, one over the other: a large event re-cuts the
    // one nearer to it, in the same place and the same shape, and the new
    // dashes are revealed from where the event fell.
    const figs = s.patches.filter((x) => x.kind === 'figure' && !peeled(x));
    let near = null;
    let best = Infinity;
    for (const f of figs) {
      const d = Math.hypot(f.x + f.w / 2 - p.x, f.y + f.h / 2 - p.y);
      if (d < best) { best = d; near = f; }
    }
    if (near) {
      Object.assign(sw, { x: near.x, y: near.y, w: near.w, h: near.h, disc: near.disc });
      near.leftAt = api.now;
    }
  }
  lay(api, sw, p.x, p.y);
}

function lay(api, sw, ox, oy) {
  const s = api.scene;
  sw.born = api.now;
  sw.ox = ox;
  sw.oy = oy;
  // The oldest swatch of the same family is peeled away -- a screen for a
  // screen, a band for a band, a figure for a figure -- so the board keeps the
  // proportions it was laid with however the feed runs. Only when the family
  // has none down does the oldest of all go.
  const family = FAMILY[sw.kind];
  const down = s.patches.filter((x) => !peeled(x));
  if (down.length >= s.cap) {
    const same = down.find((x) => FAMILY[x.kind] === family && x !== sw);
    (same || down[0]).leftAt = api.now;
  }
  s.patches.push(sw);
  // A flood is held to a ceiling: what would be peeled at once goes now.
  if (s.patches.length > s.cap * 3) s.patches = s.patches.filter((x) => !peeled(x) || x === sw);
}

function drawScreens(ctx, api) {
  const s = api.scene;
  if (!s.patches) return;
  // The quiet hand: every six seconds of nothing, one swatch re-cut somewhere.
  ambient(s, api, 6000, () => {
    const kind = pickFrom(['dots', 'dashes', 'lattice', 'hatch', 'lines', 'grid']);
    const x = between(0.1, 0.9) * s.W;
    const y = between(0.08, 0.92) * s.H;
    lay(api, swatch(s, kind, x, y, null), x, y);
  });
  // Printing is the costly part, so a burst prints a few a frame and the rest
  // wait their turn, revealed when they are ready rather than when they came.
  let presses = 3;
  for (const sw of s.patches) {
    if (sw.sheet || peeled(sw) || presses <= 0) continue;
    printSwatch(s, sw);
    if (sw.born > -1e8) sw.born = api.now;
    presses--;
  }
  const order = s.patches.filter((sw) => sw.sheet).sort((a, b) => LAYER[a.kind] - LAYER[b.kind] || a.born - b.born);
  for (const sw of order) {
    let alpha = 1;
    if (peeled(sw)) alpha = 1 - (api.now - sw.leftAt) / PEEL;
    if (alpha <= 0) continue;
    const t = (api.now - sw.born) / REVEAL;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (t < 1) {
      // Revealed from the point it was cut, as a swatch is burnished down.
      const far = Math.hypot(Math.max(Math.abs(sw.ox - sw.x), Math.abs(sw.ox - sw.x - sw.w)), Math.max(Math.abs(sw.oy - sw.y), Math.abs(sw.oy - sw.y - sw.h)));
      const e = 1 - (1 - Math.max(0, t)) * (1 - Math.max(0, t));
      ctx.beginPath();
      ctx.arc(sw.ox, sw.oy, Math.max(0.5, far * e), 0, TAU);
      ctx.clip();
    }
    ctx.drawImage(sw.sheet, sw.x - sw.pad, sw.y - sw.pad);
    ctx.restore();
  }
  s.patches = s.patches.filter((sw) => !peeled(sw) || api.now - sw.leftAt < PEEL);
  // The square, over everything.
  const pick = clampTo(Math.round(api.param('square')), 0, SQUARES.length - 1);
  const sq = s.square;
  ctx.save();
  ctx.translate(sq.x, sq.y);
  ctx.rotate((api.param('turn') * Math.PI) / 180);
  ctx.fillStyle = SQUARES[pick] || api.palette.default;
  ctx.fillRect(-sq.side / 2, -sq.side / 2, sq.side, sq.side);
  ctx.restore();
}
