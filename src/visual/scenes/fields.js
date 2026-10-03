// Scenes that treat the canvas as a field the events disturb.

import { noise2 } from './noise.js';
import { cap } from './budget.js';
import { ambient, kick } from './shared.js';

const TAU = Math.PI * 2;

export const FIELD_SCENES = {
  flow: {
    label: 'Flow field',
    positional: false,
    note: 'Every event releases a mote into a slowly turning noise field, and it draws where it drifts.',
    params: {
      scale: { label: 'Field scale', min: 40, max: 460, step: 1, default: 190 },
      trail: { label: 'Trail length', min: 10, max: 200, step: 2, default: 120 },
      drift: { label: 'Drift speed', min: 0.2, max: 3, step: 0.05, default: 1 },
    },
    init(api) {
      api.scene.trails = [];
      api.scene.seed = Math.random() * 1000;
    },
    event(p, api) {
      api.scene.trails.push({
        x: p.x,
        y: p.y,
        rim: p.rim,
        // The path so far. The canvas is cleared every frame, so a trail that
        // only drew the segment since the last frame left a dash rather than
        // the track it had travelled.
        pts: [p.x, p.y],
        color: p.color,
        width: Math.max(0.8, p.r * 0.09),
        life: 1,
        speed: 18 + p.r * 0.5,
      });
      const capT = cap(api, 0.6);
      if (api.scene.trails.length > capT) api.scene.trails.splice(0, api.scene.trails.length - capT);
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.trails) return;
      const t = api.now / 9000 + s.seed;
      const step = Math.min(0.05, api.dt / 1000);
      for (let i = s.trails.length - 1; i >= 0; i--) {
        const tr = s.trails[i];
        const scale = api.param('scale');
        const angle = noise2(tr.x / scale + t, tr.y / scale - t) * TAU * 2;
        const drift = api.param('drift');
        tr.x += Math.cos(angle) * tr.speed * step * drift;
        tr.y += Math.sin(angle) * tr.speed * step * drift;
        tr.pts.push(tr.x, tr.y);
        const keep = api.param('trail');
        if (tr.pts.length > keep) tr.pts.splice(0, tr.pts.length - keep);
        tr.life -= step * 0.14;
        if (
          tr.life <= 0 ||
          tr.x < -40 || tr.x > api.w + 40 || tr.y < -40 || tr.y > api.h + 40
        ) {
          s.trails.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(0.85, tr.life);
        ctx.strokeStyle = tr.color;
        ctx.lineWidth = tr.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(tr.pts[0], tr.pts[1]);
        for (let k = 2; k < tr.pts.length; k += 2) ctx.lineTo(tr.pts[k], tr.pts[k + 1]);
        ctx.stroke();
        // The head only, never the whole trail. Five hundred trails of sixty
        // points each is thirty thousand segments a frame already; drawing a
        // highlight over all of them would double that for a gleam nobody sees
        // on the tail. The mote is where the eye is anyway.
        if (api.depth && tr.pts.length >= 8) {
          const n = tr.pts.length;
          ctx.globalAlpha = Math.min(0.95, tr.life * 1.2);
          ctx.strokeStyle = tr.rim || tr.color;
          ctx.lineWidth = tr.width * 0.7;
          ctx.beginPath();
          ctx.moveTo(tr.pts[n - 8], tr.pts[n - 7]);
          for (let k = n - 6; k < n; k += 2) ctx.lineTo(tr.pts[k], tr.pts[k + 1]);
          ctx.stroke();
        }
      }
    },
  },

  grid: {
    label: 'Grid',
    positional: false,
    note: 'An ordered grid that each event knocks out of true, settling back over time. After Vera Molnár. The second sheet is a current: solid squares in a few inks on a coloured ground, upright in one corner and turned further and further across the sheet until they stand on their points, drifting so they crowd and part, with cells left empty. Every event turns and re-inks the squares round where it falls.',
    // `rebuild` says a change re-runs init(): a grid cannot resize its cells
    // without being built again, where a line width can just be read.
    params: {
      figure: { label: 'Which sheet: outlines, current', min: 0, max: 1, step: 1, default: 0, rebuild: true, vary: false },
      cell: { label: 'Cell size', min: 16, max: 90, step: 1, default: 40, rebuild: true },
      square: { label: 'Square size', min: 0.25, max: 0.95, step: 0.01, default: 0.62 },
      fill: { label: 'How full the current is', min: 0.3, max: 1, step: 0.02, default: 0.82, rebuild: true },
      turn: { label: 'How far the current turns them', min: 0, max: 1.5, step: 0.05, default: 1 },
    },
    init(api) {
      api.scene.figure = Math.max(0, Math.min(1, Math.round(api.param('figure') || 0)));
      if (api.scene.figure === 1) {
        currentInit(api);
        return;
      }
      const cell = api.param('cell');
      const cols = Math.max(1, Math.floor(api.w / cell));
      const rows = Math.max(1, Math.floor(api.h / cell));
      api.scene.cell = cell;
      api.scene.cols = cols;
      api.scene.rows = rows;
      api.scene.heat = new Float32Array(cols * rows);
      api.scene.turn = new Float32Array(cols * rows);
    },
    event(p, api) {
      const s = api.scene;
      if (s.figure === 1) {
        currentEvent(p, api);
        return;
      }
      if (!s.heat) return;
      const cx = Math.floor((p.x / api.w) * s.cols);
      const cy = Math.floor((p.y / api.h) * s.rows);
      const i = Math.max(0, Math.min(s.cols * s.rows - 1, cy * s.cols + cx));
      s.heat[i] = Math.min(1.6, s.heat[i] + 0.5 + p.r / 120);
      s.turn[i] += (Math.random() - 0.5) * 1.4;
      s.lastColor = p.color;
      s.lastRim = p.rim;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (s.figure === 1) {
        currentFrame(ctx, api);
        return;
      }
      if (!s.heat) return;
      const decay = Math.min(0.06, api.dt / 1000) * 0.55;
      const w = api.w / s.cols;
      const h = api.h / s.rows;
      const side = Math.min(w, h) * api.param('square');
      ctx.lineWidth = 1.2;
      for (let y = 0; y < s.rows; y++) {
        for (let x = 0; x < s.cols; x++) {
          const i = y * s.cols + x;
          s.heat[i] = Math.max(0, s.heat[i] - decay);
          s.turn[i] *= 1 - decay * 0.9;
          const heat = s.heat[i];
          const cx = (x + 0.5) * w;
          const cy = (y + 0.5) * h;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(s.turn[i]);
          ctx.globalAlpha = 0.12 + Math.min(0.8, heat * 0.6);
          ctx.strokeStyle = heat > 0.05 ? s.lastColor || api.palette.default : api.palette.default;
          ctx.strokeRect(-side / 2, -side / 2, side, side);
          if (heat > 0.55) {
            ctx.globalAlpha = Math.min(0.55, (heat - 0.55) * 0.9);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillRect(-side / 2, -side / 2, side, side);
            // A lit top and left edge on the hottest cells, so a struck square
            // looks raised out of the grid rather than merely tinted.
            if (api.depth) {
              ctx.globalAlpha = Math.min(0.8, (heat - 0.55) * 1.4);
              ctx.fillStyle = s.lastRim || ctx.strokeStyle;
              ctx.fillRect(-side / 2, -side / 2, side, 1.5);
              ctx.fillRect(-side / 2, -side / 2, 1.5, side);
            }
          }
          ctx.restore();
        }
      }
    },
  },

  truchet: {
    label: 'Truchet',
    positional: false,
    note: 'Quarter-arc tiles that flip as events land, so unbroken curves wander across the whole field.',
    params: {
      cell: { label: 'Tile size', min: 18, max: 140, step: 1, default: 64, rebuild: true },
      weight: { label: 'Line weight', min: 0.04, max: 0.34, step: 0.005, default: 0.16 },
    },
    init(api) {
      // Larger tiles: at sixteen across the curves read as texture rather than
      // as the continuous lines that are the whole point of a Truchet field.
      const cell = api.param('cell');
      const cols = Math.max(1, Math.ceil(api.w / cell));
      const rows = Math.max(1, Math.ceil(api.h / cell));
      api.scene.cols = cols;
      api.scene.rows = rows;
      api.scene.flip = new Uint8Array(cols * rows);
      api.scene.heat = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) api.scene.flip[i] = Math.random() < 0.5 ? 1 : 0;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.flip) return;
      const cx = Math.min(s.cols - 1, Math.floor((p.x / api.w) * s.cols));
      const cy = Math.min(s.rows - 1, Math.floor((p.y / api.h) * s.rows));
      const i = Math.max(0, cy * s.cols + cx);
      s.flip[i] ^= 1;
      s.heat[i] = 1;
      s.lastColor = p.color;
      s.lastRim = p.rim;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.flip) return;
      const w = api.w / s.cols;
      const h = api.h / s.rows;
      const decay = Math.min(0.05, api.dt / 1000) * 0.5;
      ctx.lineWidth = Math.max(1, Math.min(w, h) * api.param('weight'));
      ctx.lineCap = 'butt';
      for (let y = 0; y < s.rows; y++) {
        for (let x = 0; x < s.cols; x++) {
          const i = y * s.cols + x;
          s.heat[i] = Math.max(0, s.heat[i] - decay);
          const x0 = x * w;
          const y0 = y * h;
          ctx.globalAlpha = 0.5 + s.heat[i] * 0.5;
          ctx.strokeStyle = s.heat[i] > 0.05 ? s.lastColor || api.palette.default : api.palette.default;
          ctx.beginPath();
          if (s.flip[i]) {
            ctx.arc(x0, y0, w / 2, 0, Math.PI / 2);
            ctx.moveTo(x0 + w, y0 + h);
            ctx.arc(x0 + w, y0 + h, w / 2, Math.PI, Math.PI * 1.5);
          } else {
            ctx.arc(x0 + w, y0, w / 2, Math.PI / 2, Math.PI);
            ctx.moveTo(x0, y0 + h);
            ctx.arc(x0, y0 + h, w / 2, Math.PI * 1.5, TAU);
          }
          ctx.stroke();
          // The ribbons are several pixels wide, so they can carry a core.
          // The path is still current after stroking, so this is a second
          // stroke and not a second path -- and only on cells an event has
          // just touched, which is a handful of the field at any moment.
          if (api.depth && s.heat[i] > 0.05) {
            const wide = ctx.lineWidth;
            ctx.globalAlpha = s.heat[i] * 0.8;
            ctx.strokeStyle = s.lastRim || ctx.strokeStyle;
            ctx.lineWidth = wide * 0.34;
            ctx.stroke();
            ctx.lineWidth = wide;
          }
        }
      }
    },
  },
};

