// Two pictures of the sound itself.
//
// Everything else here draws the events. These two draw what the events were
// turned INTO -- the spectrum and the waveform coming out of the speakers at
// that instant -- which closes the loop the whole project is built on: the
// data became a sound, and the sound becomes the picture. A mark is no longer
// a stand-in for a note. It is the note, written down.
//
// Where there is no sound to read -- a preview, an export, a page with the
// audio off -- they fall back to a spectrum built from the events themselves,
// each one a partial at the pitch it would have sounded. The picture is then
// of the music the piece would be making, which is honest enough for a card
// and keeps the scene from being a blank rectangle in every still.

import { scratch } from './paint.js';
import { shadeOf, mixColors, lightnessOf, lighten } from '../color.js';

const TAU = Math.PI * 2;
const ROLES = ['user', 'anon', 'bot', 'default', 'alert'];

const inkOf = (api, k) =>
  shadeOf(api.palette[ROLES[k % ROLES.length]] || api.palette.default,
    [Math.random(), Math.random(), Math.random()],
    Number.isFinite(api.richness) ? api.richness : 0.45);

const BINS = 256;
// Below this the analyser is telling us the room is quiet rather than that
// something is playing quietly.
const FLOOR = 0.42;

/**
 * The spectrum to draw: the real one if anything is listening, otherwise one
 * imagined from the events that have just arrived.
 *
 * The imagined one is not a decoration. Each recent event contributes a peak
 * where its note would sit and a softer one an octave up, and the whole thing
 * decays -- so a still shows the shape of the music rather than a shape.
 */
function spectrumOf(api, s) {
  const real = api.sound && api.sound.spectrum;
  if (real && real.length) return { bins: real, live: true, n: Math.min(BINS, real.length) };
  if (!s.fake) s.fake = new Uint8Array(BINS);
  // Everything falls, a little each frame, whatever else happens.
  const fall = Math.min(1, api.dt / 420);
  for (let i = 0; i < BINS; i++) s.fake[i] = Math.max(0, s.fake[i] - s.fake[i] * fall - 1);
  return { bins: s.fake, live: false, n: BINS };
}

/** An event, sounded into the imagined spectrum. */
function sound(s, unit, strength) {
  if (!s.fake) s.fake = new Uint8Array(BINS);
  // Low events are big events: the mapper pitches a large magnitude down, and
  // the picture should agree with what the ear is told.
  const at = Math.max(2, Math.min(BINS - 3, Math.round(unit * BINS * 0.55)));
  const peak = Math.min(255, 140 + strength * 110);
  for (let k = -2; k <= 2; k++) {
    const v = peak * (1 - Math.abs(k) * 0.3);
    s.fake[at + k] = Math.max(s.fake[at + k], v);
  }
  // A second partial an octave up, quieter: a bell is never one line.
  const octave = Math.min(BINS - 1, at * 2);
  s.fake[octave] = Math.max(s.fake[octave], peak * 0.45);
}

/**
 * A displacement from the imagined spectrum: the partials that are loud in it,
 * summed as they would be in the air.
 */
function imagined(s, angle, loud) {
  if (!s.fake) return 0;
  let v = 0;
  let weight = 0;
  for (let i = 6; i < 90; i += 7) {
    const a = s.fake[i] / 255;
    if (a < 0.05) continue;
    v += Math.sin(angle * (4 + i * 0.7)) * a;
    weight += a;
  }
  return weight > 0 ? (v / Math.max(1, weight)) * Math.max(0.25, loud) : Math.sin(angle * 9) * loud * 0.3;
}

