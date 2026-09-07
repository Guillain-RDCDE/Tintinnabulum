// Drawing machines: six figures that are nothing but a formula and a pen.
//
// Every one of these predates the computer. A spirograph is a toothed wheel
// inside a ring, sold as a toy in 1965 and known to mathematicians as a
// hypotrochoid long before that. A harmonograph is two pendulums and a pen,
// a Victorian parlour instrument. Guilloche is the engine-turning on the back
// of a pocket watch and the border of a banknote. Times-table string art is a
// nail-and-thread exercise from a school hall. The rose and the supershape are
// two lines of polar algebra each.
//
// None of that is anyone's property, and none of it is engineering. What each
// scene has to decide is the part that is actually this project's: which knob
// the data turns. A formula with its parameters wired to a live feed is a
// different object from the same formula with its parameters typed in, and the
// interesting choice is always which parameter, not which formula.
//
// Where these accumulate they paint onto an offscreen canvas, because the
// history of a pen is thousands of segments and redrawing it every frame is
// the one thing this cannot afford.

import { scratch } from './paint.js';

const TAU = Math.PI * 2;

/**
 * Prepare a scene's accumulation buffer, clearing it the first time.
 *
 * Returns the drawing context, or null before the canvas has a size -- which
 * happens on the first frame after a resize and is not worth a crash.
 */
function canvasFor(api, key = 'buf') {
  const cv = scratch(api, key);
  const g = api.scene[key + 'Ctx'];
  if (!api.scene[key + 'Clean']) {
    g.clearRect(0, 0, cv.width, cv.height);
    api.scene[key + 'Clean'] = true;
  }
  return g;
}

/**
 * Fade what has been drawn, so a scene that accumulates forever does not
 * eventually saturate to a solid block.
 *
 * `destination-out` removes alpha rather than painting the background over it,
 * which matters because the buffer is composited onto whatever the palette's
 * ground is; painting grey over grey would work on one palette and streak on
 * the other sixteen.
 */
function fade(g, cv, amount) {
  if (amount <= 0) return;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = `rgba(0,0,0,${Math.min(1, amount)})`;
  g.fillRect(0, 0, cv.width, cv.height);
  g.restore();
}

