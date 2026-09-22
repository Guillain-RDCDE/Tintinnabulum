// The scene registry and its extension point.
//
// A scene is a plain object. Adding a visualisation means adding one entry to
// one of the family modules -- that is the whole extension point, and it is
// why this project does not need p5.js: p5 is a friendly wrapper over the
// Canvas 2D API these files already use directly, so importing it would cost
// a megabyte and the offline guarantee while buying no capability at all.
//
//   {
//     label, note, positional?, preview?,
//     init?(api)          once per start, resize or palette change
//     event?(p, api)      a particle was just born
//     frame(ctx, api)     draw one frame
//   }
//
// `api` carries { w, h, palette, particles, now, dt, shape, ringLife, scene }.
// Every scene draws the same particle model, so hit-testing, lifetimes and the
// event contract stay in one place; a scene only decides appearance.
//
// The techniques -- flow fields, phyllotaxis, grid perturbation, interference
// -- are the shared vocabulary of generative art rather than anyone's
// invention. The grid is an explicit nod to Vera Molnar, whose work turned an
// ordered grid into a study of controlled disorder.

import { shadeOf, lighten, lightnessOf } from '../color.js';
import { applyFinish, drawMat, drawGrain } from '../finish.js';
import { applyGround } from '../grounds.js';
import { rngOf } from '../inks.js';
import { unitPosition } from '../../core/event.js';
import { MARK_SCENES } from './marks.js';
import { FIELD_SCENES } from './fields.js';
import { STRUCTURE_SCENES } from './structures.js';
import { PHYSICAL_SCENES } from './physical.js';
import { GENERATIVE_SCENES } from './generative.js';
import { GEOMETRY_SCENES } from './geometry.js';
import { RECURSIVE_SCENES } from './recursive.js';
import { SYSTEM_SCENES } from './systems.js';
import { FANTASIA_SCENES } from './fantasia.js';
import { AUTOMATA_SCENES } from './automata.js';
import { TILING_SCENES } from './tilings.js';
import { PAINTER_SCENES } from './painters.js';
import { MATERIAL_SCENES } from './materials.js';
import { NATURE_SCENES } from './nature.js';
import { WATER_SCENES } from './water.js';
import { AIR_SCENES } from './air.js';
import { TERMINAL_SCENES } from './terminal.js';
import { GRAPHIC_SCENES } from './graphic.js';
import { GROWN_SCENES } from './grown.js';
import { applyCatalogue, SCENE_SHELVES, shelfOf as shelfIn } from './catalogue.js';

export { noise2 } from './noise.js';

export const SCENES = {
  ...MARK_SCENES,
  ...FIELD_SCENES,
  ...STRUCTURE_SCENES,
  ...PHYSICAL_SCENES,
  ...GENERATIVE_SCENES,
  ...GEOMETRY_SCENES,
  ...RECURSIVE_SCENES,
  ...SYSTEM_SCENES,
  ...FANTASIA_SCENES,
  ...AUTOMATA_SCENES,
  ...TILING_SCENES,
  ...PAINTER_SCENES,
  ...MATERIAL_SCENES,
  ...NATURE_SCENES,
  ...WATER_SCENES,
  ...AIR_SCENES,
  ...TERMINAL_SCENES,
  ...GRAPHIC_SCENES,
  ...GROWN_SCENES,
};

// Presentation is applied once, here, across every family at once. See
// catalogue.js for why the note shown first is not the one beside the code.
applyCatalogue(SCENES);

export { SCENE_SHELVES };

/** The shelf a scene sits on in the picker. */
export const shelfOf = (name) => shelfIn(SCENES, name);

export const SCENE_NAMES = Object.keys(SCENES);
export const DEFAULT_SCENE = 'bloom';

/**
 * Draw a still preview of a scene onto a small canvas context.
 *
 * It runs the real scene against synthetic events and a simulated clock, so a
 * preview cannot drift from what the scene actually does -- a stored image
 * would be stale the moment a palette or a parameter changed. Motion-based
 * scenes need time to develop, hence the simulated frames rather than one.
 */
