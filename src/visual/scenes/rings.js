// In the rings: a patch of a planetary ring, run rather than drawn.
//
//   patch      the patch seen from above, filling the sheet: a few thousand
//              grains of ice going round the planet, the inner ones
//              overtaking the outer, knocking into one another
//   replicas   the same patch drawn smaller, with the copies of itself that
//              hold it in place above and below, sliding past it
//   exposure   a long exposure of the patch: every grain leaves its track
//
// The physics is the shearing sheet of Goldreich and Lynden-Bell (1965) and
// Wisdom and Tremaine (1988), the box that ring simulations have run in ever
// since. Look at a small patch of a ring from a frame that goes round with
// it, and three things are left: the shear, because the inner grains orbit
// faster than the outer; the Coriolis turn, which bends every free grain onto
// a small ellipse, its epicycle; and the tide. Hill's equations say all
// three. The patch is closed by copies of itself: across the azimuth it is
// periodic, and across the radius the copies slide past one another at the
// speed of the shear, so a grain leaving the outer edge comes back in at the
// inner edge, shifted along by as far as the copies have slid.
//
// Grains collide as hard spheres, and a collision loses energy the way ice
// does at a hundred kelvin: Bridges, Hatzes and Lin (1984) measured that a
// harder hit keeps less of its speed, eps = 0.32 (v / v_c)^-0.234, and that
// law, capped at one for the gentlest touches, is what holds a ring in its
// thin balance between the heat the shear makes and the heat the collisions
// throw away. Where the grains attract one another, the sheet gathers into
// the long trailing wakes Salo (1992) found in his simulations and Cassini
// later saw in the A ring: a self-gravity solved on a grid with an FFT, as
// a surface density gives a potential of -2 pi G Sigma_k / |k|.
//
// The idea of watching this comes from REBOUND, Hanno Rein's N-body code, and
// a short film of its shearing-sheet example: white grains bouncing, and a
// yellow ring for every collision. This file shares no code with it:
// the equations are textbook ones, written here from the papers, and the
// integration is the plainest that holds -- the epicycle turned exactly, the
// drift taken after, overlaps resolved once a step.
//
// What the feed does is what a meteoroid does: each event strikes the patch
// where it lands, throws the grains near it outward and stains them with its
// own colour, and the shear then draws the stain out into a long slanting
// streak that the wakes break up. The ring turns at the rate things arrive:
// a quiet feed leaves it almost still, a busy one sets it going and fills it
// with collisions.

import { lightnessOf, lighten, mixColors } from '../color.js';
import { scratch } from './paint.js';
import { TAU, sizeOf, kick, tempo, ambient, clampTo } from './shared.js';
import { cap } from './budget.js';
import { sheets } from './sheets.js';

// --- the box ---------------------------------------------------------------------------

/** The radial width of the box, in the simulation's own units. */
const LR = 100;
/** The shear: d(vy)/dx = -3/2 Omega, with Omega one. */
const SHEAR = 1.5;
/** Simulation time per real millisecond at full drive: an orbit in about forty seconds. */
const RATE = 0.16 / 1000;
/** The longest step taken at once. */
const MAX_STEP = 0.0065;
/** Six classes of grain, from the smallest to `spread` times larger. */
const CLASSES = 6;
/** The size distribution of ring grains: dN/da ~ a^-3. */
const Q = 3;
/** The highest a grain may go, in units per orbit unit, so a splash cannot blow the box apart. */
const VMAX = 45;

// --- colours ---------------------------------------------------------------------------

/**
 * Colourways. Each has a ground, three ices, four stains for the kinds of
 * event, a colour for a bounce, and a ramp for a grain that has been heated.
 */
const WAYS = [
  null,
  // The rings as the eye would see them: cream and ochre ice on black.
  { name: 'saturn', ground: '#07080b', ice: ['#efe4cf', '#cdb18b', '#f8f1e4'], stains: ['#e0a458', '#8fb8de', '#d1495b', '#f2d0a4'], bounce: '#ffd25e', hot: ['#4a3f33', '#c98f4e', '#ffe3a1'] },
  // The ultraviolet the Cassini spectrograph saw: dirty ice red, clean ice turquoise.
  { name: 'ultraviolet', ground: '#03060c', ice: ['#46c4c4', '#2b8ea6', '#a2e6df'], stains: ['#e4572e', '#ff9f68', '#c03a2b', '#f3d9b1'], bounce: '#ffffff', hot: ['#123744', '#d1495b', '#ffd6a5'] },
  // White ice under a blue night.
  { name: 'moonlit', ground: '#0a1322', ice: ['#eef3f8', '#b9cde0', '#8ea9c3'], stains: ['#7fd1ff', '#ffd166', '#ef476f', '#06d6a0'], bounce: '#ffd166', hot: ['#1d3557', '#7fd1ff', '#ffffff'] },
  // Dark grains, glowing where they are hit.
  { name: 'ember', ground: '#0c0706', ice: ['#5a3a2e', '#7b4f39', '#3f2a23'], stains: ['#ff7b00', '#ffb000', '#ff3c38', '#ffe3a3'], bounce: '#ffcf70', hot: ['#3f2a23', '#ff6a00', '#fff1c1'] },
  // Graphite spheres on paper.
  { name: 'graphite', ground: '#efe9dc', ice: ['#26262a', '#45454a', '#66666b'], stains: ['#c0392b', '#2c5d8f', '#d68c1e', '#1e6f5c'], bounce: '#c0392b', hot: ['#8a8a8f', '#2c5d8f', '#c0392b'] },
  // White on the blue of a sun print.
  { name: 'cyanotype', ground: '#173f73', ice: ['#f1f4f8', '#cfdcec', '#a9c0dc'], stains: ['#ffffff', '#9fd3ff', '#ffe9a8', '#ffb4a2'], bounce: '#ffffff', hot: ['#5f86b8', '#dbe8f6', '#ffffff'] },
];
const WAY_NAMES = WAYS.map((w) => (w ? w.name : 'palette'));
const KINDS = ['user', 'anon', 'bot', 'alert'];
const HEAT_STEPS = 12;
const STAIN_STEPS = 5;

