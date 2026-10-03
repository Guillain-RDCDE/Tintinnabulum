// Two things every family of scenes needs, and nothing else.
//
// A scene that accumulates cannot redraw its history sixty times a second, so
// it paints once onto an offscreen canvas and blits that. A scene that writes
// pixels directly needs its palette colour as three numbers rather than as a
// string. Both were sitting in one family module and are now shared, because
// three families want them.

/**
 * An offscreen canvas the same size as the visible one, made once.
 *
 * Kept on `api.scene`, so it is discarded with the rest of the scene's state
 * when the scene is rebuilt -- which is exactly when a stale drawing would
 * otherwise survive a resize.
 *
 * @param {object} api          the scene api
 * @param {string} key          a name, so one scene can hold several
 * @param {boolean} readBack    true if the caller uses getImageData on it
 */
export function scratch(api, key = 'buf', readBack = false) {
  const s = api.scene;
  const w = Math.max(1, Math.round(api.w));
  const h = Math.max(1, Math.round(api.h));
  if (s[key] && s[key].width === w && s[key].height === h) return s[key];

  // Taken from a pool that belongs to the RENDERER, not to the scene.
  //
  // A scene's state is thrown away and rebuilt every time the scene changes,
  // and an offscreen canvas the size of the visible one is several megabytes.
  // Allocating a fresh one per scene change meant that walking the forty
  // scenes -- which the suite does, and which anyone clicking through the
  // picker does -- asked for a couple of hundred megabytes in a few seconds.
  // The browser tab did not survive it: "Target crashed", twice, in the block
  // that iterates every scene.
  //
  // Every consumer either clears the buffer on its first frame or overwrites
  // it whole, so handing the same canvas to the next scene is safe.
  const pool = api.buffers;
  let cv = pool ? pool[key] : null;
  if (!cv || cv.width !== w || cv.height !== h) {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    if (pool) pool[key] = cv;
  }
  s[key] = cv;
  // `willReadFrequently` is only honoured on the first getContext for a
  // canvas, and a given key is always used the same way, so pooling by key
  // keeps that consistent.
  s[key + 'Ctx'] = cv.getContext('2d', { willReadFrequently: readBack });
  return cv;
}

/**
 * A colour string to [r, g, b].
 *
 * Both forms, and the second one is not optional. Palette colours are hex,
 * but a per-event shade comes back from the OKLab code as `rgb(r, g, b)` --
 * and an earlier version of this parsed only hex and returned a mid grey for
 * anything else. It never threw and nothing failed; the Voronoi scene simply
 * drew every cell the same grey, and that is the whole of what a caller sees
 * when a parser answers a question it did not understand.
 */
export function toRgb(c) {
  const str = String(c).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(str);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return parts.map((v) => Math.max(0, Math.min(255, Math.round(v))));
    }
  }
  return [200, 200, 200];
}

/** A colour packed as one 32-bit pixel, for scenes that write image data. */
export function packRgba(c) {
  const [r, g, b] = toRgb(c);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * The scene's accumulation buffer, cleared the first time it is asked for.
 *
 * Seven families had this, four of them with a check for a canvas that
 * `scratch` never fails to return. The transform is reset before the clear
 * because one family had learned the hard way that a buffer handed back by
 * the pool can carry the last scene's transform.
 */
export function bufferFor(api, key = 'buf', readBack = false) {
  const cv = scratch(api, key, readBack);
  const g = api.scene[key + 'Ctx'];
  if (!api.scene[key + 'Clean']) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    api.scene[key + 'Clean'] = true;
  }
  return g;
}

/** Fade an accumulation buffer towards clear, so a scene that builds up also forgets. */
export function fade(g, cv, keep, dt) {
  if (keep >= 0.999) return;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = `rgba(0,0,0,${(1 - keep) * Math.min(0.06, dt / 1000) * 1.8})`;
  g.fillRect(0, 0, cv.width, cv.height);
  g.restore();
}

/** A soft round light, drawn as a radial gradient. Nothing for no radius or no light. */
export function glow(ctx, x, y, r, colour, alpha) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
