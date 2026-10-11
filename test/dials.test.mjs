// Every dial of every scene against the contract in scenes/contract.js.
//
// Not a sample: all of them, so a new scene or a new sheet is held to it the
// day it is written rather than the day a panel shows it wrong.
import { tally } from './harness.mjs';
import { SCENES } from '../src/visual/scenes/index.js';
import {
  GLOBAL_SETTING_NAMES, dialProblems, DIAL_ALIASES, dialName, canonicalDials, defineScene, sceneProblems,
} from '../src/visual/scenes/contract.js';
import { WORKS, workSettings } from '../src/works.js';

const { ok, finish } = tally();

// Dial names that still collide with a setting of the whole picture. Every
// one has been renamed, with its old name kept as an alias (DIAL_ALIASES), and
// the list is empty; it is here so a collision can only come back on purpose.
const COLLIDING = {};

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

// --- contract v2: defineScene, roles, feed, aliases ---------------------------------------
{
  const broken = Object.entries(SCENES).flatMap(([name, def]) => sceneProblems(name, def));
  ok('every registered scene keeps the whole contract', broken.length === 0, broken.slice(0, 8).join('; ') || `${Object.keys(SCENES).length} scenes`);
  ok('every scene says how it hears the feed', Object.values(SCENES).every((s) => s.feed && (s.feed.mode === 'push' || s.feed.mode === 'pull')));
  ok('and a scene with an event handler hears it pushed', Object.values(SCENES).every((s) => (typeof s.event === 'function') === (s.feed.mode === 'push') || s.feed.mode === 'pull'));
  ok('every choice is marked as one', Object.values(SCENES).every((s) => Object.values(s.params || {}).every((d) => !d.options || d.role === 'choice')));

  // Every alias names a dial that exists under its new name, on the scene
  // registered under that name, and the old name is no longer a dial there.
  const lost = [];
  for (const [scene, table] of Object.entries(DIAL_ALIASES)) {
    for (const [from, to] of Object.entries(table)) {
      const s = SCENES[scene];
      if (!s || !s.params[to] || s.params[from] || dialName(s, from) !== to) lost.push(`${scene}.${from}->${to}`);
    }
  }
  ok('every old dial name leads to its new one', lost.length === 0, lost.join(', ') || `${Object.values(DIAL_ALIASES).reduce((n, t) => n + Object.keys(t).length, 0)} aliases`);
  const both = canonicalDials(SCENES.reaction, { grain: 3, feed: 0.04, kill: 0.06 });
  ok('a set of dials under old names is read under the new', both.cell === 3 && both.feedRate === 0.04 && both.kill === 0.06 && !('grain' in both));
  const newer = canonicalDials(SCENES.reaction, { grain: 3, cell: 5 });
  ok('and the new name wins when both are given', newer.cell === 5 && !('grain' in newer));

  // A work written with an old name hangs exactly as the same work with the new.
  const written = [];
  for (const [key, w] of Object.entries(WORKS)) {
    const table = DIAL_ALIASES[w.scene];
    if (!table) continue;
    const back = Object.fromEntries(Object.entries(table).map(([from, to]) => [to, from]));
    const old = { ...w, dials: Object.fromEntries(Object.entries(w.dials || {}).map(([k, v]) => [back[k] || k, v])) };
    if (JSON.stringify(workSettings(old, SCENES).params) !== JSON.stringify(workSettings(key, SCENES).params)) written.push(key);
  }
  ok('a work that names a dial the old way hangs as it always did', written.length === 0, written.join(', ') || 'all the same');
  const oldNames = Object.entries(WORKS).filter(([, w]) => Object.keys(w.dials || {}).some((k) => !(SCENES[w.scene].params || {})[k]));
  ok('and the catalogue itself names every dial the new way', oldNames.length === 0, oldNames.map(([k]) => k).join(', '));

  // defineScene refuses what breaks the contract, naming every problem.
  const frame = () => {};
  const refuses = (def) => {
    try {
      defineScene('x', def);
      return false;
    } catch (e) {
      return /breaks the contract/.test(e.message);
    }
  };
  ok('defineScene refuses a dial named after a setting of the whole picture', refuses({ frame, params: { grain: { label: 'G', min: 0, max: 1, step: 0.1, default: 0 } } }));
  ok('a role or a unit it does not know', refuses({ frame, params: { a: { label: 'A', min: 0, max: 1, step: 0.1, default: 0, role: 'mood' } } }) &&
    refuses({ frame, params: { a: { label: 'A', min: 0, max: 1, step: 0.1, default: 0, unit: 'furlongs' } } }));
  ok('a feed it cannot be given', refuses({ frame, feed: { mode: 'push' } }) && refuses({ frame, feed: { mode: 'sometimes' } }));
  ok('an alias to no dial', refuses({ frame, aliases: { old: 'nothing' } }));
  const made = defineScene('x', { frame, event() {}, params: { a: { label: 'A', min: 0, max: 1, step: 1, default: 0, options: ['p', 'q'], vary: false } } });
  ok('and completes a scene that keeps it', made.feed.mode === 'push' && made.params.a.role === 'choice');
}

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

// --- colourways are palettes --------------------------------------------------------------
{
  const { PALETTES, colourwaysOf, colourwayOf, colourwayDials } = await import('../src/index.js');
  const ways = Object.entries(PALETTES).filter(([, e]) => e.colors.print);
  // Every old position of every colourway dial still names a colourway, so a
  // work, an address or a stored dial that says colours: 3 draws what it did.
  const OLD = { tilted: { colours: 7 }, glyphs: { colours: 13 }, rings: { colours: 6 }, screentone: { tones: 5, square: 5 } };
  const missing = [];
  for (const [scene, dials] of Object.entries(OLD)) {
    for (const [dial, most] of Object.entries(dials)) {
      const list = colourwaysOf(scene, dial);
      for (let n = 1; n <= most; n++) if (!list[n]) missing.push(`${scene}.${dial}=${n}`);
      if (SCENES[scene].params[dial].options.length !== most + 1) missing.push(`${scene}.${dial} options`);
    }
  }
  ok('every old colourway position is a palette', missing.length === 0, missing.join(', ') || `${ways.length} colourway palettes`);
  ok('each colourway palette is its own palette in every role, plus its print', ways.every(([, e]) => PALETTES[e.on] && Object.keys(PALETTES[e.on].colors).every((k) => PALETTES[e.on].colors[k] === e.colors[k])));
  const harbour = PALETTES['tilted-harbour'].colors;
  ok('the old dial still names it, and the palette alone draws it', colourwayOf({}, 'tilted', colourwaysOf('tilted', 'colours'), 1) === harbour.print &&
    colourwayOf(harbour, 'tilted', colourwaysOf('tilted', 'colours'), 0) === harbour.print && colourwayOf(harbour, 'glyphs', colourwaysOf('glyphs', 'colours'), 0) === null);
  ok('a colourway gives back its dial for a picture kept as dials', colourwayDials('tilted-harbour', 'tilted').colours === 1 && Object.keys(colourwayDials('tilted-harbour', 'rings')).length === 0);
  const turned = Object.entries(WORKS).filter(([, w]) => ['tilted', 'glyphs', 'rings', 'screentone'].includes(w.scene) && ['colours', 'tones', 'square'].some((k) => (w.dials || {})[k]));
  ok('no work names a colourway by its dial any more', turned.length === 0, turned.map(([k]) => k).join(', '));
}

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