/** The colourway, the palette's own when the first is chosen. */
function wayOf(api) {
  const way = WAYS[clampTo(Math.round(api.param('colours')), 0, WAYS.length - 1)];
  if (way) return way;
  const pal = api.palette;
  const ice = pal.default || '#ffffff';
  const bg = pal.background;
  const stains = KINDS.map((k) => pal[k] || ice);
  return {
    ground: bg,
    ice: [ice, mixColors(ice, bg, 0.24), mixColors(ice, pal.user || ice, 0.16)],
    stains,
    bounce: pal.alert || ice,
    hot: [mixColors(ice, bg, 0.55), pal.user || ice, pal.alert || ice],
  };
}

/** Three colours run into a ramp of n steps. */
function rampOf([a, b, c], n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(t < 0.5 ? mixColors(a, b, t * 2) : mixColors(b, c, t * 2 - 1));
  }
  return out;
}

// --- a small FFT, for the gravity ------------------------------------------------------

function fftPlan(n) {
  const bits = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n >> 1);
  const sin = new Float64Array(n >> 1);
  for (let k = 0; k < n >> 1; k++) {
    cos[k] = Math.cos((TAU * k) / n);
    sin[k] = Math.sin((TAU * k) / n);
  }
  return { n, rev, cos, sin };
}