const ROLES = ['user', 'anon', 'bot', 'user', 'anon'];

/**
 * The api a scene is given on a card: the live canvas's contract, with a
 * synthetic clock and particles of its own. Shared by the still preview and
 * the live one, so the two cannot drift apart.
 */
function cardApi(scene, { w, h, palette, shape = 'circle', dt = 62, depth = true, richness = 0.45, params = {} }) {
  const particles = [];
  const darkGround = lightnessOf(palette.background) < 0.5;
  return {
    w, h, palette, particles,
    now: 0,
    dt,
    shape,
    ringLife: 2200,
    scene: {},
    depth,
    richness,
    darkGround,
    // A card holds a few dozen events on a thumbnail, so the ceiling the live
    // canvas runs under is irrelevant here; cap() has a floor that keeps every
    // scene from starving at this size.
    budget: 200,
    param: (name) => {
      const spec = (scene.params || {})[name];
      if (!spec) return undefined;
      return params[name] === undefined ? spec.default : params[name];
    },
    colorFor: (c) => palette[c] || palette.default,
    // The same contract CanvasSink offers, including the per-particle cache:
    // rebuilding a gradient for every mark on every frame is a hundred times
    // the work for one picture.
    fill: (c, p) => {
      if (!depth) return p.color;
      if (p._grad) return p._grad;
      const g = c.createRadialGradient(
        p.x - p.r * 0.3, p.y - p.r * 0.34, p.r * 0.08,
        p.x, p.y, p.r * 1.1
      );
      g.addColorStop(0, lighten(p.color, 0.07));
      g.addColorStop(0.6, p.color);
      g.addColorStop(1, lighten(p.color, -0.05));
      p._grad = g;
      return g;
    },
  };
}

/** One synthetic event for a card, shaded the way the live canvas shades one. */
function cardEvent(rnd, i, { w, h, palette, richness, darkGround }) {
  const p = rnd() ** 1.7;
  const role = ROLES[i % ROLES.length];
  const base = palette[role] || palette.default;
  const tint = [rnd(), rnd(), rnd()];
  const color = shadeOf(base, tint, richness);
  const room = darkGround ? 1 - lightnessOf(color) : lightnessOf(color);
  return {
    x: 8 + rnd() * (w - 16),
    y: 8 + rnd() * (h - 16),
    r: Math.max(2, Math.sqrt(p) * Math.min(w, h) * 0.34),
    rot: rnd() * Math.PI * 2,
    pick: rnd(),
    tint,
    base,
    color,
    rim: lighten(color, (darkGround ? 0.26 : -0.26) * Math.min(1, room * 1.6)),
    _grad: null,
    alpha0: 0.5,
    ring: true,
    label: '',
    url: '',
    life: 12000,
    category: role,
  };
}

/**
 * Run a scene live on a card, for as long as somebody is looking at it.
 *
 * The still preview simulates a hundred frames and keeps the last. This keeps
 * going: every frame is drawn and shown, a new synthetic event arrives every
 * few hundred milliseconds, and the finish and frame are applied as the live
 * canvas applies them. Call `frame(dt)` from an animation frame.
 */
