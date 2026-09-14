// Screens: the feed as text.
//
// Digital rain -- columns of characters falling down a black screen, as in the
// science fiction of the late 1990s. Here the code is real: the title each
// event carries falls in a column of its own, letter by letter, bright at the
// head, among a softer rain of characters between events.
//
// Drawing text is the expensive thing a canvas does, so nothing is redrawn:
// each column writes one character when its head reaches a new row, onto a
// buffer that is darkened a little every frame. The trail is that darkening.
// A few hundred characters a second are written, not a few thousand a frame.

import { scratch, toRgb } from './paint.js';
import { mixColors, lighten } from '../color.js';

/** Half-width katakana and digits: the characters the genre is made of. */
const GLYPHS = (() => {
  let s = '';
  for (let c = 0xff66; c <= 0xff9d; c++) s += String.fromCharCode(c);
  return s + '0123456789';
})();

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

const FONT = '"MS Gothic", "Noto Sans Mono CJK JP", "Hiragino Kaku Gothic ProN", Osaka, monospace';

function seeded(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const TERMINAL_SCENES = {
  digitalrain: {
    label: 'Digital rain',
    positional: false,
    note: "Columns of green characters falling down a black screen, in the manner of the science fiction of the late 1990s -- except that here the code is real. Each event's title falls in a column of its own, letter by letter, bright at the head and fading behind, and between events the screen keeps raining softly.",
    params: {
      size: { label: 'Character size', min: 10, max: 28, step: 1, default: 16, rebuild: true },
      rain: { label: 'Rain between events', min: 0, max: 1, step: 0.02, default: 0.45 },
      speed: { label: 'Speed', min: 0.3, max: 2.5, step: 0.05, default: 1 },
      tint: { label: 'Green, or the palette', min: 0, max: 1, step: 1, default: 0 },
    },
    init(api) {
      const s = api.scene;
      const size = Math.round(api.param('size'));
      s.size = size;
      s.cols = Math.max(4, Math.min(180, Math.ceil(api.w / (size * 0.9))));
      s.rows = Math.ceil(api.h / size) + 1;
      s.y = new Float32Array(s.cols);
      s.v = new Float32Array(s.cols);
      s.pos = new Int16Array(s.cols);
      s.live = new Uint8Array(s.cols);
      s.lastRow = new Int16Array(s.cols).fill(-1);
      s.text = new Array(s.cols).fill('');
      s.ink = new Array(s.cols).fill('');
      s.head = new Array(s.cols).fill('');
      const rnd = seeded(1999);
      for (let c = 0; c < s.cols; c++) {
        s.y[c] = -rnd() * s.rows;
        s.v[c] = 8 + rnd() * 10;
      }
      s.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      if (!s.y) return;
      // The column under the event, or the next free one near it.
      let c = Math.max(0, Math.min(s.cols - 1, Math.floor((p.x / api.w) * s.cols)));
      for (let k = 0; k < 8 && s.live[c]; k++) c = (c + 1 + Math.floor(Math.random() * 6)) % s.cols;
      const title = String(p.label || '').trim();
      let text = title.slice(0, 60);
      if (!text) for (let k = 0, n = 8 + Math.floor(Math.random() * 14); k < n; k++) text += glyph();
      s.text[c] = text;
      s.ink[c] = p.color;
      s.live[c] = 1;
      s.pos[c] = 0;
      s.y[c] = Math.floor(Math.random() * s.rows * 0.2);
      s.lastRow[c] = s.y[c] - 1;
      s.v[c] = 14 + Math.random() * 8;
    },
    frame(ctx, api) {
      const s = api.scene;
      if (!s.y) return;
      const pal = api.palette;
      const W = api.w;
      const H = api.h;
      const dt = Math.min(50, api.dt);
      const size = s.size;
      const colW = W / s.cols;
      const green = api.param('tint') < 0.5;
      const ground = green ? '#000000' : mixColors(pal.background, '#000000', 0.55);
      const cv = scratch(api);
      const g = s.bufCtx;
      const k = cv.width / W;
      if (!s.bufClean) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = ground;
        g.fillRect(0, 0, cv.width, cv.height);
        s.bufClean = true;
      }
      g.setTransform(k, 0, 0, k, 0, 0);
      // The trail: the whole screen darkened towards the ground a little.
      const [r, gg, b] = toRgb(ground);
      g.fillStyle = `rgba(${r},${gg},${b},${Math.min(0.35, (dt / 1000) * 1.6)})`;
      g.fillRect(0, 0, W, H);
      g.font = `${size}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const rain = api.param('rain');
      const speed = api.param('speed');
      const titleInk = (c) => (green ? '#a8ffbe' : lighten(s.ink[c] || pal.user, 0.15));
      const rainInk = green ? '#1fbf4f' : mixColors(pal.default, pal.background, 0.35);
      for (let c = 0; c < s.cols; c++) {
        s.y[c] += (s.v[c] * speed * dt) / 1000;
        const row = Math.floor(s.y[c]);
        if (row !== s.lastRow[c]) {
          s.lastRow[c] = row;
          if (row >= 0 && row < s.rows) {
            let ch = '';
            let ink = rainInk;
            if (s.live[c]) {
              if (s.pos[c] < s.text[c].length) {
                ch = s.text[c][s.pos[c]++];
                ink = titleInk(c);
              } else {
                s.live[c] = 0;
              }
            }
            if (!ch && Math.random() < rain) ch = glyph();
            s.head[c] = ch;
            if (ch && ch !== ' ') {
              g.fillStyle = ink;
              g.fillText(ch, (c + 0.5) * colW, row * size);
            }
          }
        }
        if (row > s.rows + 3) {
          if (s.live[c]) {
            // A title longer than the screen carries on from the top.
            s.y[c] = 0;
            s.lastRow[c] = -1;
          } else {
            s.y[c] = -Math.random() * s.rows * 0.6;
            s.v[c] = 8 + Math.random() * 10;
          }
        }
      }
      ctx.drawImage(cv, 0, 0, W, H);
      // The heads, bright and not kept: they are where the writing is now.
      ctx.font = `${size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = green ? '#e6ffec' : lighten(pal.text, 0.05);
      ctx.globalAlpha = 0.95;
      for (let c = 0; c < s.cols; c++) {
        const row = s.lastRow[c];
        const ch = s.head[c];
        if (!ch || ch === ' ' || row < 0 || row >= s.rows) continue;
        ctx.fillText(ch, (c + 0.5) * colW, row * size);
      }
      ctx.globalAlpha = 1;
    },
  },
};
