// The projection window: the picture, on a wall, with nothing else on it.
//
// This is a second window running its own renderer, not a mirror of the first.
// A mirror would mean copying pixels between windows every frame, which is
// slow, blurry and locked to the source's aspect ratio. Instead the sandbox
// forwards the *events*, and this window draws them at its own size — so a
// 4:3 projector, a portrait screen in a gallery and a 32:9 panel each get a
// composition made for their shape rather than a letterboxed copy of somebody
// else's.
//
// The channel is a BroadcastChannel, which needs no server and works from a
// static host. It carries settings too, so changing the palette next door
// changes the wall.
//
// It also runs on its own. A gallery does not want a laptop it must not touch
// standing next to the projector for three months, so this window takes a work
// and a feed in its address and listens to the world itself:
//
//   project.html?work=lanterns&feed=wikipedia
//
// That address is the whole installation: open it on the machine behind the
// screen, press fullscreen, and leave. A console that turns up later on the
// same machine still steers it, because the channel is still listening.
//
// And it does not stop. If the feed goes quiet -- the network drops, the
// console is closed, the API changes -- the picture carries on at its own
// slow pulse rather than freezing on whatever was last drawn, which is the
// difference between an artwork and a crashed screen.

import { parseColor, lightnessOf } from '../src/visual/color.js';
import { parseShow, parseHours, showAt, isOpen, untilOpen, formatClock } from '../src/show.js';
import {
  CanvasSink, PALETTES, WORKS, SCENES, Mapper, normalize, mediumOf, workSettings, drawQr,
  FINISHES, GROUNDS, MATS, KITS, LIVING, Sonifier, variedParams,
  exhibition, exhibitionAt, describeExhibition,
  replaySource, loadRecording, watchedSource,
  wikipedia, bitcoin, coinbase, earthquakes, bluesky, github, noaaAlerts, hackerNews, randomSource,
} from '../src/index.js';

const CHANNEL = 'tintinnabulum';
const params = new URLSearchParams(location.search);

// An exhibition is the whole room in one word: the catalogue in a drawn
// order, every Wikipedia, people alone ringing, sound on, and the recorded
// day to fall back on. Each of those can still be said otherwise.
const exhibiting = params.get('exhibition') === '1';
const option = (name, whenExhibiting, otherwise) => {
  const v = params.get(name);
  return v !== null ? v : exhibiting ? whenExhibiting : otherwise;
};

/** The feeds a wall may be pointed at on its own, without a console. */
const FEEDS = {
  wikipedia: () => wikipedia({
    langs: option('langs', 'all', 'en').split(',').filter(Boolean),
    onlyPeople: option('people', '1', '0') === '1',
  }),
  commons: () => wikipedia({ wikis: ['commonswiki'], mainNamespaceOnly: false }),
  bitcoin: () => bitcoin(),
  coinbase: () => coinbase(),
  quakes: () => earthquakes(),
  bluesky: () => bluesky(),
  github: () => github(),
  weather: () => noaaAlerts(),
  hn: () => hackerNews(),
  demo: () => randomSource({ rate: 1.4 }),
};

const canvas = document.getElementById('stage');
const note = document.getElementById('note');
const body = document.body;

// One panel of a wider wall, when the address says so: `wall=2&of=3` is the
// middle screen of three. Each panel draws the whole composition and shows its
// own share of it, so the picture crosses the seam instead of stopping at it.
// Told what to hang -- a work, or a programme -- rather than following a
// console. See the hello below.
const selfDirected = Boolean(params.get('work') || params.get('show') || exhibiting);
const across = Math.max(1, Math.min(8, Number(params.get('of') || 1)));
const panel = Math.max(1, Math.min(across, Number(params.get('wall') || 1)));

const sink = new CanvasSink(canvas, {
  showHud: false,
  showLabels: false,
  // A projection is watched from across a room, so the marks live longer and
  // run larger than they do in a panel beside a control surface.
  life: 18000,
  maxRadius: 140,
  maxParticles: 1400,
});
if (across > 1) sink.setTile(panel, across);
sink.start();

/**
 * Size the backing store to the window, at the device ratio.
 *
 * CanvasSink measures its element, and the element is 100vw x 100vh, so this
 * only has to nudge it when the window changes. Entering fullscreen on a
 * projector changes both the size and the aspect, and a scene that sized its
 * grid to the old shape has to be rebuilt.
 */