export const GEOMETRY_SCENES = {
  supershape: {
    label: 'Supershape',
    positional: false,
    note: 'Johan Gielis\'s superformula, 1997: one polar equation whose four numbers give circles, stars, petals and shards. Every event on screen gets a cell and draws its own.',
    // The four exponents are the whole point of the formula -- it was published
    // as a claim that one equation covers an enormous range of natural form --
    // so every one of them is a dial. Symmetry is the one the data turns.
    params: {
      m: { label: 'Most symmetry', min: 3, max: 20, step: 1, default: 12 },
      n1: { label: 'Roundness', min: 0.2, max: 8, step: 0.1, default: 0.6 },
      n2: { label: 'Pinch', min: 0.1, max: 6, step: 0.1, default: 1.7 },
      n3: { label: 'Flare', min: 0.1, max: 6, step: 0.1, default: 1.7 },
      cells: { label: 'Cells', min: 4, max: 120, step: 1, default: 40 },
    },
    frame(ctx, api) {
      // A plate, not a scatter. Two earlier versions drew each shape where its
      // event landed -- first accumulated onto a buffer, then as live marks --
      // and both were spaghetti: overlapping star outlines at a dozen sizes
      // have no readable edge between them, and the shapes were the entire
      // subject. Gielis published the formula as a plate of specimens, and the
      // reason is the same one that applies here.
      const n1 = api.param('n1');
      const n2 = api.param('n2');
      const n3 = api.param('n3');
      const topM = Math.round(api.param('m'));
      const cells = Math.round(api.param('cells'));

      // Newest last, so the freshest events are the ones that keep their cell
      // when the feed is busier than the plate is large.
      const live = api.particles.slice(-cells);
      if (!live.length) return;

      const cols = Math.max(1, Math.round(Math.sqrt(live.length * (api.w / Math.max(1, api.h)))));
      const rows = Math.ceil(live.length / cols);
      const cell = Math.min(api.w / cols, api.h / rows);
      const ox = (api.w - cols * cell) / 2;
      const oy = (api.h - rows * cell) / 2;

      // One path per symmetry rather than per cell: the outline depends only on
      // m and the three exponents, and there are at most eighteen values of m.
      const paths = new Map();
      const pathFor = (m) => {
        let path = paths.get(m);
        if (path) return path;
        path = new Path2D();
        const steps = 170;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * TAU;
          const r = superRadius(th, m, n1, n2, n3);
          if (i === 0) path.moveTo(r, 0);
          else path.lineTo(Math.cos(th) * r, Math.sin(th) * r);
        }
        path.closePath();
        paths.set(m, path);
        return path;
      };

      for (let i = 0; i < live.length; i++) {
        const p = live[i];
        const age = Math.min(1, (api.now - p.born) / p.life);
        // Identity picks the symmetry, so the same article is always the same
        // figure; magnitude fills more of its cell.
        const m = 3 + Math.floor(p.pick * (topM - 2));
        const R = cell * 0.42 * (0.5 + 0.5 * Math.min(1, p.r / 70));
        const cx = ox + ((i % cols) + 0.5) * cell;
        const cy = oy + (Math.floor(i / cols) + 0.5) * cell;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(p.rot * 0.25);
        ctx.scale(R, R);
        ctx.lineWidth = Math.max(0.6, cell * 0.016) / R;
        // A cell that has just been filled is at full strength and dims as its
        // event ages, so the plate reads newest-brightest without moving.
        ctx.globalAlpha = 0.25 + (1 - age) * 0.7;
        ctx.strokeStyle = p.color;
        ctx.stroke(pathFor(m));
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },

  maurer: {
    label: 'Maurer rose',
    positional: false,
    note: 'Peter Maurer, 1987: walk a rose curve in fixed angular strides and join the stops with straight lines. The rose is the ghost; the web across it is what the walk leaves. Events retune both.',
    params: {
      petals: { label: 'Petals', min: 2, max: 14, step: 1, default: 5 },
      walk: { label: 'Stride', min: 1, max: 180, step: 1, default: 29 },
      travel: { label: 'Travel speed', min: 0.1, max: 4, step: 0.05, default: 0.9 },
      weight: { label: 'Line weight', min: 0.3, max: 3, step: 0.1, default: 0.7 },
    },
    init(api) {
      const s = api.scene;
      s.n = api.param('petals');
      s.d = api.param('walk');
      s.tn = s.n;
      s.td = s.d;
      s.hot = -1e9;
    },
    event(p, api) {
      const s = api.scene;
      // Magnitude picks the number of petals, identity the stride. Stride is
      // where nearly all the character is: 29 and 31 on the same rose are two
      // completely different pictures, which is the property that makes this
      // worth wiring to a feed at all.
      const k = Math.min(1, p.r / 90);
      s.tn = 2 + Math.round(k * (api.param('petals') - 2) + (1 - k) * 2);
      s.td = 2 + Math.round(p.pick * (api.param('walk') - 2));
      if (s.td % 180 === 0) s.td += 1; // a multiple of 180 collapses to a line
      s.color = p.color;
      s.hot = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      // Ease rather than cut, as the plate does: the walk between two roses is
      // better than either end of it.
      const step = Math.min(1, (api.dt / 1000) * api.param('travel'));
      s.n += (s.tn - s.n) * step;
      s.d += (s.td - s.d) * step;

      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.44;
      const rad = Math.PI / 180;

      // The rose itself, faint: the curve the walk is sampling. Without it the
      // web has nothing to be a web across.
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = api.palette.default;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 720; i++) {
        const th = i * 0.5 * rad;
        const r = Math.sin(s.n * th) * R;
        const x = cx + Math.cos(th) * r;
        const y = cy + Math.sin(th) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // The walk: 361 stops, joined in order.
      const since = api.now - s.hot;
      ctx.globalAlpha = 0.55 + Math.max(0, 1 - since / 1400) * 0.4;
      ctx.strokeStyle = since < 2600 ? s.color || api.palette.user : api.palette.user;
      ctx.lineWidth = api.param('weight');
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const th = i * s.d * rad;
        const r = Math.sin(s.n * th) * R;
        const x = cx + Math.cos(th) * r;
        const y = cy + Math.sin(th) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  spirograph: {
    label: 'Spirograph',
    positional: false,
    preview: { dt: 30, frames: 200 }, // a pen needs turns to close its figure
    note: 'A hypotrochoid: a wheel rolling inside a ring with a pen through one of its holes. Sold as a toy in 1965, and known to mathematicians for a century before that. Each event sends a pen round.',
    params: {
      ring: { label: 'Ring', min: 40, max: 300, step: 1, default: 130 },
      wheel: { label: 'Wheel', min: 5, max: 140, step: 1, default: 47 },
      pen: { label: 'Pen offset', min: 2, max: 140, step: 1, default: 62 },
      draw: { label: 'Seconds per figure', min: 0.5, max: 20, step: 0.25, default: 4 },
      hold: { label: 'How long it holds', min: 0, max: 1, step: 0.02, default: 0.92 },
    },
    init(api) {
      api.scene.pens = [];
      api.scene.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      const cap = Math.max(3, Math.min(26, Math.round((api.budget || 800) * 0.02)));
      if (s.pens.length >= cap) s.pens.shift();
      s.pens.push({
        t0: p.pick * TAU,
        u: 0,                                   // 0..1 of the way round the figure
        scale: 0.78 + Math.min(0.24, p.r / 420),
        color: p.color,
        width: Math.max(0.6, Math.min(2.4, p.r * 0.026)),
        last: null,
      });
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = canvasFor(api);
      if (!g) return;

      const R = Math.round(api.param('ring'));
      const r = Math.max(1, Math.round(api.param('wheel')));
      const d = api.param('pen');
      const cx = api.w / 2;
      const cy = api.h / 2;
      // Fit the largest figure the dials can ask for, rather than trusting
      // them to be sensible: R - r + d can exceed any screen.
      const unit = Math.min(api.w, api.h) * 0.46 / Math.max(1, R - r + d);
      const ratio = (R - r) / r;

      // A hypotrochoid closes after r / gcd(R, r) turns of the ring: for a
      // ring of 130 and a wheel of 47 that is forty-seven of them. The first
      // version ran every pen at a fixed angular speed and lifted it after
      // fourteen, so it drew three sweeping arcs and called that a spirograph.
      // Each pen now covers its own closing period in a fixed number of
      // seconds, whatever period that happens to be.
      const turns = Math.min(120, r / gcd(R, r));
      const span = turns * TAU;
      const perFrame = (api.dt / 1000) / Math.max(0.1, api.param('draw'));

      g.lineCap = 'round';
      for (let i = s.pens.length - 1; i >= 0; i--) {
        const pen = s.pens[i];
        // Enough sub-steps that the curve is smooth at any frame rate: the
        // pen may be crossing several radians in one frame.
        const sub = Math.max(1, Math.min(90, Math.ceil((perFrame * span) / 0.06)));
        for (let k = 0; k < sub; k++) {
          pen.u += perFrame / sub;
          const t = pen.t0 + pen.u * span;
          const x = cx + ((R - r) * Math.cos(t) + d * Math.cos(ratio * t)) * unit * pen.scale;
          const y = cy + ((R - r) * Math.sin(t) - d * Math.sin(ratio * t)) * unit * pen.scale;
          if (pen.last) {
            g.globalAlpha = 0.55;
            g.strokeStyle = pen.color;
            g.lineWidth = pen.width;
            g.beginPath();
            g.moveTo(pen.last[0], pen.last[1]);
            g.lineTo(x, y);
            g.stroke();
          }
          pen.last = [x, y];
        }
        if (pen.u >= 1) s.pens.splice(i, 1);
      }
      g.globalAlpha = 1;

      const keep = api.param('hold');
      if (keep < 0.999) fade(g, cv, (1 - keep) * Math.min(0.05, api.dt / 1000) * 1.1);
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  harmonograph: {
    label: 'Harmonograph',
    positional: false,
    preview: { dt: 34, frames: 210 },
    note: 'Two pendulums per axis, swinging down. A Victorian parlour instrument that draws while it comes to rest. Each event sets one going; the figure is the record of it dying.',
    params: {
      ratio: { label: 'Frequency ratio', min: 1, max: 6, step: 0.01, default: 2 },
      detune: { label: 'Detune', min: 0, max: 0.06, step: 0.001, default: 0.008 },
      damping: { label: 'Damping', min: 0.01, max: 0.5, step: 0.005, default: 0.05 },
      speed: { label: 'Speed', min: 1, max: 20, step: 0.5, default: 7 },
      pens: { label: 'Pens at once', min: 1, max: 10, step: 1, default: 3 },
    },
    init(api) {
      api.scene.pens = [];
      api.scene.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      // A harmonograph is one pen, and a figure takes a while to draw. The
      // first version started a fresh pen on every event, so on a busy feed no
      // pen ever got more than a hundredth of a second and the scene drew a
      // wisp. Most events now do what a hand does to a swinging pendulum --
      // push it -- and only a pen that has had time to develop is replaced.
      const cap = Math.max(1, Math.round(api.param('pens')));
      const newest = s.pens[s.pens.length - 1];
      if (newest && newest.t < 12) {
        // A push restores swing without moving the pen: energy in, not time
        // back. Winding `t` back instead would make it retrace what it drew.
        newest.swing = Math.max(0, newest.swing - 3.5 - Math.min(6, p.r / 18));
        newest.color = p.color;
        return;
      }
      while (s.pens.length >= cap) s.pens.shift();
      s.pens.push({
        t: 0,
        swing: 0,
        phase: p.pick * TAU,
        amp: 0.55 + Math.min(0.4, p.r / 160),
        color: p.color,
        width: Math.max(0.5, Math.min(1.6, p.r * 0.016)),
        last: null,
      });
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = canvasFor(api);
      if (!g) return;

      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.44;
      const ratio = api.param('ratio');
      // A pair tuned to an exact ratio draws one closed figure and then
      // retraces it forever. The detune is what makes it precess, and it is
      // also honest: no two real pendulums were ever exactly in ratio.
      const det = api.param('detune');
      const damp = api.param('damping');
      const speed = api.param('speed');

      g.lineCap = 'round';
      for (let i = s.pens.length - 1; i >= 0; i--) {
        const pen = s.pens[i];
        const total = (api.dt / 1000) * speed;
        const sub = Math.max(1, Math.min(30, Math.ceil(total / 0.02)));
        for (let k = 0; k < sub; k++) {
          pen.t += total / sub;
          pen.swing += total / sub;
          const t = pen.t;
          // Two clocks: `t` is where the pen is on the curve and only ever goes
          // forward; `swing` is how much energy it has lost, and a push takes
          // that back.
          const decay = Math.exp(-damp * pen.swing);
          // Four pendulums, two per axis, each with its own phase. The quarter
          // turn between the axes is what makes the figure a rounded form
          // rather than a diagonal smear, and writing it with one shared phase
          // -- as the first version did -- drew exactly that smear.
          const x = cx + R * pen.amp * decay * 0.5 *
            (Math.sin(t + pen.phase) +
             Math.sin(ratio * t * (1 + det) + pen.phase * 1.7));
          const y = cy + R * pen.amp * decay * 0.5 *
            (Math.sin(t * (1 - det) + pen.phase + Math.PI / 2) +
             Math.sin(ratio * t * (1 + det * 0.5) + pen.phase * 0.4 + Math.PI / 2));
          if (pen.last) {
            g.globalAlpha = 0.3 + decay * 0.45;
            g.strokeStyle = pen.color;
            g.lineWidth = pen.width;
            g.beginPath();
            g.moveTo(pen.last[0], pen.last[1]);
            g.lineTo(x, y);
            g.stroke();
          }
          pen.last = [x, y];
        }
        // Lifted once the swing is too small to draw anything.
        if (Math.exp(-damp * pen.swing) < 0.025) s.pens.splice(i, 1);
      }
      g.globalAlpha = 1;
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },

  timestable: {
    label: 'Times table',
    positional: false,
    note: 'Mark N points round a circle and join each to its multiple. Two gives a cardioid, three a nephroid, and every whole number after that its own figure. Events walk the multiplier along.',
    params: {
      points: { label: 'Points', min: 23, max: 601, step: 2, default: 199 },
      factor: { label: 'Highest multiplier', min: 3, max: 120, step: 1, default: 6 },
      settle: { label: 'How fast it settles', min: 0.2, max: 6, step: 0.1, default: 1.6 },
      weight: { label: 'Line weight', min: 0.2, max: 2.5, step: 0.1, default: 0.55 },
    },
    init(api) {
      const s = api.scene;
      s.k = 2;
      s.target = 2;
      s.hot = -1e9;
    },
    event(p, api) {
      const s = api.scene;
      // Whole multipliers are where the figures are: two is a cardioid, three
      // a nephroid, and each integer after that its own. The first version let
      // the multiplier drift continuously, so it spent nearly all its time
      // between figures -- which is a disc of noise, and a disc of noise is
      // what it drew. An event steps it, and it eases to the next whole
      // number and stays there.
      // Small multipliers are the ones with names: two is a cardioid, three a
      // nephroid, four and five their own. Past a dozen the chords stop
      // resolving into a figure at all and the circle fills with an even mesh
      // -- which is what the dial defaulting to forty was drawing.
      const top = Math.round(api.param('factor'));
      const jump = 1 + Math.floor(Math.min(1, p.r / 120) * 2);
      s.target += p.pick > 0.42 ? jump : -jump;
      // Wrap rather than clamp: the family repeats, and a figure stuck against
      // the end of the dial would read as broken.
      while (s.target > top) s.target -= top - 1;
      while (s.target < 2) s.target += top - 1;
      s.color = p.color;
      s.hot = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      const n = Math.round(api.param('points'));
      // Ease, so the walk from one figure to the next is visible -- that
      // transit is the best thing here -- but land on the whole number.
      const step = Math.min(1, (api.dt / 1000) * api.param('settle'));
      s.k += (s.target - s.k) * step;
      if (Math.abs(s.target - s.k) < 0.002) s.k = s.target;

      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.46;

      // The default point count is prime, and that is not decoration. When the
      // count and the multiplier share a factor -- 180 points times 6 -- the
      // chords land on only a thirtieth of the points, and the circle fills
      // with an even mesh instead of showing the envelope. A prime count has no
      // factor to share, so every multiplier gets its own clean figure.
      const xs = new Float32Array(n);
      const ys = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2;
        xs[i] = cx + Math.cos(a) * R;
        ys[i] = cy + Math.sin(a) * R;
      }

      const since = api.now - s.hot;
      const moving = Math.abs(s.target - s.k) > 0.002;
      // Low, deliberately. The figure in a times table is the envelope the
      // chords crowd against, not the chords; drawn at full strength they fill
      // the circle evenly and the envelope disappears into them.
      ctx.globalAlpha = 0.28 + Math.max(0, 1 - since / 1200) * 0.32;
      ctx.strokeStyle = since < 2200 ? s.color || api.palette.user : api.palette.user;
      ctx.lineWidth = api.param('weight');
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        // Rounded while it is moving, exact once it lands: a fractional
        // multiplier is the transit and should look like one, but the figure
        // it settles on has to be the true one.
        const j = (moving ? Math.round(i * s.k) : i * s.target) % n;
        ctx.moveTo(xs[i], ys[i]);
        ctx.lineTo(xs[j], ys[j]);
      }
      ctx.stroke();

      // The rim, so the circle the chords are drawn in is visible.
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = api.palette.default;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  guilloche: {
    label: 'Guilloche',
    positional: false,
    note: 'The engine-turning on the back of a watch and the border of a banknote: a rosette cut by a machine whose two gears run at a fixed ratio. Events change the gearing.',
    params: {
      lobes: { label: 'Lobes', min: 3, max: 60, step: 1, default: 17 },
      depth: { label: 'Depth', min: 0.02, max: 0.6, step: 0.01, default: 0.22 },
      passes: { label: 'Passes', min: 1, max: 24, step: 1, default: 14 },
      twist: { label: 'Twist', min: 0, max: 1.2, step: 0.01, default: 0.28 },
      spin: { label: 'Spin', min: 0, max: 2, step: 0.02, default: 0.3 },
    },
    init(api) {
      const s = api.scene;
      s.lobes = api.param('lobes');
      s.target = s.lobes;
      s.hot = -1e9;
    },
    event(p, api) {
      const s = api.scene;
      // A rosette's character is its lobe count, and small whole numbers are
      // the ones that read: the machine had a gear for each.
      const k = Math.min(1, p.r / 100);
      s.target = 3 + Math.round(k * (api.param('lobes') - 3));
      s.color = p.color;
      s.hot = api.now;
    },
    frame(ctx, api) {
      const s = api.scene;
      const step = Math.min(1, (api.dt / 1000) * 1.2);
      s.lobes += (s.target - s.lobes) * step;

      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.45;
      const passes = Math.round(api.param('passes'));
      const depth = api.param('depth');
      const twist = api.param('twist');
      const t = (api.now / 6000) * api.param('spin');
      const since = api.now - s.hot;
      const warm = Math.max(0, 1 - since / 2000);

      ctx.lineWidth = 1;
      for (let pass = 0; pass < passes; pass++) {
        // Each pass is the same rosette on a slightly smaller radius and a
        // slightly turned phase. The moire between neighbouring passes is the
        // whole effect, and it is why a watch back catches the light.
        const u = passes === 1 ? 0 : pass / (passes - 1);
        const rad = R * (1 - u * 0.42);
        const phase = t + u * twist * TAU;
        ctx.globalAlpha = warm > 0.02 ? 0.3 + warm * 0.45 : 0.36;
        ctx.strokeStyle = warm > 0.4 && s.color ? s.color : api.palette.default;
        ctx.beginPath();
        const steps = 420;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * TAU;
          const r = rad * (1 + depth * Math.cos(s.lobes * th + phase));
          const x = cx + Math.cos(th + phase * 0.2) * r;
          const y = cy + Math.sin(th + phase * 0.2) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
};

/**
 * Gielis's superformula, as a radius in 0..1-ish for one angle.
 *
 * r = ( |cos(m th / 4) / a| ^ n2  +  |sin(m th / 4) / b| ^ n3 ) ^ (-1/n1)
 *
 * a and b are both 1 here; they scale the two axes independently and the
 * scene already has a size of its own.
 */
function superRadius(th, m, n1, n2, n3) {
  const t = (m * th) / 4;
  const a = Math.pow(Math.abs(Math.cos(t)), n2);
  const b = Math.pow(Math.abs(Math.sin(t)), n3);
  const sum = a + b;
  // n1 near zero sends the radius to infinity; the clamp keeps a bad dial from
  // drawing a shape the size of the solar system.
  if (!(sum > 1e-9)) return 0;
  return Math.min(3, Math.pow(sum, -1 / Math.max(0.05, n1)));
}

/** Greatest common divisor, for how many turns a hypotrochoid needs to close. */
function gcd(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}
