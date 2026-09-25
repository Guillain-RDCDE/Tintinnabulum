// A QR code, drawn rather than fetched.
//
// The wall label carries a code a visitor can point a phone at, and a label in
// a gallery must work when the gallery's network does not. Every hosted QR
// service is a request to somebody else's server at the moment somebody is
// standing in front of the picture, and an image that fails to load is a
// square of nothing under a title. So the code is built here, from the string,
// in about the space the request would have taken.
//
// Byte mode, error correction level M, versions 1 to 10 -- enough for any
// address this project produces, with the fifteen per cent of redundancy that
// survives a phone held at an angle in a dim room.
//
// The pieces, in the order they run:
//
//   1. the string becomes codewords: a mode, a length, the bytes, padding;
//   2. Reed-Solomon over GF(256) adds the correction codewords, block by
//      block, and the blocks are interleaved;
//   3. the matrix is laid out: finders, timing, alignment, format, version;
//   4. the bits are written in a zigzag up and down the free modules;
//   5. all eight masks are tried and the least ugly one wins, by the penalty
//      rules in the specification.
//
// It is checked against an independent implementation rather than against
// itself: the suite compares every matrix here, over a range of lengths and
// versions, with the one Python's `qrcode` produces for the same string.

// --- the tables that belong to the specification ---------------------------
//
// Level M only. Each entry: total codewords, correction codewords per block,
// and the blocks, as [count, data codewords] pairs.
const VERSIONS = [
  null,
  { total: 26, ec: 10, blocks: [[1, 16]] },
  { total: 44, ec: 16, blocks: [[1, 28]] },
  { total: 70, ec: 26, blocks: [[1, 44]] },
  { total: 100, ec: 18, blocks: [[2, 32]] },
  { total: 134, ec: 24, blocks: [[2, 43]] },
  { total: 172, ec: 16, blocks: [[4, 27]] },
  { total: 196, ec: 18, blocks: [[4, 31]] },
  { total: 242, ec: 22, blocks: [[2, 38], [2, 39]] },
  { total: 292, ec: 22, blocks: [[3, 36], [2, 37]] },
  { total: 346, ec: 26, blocks: [[4, 43], [1, 44]] },
];

/** Where the alignment patterns sit, by version. */
const ALIGN = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// --- GF(256), the field Reed-Solomon works in ------------------------------
//
// Multiplication is addition of logarithms, as it is in any field; these two
// tables are that logarithm and its inverse for the primitive polynomial the
// specification names, 0x11d.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `n` correction codewords. */
function generator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The correction codewords for one block: the remainder of a long division. */
function remainder(data, n) {
  const gen = generator(n);
  const rest = new Uint8Array(data.length + n);
  rest.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = rest[i];
    if (!factor) continue;
    for (let j = 0; j < gen.length; j++) rest[i + j] ^= mul(gen[j], factor);
  }
  return rest.slice(data.length);
}

// --- the string becomes codewords ------------------------------------------

/** UTF-8 bytes, because an address may carry anything. */
const bytesOf = (text) => new TextEncoder().encode(String(text));

/** The smallest version that holds this many bytes at level M. */
function versionFor(n) {
  for (let v = 1; v < VERSIONS.length; v++) {
    const def = VERSIONS[v];
    const data = def.blocks.reduce((sum, [count, size]) => sum + count * size, 0);
    // Four bits of mode, then eight or sixteen of length.
    const overhead = v < 10 ? 2 : 3;
    if (data >= n + overhead) return v;
  }
  return 0;
}

function codewordsFor(bytes, version) {
  const def = VERSIONS[version];
  const dataCount = def.blocks.reduce((sum, [count, size]) => sum + count * size, 0);
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);                                  // byte mode
  push(bytes.length, version < 10 ? 8 : 16);        // how many
  for (const b of bytes) push(b, 8);
  // The terminator, then up to a byte boundary, then the two pad codewords
  // the specification names, alternating, for as long as there is room.
  for (let i = 0; i < 4 && bits.length < dataCount * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = new Uint8Array(dataCount);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    out[i / 8] = byte;
  }
  for (let i = bits.length / 8, alt = 0; i < dataCount; i++, alt++) {
    out[i] = alt % 2 ? 0x11 : 0xec;
  }
  return out;
}

