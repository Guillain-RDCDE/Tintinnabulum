// Finishes: what a scene is printed on, and with what.
//
// A scene decides where the marks go. A finish decides what they are made of:
// ink on rice paper, two drums of a risograph slightly out of register, light
// through leaded glass, thread through linen. The same picture under ten
// finishes is ten pictures, and that is the cheapest way there is to take a
// catalogue of constructions somewhere nearer to art.
//
// Everything here works on the finished frame as a whole, after the scene has
// drawn it, using what a canvas does quickly -- compositing, the built-in
// filters, and a few textures generated once per size. Nothing here walks the
// frame pixel by pixel except the embroidery, which reads a canvas a sixth the
// size and draws only the cells that differ from the ground. The point is that
// a finish must cost a frame budget, not a second.
//
// Every finish derives its inks from the palette, so a finish never fights the
// scheme that was chosen: the risograph's two drums are the palette's own two
// most-used colours, the glass is lit by the palette, the gold is the gold of
// the palette's warmest mark where it has one.

import { lightnessOf, mixColors, lighten, parseColor } from './color.js';

export const FINISH_ORDER = [
  'none', 'paper', 'watercolour', 'ink', 'riso', 'lino',
  'neon', 'glass', 'stitch', 'cyanotype', 'chalk', 'gold', 'pointillist', 'dither',
];

export const FINISHES = {
  none: { label: 'As drawn', note: 'The scene exactly as it draws itself, with nothing on top.' },
  paper: { label: 'Paper', note: 'A fine grain and a soft vignette, as if printed on a good matte stock.' },
  watercolour: { label: 'Watercolour', note: 'Colour that bleeds into wet paper and gathers darker at its edges.' },
  ink: { label: 'Ink wash', note: 'One ink, diluted to greys, on warm rice paper. Everything else is taken away.' },
  riso: { label: 'Risograph', note: 'Two inks from two drums, a little out of register, with the dot screen showing.' },
  lino: { label: 'Linocut', note: 'Hard-edged ink pressed from a carved block, with the grain of the cut in it.' },
  neon: { label: 'Neon', note: 'Bent glass tubes glowing in a dark room, humming very slightly.' },
  glass: { label: 'Stained glass', note: 'Light coming through coloured glass held in dark lead.' },
  stitch: { label: 'Embroidery', note: 'The picture worked in cross-stitch on cloth, one thread at a time.' },
  cyanotype: { label: 'Cyanotype', note: 'The old sun print: everything in Prussian blue, the marks left pale.' },
  chalk: { label: 'Chalk', note: 'Drawn in chalk on a slate board, with the dust still on it.' },
  gold: { label: 'Gold leaf', note: 'Marks laid in gold on black lacquer, catching a slow light.' },
  pointillist: { label: 'Pointillism', note: 'The picture rebuilt from dots of colour set side by side, left for the eye to mix.' },
  dither: { label: 'Dither', note: 'The picture reduced to the palette\'s own inks and a fine pattern of dots, as an early computer screen would have shown it.' },
};

export const MAT_ORDER = ['none', 'thin', 'gallery'];
export const MATS = {
  none: { label: 'No frame', width: 0 },
  thin: { label: 'Thin mat', width: 0.035 },
  gallery: { label: 'Gallery mat', width: 0.075 },
};

// --- helpers ----------------------------------------------------------------

/** An offscreen canvas from the caller's pool, the size asked for. */
function buffer(pool, key, w, h) {
  let cv = pool[key];
  if (!cv || cv.width !== w || cv.height !== h) {
    cv = typeof OffscreenCanvas === 'function' && !pool.__domOnly
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    pool[key] = cv;
  }
  return cv;
}

/** A tiny deterministic generator: a texture must not shimmer between frames. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Does this browser apply ctx.filter? Safari before 18 ignores it silently. */
let filterSupport = null;
function canFilter(ctx) {
  if (filterSupport === null) {
    try {
      ctx.save();
      ctx.filter = 'blur(1px)';
      filterSupport = ctx.filter === 'blur(1px)';
      ctx.restore();
    } catch (e) {
      filterSupport = false;
    }
  }
  return filterSupport;
}