function fit() {
  sink._onResize();
}
window.addEventListener('resize', fit);
if (screen.orientation) screen.orientation.addEventListener?.('change', fit);
document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));

// --- the wall label -----------------------------------------------------
//
// A gallery tells you what you are looking at. It does so on a card beside the
// work, in small type, and then leaves you alone -- so the label appears when
// the work changes, holds long enough to be read twice, and fades. The code on
// it opens the same work in a phone, where it can also be heard, which is the
// half of the piece a projection cannot carry.
const cartel = document.getElementById('cartel');
let cartelTimer = 0;
let labelled = null;

/** Where a visitor's phone should land: this work, in the sandbox. */
function addressOf(name) {
  return new URL('index.html#work=' + encodeURIComponent(name), location.href).href;
}

function showCartel(name, { hold = 15000 } = {}) {
  const w = WORKS[name];
  if (!w) return false;
  // One label to a wall, not one to a panel: on a diptych it belongs on the
  // first screen, as it would beside the left-hand canvas of a real one.
  if (panel !== 1) return false;
  document.getElementById('cartel-title').textContent = w.title;
  document.getElementById('cartel-medium').textContent =
    mediumOf(w, { SCENES, PALETTES, FINISHES, GROUNDS, MATS, KITS, LIVING });
  const qr = document.getElementById('cartel-qr');
  const ctx = qr.getContext('2d');
  ctx.clearRect(0, 0, qr.width, qr.height);
  try {
    // Ink on paper, always, whatever the picture is doing behind it: a code
    // drawn in the palette's colours is a code a phone gives up on.
    drawQr(ctx, addressOf(name), { size: qr.width, ink: '#000', paper: '#fff', quiet: 2 });
  } catch (e) {
    qr.hidden = true;
  }
  cartel.hidden = false;
  // Two frames, so the transition has something to move from.
  requestAnimationFrame(() => cartel.classList.add('show'));
  clearTimeout(cartelTimer);
  if (hold) cartelTimer = setTimeout(hideCartel, hold);
  labelled = name;
  return true;
}

/**
 * The label wears the work's own colours: its ink, and a plate of its ground.
 *
 * Which way round matters. A pale label on a pale painting is unreadable, and
 * so is the reverse, so both the type and the card it sits on come from the
 * palette that is showing rather than from a fixed pair of greys.
 */
function dressCartel(colors) {
  const { r, g, b } = parseColor(colors.background);
  const light = lightnessOf(colors.background) > 0.55;
  cartel.style.color = colors.text || (light ? '#1b1b1b' : '#eee');
  cartel.style.setProperty('--plate', `rgba(${r}, ${g}, ${b}, .72)`);
  cartel.style.setProperty('--edge', light ? 'rgba(40,34,26,.16)' : 'rgba(255,255,255,.12)');
}

function hideCartel() {
  clearTimeout(cartelTimer);
  cartel.classList.remove('show');
  setTimeout(() => { if (!cartel.classList.contains('show')) cartel.hidden = true; }, 900);
}

const toggleCartel = () => {
  if (cartel.classList.contains('show')) hideCartel();
  else if (labelled) showCartel(labelled, { hold: 0 });
};

/**
 * Dress the wall as a work: scene, palette and every layer of the finish.
 *
 * The same fields a work sets on the sandbox, set here directly. A wall opened
 * on `?work=lanterns` is showing the work before the first event arrives, so
 * nobody is ever looking at a default.
 */
function showWork(name) {
  const w = WORKS[name];
  if (!w || !SCENES[w.scene]) return false;
  const s = workSettings(w, SCENES);
  if (PALETTES[s.palette]) dressCartel(PALETTES[s.palette].colors);
  // Every dial of the scene, not only the work's own: on a programme that
  // steps from one work to another on the same scene, the first work's sheet
  // otherwise stayed up under the second work's label.
  applySettings({
    scene: s.scene, palette: s.palette, finish: s.finish, ground: s.ground,
    mat: s.mat, grain: s.grain, living: s.living, pace: s.pace,
    params: { [s.scene]: s.params },
  });
  return true;
}

