// A programme: which work hangs, for how long, and when the room is open.
//
// Exhibition mode moved to the next work every so many minutes, picked from
// whatever the filter was showing. That is a screensaver. A room that shows
// work has a programme: these pieces, in this order, each for as long as it
// deserves, from opening until closing, and dark in between.
//
// The position in the programme is a function of the clock, not of when the
// window happened to open. That is the whole design decision here, and it buys
// three things at once:
//
//   - two screens in the same room, started an hour apart, hang the same work
//     at the same moment, with no channel between them;
//   - a machine rebooted overnight comes back where the programme is now,
//     rather than restarting the show at whatever the first piece was;
//   - anybody can work out what will be on the wall at four o'clock.
//
// Everything here is arithmetic on a date and a list, so it is checked in
// Node, without a browser: see test/show.test.mjs.

/** Minutes from midnight, from "HH:MM". */
export function parseClock(text) {
  const m = /^\s*(\d{1,2})\s*[:h.]\s*(\d{2})\s*$/.exec(String(text || ''));
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "HH:MM", from minutes from midnight. */
export const formatClock = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * A programme, from `work:minutes` pairs separated by commas.
 *
 * `lanterns:20,coral:10` is twenty minutes of one and ten of the other, then
 * round again. A pair with no minutes takes the default. Anything that is not
 * a known work is dropped rather than shown as a blank: a typo in an address
 * taped to the back of a screen should cost one piece, not the whole evening.
 *
 * @param {string} text
 * @param {(name: string) => boolean} [known]
 * @param {number} [fallback] minutes for an entry that gives none
 */
export function parseShow(text, known = () => true, fallback = 10) {
  return String(text || '')
    .split(',')
    .map((part) => {
      const [name, minutes] = part.split(':');
      const work = (name || '').trim();
      const length = Number(minutes);
      if (!work || !known(work)) return null;
      return { work, minutes: Number.isFinite(length) && length > 0 ? Math.min(720, length) : fallback };
    })
    .filter(Boolean);
}

/** The same, back as a string an address can carry. */
export const formatShow = (programme) =>
  programme.map((p) => `${p.work}:${Math.round(p.minutes)}`).join(',');

/** How long one round of the programme takes, in minutes. */
export const showLength = (programme) => programme.reduce((sum, p) => sum + p.minutes, 0);

/**
 * Opening hours, from "10:00-18:00". Missing or unreadable means always open.
 *
 * A closing time before the opening time is a room that stays open across
 * midnight, which is what a window onto a street does.
 */
export function parseHours(text) {
  const parts = String(text || '').split('-');
  if (parts.length !== 2) return null;
  const open = parseClock(parts[0]);
  const close = parseClock(parts[1]);
  if (open === null || close === null || open === close) return null;
  return { open, close };
}

export const formatHours = (hours) => (hours ? `${formatClock(hours.open)}-${formatClock(hours.close)}` : '');

/** Whether the room is open at that moment. */
export function isOpen(hours, date = new Date()) {
  if (!hours) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  return hours.open < hours.close
    ? now >= hours.open && now < hours.close
    : now >= hours.open || now < hours.close;
}

/** How many minutes until the room opens again; 0 if it is open now. */
export function untilOpen(hours, date = new Date()) {
  if (!hours || isOpen(hours, date)) return 0;
  const now = date.getHours() * 60 + date.getMinutes();
  return ((hours.open - now) % 1440 + 1440) % 1440;
}

/**
 * Which work hangs now, and for how much longer.
 *
 * Read from the clock: minutes since midnight, folded into the length of one
 * round. Two screens agree without talking to each other, and a machine that
 * reboots comes back where the programme is rather than at its first piece.
 *
 * @returns {?{index: number, work: string, minutes: number, remaining: number}}
 */
export function showAt(programme, date = new Date()) {
  const total = showLength(programme);
  if (!programme.length || total <= 0) return null;
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  let at = minutes % total;
  for (let i = 0; i < programme.length; i++) {
    if (at < programme[i].minutes) {
      return { index: i, work: programme[i].work, minutes: programme[i].minutes, remaining: programme[i].minutes - at };
    }
    at -= programme[i].minutes;
  }
  const last = programme.length - 1;
  return { index: last, work: programme[last].work, minutes: programme[last].minutes, remaining: 0 };
}

/** The whole programme in words, for a panel or a label. */
export function describeShow(programme, hours, titleOf = (n) => n) {
  if (!programme.length) return 'Nothing programmed.';
  const round = showLength(programme);
  const list = programme.map((p) => `${titleOf(p.work)} (${Math.round(p.minutes)} min)`).join(', ');
  const when = hours ? `, ${formatClock(hours.open)} to ${formatClock(hours.close)}` : ', all day';
  return `${list}. One round takes ${round} minutes${when}.`;
}