// --- the current --------------------------------------------------------------------------

/**
 * The angle the current gives a square at (u, v), both 0..1: nothing in the
 * calm corner, a quarter turn's half by the far side, and a slow wave across
 * it so the turning comes in bands rather than a ramp.
 */
function currentAngle(s, u, v) {
  const du = s.calm[0] ? 1 - u : u;
  const dv = s.calm[1] ? 1 - v : v;
  const d = Math.min(1, Math.hypot(du, dv) / 1.1);
  const ease = d * d * (3 - 2 * d);
  const wave = Math.sin(u * s.fu + v * s.fv + s.phase) * 0.18;
  return (Math.PI / 4) * Math.max(0, Math.min(1.1, ease + wave * ease));
}

function currentInit(api) {
  const s = api.scene;
  const m = Math.min(api.w, api.h);
  const margin = m * 0.05;
  s.x0 = margin;
  s.y0 = margin;
  s.W = api.w - margin * 2;
  s.H = api.h - margin * 2;
  const cell = Math.max(7, api.param('cell') * (m / 900) * 0.72);
  s.cols = Math.max(6, Math.round(s.W / cell));
  s.rows = Math.max(6, Math.round(s.H / cell));
  s.cw = s.W / s.cols;
  s.ch = s.H / s.rows;
  s.calm = [Math.random() < 0.5, Math.random() < 0.3 ? 0 : 1];
  s.fu = 3 + Math.random() * 4;
  s.fv = 2 + Math.random() * 4;
  s.phase = Math.random() * TAU;
  const n = s.cols * s.rows;
  s.ink = new Uint8Array(n);
  s.on = new Uint8Array(n);
  s.twist = new Float32Array(n);
  s.lit = new Float32Array(n);
  const fill = api.param('fill');
  for (let i = 0; i < n; i++) {
    s.ink[i] = (Math.random() * 5) | 0;
    // Gaps come in loose patches, not as salt: a cell is left out more
    // readily where its neighbour above was.
    const above = i >= s.cols ? s.on[i - s.cols] : 1;
    s.on[i] = Math.random() < fill * (above ? 1 : 0.7) ? 1 : 0;
  }
  s.clock = 0;
  s.drive = 0;
  s.lastAt = 0;
  s.ambient = 0;
}

