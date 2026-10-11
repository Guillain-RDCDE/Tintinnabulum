// The surface a scene is handed: one factory for every host.
//
// A scene runs on the live canvas (CanvasSink) and on cards -- the still
// preview, the live card and the picture somebody is making in Create -- and
// the two used to build the api each on their own, which let them drift: one
// had `colorFor`, the other `second` and `sound`, and a member added to one
// was missing from the other until a scene asked for it on a card.
//
// What still differs between the hosts is real and is said by the host, in
// the options, rather than by leaving a member out:
//
//   the live canvas   its own clock and particles; `budget` is the renderer's
//                     ceiling; `sound` is what the engine is playing, or null;
//                     `buffers` is the renderer's pool; `second` says which of
//                     two layered scenes this is; `param` reads the renderer's
//                     dials.
//   a card            a synthetic clock and particles of its own; `budget` is
//                     200, since a thumbnail holds a few dozen events; `sound`
//                     is null; `buffers` is the runner's pool when it was given
//                     one and absent otherwise; `param` falls back to the
//                     dial's default; `colorFor` is there for the runner.

import { lighten, lightnessOf } from '../color.js';

/**
 * A mark's fill: a shallow radial gradient, cached on the mark, or its flat
 * colour when depth is off. Deliberately shallow -- a strong highlight turns
 * every mark into a glass bead; the point is only to keep a large disc from
 * reading as one dead area of colour.
 */
export function gradientFill(ctx, p, depth = true) {
  if (!depth) return p.color;
  if (p._grad) return p._grad;
  const g = ctx.createRadialGradient(
    p.x - p.r * 0.3, p.y - p.r * 0.34, p.r * 0.08,
    p.x, p.y, p.r * 1.1
  );
  g.addColorStop(0, lighten(p.color, 0.07));
  g.addColorStop(0.6, p.color);
  g.addColorStop(1, lighten(p.color, -0.05));
  p._grad = g;
  return g;
}

/**
 * The api a scene reads.
 *
 * @param {object} o
 * @param {number} o.w
 * @param {number} o.h
 * @param {object} o.palette        the nine roles
 * @param {object[]} [o.particles]
 * @param {string} [o.shape]
 * @param {number} [o.ringLife]
 * @param {number} [o.now]
 * @param {number} [o.dt]
 * @param {object} [o.scene]        the scene's own scratch state
 * @param {object} [o.buffers]      a pool of offscreen canvases, or nothing
 * @param {boolean} [o.depth]
 * @param {number} [o.richness]
 * @param {boolean} [o.darkGround]  worked out from the palette when not given
 * @param {number} [o.budget]
 * @param {?object} [o.sound]
 * @param {Function} o.param        (name) => the dial's value
 * @param {Function} [o.fill]       (ctx, p) => a fill; the shared gradient by default
 * @param {boolean} [o.second]
 * @param {Function} [o.colorFor]   (category) => a colour; cards only
 */
export function makeSceneApi({
  w, h, palette, particles = [], shape = 'circle', ringLife = 2200, now = 0, dt = 16, scene = {},
  buffers, depth = true, richness = 0.45, darkGround, budget = 800, sound = null, param, fill, second = false, colorFor,
}) {
  const api = {
    second,
    w,
    h,
    palette,
    particles,
    shape,
    ringLife,
    now,
    dt,
    scene,
    buffers,
    depth,
    richness,
    darkGround: darkGround === undefined ? lightnessOf(palette.background) < 0.5 : darkGround,
    budget,
    sound,
    param,
    fill: fill || ((ctx, p) => gradientFill(ctx, p, depth)),
  };
  if (colorFor) api.colorFor = colorFor;
  return api;
}
