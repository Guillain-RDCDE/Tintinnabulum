// The shell: the picture as the application, and everything else floating over it.
//
// The sandbox used to be a page of settings with a picture at the top. That
// order was backwards for anybody who came to look rather than to configure:
// the work was a strip of the screen and the controls were the page. Now the
// work fills the window and four tabs open an inspector over it, so a change is
// made while watching the thing it changes. A dock carries what a player needs
// -- play, what is on, the volume, the next work -- and all of it fades away
// once nothing has been touched for a few seconds.
//
// Nothing here owns a setting. The tabs show the panels that already existed,
// under the ids the rest of the page and the test suite address them by; the
// dock's buttons call the same functions as the panels' controls.

import { SCENES, PALETTES, KITS, WORKS } from '../src/index.js';
import { parseColor, lightnessOf } from '../src/visual/color.js';
import { $ } from './dom.js';
import { store } from './store.js';

export const TABS = {
  gallery: { label: 'Gallery', panels: ['sec-works'] },
  sound: { label: 'Sound', panels: ['sec-sound'] },
  picture: { label: 'Picture', panels: ['sec-look'] },
  data: { label: 'Data', panels: ['sec-listen', 'sec-connect', 'sec-filter', 'sec-activity'] },
  // Not an inspector over the picture but a bench in place of it: see studio.js.
  create: { label: 'Create', panels: [], bench: true },
};
const ORDER = ['gallery', 'sound', 'picture', 'data', 'create'];

/** The shelves a surprise is drawn from: pictures, not demonstrations. */
const ART_SHELVES = new Set(['Painting', 'Nature', 'Water', 'Night', 'Materials']);

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Red and blue both well above green: violet, which the interface never wears. */
const isViolet = (c) => {
  const { r, g, b } = parseColor(c);
  return b > g + 25 && r > g + 25;
};

/**
 * The accent the interface takes from the palette on show: its most colourful
 * ink that reads against the glass, and never a violet.
 */