// --- the controls, which are meant to disappear -------------------------
let sleepTimer = 0;
function wake() {
  body.classList.add('awake');
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => body.classList.remove('awake'), 3000);
}
for (const ev of ['mousemove', 'pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, wake, { passive: true });
}
wake();

async function goFullscreen() {
  try {
    if (document.fullscreenElement) return true;
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch (e) {
    // A browser that refuses fullscreen still shows the picture, and the bar
    // says which key to press. Refusing silently is what made this look broken.
    note.hidden = false;
    note.innerHTML = '<b>Press F for fullscreen</b>This window is the wall. Fullscreen could not be taken on its own.';
    setTimeout(() => { if (seen) note.hidden = true; }, 6000);
    return false;
  }
}

document.getElementById('full').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  else await goFullscreen();
});
document.getElementById('clear').addEventListener('click', () => sink.clear());
document.getElementById('label').addEventListener('click', toggleCartel);

// f for fullscreen, c to clear, i for the label, and Escape is the browser's.
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') document.getElementById('full').click();
  if (e.key === 'c' || e.key === 'C') sink.clear();
  if (e.key === 'i' || e.key === 'I') toggleCartel();
});

// --- the journal --------------------------------------------------------
//
// What happened to the wall while nobody was in the room: when it started,
// when the world went quiet and the recording took over, when it came back,
// when the page reloaded itself. Kept in the browser, read from the console
// or from `projection.journal`, five hundred lines at most.
const JOURNAL_KEY = 'tintinnabulum.journal';
function journal(entry) {
  const line = { at: entry.at || Date.now(), ...entry };
  try {
    const kept = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]');
    kept.push(line);
    if (kept.length > 500) kept.splice(0, kept.length - 500);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(kept));
  } catch (e) { /* storage refused: the console still has it */ }
  console.info('[wall]', new Date(line.at).toISOString(), line.what, line.note || '');
}
function readJournal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); } catch (e) { return []; }
}

// --- sound --------------------------------------------------------------
//
// A projection used to be the silent half of the piece, heard on a phone
// through the label's code. A room has speakers. With `sound=1` (on by
// default in an exhibition) the wall plays the work's instrument itself,
// once a touch or a key has let the browser start audio -- the same gesture
// fullscreen needs, so one touch does both.
const wantSound = option('sound', '1', '0') === '1';
const son = wantSound ? new Sonifier({ kit: 'synth', mapping: { mode: 'adaptive', scale: 'chromatic', range: 27, jitter: 0.5 }, voices: { maxVoices: 16 }, volume: Number(params.get('volume') || 0.7) }) : null;
let soundOn = false;
let currentKit = null;
let wantedKit = null;
let wantedSpace = 'none';

async function startSound() {
  if (!son || soundOn) return;
  son.engine.resumeSync();
  const status = await son.unlock();
  soundOn = Boolean(status.audible);
  journal({ what: 'sound', note: soundOn ? 'on' : 'blocked: ' + JSON.stringify(status) });
  if (soundOn && wantedKit) await playKit(wantedKit, wantedSpace);
}

/** The instrument and the room it plays in, swapped only once they can sound. */
async function playKit(kit, space = 'none') {
  wantedKit = kit;
  wantedSpace = space;
  if (!son || !soundOn || !KITS[kit]) return;
  if (kit !== currentKit) {
    currentKit = kit;
    await son.setKit(kit);
    // The bed is tied to a connected source in the sandbox; the wall feeds
    // its sink by hand, so the bed is asked for by hand too.
    son.audio.setBed(KITS[kit].bed || null);
  }
  son.space = space;
}

if (son) {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, startSound, { once: true, passive: true });
}

// --- listening ----------------------------------------------------------
let seen = false;
let last = performance.now();
const channel = new BroadcastChannel(CHANNEL);

/** Something arrived: draw it, and remember that the world is still there. */
function arrive(ev) {
  if (!seen) {
    seen = true;
    note.hidden = true;
  }
  last = performance.now();
  sink.handle(ev);
  if (son && soundOn) son.audio.handle(ev);
}