/** In place, radix two, along one row or column of a grid. */
function fft(p, re, im, off, stride, inverse) {
  const n = p.n;
  for (let i = 0; i < n; i++) {
    const j = p.rev[i];
    if (j <= i) continue;
    const a = off + i * stride;
    const b = off + j * stride;
    let t = re[a]; re[a] = re[b]; re[b] = t;
    t = im[a]; im[a] = im[b]; im[b] = t;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let st = 0; st < n; st += size) {
      for (let k = 0; k < half; k++) {
        const c = p.cos[k * step];
        const s = inverse ? p.sin[k * step] : -p.sin[k * step];
        const a = off + (st + k) * stride;
        const b = a + half * stride;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

function fft2(g, inverse) {
  for (let r = 0; r < g.nr; r++) fft(g.pa, g.re, g.im, r * g.na, 1, inverse);
  for (let a = 0; a < g.na; a++) fft(g.pr, g.re, g.im, a, g.na, inverse);
}

/** A grid for the gravity, its axes powers of two, the longer one along the longer side of the box. */
function gravityGrid(La) {
  const wide = La >= LR;
  const na = wide ? 64 : 32;
  const nr = wide ? 32 : 64;
  const size = na * nr;
  const g = {
    na, nr, da: La / na, dr: LR / nr,
    pa: fftPlan(na), pr: fftPlan(nr),
    re: new Float64Array(size), im: new Float64Array(size),
    phi: new Float64Array(size), green: new Float64Array(size),
  };
  // The kernel of a thin sheet, -2 pi / |k|, softened over about a cell so
  // that what is finer than the grid is left to the collisions.
  const soft = Math.max(g.da, g.dr) * 0.9;
  for (let r = 0; r < nr; r++) {
    const kr = (TAU * (r <= nr / 2 ? r : r - nr)) / LR;
    for (let a = 0; a < na; a++) {
      const ka = (TAU * (a <= na / 2 ? a : a - na)) / La;
      const k = Math.hypot(ka, kr);
      g.green[r * na + a] = k === 0 ? 0 : (-TAU / k) * Math.exp(-k * soft);
    }
  }
  return g;
}

// --- the patch -------------------------------------------------------------------------

/** Wrap an azimuth into [0, La). */
const wrapA = (y, La) => {
  y %= La;
  return y < 0 ? y + La : y;
};

function build(api) {
  const s = api.scene;
  const W = Math.max(1, api.w);
  const H = Math.max(1, api.h);
  const La = (LR * W) / H;
  const n = Math.max(60, Math.min(Math.round(api.param('grains')), cap(api, 2.5)));
  const tau = api.param('thickness');
  const spread = api.param('spread');

  // The classes, spaced evenly in log size, weighted as a power law: many
  // small grains and a few boulders.
  const rel = [];
  const weight = [];
  for (let k = 0; k < CLASSES; k++) {
    rel.push(spread ** (k / (CLASSES - 1)));
    weight.push(rel[k] ** (1 - Q));
  }
  const total = weight.reduce((a, b) => a + b, 0);
  let meanSq = 0;
  for (let k = 0; k < CLASSES; k++) meanSq += (weight[k] / total) * rel[k] * rel[k];
  // The smallest grain is whatever gives the ring the optical depth asked for.
  const amin = Math.sqrt((tau * La * LR) / (Math.PI * n * meanSq));

  Object.assign(s, {
    n, La, amin, rel,
    amax: amin * rel[CLASSES - 1],
    t: 0,
    x: new Float32Array(n), y: new Float32Array(n),
    u: new Float32Array(n), w: new Float32Array(n),
    a: new Float32Array(n), m: new Float32Array(n),
    cls: new Uint8Array(n), base: new Uint8Array(n),
    stain: new Float32Array(n), ink: new Uint8Array(n),
    heat: new Float32Array(n),
    fa: new Float32Array(n), fr: new Float32Array(n),
    bounces: [], impacts: [],
    sprites: new Map(),
    lastAt: 0, ambient: 0, drive: 0,
    slide: 0,
    vc: 400 * Math.exp(-api.param('loss') * Math.log(100)),
    hardRef: Infinity,
  });

  // The collision grid: cells at least a boulder across.
  s.ga = Math.max(3, Math.floor(La / (2.05 * s.amax)));
  s.gr = Math.max(3, Math.floor(LR / (2.05 * s.amax)));
  s.ca = La / s.ga;
  s.cr = LR / s.gr;
  s.head = new Int32Array(s.ga * s.gr);
  s.next = new Int32Array(n);
  s.grav = gravityGrid(La);

  // The grains, laid in the trailing wakes a ring of this kind settles
  // into, so the sheet opens as a ring rather than as a scatter that has
  // yet to become one. Wakes trail about twenty degrees off the orbit.
  const pitch = Math.atan(1 / 2.75);
  const lambda = LR / 3;
  const kx = (Math.cos(pitch) * TAU) / lambda;
  const ky = (Math.sin(pitch) * TAU) / lambda;
  let mass = 0;
  for (let i = 0; i < n; i++) {
    // Classes by weight; the largest grains are few.
    let r = Math.random() * total;
    let c = 0;
    while (c < CLASSES - 1 && r > weight[c]) { r -= weight[c]; c++; }
    s.cls[i] = c;
    s.a[i] = amin * rel[c];
    s.m[i] = s.a[i] ** 3;
    mass += s.m[i];
    // Larger grains lean to the second ice, the smallest to the third.
    const b = Math.random();
    s.base[i] = c >= 4 ? (b < 0.6 ? 1 : 0) : c === 0 ? (b < 0.5 ? 2 : 0) : (b < 0.75 ? 0 : b < 0.9 ? 2 : 1);
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries++) {
      x = (Math.random() - 0.5) * LR;
      y = Math.random() * La;
      const dens = 1 + 0.55 * Math.cos(kx * x + ky * y);
      if (Math.random() * 1.55 < dens) break;
    }
    s.x[i] = x;
    s.y[i] = y;
    // A little random motion on top of the shear, round an epicycle.
    s.u[i] = (Math.random() - 0.5) * 3;
    s.w[i] = (Math.random() - 0.5) * 1.5;
  }
  s.sigma = mass / (La * LR);

  s.atlas = scratch(api, 'ringatlas');
  s.atlasCtx = s.ringatlasCtx;
  s.atlasScale = 1.5;
  s.atlasReady = false;

  // The colours.
  const way = wayOf(api);
  s.way = way;
  s.dark = lightnessOf(way.ground) < 0.5;
  s.palette = [];
  for (let b = 0; b < 3; b++) {
    for (let ink = 0; ink < 4; ink++) {
      for (let l = 0; l < STAIN_STEPS; l++) {
        s.palette.push(mixColors(way.ice[b], way.stains[ink], (l / (STAIN_STEPS - 1)) * 0.92));
      }
    }
  }
  s.heatAt = s.palette.length;
  for (const c of rampOf(way.hot, HEAT_STEPS)) s.palette.push(c);

  // A few steps taken before the first frame, so the sheet has its
  // collisions in it from the start.
  for (let k = 0; k < 24; k++) step(s, MAX_STEP, api);
}

/** The gravity of the sheet on every grain, from its surface density. */
function gravity(s, G) {
  const g = s.grav;
  const { na, nr, re, im, phi } = g;
  re.fill(0);
  im.fill(0);
  const cell = g.da * g.dr;
  // Each grain's mass spread over the four cells round it.
  for (let i = 0; i < s.n; i++) {
    const fa = s.y[i] / g.da - 0.5;
    const fr = (s.x[i] + LR / 2) / g.dr - 0.5;
    const a0 = Math.floor(fa);
    const r0 = Math.floor(fr);
    const ta = fa - a0;
    const tr = fr - r0;
    const a1 = (a0 + 1 + na) % na;
    const aa = (a0 + na) % na;
    const r1 = (r0 + 1 + nr) % nr;
    const rr = (r0 + nr) % nr;
    const q = s.m[i] / cell;
    re[rr * na + aa] += q * (1 - ta) * (1 - tr);
    re[rr * na + a1] += q * ta * (1 - tr);
    re[r1 * na + aa] += q * (1 - ta) * tr;
    re[r1 * na + a1] += q * ta * tr;
  }
  fft2(g, false);
  const k = G / (na * nr);
  for (let i = 0; i < na * nr; i++) {
    re[i] *= g.green[i] * k;
    im[i] *= g.green[i] * k;
  }
  fft2(g, true);
  phi.set(re);
  // The force on each grain, by differences across the cells round it.
  for (let i = 0; i < s.n; i++) {
    const fa = s.y[i] / g.da - 0.5;
    const fr = (s.x[i] + LR / 2) / g.dr - 0.5;
    const a0 = Math.floor(fa);
    const r0 = Math.floor(fr);
    const ta = fa - a0;
    const tr = fr - r0;
    let ga = 0;
    let gr = 0;
    for (let dr = 0; dr < 2; dr++) {
      for (let da = 0; da < 2; da++) {
        const wgt = (da ? ta : 1 - ta) * (dr ? tr : 1 - tr);
        const a = (a0 + da + na) % na;
        const r = (r0 + dr + nr) % nr;
        const row = r * na;
        ga += wgt * (phi[row + (a + 1) % na] - phi[row + (a - 1 + na) % na]);
        gr += wgt * (phi[((r + 1) % nr) * na + a] - phi[((r - 1 + nr) % nr) * na + a]);
      }
    }
    s.fa[i] = -ga / (2 * g.da);
    s.fr[i] = -gr / (2 * g.dr);
  }
}

/** Every grain that lies in a cell, by a linked list through the cells. */
function bin(s) {
  s.head.fill(-1);
  for (let i = 0; i < s.n; i++) {
    const c = Math.min(s.ga - 1, (s.y[i] / s.ca) | 0);
    const r = Math.min(s.gr - 1, Math.max(0, ((s.x[i] + LR / 2) / s.cr) | 0));
    const at = r * s.ga + c;
    s.next[i] = s.head[at];
    s.head[at] = i;
  }
}

/** The coefficient of restitution of ice at this speed of impact, after Bridges, Hatzes and Lin. */
const restitution = (v, vc) => (v <= 0 ? 1 : Math.min(1, 0.32 * Math.pow(v / vc, -0.234)));

/**
 * Every pair of grains that overlap and are closing, given the bounce ice
 * gives at that speed. The copies of the box are reached through the grid:
 * azimuth wraps; a neighbour across the radial edge is the copy of a grain
 * at the other edge, shifted along by the slide of the copies.
 */
function collide(s, vc, now) {
  const { n, x, y, u, w, a, m, La, ga, gr, ca, head, next } = s;
  const S = s.slide;
  const hard = s.hardRef;
  let flashes = 0;
  for (let i = 0; i < n; i++) {
    const ri = Math.min(gr - 1, Math.max(0, ((x[i] + LR / 2) / s.cr) | 0));
    for (let dr = -1; dr <= 1; dr++) {
      let rr = ri + dr;
      let offX = 0;
      let offY = 0;
      if (rr < 0) {
        // The copy inside of this one: its grains at (x - LR, y + S).
        rr += gr;
        offX = -LR;
        offY = S;
      } else if (rr >= gr) {
        // Met from the other side, as the copy inside of that grain.
        continue;
      }
      const cy = wrapA(y[i] - offY, La);
      const ci = Math.min(ga - 1, (cy / ca) | 0);
      for (let dc = -1; dc <= 1; dc++) {
        const cc = (ci + dc + ga) % ga;
        for (let j = head[rr * ga + cc]; j >= 0; j = next[j]) {
          if (offX === 0 && j <= i) continue;
          const xj = x[j] + offX;
          let dy = y[j] + offY - y[i];
          dy -= La * Math.round(dy / La);
          const dx = xj - x[i];
          const R = a[i] + a[j];
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          // Velocities in the rotating frame, the shear put back in.
          const vn = (u[j] - u[i]) * nx + ((w[j] - SHEAR * xj) - (w[i] - SHEAR * x[i])) * ny;
          const mi = m[i];
          const mj = m[j];
          const mu = mi + mj;
          // Overlap is left by a step that was long enough to cross into one
          // another; they are eased apart, the lighter grain further.
          // Moved across the radius, a grain keeps its true velocity only if
          // w takes up the change in the shear it now sits in.
          const push = (R - d) * 0.5;
          const pi = push * (mj / mu);
          const pj = push * (mi / mu);
          x[i] -= nx * pi;
          y[i] -= ny * pi;
          w[i] -= SHEAR * nx * pi;
          x[j] += nx * pj;
          y[j] += ny * pj;
          w[j] += SHEAR * nx * pj;
          if (vn >= 0) continue;
          const v = -vn;
          const eps = restitution(v, vc);
          const J = ((1 + eps) * v * mi * mj) / mu;
          u[i] -= (J / mi) * nx;
          w[i] -= (J / mi) * ny;
          u[j] += (J / mj) * nx;
          w[j] += (J / mj) * ny;
          // A hard one is a bounce worth seeing.
          if (v > hard && flashes < 6 && s.bounces.length < 90) {
            flashes++;
            s.bounces.push({ x: x[i] + nx * a[i], y: y[i] + ny * a[i], k: Math.min(1, v / (hard * 5)), born: now });
          }
        }
      }
    }
  }
}

/** One step of Hill's equations, then the collisions. */
function step(s, dt, api) {
  const G = api.param('gravity');
  if (G > 0.001) {
    // Scaled so that at one the most unstable wavelength of the sheet,
    // 4 pi^2 G Sigma / Omega^2, is half the box.
    gravity(s, (G * 0.5 * LR) / (4 * Math.PI * Math.PI * s.sigma));
  } else {
    s.fa.fill(0);
    s.fr.fill(0);
  }
  const c = Math.cos(dt);
  const sn = Math.sin(dt);
  const { n, x, y, u, w, La } = s;
  for (let i = 0; i < n; i++) {
    // The force, then the epicycle turned exactly: with w = vy + 3/2 x,
    // du/dt = 2w and dw/dt = -u/2 are a rotation.
    let ui = u[i] + s.fr[i] * dt;
    let wi = w[i] + s.fa[i] * dt;
    const u2 = ui * c + 2 * wi * sn;
    wi = wi * c - 0.5 * ui * sn;
    ui = u2;
    if (ui > VMAX) ui = VMAX; else if (ui < -VMAX) ui = -VMAX;
    if (wi > VMAX) wi = VMAX; else if (wi < -VMAX) wi = -VMAX;
    u[i] = ui;
    w[i] = wi;
    x[i] += ui * dt;
    y[i] += (wi - SHEAR * x[i]) * dt;
  }
  s.t += dt;
  s.slide = wrapA(SHEAR * LR * s.t, La);
  wrapAll(s);
  bin(s);
  collide(s, s.vc, api.now);
  wrapAll(s);
}

/** Back into the box: the copies slide, so a grain crossing the radial edge moves along as it comes back. */
function wrapAll(s) {
  const { n, x, y, La } = s;
  const S = s.slide || 0;
  for (let i = 0; i < n; i++) {
    if (x[i] >= LR / 2) {
      x[i] -= LR;
      y[i] += S;
    } else if (x[i] < -LR / 2) {
      x[i] += LR;
      y[i] -= S;
    }
    y[i] = wrapA(y[i], La);
  }
}

/** A meteoroid: the grains near it thrown outward and stained, a flash where it struck. */
function strike(s, x, y, q, ink, now, stainIt = true) {
  const R = LR * (0.035 + 0.13 * q);
  const V = 5 + 18 * q;
  const { n, La } = s;
  for (let i = 0; i < n; i++) {
    const dx = s.x[i] - x;
    let dy = s.y[i] - y;
    dy -= La * Math.round(dy / La);
    const d2 = dx * dx + dy * dy;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2) || 1e-3;
    const f = 1 - d / R;
    const kick = V * f * (0.6 + 0.4 * Math.random());
    s.u[i] += (dx / d) * kick;
    // A push along the orbit shows in w; the shear takes it from there.
    s.w[i] += (dy / d) * kick;
    if (stainIt) {
      if (s.stain[i] < 0.25 || f > 0.4) s.ink[i] = ink;
      s.stain[i] = Math.min(1, s.stain[i] + 0.2 + 1.2 * f);
    }
  }
  s.impacts.push({ x, y, R, ink, born: now, q });
  if (s.impacts.length > 24) s.impacts.splice(0, s.impacts.length - 24);
}

/** The grains' colours, as indices into the scene's palette. */
function colourIndex(s, i) {
  if (s.byHeat) {
    // Against how fast the sheet is going as a whole, so the colour says
    // which grains have just been hit rather than how hot the ring runs.
    const l = s.heat[i] / (2.4 * (s.sigma1 || 2));
    return s.heatAt + Math.min(HEAT_STEPS - 1, Math.max(0, Math.round(l * (HEAT_STEPS - 1))));
  }
  const l = Math.min(STAIN_STEPS - 1, Math.round(s.stain[i] * (STAIN_STEPS - 1)));
  return (s.base[i] * 4 + s.ink[i]) * STAIN_STEPS + l;
}

/**
 * A grain as a small lit sphere, drawn once per colour and size and stamped
 * after that: a few thousand gradients a frame would be most of the frame.
 *
 * The spheres are packed onto one atlas, an offscreen canvas from the
 * renderer's pool, in rows. A canvas apiece was the first version, and it
 * bought a few hundred canvases every time the scene was opened, which is
 * what the pool exists to prevent. When the atlas is full it is cleared and
 * packed again at a smaller scale, so it cannot fail, only soften.
 */
function sprite(s, key, cls, rpx) {
  const id = key * 8 + cls;
  const sp = s.sprites.get(id);
  if (sp) return sp;
  const g = s.atlasCtx;
  const A = s.atlas;
  if (!s.atlasReady) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, A.width, A.height);
    s.atlasX = 0;
    s.atlasY = 0;
    s.atlasRow = 0;
    s.atlasReady = true;
  }
  const scale = s.atlasScale;
  const size = Math.max(2, Math.ceil(rpx * 2 * scale) + 2);
  if (s.atlasX + size > A.width) {
    s.atlasX = 0;
    s.atlasY += s.atlasRow + 1;
    s.atlasRow = 0;
  }
  if (s.atlasY + size > A.height || size > A.width) {
    s.sprites.clear();
    s.atlasReady = false;
    s.atlasScale = Math.max(0.5, scale * 0.75);
    return sprite(s, key, cls, rpx);
  }
  const x0 = s.atlasX;
  const y0 = s.atlasY;
  s.atlasX += size + 1;
  s.atlasRow = Math.max(s.atlasRow, size);
  const c = size / 2;
  const r = rpx * scale;
  const col = s.palette[key];
  // Lit from the sun, high and to one side; on paper the far side falls
  // into a shadow rather than into the dark.
  const grad = g.createRadialGradient(x0 + c - r * 0.38, y0 + c - r * 0.42, r * 0.06, x0 + c, y0 + c, r);
  grad.addColorStop(0, lighten(col, s.dark ? 0.16 : 0.1));
  grad.addColorStop(0.55, col);
  grad.addColorStop(1, s.dark ? mixColors(col, s.way.ground, 0.55) : lighten(col, -0.14));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x0 + c, y0 + c, Math.max(0.5, r), 0, TAU);
  g.fill();
  const made = { x: x0, y: y0, size, half: size / (2 * scale) };
  s.sprites.set(id, made);
  return made;
}

