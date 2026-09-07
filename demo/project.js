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

import { CanvasSink, PALETTES } from '../src/index.js';

const CHANNEL = 'tintinnabulum';

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

document.getElementById('full').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {
    /* a browser that refuses fullscreen still shows the picture */
  }
});
document.getElementById('clear').addEventListener('click', () => sink.clear());

// f for fullscreen, c to clear, and Escape is the browser's own.
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') document.getElementById('full').click();
  if (e.key === 'c' || e.key === 'C') sink.clear();
});

// --- listening ----------------------------------------------------------
let seen = false;
const channel = new BroadcastChannel(CHANNEL);

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
    if (!seen) {
      seen = true;
      note.hidden = true;
    }
    sink.handle(msg.event);
    return;
  }
  if (msg.type === 'clear') sink.clear();
};

// Announce ourselves, so the sandbox sends its current settings rather than
// leaving this window on defaults until somebody changes something.
channel.postMessage({ type: 'hello' });
window.addEventListener('beforeunload', () => {
  channel.postMessage({ type: 'goodbye' });
  channel.close();
});

// Exposed for the test suite, which needs to see what arrived.
window.projection = { sink, channel, get seen() { return seen; } };
