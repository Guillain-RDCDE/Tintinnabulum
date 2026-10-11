// The sandbox's own Settings, kept in the viewer's browser.
//
// One record, written and read by the codec in src/settings.js (toStore,
// fromStore): the look, the dials of every scene turned, and the sound. It
// replaced a key per control, each in its own units -- the pace as an index,
// the grain as a flag, the colour variety and the mix as percentages, a dial
// as `p:<scene>:<dial>` -- and those old keys are read once, moved into the
// record, and the record is what is read from then on.
//
// Panel conveniences that are not part of a picture -- which way the palettes
// are grouped, how often the rotation steps, the feed the sandbox listens to,
// a programme being written -- keep their own keys in store.js.

import { store } from './store.js';
import { fromStore, toStore } from '../src/settings.js';
import { SCENES } from '../src/index.js';

let current = null;

/** What is kept: Settings, in Settings' own units. */
export function saved() {
  if (!current) current = fromStore(store, SCENES);
  return current;
}

/** Keep these fields, leaving the rest as they were. */
export function save(partial) {
  const s = saved();
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete s[k];
    else s[k] = v;
  }
  toStore(s, store);
}

/** Keep one dial of one scene, or forget it with `null`. */
export function saveDial(scene, name, value) {
  const s = saved();
  s.params = s.params || {};
  const dials = (s.params[scene] = s.params[scene] || {});
  if (value === null || value === undefined || value === '') delete dials[name];
  else dials[name] = Number(value);
  if (!Object.keys(dials).length) delete s.params[scene];
  toStore(s, store);
}

/** The dials kept for a scene. */
export function savedDials(scene) {
  const s = saved();
  return (s.params && s.params[scene]) || {};
}
