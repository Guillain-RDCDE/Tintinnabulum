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

import {
  CanvasSink, PALETTES, WORKS, SCENES, Mapper, normalize,
  wikipedia, bitcoin, coinbase, earthquakes, bluesky, github, noaaAlerts, hackerNews, randomSource,
} from '../src/index.js';

const CHANNEL = 'tintinnabulum';
const params = new URLSearchParams(location.search);

/** The feeds a wall may be pointed at on its own, without a console. */
const FEEDS = {
  wikipedia: () => wikipedia({ langs: (params.get('langs') || 'en').split(',').filter(Boolean) }),
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

const sink = new CanvasSink(canvas, {
  showHud: false,
  showLabels: false,
  // A projection is watched from across a room, so the marks live longer and
  // run larger than they do in a panel beside a control surface.
  life: 18000,
  maxRadius: 140,
  maxParticles: 1400,
});
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
  applySettings({
    scene: w.scene, palette: w.palette, finish: w.finish, ground: w.ground,
    mat: w.mat, grain: Boolean(w.grain), living: w.living,
    pace: [0.25, 0.5, 0.75, 1, 1.3, 1.7][w.pace] ?? 1,
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

// f for fullscreen, c to clear, and Escape is the browser's own.
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') document.getElementById('full').click();
  if (e.key === 'c' || e.key === 'C') sink.clear();
});

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
  if (s.params) {
    for (const [scene, dials] of Object.entries(s.params)) {
      for (const [name, value] of Object.entries(dials)) sink.setParam(name, value, scene);
    }
    // A dial that rebuilds has to take effect on the scene that is showing.
    sink._initScene();
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

/** Listen to the world directly, for a wall with no console beside it. */
function listenAlone(name) {
  const make = FEEDS[name];
  if (!make) return false;
  try {
    source = make();
    source.start((raw) => {
      const ev = normalize(raw);
      if (!ev) return;
      ev.map = mapper.map(ev.magnitude);
      arrive(ev);
    });
    return true;
  } catch (e) {
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

// The address is the installation: a work to show, a feed to listen to.
const wanted = params.get('work');
if (wanted) showWork(wanted);
const feed = params.get('feed');
if (feed) listenAlone(feed);
if (params.get('full') === '1') addEventListener('pointerdown', goFullscreen, { once: true });

// Announce ourselves, so the sandbox sends its current settings rather than
// leaving this window on defaults until somebody changes something.
channel.postMessage({ type: 'hello' });
window.addEventListener('beforeunload', () => {
  channel.postMessage({ type: 'goodbye' });
  channel.close();
});

// Exposed for the test suite, which needs to see what arrived.
window.projection = {
  sink, channel, showWork, goFullscreen,
  get seen() { return seen; },
  get standalone() { return Boolean(source); },
  get quietFor() { return performance.now() - last; },
};
