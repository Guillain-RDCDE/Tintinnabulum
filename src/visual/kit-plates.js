// Generated plates, if any have been installed.
//
// tools/make-plates.mjs asks an image model for the same subjects the burin
// cuts, and writes them to demo/plates/ as masks: white pixels carrying the
// drawing in their alpha channel. This loads them and hands them to
// drawKitArt, which fills the mask with the palette's ink -- so a generated
// plate follows the palette exactly as a cut one does.
//
// Everything here is optional and everything degrades. No manifest, no
// network, a file that will not decode: the kit is engraved instead. That is
// deliberate and it is the reason both sets exist. A project that needs an API
// key to draw its own buttons is a project that stops working when somebody
// else's service does.

const state = {
  base: null,
  manifest: null,
  loading: null,
  images: new Map(),   // kit -> HTMLImageElement, or null once known missing
};

/** Where the plates live, relative to the page. */
function baseUrl() {
  if (state.base) return state.base;
  try {
    state.base = new URL('plates/', document.baseURI).href;
  } catch {
    state.base = 'plates/';
  }
  return state.base;
}

/**
 * Look for installed plates. Safe to call repeatedly; the work happens once.
 *
 * Resolves to the list of kits that have one, which is empty in every case
 * where anything went wrong.
 */
export function loadPlates({ base } = {}) {
  if (base) state.base = base.endsWith('/') ? base : base + '/';
  if (state.loading) return state.loading;
  state.loading = (async () => {
    try {
      const res = await fetch(baseUrl() + 'index.json', { cache: 'no-cache' });
      if (!res.ok) return [];
      const manifest = await res.json();
      const kits = Array.isArray(manifest && manifest.kits) ? manifest.kits : [];
      state.manifest = manifest;
      // Loaded in parallel and each failure is its own: one plate that will
      // not decode must cost that kit its picture and no other.
      await Promise.all(kits.map((kit) => new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          state.images.set(kit, img);
          resolve();
        };
        img.onerror = () => {
          state.images.set(kit, null);
          resolve();
        };
        img.src = baseUrl() + kit + '.png';
      })));
      return [...state.images.entries()].filter(([, v]) => v).map(([k]) => k);
    } catch {
      return [];
    }
  })();
  return state.loading;
}

/** The plate for a kit, or null if it is to be cut instead. */
export function plateFor(kit) {
  const img = state.images.get(kit);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Which kits currently have one. */
export function platedKits() {
  return [...state.images.entries()].filter(([, v]) => v).map(([k]) => k).sort();
}

/** Forget everything, so a test can start again. */
export function forgetPlates() {
  state.base = null;
  state.manifest = null;
  state.loading = null;
  state.images.clear();
}