/** Stamp a sprite with its middle at (x, y). */
const stamp = (ctx, s, sp, x, y) => ctx.drawImage(s.atlas, sp.x, sp.y, sp.size, sp.size, x - sp.half, y - sp.half, sp.half * 2, sp.half * 2);

/** Advance the patch by this frame's share of the feed's time. */
function advance(s, api) {
  s.vc = 400 * Math.exp(-api.param('loss') * Math.log(100));
  // A collision is hard enough to flash when it is several times the
  // closing speed that ice gives back almost whole.
  // Hard is measured against how fast the grains are going at all, so the
  // flashes are always the few hardest hits and never the whole sheet.
  s.hardRef = (s.sigma1 || 2) * (0.9 + 2.6 * (1 - api.param('bounces')));
  s.byHeat = Math.round(api.param('colourBy')) === 1;
  const rate = tempo(s, api, 0.02, 1400);
  let dt = Math.min(50, api.dt) * rate * RATE;
  // Under a heavy load the ring slows down rather than taking steps too
  // long to hold.
  const steps = Math.min(4, Math.max(1, Math.ceil(dt / MAX_STEP)));
  dt = Math.min(dt, steps * MAX_STEP);
  const h = dt / steps;
  for (let k = 0; k < steps; k++) step(s, h, api);
  // Stains fade as the ring goes round, not as the clock does, so a quiet
  // feed keeps what the busy one left.
  const life = api.param('stains') * TAU;
  const keep = Math.exp(-dt / life);
  const settle = Math.min(1, dt * 3);
  let sum = 0;
  for (let i = 0; i < s.n; i++) {
    s.stain[i] *= keep;
    const amp2 = s.u[i] * s.u[i] + 4 * s.w[i] * s.w[i];
    sum += amp2;
    s.heat[i] += (Math.sqrt(amp2) - s.heat[i]) * settle;
  }
  s.sigma1 = Math.sqrt(sum / Math.max(1, s.n));
  ambient(s, api, 7000, () => {
    strike(s, (Math.random() - 0.5) * LR, Math.random() * s.La, 0.05, (Math.random() * 4) | 0, api.now, false);
  });
  return dt;
}

