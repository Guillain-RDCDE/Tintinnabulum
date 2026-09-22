import {
  Sonifier,
  Mapper,
  normalize,
  CanvasSink,
  Recorder,
  SCALES,
  KEYS,
  PALETTES,
  DEFAULT_PALETTE_NAME,
  swatchOf,
  KITS,
  drawKitArt,
  drawSpaceArt,
  SHAPES,
  DEFAULT_SHAPE,
  drawShape,
  SCENES,
  DEFAULT_SCENE,
  FINISHES,
  LIVING,
  SPACES,
  DEFAULT_SPACE,
  previewScene,
  WIKIPEDIA_LANGUAGES,
  WIKIPEDIA_FLAG_CC,
} from '../src/index.js';

import { $, createPicker, fitCanvas, caption } from './dom.js';
import { store } from './store.js';
import { createFeedCatalog } from './feed-catalog.js';
import { setupLook } from './look.js';
import { createProjector } from './broadcast.js';
import { setupConnect } from './connect.js';
import { setupWorks } from './works.js';
import { setupShell } from './shell.js';
import { setupStudio } from './studio.js';

const storedPalette = store.pick('palette', PALETTES, DEFAULT_PALETTE_NAME);

const son = new Sonifier({
  kit: 'hatnote',
  mapping: { mode: 'adaptive', scale: 'chromatic', range: 27, jitter: 0.5 },
  voices: { maxVoices: 16 },
  volume: 0.7,
});

// The rate is stated in the top bar, so the canvas does not draw its own
// counter under the dock by default.
const canvas = new CanvasSink('#canvas', { showHud: false, palette: storedPalette });
son.use(canvas);

const recorder = new Recorder(son.engine);
let source = null;

// =========================================================================
// Audio state, always stated
// =========================================================================

function setAudioStatus(text, state = '') {
  const el = $('#audio-status');
  el.textContent = text;
  el.dataset.state = state;
}

function describe(status) {
  if (!status) return;
  if (!status.running) setAudioStatus('Sound is blocked by the browser. Tap anywhere to enable it.', 'bad');
  else if (!status.usable) setAudioStatus('No instrument could be loaded, so there is no sound.', 'bad');
  else if (status.fellBackToSynth)
    setAudioStatus('Sound on, using synthesis: the recorded bells could not be downloaded.', 'good');
  else if (status.problems && status.problems.length)
    setAudioStatus('Sound on. Some samples were unavailable and are covered by their neighbours.', 'good');
  else setAudioStatus('Sound on.', 'good');
}

const unlockEl = $('#unlock');
// Shown only once sound has been asked for. On arrival every browser holds the
// audio back until a gesture, and a notice across the picture before anybody
// has pressed anything reads as something already gone wrong.
let soundWanted = false;
const refreshUnlock = () => unlockEl.classList.toggle('show', son.locked && soundWanted);

// Downloading the sample banks takes seconds on a phone, and the feed is
// already drawing by then. Start on synthesis, which needs no network, and
// move to the recorded bells once they arrive.
let sampleState = 'pending'; // pending | upgrading | done | chosen
async function upgradeToSamples() {
  if (sampleState !== 'pending' || currentKit !== 'hatnote') return;
  sampleState = 'upgrading';
  try {
    await son.setKit('hatnote');
    if (!son.audio.status || !son.audio.status.usable) throw new Error('sample kit unusable');
    sampleState = 'done';
    describe({ ...son.audio.status, running: true });
  } catch {
    await son.setKit('synth');
    sampleState = 'done';
    setAudioStatus('Sound on, using synthesis: the recorded bells could not be downloaded.', 'good');
  }
}

let audioReady = false;
async function ensureAudio() {
  soundWanted = true;
  // First, synchronously, while the gesture is still ours: the right to start
  // audio does not survive an await on iOS, so loading a kit before asking
  // would spend the tap without using it.
  son.engine.resumeSync();
  // Gate on being genuinely audible, not merely on the kit having loaded. A
  // kit loads happily while the context stays blocked, and latching on that
  // turned every later tap into a no-op: the overlay kept asking, and nothing
  // it did could ever help.
  if (audioReady && !son.locked) {
    refreshUnlock();
    return son.audioStatus;
  }

  setAudioStatus('Preparing sound…');
  if (sampleState === 'pending' && currentKit === 'hatnote') await son.setKit('synth');
  const status = await son.unlock();
  audioReady = Boolean(status.audible);
  describe(status);
  refreshUnlock();
  if (status.audible) upgradeToSamples();
  return status;
}

