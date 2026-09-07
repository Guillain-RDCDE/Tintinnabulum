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

/** '#rrggbb' to [r, g, b]. Anything else falls back to a mid grey. */
export function hexToRgb(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return [200, 200, 200];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
