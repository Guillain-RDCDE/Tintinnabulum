// Every dial of every scene against the contract in scenes/contract.js.
//
// Not a sample: all of them, so a new scene or a new sheet is held to it the
// day it is written rather than the day a panel shows it wrong.
import { tally } from './harness.mjs';
import { SCENES } from '../src/visual/scenes/index.js';
import { GLOBAL_SETTING_NAMES, dialProblems } from '../src/visual/scenes/contract.js';
import { WORKS } from '../src/works.js';

const { ok, finish } = tally();

// Dial names that still collide with a setting of the whole picture, kept
// working until each is renamed with an alias for the old name. The list may
// only shrink: a new collision fails, and so does an entry that is no longer
// needed.
const COLLIDING = {
  fill: ['grid', 'mondrian', 'packing', 'glyphs', 'meshes'],
  feed: ['reaction'],
  grain: ['reaction', 'quasicrystal', 'coral', 'voronoi', 'peals'],
  ratio: ['harmonograph'],
  hold: ['attractor', 'dejong', 'drip'],
  depth: ['apollonian', 'penrose', 'groove'],
  inks: ['sheaf'],
};

let dials = 0;
const problems = [];
const collisions = {};
for (const [scene, s] of Object.entries(SCENES)) {
  for (const [name, spec] of Object.entries(s.params || {})) {
    dials++;
    for (const p of dialProblems(name, spec)) problems.push(`${scene}.${p}`);
    if (GLOBAL_SETTING_NAMES.includes(name)) (collisions[name] ||= []).push(scene);
  }
}
ok('every dial keeps the contract', problems.length === 0, problems.slice(0, 12).join('; ') || `${dials} dials on ${Object.keys(SCENES).length} scenes`);

const fresh = [];
for (const [name, scenes] of Object.entries(collisions)) {
  for (const sc of scenes) if (!(COLLIDING[name] || []).includes(sc)) fresh.push(`${sc}.${name}`);
}
ok('no dial takes the name of a setting of the whole picture', fresh.length === 0, fresh.join(', ') || 'none new');
const stale = [];
for (const [name, scenes] of Object.entries(COLLIDING)) {
  for (const sc of scenes) if (!(collisions[name] || []).includes(sc)) stale.push(`${sc}.${name}`);
}
ok('and the list of old collisions only holds what still collides', stale.length === 0, stale.join(', ') || `${Object.values(COLLIDING).flat().length} left to rename`);

// The contract itself, on dials made wrong on purpose.
const bad = (spec) => dialProblems('x', { label: 'X', min: 0, max: 1, step: 0.1, default: 0.5, ...spec });
ok('the contract finds a default outside the range', bad({ default: 2 }).length === 1);
ok('a step that does not divide the range', bad({ step: 0.3 }).length === 1);
ok('options one short', bad({ min: 0, max: 2, step: 1, default: 0, options: ['a', 'b'], vary: false }).length === 1);
ok('a choice that does not say whether it varies', bad({ min: 0, max: 1, step: 1, default: 0, options: ['a', 'b'] }).length === 1);
ok('and passes a sound dial', bad({}).length === 0);

// A work may only set dials its scene has, at values the dial can take.
const wrong = [];
for (const [key, w] of Object.entries(WORKS)) {
  const specs = SCENES[w.scene].params || {};
  for (const [k, v] of Object.entries(w.dials || {})) {
    const sp = specs[k];
    if (!sp) wrong.push(`${key}.${k} is no dial of ${w.scene}`);
    else if (!(v >= sp.min && v <= sp.max)) wrong.push(`${key}.${k}=${v} outside ${sp.min}..${sp.max}`);
  }
}
ok('every work sets real dials within their ranges', wrong.length === 0, wrong.join(', ') || `${Object.keys(WORKS).length} works`);

// The pages that describe the catalogue do not count it: a number written in
// prose is out of date the day a scene is added, and both of the last two
// were. The registry is the count.
const { readFileSync } = await import('node:fs');
const counted = [];
for (const page of ['README.md', 'docs/HOW-IT-WORKS.md', 'docs/REFERENCE.md']) {
  const text = readFileSync(new URL('../' + page, import.meta.url), 'utf8');
  for (const m of text.matchAll(/\b\d{2,}\s+(scenes|pictures|works)\b/g)) counted.push(`${page}: "${m[0]}"`);
}
ok('no page hard-codes how many scenes, pictures or works there are', counted.length === 0, counted.join(', ') || 'none');

finish('dial checks');