unlockEl.addEventListener('click', ensureAudio);
refreshUnlock();

// The overlay follows the context, whoever changed it.
//
// It used to be refreshed only where the page itself touched the audio, which
// was fine while the page was the only thing that could. It is not any more:
// the engine brings back a context that stopped on its own, and without this
// the overlay would go on asking to be tapped after the sound had already come
// back -- the exact fault it was fixed for once before, arrived at from the
// other direction.
son.engine.onStateChange = (state) => {
  refreshUnlock();
  if (state === 'running' && audioReady) describe({ ...son.audio.status, running: true });
};

// =========================================================================
// Listen to
// =========================================================================

function setStatus(state, name) {
  $('#stat').textContent = name ? `${name}: ${state}` : state;
}

const FEEDS = createFeedCatalog({
  getLangs: () => langs,
  getBackend: () => $('#backend').value,
  getIngestUrl: () => $('#ingest-url').value.trim() || '/events',
  onStatus: setStatus,
});

let feed = store.pick('feed', FEEDS, 'wikipedia');
let langs = (store.get('langs') || 'en').split(',').filter(Boolean);
if (!langs.length) langs = ['en'];

const startBtn = $('#start');
// A player's button: an icon and a word, the feed's name while it waits.
const PLAY_ICON = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6 4.2v11.6a.7.7 0 0 0 1.06.6l9.3-5.8a.7.7 0 0 0 0-1.2l-9.3-5.8A.7.7 0 0 0 6 4.2z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="3.4" height="12" rx="1"/><rect x="11.6" y="4" width="3.4" height="12" rx="1"/></svg>';
const setRunning = (on) => {
  startBtn.dataset.on = String(on);
  startBtn.innerHTML = on ? `${PAUSE_ICON}<span class="label">Pause</span>` : `${PLAY_ICON}<span class="label">Listen<span class="feed"> to ${FEEDS[feed].label}</span></span>`;
  startBtn.setAttribute('aria-label', on ? 'Pause' : `Listen to ${FEEDS[feed].label}`);
};

function selectFeed(name, persist = true) {
  if (!FEEDS[name]) return;
  feed = name;
  $('#feed-note').textContent = FEEDS[name].note;
  $('#langs-wrap').hidden = !FEEDS[name].langs;
  $('#ingest-wrap').hidden = !FEEDS[name].needsUrl;
  feedPicker.mark(name);
  // Feeds differ by two orders of magnitude in rate, so each may cap its own.
  son.pool.maxPerSecond = FEEDS[name].maxPerSecond || 0;
  if (persist) store.set('feed', name);
  if (startBtn.dataset.on !== 'true') setRunning(false);
}

const feedPicker = createPicker($('#feeds'), Object.entries(FEEDS), {
  key: 'feed',
  className: 'card',
  render: (btn, def) => btn.append(caption(def.label, def.blurb, { wrap: false })),
  onPick: (name) => {
    selectFeed(name);
    if (startBtn.dataset.on === 'true') startFeed();
  },
});

// --- Wikipedia editions ---------------------------------------------------
function syncLangs(persist = true) {
  langPicker.mark(langs);
  $('#langs').value = langs.join(',');
  if (persist) store.set('langs', langs.join(','));
}

const langPicker = createPicker(
  $('#langs-grid'),
  WIKIPEDIA_LANGUAGES.map((l) => [l.code, l]),
  {
    key: 'lang',
    className: 'lang',
    multi: true,
    title: (l) => `${l.name} — ${l.native} (${l.code})`,
    render: (btn, l) => {
      // An image, not an emoji: Windows ships no flag glyphs, so emoji flags
      // show as the bare letters "GB" for every visitor on a PC.
      const fl = document.createElement('img');
      fl.className = 'fl';
      fl.src = `flags/${WIKIPEDIA_FLAG_CC[l.code] || 'eo'}.svg`;
      fl.alt = '';
      fl.width = 24;
      fl.height = 18;
      fl.loading = 'lazy';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = l.native;
      btn.append(fl, nm);
    },
    onPick: (code) => {
      const i = langs.indexOf(code);
      if (i >= 0) langs.splice(i, 1);
      else langs.push(code);
      if (!langs.length) langs = ['en']; // never leave nothing selected
      syncLangs();
      if (startBtn.dataset.on === 'true' && FEEDS[feed].langs) startFeed();
    },
  }
);