export const HEARD_SCENES = {
  // --- spectrogram ----------------------------------------------------------------------
  spectrogram: {
    label: 'Spectrogram',
    note: 'The sound of the piece, written down as it happens. Every column is one instant of the spectrum coming out of the speakers -- low frequencies at the bottom, high at the top, brightness for how much of each -- and the picture scrolls, so a minute of listening becomes a minute of paper. Instruments are unmistakable in it: a bell is a bright line with a comb of quieter ones above, a plucked string is a streak that leans, a chime is a pair a few cents apart beating against each other.',
    how: 'The renderer reads the analyser once a frame and the scene draws one column of it at the leading edge, blitting the rest of the picture sideways rather than redrawing it. With nothing to listen to, the column is built from the events instead, each a peak where its note would sit.',
    preview: { frames: 160, dt: 45 },
    params: {
      scroll: { label: 'How fast the paper moves', min: 0.3, max: 4, step: 0.05, default: 1 },
      range: { label: 'How much of the range', min: 0.2, max: 1, step: 0.02, default: 0.55 },
      contrast: { label: 'Contrast', min: 0.4, max: 3, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      s.carry = 0;
      s.fake = new Uint8Array(BINS);
      s.cleared = false;
    },
    event(p, api) {
      const s = api.scene;
      // Where the note sits, from the mark's own height: the renderer places a
      // big event low and a small one high, and so does the mapper's pitch.
      sound(s, 1 - Math.max(0, Math.min(1, p.y / api.h)), Math.min(1, (p.r || 6) / (Math.min(api.w, api.h) * 0.12)));
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      const step = Math.max(1, Math.round(api.dt * 0.06 * api.param('scroll')));
      s.carry += step;
      const move = Math.floor(s.carry);
      if (move >= 1) {
        s.carry -= move;
        // The picture is moved rather than redrawn: a spectrogram redrawn
        // from a stored history is the same pixels copied twice.
        b.globalCompositeOperation = 'copy';
        b.drawImage(buf, -move, 0);
        b.globalCompositeOperation = 'source-over';
        b.fillStyle = api.palette.background;
        b.fillRect(api.w - move, 0, move, api.h);
      }
      const { bins, n } = spectrumOf(api, s);
      const range = api.param('range');
      const contrast = api.param('contrast');
      const cols = Math.max(1, move);
      const x = api.w - cols;
      // Octaves, not hertz. A spectrum from an analyser is linear in
      // frequency, and music is not: on a linear axis everything anybody
      // plays is crushed into the bottom tenth of the picture and the top
      // nine tenths is silence. Each row here is a constant ratio up from the
      // last, which is what makes a spectrogram legible -- and what makes a
      // bell's partials the evenly spaced comb they sound like.
      const rows = Math.max(24, Math.round(api.h / 2));
      const rowH = api.h / rows;
      const top = Math.max(8, n * range);
      const lowest = 2;
      const ratio = Math.log(top / lowest);
      const hot = api.palette.alert || api.palette.user || api.palette.default;
      const cool = api.palette.bot || api.palette.anon || api.palette.default;
      for (let i = 0; i < rows; i++) {
        // The band this row covers, and the loudest thing in it: a row that
        // took one bin would miss a partial sitting between two of them.
        const from = Math.floor(lowest * Math.exp((i / rows) * ratio));
        const to = Math.max(from + 1, Math.floor(lowest * Math.exp(((i + 1) / rows) * ratio)));
        let peak = 0;
        for (let k = from; k < to && k < bins.length; k++) if (bins[k] > peak) peak = bins[k];
        // A floor under it, and the rest stretched over what is left. An
        // analyser's low bins sit near the top of the scale whenever anything
        // at all is playing, so without this the bottom third of the picture
        // is one flat colour and the structure -- which is the whole point --
        // is invisible.
        const raw = peak / 255;
        const v = raw <= FLOOR ? 0 : Math.pow((raw - FLOOR) / (1 - FLOOR), 1 / contrast);
        if (v < 0.03) continue;
        // Cool where it is quiet, hot where it is loud, and out of the
        // palette either way.
        b.fillStyle = mixColors(cool, hot, Math.min(1, v * 1.2));
        b.globalAlpha = Math.min(1, 0.15 + v * 0.85);
        b.fillRect(x, api.h - (i + 1) * rowH, cols, Math.ceil(rowH) + 0.5);
      }
      b.globalAlpha = 1;
      ctx.drawImage(buf, 0, 0);
    },
  },

  // --- groove ---------------------------------------------------------------------------
  groove: {
    label: 'Groove',
    note: 'A phonautograph: the sound cut as a spiral, from the outside in, the way it was written before anybody could play it back. The stylus moves at a steady rate and the waveform pushes it sideways, so a loud passage is a wide band and a quiet one a hairline -- and after a few minutes the whole piece is a disc you can read at a glance. Scott de Martinville was doing this in 1857 with a barrel, a membrane and a bristle; the only difference here is that the sound comes from the data.',
    how: 'One turn of the spiral is a fixed number of frames, so the disc fills at a steady rate whatever the picture is doing. The displacement is the waveform where there is one to read and the loudness of the events where there is not.',
    preview: { frames: 200, dt: 45 },
    params: {
      turns: { label: 'How close the turns run', min: 0.4, max: 3, step: 0.05, default: 1 },
      depth: { label: 'How deep it is cut', min: 0.3, max: 3, step: 0.05, default: 1 },
      speed: { label: 'How fast the stylus travels', min: 0.3, max: 3, step: 0.05, default: 1 },
    },
    init(api) {
      const s = api.scene;
      s.angle = 0;
      s.fake = new Uint8Array(BINS);
      s.energy = 0;
      s.cleared = false;
      // One stylus, one ink. A disc whose groove changes colour every few
      // turns is a decoration; the recording is one cut.
      s.ink = null;
      s.turn = 0;
    },
    event(p, api) {
      const s = api.scene;
      s.energy = Math.min(1, s.energy + 0.35);
      if (!s.ink) s.ink = p.color || null;
      sound(s, 1 - Math.max(0, Math.min(1, p.y / api.h)), 1);
    },
    frame(ctx, api) {
      const s = api.scene;
      const buf = scratch(api, 'buf');
      const b = s.bufCtx;
      if (!s.cleared) {
        b.fillStyle = api.palette.background;
        b.fillRect(0, 0, api.w, api.h);
        s.cleared = true;
      }
      const m = Math.min(api.w, api.h);
      const cx = api.w / 2;
      const cy = api.h / 2;
      const outer = m * 0.46;
      const inner = m * 0.11;
      const pitch = (outer - inner) / (46 * api.param('turns'));  // how far in, per turn
      const wave = api.sound && api.sound.wave;
      const loud = api.sound ? api.sound.loudness : Math.min(1, s.energy);
      s.energy = Math.max(0, s.energy - api.dt / 900);

      const ink = s.ink || inkOf(api, 1);
      b.strokeStyle = lightnessOf(api.palette.background) > 0.5 ? ink : lighten(ink, 0.12);
      b.lineCap = 'round';
      b.lineWidth = Math.max(0.6, m * 0.0016);

      // A steady number of steps a frame: the disc fills at its own rate,
      // whatever the feed is doing.
      const steps = Math.max(2, Math.round(api.dt * 0.16 * api.param('speed')));
      const cut = m * 0.016 * api.param('depth');
      for (let i = 0; i < steps; i++) {
        const a0 = s.angle;
        const a1 = s.angle + 0.035;
        const r0 = outer - (a0 / TAU) * pitch;
        const r1 = outer - (a1 / TAU) * pitch;
        if (r1 < inner) {
          // The disc is full. It is left to fade rather than wiped, so the
          // next recording is cut over a ghost of the last.
          b.fillStyle = api.palette.background;
          b.globalAlpha = 0.5;
          b.fillRect(0, 0, api.w, api.h);
          b.globalAlpha = 1;
          s.angle = 0;
          break;
        }
        // The displacement: the waveform if anything is listening, the
        // remembered energy of the events if not.
        const t = (i / steps) * (wave ? wave.length - 1 : 0);
        // With nothing to listen to, the displacement is built from the
        // imagined spectrum: a handful of partials at the pitches the events
        // would have sounded, which wanders as they do rather than repeating
        // one flower round the disc.
        const w0 = wave ? (wave[t | 0] - 128) / 128 : imagined(s, a0, loud);
        const w1 = wave ? (wave[Math.min(wave.length - 1, (t | 0) + 1)] - 128) / 128 : imagined(s, a1, loud);
        const d0 = w0 * cut;
        const d1 = w1 * cut;
        b.beginPath();
        b.moveTo(cx + Math.cos(a0) * (r0 + d0), cy + Math.sin(a0) * (r0 + d0));
        b.lineTo(cx + Math.cos(a1) * (r1 + d1), cy + Math.sin(a1) * (r1 + d1));
        b.stroke();
        s.angle = a1;
      }
      ctx.drawImage(buf, 0, 0);
    },
  },
};
