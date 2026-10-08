// Scenes that draw one mark per event, at the event's own position.

import { drawShape, isHollow } from '../shapes.js';
import { lightnessOf, mixColors } from '../color.js';
import { ambient } from './shared.js';
import { sheets } from './sheets.js';

const TAU = Math.PI * 2;

export const MARK_SCENES = {
  bloom: {
    label: 'Bloom',
    note: 'The original: each event opens once and fades, with a shockwave in its own shape.',
    frame(ctx, api) {
      const rule = isHollow(api.shape) ? 'evenodd' : 'nonzero';

      // Three passes rather than three operations per mark. Each pass sets the
      // compositing mode once; interleaving them would set it a few thousand
      // times a second to no visible end.

      for (const p of api.particles) {
        const age = api.now - p.born;
        if (!p.ring || age >= api.ringLife) continue;
        const t = Math.sqrt(age / api.ringLife);
        ctx.globalAlpha = (1 - t) * 0.35;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        drawShape(ctx, api.shape, p.x, p.y, p.r + 20 + t * 20, p.rot, p.pick);
        ctx.stroke();
      }

      for (const p of api.particles) {
        const fade = 1 - (api.now - p.born) / p.life;
        ctx.globalAlpha = p.alpha0 * fade;
        ctx.fillStyle = api.fill(ctx, p);
        ctx.beginPath();
        drawShape(ctx, api.shape, p.x, p.y, p.r, p.rot, p.pick);
        ctx.fill(rule);

        // A rim, and the single most useful line here. Translucent discs piled
        // on one another average towards a fog in which no disc has an edge;
        // that averaging is what "pale" actually means. Drawing the boundary
        // gives every mark back its outline, so a dense field reads as many
        // things overlapping rather than one wash.
        if (api.depth && p.r > 4) {
          ctx.globalAlpha = Math.min(1, fade * 0.5);
          ctx.strokeStyle = p.rim;
          ctx.lineWidth = Math.max(1, Math.min(2, p.r * 0.04));
          ctx.stroke();
        }
      }
    },
  },

  constellation: sheets({
    label: 'Constellation',
    note: 'Events become stars and join to their neighbours. Bursts of activity draw themselves as clusters. The second sheet is a molecule: targets of two or three nested colours, some with a thin halo, set apart from one another and joined by solid or dotted bonds -- a few pairs, or a whole network. Every event re-colours a target, sets a new one down and bonds it, or rings one with a halo.',
    list: [
      {
        name: 'stars',
        frame(ctx, api) {
          const ps = api.particles;
          const reach = Math.min(api.w, api.h) * 0.22;
          // Links first, so the stars sit on top of their own web.
          ctx.lineWidth = 1;
          for (let i = 0; i < ps.length; i++) {
            const a = ps[i];
            const fa = 1 - (api.now - a.born) / a.life;
            for (let j = i + 1; j < ps.length; j++) {
              const b = ps[j];
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              const d2 = dx * dx + dy * dy;
              if (d2 > reach * reach) continue;
              const fb = 1 - (api.now - b.born) / b.life;
              const near = 1 - Math.sqrt(d2) / reach;
              ctx.globalAlpha = near * fa * fb * 0.42;
              ctx.strokeStyle = a.color;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          for (const p of ps) {
            const fade = 1 - (api.now - p.born) / p.life;
            const r = Math.max(1.5, p.r * 0.22);
            // A star is a point of light, so depth here is a glow rather than an
            // outline: at this size an outline would be the whole star.
            if (api.depth) {
              ctx.globalAlpha = Math.min(1, fade) * 0.18;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, r * 3.4, 0, TAU);
              ctx.fill();
            }
            ctx.globalAlpha = Math.min(1, fade * 1.2);
            ctx.fillStyle = api.depth ? p.rim : p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, TAU);
            ctx.fill();
          }
        },
      },
      // The second sheet: a molecule of nested targets, bonded into pairs or a
      // whole network.
      {
        name: 'molecule',
        params: {
          count: { label: 'How many targets', min: 30, max: 160, step: 1, default: 72, rebuild: true },
          bonds: { label: 'How many bonds', min: 0, max: 1, step: 0.02, default: 0.6 },
          halos: { label: 'How many halos', min: 0, max: 1, step: 0.02, default: 0.24 },
        },
        init: moleculeInit,
        event: moleculeEvent,
        frame: moleculeFrame,
      },
    ],
  }),

  ripples: {
    label: 'Ripples',
    note: 'Concentric wavefronts that cross and interfere. Pairs naturally with the Water kit.',
    frame(ctx, api) {
      ctx.lineWidth = 1.4;
      for (const p of api.particles) {
        const age = (api.now - p.born) / 1000;
        // A ripple on a pond is gone in three seconds, whatever the life of
        // the event that made it. Spread over the whole of that life, the
        // rings went on travelling long after the feed had stopped, and a
        // quiet second changed half as much as a busy one.
        const fade = 1 - (api.now - p.born) / Math.min(p.life, 3200);
        if (fade <= 0) continue;
        const lead = age * 110;
        for (let k = 0; k < 4; k++) {
          const r = lead - k * 26;
          if (r <= 1) continue;
          ctx.globalAlpha = Math.max(0, fade * 0.5 * (1 - k / 4) * Math.min(1, 60 / r));
          // The leading wavefront is brighter than the ones trailing it, which
          // is both how a real ripple looks and what tells you which way the
          // wave is travelling.
          ctx.strokeStyle = api.depth && k === 0 ? p.rim : p.color;
          ctx.lineWidth = api.depth && k === 0 ? 2 : 1.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke();
        }
      }
    },
  },
};