// The same setting, typed rather than clicked. One state, two ways in.
$('#langs').addEventListener('change', () => {
  const parsed = $('#langs').value.split(/[\s,]+/).filter(Boolean);
  langs = parsed.length ? parsed : ['en'];
  syncLangs();
  if (startBtn.dataset.on === 'true' && FEEDS[feed].langs) startFeed();
});
$('#backend').addEventListener('change', () => {
  if (startBtn.dataset.on === 'true' && FEEDS[feed].langs) startFeed();
});

function startFeed() {
  if (source) son.disconnect(source);
  source = FEEDS[feed].make();
  setStatus('connecting', source.name);
  son.connect(source);
  setRunning(true);
}

startBtn.onclick = async () => {
  if (startBtn.dataset.on === 'true') {
    if (source) son.disconnect(source);
    source = null;
    setRunning(false);
    setStatus('idle');
    return;
  }
  await ensureAudio();
  startFeed();
};

// =========================================================================
// Sound
// =========================================================================

let currentKit = store.pick('kit', KITS, 'hatnote');

async function selectKit(name, { persist = true, audition = true } = {}) {
  if (!KITS[name]) return;
  currentKit = name;
  $('#kit-note').textContent = KITS[name].note;
  kitPicker.mark(name);
  if (persist) {
    store.set('kit', name);
    sampleState = 'chosen'; // an explicit choice is never overridden
  }
  await son.setKit(name); // while locked this only assigns
  if (son.locked) return;
  describe({ ...son.audio.status, running: true });
  // A sound cannot be judged from a label, so play a few notes.
  if (audition) {
    [4, 11, 19].forEach((_, i) =>
      setTimeout(() => son.emit({ magnitude: 900 * (3 - i), id: `audition-${name}-${i}` }), i * 170)
    );
  }
}

// Each card carries a drawn signature rather than a waveform. An envelope is
// accurate and unreadable: twelve of them side by side look like twelve of the
// same thing, and the point of a picker is that you recognise the water and
// the night without reading the labels.
// The card's colour comes from its position in the grid, not from its name:
// see kit-art.js for why a hash is the wrong choice here.
const KIT_ORDER = Object.keys(KITS);

function paintKitArt(cv, name) {
  const { ctx, w, h } = fitCanvas(cv, { height: 64 });
  drawKitArt(ctx, name, {
    w, h,
    palette: PALETTES[canvas.paletteName].colors,
    index: KIT_ORDER.indexOf(name),
  });
}

const kitPicker = createPicker($('#kits'), Object.entries(KITS), {
  key: 'kit',
  className: 'card',
  title: (def) => def.note,
  render: (btn, def) => {
    btn.append(
      document.createElement('canvas'),
      caption(def.label, def.sampled ? 'Recorded samples' : 'Synthesised')
    );
  },
  onPick: async (name) => {
    await ensureAudio();
    selectKit(name);
  },
});

const paintKitArts = () => kitPicker.repaint(paintKitArt);
requestAnimationFrame(paintKitArts);



const scaleSel = $('#scale');
for (const name of Object.keys(SCALES)) {
  const o = document.createElement('option');
  o.value = o.textContent = name;
  scaleSel.appendChild(o);
}
scaleSel.value = 'chromatic';
scaleSel.onchange = () => son.mapper.setScale(scaleSel.value);

const keySel = $('#key');
KEYS.forEach((name, semis) => {
  const o = document.createElement('option');
  o.value = String(semis);
  o.textContent = name;
  keySel.appendChild(o);
});
keySel.onchange = (e) => (son.mapper.root = Number(e.target.value) || 0);

// Free time means notes sound the instant their event arrives, which is by
// definition arrhythmic. A tempo holds each note to the next subdivision.
function applyTempo() {
  const bpm = Number($('#bpm').value) || 0;
  $('#bpm-val').textContent = bpm ? `${bpm} bpm` : 'free';
  son.audio.setTempo(bpm, Number($('#division').value) || 8);
}
$('#bpm').oninput = applyTempo;
$('#division').onchange = applyTempo;

$('#humanise').oninput = (e) => {
  const v = Number(e.target.value) / 10; // 0 to 2 semitones of wobble
  son.mapper.jitter = v;
  $('#humanise-val').textContent = v ? `± ${v.toFixed(1)} semitones` : '0';
};