function currentEvent(p, api) {
  const s = api.scene;
  if (!s.ink) return;
  const q = Math.max(0, Math.min(1, p.r / (Math.min(api.w, api.h) * 0.34)));
  const c0 = (p.x - s.x0) / s.cw;
  const r0 = (p.y - s.y0) / s.ch;
  const reach = 1.2 + q * 4.5;
  const ink = (Math.random() * 5) | 0;
  const spin = (Math.random() < 0.5 ? -1 : 1) * (0.35 + q * 0.6);
  const lo = (v, n) => Math.max(0, Math.floor(v - reach));
  const hi = (v, n) => Math.min(n - 1, Math.ceil(v + reach));
  for (let r = lo(r0, s.rows); r <= hi(r0, s.rows); r++) {
    for (let c = lo(c0, s.cols); c <= hi(c0, s.cols); c++) {
      const d = Math.hypot(c + 0.5 - c0, r + 0.5 - r0) / reach;
      if (d > 1) continue;
      const i = r * s.cols + c;
      const k = 1 - d;
      s.twist[i] += spin * k;
      s.lit[i] = Math.max(s.lit[i], k);
      // The middle of the stir takes the event's ink; a large event also
      // fills the gaps it passes through, or opens new ones.
      // Mixed, not a patch: the sheets keep their inks salted together.
      if (d < 0.6 && Math.random() < 0.5) s.ink[i] = Math.random() < 0.5 ? ink : (Math.random() * 5) | 0;
      if (q > 0.6 && Math.random() < 0.3 * k) s.on[i] = s.on[i] ? 0 : 1;
    }
  }
  kick(s);
  s.lastAt = api.now;
}