// --- the molecule -------------------------------------------------------------------------

/** The inks of the molecule: the palette's colours, a near-white and a near-black. */
function moleculeInks(api) {
  const pal = api.palette;
  const dark = lightnessOf(pal.background) < 0.5;
  const out = [pal.user, pal.anon, pal.bot, pal.alert, pal.default].filter(Boolean);
  out.push(dark ? '#f2eee8' : '#141414');
  if (!dark) out.push('#faf6ec');
  return out;
}

/** A target's rings, outermost first: two or three inks, never the same twice running. */
function ringsOf(s) {
  const n = Math.random() < 0.55 ? 3 : 2;
  const out = [];
  let last = -1;
  for (let k = 0; k < n; k++) {
    let i = (Math.random() * s.inks.length) | 0;
    if (i === last) i = (i + 1) % s.inks.length;
    out.push(i);
    last = i;
  }
  // Now and then the middle is left open, the ground showing through.
  if (Math.random() < 0.07) out[out.length - 1] = -1;
  return out;
}

function targetOf(s, x, y, r, now) {
  return {
    x, y, r,
    rings: ringsOf(s),
    split: [0.5 + Math.random() * 0.25, 0.22 + Math.random() * 0.18],
    halo: Math.random() < s.halos ? { k: 1.45 + Math.random() * 1.1, ink: (Math.random() * s.inks.length) | 0 } : null,
    born: now,
    lit: 0,
  };
}

/** A free place near (x, y) for a target of radius r, or null. */
function placeFor(s, x, y, r) {
  for (let t = 0; t < 30; t++) {
    const a = Math.random() * Math.PI * 2;
    const d = t === 0 ? 0 : s.unit * (0.5 + t * 0.25);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (px - r < s.x0 || px + r > s.x1 || py - r < s.y0 || py + r > s.y1) continue;
    let ok = true;
    for (const n of s.nodes) {
      const need = n.r * (n.halo ? Math.max(1, n.halo.k * 0.6) : 1) + r + s.unit * 0.18;
      if ((n.x - px) ** 2 + (n.y - py) ** 2 < need * need) {
        ok = false;
        break;
      }
    }
    if (ok) return [px, py];
  }
  return null;
}

/** A radius: mostly small, a few large, one or two very large. */
function radiusOf(s) {
  const u = Math.random();
  return s.unit * (0.36 + 1.4 * u ** 4 + (u > 0.97 ? 1.6 : 0));
}

/** Bond every target to its nearest few, as far as the dial allows. */
function bondAll(s, api) {
  s.links = [];
  const want = api.param('bonds');
  const reach = s.unit * (2.2 + want * 2.6);
  const seen = new Set();
  for (let i = 0; i < s.nodes.length; i++) {
    const a = s.nodes[i];
    const near = [];
    for (let j = 0; j < s.nodes.length; j++) {
      if (i === j) continue;
      const b = s.nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      if (d < reach) near.push([d, j]);
    }
    near.sort((p, q) => p[0] - q[0]);
    const k = Math.round(want * 3.4 * (0.5 + Math.random()));
    for (const [, j] of near.slice(0, k)) {
      const key = i < j ? i + ',' + j : j + ',' + i;
      if (seen.has(key)) continue;
      seen.add(key);
      s.links.push({ a: s.nodes[i], b: s.nodes[j], dotted: Math.random() < 0.4 });
    }
  }
}

function moleculeInit(api) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  const margin = m * 0.05;
  s.x0 = margin;
  s.y0 = margin;
  s.x1 = api.w - margin;
  s.y1 = api.h - margin;
  const count = Math.round(api.param('count'));
  // The unit is the radius a typical target has when the sheet holds `count`
  // of them comfortably.
  s.unit = Math.sqrt(((s.x1 - s.x0) * (s.y1 - s.y0)) / count) * 0.34;
  s.inks = moleculeInks(api);
  s.halos = api.param('halos');
  s.nodes = [];
  for (let t = 0; t < count * 4 && s.nodes.length < count; t++) {
    const r = radiusOf(s);
    const at = placeFor(s, s.x0 + Math.random() * (s.x1 - s.x0), s.y0 + Math.random() * (s.y1 - s.y0), r);
    if (at) s.nodes.push(targetOf(s, at[0], at[1], r, -1e9));
  }
  bondAll(s, api);
  s.lastAt = 0;
  s.ambient = 0;
  s.bondsAt = api.param('bonds');
}

