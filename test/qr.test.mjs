// The QR encoder, against an encoder that is not this one.
//
// A code that scans is the only thing that matters here, and "it looks like a
// QR code" is not a check: a wrong mask, a transposed format word or a mislaid
// codeword all produce something square and black and unreadable. Both of
// those faults were in the first version of this encoder, and both left a
// symbol that looked perfectly convincing.
//
// So every matrix this encoder makes was compared, module for module, with
// the one Python's `qrcode` package produces for the same string -- all eight
// masks of each, which is the whole placement rather than the eighth of it
// that happens to be chosen. Kept here is a digest of each of those matrices.
// To regenerate, with `pip install qrcode`:
//
//   q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,
//                     box_size=1, border=0)
//   q.add_data(text.encode()); q.best_fit(); q.makeImpl(False, mask)
//
// The mask this encoder chooses is deliberately NOT asserted against that
// package: it scores the candidates with the format modules left blank, which
// is a quirk of that implementation rather than the specification, and every
// mask decodes either way. What is asserted is that the one chosen here is the
// lowest-scoring by the rules in the specification.

import { qrMatrix, qrMatrixMasked, qrScores } from '../src/visual/qr.js';

let fails = 0;
const failedNames = [];
const ok = (name, cond, extra = '') => {
  if (!cond) {
    fails++; failedNames.push(name);
    console.log('FAIL  ' + name + (extra ? '  ' + extra : ''));
  } else console.log('ok    ' + name + (extra ? '  ' + extra : ''));
};

/** FNV-1a over the rows, which is how the fixtures were made. */
function digest(rows) {
  let h = 0x811c9dc5;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      h ^= row.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

// [text, [digest per mask, 0..7]]
const FIXTURES = [
  ["x", ['3a2d9a2f', '2dec510d', '866d408d', 'a24d26f7', 'b0a656a9', '29d74bf7', '53b60da3', '8589aca1']],
  ["https://guillain-rdcde.github.io/Tintinnabulum/demo/#work=lanterns", ['2bf35a29', 'a85da0ab', '2db4e877', 'd029fd55', '120f0e3b', '50bfaaae', 'ab5c2245', '42d551bf']],
  ["aaaaaaaaaaaaaa", ['10247911', '6cdef0bb', 'ebdb94a3', '94e3f6a9', '5906697b', '1a3f89d9', 'c5ef8c59', '78b9cafb']],
  ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ['6b70cbfd', '3c98e0b3', '82532a7a', '6ab94762', '4ca9999f', '3b72e235', '7282d166', '6e6e814c']],
  ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ['1eac7be1', '96363ae6', 'd74ce253', 'de15d24d', 'a9915fdb', '46b58b35', 'f61e4101', '3cf5742b']],
  ["Cafe des evenements - 432 Hz", ['cb292d17', '59b50b51', 'bb021e80', '353b7e63', 'd0d62ba4', 'afd74218', 'eccfbebb', 'b2cdf4d5']],
  ["https://guillain-rdcde.github.io/Tintinnabulum/demo/project.html?work=coral&feed=wikipedia&full=1", ['4f2bb6ef', '9e2437c9', 'f24d461c', 'e80be477', 'd3e64174', '50f06554', 'cc7bb753', 'db9dcf29']],
];

let agreed = 0;
let total = 0;
for (const [text, digests] of FIXTURES) {
  for (let mask = 0; mask < 8; mask++) {
    total++;
    const rows = qrMatrixMasked(text, mask).map((r) => r.join(''));
    if (digest(rows) === digests[mask]) agreed++;
    else ok(`mask ${mask} of ${JSON.stringify(text.slice(0, 24))}`, false, `${digest(rows)} vs ${digests[mask]}`);
  }
}
ok('every matrix matches an independent encoder, mask by mask', agreed === total, `${agreed} of ${total}`);

// Shape, and the things a scanner looks for first.
for (const [text] of FIXTURES) {
  const m = qrMatrix(text);
  const size = m.length;
  const version = (size - 17) / 4;
  const square = m.every((row) => row.length === size);
  const binary = m.every((row) => row.every((v) => v === 0 || v === 1));
  const finders = [[0, 0], [size - 7, 0], [0, size - 7]].every(([ox, oy]) =>
    m[oy + 3][ox + 3] === 1 && m[oy + 1][ox + 1] === 0 && m[oy][ox] === 1);
  const timing = m[6].every((v, i) => (i < 8 || i > size - 9 ? true : v === (i % 2 ? 0 : 1)));
  const dark = m[size - 8][8] === 1;
  ok(`the code for ${JSON.stringify(text.slice(0, 20))} is a well-formed symbol`,
     Number.isInteger(version) && version >= 1 && version <= 10 && square && binary && finders && timing && dark,
     `version ${version}, ${size}x${size}`);
}

// The mask that is chosen is the one the specification's rules prefer.
let chosenRight = 0;
for (const [text] of FIXTURES) {
  const scores = qrScores(text);
  const best = scores.indexOf(Math.min(...scores));
  const chosen = qrMatrix(text).map((r) => r.join('')).join();
  const wanted = qrMatrixMasked(text, best).map((r) => r.join('')).join();
  if (chosen === wanted) chosenRight++;
}
ok('the mask chosen is the least ugly one', chosenRight === FIXTURES.length, `${chosenRight} of ${FIXTURES.length}`);

// The same string gives the same code every time: a label that changed when
// nothing had changed would be a label nobody could trust.
const twice = JSON.stringify(qrMatrix('https://example.org/x')) === JSON.stringify(qrMatrix('https://example.org/x'));
ok('the same string always gives the same code', twice);

// Beyond what it can hold, it says so rather than drawing a square of noise.
let refused = false;
try {
  qrMatrix('a'.repeat(400));
} catch (e) {
  refused = /too much text/.test(e.message);
}
ok('too much text is refused rather than mangled', refused);

console.log(fails ? `\n${fails} FAILURE(S): ${failedNames.join(' | ')}` : '\nall qr checks passed');
process.exit(fails ? 1 : 0);
