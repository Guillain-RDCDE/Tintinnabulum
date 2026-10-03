// One drawing machine: a figure that is nothing but a formula and a pen.
//
// This family held six of them and now holds the one that earned its place. A
// harmonograph is two pendulums and a pen, a Victorian parlour instrument that
// draws while it slows and stops when the drawing is finished; the others were
// polar curves that came out handsome and never answered the feed, and they
// came off the wall together.
//
// None of that is anyone's property, and none of it is engineering. What the
// scene has to decide is the part that is actually this project's: which knob
// the data turns. A formula with its parameters wired to a live feed is a
// different object from the same formula with its parameters typed in, and the
// interesting choice is always which parameter, not which formula.
//
// It paints onto an offscreen canvas, because the history of a pen is
// thousands of segments and redrawing it every frame is the one thing this
// cannot afford.

import { scratch, bufferFor } from './paint.js';

const TAU = Math.PI * 2;


export const GEOMETRY_SCENES = {

  harmonograph: {
    label: 'Harmonograph',
    positional: false,
    preview: { dt: 34, frames: 210 },
    note: 'Two pendulums per axis, swinging down. A Victorian parlour instrument that draws while it comes to rest. Each event sets one going; the figure is the record of it dying.',
    params: {
      ratio: { label: 'Frequency ratio', min: 1, max: 6, step: 0.01, default: 2 },
      detune: { label: 'Detune', min: 0, max: 0.06, step: 0.001, default: 0.008 },
      damping: { label: 'Damping', min: 0.01, max: 0.5, step: 0.005, default: 0.05 },
      speed: { label: 'Speed', min: 1, max: 20, step: 0.5, default: 7 },
      pens: { label: 'Pens at once', min: 1, max: 10, step: 1, default: 3 },
    },
    init(api) {
      api.scene.pens = [];
      api.scene.bufClean = false;
    },
    event(p, api) {
      const s = api.scene;
      // A harmonograph is one pen, and a figure takes a while to draw. The
      // first version started a fresh pen on every event, so on a busy feed no
      // pen ever got more than a hundredth of a second and the scene drew a
      // wisp. Most events now do what a hand does to a swinging pendulum --
      // push it -- and only a pen that has had time to develop is replaced.
      const cap = Math.max(1, Math.round(api.param('pens')));
      const newest = s.pens[s.pens.length - 1];
      if (newest && newest.t < 12) {
        // A push restores swing without moving the pen: energy in, not time
        // back. Winding `t` back instead would make it retrace what it drew.
        newest.swing = Math.max(0, newest.swing - 3.5 - Math.min(6, p.r / 18));
        newest.color = p.color;
        return;
      }
      while (s.pens.length >= cap) s.pens.shift();
      s.pens.push({
        t: 0,
        swing: 0,
        phase: p.pick * TAU,
        amp: 0.55 + Math.min(0.4, p.r / 160),
        color: p.color,
        width: Math.max(0.5, Math.min(1.6, p.r * 0.016)),
        last: null,
      });
    },
    frame(ctx, api) {
      const s = api.scene;
      const cv = scratch(api);
      const g = bufferFor(api);
      if (!g) return;

      const cx = api.w / 2;
      const cy = api.h / 2;
      const R = Math.min(api.w, api.h) * 0.44;
      const ratio = api.param('ratio');
      // A pair tuned to an exact ratio draws one closed figure and then
      // retraces it forever. The detune is what makes it precess, and it is
      // also honest: no two real pendulums were ever exactly in ratio.
      const det = api.param('detune');
      const damp = api.param('damping');
      const speed = api.param('speed');

      g.lineCap = 'round';
      for (let i = s.pens.length - 1; i >= 0; i--) {
        const pen = s.pens[i];
        const total = (api.dt / 1000) * speed;
        const sub = Math.max(1, Math.min(30, Math.ceil(total / 0.02)));
        for (let k = 0; k < sub; k++) {
          pen.t += total / sub;
          pen.swing += total / sub;
          const t = pen.t;
          // Two clocks: `t` is where the pen is on the curve and only ever goes
          // forward; `swing` is how much energy it has lost, and a push takes
          // that back.
          const decay = Math.exp(-damp * pen.swing);
          // Four pendulums, two per axis, each with its own phase. The quarter
          // turn between the axes is what makes the figure a rounded form
          // rather than a diagonal smear, and writing it with one shared phase
          // -- as the first version did -- drew exactly that smear.
          const x = cx + R * pen.amp * decay * 0.5 *
            (Math.sin(t + pen.phase) +
             Math.sin(ratio * t * (1 + det) + pen.phase * 1.7));
          const y = cy + R * pen.amp * decay * 0.5 *
            (Math.sin(t * (1 - det) + pen.phase + Math.PI / 2) +
             Math.sin(ratio * t * (1 + det * 0.5) + pen.phase * 0.4 + Math.PI / 2));
          if (pen.last) {
            g.globalAlpha = 0.3 + decay * 0.45;
            g.strokeStyle = pen.color;
            g.lineWidth = pen.width;
            g.beginPath();
            g.moveTo(pen.last[0], pen.last[1]);
            g.lineTo(x, y);
            g.stroke();
          }
          pen.last = [x, y];
        }
        // Lifted once the swing is too small to draw anything.
        if (Math.exp(-damp * pen.swing) < 0.025) s.pens.splice(i, 1);
      }
      g.globalAlpha = 1;
      ctx.globalAlpha = 1;
      ctx.drawImage(cv, 0, 0, api.w, api.h);
    },
  },
};