function moleculeEvent(p, api) {
  const s = api.scene;
  if (!s.nodes) return;
  const q = Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34)));
  let near = null;
  let best = Infinity;
  for (const n of s.nodes) {
    const d = Math.hypot(n.x - p.x, n.y - p.y) - n.r;
    if (d < best) {
      best = d;
      near = n;
    }
  }
  if (q < 0.3 && near) {
    near.rings = ringsOf(s);
    near.lit = 1;
  } else if (q < 0.75) {
    // A new target where it fell, bonded to its nearest; the oldest goes
    // when the sheet is full, with its bonds.
    const r = s.unit * (0.32 + q * 0.9);
    const at = placeFor(s, p.x, p.y, r);
    if (at) {
      const n = targetOf(s, at[0], at[1], r, api.now);
      const most = Math.max(20, Math.min(220, Math.round(api.param('count') * 1.2), Math.floor((api.budget || 800) / 2)));
      if (s.nodes.length >= most) {
        const gone = s.nodes.shift();
        s.links = s.links.filter((l) => l.a !== gone && l.b !== gone);
      }
      s.nodes.push(n);
      const nearby = s.nodes.filter((o) => o !== n).sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y));
      const k = 1 + Math.round(api.param('bonds') * 2);
      for (const o of nearby.slice(0, k)) s.links.push({ a: n, b: o, dotted: Math.random() < 0.4, born: api.now });
      if (s.links.length > 600) s.links.splice(0, s.links.length - 600);
    } else if (near) {
      near.rings = ringsOf(s);
      near.lit = 1;
    }
  } else if (near) {
    near.halo = { k: 1.5 + q * 1.2, ink: (Math.random() * s.inks.length) | 0 };
    near.rings = ringsOf(s);
    near.lit = 1;
  }
  s.lastAt = api.now;
}

function moleculeFrame(ctx, api) {
  const s = api.scene;
  if (!s.nodes) return;
  const pal = api.palette;
  if (api.param('bonds') !== s.bondsAt) {
    s.bondsAt = api.param('bonds');
    bondAll(s, api);
  }
  ambient(s, api, 3500, () => {
    const n = s.nodes[(Math.random() * s.nodes.length) | 0];
    if (n) n.rings = ringsOf(s);
  });
  const dark = lightnessOf(pal.background) < 0.5;
  const m = Math.min(api.w, api.h);
  const lw = Math.max(1, m * 0.0028);
  const grown = (n) => Math.min(1, (api.now - n.born) / 400);
  ctx.lineCap = 'round';
  // Bonds first, from the edge of one target to the edge of the other.
  for (const l of s.links) {
    const ga = grown(l.a);
    const gb = grown(l.b);
    if (ga <= 0 || gb <= 0) continue;
    const dx = l.b.x - l.a.x;
    const dy = l.b.y - l.a.y;
    const d = Math.hypot(dx, dy) || 1;
    const ax = l.a.x + (dx / d) * l.a.r * 0.9;
    const ay = l.a.y + (dy / d) * l.a.r * 0.9;
    const bx = l.b.x - (dx / d) * l.b.r * 0.9;
    const by = l.b.y - (dy / d) * l.b.r * 0.9;
    const ca = s.inks[l.a.rings[0]] || pal.default;
    const cb = s.inks[l.b.rings[0]] || pal.default;
    ctx.globalAlpha = Math.min(ga, gb) * (dark ? 0.75 : 0.95);
    if (l.dotted) {
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, ca);
      g.addColorStop(1, cb);
      ctx.strokeStyle = g;
      ctx.lineWidth = lw * 1.1;
      ctx.setLineDash([lw * 0.4, lw * 1.6]);
    } else {
      ctx.strokeStyle = dark ? mixColors(ca, pal.background, 0.45) : '#141414';
      ctx.lineWidth = lw;
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const n of s.nodes) {
    const g = grown(n);
    if (g <= 0) continue;
    n.lit = Math.max(0, n.lit - api.dt / 900);
    const r = n.r * (0.6 + 0.4 * g) * (1 + n.lit * 0.08);
    ctx.globalAlpha = g;
    if (n.halo) {
      ctx.strokeStyle = s.inks[n.halo.ink];
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * n.halo.k, 0, Math.PI * 2);
      ctx.stroke();
    }
    const sizes = [1, n.split[0], n.split[1]];
    n.rings.forEach((ink, k) => {
      ctx.fillStyle = ink < 0 ? pal.background : s.inks[ink];
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * sizes[k], 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}