function currentFrame(ctx, api) {
  const s = api.scene;
  if (!s.ink) return;
  const pal = api.palette;
  const inks = [pal.user, pal.anon, pal.bot, pal.alert, pal.default].map((c) => c || pal.default);
  // The sheet's clock runs at the rate things arrive: a stirred patch
  // settles only while the feed is working, and stays turned in silence.
  s.drive = Math.max(0, s.drive - api.dt / 1200);
  const step = api.dt * (0.02 + s.drive) / 1000;
  const settle = Math.exp(-step * 1.6);
  const fade = Math.exp(-step * 3);
  ambient(s, api, 3200, () => {
    const i = (Math.random() * s.ink.length) | 0;
    s.ink[i] = (Math.random() * 5) | 0;
  });
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, api.w, api.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.x0, s.y0, s.W, s.H);
  ctx.clip();
  const turn = api.param('turn');
  const side = Math.min(s.cw, s.ch) * Math.max(0.3, api.param('square') + 0.18);
  for (let r = 0; r < s.rows; r++) {
    const v = (r + 0.5) / s.rows;
    for (let c = 0; c < s.cols; c++) {
      const i = r * s.cols + c;
      s.twist[i] *= settle;
      s.lit[i] *= fade;
      if (!s.on[i]) continue;
      const u = (c + 0.5) / s.cols;
      const a = currentAngle(s, u, v) * turn;
      // Carried along the current a little, more where it turns most, so
      // the turned squares crowd into one another and the upright ones keep
      // their rows.
      const shift = (a / (Math.PI / 4)) * s.cw * 0.35;
      const x = s.x0 + (c + 0.5) * s.cw + Math.cos(a + Math.PI / 4) * shift;
      const y = s.y0 + (r + 0.5) * s.ch - Math.sin(a + Math.PI / 4) * shift * 0.6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-(a + s.twist[i]));
      ctx.fillStyle = inks[s.ink[i]];
      const grow = 1 + s.lit[i] * 0.12;
      ctx.fillRect((-side * grow) / 2, (-side * grow) / 2, side * grow, side * grow);
      ctx.restore();
    }
  }
  ctx.restore();
}