/** Monochrome grain, generated once per size and reused. */
function grain(pool, w, h, { seed = 7, size = 1, contrast = 1 } = {}) {
  const key = `tex:grain:${w}:${h}:${seed}:${size}:${contrast}`;
  if (pool[key]) return pool[key];
  const tw = Math.max(1, Math.ceil(w / size));
  const th = Math.max(1, Math.ceil(h / size));
  const small = buffer(pool, key + ':small', tw, th);
  const g = small.getContext('2d');
  const img = g.createImageData(tw, th);
  const rnd = seeded(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 255 * contrast;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const cv = buffer(pool, key, w, h);
  const cg = cv.getContext('2d');
  cg.imageSmoothingEnabled = size > 1;
  cg.drawImage(small, 0, 0, w, h);
  return cv;
}

/** Colour of the paper a print-like finish sits on, warm and light. */
function paperOf(palette) {
  const bg = palette.background;
  // A light palette already has a paper; a dark one is printed on cream.
  return lightnessOf(bg) > 0.6 ? bg : '#efe8da';
}

/** The frame, copied into a buffer, so it can be drawn back through filters. */
function snapshot(ctx, pool, W, H) {
  const src = buffer(pool, 'finish:src', W, H);
  const g = src.getContext('2d');
  g.globalCompositeOperation = 'copy';
  g.drawImage(ctx.canvas, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return src;
}

/**
 * A density layer: the frame as a greyscale where marks are dark and the
 * ground is white, whatever the palette. Print finishes need exactly this --
 * ink goes where the picture is -- and a dark palette has it the wrong way up.
 */
function density(pool, src, W, H, palette, extra = '') {
  const cv = buffer(pool, 'finish:density', W, H);
  const g = cv.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'copy';
  const invert = lightnessOf(palette.background) < 0.5 ? ' invert(1)' : '';
  g.filter = `grayscale(1)${invert} ${extra}`.trim();
  g.drawImage(src, 0, 0);
  g.restore();
  return cv;
}

/** Paint an ink onto a density layer: white stays white, black becomes ink. */
function inked(pool, key, dens, W, H, ink) {
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.globalCompositeOperation = 'copy';
  g.drawImage(dens, 0, 0, W, H);
  g.globalCompositeOperation = 'screen';
  g.fillStyle = ink;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return cv;
}

// --- the finishes -------------------------------------------------------------

const APPLY = {
  none() {},

  pointillist(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const cell = Math.max(4, Math.round(Math.min(W, H) / 110));
    const cols = Math.ceil(W / cell) + 1;
    const rows = Math.ceil(H / cell) + 1;
    const small = buffer(pool, 'finish:dotsmall', cols, rows);
    const sg = small.getContext('2d');
    const layer = buffer(pool, 'finish:dotlayer', W, H);
    const lg = layer.getContext('2d');
    ctx.fillStyle = lightnessOf(palette.background) > 0.5 ? paperOf(palette) : palette.background;
    ctx.fillRect(0, 0, W, H);
    // Two passes of dots, the second pushed in colour and set between the
    // first: pure touches side by side, for the eye to mix, is the method.
    // No readback anywhere: the picture is shrunk to one pixel a dot, blown
    // up without smoothing, and cut to the dots.
    for (let pass = 0; pass < 2; pass++) {
      sg.save();
      sg.globalCompositeOperation = 'copy';
      sg.imageSmoothingEnabled = true;
      if (canFilter(sg)) sg.filter = pass === 0 ? 'saturate(1.35)' : 'saturate(1.9) brightness(1.08)';
      sg.drawImage(src, 0, 0, W, H, 0, 0, W / cell, H / cell);
      sg.restore();
      lg.save();
      lg.globalCompositeOperation = 'copy';
      lg.imageSmoothingEnabled = false;
      lg.drawImage(small, 0, 0, cols, rows, 0, 0, cols * cell, rows * cell);
      lg.globalCompositeOperation = 'destination-in';
      lg.drawImage(dots(pool, W, H, cell, pass), 0, 0);
      lg.restore();
      ctx.drawImage(layer, 0, 0);
    }
  },

  paper(ctx, o) {
    const { W, H, pool } = o;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(grain(pool, W, H, { seed: 11, contrast: 0.7 }), 0, 0);
    vignette(ctx, W, H, 0.28);
  },

  watercolour(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const px = Math.max(2, Math.round(Math.min(W, H) / 180));
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, W, H);
    // The bleed: the picture softened and spread, a little stronger in colour
    // than it was, because wet pigment always reads more saturated.
    ctx.filter = `blur(${px * 4}px) saturate(1.35)`;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(src, 0, 0);
    // The pooling: the sharp picture multiplied back on top, which is what
    // darkens the edges of each stroke the way drying pigment does.
    ctx.filter = `blur(${Math.max(1, px * 0.5)}px)`;
    ctx.globalCompositeOperation = lightnessOf(palette.background) < 0.5 ? 'screen' : 'multiply';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    // Paper tooth, and gently: at full strength the first version read as
    // television static rather than as paper.
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.28;
    ctx.drawImage(grain(pool, W, H, { seed: 23, size: 3, contrast: 0.55 }), 0, 0);
    vignette(ctx, W, H, 0.18);
  },

  ink(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const px = Math.max(1, Math.round(Math.min(W, H) / 400));
    const dens = density(pool, src, W, H, palette, 'contrast(1.4) brightness(1.05)');
    ctx.fillStyle = '#efe8da';
    ctx.fillRect(0, 0, W, H);
    // A wash first, soft and pale, then the stroke sharp on top of it: the two
    // passes a brush makes, loaded and then nearly dry.
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = `blur(${px * 3}px) brightness(1.2)`;
    ctx.globalAlpha = 0.7;
    ctx.drawImage(dens, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.drawImage(inked(pool, 'finish:ink', dens, W, H, '#1c1a19'), 0, 0);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(grain(pool, W, H, { seed: 31, size: 2, contrast: 0.8 }), 0, 0);
  },

  riso(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const off = Math.max(1, Math.round(Math.min(W, H) / 260));
    // Pushed hard: translucent marks otherwise land as mid-greys, and a grey
    // screened with an ink is a washed-out ink -- the first version came out
    // beige rather than in two colours.
    //
    // And separated: each drum prints only part of the picture, split by
    // colour the way a real separation is. Printing the whole picture from
    // both drums laid a teal over a coral everywhere, which is brown.
    const drumA = mixColors(palette.user, '#000000', 0.08);
    const drumB = mixColors(palette.anon, '#000000', 0.05);
    const sepA = separation(pool, 'finish:sepA', src, W, H, palette, '#ff0000', 3);
    const sepB = separation(pool, 'finish:sepB', src, W, H, palette, '#00ffff', 2);
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    // Two drums, two inks, and the second a couple of pixels off the first.
    // The misregistration is not a flaw being imitated, it is the look.
    ctx.drawImage(inked(pool, 'finish:drumA', sepA, W, H, drumA), off, off * 0.6);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(inked(pool, 'finish:drumB', sepB, W, H, drumB), -off, -off * 0.6);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(screen(pool, W, H), 0, 0);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(grain(pool, W, H, { seed: 41, contrast: 0.6 }), 0, 0);
  },

  lino(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    // Thresholded towards solid ink rather than towards paper: the first
    // version added brightness as well, and nearly every mark went white.
    const dens = density(pool, src, W, H, palette, 'contrast(2.6) brightness(0.82)');
    const ink = lightnessOf(palette.alert) < 0.55 ? palette.alert : mixColors(palette.alert, '#000', 0.45);
    ctx.fillStyle = '#efe9dd';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(inked(pool, 'finish:lino', dens, W, H, ink), 0, 0);
    // The gouge: fine parallel cuts through the ink, which is what makes a
    // relief print look carved rather than filled in.
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(gouge(pool, W, H), 0, 0);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.5;
    ctx.drawImage(grain(pool, W, H, { seed: 53, size: 3, contrast: 1 }), 0, 0);
  },

  neon(ctx, o) {
    const { W, H, pool, palette, now } = o;
    const src = snapshot(ctx, pool, W, H);
    const px = Math.max(2, Math.round(Math.min(W, H) / 120));
    const room = mixColors(lighten(palette.background, -0.08), '#05030a', 0.6);
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, W, H);
    // Picture minus its ground, so only the tubes glow and not the wall. On a
    // light palette the ground would otherwise light the whole room.
    const tubes = density(pool, src, W, H, palette, '');
    const lit = buffer(pool, 'finish:neonlit', W, H);
    const lg = lit.getContext('2d');
    lg.globalCompositeOperation = 'copy';
    lg.drawImage(src, 0, 0);
    lg.globalCompositeOperation = 'multiply';
    lg.filter = 'invert(1)';
    lg.drawImage(tubes, 0, 0);
    lg.filter = 'none';
    lg.globalCompositeOperation = 'source-over';
    // A slow hum rather than a flicker: a neon sign that visibly blinks is a
    // broken one, and this is meant to be a good one.
    const hum = 0.92 + 0.08 * Math.sin(now / 900) * Math.sin(now / 1370);
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${px * 3}px) saturate(1.8)`;
    ctx.globalAlpha = 0.7 * hum;
    ctx.drawImage(lit, 0, 0);
    ctx.filter = `blur(${px}px) saturate(1.6) brightness(1.3)`;
    ctx.globalAlpha = 0.9 * hum;
    ctx.drawImage(lit, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.drawImage(lit, 0, 0);
  },

  glass(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const px = Math.max(1, Math.round(Math.min(W, H) / 300));
    ctx.fillStyle = mixColors(palette.background, '#000', 0.35);
    ctx.fillRect(0, 0, W, H);
    // The glass: colour pushed and slightly softened, as light through a
    // pane is never as crisp as paint on a wall.
    ctx.filter = `blur(${px * 2}px) saturate(1.9) brightness(1.25)`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    // Light through it, brighter at the top as a window is.
    const light = ctx.createLinearGradient(0, 0, 0, H);
    light.addColorStop(0, 'rgba(255,248,230,0.28)');
    light.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(leading(pool, W, H), 0, 0);
  },

  stitch(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const cell = Math.max(5, Math.round(Math.min(W, H) / 70));
    const cols = Math.ceil(W / cell);
    const rows = Math.ceil(H / cell);
    // The picture at one pixel per stitch. Read back at that size only: a
    // readback of the full frame, and one stroke per stitch, were the whole
    // cost of the first two versions (464 ms, then 182 ms a frame at 1200 by
    // 675). Now the only work on the processor is a few thousand cells.
    const small = buffer(pool, 'finish:stitchsmall', cols, rows);
    const sg = small.getContext('2d');
    sg.globalCompositeOperation = 'copy';
    sg.imageSmoothingEnabled = true;
    sg.drawImage(src, 0, 0, cols, rows);
    sg.globalCompositeOperation = 'source-over';
    const img = sg.getImageData(0, 0, cols, rows);
    const data = img.data;
    const bg = parseHex(palette.background);
    for (let i = 0; i < data.length; i += 4) {
      // Only the cells that are not ground get a stitch: cloth embroidered
      // edge to edge is upholstery.
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      data[i + 3] = d < 42 ? 0 : 255;
    }
    sg.putImageData(img, 0, 0);
    // Blown up without smoothing, so each cell is one flat thread colour, then
    // cut to the shape of the crosses, which are drawn once per size.
    const threads = buffer(pool, 'finish:stitchthreads', W, H);
    const tg = threads.getContext('2d');
    tg.globalCompositeOperation = 'copy';
    tg.imageSmoothingEnabled = false;
    tg.drawImage(small, 0, 0, cols * cell, rows * cell);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(crosses(pool, W, H, cell), 0, 0);
    tg.globalCompositeOperation = 'source-over';
    const cloth = lightnessOf(palette.background) < 0.5 ? mixColors(palette.background, '#8a8175', 0.25) : '#e9e2d3';
    ctx.fillStyle = cloth;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(weave(pool, W, H, cell), 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(threads, 0, 0);
  },

  cyanotype(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    // Marks pale on blue, whichever way up the palette was: take the density
    // layer, where marks are dark, and turn it over.
    const dens = density(pool, src, W, H, palette, 'contrast(1.3)');
    ctx.fillStyle = '#0d3b66';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'invert(1) brightness(0.92)';
    ctx.drawImage(dens, 0, 0);
    ctx.filter = 'none';
    // Uneven exposure: sun prints are never flat, and the corners go darker.
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(grain(pool, W, H, { seed: 61, size: 4, contrast: 1 }), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    vignette(ctx, W, H, 0.35);
  },

  chalk(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    const dens = density(pool, src, W, H, palette, 'contrast(1.2)');
    // The marks as chalk: pale, then broken up by the board's own tooth, so
    // the dust sits on the high points and misses the low ones.
    const marks = buffer(pool, 'finish:chalk', W, H);
    const mg = marks.getContext('2d');
    mg.globalCompositeOperation = 'copy';
    mg.filter = 'invert(1)';
    mg.drawImage(dens, 0, 0);
    mg.filter = 'none';
    mg.globalCompositeOperation = 'multiply';
    mg.drawImage(grain(pool, W, H, { seed: 71, size: 1, contrast: 1.6 }), 0, 0);
    mg.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#23272b';
    ctx.fillRect(0, 0, W, H);
    // The smudge of earlier lessons, rubbed out but never quite gone.
    ctx.globalAlpha = 0.18;
    ctx.filter = `blur(${Math.max(4, Math.round(Math.min(W, H) / 40))}px)`;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(marks, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 0.95;
    ctx.drawImage(marks, 0, 0);
  },

  gold(ctx, o) {
    const { W, H, pool, palette, now } = o;
    const src = snapshot(ctx, pool, W, H);
    const dens = density(pool, src, W, H, palette, 'contrast(1.5)');
    const leaf = buffer(pool, 'finish:gold', W, H);
    const lg = leaf.getContext('2d');
    lg.globalCompositeOperation = 'copy';
    lg.filter = 'invert(1)';
    lg.drawImage(dens, 0, 0);
    lg.filter = 'none';
    // Gold is not a colour, it is a gradient that moves as you do. A slow
    // diagonal sheen crosses the leaf, which is the whole difference between
    // gold and yellow.
    const t = (now / 9000) % 1;
    const sheen = lg.createLinearGradient(W * (t - 0.6), 0, W * (t + 0.4), H);
    sheen.addColorStop(0, '#6e4e1c');
    sheen.addColorStop(0.42, '#c9a14a');
    sheen.addColorStop(0.5, '#f6e3a4');
    sheen.addColorStop(0.58, '#c9a14a');
    sheen.addColorStop(1, '#6e4e1c');
    lg.globalCompositeOperation = 'multiply';
    lg.fillStyle = sheen;
    lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#120e0b';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(leaf, 0, 0);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.35;
    ctx.drawImage(grain(pool, W, H, { seed: 83, size: 2, contrast: 0.8 }), 0, 0);
  },

  dither(ctx, o) {
    const { W, H, pool, palette } = o;
    const src = snapshot(ctx, pool, W, H);
    // Read back at a few pixels a cell, never the whole frame: a full-window
    // readback is the one thing a finish cannot afford every frame.
    const cell = Math.max(2, Math.round(Math.min(W, H) / 250));
    const cols = Math.ceil(W / cell);
    const rows = Math.ceil(H / cell);
    const small = buffer(pool, 'finish:dithersmall', cols, rows);
    const sg = small.getContext('2d', { willReadFrequently: true });
    sg.globalCompositeOperation = 'copy';
    sg.imageSmoothingEnabled = true;
    sg.drawImage(src, 0, 0, W, H, 0, 0, cols, rows);
    sg.globalCompositeOperation = 'source-over';
    const img = sg.getImageData(0, 0, cols, rows);
    const d = img.data;
    const inks = ditherInks(pool, palette);
    const n = inks.length;
    // Each cell takes the nearer of its two nearest inks, or the further one
    // where the threshold matrix says so: ordered dithering, which keeps the
    // hue of a mark because it only ever mixes the two inks nearest to it.
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        let a = 0;
        let da = Infinity;
        let c = 0;
        let dc = Infinity;
        for (let k = 0; k < n; k++) {
          const q = inks[k];
          const dist = (r - q[0]) ** 2 + (g - q[1]) ** 2 + (b - q[2]) ** 2;
          if (dist < da) {
            c = a; dc = da; a = k; da = dist;
          } else if (dist < dc) {
            c = k; dc = dist;
          }
        }
        const pickFar = n > 1 && Math.sqrt(da) / (Math.sqrt(da) + Math.sqrt(dc) + 1e-6) > BAYER[((y & 3) << 2) | (x & 3)];
        const q = inks[pickFar ? c : a];
        d[i] = q[0];
        d[i + 1] = q[1];
        d[i + 2] = q[2];
        d[i + 3] = 255;
      }
    }
    sg.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cols, rows, 0, 0, cols * cell, rows * cell);
  },
};

// A 4 by 4 Bayer matrix: the thresholds of ordered dithering, as fractions.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** The palette's inks as numbers, worked out once per palette. */
function ditherInks(pool, palette) {
  if (pool['dither:for'] === palette && pool['dither:inks']) return pool['dither:inks'];
  const seen = new Set();
  const out = [];
  for (const k of ['background', 'bot', 'anon', 'user', 'default', 'alert']) {
    if (!palette[k]) continue;
    const { r, g, b } = parseColor(palette[k]);
    const key = `${r},${g},${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([r, g, b]);
  }
  pool['dither:for'] = palette;
  pool['dither:inks'] = out;
  return out;
}

// --- textures ---------------------------------------------------------------

function vignette(ctx, W, H, strength) {
  const r = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.45, W / 2, H / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** A risograph's halftone: a fine grid of soft dots. */
function screen(pool, W, H) {
  const key = `tex:screen:${W}:${H}`;
  if (pool[key]) return pool[key];
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  const step = Math.max(3, Math.round(Math.min(W, H) / 160));
  g.fillStyle = '#9a9a9a';
  for (let y = 0; y < H; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < W; x += step) {
      g.beginPath();
      g.arc(x, y, step * 0.28, 0, Math.PI * 2);
      g.fill();
    }
  }
  return cv;
}

/** A linocut's gouge marks: fine wavering parallel cuts. */
function gouge(pool, W, H) {
  const key = `tex:gouge:${W}:${H}`;
  if (pool[key]) return pool[key];
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const rnd = seeded(97);
  const step = Math.max(4, Math.round(Math.min(W, H) / 90));
  g.strokeStyle = '#ffffff';
  for (let y = 0; y < H; y += step) {
    if (rnd() < 0.45) continue;
    g.lineWidth = Math.max(0.6, step * (0.12 + rnd() * 0.18));
    g.beginPath();
    const x0 = rnd() * W * 0.7;
    const len = W * (0.1 + rnd() * 0.4);
    g.moveTo(x0, y + rnd() * step);
    for (let x = x0; x < x0 + len; x += step * 2) g.lineTo(x, y + (rnd() - 0.5) * step * 0.6);
    g.stroke();
  }
  return cv;
}

/** Stained glass: leaded cells from a jittered grid, drawn once per size. */
function leading(pool, W, H) {
  const key = `tex:lead:${W}:${H}`;
  if (pool[key]) return pool[key];
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const rnd = seeded(113);
  const step = Math.max(24, Math.round(Math.min(W, H) / 7));
  const cols = Math.ceil(W / step) + 2;
  const rows = Math.ceil(H / step) + 2;
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push([(c - 0.5 + (rnd() - 0.5) * 0.7) * step, (r - 0.5 + (rnd() - 0.5) * 0.7) * step]);
    }
  }
  const at = (c, r) => pts[r * cols + c];
  g.strokeStyle = 'rgba(18,16,14,0.92)';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, step * 0.07);
  g.beginPath();
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = at(c, r);
      const b = at(c + 1, r);
      const d = at(c, r + 1);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.moveTo(a[0], a[1]);
      g.lineTo(d[0], d[1]);
      // Half the cells split on a diagonal, so the panes are not all squares.
      if (rnd() < 0.5) {
        const e = at(c + 1, r + 1);
        g.moveTo(a[0], a[1]);
        g.lineTo(e[0], e[1]);
      }
    }
  }
  g.stroke();
  return cv;
}