/** Data and correction codewords, in the interleaved order the matrix wants. */
function interleave(data, version) {
  const def = VERSIONS[version];
  const blocks = [];
  let at = 0;
  for (const [count, size] of def.blocks) {
    for (let i = 0; i < count; i++) {
      const slice = data.slice(at, at + size);
      at += size;
      blocks.push({ data: slice, ec: remainder(slice, def.ec) });
    }
  }
  const out = [];
  const widest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < widest; i++) {
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < def.ec; i++) {
    for (const b of blocks) out.push(b.ec[i]);
  }
  return out;
}

// --- the matrix ------------------------------------------------------------

/** BCH check bits, for the format and version words. */
function bch(value, generatorPoly, bits) {
  let rest = value << bits;
  const width = 32 - Math.clz32(generatorPoly);
  while (32 - Math.clz32(rest) >= width) rest ^= generatorPoly << (32 - Math.clz32(rest) - width);
  return (value << bits) | rest;
}

function blank(size) {
  const cells = [];
  for (let y = 0; y < size; y++) cells.push(new Int8Array(size).fill(-1));
  return cells;
}

/** The patterns a scanner finds the code by, and the modules it may not use. */
function patterns(m, version) {
  const size = m.length;
  const put = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < size && y < size) m[y][x] = v;
  };
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const edge = x === -1 || y === -1 || x === 7 || y === 7;
        const ring = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        put(ox + x, oy + y, edge ? 0 : ring || core ? 1 : 0);
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 ? 0 : 1;
    m[i][6] = i % 2 ? 0 : 1;
  }
  const centres = ALIGN[version];
  for (const cy of centres) {
    for (const cx of centres) {
      // Not where a finder already is.
      if ((cx < 9 && cy < 9) || (cx > size - 10 && cy < 9) || (cx < 9 && cy > size - 10)) continue;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          const ring = Math.abs(x) === 2 || Math.abs(y) === 2;
          put(cx + x, cy + y, ring || (x === 0 && y === 0) ? 1 : 0);
        }
      }
    }
  }
  m[size - 8][8] = 1;  // the dark module, always
  // Reserve the format areas, so the data placement steps over them.
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === -1) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === -1) m[size - 1 - i][8] = 0;
  }
  if (version >= 7) {
    const word = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const bit = (word >> i) & 1;
      m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }
}

