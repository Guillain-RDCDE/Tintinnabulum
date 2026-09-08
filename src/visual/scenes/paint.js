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
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  s[key] = cv;
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

/** @deprecated the old name, kept so nothing outside this folder breaks. */
export const hexToRgb = toRgb;
