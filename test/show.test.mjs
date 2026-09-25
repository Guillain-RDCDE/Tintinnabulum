// The programme: arithmetic on a clock and a list, so it is checked here
// rather than in a browser.
//
// The property that matters is the one the design turns on: what hangs is a
// function of the time of day and nothing else. Two screens started hours
// apart agree, and a machine rebooted overnight comes back where the
// programme is rather than at its first piece. Both are asserted below by
// asking the same question of the same clock from different directions.

import {
  parseClock, formatClock, parseShow, formatShow, showLength,
  parseHours, formatHours, isOpen, untilOpen, showAt, describeShow,
} from '../src/show.js';
import { WORKS } from '../src/works.js';

let fails = 0;
const failedNames = [];
const ok = (name, cond, extra = '') => {
  if (!cond) {
    fails++; failedNames.push(name);
    console.log('FAIL  ' + name + (extra ? '  ' + extra : ''));
  } else console.log('ok    ' + name + (extra ? '  ' + extra : ''));
};

const at = (h, m = 0, s = 0) => new Date(2026, 8, 25, h, m, s);

// --- the clock ---
ok('a time reads as minutes from midnight', parseClock('10:00') === 600 && parseClock('9:05') === 545 && parseClock('23:59') === 1439);
ok('and back again', formatClock(600) === '10:00' && formatClock(545) === '09:05' && formatClock(1439) === '23:59');
ok('nonsense is refused rather than guessed',
   parseClock('25:00') === null && parseClock('10:60') === null && parseClock('') === null && parseClock('half past') === null);

// --- the programme ---
const known = (n) => Boolean(WORKS[n]);
const show = parseShow('lanterns:20,coral:10,currents:30', known);
ok('a programme is works and minutes, in order',
   show.length === 3 && show[0].work === 'lanterns' && show[0].minutes === 20 && show[2].minutes === 30,
   formatShow(show));
ok('and it survives a round trip', formatShow(parseShow(formatShow(show), known)) === formatShow(show));
ok('a work that does not exist is dropped, not hung blank',
   parseShow('lanterns:5,nosuchwork:5,coral:5', known).length === 2);
ok('an entry with no minutes takes the default', parseShow('lanterns', known, 7)[0].minutes === 7);
ok('a round is the sum of its parts', showLength(show) === 60);

// --- what hangs now, from the clock alone ---
// One round of sixty minutes starting at midnight: 0-20 lanterns, 20-30
// coral, 30-60 currents, and the same in every hour of the day.
ok('the first piece hangs at the top of the hour', showAt(show, at(10, 5)).work === 'lanterns');
ok('the second in its own window', showAt(show, at(10, 25)).work === 'coral');
ok('the third to the end of the round', showAt(show, at(10, 59)).work === 'currents');
ok('and the round begins again', showAt(show, at(11, 1)).work === 'lanterns');
ok('what remains is counted down', Math.round(showAt(show, at(10, 15)).remaining) === 5);
ok('an empty programme hangs nothing', showAt([], at(10)) === null && showAt(parseShow('', known), at(10)) === null);

// The property the design exists for: the same clock gives the same work,
// however the wall arrived at that moment.
let agree = 0;
for (let m = 0; m < 1440; m += 7) {
  const when = at(Math.floor(m / 60), m % 60);
  if (showAt(show, when).work === showAt(parseShow(formatShow(show), known), when).work) agree++;
}
ok('two screens reading the same clock hang the same work', agree === Math.ceil(1440 / 7), `${agree} moments`);

// --- opening hours ---
const day = parseHours('10:00-18:00');
ok('opening hours read as a pair', day.open === 600 && day.close === 1080 && formatHours(day) === '10:00-18:00');
ok('the room is open inside them', isOpen(day, at(10, 0)) && isOpen(day, at(17, 59)));
ok('and shut outside them', !isOpen(day, at(9, 59)) && !isOpen(day, at(18, 0)) && !isOpen(day, at(3)));
const night = parseHours('20:00-02:00');
ok('a room that stays open past midnight does',
   isOpen(night, at(23)) && isOpen(night, at(1)) && !isOpen(night, at(3)) && !isOpen(night, at(19, 59)));
ok('no hours at all means always open', isOpen(parseHours(''), at(4)) && isOpen(null, at(4)));
ok('unreadable hours are refused rather than half-applied',
   parseHours('10:00') === null && parseHours('ten to six') === null && parseHours('10:00-10:00') === null);
ok('it says how long until it opens',
   untilOpen(day, at(9, 30)) === 30 && untilOpen(day, at(19, 0)) === 900 && untilOpen(day, at(11)) === 0);

// --- said in words ---
const words = describeShow(show, day, (n) => WORKS[n].title);
ok('a programme can be read aloud',
   /Lanterns on the lake \(20 min\)/.test(words) && /60 minutes/.test(words) && /10:00 to 18:00/.test(words), words);
ok('and an empty one says so', /Nothing programmed/.test(describeShow([], null)));

console.log(fails ? `\n${fails} FAILURE(S): ${failedNames.join(' | ')}` : '\nall show checks passed');
process.exit(fails ? 1 : 0);