/** Apply whatever the sandbox says its settings are. */
function applySettings(s) {
  if (!s) return;
  if (s.palette && PALETTES[s.palette]) {
    sink.setPalette(s.palette);
    canvas.style.background = PALETTES[s.palette].colors.background;
    body.style.background = PALETTES[s.palette].colors.background;
  }
  if (s.scene) sink.setScene(s.scene);
  // Two pictures at once, if the console is showing two.
  if (typeof s.second === 'string') sink.setSecond(s.second, { blend: s.blend, mix: s.mix });
  // The label follows the wall: a work arriving from the console is announced
  // here exactly as one named in the address is -- unless this wall was told
  // what to hang in its own address, in which case the console does not get
  // to take the label down.
  if (!selfDirected) {
    if (s.work && s.work !== labelled && WORKS[s.work]) showCartel(s.work);
    else if (!s.work && labelled) { labelled = null; hideCartel(); }
  }
  if (s.shape) sink.setShape(s.shape);
  if (typeof s.richness === 'number') sink.setRichness(s.richness);
  if (typeof s.depth === 'boolean') sink.setDepth(s.depth);
  if (typeof s.starfield === 'boolean') sink.setStarfield(s.starfield);
  // The finish, the mat, the grain and the pace, so a wall shows the picture
  // exactly as it was dressed on the laptop and not as it was drawn.
  if (typeof s.finish === 'string') sink.setFinish(s.finish);
  if (typeof s.ground === 'string') sink.setGround(s.ground);
  if (typeof s.mat === 'string') sink.setMat(s.mat);
  if (typeof s.grain === 'boolean') sink.setGrain(s.grain);
  if (typeof s.pace === 'number') sink.setPace(s.pace);
  if (typeof s.living === 'string' && s.living !== sink.living) sink.setLiving(s.living);
  if (s.palette && PALETTES[s.palette]) dressCartel(PALETTES[s.palette].colors);
  if (s.params) {
    // All of a scene's dials in one go, and one restart of the scene showing.
    for (const [scene, dials] of Object.entries(s.params)) sink.setParams(dials, scene);
  }
}

channel.onmessage = (m) => {
  const msg = m.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'settings') return applySettings(msg.settings);
  if (msg.type === 'event') {
    arrive(msg.event);
    return;
  }
  if (msg.type === 'clear') sink.clear();
  // The console can ask for fullscreen on the screen it put this window on.
  // It is asked for rather than taken, because only this window can grant it.
  if (msg.type === 'fullscreen') goFullscreen();
};

// --- a wall of its own --------------------------------------------------

const mapper = new Mapper({ mode: 'adaptive' });
let source = null;

// --- the recorded day ---------------------------------------------------
//
// `standby=recordings/a-day.json.gz` (the default in an exhibition; `off` to
// have none) is a day of real edits the wall plays when the live feed has
// said nothing for `quiet` seconds, from the time of day it is, until the
// feed speaks again. See src/sources/replay.js. It is loaded in its own
// time, and a wall whose recording cannot be found simply has none.
const standbyUrl = option('standby', 'recordings/a-day.json.gz', 'off');
let standby = null;
let recording = null;
if (standbyUrl && standbyUrl !== 'off') {
  loadRecording(new URL(standbyUrl, location.href).href)
    .then((rec) => {
      recording = rec;
      standby = replaySource(rec, { name: 'standby' });
      journal({ what: 'standby-loaded', note: `${rec.events.length} events, ${rec.minutes || '?'} min` });
    })
    .catch((e) => journal({ what: 'standby-missing', note: e.message }));
}
const QUIET = Number(params.get('quiet') || 90) * 1000;

/** Listen to the world directly, for a wall with no console beside it. */
function listenAlone(name) {
  const make = FEEDS[name];
  if (!make) return false;
  try {
    const hear = (raw) => {
      const ev = normalize(raw);
      if (!ev) return;
      ev.map = mapper.map(ev.magnitude);
      arrive(ev);
    };
    // The world, watched: a feed that falls silent is restarted, and the
    // recording stands in meanwhile. A lazily loaded recording is found by
    // the watch when it is needed, not when the watch was made.
    source = standbyUrl && standbyUrl !== 'off'
      ? watchedSource({
          live: make,
          quiet: QUIET,
          journal,
          standby: {
            start: (emit) => { if (standby) standby.start(emit); },
            stop: () => { if (standby) standby.stop(); },
          },
        })
      : make();
    source.start(hear);
    return true;
  } catch (e) {
    journal({ what: 'feed-failed', note: String(e && e.message) });
    return false;
  }
}

/**
 * The picture does not stop when the world does.
 *
 * A wall in a gallery outlives the network it was pointed at: a feed changes
 * its API, a console is closed, a router is rebooted overnight. Frozen on the
 * last frame it drew, the piece reads as a broken screen -- which is worse
 * than an empty wall, because somebody has to come and look at it.
 *
 * So when nothing has arrived for a while the wall keeps its own slow pulse,
 * an event every few seconds, until the world comes back. It is deliberately
 * slower than any real feed, so a watched wall never mistakes it for one.
 */