/**
 * Draw the grains of the box, and of whichever copies of it fall on the
 * sheet. `view` places the box: its top left at (ox, oy), `scale` pixels to
 * a unit, azimuth across and radius down.
 */
function drawGrains(ctx, s, view, W, H, sizeK = 1) {
  const { ox, oy, scale } = view;
  const { n, x, y, La } = s;
  const span = La * scale;
  const reach = s.amax * scale * sizeK + 1;
  for (let i = 0; i < n; i++) {
    const rpx = s.a[i] * scale * sizeK;
    const sp = sprite(s, colourIndex(s, i), s.cls[i], rpx);
    const X = ox + y[i] * scale;
    const Y = oy + (x[i] + LR / 2) * scale;
    // Across the azimuth the box repeats as far as the sheet needs.
    const k0 = Math.ceil((-reach - X) / span);
    const k1 = Math.floor((W + reach - X) / span);
    for (let k = k0; k <= k1; k++) {
      const Xk = X + k * span;
      if (Y < -reach || Y > H + reach) continue;
      stamp(ctx, s, sp, Xk, Y);
    }
  }
}

/** The bounces and the strikes, in light over the grains. */
function drawFlashes(ctx, s, api, view, W, H) {
  const { ox, oy, scale } = view;
  const span = s.La * scale;
  const life = 520;
  ctx.save();
  ctx.globalCompositeOperation = s.dark ? 'lighter' : 'source-over';
  ctx.strokeStyle = s.way.bounce;
  ctx.lineWidth = Math.max(1, scale * 0.22);
  // Rings in four strengths, one path each: a stroke per ring was most of
  // the frame on a busy sheet.
  const live = [];
  const paths = [[], [], [], []];
  for (const b of s.bounces) {
    const age = api.now - b.born;
    if (age >= life || age < 0) continue;
    live.push(b);
    const t = age / life;
    const strength = (1 - t) * (0.35 + 0.65 * b.k);
    paths[Math.min(3, (strength * 4) | 0)].push(b, t);
  }
  for (let level = 0; level < 4; level++) {
    const list = paths[level];
    if (!list.length) continue;
    ctx.globalAlpha = (level + 0.6) / 4;
    ctx.beginPath();
    for (let k = 0; k < list.length; k += 2) {
      const b = list[k];
      const t = list[k + 1];
      const X0 = ox + b.y * scale;
      const Y = oy + (b.x + LR / 2) * scale;
      const r = (s.amin * 0.8 + (s.amax + 1) * Math.sqrt(t) * (0.6 + b.k)) * scale;
      if (Y < -r || Y > H + r) continue;
      for (let X = X0 - Math.ceil(X0 / span) * span; X < W + r; X += span) {
        if (X < -r) continue;
        ctx.moveTo(X + r, Y);
        ctx.arc(X, Y, r, 0, TAU);
      }
    }
    ctx.stroke();
  }
  s.bounces = live;
  const kept = [];
  for (const m of s.impacts) {
    const age = api.now - m.born;
    if (age >= 1400 || age < 0) continue;
    kept.push(m);
    const t = age / 1400;
    const col = s.way.stains[m.ink] || s.way.bounce;
    const X0 = ox + m.y * scale;
    const Y = oy + (m.x + LR / 2) * scale;
    const r = m.R * scale * (0.25 + 1.1 * Math.sqrt(t));
    for (let X = X0 - Math.ceil(X0 / span) * span; X < W + r; X += span) {
      if (X < -r) continue;
      // A flash at the centre, gone in a moment, and the ring of the splash.
      if (t < 0.3) {
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, m.R * scale * 0.7);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - t / 0.3) * (s.dark ? 0.75 : 0.35);
        ctx.fillStyle = g;
        ctx.fillRect(X - m.R * scale, Y - m.R * scale, m.R * scale * 2, m.R * scale * 2);
      }
      ctx.globalAlpha = (1 - t) * (1 - t) * 0.8;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1 + 2 * m.q * (1 - t);
      ctx.beginPath();
      ctx.arc(X, Y, r, 0, TAU);
      ctx.stroke();
    }
  }
  s.impacts = kept;
  ctx.restore();
}