/** Linen: a faint over-and-under weave at the stitch size. */
function weave(pool, W, H, cell) {
  const key = `tex:weave:${W}:${H}:${cell}`;
  if (pool[key]) return pool[key];
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x < W; x += cell) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
  for (let y = 0; y < H; y += cell) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
  g.stroke();
  return cv;
}

/**
 * The crosses of a cross-stitch, opaque where thread is and clear elsewhere,
 * drawn once per size: one path, one stroke, reused every frame.
 */
function crosses(pool, W, H, cell) {
  const key = `tex:crosses:${W}:${H}:${cell}`;
  if (pool[key]) return pool[key];
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#000';
  g.lineCap = 'round';
  g.lineWidth = Math.max(1.2, cell * 0.34);
  const inset = cell * 0.2;
  g.beginPath();
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      g.moveTo(x + inset, y + inset);
      g.lineTo(x + cell - inset, y + cell - inset);
      g.moveTo(x + cell - inset, y + inset);
      g.lineTo(x + inset, y + cell - inset);
    }
  }
  g.stroke();
  return cv;
}

/**
 * One plate of a colour separation, as a density layer: dark where this plate
 * carries ink, white where it carries none.
 *
 * Ink goes where the picture differs from its ground, so the plate is built
 * from the difference to the palette's background -- which is the same
 * question whichever way up the palette is. Inverting a dark frame instead
 * turned translucent marks into near-white, and a dark palette printed almost
 * nothing. The channels this plate answers to are kept, and faint differences
 * are brought up by adding the layer to itself: a doubling per pass, all of it
 * compositing, one filter in total.
 */