export function accentFor(colors, lightGround) {
  let best = null;
  let bestScore = -1;
  for (const c of [colors.user, colors.anon, colors.alert, colors.default]) {
    if (!c || isViolet(c)) continue;
    const { r, g, b } = parseColor(c);
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const L = lightnessOf(c);
    const reads = lightGround ? (L < 0.66 ? 1 : 0.25) : (L > 0.52 ? 1 : 0.3);
    const score = chroma * reads + 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best || (lightGround ? '#0071e3' : '#0a84ff');
}

/**
 * @param {object} io
 * @param {object}   io.canvas        the CanvasSink
 * @param {object}   io.look          what setupLook returned
 * @param {object}   io.works         what setupWorks returned
 * @param {Element}  io.startBtn      the play button
 * @param {Function} io.selectKit     (name, options) => Promise
 * @param {Function} io.getKit        the current kit's name
 * @param {Function} io.getFeedLabel  what is being listened to, in words
 * @param {Function} io.repaint       paint cards that have just come into view
 * @param {object}   [io.studio]      what setupStudio returned: the Create tab
 * @param {Function} [io.onStudio]    (open) => the bench has taken or given back the screen
 * @param {Function} [io.onRemix]     take what is playing to Create
 */
export function setupShell({ canvas, look, works, startBtn, selectKit, getKit, getFeedLabel, repaint, studio, onStudio, onRemix = () => {} }) {
  const body = document.body;
  const root = document.documentElement;
  const inspector = $('#inspector');
  const scroller = $('#inspector-body');
  const tabButtons = [...document.querySelectorAll('#tabs [data-tab]')];
  const indicator = $('#tabs .indicator');
  let active = null;

  const tabOf = {};
  for (const [tab, def] of Object.entries(TABS)) {
    for (const id of def.panels) {
      const el = document.getElementById(id);
      tabOf[id] = tab;
      el.dataset.tab = tab;
      el.classList.toggle('solo', def.panels.length === 1);
    }
  }

  function placeIndicator() {
    const btn = tabButtons.find((b) => b.dataset.tab === active);
    if (!btn) {
      indicator.style.opacity = '0';
      return;
    }
    indicator.style.opacity = '1';
    indicator.style.left = `${btn.offsetLeft}px`;
    indicator.style.width = `${btn.offsetWidth}px`;
  }

  /** The bench takes the screen: no inspector, no dock, the live picture resting. */
  function showBench() {
    if (!studio) return;
    if (active === 'create') return;
    active = 'create';
    body.classList.remove('inspecting');
    inspector.setAttribute('aria-hidden', 'true');
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === 'create'));
    placeIndicator();
    if (onStudio) onStudio(true);
    studio.show();
    wake();
  }

  function leaveBench() {
    if (active !== 'create') return;
    studio.hide();
    if (onStudio) onStudio(false);
    // The bench painted the interface in its own colours; the live work's
    // come back.
    lastTint = '';
    refresh();
  }

  /** Open the inspector on a tab. */
  function show(tab) {
    if (!TABS[tab]) return;
    if (TABS[tab].bench) return showBench();
    if (active === 'create') {
      leaveBench();
      active = null;
    }
    const changed = active !== tab;
    active = tab;
    body.classList.add('inspecting');
    inspector.setAttribute('aria-hidden', 'false');
    inspector.dataset.tab = tab;
    $('#inspector-title').textContent = TABS[tab].label;
    for (const [id, owner] of Object.entries(tabOf)) {
      document.getElementById(id).hidden = owner !== tab;
    }
    const panels = TABS[tab].panels.map((id) => document.getElementById(id));
    if (panels.length === 1) {
      if (!panels[0].open) panels[0].open = true;
    } else if (!panels.some((p) => p.open)) {
      panels[0].open = true;
    }
    if (changed) scroller.scrollTop = 0;
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    placeIndicator();
    wake();
    // The cards that just came into view are painted now rather than on the
    // next scroll, and again once the slide-in has put them where they stay.
    requestAnimationFrame(() => repaint());
    setTimeout(() => repaint(), 600);
  }

  function close() {
    if (!active) return;
    leaveBench();
    active = null;
    body.classList.remove('inspecting');
    inspector.setAttribute('aria-hidden', 'true');
    for (const b of tabButtons) b.setAttribute('aria-selected', 'false');
    placeIndicator();
    wake();
  }

  const toggle = (tab) => (active === tab ? close() : show(tab));

  for (const b of tabButtons) b.addEventListener('click', () => toggle(b.dataset.tab));
  $('#inspector-close').addEventListener('click', close);
  $('#now').addEventListener('click', () => show('gallery'));

  // A panel opened by any route -- its own summary, a link, a script -- brings
  // its tab up with it, so "open this panel" still means "show me this".
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open) return;
    const panel = d.closest('.panel');
    const tab = panel && panel.dataset.tab;
    if (tab && active !== tab) show(tab);
  }, true);

  // The summary of a tab that is a single panel is a caption, not a switch.
  for (const [tab, def] of Object.entries(TABS)) {
    if (def.panels.length !== 1) continue;
    const summary = document.getElementById(def.panels[0]).querySelector('summary');
    summary.addEventListener('click', (e) => e.preventDefault());
    summary.tabIndex = -1;
  }

  // Jumping between the parts of a long tab.
  for (const b of document.querySelectorAll('.subnav [data-jump]')) {
    b.addEventListener('click', () => {
      const target = document.getElementById(b.dataset.jump);
      if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  // --- the chrome gets out of the way ---------------------------------------------
  const idle = { ms: 3000 };
  let idleTimer = 0;
  let overChrome = false;
  // Nothing fades before the first touch, click or key: on arrival the
  // controls are how anybody finds out what this is, and on a phone there is
  // no pointer moving about to bring them back.
  let interacted = false;

  function sleep() {
    // Only a keyboard focus keeps the chrome up: a button that was clicked
    // keeps focus too, and must not pin the controls over the picture.
    const el = document.activeElement;
    const focusInChrome = el && el.closest && el.closest('#topbar, #dock') && el.matches(':focus-visible');
    const untouched = !interacted && startBtn.dataset.on !== 'true';
    if (active || overChrome || focusInChrome || untouched) {
      idleTimer = setTimeout(sleep, idle.ms);
      return;
    }
    body.classList.add('idle');
  }

  function wake() {
    body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(sleep, idle.ms);
  }

  for (const type of ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']) {
    addEventListener(type, wake, { passive: true });
  }
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    addEventListener(type, () => { interacted = true; }, { passive: true, capture: true });
  }
  for (const el of [$('#topbar'), $('#dock')]) {
    // A clicked button lets go of focus, so no ring is left on it.
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && e.detail > 0) b.blur();
    });
    el.addEventListener('pointerenter', () => { overChrome = true; });
    el.addEventListener('pointerleave', () => { overChrome = false; });
  }
  wake();

  // --- keys ---------------------------------------------------------------------------
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  }
  $('#fullscreen').addEventListener('click', toggleFullscreen);

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    const onControl = t && t.closest && t.closest('button, a, summary');
    // The bench has keys of its own; only the tabs still answer here.
    if (active === 'create' && !/^[1-5]$/.test(e.key)) return;
    switch (e.key) {
      case 'Escape':
        if (active) { close(); e.preventDefault(); }
        break;
      case ' ':
        if (onControl) return;
        e.preventDefault();
        startBtn.click();
        break;
      case 'ArrowRight':
        if (active) return;
        works.step(1);
        break;
      case 'ArrowLeft':
        if (active) return;
        works.step(-1);
        break;
      case 'f': case 'F':
        toggleFullscreen();
        break;
      case 'g': case 'G':
        toggle('gallery');
        break;
      case 's': case 'S':
        surprise();
        break;
      case 'r': case 'R':
        onRemix();
        break;
      case '1': case '2': case '3': case '4': case '5':
        toggle(ORDER[Number(e.key) - 1]);
        break;
      default:
    }
  });

  // --- a swipe changes the work, on a phone -------------------------------------------
  let touch = null;
  const stage = $('#stage');
  stage.addEventListener('touchstart', (e) => {
    const p = e.touches[0];
    touch = { x: p.clientX, y: p.clientY, t: performance.now() };
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!touch) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - touch.x;
    const dy = p.clientY - touch.y;
    const quick = performance.now() - touch.t < 700;
    touch = null;
    if (quick && Math.abs(dx) > 60 && Math.abs(dy) < 50) works.step(dx < 0 ? 1 : -1);
  }, { passive: true });

  $('#prev-work').addEventListener('click', () => works.step(-1));
  $('#next-work').addEventListener('click', () => works.step(1));

  // --- surprise -----------------------------------------------------------------------
  /**
   * A new combination, chosen to work: a picture from the art shelves, a palette
   * that suits it -- night scenes on a night ground -- a finish more often plain
   * than dressed, and an instrument.
   */
  function surprise() {
    const scenes = Object.keys(SCENES).filter((n) => ART_SHELVES.has(SCENES[n].shelf) && n !== canvas.sceneName);
    const scene = pick(scenes);
    const night = SCENES[scene].shelf === 'Night';
    const palettes = Object.keys(PALETTES).filter((n) => {
      const L = lightnessOf(PALETTES[n].colors.background);
      // Never a dark green ground: it reads as murk rather than as night.
      const murk = PALETTES[n].family === 'Green' && L < 0.45;
      return (night ? L < 0.35 : true) && !murk && n !== canvas.paletteName;
    });
    const palette = pick(palettes);
    const finish = pick(['none', 'none', 'none', 'paper', 'watercolour', 'riso', 'pointillist', 'ink', 'glass']);
    look.selectRotate(0);
    look.selectSceneRotate(0);
    if (canvas.fadeScene) canvas.fadeScene(scene, 1800);
    look.selectScene(scene);
    look.selectPalette(palette);
    look.selectFinish(finish);
    // A paper that suits the picture: a sheet under a light one, black card or
    // nothing under a dark one, and more often than not no paper at all.
    const lightPicture = lightnessOf(PALETTES[palette].colors.background) >= 0.5;
    look.selectGround(lightPicture
      ? pick(['none', 'none', 'cotton', 'coldpress', 'hotpress', 'washi', 'aged'])
      : pick(['none', 'none', 'black']));
    look.selectMat(pick(['none', 'none', 'thin', 'gallery']));
    look.selectGrain(Math.random() < 0.25);
    look.selectLiving(Math.random() < 0.25 ? 'drift' : 'still');
    look.selectPace(pick([2, 3, 3]));
    const kit = pick(Object.keys(KITS));
    selectKit(kit, { audition: false });
    refresh();
    return { scene, palette, finish, kit };
  }
  $('#surprise').addEventListener('click', surprise);
  $('#remix').addEventListener('click', () => onRemix());

  // --- colour and words from the work on show ------------------------------------------
  let lastTint = '';
  function tint() {
    const colors = canvas.palette;
    const light = lightnessOf(colors.background) > 0.55;
    const accent = accentFor(PALETTES[canvas.paletteName] ? PALETTES[canvas.paletteName].colors : colors, light);
    const key = `${light}:${accent}`;
    if (key === lastTint) return;
    lastTint = key;
    root.dataset.ground = light ? 'light' : 'dark';
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-ink', lightnessOf(accent) > 0.66 ? '#111111' : '#ffffff');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.background);
  }

  function refresh(force = false) {
    if (force) lastTint = '';
    if (active !== 'create') tint();
    const name = works.current();
    // A work by its title; one of yours by the title you gave it.
    const titled = works.title;
    $('#now-title').textContent = titled || SCENES[canvas.sceneName].label;
    $('#now-sub').textContent = [
      name ? WORKS[name].room : titled ? 'Yours' : PALETTES[canvas.paletteName] ? PALETTES[canvas.paletteName].label : '',
      KITS[getKit()] ? KITS[getKit()].label : '',
      getFeedLabel(),
    ].filter(Boolean).join(' · ');
  }

  addEventListener('resize', placeIndicator);

  // On a first visit the gallery greets you, on a screen with room for it. On a
  // phone the sheet would cover the very thing that arrived, so it waits.
  if (!store.get('shell-seen') && innerWidth > 700 && !location.hash.startsWith('#create')) {
    requestAnimationFrame(() => show('gallery'));
  }
  store.set('shell-seen', '1');

  refresh();

  return {
    show,
    close,
    toggle,
    refresh,
    surprise,
    wake,
    idle,
    get active() {
      return active;
    },
  };
}