/** Where on the patch a point of the sheet falls, brought back into the box through its copies. */
function toBox(s, view, px, py) {
  let y = (px - view.ox) / view.scale;
  let x = (py - view.oy) / view.scale - LR / 2;
  while (x >= LR / 2) { x -= LR; y += s.slide || 0; }
  while (x < -LR / 2) { x += LR; y -= s.slide || 0; }
  return { x, y: wrapA(y, s.La) };
}

function inkOf(p) {
  const k = KINDS.indexOf(p.category);
  return k < 0 ? (Math.random() * 4) | 0 : k;
}

/** The common event: a strike where the sheet's view puts it. */
function eventOn(viewOf) {
  return (p, api) => {
    const s = api.scene;
    if (!s.n) return;
    s.lastAt = api.now;
    const q = sizeOf(p, api);
    kick(s, 0.28 + 0.3 * q);
    const { x, y } = toBox(s, viewOf(api), p.x, p.y);
    strike(s, x, y, q, inkOf(p), api.now);
  };
}

function ground(ctx, s, W, H) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = s.way.ground;
  ctx.fillRect(0, 0, W, H);
}

// --- the sheets ------------------------------------------------------------------------

const patchView = (api) => ({ ox: 0, oy: 0, scale: api.h / LR });

function drawPatch(ctx, api) {
  const s = api.scene;
  if (!s.n) return;
  const W = api.w;
  const H = api.h;
  advance(s, api);
  ground(ctx, s, W, H);
  const view = patchView(api);
  drawGrains(ctx, s, view, W, H);
  // The grains of the copies above and below, where they reach over the edge.
  drawEdges(ctx, s, view, W, H);
  drawFlashes(ctx, s, api, view, W, H);
}