$('#mode').onchange = (e) => {
  son.mapper.mode = e.target.value;
  son.mapper.reset();
};
$('#range').oninput = (e) => (son.mapper.range = Number(e.target.value) || 27);
$('#invert').onchange = (e) => (son.mapper.invert = e.target.checked);
$('#volume').oninput = (e) => (son.volume = Number(e.target.value) / 100);
$('#voices').oninput = (e) => (son.pool.maxVoices = Math.max(1, Number(e.target.value) || 16));

$('#record').onclick = async (ev) => {
  const btn = ev.currentTarget;
  if (recorder.recording) {
    btn.textContent = 'Record';
    btn.classList.remove('rec');
    await recorder.save();
  } else {
    await ensureAudio();
    recorder.start();
    btn.textContent = 'Stop and save';
    btn.classList.add('rec');
  }
};

// Look
// =========================================================================

// The projection window runs its own renderer, so it needs the look rather
// than the pixels. Everything visual is gathered here in one place.
const projector = createProjector({
  settings: () => ({
    palette: canvas.paletteName,
    scene: canvas.sceneName,
    shape: canvas.shape,
    richness: canvas.richness,
    finish: canvas.finish,
    ground: canvas.ground,
    mat: canvas.mat,
    grain: canvas.grain,
    pace: canvas.pace,
    living: canvas.living,
    depth: canvas.depth,
    starfield: canvas.starfield,
    params: canvas._params,
  }),
});

// Declared before setupLook, and that matters. updateSummaries is handed to
// the Look panel and read from inside it, so anything it touches has to exist
// by the time the panel restores a setting -- otherwise the whole page dies on
// a temporal dead zone before it has drawn anything. It did: adding one
// control that refreshed the summary took the sandbox down.
let restraintWord = 'everything';
let connectSummary = 'Paste JSON, hear it';
// Assigned once every other panel exists, because a work reaches into all of
// them; read through a null check for the same reason as the two above.
let worksPanel = null;
let shell = null;
// Create, once it is set up below. The Gallery reads your pieces through it.
let studio = null;
// One of yours, hung on the wall from the bench or the Gallery: which, and the
// look it was hung with, so that touching any control takes its name off the
// way it does a work's.
let hung = null;
const hungKey = () => [canvas.sceneName, canvas.palette.background, canvas.palette.user, canvas.palette.anon,
  canvas.finish, canvas.ground, canvas.mat, currentKit].join('|');
function pieceOn() {
  if (!hung || !studio || hung.key !== hungKey()) return null;
  const piece = studio.pieces.find((p) => p.id === hung.id);
  return piece ? { id: piece.id, title: piece.title } : null;
}

const look = setupLook({
  canvas,
  updateSummaries: () => updateSummaries(),
  // Every plate in the Sound panel is drawn in the palette's own ink, rooms
  // included, so both grids follow a colour change rather than lying about it.
  paintKitArts: () => {
    paintKitArts();
    paintSpaceArts();
  },
  onLookChange: () => projector.sync(),
});
const { selectScene, selectPalette, selectShape, selectRichness, selectBudget, SHAPE_LABELS } = look;

// Restored here rather than inside setupLook, because it refreshes the panel
// summary and the summary reads `look`.
look.selectRotate(Number(store.get('rotate') || 0), false);
look.selectSceneRotate(Number(store.get('scene-rotate') || 0), false);
look.selectFinish(store.get('finish') || 'none', false);
look.selectGround(store.get('ground') || 'none', false);
look.selectMat(store.get('mat') || 'none', false);
look.selectGrain(store.flag('grain'), false);
look.selectLiving(store.get('living') || 'still', false);
look.selectPace(store.get('pace') === null || store.get('pace') === undefined || store.get('pace') === ''
  ? 3 : Number(store.get('pace')), false);

// A card inside a folded panel is skipped rather than drawn -- see the note on
// `repaint` in dom.js -- so unfolding a panel is when the cards inside it get
// made. `toggle` does not bubble, hence the capture phase.
function paintWhatIsNowVisible() {
  kitPicker.repaintPending(paintKitArt);
  spacePicker.repaintPending(paintSpaceArt);
  look.repaintPendingPreviews();
  if (worksPanel) worksPanel.repaintPending();
}

document.addEventListener('toggle', paintWhatIsNowVisible, true);