function separation(pool, key, src, W, H, palette, channels, gain) {
  const w = Math.max(1, Math.ceil(W / 2));
  const h = Math.max(1, Math.ceil(H / 2));
  const cv = buffer(pool, key, w, h);
  const g = cv.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'copy';
  g.drawImage(src, 0, 0, w, h);
  g.globalCompositeOperation = 'difference';
  g.fillStyle = palette.background;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = channels;
  g.fillRect(0, 0, w, h);
  g.restore();
  const out = buffer(pool, key + ':grey', w, h);
  const og = out.getContext('2d');
  og.save();
  og.globalCompositeOperation = 'copy';
  // Brought up in one filter rather than by adding the layer to itself once per
  // doubling: drawing a canvas onto itself costs a copy each time, and three of
  // them per plate measured over a quarter of a second on a card.
  og.filter = `grayscale(1) brightness(${2 ** gain})`;
  og.drawImage(cv, 0, 0);
  og.filter = 'none';
  og.globalCompositeOperation = 'difference';
  og.fillStyle = '#ffffff';
  og.fillRect(0, 0, w, h);
  og.restore();
  return out;
}

/**
 * The dots of a pointillist finish, opaque where paint is, drawn once per size.
 * Two grids, the second offset by half a cell, each dot a little out of line.
 */