/** The grains of the neighbouring copies that overlap the box's radial edges. */
function drawEdges(ctx, s, view, W, H, alpha = 1, sizeK = 1) {
  const { n, x, y } = s;
  const S = s.slide || 0;
  const span = s.La * view.scale;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    let ox = 0;
    let oy = 0;
    if (x[i] > LR / 2 - s.amax) { ox = -LR; oy = S; }
    else if (x[i] < -LR / 2 + s.amax) { ox = LR; oy = -S; }
    else continue;
    const rpx = s.a[i] * view.scale * sizeK;
    const sp = sprite(s, colourIndex(s, i), s.cls[i], rpx);
    const X = view.ox + wrapA(y[i] + oy, s.La) * view.scale;
    const Y = view.oy + (x[i] + ox + LR / 2) * view.scale;
    for (let Xk = X - span; Xk < W + sp.half; Xk += span) {
      if (Xk < -sp.half) continue;
      stamp(ctx, s, sp, Xk, Y);
    }
  }
  ctx.globalAlpha = prev;
}

const replicaView = (api) => ({ ox: api.w * 0.25, oy: api.h * 0.25, scale: (api.h * 0.5) / LR });

function drawReplicas(ctx, api) {
  const s = api.scene;
  if (!s.n) return;
  const W = api.w;
  const H = api.h;
  advance(s, api);
  ground(ctx, s, W, H);
  const view = replicaView(api);
  const S = s.slide || 0;
  const span = s.La * view.scale;
  const ghost = 0.42;
  // The copies first, dimmed: inside, its grains at (x - LR, y + S); outside, at (x + LR, y - S).
  ctx.globalAlpha = ghost;
  drawGrains(ctx, s, { ox: view.ox + S * view.scale, oy: view.oy - LR * view.scale, scale: view.scale }, W, H);
  drawGrains(ctx, s, { ox: view.ox - S * view.scale, oy: view.oy + LR * view.scale, scale: view.scale }, W, H);
  ctx.globalAlpha = 1;
  drawGrains(ctx, s, view, W, H);
  drawEdges(ctx, s, view, W, H);
  // The seams of the boxes: the box itself in a firm line, the copies' seams
  // fainter, sliding with them.
  const line = mixColors(s.way.ice[0], s.way.ground, 0.35);
  ctx.save();
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  const top = view.oy;
  const bottom = view.oy + LR * view.scale;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, top); ctx.lineTo(W, top);
  ctx.moveTo(0, bottom); ctx.lineTo(W, bottom);
  const seams = (x0, y0, y1) => {
    for (let X = x0 - Math.ceil(x0 / span) * span; X <= W; X += span) {
      ctx.moveTo(X, y0);
      ctx.lineTo(X, y1);
    }
  };
  seams(view.ox, top, bottom);
  ctx.stroke();
  ctx.globalAlpha = 0.38;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  seams(view.ox + S * view.scale, Math.max(0, top - LR * view.scale), top);
  seams(view.ox - S * view.scale, bottom, Math.min(H, bottom + LR * view.scale));
  ctx.stroke();
  ctx.restore();
  drawFlashes(ctx, s, api, view, W, H);
}