// A card below the fold is skipped too, so scrolling is the other moment a
// card becomes worth drawing. Coalesced onto a frame: a scroll fires dozens of
// events a second and each one would otherwise start a walk of three grids.
let scrollPending = false;
const onScroll = () => {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    scrollPending = false;
    paintWhatIsNowVisible();
  });
};
// Captured on the document: the cards now scroll inside the inspector and the
// gallery's rows, and an element's scroll never reaches the window.
document.addEventListener('scroll', onScroll, { passive: true, capture: true });
addEventListener('resize', onScroll);

// =========================================================================
// Sound: space between notes
// =========================================================================

// Space between notes. The wording gives the rate rather than the millisecond
// figure, because what anyone is actually choosing is how busy this is.
const RESTRAINT_STEPS = [
  [1, 'everything', 'Every event sounds the moment it arrives. Faithful to the data, and on a fast feed each note is masked by the next.'],
  [300, 'measured', 'At most three or four notes a second. Enough space for a bell to be heard as a bell.'],
  [700, 'sparse', 'About two a second, and only the most significant of whatever arrived in between.'],
  [1201, 'ascetic', 'Roughly one note a second. Nearly all of the stream is passed over, and what is left is the shape of its peaks.'],
];


function selectRestraint(ms, persist = true) {
  const v = Math.max(0, Math.min(1200, Math.round(ms)));
  son.audio.setRestraint(v);
  const [, word, note] = RESTRAINT_STEPS.find(([edge]) => v < edge) || RESTRAINT_STEPS[3];
  restraintWord = word;
  $('#restraint-val').textContent = word;
  $('#restraint-note').textContent = note;
  $('#restraint').value = String(v);
  if (persist) store.set('restraint', String(v));
  updateSummaries();
}

$('#restraint').addEventListener('input', (e) => selectRestraint(Number(e.target.value)));

// --- the room ------------------------------------------------------------
// A send to a convolver, and the impulse response is built rather than
// recorded: see src/audio/space.js for why that is not a compromise.
let spaceWord = SPACES[DEFAULT_SPACE].label;

function selectSpace(name, persist = true) {
  if (!SPACES[name]) return;
  son.space = name;
  spaceWord = SPACES[name].label;
  $('#space-note').textContent = SPACES[name].note;
  spacePicker.mark(name);
  if (persist) store.set('space', name);
  updateSummaries();
}

// The rooms were seven words in a row, the one grid on the page with nothing
// to look at. Each now carries its own impulse response, plotted: see
// src/visual/space-art.js for why that is the honest picture rather than a
// drawing of an arch.
const SPACE_ORDER = Object.keys(SPACES);

function paintSpaceArt(cv, name) {
  const { ctx, w, h } = fitCanvas(cv, { height: 58 });
  drawSpaceArt(ctx, SPACES[name], {
    w, h,
    palette: PALETTES[canvas.paletteName].colors,
    index: SPACE_ORDER.indexOf(name),
  });
}

const spacePicker = createPicker($('#spaces'), Object.entries(SPACES), {
  key: 'space',
  className: 'card',
  title: (sp) => sp.note,
  render: (btn, sp) => {
    btn.append(
      document.createElement('canvas'),
      caption(sp.label, sp.seconds ? `${sp.seconds}s tail` : 'no tail')
    );
  },
  onPick: (name) => selectSpace(name),
});
const paintSpaceArts = () => spacePicker.repaint(paintSpaceArt);
requestAnimationFrame(paintSpaceArts);
selectSpace(store.pick('space', SPACES, DEFAULT_SPACE), false);

// =========================================================================
// Works
// =========================================================================

worksPanel = setupWorks({
  canvas,
  look,
  selectKit,
  selectSpace,
  ensureAudio,
  getKit: () => currentKit,
  getSpace: () => son.space,
  // The dock says what is on the moment a work is up, not a second later.
  onChange: () => { if (shell) shell.refresh(); },
  // A work chosen by hand goes up full screen and starts playing.
  onPlay: () => {
    if (shell) shell.close();
    if (startBtn.dataset.on !== 'true') startBtn.click();
  },
  onRemix: (what) => remix(what),
  pieces: () => (studio ? studio.pieces : []),
  pieceOn,
  onPlayPiece: (id) => studio && studio.playPiece(id),
  onForgetPiece: (id) => studio && studio.forget(id),
});

$('#yours-create').addEventListener('click', () => remix());

