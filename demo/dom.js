// Small DOM helpers shared by every control on the page.

export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Size a canvas for the display, in CSS pixels.
 *
 * Every thumbnail on the page needs the same four lines: read the laid-out
 * width, multiply by the device ratio for the backing store, and scale the
 * context so drawing code can work in CSS pixels. Getting this wrong leaves a
 * canvas at the HTML default of 300x150, which is invisible until someone
 * notices the picture never appeared.
 */
export function fitCanvas(cv, { height, fallbackWidth = 148, maxRatio = 2 }) {
  const dpr = Math.min(maxRatio, window.devicePixelRatio || 1);
  const w = cv.clientWidth || fallbackWidth;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(height * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: height };
}

/**
 * Build a grid of selectable buttons.
 *
 * Six of these existed as six near-identical loops -- feeds, editions, kits,
 * scenes, palettes and shapes -- each rebuilding the same button scaffolding
 * and each with its own copy of "set aria-pressed on every child". They differ
 * only in what goes inside the button and whether one or several can be
 * chosen at a time.
 *
 * `render` receives the button and should fill it; anything it needs later,
 * such as a canvas, it can find again through the returned handle.
 */
/**
 * Is this element inside a panel that is actually open?
 *
 * Not `offsetParent`: the panels here clip their body with `overflow: hidden`
 * rather than removing it, so a card in a folded panel still has a layout box
 * and still reports an offset parent. It is off screen all the same. Walking
 * to the enclosing <details> is exact, and it is two property reads.
 */
function isShowing(el) {
  for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) {
    if (!d.open) return false;
  }
  // ...and inside the window, or near enough to be about to be.
  //
  // The panel test alone was only half the doctrine. Forty scene cards do not
  // fit on a screen: a dozen are visible and the rest are somewhere below the
  // fold, and painting those costs the same few hundred milliseconds each for
  // a picture nobody is looking at. A margin of one screen means scrolling
  // finds them already drawn rather than drawing them under the eye.
  const r = el.getBoundingClientRect();
  const h = window.innerHeight || 800;
  const w = window.innerWidth || 800;
  if (r.bottom < -h || r.top > h * 2) return false;
  if (r.right < -w || r.left > w * 2) return false;
  // A card with no box at all is laid out nowhere and cannot be painted.
  return r.width > 0 && r.height > 0;
}

// A card is not a stored image: painting one runs the real scene against
// synthetic events for a hundred frames, and costs tens of milliseconds. Forty
// of them in a single loop is one task of two and a half seconds, and the page
// is frozen for every one of them -- a click arriving inside that window is
// queued behind it, the button never lights up, and the only honest reading is
// that the click was ignored. So you click again.
//
// That is the whole of the "I have to double-click now" bug: nothing was wrong
// with the click handling, the page simply was not answering. Painting a few
// cards per frame costs the same total time and none of the deafness.
const FRAME_BUDGET_MS = 6;

export function createPicker(container, entries, {
  key,
  className,
  render,
  onPick,
  title = null,
  multi = false,
}) {
  const buttons = new Map();
  // Cards whose panel was folded when a repaint came round.
  const pending = new Set();
  // The repaint currently walking the grid, if any.
  let job = null;

  for (const [name, item] of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.dataset[key] = name;
    btn.setAttribute('aria-pressed', 'false');
    const hint = title ? title(item, name) : null;
    if (hint) btn.title = hint;
    render(btn, item, name);
    btn.addEventListener('click', () => onPick(name, item));
    container.appendChild(btn);
    buttons.set(name, btn);
  }

  /**
   * Walk a list of cards, painting what fits in a frame and yielding the rest.
   *
   * One card can exceed the budget on its own and there is nothing to be done
   * about that. What must not happen is ten of them back to back with the page
   * never getting a look in.
   */
  function walk(paint, names) {
    // A newer repaint supersedes an older one. The palette was changed twice
    // and only the second answer is wanted; finishing the first would paint
    // half the grid in a colour nobody asked for.
    if (job) job.cancelled = true;
    const mine = { cancelled: false, queue: names.slice(), painted: 0 };
    job = mine;
    const tick = () => {
      if (mine.cancelled) return;
      const until = performance.now() + FRAME_BUDGET_MS;
      while (mine.queue.length) {
        const name = mine.queue.shift();
        const btn = buttons.get(name);
        const cv = btn && btn.querySelector('canvas');
        if (!cv) continue;
        if (!isShowing(btn)) {
          pending.add(name);
          continue;
        }
        pending.delete(name);
        try {
          paint(cv, name);
          mine.painted++;
        } catch (e) {
          // One failing entry must not cost the others theirs, which is
          // exactly what a bare loop did.
          console.warn('preview failed for ' + name, e);
        }
        if (performance.now() >= until) break;
      }
      if (mine.queue.length) requestAnimationFrame(tick);
      else if (job === mine) job = null;
    };
    // Run the first slice now rather than on the next frame: repainting one
    // visible swatch is the common case and should not wait for a frame.
    tick();
    return mine;
  }

  return {
    buttons,

    /** Mark the selection: a name, or an array of them when `multi`. */
    mark(selected) {
      const chosen = multi
        ? (n) => selected.includes(n)
        : (n) => n === selected;
      for (const [name, btn] of buttons) {
        btn.setAttribute('aria-pressed', String(chosen(name)));
      }
    },

    /**
     * Repaint the thumbnails, but only the ones somebody can see.
     *
     * A thumbnail is not a stored image: it runs the real scene against
     * synthetic events for a hundred frames, which is what stops a card from
     * ever disagreeing with the canvas. That is affordable for the card you
     * are looking at and not for a panel full of them -- painting all of them
     * on load took eleven seconds before the page would respond, and the
     * panels start folded, so not one of those cards was on screen.
     *
     * Cards inside a folded panel have no layout box, so they are skipped and
     * remembered; unfolding the panel paints them. One failing entry must not
     * cost the others theirs, which is exactly what a bare loop did.
     */
    repaint(paint) {
      return walk(paint, [...buttons.keys()]).painted;
    },

    /** Paint the cards that were folded away when `repaint` last ran. */
    repaintPending(paint) {
      if (!pending.size) return 0;
      return walk(paint, [...pending]).painted;
    },

    /** True while some card is waiting for its panel to be opened. */
    get hasPending() {
      return pending.size > 0;
    },

    /** True while a repaint is still working its way across the grid. */
    get busy() {
      return job !== null;
    },
  };
}

/**
 * A bold title over a muted subtitle, as every card grid uses.
 *
 * Cards carrying a thumbnail wrap it in `.cap` so the text can be padded away
 * from the picture; plain cards take the two elements directly, since the
 * wrapper would be an inline box holding block children.
 */
export function caption(title, subtitle, { wrap = true } = {}) {
  const b = document.createElement('b');
  b.textContent = title;
  const s = document.createElement('span');
  s.textContent = subtitle;
  if (!wrap) {
    const frag = document.createDocumentFragment();
    frag.append(b, s);
    return frag;
  }
  const cap = document.createElement('span');
  cap.className = 'cap';
  cap.append(b, s);
  return cap;
}