function initExposure(api) {
  build(api);
  const s = api.scene;
  s.exposed = false;
  s.px = Float32Array.from(s.x);
  s.py = Float32Array.from(s.y);
  s.held = 0;
  // A plate already part exposed, so the sheet opens as a photograph rather
  // than as a dark rectangle. As many steps as a few dozen thousand grain
  // moves allow: a card's few hundred grains get a plate well along, the
  // canvas's thousands a start that the ring then finishes.
  const life = api.param('trail') * TAU;
  const steps = Math.min(240, Math.floor(120000 / s.n));
  const buf = scratch(api, 'ringbuf');
  const g = s.ringbufCtx;
  const sx = buf.width / Math.max(1, api.w);
  g.setTransform(sx, 0, 0, sx, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = s.way.ground;
  g.fillRect(0, 0, api.w, api.h);
  s.exposed = true;
  for (let k = 0; k < steps; k++) {
    step(s, MAX_STEP, api);
    s.held += MAX_STEP;
    if (s.held >= life / 30) expose(g, s, patchView(api), api.w, api.h, life);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Expose the plate: every grain's track since the last exposure, as a line
 * as wide as the grain, in its own colour.
 *
 * A plate exposed a little every frame never changes at all: an exposure of
 * a few thousandths rounds to nothing in eight bits, and the first version
 * of this sheet stayed exactly as dark as it began. So the ring's time is
 * held until it comes to a thirtieth of the exposure, and then laid down at
 * once, the track drawn from where each grain was to where it is.
 */
function expose(g, s, view, W, H, life) {
  const amount = s.held / life;
  s.held = 0;
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = Math.min(1, 1 - Math.exp(-amount));
  g.fillStyle = s.way.ground;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = s.dark ? 'lighter' : 'source-over';
  g.globalAlpha = Math.min(0.7, amount * (s.dark ? 0.9 : 2.2));
  // Butt ends: round ones overlap at every joint and bead the track.
  g.lineCap = 'butt';
  const { n, x, y, px, py, La } = s;
  const scale = view.scale;
  const span = La * scale;
  // Batched by colour and size: one path each.
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const dx = x[i] - px[i];
    let dy = y[i] - py[i];
    px[i] = x[i];
    py[i] = y[i];
    // Round the azimuth the track simply continues; across the radius the
    // grain has come back in through a copy, and leaves no track this time.
    if (Math.abs(dx) > LR / 2) continue;
    dy -= La * Math.round(dy / La);
    const key = colourIndex(s, i) * 8 + s.cls[i];
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(i, dx, dy);
  }
  for (const [key, list] of groups) {
    const colour = s.palette[(key / 8) | 0];
    const width = Math.max(0.7, s.amin * s.rel[key % 8] * scale * 1.1);
    g.strokeStyle = colour;
    g.fillStyle = colour;
    g.lineWidth = width;
    // A grain that has barely moved -- along the line the ring turns about,
    // where the shear is nothing -- is a dot rather than a track, or the
    // middle of the plate would never be exposed at all.
    const dots = new Path2D();
    g.beginPath();
    for (let k = 0; k < list.length; k += 3) {
      const i = list[k];
      const X1 = view.ox + y[i] * scale;
      const Y1 = view.oy + (x[i] + LR / 2) * scale;
      const X0 = X1 - list[k + 2] * scale;
      const Y0 = Y1 - list[k + 1] * scale;
      const still = Math.abs(X1 - X0) + Math.abs(Y1 - Y0) < width;
      for (let off = -span; off <= span; off += span) {
        if (Math.max(X0, X1) + off < -width || Math.min(X0, X1) + off > W + width) continue;
        if (still) {
          dots.moveTo(X1 + off + width / 2, Y1);
          dots.arc(X1 + off, Y1, width / 2, 0, TAU);
        } else {
          g.moveTo(X0 + off, Y0);
          g.lineTo(X1 + off, Y1);
        }
      }
    }
    g.stroke();
    g.fill(dots);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawExposure(ctx, api) {
  const s = api.scene;
  if (!s.n) return;
  const W = api.w;
  const H = api.h;
  const buf = scratch(api, 'ringbuf');
  const g = s.ringbufCtx;
  const sx = buf.width / Math.max(1, W);
  g.setTransform(sx, 0, 0, sx, 0, 0);
  if (!s.exposed) {
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = s.way.ground;
    g.fillRect(0, 0, W, H);
    s.exposed = true;
  }
  s.held += advance(s, api);
  const life = api.param('trail') * TAU;
  if (s.held >= life / 30) expose(g, s, patchView(api), W, H, life);
  g.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(buf, 0, 0, W, H);
  drawFlashes(ctx, s, api, patchView(api), W, H);
}

export const RING_SCENES = {
  rings: sheets({
    label: 'In the rings',
    note: 'A patch of a planet\'s rings seen from close by, a few thousand grains of ice going round together: the inner ones overtake the outer, so the whole sheet is always shearing, and the grains knock into one another, losing more of their speed the harder they hit. Where they pull on one another they gather into long trailing wakes, the texture of the real rings. Every event is a meteoroid striking the patch where it lands: the grains near it are thrown outward and stained in its colour, and the shear draws the stain out into a long slanting streak. A hard collision flashes as a ring of light. The ring goes round at the rate things arrive; in a quiet room it hangs almost still. The second sheet shows the trick that keeps the patch whole: copies of it above and below, sliding past it at the speed of the shear. The third is a long exposure, every grain drawing its own track.',
    positional: true,
    preview: { frames: 60, dt: 50 },
    params: {
      colours: { label: 'Colourway', options: WAY_NAMES, min: 0, max: WAY_NAMES.length - 1, step: 1, default: 0, rebuild: true },
      grains: { label: 'How many grains', min: 400, max: 4000, step: 50, default: 1800, rebuild: true },
      thickness: { label: 'How thick the ring', min: 0.2, max: 0.75, step: 0.01, default: 0.48, rebuild: true },
      spread: { label: 'Boulders against dust', min: 1, max: 4, step: 0.1, default: 2.6, rebuild: true },
      gravity: { label: 'How much they pull together', min: 0, max: 2, step: 0.05, default: 1.1 },
      loss: { label: 'How much a hit loses', min: 0, max: 1, step: 0.02, default: 0.78 },
      bounces: { label: 'How many bounces flash', min: 0, max: 1, step: 0.02, default: 0.7 },
      colourBy: { label: 'Colour by', options: ['stains', 'heat'], min: 0, max: 1, step: 1, default: 0 },
      stains: { label: 'How long a stain lasts, in orbits', min: 0.3, max: 8, step: 0.1, default: 2.5 },
    },
    list: [
      {
        name: 'patch',
        how: 'Hill\'s equations in a shearing box, the epicycle turned exactly each step and the drift taken after; the box periodic in azimuth and closed across the radius by copies sliding at the shear. Hard spheres in six sizes on a power law, collisions found through a grid that reaches into the copies, each resolved with the restitution of ice, 0.32 (v / v_c)^-0.234 after Bridges, Hatzes and Lin. Self-gravity by a particle-mesh solve: the surface density on a 64 by 32 grid, an FFT, the kernel -2 pi G / |k| softened over a cell. Each grain is stamped from a lit sphere drawn once per colour and size.',
        init: build,
        event: eventOn(patchView),
        frame: drawPatch,
      },
      {
        name: 'replicas',
        how: 'The same simulation drawn at half the height, with the copies of the box that close it: the one inside, its grains at (x - L, y + S), and the one outside at (x + L, y - S), where S is how far the shear has slid them, 3/2 Omega L t, folded into the box. Their seams are drawn dashed, and slide.',
        init: build,
        event: eventOn(replicaView),
        frame: drawReplicas,
      },
      {
        name: 'exposure',
        how: 'The same simulation exposed onto a plate: every frame each grain is stamped faintly, added as light on a dark ground, and the plate fades toward the ground as the ring turns rather than as the clock runs.',
        params: {
          trail: { label: 'How long the exposure, in orbits', min: 0.05, max: 1.5, step: 0.05, default: 0.35 },
        },
        init: initExposure,
        event: eventOn(patchView),
        frame: drawExposure,
      },
    ],
  }),
};