export function animateScene(ctx, name, {
  w, h, palette, shape = 'circle', richness = 0.45, depth = true, params = {},
  finish = 'none', mat = 'none', pool = null, seed = 11, every = 380, ground = 'none',
} = {}) {
  const scene = SCENES[name] || SCENES[DEFAULT_SCENE];
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const api = cardApi(scene, { w, h, palette, shape, dt: 16, depth, richness, params });
  const buffers = pool || {};
  let count = 0;
  let since = 0;
  const arrive = () => {
    const p = cardEvent(rnd, count++, { w, h, palette, richness, darkGround: api.darkGround });
    p.born = api.now;
    api.particles.push(p);
    if (api.particles.length > 80) api.particles.splice(0, api.particles.length - 80);
    if (scene.event) {
      try { scene.event(p, api); } catch (e) { /* a card must not take the page down */ }
    }
  };
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, w, h);
  if (scene.init) scene.init(api);
  for (let i = 0; i < 10; i++) arrive();
  return {
    frame(dt) {
      api.dt = Math.max(1, Math.min(50, dt || 16));
      api.now += api.dt;
      since += api.dt;
      if (since >= every) {
        since = 0;
        arrive();
      }
      for (let i = api.particles.length - 1; i >= 0; i--) {
        if (api.now - api.particles[i].born >= api.particles[i].life) api.particles.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      try {
        scene.frame(ctx, api);
      } catch (e) {
        // Drawn as far as it got; the card stays up.
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (finish && finish !== 'none') applyFinish(ctx, finish, { palette, pool: buffers, now: api.now });
      if (ground && ground !== 'none') applyGround(ctx, ground, { palette, pool: buffers });
      if (mat && mat !== 'none') drawMat(ctx, mat, { palette });
    },
    get now() {
      return api.now;
    },
  };
}

/**
 * Run a scene as a picture somebody is making: seeded, developed at speed, and
 * then carried on live.
 *
 * The same seed gives the same picture. The events are drawn from it, and so
 * is every call a scene makes to Math.random while it is being run: many
 * scenes scatter with Math.random, and without this a variation number would
 * be a label rather than a recipe. The substitution lasts only for the scene's
 * own calls and the page's generator is back before anything else runs.
 *
 * `develop(n)` runs n frames of simulated time at once, silently, so a picture
 * can appear in a few animation frames rather than over seven seconds, and in
 * chunks, so a heavy scene does not freeze the page while it develops.
 * `frame(dt)` then carries on live, a new event every `every` milliseconds,
 * each reported to `onArrive` -- which is where a sound is played.
 */
export function playScene(ctx, name, {
  w, h, palette, shape = 'circle', richness = 0.45, depth = true, params = {},
  finish = 'none', mat = 'none', grain = 0, pool = null, seed = 1, every = 420, onArrive = null, ground = 'none',
} = {}) {
  const scene = SCENES[name] || SCENES[DEFAULT_SCENE];
  const events = rngOf(seed);
  const chance = rngOf((Math.imul(Number(seed) >>> 0, 2654435761) >>> 0) || 7);
  const buffers = pool || {};
  const api = cardApi(scene, { w, h, palette, shape, dt: 16, depth, richness, params });
  api.buffers = buffers;
  const seeded = (fn) => {
    const was = Math.random;
    Math.random = chance;
    try {
      return fn();
    } catch (e) {
      // A picture must not take the page down; it is drawn as far as it got.
      return undefined;
    } finally {
      Math.random = was;
    }
  };
  let count = 0;
  let since = 0;
  let quiet = true;
  let external = false;
  let interval = Math.max(40, every);
  const arrive = (ev = null) => {
    const p = cardEvent(events, count++, { w, h, palette, richness, darkGround: api.darkGround });
    if (ev) {
      // A real event: its size from how much it matters, its place from its
      // identity -- the same article lands in the same place -- and its colour
      // from its kind, where the palette has one.
      const s = ev.map && Number.isFinite(ev.map.salience) ? ev.map.salience : 0.5;
      p.r = Math.max(2, Math.sqrt(Math.max(0.02, Math.min(1, s))) * Math.min(w, h) * 0.34);
      if (ev.id != null) {
        const { u, v } = unitPosition(String(ev.id));
        p.x = 8 + u * (w - 16);
        p.y = 8 + v * (h - 16);
      }
      if (ev.category && palette[ev.category]) {
        p.category = ev.category;
        p.base = palette[ev.category];
        p.color = shadeOf(p.base, p.tint, richness);
      }
      p.label = ev.label || '';
    }
    p.born = api.now;
    api.particles.push(p);
    if (api.particles.length > 80) api.particles.splice(0, api.particles.length - 80);
    if (scene.event) seeded(() => scene.event(p, api));
    if (!quiet && onArrive && !ev) {
      try {
        onArrive(p, count - 1);
      } catch (e) {
        /* a sound that fails must not stop the picture */
      }
    }
    return p;
  };
  const advance = (dt) => {
    api.dt = dt;
    api.now += dt;
    since += dt;
    // Following a feed, the picture's own events stop: the feed's take their
    // place. Development runs on its own events regardless, so a number still
    // gives the same starting picture.
    if (external && quiet === false) since = 0;
    while (since >= interval) {
      since -= interval;
      arrive();
    }
    for (let i = api.particles.length - 1; i >= 0; i--) {
      if (api.now - api.particles[i].born >= api.particles[i].life) api.particles.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    seeded(() => scene.frame(ctx, api));
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  const dress = () => {
    if (finish && finish !== 'none') applyFinish(ctx, finish, { palette, pool: buffers, now: api.now });
    if (ground && ground !== 'none') applyGround(ctx, ground, { palette, pool: buffers });
    if (grain > 0) drawGrain(ctx, { pool: buffers, now: api.now, strength: grain });
    if (mat && mat !== 'none') drawMat(ctx, mat, { palette });
  };
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, w, h);
  seeded(() => scene.init && scene.init(api));
  for (let i = 0; i < 6; i++) arrive();
  const pre = scene.preview || {};
  const warmDt = pre.dt || 62;
  const warmFrames = pre.frames || 110;
  let warmed = 0;
  return {
    develop(n = warmFrames) {
      const live = interval;
      // Thirty or so events over the simulated seconds, whatever the tempo:
      // enough for every scene to have something to show.
      interval = Math.max(60, (warmFrames * warmDt) / 30);
      quiet = true;
      const until = Math.min(warmFrames, warmed + Math.max(1, n));
      for (; warmed < until; warmed++) advance(warmDt);
      interval = live;
      dress();
      return warmed >= warmFrames;
    },
    get developed() {
      return warmed >= warmFrames;
    },
    /** How far developed, 0 to 1. */
    get progress() {
      return warmed / warmFrames;
    },
    frame(dt) {
      quiet = false;
      advance(Math.max(1, Math.min(50, dt || 16)));
      dress();
    },
    arrive() {
      quiet = false;
      return arrive();
    },
    /** A real event, from a feed: see `external`. Not reported to onArrive. */
    arriveFrom(ev) {
      quiet = false;
      return arrive(ev || {});
    },
    /** True while the picture follows a feed rather than keeping its own time. */
    get external() {
      return external;
    },
    set external(on) {
      external = Boolean(on);
    },
    get every() {
      return interval;
    },
    set every(v) {
      interval = Math.max(40, Number(v) || interval);
    },
    get now() {
      return api.now;
    },
    get count() {
      return count;
    },
    api,
  };
}

export function previewScene(
  ctx,
  name,
  // Roughly seven seconds of simulated time. Much less and the scenes that
  // need time to develop -- motes tracing a flow field, drops falling, a
  // polar sweep advancing -- show an almost empty card and undersell
  // themselves. dt stays modest so the physics-based scenes integrate the
  // same way they do live.
  {
    w, h, palette, shape = 'circle', frames = 110, dt = 62, seed = 7,
    // A card that showed flat marks while the canvas drew shaded ones would be
    // advertising the wrong product, so the preview takes the same two colour
    // settings and builds the same per-event shades and gradients.
    richness = 0.45,
    depth = true,
    // The dials, so a card shows the scene as it is currently tuned rather
    // than as it ships.
    params = {},
    // A ceiling on how long one card may take, in milliseconds.
    //
    // Thirty-six of the forty scenes draw a card in under fifty milliseconds
    // and never come near this. Four do not: a Clifford attractor, a burin
    // field, a Chladni plate and a Gray-Scott reaction are simulations, and
    // they were costing between four hundred and eight hundred milliseconds
    // each. The page is frozen for every one of those, and a click landing in
    // that window is queued rather than acted on -- which is felt as a click
    // that did nothing, so you click again.
    //
    // Stopping early costs those four a less developed picture. It does not
    // cost them the wrong picture: the frames that ran are the scene's own,
    // and the card still cannot disagree with what you are about to launch.
    // Zero lifts the ceiling, which is what the contact sheet wants.
    budgetMs = 120,
    // How the card is dressed: the same finish and mat the canvas would
    // wear, so a card never shows a picture the canvas is not going to.
    finish = 'none',
    mat = 'none',
    pool = null,
    // The paper it is printed on, likewise.
    ground = 'none',
  } = {}
) {
  const scene = SCENES[name] || SCENES[DEFAULT_SCENE];
  // A scene may declare its own timescale: a polar sweep takes a minute to go
  // round, and drops live for under a second, so neither reads well at the
  // default rate.
  if (scene.preview) {
    frames = scene.preview.frames || frames;
    dt = scene.preview.dt || dt;
  }
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const api = cardApi(scene, { w, h, palette, shape, dt, depth, richness, params });
  const darkGround = api.darkGround;
  const particles = api.particles;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, w, h);
  if (scene.init) scene.init(api);

  const born = [];
  for (let i = 0; i < 34; i++) {
    // Births run right to the end: scenes whose marks are short-lived, like
    // falling drops, otherwise catch a quiet final frame and look empty.
    born.push({ at: Math.floor(rnd() * (frames - 2)), p: cardEvent(rnd, i, { w, h, palette, richness, darkGround }) });
  }

  // `performance` is not in every host this module might be loaded into, and a
  // preview that throws is worse than a preview that takes its time.
  const clock = typeof performance === 'object' && performance.now
    ? () => performance.now()
    : () => Date.now();
  const until = budgetMs > 0 ? clock() + budgetMs : Infinity;
  // A floor in frames as well as a ceiling in time. Some scenes draw nothing
  // at all for their first few frames -- the burin builds a density field
  // before it cuts a single line -- so a ceiling on its own can stop them
  // before they have made a mark, and the card comes out blank. Which happens
  // is a matter of how loaded the machine is at that moment, so it showed up
  // as a card that was fine in isolation and empty in the suite.
  const minFrames = Math.min(frames, 12);

  for (let f = 0; f < frames; f++) {
    api.now = f * api.dt;
    for (const b of born) {
      if (b.at !== f) continue;
      b.p.born = api.now;
      particles.push(b.p);
      if (scene.event) scene.event(b.p, api);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (api.now - particles[i].born >= particles[i].life) particles.splice(i, 1);
    }
    ctx.save();
    try {
      scene.frame(ctx, api);
    } catch (e) {
      ctx.restore();
      return false;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // Out of time. Stop on a drawn frame rather than after wiping the ground,
    // or the card would be blank -- which is the one outcome worse than slow.
    if (f + 1 >= minFrames && clock() >= until) break;
    // Only the last frame is kept, but the trailing ones must accumulate for
    // scenes that build up rather than redraw, so the ground is repainted
    // between frames exactly as the live canvas does.
    if (f < frames - 1) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, w, h);
    }
  }
  // Dressed once, on the frame that is kept, rather than on each of the
  // hundred that were drawn to get there.
  if (finish && finish !== 'none') applyFinish(ctx, finish, { palette, pool: pool || {}, now: frames * dt });
  if (ground && ground !== 'none') applyGround(ctx, ground, { palette, pool: pool || {} });
  if (mat && mat !== 'none') drawMat(ctx, mat, { palette });
  return true;
}

/** Add your own. A scene needs only `frame`; `init` and `event` are optional. */
export function registerScene(name, def) {
  if (!def || typeof def.frame !== 'function') {
    throw new Error('a scene needs a frame(ctx, api) function');
  }
  SCENES[name] = { label: def.label || name, note: def.note || '', ...def };
  if (!SCENE_NAMES.includes(name)) SCENE_NAMES.push(name);
  return SCENES[name];
}