/** Take a picture to Create: a work, one of yours, or (by default) what is playing. */
function remix(what = { kind: 'live' }) {
  if (!studio || !shell) return;
  studio.remix(what);
  shell.show('create');
}
requestAnimationFrame(() => worksPanel.repaint());

// =========================================================================
// Create: the bench, in a tab of its own
// =========================================================================

// While the bench has the screen, the live picture rests rather than drawing
// unseen. What happens to listening depends on where the bench takes its
// events from. Following the feed, the feed must run -- it is started if it
// was not -- and the sandbox's own notes fall silent, so every event is heard
// once, on the bench's instrument. Keeping its own rhythm, listening pauses,
// so two pieces of music never play at once. Everything comes back as it was
// when the bench is left.
const forStudio = { paused: false, started: false };
const listening = () => startBtn.dataset.on === 'true';

function sandboxNotes(on) {
  son.audio.enabled = on;
  if (on) son._syncBed();
  else son.audio.setBed(null);
}

function studioSource() {
  if (studio.state.source === 'live') {
    sandboxNotes(false);
    if (forStudio.paused) forStudio.paused = false;
    else if (!listening()) forStudio.started = true;
    if (!listening()) startBtn.click();
  } else {
    sandboxNotes(true);
    if (forStudio.started) forStudio.started = false;
    else if (listening()) forStudio.paused = true;
    if (listening()) startBtn.click();
  }
}

function studioShown(on) {
  canvas.setSuspended(on);
  if (on) {
    studioSource();
    return;
  }
  sandboxNotes(true);
  if (forStudio.paused && !listening()) startBtn.click();
  if (forStudio.started && listening()) startBtn.click();
  forStudio.paused = false;
  forStudio.started = false;
}

studio = setupStudio({
  son,
  canvas,
  onLeave: () => { if (shell) shell.close(); },
  feedLabel: () => FEEDS[feed].label,
  onSource: () => studioSource(),
  // What you keep hangs in the Gallery as well, in the room called Yours.
  onYours: () => {
    worksPanel.renderYours();
    worksPanel.refresh();
  },
  // Back to where the picture came from: its card in the Gallery, or the wall.
  onBack: (from) => {
    if (from.kind === 'work' || from.kind === 'yours') {
      shell.show('gallery');
      requestAnimationFrame(() => worksPanel.reveal(from.kind === 'work' ? { work: from.name } : { piece: from.id }));
    } else {
      shell.close();
    }
  },
  liveTitle: () => worksPanel.title || SCENES[canvas.sceneName].label,
  // A picture made on the bench, put on the live feed: the scene with its
  // dials -- remembered as if they had been turned by hand -- the colours, the
  // texture, and listening started.
  playLive: async (pic) => {
    hung = null;
    look.selectRotate(0);
    look.selectSceneRotate(0);
    // A picture hung is a fixed composition, as a work is.
    look.selectLiving('still');
    for (const [k, v] of Object.entries(pic.params)) {
      canvas.setParam(k, v, pic.scene);
      store.set(`p:${pic.scene}:${k}`, String(v));
    }
    look.selectScene(pic.scene);
    if (typeof pic.palette === 'string') {
      look.selectPalette(pic.palette);
    } else {
      // Colours of one's own have no name to remember, and living colour would
      // walk them away towards a palette that has one.
      look.selectLiving('still');
      canvas.setPalette(pic.palette);
      canvas.canvas.style.background = pic.palette.background;
    }
    look.selectFinish(pic.finish);
    look.selectGround(pic.ground || 'none');
    look.selectMat(pic.mat);
    look.selectGrain(pic.grain);
    // Listening carries on, or starts: whatever the bench did to it is kept
    // rather than undone on the way out.
    forStudio.paused = false;
    forStudio.started = false;
    if (shell) shell.close();
    if (startBtn.dataset.on !== 'true') startBtn.click();
    if (shell) shell.refresh(true);
    // Its instrument -- chosen at once, loaded in its own time -- and its name
    // on the wall straight away rather than once the samples have arrived.
    const kit = pic.kit && KITS[pic.kit] ? selectKit(pic.kit, { audition: false }) : null;
    if (pic.piece) hung = { id: pic.piece, key: hungKey() };
    worksPanel.refresh();
    if (shell) shell.refresh(true);
    if (kit) {
      await kit;
      if (shell) shell.refresh();
    }
  },
});

// The Gallery was set up before the bench, so its room of yours is filled now.
worksPanel.renderYours();