function dots(pool, W, H, cell, pass) {
  const key = `tex:dots:${W}:${H}:${cell}:${pass}`;
  if (pool[key]) return pool[key];
  const cv = buffer(pool, key, W, H);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000';
  const rnd = seeded(97 + pass);
  const off = pass ? cell / 2 : 0;
  const r = cell * (pass ? 0.28 : 0.36);
  g.beginPath();
  for (let y = off - cell; y < H + cell; y += cell) {
    for (let x = off - cell; x < W + cell; x += cell) {
      const jx = x + cell / 2 + (rnd() - 0.5) * cell * 0.35;
      const jy = y + cell / 2 + (rnd() - 0.5) * cell * 0.35;
      const rr = r * (0.8 + rnd() * 0.4);
      g.moveTo(jx + rr, jy);
      g.arc(jx, jy, rr, 0, Math.PI * 2);
    }
  }
  g.fill();
  return cv;
}

function parseHex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- the public calls -----------------------------------------------------------

/**
 * Apply a finish to whatever is on a canvas now.
 *
 * Works in the canvas's own pixels, whatever transform the caller has set, and
 * leaves the context's state as it found it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} name        a key of FINISHES
 * @param {object} o
 * @param {object} o.palette   a palette's `colors`
 * @param {object} o.pool      somewhere to keep buffers and textures between calls
 * @param {number} [o.now]     a clock, for the two finishes that move
 * @returns {boolean} whether anything was done
 */