const IDLE_AFTER = Number(params.get('idle') || 20) * 1000;
const keepAlive = params.get('idle') !== 'off';
let pulse = 0;
if (keepAlive) {
  setInterval(() => {
    if (closed) return;
    if (performance.now() - last < IDLE_AFTER) return;
    const ev = normalize({
      id: 'wall-' + pulse++,
      // The same heavy tail a real feed has, so the picture composes as it
      // would on the world rather than filling with one size of mark.
      magnitude: Math.round(Math.pow(Math.random(), 3) * 6000) + 1,
      category: ['user', 'anon', 'bot'][pulse % 3],
      ts: Date.now(),
    });
    ev.map = mapper.map(ev.magnitude);
    // Not through arrive(): this is the wall talking to itself, and it must
    // not look like the world has come back.
    sink.handle(ev);
    if (!seen) note.hidden = true;
  }, 3200);
}

// --- the programme ------------------------------------------------------
//
// A room that shows work has a programme, not a shuffle: these pieces, in this
// order, each for as long as it deserves, from opening until closing and dark
// in between. Where in the programme we are is read from the clock (see
// show.js), so a screen rebooted overnight comes back where the show is and
// two screens in one room agree without talking to each other.
const programme = parseShow(params.get('show'), (n) => Boolean(WORKS[n]));
const hours = parseHours(params.get('open'));
const shut = document.getElementById('shut');
let closed = false;

/** Closing time: the picture goes down like the lights, and nothing burns in. */
function close(yes) {
  if (yes === closed) return;
  closed = yes;
  document.body.classList.toggle('shut', yes);
  sink.setSuspended(yes);
  if (yes) {
    if (source && source.stop) source.stop();
    // Cleared rather than frozen: a still picture held for fourteen hours is
    // how a panel learns a shape it will keep for good.
    setTimeout(() => { if (closed) sink.clear(); }, 4200);
    note.hidden = false;
    note.innerHTML = `<b>Closed</b>The programme returns at ${hours ? formatClock(hours.open) : 'opening'}.`;
  } else {
    note.hidden = true;
    if (feed) listenAlone(feed);
    if (ex) {
      slot = null;
      followExhibition();
    } else {
      const now = showAt(programme, new Date());
      if (now) hang(now.work);
    }
  }
}

function hang(name) {
  if (name === labelled && !cartel.hidden) return;
  showWork(name);
  if (params.get('label') !== 'off') showCartel(name);
}

/** Where the programme is now; checked often enough that a minute is a minute. */
function followProgramme() {
  const when = new Date();
  if (hours) close(!isOpen(hours, when));
  if (closed || !programme.length) return;
  const now = showAt(programme, when);
  if (now && now.work !== labelled) hang(now.work);
}

// --- the exhibition -------------------------------------------------------
//
// `exhibition=1`: the whole catalogue in a drawn order, a few minutes each,
// every work dressed anew each time it comes round, the instrument held
// across several works. Where in it we are is read from the clock, like a
// programme. `minutes`, `hold`, `seed` and `fade` tune it; `works=a,b,c`
// narrows it to a hand-picked set; `room=Night` to one room of the Gallery.
const FADE = Math.max(0, Math.min(30, Number(option('fade', '10', '10')))) * 1000;
const UPTIME_RELOAD = Number(params.get('reload') || 0) * 3600 * 1000; // hours, 0 for never
const startedAt = Date.now();
const room = params.get('room');
const picked = (params.get('works') || '').split(',').filter((k) => WORKS[k]);
const ex = exhibiting
  ? exhibition({
      works: picked.length ? picked : room ? Object.keys(WORKS).filter((k) => WORKS[k].room === room) : undefined,
      seed: params.get('seed') || 'tintinnabulum',
      minutes: params.get('minutes') || 4,
      hold: params.get('hold') || 3,
    })
  : null;
let slot = null; // the slot number showing, so a change is seen once
let changing = 0;

/**
 * Hang a work in the dress the exhibition drew for it: its palette, a fresh
 * variation of its dials, and its instrument, through a dip of `fade` ms
 * rather than a cut. The scene is swapped at the bottom of the dip by the
 * sink itself; everything else is set at that same moment, under cover.
 */