/** Which modules carry data: everything the patterns did not claim. */
function place(m, codewords) {
  const size = m.length;
  let bit = 0;
  const next = () => {
    const byte = codewords[bit >> 3];
    const value = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
    bit++;
    return value;
  };
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;   // the vertical timing line is not a column
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (m[y][x] !== -1) continue;
        m[y][x] = next();
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** How ugly a masked matrix is, by the four rules in the specification. */
function penalty(m) {
  const size = m.length;
  let score = 0;
  const run = (get) => {
    for (let a = 0; a < size; a++) {
      let last = -1;
      let length = 0;
      for (let b = 0; b < size; b++) {
        const v = get(a, b);
        if (v === last) length++;
        else {
          if (length >= 5) score += 3 + (length - 5);
          last = v;
          length = 1;
        }
      }
      if (length >= 5) score += 3 + (length - 5);
    }
  };
  run((a, b) => m[a][b]);
  run((a, b) => m[b][a]);
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = m[y][x];
      if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
    }
  }
  // The finder-like sequence: dark-light-dark-dark-dark-light-dark in the
  // 1:1:3:1:1 ratio, with four light modules on one side of it. Eleven
  // modules, and they must all be inside the matrix -- reading past the edge
  // as "light" is a tempting shortcut that scores patterns the specification
  // does not, and it chose a different mask from every other encoder.
  const LEFT = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const RIGHT = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let a = 0; a < size; a++) {
    const row = [];
    const col = [];
    for (let b = 0; b < size; b++) {
      row.push(m[a][b]);
      col.push(m[b][a]);
    }
    for (const cells of [row, col]) {
      for (let i = 0; i + 11 <= size; i++) {
        if (LEFT.every((v, k) => cells[i + k] === v)) score += 40;
        if (RIGHT.every((v, k) => cells[i + k] === v)) score += 40;
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dark += m[y][x];
  const part = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(part - 50) / 5) * 10;
  return score;
}

function writeFormat(m, mask) {
  const size = m.length;
  // Level M is 00, and the whole fifteen-bit word is then masked with the
  // constant the specification names, so an all-zero format is not all-zero.
  const word = (bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412) & 0x7fff;
  const bitAt = (i) => (word >> i) & 1;
  // The two copies, in the places the specification puts them -- column eight
  // downwards for the first, then the bottom-left column and the right of row
  // eight for the second. Written here as [row][column], which is the
  // transpose of how the specification writes it, and getting that the wrong
  // way round is silent: the code still scans as a code and decodes as noise.
  for (let i = 0; i <= 5; i++) m[i][8] = bitAt(i);
  m[7][8] = bitAt(6);
  m[8][8] = bitAt(7);
  m[8][7] = bitAt(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = bitAt(i);
  for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = bitAt(i);
  for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = bitAt(i);
}

/**
 * The code for a string, as rows of 0 and 1.
 *
 * @param {string} text
 * @returns {number[][]} square matrix, no quiet zone
 */
export function qrMatrix(text) {
  const { laid, fixed } = build(text);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = masked(laid, fixed, mask);
    const score = penalty(m);
    if (!best || score < best.score) best = { score, m };
  }
  return best.m.map((row) => Array.from(row));
}

/** Everything but the mask: the patterns, the reserved modules, the data. */
function build(text) {
  const bytes = bytesOf(text);
  const version = versionFor(bytes.length);
  if (!version) throw new Error('qr: too much text for this encoder');
  const codewords = interleave(codewordsFor(bytes, version), version);
  const size = version * 4 + 17;
  const reserved = blank(size);
  patterns(reserved, version);
  const fixed = reserved.map((row) => Int8Array.from(row));
  const laid = reserved.map((row) => Int8Array.from(row));
  place(laid, codewords);
  return { laid, fixed, version, size };
}

function masked(laid, fixed, mask) {
  const m = laid.map((row, y) => Int8Array.from(row, (v, x) => (fixed[y][x] === -1 && MASKS[mask](x, y) ? v ^ 1 : v)));
  writeFormat(m, mask);
  return m;
}

/**
 * One particular mask, whether or not it is the one that would be chosen.
 *
 * For the suite, which compares all eight against an independent encoder: a
 * check that only ever saw the chosen mask would miss seven eighths of the
 * placement, and which mask is chosen is a matter of taste between encoders --
 * they all decode.
 */
export function qrMatrixMasked(text, mask) {
  const { laid, fixed } = build(text);
  return masked(laid, fixed, mask & 7).map((row) => Array.from(row));
}

/** What each mask would score, by the rules in the specification. */
export function qrScores(text) {
  const { laid, fixed } = build(text);
  return Array.from({ length: 8 }, (_, mask) => penalty(masked(laid, fixed, mask)));
}

/**
 * Draw a code, in ink on paper, at whatever size it is given.
 *
 * Rounded to whole modules: a QR drawn at a fractional module size is a QR
 * with soft edges, and a phone reading one from across a room needs the edges.
 */
export function drawQr(ctx, text, { x = 0, y = 0, size = 120, ink = '#000', paper = '#fff', quiet = 2 } = {}) {
  const m = qrMatrix(text);
  const modules = m.length + quiet * 2;
  const step = Math.max(1, Math.floor(size / modules));
  const side = step * modules;
  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(x, y, side, side);
  ctx.fillStyle = ink;
  for (let row = 0; row < m.length; row++) {
    for (let col = 0; col < m.length; col++) {
      if (m[row][col]) ctx.fillRect(x + (col + quiet) * step, y + (row + quiet) * step, step, step);
    }
  }
  ctx.restore();
  return side;
}