shell = setupShell({
  canvas,
  look,
  works: worksPanel,
  startBtn,
  selectKit,
  getKit: () => currentKit,
  getFeedLabel: () => FEEDS[feed].label,
  repaint: () => paintWhatIsNowVisible(),
  studio,
  onStudio: studioShown,
  onRemix: () => remix(),
});
// An address for the bench opens the bench.
if (location.hash.startsWith('#create')) shell.show('create');
// =========================================================================
// Filter
// =========================================================================

const activeCategories = () => new Set([...$('#cats').selectedOptions].map((o) => o.value));
// The list governs only the categories it names. A category of your own
// arriving through the ingest server must stay audible, or feeding in custom
// data yields silence with no clue why.
const LISTED = new Set([...$('#cats').options].map((o) => o.value));
son.filter((ev) => !LISTED.has(ev.category) || activeCategories().has(ev.category));
son.filter((ev) => ev.magnitude >= (Number($('#minmag').value) || 0));

// =========================================================================
// Activity and startup
// =========================================================================

// Each panel header carries its own current value, so the whole configuration
// can be read at a glance without opening anything.
function updateSummaries() {
  const cats = [...$('#cats').selectedOptions].map((o) => o.value);
  const minmag = Number($('#minmag').value) || 0;
  const langNames = langs
    .map((c) => (WIKIPEDIA_LANGUAGES.find((l) => l.code === c) || {}).native || c)
    .slice(0, 3)
    .join(', ');
  if (worksPanel) {
    worksPanel.refresh();
    $('#sum-works').textContent = worksPanel.title || 'Your own';
  }
  $('#sum-listen').textContent =
    FEEDS[feed].label + (FEEDS[feed].langs ? ` · ${langNames}${langs.length > 3 ? '…' : ''}` : '');
  $('#sum-sound').textContent =
    KITS[currentKit].label +
    ` · ${restraintWord}` +
    (son.space === DEFAULT_SPACE ? '' : ` · ${spaceWord}`) +
    (son.audio.tempo.bpm ? ` · ${son.audio.tempo.bpm} bpm` : '');
  $('#sum-look').textContent =
    `${SCENES[canvas.sceneName].label}` +
    (look.sceneRotateWord === 'never' ? '' : ` ${look.sceneRotateWord}`) +
    ` · ${PALETTES[canvas.paletteName].label}` +
    (look.rotateWord === 'never' ? '' : ` ${look.rotateWord}`) +
    (canvas.living === 'still' ? '' : ` · ${LIVING[canvas.living].label.toLowerCase()}`) +
    (canvas.finish === 'none' ? '' : ` · ${FINISHES[canvas.finish].label}`) +
    (look.richnessWord === 'balanced' ? '' : ` · ${look.richnessWord} colour`);
  $('#sum-connect').textContent = connectSummary;
  $('#sum-filter').textContent =
    (cats.length === 4 ? 'Everything' : cats.join(', ') || 'Nothing') +
    (minmag > 0 ? ` · above ${minmag}` : '');
  if (shell) shell.refresh();
}

// Everything the engine accepts also goes to the wall, if a wall is listening.
son.on((ev) => projector.send(ev));

function refreshProjectState() {
  const el = $('#project-state');
  const link = $('#project-open');
  if (!projector.supported) {
    el.textContent = 'This browser cannot talk between windows.';
    link.setAttribute('aria-disabled', 'true');
    return;
  }
  el.textContent = projector.listeners
    ? `${projector.listeners} screen${projector.listeners > 1 ? 's' : ''} listening`
    : 'No second screen yet.';
}
projector.onListeners(refreshProjectState);

// A link, not a button that calls window.open.
//
// window.open is a pop-up, and a pop-up is exactly the thing browsers block:
// blockers, policies and enterprise settings all stop it, and when they do it
// fails silently -- the caller gets null and the person gets nothing. A link
// with a target is an ordinary navigation the person asked for, and nothing
// blocks it. The window is named, so clicking twice reuses the same one rather
// than opening a second.
//
// The cost is that the window opens at whatever size the browser gives it
// instead of the 1280x800 window.open could ask for. That is a poor trade to
// refuse: anyone projecting puts the window fullscreen anyway, which is what
// the message says.
$('#project-open').addEventListener('click', () => {
  $('#project-state').textContent =
    'Opening — put that window fullscreen on the screen you want.';
});
refreshProjectState();

