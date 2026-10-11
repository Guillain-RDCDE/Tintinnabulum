// A scene's dials, drawn: one implementation for Look and for Create.
//
// Both panels show the same thing -- the dials a scene declares, a choice as a
// row of named buttons rather than a slider reading 0, 1, 2, and only the
// dials of the sheet on view -- and each used to write it out on its own, with
// the sheet worked out three times over. What still differs between them is
// how they look, which is a skin, and what a turn of a dial does, which each
// panel says through three callbacks.
//
// A dial that rebuilds the scene is committed when the hand comes off, not on
// every pixel of the drag: the panel is told on release (`onRelease`) and on
// every movement (`onInput`) and decides which of the two applies.

/**
 * The name of the sheet a scene is on, from its `figure` choice, or null for a
 * scene with one sheet.
 *
 * @param {object} specs   the scene's dials, by name
 * @param {object} values  their current values
 */
export function sheetOn(specs, values) {
  const choice = specs && specs.figure && specs.figure.options ? specs.figure : null;
  if (!choice) return null;
  const v = values && values.figure !== undefined ? values.figure : choice.default;
  return choice.options[Math.round(v)] || null;
}

/** Whether a dial belongs on the sheet on view. */
export function onSheet(spec, sheet) {
  return !(spec.sheets && sheet && !spec.sheets.includes(sheet));
}

/** The value as Look reads it out: a name for a choice, a short number otherwise. */
function lookText(spec, v) {
  if (spec.options) return spec.options[Math.round(v)];
  return Math.abs(v) >= 100 || Number.isInteger(v) ? String(v) : v.toFixed(spec.step < 0.01 ? 4 : 2);
}

/** The value as Create reads it out: as many decimals as the step has. */
export function createText(spec, v) {
  if (spec.options) return spec.options[Math.round(v)] || '';
  const step = spec.step || 0.01;
  const d = step >= 1 ? 0 : Math.min(4, Math.max(0, -Math.floor(Math.log10(step))));
  return Number(v).toFixed(d);
}

/**
 * How each panel's dials look. Everything here is markup; nothing here decides
 * what a dial does.
 */
export const SKINS = {
  // Look: label left, value right, track underneath.
  look: {
    wrap(name) {
      const wrap = document.createElement('label');
      wrap.className = 'dial';
      wrap.dataset.param = name;
      return wrap;
    },
    head(spec, value) {
      const head = document.createElement('span');
      head.className = 'dial-head';
      const label = document.createElement('span');
      label.textContent = spec.label;
      const out = document.createElement('span');
      // A dial at zero whose default is zero is one the scene sizes itself.
      out.textContent = !spec.options && value === 0 && spec.default === 0 ? 'auto' : lookText(spec, value);
      head.append(label, out);
      return { head, out, label };
    },
    rowClass: 'dial-options',
    rowTag: 'span',
    chip() {
      const b = document.createElement('button');
      b.type = 'button';
      return b;
    },
    pressed: true,
    slider(spec, value) {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(value === 0 && spec.default === 0 ? spec.min : value);
      return input;
    },
    text: lookText,
  },
  // Create: a lab line with an output, chips for a choice.
  create: {
    wrap(name) {
      const wrap = document.createElement('div');
      wrap.className = 'st-dial';
      wrap.dataset.param = name;
      return wrap;
    },
    head(spec, value, name, isChoice) {
      const head = document.createElement('div');
      head.className = 'lab';
      const label = document.createElement(isChoice ? 'span' : 'label');
      if (!isChoice) label.htmlFor = `st-dial-${name}`;
      label.textContent = spec.label;
      const out = document.createElement('output');
      head.append(label, out);
      return { head, out, label };
    },
    rowClass: 'st-options',
    rowTag: 'div',
    chip(name) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'st-chip';
      b.dataset.param = name;
      return b;
    },
    pressed: false,
    slider(spec, value, name) {
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `st-dial-${name}`;
      input.min = spec.min;
      input.max = spec.max;
      input.step = spec.step || (spec.max - spec.min) / 100;
      return input;
    },
    text: createText,
  },
};

/**
 * Draw a scene's dials into `host`, replacing what was there.
 *
 * @param {Element} host
 * @param {object} o
 * @param {object} o.specs       the scene's dials, by name
 * @param {object} o.values      their current values
 * @param {object} o.skin        one of SKINS
 * @param {Function} [o.onInput]   (name, value, spec, out) while a slider moves
 * @param {Function} [o.onRelease] (name, value, spec) when a slider is let go
 * @param {Function} [o.onChoose]  (name, index, spec) when a choice is made
 * @returns {{sheet: ?string, count: number}} the sheet drawn, and how many dials
 */
export function renderDials(host, { specs, values, skin, onInput, onRelease, onChoose }) {
  host.textContent = '';
  const sheet = sheetOn(specs, values);
  let count = 0;
  for (const [name, spec] of Object.entries(specs || {})) {
    if (!onSheet(spec, sheet)) continue;
    count++;
    const value = values[name] === undefined ? spec.default : values[name];
    const wrap = skin.wrap(name);
    const { head, out } = skin.head(spec, value, name, Boolean(spec.options));
    if (spec.options) {
      const row = document.createElement(skin.rowTag);
      row.className = skin.rowClass;
      row.setAttribute('role', 'group');
      spec.options.forEach((option, i) => {
        const b = skin.chip(name);
        b.textContent = option;
        b.dataset.value = String(i);
        if (skin.pressed) b.setAttribute('aria-pressed', String(Math.round(value) === i));
        b.addEventListener('click', () => onChoose && onChoose(name, i, spec));
        row.append(b);
      });
      wrap.append(head, row);
      host.append(wrap);
      continue;
    }
    const input = skin.slider(spec, value, name);
    input.dataset.param = name;
    input.addEventListener('input', () => onInput && onInput(name, Number(input.value), spec, out));
    input.addEventListener('change', () => onRelease && onRelease(name, Number(input.value), spec));
    wrap.append(head, input);
    host.append(wrap);
  }
  return { sheet, count };
}