export function applyFinish(ctx, name, { palette, pool = {}, now = 0 } = {}) {
  const run = APPLY[name];
  if (!run || name === 'none' || !ctx || !palette) return false;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (!(W > 0 && H > 0)) return false;
  // Without filters the print finishes would lose their blur and their
  // greyscale and turn into something wrong rather than something plainer.
  // A browser that cannot do them gets paper, which needs none.
  const usable = canFilter(ctx) || name === 'paper';
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    (usable ? run : APPLY.paper)(ctx, { W, H, pool, palette, now });
  } catch (e) {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

/**
 * A passe-partout: a mat laid over the edges of the picture.
 *
 * Over the edges rather than shrinking the picture into a smaller rectangle,
 * because that is what a mat does to a print, and because shrinking would move
 * every mark away from the place its event was hit-tested.
 */
export function drawMat(ctx, name, { palette } = {}) {
  const spec = MATS[name];
  if (!spec || !spec.width || !ctx) return false;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const m = Math.round(Math.min(W, H) * spec.width);
  if (m < 2) return false;
  const dark = palette && lightnessOf(palette.background) < 0.3;
  // A dark picture gets a black mat, a light one a warm white: a white mat
  // round a night scene makes the night look like a hole in a wall.
  const face = dark ? '#141414' : '#f2eee6';
  const bevelHi = dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)';
  const bevelLo = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.16)';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(m, m, W - m * 2, H - m * 2);
  ctx.fill('evenodd');
  // The bevel: the cut edge of the board, lit from the top left.
  const b = Math.max(1, Math.round(m * 0.06));
  ctx.fillStyle = bevelLo;
  ctx.fillRect(m - b, m - b, W - (m - b) * 2, b);
  ctx.fillRect(m - b, m - b, b, H - (m - b) * 2);
  ctx.fillStyle = bevelHi;
  ctx.fillRect(m - b, H - m, W - (m - b) * 2, b);
  ctx.fillRect(W - m, m - b, b, H - (m - b) * 2);
  ctx.restore();
  return true;
}

/**
 * Film grain, moving: a fresh offset each frame, so it reads as grain rather
 * than as dirt on the screen.
 */
export function drawGrain(ctx, { pool = {}, now = 0, strength = 0.28 } = {}) {
  if (!ctx) return false;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (!(W > 0 && H > 0)) return false;
  const tex = grain(pool, W, H, { seed: 131, contrast: 0.9 });
  const ox = Math.floor((now * 0.37) % 64) - 32;
  const oy = Math.floor((now * 0.23) % 64) - 32;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = strength;
  ctx.drawImage(tex, ox, oy);
  ctx.drawImage(tex, ox + W, oy);
  ctx.drawImage(tex, ox, oy + H);
  ctx.restore();
  return true;
}