const log = $('#log');
son.on((ev) => {
  if (ev.dimmed || !$('#sec-activity').open) return;
  const li = document.createElement('li');
  const verb = ev.polarity > 0 ? `+${ev.magnitude}` : ev.polarity < 0 ? `−${ev.magnitude}` : `${ev.magnitude}`;
  li.textContent = `${verb}  ${ev.label || ev.id}  ${ev.source ? '(' + ev.source + ')' : ''}`;
  log.prepend(li);
  while (log.children.length > 25) log.lastChild.remove();
});

setInterval(() => {
  if (son.stats.received) {
    $('#stat').textContent =
      `${son.eventsPerMinute}/min · ${son.audio.stats.played} played · ${son.pool.active} voices`;
    $('#sum-activity').textContent = `${son.eventsPerMinute} events per minute`;
  }
  updateSummaries();
  // The overlay tracks the context in both directions. It used to be refreshed
  // only while locked, so once sound started by some other route it stayed on
  // screen telling you to tap for audio you could already hear.
  // Only the overlay is updated here. Readiness is deliberately not inferred
  // from a running context: a browser that starts unblocked would latch it
  // before any kit had loaded, and unlock() -- which is what loads the kit --
  // would then never run, leaving a page that looks fine and plays nothing.
  refreshUnlock();

  if (son.engine.locked && son.stats.received > 0) {
    setAudioStatus('Sound is suspended by the browser. Tap anywhere to resume it.', 'bad');
  } else if (son.stats.received > 12 && son.audio.stats.played === 0 && !son.locked) {
    setAudioStatus('Events are arriving but nothing is being played. Check the volume and the filters.', 'bad');
  }
}, 1000);

selectFeed(feed, false);
syncLangs(false);
selectKit(currentKit, { persist: false, audition: false });
selectPalette(canvas.paletteName, false);
selectShape(store.pick('shape', SHAPE_LABELS, DEFAULT_SHAPE), false);
selectScene(store.pick('scene', SCENES, DEFAULT_SCENE), false);
selectRichness(store.number('richness', canvas.richness * 100, 0, 100) / 100, false);
$('#depth').checked = store.flag('depth', true);
canvas.setDepth($('#depth').checked);
selectBudget(store.number('budget', canvas.maxParticles, 100, 6000), false);
selectRestraint(store.number('restraint', 0, 0, 1200), false);
// Your data: the standard, usable without a server. Events are handed to the
// engine one every 400ms rather than all at once, because three notes at the
// same instant is a chord, not three events.
const connect = setupConnect({
  onState: (text) => { connectSummary = text; updateSummaries(); },
  play: async (events) => {
    await ensureAudio();
    if (!startBtn.dataset.on || startBtn.dataset.on !== 'true') setStatus('your data');
    events.forEach((ev, i) => setTimeout(() => son.emit(ev), i * 400));
  },
});

$('#cats').addEventListener('change', updateSummaries);
$('#minmag').addEventListener('input', updateSummaries);
updateSummaries();
$('#starfield').checked = store.flag('starfield');
canvas.setStarfield($('#starfield').checked);
setRunning(false);
setAudioStatus('');

// --- before anything plays, the stage is not empty ------------------------------
// A page that opens on a black screen asks for faith. Until something real
// arrives -- a feed started, an event of any kind -- quiet made-up events are
// drawn straight onto the canvas: no sound, no counts, and a mapper of their
// own so the real one's calibration is untouched. The first real event, or
// pressing Listen, ends it for good.
const attract = { timer: 0, n: 0, mapper: new Mapper({ mode: 'adaptive', range: 27 }) };
function attractTick() {
  if (son.stats.received > 0 || startBtn.dataset.on === 'true') {
    clearInterval(attract.timer);
    attract.timer = 0;
    return;
  }
  const categories = ['user', 'anon', 'user', 'bot'];
  const ev = normalize({
    magnitude: Math.round(Math.exp(Math.random() * 8)),
    id: `attract-${attract.n++}`,
    category: categories[attract.n % categories.length],
  });
  if (!ev) return;
  ev.map = attract.mapper.map(ev.magnitude);
  canvas.handle(ev);
}
attract.timer = setInterval(attractTick, 650);
attractTick();

// Handy from the console: window.son.emit({magnitude: 5000, id: 'test'})
window.son = son;
son.works = worksPanel;
son.shell = shell;
son.studio = studio;
son.attract = attract;
// The look panel with it, so a setting can be driven from the console the same
// way a click drives it.
son.look = look;