function hangDressed(at, { instant = false } = {}) {
  const w = WORKS[at.work];
  if (!w || !SCENES[w.scene]) return false;
  const s = workSettings(w, SCENES);
  const dials = variedParams(SCENES[s.scene], at.variation, 1, s.params);
  const dress = {
    scene: s.scene, palette: at.palette, finish: s.finish, ground: s.ground,
    mat: s.mat, grain: s.grain, living: s.living, pace: s.pace,
    params: { [s.scene]: dials },
  };
  const apply = () => {
    const dipping = sink.sceneFading;
    // The sink swaps the scene itself at the bottom of a dip; setting it
    // here as well would only restart it.
    applySettings(dipping ? { ...dress, scene: undefined } : dress);
    if (PALETTES[at.palette]) dressCartel(PALETTES[at.palette].colors);
    labelled = at.work;
    if (params.get('label') !== 'off') showCartel(at.work);
  };
  clearTimeout(changing);
  if (instant || !FADE || !seen) {
    apply();
  } else {
    sink.fadeScene(s.scene, FADE);
    changing = setTimeout(apply, FADE / 2);
  }
  playKit(at.kit, s.space);
  return true;
}

/** Where the exhibition is now; a new slot is a new dress. */
function followExhibition() {
  const when = new Date();
  if (hours) close(!isOpen(hours, when));
  if (closed || !ex) return;
  const at = exhibitionAt(ex, when);
  if (!at || at.slot === slot) return;
  const first = slot === null;
  slot = at.slot;
  journal({ what: 'hang', note: `${at.work} in ${at.palette}, variation ${at.variation}, ${at.kit}`, slot: at.slot });
  hangDressed(at, { instant: first });
  // A page that has run for days is reloaded between two works, where a
  // second of black is a change of programme and not a fault.
  if (UPTIME_RELOAD && Date.now() - startedAt > UPTIME_RELOAD && !first) {
    journal({ what: 'reload', note: 'uptime' });
    setTimeout(() => location.reload(), 1500);
  }
}

// The address is the installation: an exhibition, a programme, or a single
// work, and a feed.
const feed = option('feed', 'wikipedia', null);
if (ex) {
  journal({ what: 'start', note: describeExhibition(ex) });
  followExhibition();
  setInterval(followExhibition, 5000);
} else if (programme.length) {
  followProgramme();
  setInterval(followProgramme, 5000);
} else {
  const wanted = params.get('work');
  if (wanted) {
    showWork(wanted);
    if (params.get('label') !== 'off') showCartel(wanted);
  }
  if (hours) {
    close(!isOpen(hours, new Date()));
    setInterval(() => close(!isOpen(hours, new Date())), 5000);
  }
}
if (feed && !closed) listenAlone(feed);
if (params.get('full') === '1') addEventListener('pointerdown', goFullscreen, { once: true });
if (son && !seen) {
  // Until the touch that starts sound and fullscreen, say so, once, quietly.
  note.hidden = false;
  note.innerHTML = '<b>Touch the screen once</b>to start the sound' + (params.get('full') === '1' ? ' and take the whole screen.' : '.');
}

// Announce ourselves, so the sandbox sends its current settings rather than
// leaving this window on defaults until somebody changes something.
//
// Unless this wall was told what to hang. Saying hello asks for everything the
// console has, and the console answers with the whole of its look -- which
// arrives a moment after the address has been obeyed and quietly replaces it:
// a wall opened on `?work=lanterns` ended up showing whatever the laptop in
// the corner happened to be on. A console that CHANGES something still
// reaches this window, because that message goes to everyone; it is only the
// unasked-for opening statement that is refused.
if (!selfDirected) channel.postMessage({ type: 'hello' });
window.addEventListener('beforeunload', () => {
  channel.postMessage({ type: 'goodbye' });
  channel.close();
});

// Exposed for the test suite, which needs to see what arrived.
window.projection = {
  sink, channel, showWork, goFullscreen, showCartel, hideCartel, addressOf,
  wall: { panel, across },
  programme, hours, followProgramme,
  exhibition: ex, followExhibition, hangDressed,
  get slot() { return slot; },
  get journal() { return readJournal(); },
  get standby() { return Boolean(standby); },
  get recording() { return recording; },
  get onStandby() { return Boolean(source && source.onStandby); },
  get sound() { return { wanted: Boolean(son), on: soundOn, kit: currentKit, wantedKit }; },
  get closed() { return closed; },
  get untilOpen() { return untilOpen(hours, new Date()); },
  get labelled() { return cartel.classList.contains('show') ? labelled : null; },
  get seen() { return seen; },
  get standalone() { return Boolean(source); },
  get quietFor() { return performance.now() - last; },
};
