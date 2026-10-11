// One Settings object and its one codec (src/settings.js): every form a
// setting was ever written in reads into the same thing, and comes back out.
import { tally } from './harness.mjs';
import {
  GRAIN_ON, PACE_STEPS, grainAmount, grainStrength, paceStep, settingsOfWork, normalizeSettings,
  toMessage, fromMessage, toQuery, fromQuery, toStore, fromStore, toHash, fromHash,
} from '../src/settings.js';
import { SCENES } from '../src/visual/scenes/index.js';
import { WORKS, workSettings } from '../src/works.js';
import { FINISHES, MATS } from '../src/visual/finish.js';
import { GROUNDS } from '../src/visual/grounds.js';
import { seedParams } from '../src/visual/inks.js';

const { ok, finish } = tally();

// --- units ---------------------------------------------------------------------------------
ok('grain is an amount from 0 to 1, and on is what the wall always drew', grainAmount(true) === GRAIN_ON && Math.abs(grainStrength(true) - 0.28) < 1e-12 && grainAmount(false) === 0 && grainAmount(7) === 1);
ok('pace is a multiplier, and a step is found for a panel of six words', PACE_STEPS[paceStep(0.5)] === 0.5 && paceStep(1) === 3 && paceStep(1.68) === 5);

// --- a work is the canonical form ----------------------------------------------------------
{
  const bad = Object.keys(WORKS).filter((k) => {
    const s = settingsOfWork(k, SCENES);
    const w = WORKS[k];
    return s.grain !== (w.grain ? GRAIN_ON : 0) || !(s.pace > 0) || JSON.stringify(s) !== JSON.stringify(workSettings(k, SCENES));
  });
  ok('every work resolves to Settings, grain as an amount and pace as a multiplier', bad.length === 0, bad.join(', ') || `${Object.keys(WORKS).length} works`);
}

// --- the message to the wall ---------------------------------------------------------------
{
  const old = { type: 'settings', settings: { palette: 'marine', scene: 'reaction', grain: true, pace: 0.5, mix: 0.4, params: { reaction: { grain: 3, feed: 0.04 } }, work: null } };
  const read = fromMessage(old, SCENES);
  ok('a message from an older console reads in Settings units, old dial names as new',
    read.grain === GRAIN_ON && read.pace === 0.5 && read.mix === 0.4 && read.params.reaction.cell === 3 && read.params.reaction.feedRate === 0.04 && read.work === null, JSON.stringify(read));
  const again = fromMessage(toMessage(read), SCENES);
  ok('and a message written now reads back the same', JSON.stringify(again) === JSON.stringify(read));
}

// --- the projection address ----------------------------------------------------------------
{
  const ex = fromQuery('?exhibition=1&full=1');
  ok('the exhibition address reads as it always did', ex.show.exhibition === '1' && ex.show.full === '1' && ex.show.minutes === null && ex.show.work === null && ex.palette === undefined);
  const old = fromQuery('work=lanterns&feed=wikipedia&langs=fr,it&minutes=3&hold=2&fade=6&seed=venezia&sound=0&label=off');
  ok('every old projection parameter comes through as given', old.show.work === 'lanterns' && old.show.langs === 'fr,it' && old.show.minutes === '3' && old.show.seed === 'venezia' && old.show.sound === '0' && old.show.label === 'off');
  const look = fromQuery(toQuery({ palette: 'ember', scene: 'ribbons', grain: 0.5, pace: 0.75, show: { work: 'lanterns' } }));
  ok('a look written into an address reads back in Settings units', look.palette === 'ember' && look.scene === 'ribbons' && look.grain === 0.5 && look.pace === 0.75 && look.show.work === 'lanterns');
  ok('and grain=1 in an address is on, as a flag would have been', fromQuery('grain=1').grain === GRAIN_ON && fromQuery('grain=0').grain === 0);
}

// --- what a browser keeps -----------------------------------------------------------------
{
  const mem = (init) => {
    const m = new Map(Object.entries(init));
    return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), m };
  };
  const old = mem({
    palette: 'ember', scene: 'reaction', finish: 'cyanotype', mat: 'thin', grain: '1', pace: '0', richness: '45',
    mix: '30', second: 'ribbons', depth: '0', starfield: '1', kit: 'marimba', 'p:reaction:grain': '3', 'p:reaction:kill': '0.06',
  });
  const s = fromStore(old, SCENES);
  ok('the Look panel\'s old keys are read in their old units',
    s.palette === 'ember' && s.finish === 'cyanotype' && s.grain === GRAIN_ON && s.pace === 0.25 && s.richness === 0.45 && s.mix === 0.3 &&
    s.depth === false && s.starfield === true && s.kit === 'marimba' && s.params.reaction.cell === 3 && s.params.reaction.kill === 0.06, JSON.stringify(s));
  ok('and moved into one record', JSON.parse(old.m.get('settings')).v === 2);
  old.set('palette', 'marine');
  ok('which is what is read from then on', fromStore(old, SCENES).palette === 'ember');
  const fresh = mem({});
  toStore({ palette: 'coal', pace: 1.3, grain: 0.2 }, fresh);
  const back = fromStore(fresh, SCENES);
  ok('a record written now reads back the same', back.palette === 'coal' && back.pace === 1.3 && back.grain === 0.2);
  ok('an empty browser reads as nothing set', Object.keys(fromStore(mem({}), SCENES)).filter((k) => k !== 'params').length === 0);
}

// --- a Create address ---------------------------------------------------------------------
{
  const o = { prefix: '#create', scenes: SCENES, finishes: FINISHES, mats: MATS, grounds: GROUNDS, ratios: ['4:5', '1:1'] };
  const old = '#create/reaction/4242?i=101418-f4795b-3a8fd6&d=grain:3,kill:0.061&f=none&g=0.18&r=4x5';
  const r = fromHash(old, o);
  ok('an old Create address opens: grain as an amount, an old dial name as new', r.tool === 'reaction' && r.seed === 4242 && Math.abs(r.grain - 0.3) < 1e-9 && r.dials.cell === 3 && r.dials.kill === 0.061, JSON.stringify(r));
  const state = { tool: 'reaction', seed: 4242, inks: r.inks, params: { ...seedParams(SCENES.reaction, 4242), ...r.dials }, finish: 'none', grain: r.grain, mat: 'none', ground: 'none', ratio: '4:5' };
  const written = toHash(state, { prefix: '#create', drawn: seedParams(SCENES.reaction, 4242) });
  const again = fromHash(written, o);
  ok('and written again it opens on the same picture', Object.keys(r.dials).every((k) => again.dials[k] === r.dials[k]) && again.grain === r.grain && /g=0\.18(&|$)/.test(written), written);
  ok('an address that is not Create\'s is not read', fromHash('#works', o) === null && fromHash('#create', o).index === true);
}

ok('normalizeSettings leaves out what it does not know', Object.keys(normalizeSettings({ nonsense: 1, palette: 'x' })).join() === 'palette');

finish('settings checks');
