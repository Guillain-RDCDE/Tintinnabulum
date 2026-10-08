// Natural media: pencils, charcoal, markers, a spray, watercolour, washes and
// hatching, drawn the way p5.brush draws them, on a plain 2D canvas.
//
// This project draws everything with the Canvas 2D API and carries no
// dependencies, so p5.brush itself -- which needs WebGL2, and p5.js for its
// main build -- is not loaded. What is taken from it is the method, ported:
//
//   A stroke is not a line. It is a walk along the path in steps a fraction
//   of a pixel long, and at each step a tiny dot is put down or not, by the
//   brush's grain and the pressure at that point of the stroke; scattered off
//   the path by the brush's vibration, sized and weighted by the pressure,
//   whose curve swells and fades along the stroke as a hand's does. The dots
//   go into a mask, not onto the picture.
//
//   A watercolour fill is Tyler Hobbs's method (see "A Generative Approach to
//   Simulating Watercolor Paints", 2017): the shape is deformed again and
//   again by midpoint displacement into a ragged edge, and laid down as many
//   layers at an opacity of a percent or two, at three sizes, with a few
//   denser layers for the pooled edge and circles rubbed out of it for the
//   texture of the paper.
//
//   A mask is put onto the picture by mixing, not by painting over: every
//   pixel becomes the Kubelka-Munk mix of what was there and the pigment, in
//   the amount the mask holds there -- the method of spectral.js -- so blue
//   over yellow is a green and not a grey, and a glaze deepens what it lies
//   on. Where a pencil mask is dense the pigment darkens, as graphite does
//   when it is pressed; where a wash mask changes fast it darkens too, which
//   is the edge a wash dries to.
//
// Where the port departs from p5.brush it is for speed on a CPU, which is
// where a 2D canvas mixes pixels. A wash's mask is laid in a typed array by
// a scanline fill rather than on a canvas -- its polygons cross themselves
// hundreds of times, which a canvas fills slowly -- and at a resolution tied
// to the brush rather than the screen, since it is softened before use. The
// mix is made against the colour underneath rounded to one of 32 levels a
// channel, with the remainder carried through, and remembered. And a wash is laid as
// a generator, a layer or a band of rows a step, so a picture can spread
// one over several frames. A large wash costs about a third of what it did
// on a canvas, and no frame has to pay for more than a slice of it.
//
// p5.brush is by Alejandro Campos Uribe, spectral.js by Ronald van Wijnen,
// both MIT; see NOTICE. The brush table, the pressure model, the fill's
// growth and layering and the blend rules follow p5.brush 2.x closely, and
// the spectral tables below are spectral.js's, as p5.brush ships them.

// Seven reflectance curves over 38 bands, 380 to 750 nm, from spectral.js
// (Ronald van Wijnen, MIT) as p5.brush ships them in its blend shader.
const BASIS = {
  W: [1.0011607271876400, 1.0011606515972800, 1.0011603192274700, 1.0011586727078900, 1.0011525984455200, 1.0011325252899800, 1.0010850066332700, 1.0009968788945300, 1.0008652515227400, 1.0006962900094000, 1.0005049611488800, 1.0003080818799200, 1.0001196660201300, 0.9999527659684070, 0.9998218368992970, 0.9997386095575930, 0.9997095516396120, 0.9997319302106270, 0.9997994363461950, 0.9999003303166710, 1.0000204065261100, 1.0001447879365800, 1.0002599790341200, 1.0003557969708900, 1.0004275378026900, 1.0004762334488800, 1.0005072096750800, 1.0005251915637300, 1.0005350960689600, 1.0005402209748200, 1.0005427281678400, 1.0005438956908700, 1.0005444821215100, 1.0005447695999200, 1.0005448988776200, 1.0005449625468900, 1.0005449892705800, 1.0005449969930000],
  C: [0.9705850013229620, 0.9705924981434250, 0.9706253487298910, 0.9707868061190170, 0.9713686732282480, 0.9731632306212520, 0.9767402231587650, 0.9815876054913770, 0.9862802656529490, 0.9899491476891340, 0.9924927015384200, 0.9941456804052560, 0.9951839750332120, 0.9957567501108180, 0.9959128182867100, 0.9956061578345280, 0.9945976009618540, 0.9922157154923700, 0.9862364527832490, 0.9679433372645410, 0.8912850042449430, 0.5362024778620530, 0.1541081190018780, 0.0574575093228929, 0.0315349873107007, 0.0222633920086335, 0.0182022841492439, 0.0162990559732640, 0.0153656239334613, 0.0149111568733976, 0.0146954339898235, 0.0145964146717719, 0.0145470156699655, 0.0145228771899495, 0.0145120341118965, 0.0145066940939832, 0.0145044507314479, 0.0145038009464639],
  M: [0.9906735573199880, 0.9906715249619790, 0.9906625823534210, 0.9906181076447950, 0.9904514808787100, 0.9898710814002040, 0.9882866087596400, 0.9842906927975040, 0.9739349056253060, 0.9418178384601450, 0.8173903261951560, 0.4324728050657290, 0.1384539782588700, 0.0537347216940033, 0.0292174996673231, 0.0213136517508590, 0.0201349530181136, 0.0241323096280662, 0.0372236145223627, 0.0760506552706601, 0.2053754719423990, 0.5412689034604390, 0.8158416850864860, 0.9128177041239760, 0.9463398301669620, 0.9599276963319910, 0.9662605952303120, 0.9693259700584240, 0.9708545367213990, 0.9716050665281280, 0.9719627697573920, 0.9721272722745090, 0.9722094177458120, 0.9722495776784240, 0.9722676219987420, 0.9722765094621500, 0.9722802433068740, 0.9722813248265600],
  Y: [0.0210523371789306, 0.0210564627517414, 0.0210746178695038, 0.0211649058448753, 0.0215027957272504, 0.0226738799041561, 0.0258235649693629, 0.0334879385639851, 0.0519069663740307, 0.1007490148334730, 0.2391298997068470, 0.5348043122727480, 0.7978075786430300, 0.9114498940673840, 0.9537979630045070, 0.9712416154654290, 0.9793031238075880, 0.9833801195075750, 0.9854612465677550, 0.9864350469766050, 0.9867382506701410, 0.9866178824450320, 0.9862777767586430, 0.9858605924440560, 0.9854749276762100, 0.9851769347655580, 0.9849715740141810, 0.9848463034157120, 0.9847753518111990, 0.9847380666252650, 0.9847196483117650, 0.9847110233919390, 0.9847066833006760, 0.9847045543930910, 0.9847035963093700, 0.9847031240775520, 0.9847029256150900, 0.9847028681227950],
  R: [0.0315605737777207, 0.0315520718330149, 0.0315148215513658, 0.0313318044982702, 0.0306729857725527, 0.0286480476989607, 0.0246450407045709, 0.0192960753663651, 0.0142066612220556, 0.0102942608878609, 0.0076191460521811, 0.0058980410835420, 0.0048233247781713, 0.0042298748350633, 0.0040599171299341, 0.0043533695594676, 0.0053434425970201, 0.0076917201010463, 0.0135969795736536, 0.0316975442661115, 0.1078611963552490, 0.4638126031687040, 0.8470554052720110, 0.9431854093939180, 0.9688621506965580, 0.9780306674736030, 0.9820436438543060, 0.9839236237187070, 0.9848454841543820, 0.9852942758145960, 0.9855072952198250, 0.9856050715398370, 0.9856538499335780, 0.9856776850338830, 0.9856883918061220, 0.9856936646900310, 0.9856958798482050, 0.9856965214637620],
  G: [0.0095560747554212, 0.0095581580120851, 0.0095673245444588, 0.0096129126297349, 0.0097837090401843, 0.0103786227058710, 0.0120026452378567, 0.0160977721473922, 0.0267061902231680, 0.0595555440185881, 0.1860398265328260, 0.5705798201161590, 0.8614677684002920, 0.9458790897676580, 0.9704654864743050, 0.9784136302844500, 0.9795890314112240, 0.9755335369086320, 0.9622887553978130, 0.9231215745131200, 0.7934340189431110, 0.4592701359024290, 0.1855741036663030, 0.0881774959955372, 0.0543630228766700, 0.0406288447060719, 0.0342215204316970, 0.0311185790956966, 0.0295708898336134, 0.0288108739348928, 0.0284486271324597, 0.0282820301724731, 0.0281988376490237, 0.0281581655342037, 0.0281398910216386, 0.0281308901665811, 0.0281271086805816, 0.0281260133612096],
  B: [0.9794047525020140, 0.9794007068431300, 0.9793829034702610, 0.9792943649455940, 0.9789630146085700, 0.9778144666940430, 0.9747243211338360, 0.9671984823439730, 0.9490796575305750, 0.9008501289409770, 0.7631504454622400, 0.4659221716493190, 0.2012632804510050, 0.0877524413419623, 0.0457176793291679, 0.0284706050521843, 0.0205271767569850, 0.0165302792310211, 0.0145135107212858, 0.0136003508637687, 0.0133604258769571, 0.0135488943145680, 0.0139594356366992, 0.0144434255753570, 0.0148854440621406, 0.0152254296999746, 0.0154592848180209, 0.0156018026485961, 0.0156824871281936, 0.0157248764360615, 0.0157458108784121, 0.0157556123350225, 0.0157605443964911, 0.0157629637515278, 0.0157640525629106, 0.0157645892329510, 0.0157648147772649, 0.0157648801149616],
};
// CIE 1931 colour matching, weighted by D65, one triple per band.
const CMF = [0.0000646919989576, 0.0000018442894440, 0.0003050171476380, 0.0002194098998132, 0.0000062053235865, 0.0010368066663574, 0.0011205743509343, 0.0000310096046799, 0.0053131363323992, 0.0037666134117111, 0.0001047483849269, 0.0179543925899536, 0.0118805536037990, 0.0003536405299538, 0.0570775815345485, 0.0232864424191771, 0.0009514714056444, 0.1136516189362870, 0.0345594181969747, 0.0022822631748318, 0.1733587261835500, 0.0372237901162006, 0.0042073290434730, 0.1962065755586570, 0.0324183761091486, 0.0066887983719014, 0.1860823707062960, 0.0212332056093810, 0.0098883960193565, 0.1399504753832070, 0.0104909907685421, 0.0152494514496311, 0.0891745294268649, 0.0032958375797931, 0.0214183109449723, 0.0478962113517075, 0.0005070351633801, 0.0334229301575068, 0.0281456253957952, 0.0009486742057141, 0.0513100134918512, 0.0161376622950514, 0.0062737180998318, 0.0704020839399490, 0.0077591019215214, 0.0168646241897775, 0.0878387072603517, 0.0042961483736618, 0.0286896490259810, 0.0942490536184085, 0.0020055092122156, 0.0426748124691731, 0.0979566702718931, 0.0008614711098802, 0.0562547481311377, 0.0941521856862608, 0.0003690387177652, 0.0694703972677158, 0.0867810237486753, 0.0001914287288574, 0.0830531516998291, 0.0788565338632013, 0.0001495555858975, 0.0861260963002257, 0.0635267026203555, 0.0000923109285104, 0.0904661376847769, 0.0537414167568200, 0.0000681349182337, 0.0850038650591277, 0.0426460643574120, 0.0000288263655696, 0.0709066691074488, 0.0316173492792708, 0.0000157671820553, 0.0506288916373645, 0.0208852059213910, 0.0000039406041027, 0.0354739618852640, 0.0138601101360152, 0.0000015840125870, 0.0214682102597065, 0.0081026402038399, 0.0000000000000000, 0.0125164567619117, 0.0046301022588030, 0.0000000000000000, 0.0068045816390165, 0.0024913800051319, 0.0000000000000000, 0.0034645657946526, 0.0012593033677378, 0.0000000000000000, 0.0014976097506959, 0.0005416465221680, 0.0000000000000000, 0.0007697004809280, 0.0002779528920067, 0.0000000000000000, 0.0004073680581315, 0.0001471080673854, 0.0000000000000000, 0.0001690104031614, 0.0000610327472927, 0.0000000000000000, 0.0000952245150365, 0.0000343873229523, 0.0000000000000000, 0.0000490309872958, 0.0000177059860053, 0.0000000000000000, 0.0000199961492222, 0.0000072209749130, 0.0000000000000000];
const XYZ_RGB = [3.2409699419045200, -1.537383177570090, -0.4986107602930030, -0.9692436362808790, 1.875967501507720, 0.0415550574071756, 0.0556300796969936, -0.203976958888976, 1.0569715142428700];

// --- spectral mixing ------------------------------------------------------------------

const BANDS = 38;
const EPS = 0.0001;
const toLinear = (v) => (v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v) => (v < 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** A colour as a pigment: its reflectance over the bands, its K/S, and its luminance. */
const PIGMENTS = new Map();
function pigmentOf(packed) {
  let p = PIGMENTS.get(packed);
  if (p) return p;
  const r = toLinear(((packed >> 16) & 255) / 255);
  const g = toLinear(((packed >> 8) & 255) / 255);
  const b = toLinear((packed & 255) / 255);
  const w = Math.min(r, g, b);
  const lr = r - w;
  const lg = g - w;
  const lb = b - w;
  const c = Math.min(lg, lb);
  const m = Math.min(lr, lb);
  const y = Math.min(lr, lg);
  const rr = Math.min(Math.max(0, lr - lb), Math.max(0, lr - lg));
  const gg = Math.min(Math.max(0, lg - lb), Math.max(0, lg - lr));
  const bb = Math.min(Math.max(0, lb - lg), Math.max(0, lb - lr));
  const ks = new Float64Array(BANDS);
  let lum = 0;
  for (let i = 0; i < BANDS; i++) {
    const R = Math.max(EPS, w * BASIS.W[i] + c * BASIS.C[i] + m * BASIS.M[i] + y * BASIS.Y[i] + rr * BASIS.R[i] + gg * BASIS.G[i] + bb * BASIS.B[i]);
    ks[i] = ((1 - R) * (1 - R)) / (2 * R);
    lum += R * CMF[i * 3 + 1];
  }
  p = { ks, lum };
  if (PIGMENTS.size > 4096) PIGMENTS.clear();
  PIGMENTS.set(packed, p);
  return p;
}

/** Two pigments mixed, `t` of the second, as packed sRGB. */
function mixPacked(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const p1 = pigmentOf(a);
  const p2 = pigmentOf(b);
  const c1 = (1 - t) * (1 - t) * p1.lum;
  const c2 = t * t * p2.lum;
  const total = c1 + c2;
  if (!(total > 0)) return t < 0.5 ? a : b;
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let i = 0; i < BANDS; i++) {
    const ks = (p1.ks[i] * c1 + p2.ks[i] * c2) / total;
    const R = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    X += R * CMF[i * 3];
    Y += R * CMF[i * 3 + 1];
    Z += R * CMF[i * 3 + 2];
  }
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const v = toSrgb(XYZ_RGB[k * 3] * X + XYZ_RGB[k * 3 + 1] * Y + XYZ_RGB[k * 3 + 2] * Z);
    out[k] = Math.round(255 * (v < 0 ? 0 : v > 1 ? 1 : v));
  }
  return (out[0] << 16) | (out[1] << 8) | out[2];
}

/**
 * Mixes remembered: a sheet has a few thousand colours on it and a wash is
 * mixed into it a pixel at a time, so nearly every mix has been made before.
 * A table indexed by a hash of what was mixed, colour underneath, pigment and
 * amount in sixty-thirds, where a new mix simply replaces whatever was there.
 */
const MIX_BITS = 18;
let MIX_KEY = null;
let MIX_PIG = null;
let MIX_OUT = null;
function mixCached(bg, pig, q) {
  if (!MIX_KEY) {
    MIX_KEY = new Int32Array(1 << MIX_BITS);
    MIX_PIG = new Int32Array(1 << MIX_BITS).fill(-1);
    MIX_OUT = new Int32Array(1 << MIX_BITS);
  }
  const key = bg * 64 + q;
  const h = Math.imul(key ^ Math.imul(pig, 0x27d4eb2d), 0x9e3779b1) >>> (32 - MIX_BITS);
  if (MIX_KEY[h] === key && MIX_PIG[h] === pig) return MIX_OUT[h];
  const out = mixPacked(bg, pig, q / 63);
  MIX_KEY[h] = key;
  MIX_PIG[h] = pig;
  MIX_OUT[h] = out;
  return out;
}

/** x / 255, rounded, for x up to 255 * 255: how a canvas multiplies two alphas. */
const div255 = (x) => (x + 128 + ((x + 128) >> 8)) >> 8;

/** How many pixels of a wash are mixed in before a step says it has done enough. */
const BAND = 120000;

/**
 * One pixel of an ImageData mixed with a pigment, `t` of it.
 *
 * Mixed with the colour underneath rounded to one of 32 levels a channel,
 * and the remainder carried through as much as the paint lets it: a few thousand
 * mixes for a sheet rather than one for every grain of the paper, and the
 * grain kept. A transparent pixel is white paper underneath.
 */
function mixPixel(px, i, pig, t, light = false) {
  let r0 = px[i];
  let g0 = px[i + 1];
  let b0 = px[i + 2];
  const al = px[i + 3];
  if (al < 255) {
    const s = al / 255;
    r0 = Math.round(255 + (r0 - 255) * s);
    g0 = Math.round(255 + (g0 - 255) * s);
    b0 = Math.round(255 + (b0 - 255) * s);
  }
  if (light) {
    // Light rather than paint: a pale ink on a dark sheet, laid over it as
    // a lamp would be, since pigment cannot be lighter than what it lies on.
    px[i] = r0 + (((pig >> 16) & 255) - r0) * t + 0.5;
    px[i + 1] = g0 + (((pig >> 8) & 255) - g0) * t + 0.5;
    px[i + 2] = b0 + ((pig & 255) - b0) * t + 0.5;
    px[i + 3] = 255;
    return;
  }
  const bq = ((r0 & 0xf8) << 16) | ((g0 & 0xf8) << 8) | (b0 & 0xf8) | 0x040404;
  const out = mixCached(bq, pig, Math.round(t * 63));
  const k = 1 - t;
  const r = ((out >> 16) & 255) + (r0 - ((bq >> 16) & 255)) * k;
  const g = ((out >> 8) & 255) + (g0 - ((bq >> 8) & 255)) * k;
  const b = (out & 255) + (b0 - (bq & 255)) * k;
  px[i] = r < 0 ? 0 : r > 255 ? 255 : r + 0.5;
  px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g + 0.5;
  px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b + 0.5;
  px[i + 3] = 255;
}

/** A CSS colour to packed sRGB. Hex or rgb(); anything else is a mid grey. */
export function packColour(c) {
  const s = String(c).trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const h = m[1];
    return (parseInt(h[0] + h[0], 16) << 16) | (parseInt(h[1] + h[1], 16) << 8) | parseInt(h[2] + h[2], 16);
  }
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) return parseInt(m[1], 16);
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s);
  if (m) return (Math.round(+m[1]) << 16) | (Math.round(+m[2]) << 8) | Math.round(+m[3]);
  return 0x808080;
}

const hexOf = (p) => '#' + p.toString(16).padStart(6, '0');

/**
 * Two colours mixed as paint, `t` of the second: blue and yellow make green.
 * @param {string} a
 * @param {string} b
 * @param {number} t   0 gives `a`, 1 gives `b`
 */
export function spectralMix(a, b, t) {
  return hexOf(mixPacked(packColour(a), packColour(b), t));
}

// --- chance -------------------------------------------------------------------------------

const rr = (a = 0, b = 1) => a + Math.random() * (b - a);
function gaussian(mean = 0, sd = 1) {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd + mean;
}
const mapTo = (v, a, b, c, d, clamp = false) => {
  const r = c + ((v - a) / (b - a)) * (d - c);
  if (!clamp) return r;
  return c < d ? Math.max(c, Math.min(d, r)) : Math.max(d, Math.min(c, r));
};
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Smooth one-dimensional noise, for a hand that does not hold a ruler. */
function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}

/** A small generator of its own, for marks that must come out the same twice. */
function chanceOf(seed) {
  let t = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the brushes ----------------------------------------------------------------------

/**
 * p5.brush's standard brushes. Weight, scatter and spacing are in units the
 * paper's scale multiplies; opacity is out of 255; grain is the chance of a
 * dot at full pressure; sharpness how much of the scatter is fixed rather
 * than random; pressure a peak and a width for the curve along the stroke and
 * the pressure at its ends and its middle.
 */
export const BRUSHES = {
  pen: { weight: 0.3, scatter: 0.15, sharpness: 0.9, grain: 0.7, opacity: 150, spacing: 0.1, curve: [0.15, 0.2], range: [1.2, 1] },
  rotring: { weight: 0.15, scatter: 0.05, sharpness: 0.7, grain: 0.9, opacity: 210, spacing: 0.1, curve: [0.35, 0.2], range: [1.3, 1] },
  '2B': { weight: 0.3, scatter: 0.75, sharpness: 0.45, grain: 0.8, opacity: 180, spacing: 0.1, curve: [0.1, 0.3], range: [1.1, 0.9] },
  HB: { weight: 0.3, scatter: 0.6, sharpness: 0.3, grain: 0.7, opacity: 170, spacing: 0.1, curve: [0.15, 0.2], range: [1.1, 0.9] },
  '2H': { weight: 0.2, scatter: 0.6, sharpness: 0.3, grain: 0.75, opacity: 120, spacing: 0.1, curve: [0.15, 0.2], range: [1.1, 0.9] },
  cpencil: { weight: 0.35, scatter: 0.55, sharpness: 0.8, grain: 0.7, opacity: 75, spacing: 0.1, curve: [0.15, 0.2], range: [0.95, 1.1] },
  charcoal: { weight: 0.35, scatter: 1.5, sharpness: 0.68, grain: 2, opacity: 120, spacing: 0.03, curve: [0.15, 0.4], range: [1.1, 0.95] },
  crayon: { weight: 0.33, scatter: 1.9, sharpness: 0.75, grain: 2, opacity: 159, spacing: 0.07, curve: [0.15, 0.3], range: [1.1, 0.9] },
  pastel: { weight: 0.7, scatter: 5, sharpness: 0.91, grain: 1, opacity: 30, spacing: 0.085 / 3, curve: [0.4, 0.05], range: [1.09, 0.93] },
  spray: { type: 'spray', weight: 0.2, scatter: 6, sharpness: 15, grain: 40, opacity: 90, spacing: 0.5, curve: [0.2, 0.35], range: [0.7, 1] },
  marker: { type: 'marker', weight: 2, scatter: 0.2, sharpness: 0, grain: 1, opacity: 1, spacing: 0.03, curve: [0.35, 0.25], range: [1.2, 0.85] },
};

// --- the paper ------------------------------------------------------------------------

/**
 * A sheet to draw on with natural media: a canvas the marks are mixed into,
 * and the two masks they are gathered in first -- one of dots for the
 * pencils, one of shapes for the fills.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas  what the marks end up on
 * @param {object} [o]
 * @param {number} [o.scale]  how large the brushes are; p5.brush suggests 3 for a 600 pixel sheet
 * @param {boolean} [o.light] mix as light rather than as paint, for a dark sheet
 */
export class Paper {
  constructor(canvas, { scale = 1, light = false } = {}) {
    this.cv = canvas;
    this.light = light;
    this.W = canvas.width;
    this.H = canvas.height;
    this.g = canvas.getContext('2d', { willReadFrequently: true });
    this.scale = scale;
    this.mask = new Float32Array(this.W * this.H);
    this.dirty = null;
    this.ink = null;
    // Washes are laid at a lower resolution than the sheet, as many pixels
    // to the brush's unit whatever the sheet's size. They are softened by
    // more than that before they are mixed in, so nothing is lost that would
    // be seen, and laying and reading back the twenty layers of a wash costs
    // the same on a large screen as on a small one.
    //
    // The mask is laid here rather than on a canvas. A wash is a hundred
    // polygons of several hundred vertices that cross themselves at every
    // turn, which is the one thing a canvas fills slowly: twenty to eighty
    // milliseconds for the layers between two mixings, against two here.
    this.fs = Math.min(1, 1.6 / Math.max(0.1, scale));
    this.fw = Math.ceil(this.W * this.fs);
    this.fh = Math.ceil(this.H * this.fs);
    // In eight bits, as a canvas keeps it: an alpha of 0 to 255, and
    // the same rounding. It matters. A wash is twenty layers of a percent or
    // two, rubbed out by circles of a few percent, and on a canvas a faint
    // pixel rubbed out a few percent rounds back to what it was -- so the
    // paper shows through only where the paint is thick, as in p5.brush.
    // Kept exactly, the rubbing out wears every wash thin.
    this.fill = new Uint8Array(this.fw * this.fh);
    // Which stroke last touched each pixel of it, so a stroke lays its
    // alpha once however many of its dabs overlap.
    this.fillStamp = new Int32Array(this.fw * this.fh);
    this.fillGen = 0;
    this.fillDirty = null;
  }

  /** Forget anything laid and not yet mixed in, pencil or paint. */
  reset() {
    this.mask.fill(0);
    this.fill.fill(0);
    this.dirty = null;
    this.ink = null;
    this.fillDirty = null;
  }

  /** Cover the sheet with one colour, the paper itself. */
  ground(colour) {
    this.flush();
    this.g.save();
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.globalCompositeOperation = 'source-over';
    this.g.fillStyle = colour;
    this.g.fillRect(0, 0, this.W, this.H);
    this.g.restore();
  }

  // --- the pencil mask ---

  _grow(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d) this.dirty = [x0, y0, x1, y1];
    else {
      if (x0 < d[0]) d[0] = x0;
      if (y0 < d[1]) d[1] = y0;
      if (x1 > d[2]) d[2] = x1;
      if (y1 > d[3]) d[3] = y1;
    }
  }

  /** One dot into the mask: soft-edged, and gathering towards full where dots overlap. */
  _dot(x, y, r, a) {
    if (a <= 0) return;
    if (r < 0.5) {
      a *= (r / 0.5) * (r / 0.5);
      r = 0.5;
    }
    const W = this.W;
    const x0 = Math.max(0, Math.floor(x - r - 1));
    const x1 = Math.min(W - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(0, Math.floor(y - r - 1));
    const y1 = Math.min(this.H - 1, Math.ceil(y + r + 1));
    if (x0 > x1 || y0 > y1) return;
    const m = this.mask;
    for (let py = y0; py <= y1; py++) {
      const dy = py + 0.5 - y;
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - x;
        const f = r + 0.5 - Math.sqrt(dx * dx + dy * dy);
        if (f <= 0) continue;
        const k = py * W + px;
        const v = m[k];
        m[k] = v + a * (f > 1 ? 1 : f) * (1 - v);
      }
    }
    this._grow(x0, y0, x1, y1);
  }

  /**
   * A stroke along a path with a brush. Strokes of one colour gather in the
   * mask and are mixed in together, so where two cross the graphite is
   * denser, as it is; a stroke in another colour mixes the last ones in first.
   *
   * @param {number[][]} points  the path, as [x, y] pairs
   * @param {object} pen
   * @param {string} pen.colour
   * @param {string} [pen.brush]   a name from BRUSHES
   * @param {number} [pen.weight]  a multiplier on the brush's weight
   * @param {number} [pen.wobble]  how far a hand wanders off a ruled path, in brush units
   */
  stroke(points, { colour, brush = 'HB', weight = 1, wobble = 0 } = {}) {
    if (!points || points.length < 2) return;
    if (this.ink !== null && this.ink !== colour) this.flush();
    this.ink = colour;
    const p = BRUSHES[brush] || BRUSHES.HB;
    const S = this.scale;
    // Lengths along the path.
    const segs = [];
    let L = 0;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const l = Math.hypot(bx - ax, by - ay);
      if (l > 0) segs.push({ ax, ay, dx: (bx - ax) / l, dy: (by - ay) / l, l, at: L });
      L += l;
    }
    if (!segs.length) return;
    const step = Math.max(0.05, p.spacing * S);
    const steps = Math.round(L / step);
    // The pressure: a peak somewhere along the stroke and its width, both
    // drawn afresh for every stroke, and the stroke as a whole a little
    // lighter or darker than the last.
    const peakAt = 0.5 + p.curve[0] * rr(-1, 1);
    const width = 1 - p.curve[1] * rr(1, 1.5);
    const shape = rr(3, 3.5);
    const [hi, lo] = p.range;
    const alpha = (p.type === 'marker' ? p.opacity / Math.min(weight, 1.3) : p.opacity) / 255 * Math.max(0, 1 + gaussian(0, 0.03));
    const seed = Math.random() * 1000;
    const wob = wobble * S;
    const freq = 1 / (40 * S);
    let seg = 0;
    let pressure = 1;
    for (let i = 0; i < steps; i++) {
      const s = i * step;
      while (seg < segs.length - 1 && s > segs[seg].at + segs[seg].l) seg++;
      const g = segs[seg];
      const t = s - g.at;
      let x = g.ax + g.dx * t;
      let y = g.ay + g.dy * t;
      if (wob) {
        const off = noise1(s * freq, seed) * wob;
        x -= g.dy * off;
        y += g.dx * off;
      }
      if (i % 10 === 0) {
        const peak = peakAt * L;
        const half = (s < peak ? width * 1.2 : width * 0.8) * (L / 2);
        pressure = mapTo(1 / (1 + Math.pow(Math.abs((s - peak) / half), 2 * shape)), 0, 1, lo, hi);
      }
      this._tip(p, x, y, g.dx, g.dy, pressure, weight, alpha);
    }
    if (p.type === 'marker') {
      // A marker leaves a little more at either end, where it rests.
      const a = segs[0];
      const z = segs[segs.length - 1];
      for (let k = 1; k < 10; k++) {
        this._tip(p, a.ax, a.ay, a.dx, a.dy, (pressure * k) / 10, weight, alpha * 8);
        this._tip(p, z.ax + z.dx * z.l, z.ay + z.dy * z.l, z.dx, z.dy, (pressure * k) / 10, weight, alpha * 8);
      }
    }
  }

  _tip(p, x, y, ux, uy, pressure, weight, alpha) {
    const S = this.scale;
    if (p.type === 'marker') {
      const v = weight * p.scatter * S;
      this._dot(x + v * rr(-1, 1), y + v * rr(-1, 1), (weight * p.weight * S * pressure) / 2, alpha * Math.max(0.8, pressure) * rr(0.9, 1.1));
      return;
    }
    if (p.type === 'spray') {
      const v = weight * p.scatter * S * pressure + (weight * gaussian() * p.scatter * S) / 3;
      const sw = p.weight * S * rr(0.9, 1.1);
      const n = Math.ceil(p.grain / pressure);
      for (let j = 0; j < n; j++) {
        const rad = rr(0.9, 1.1) * v;
        const rx = rad * rr(-1, 1);
        const ry = rr(-1, 1) * Math.sqrt(Math.max(0, rad * rad - rx * rx));
        this._dot(x + rx, y + ry, sw / 2, alpha);
      }
      return;
    }
    if (Math.random() >= p.grain * pressure) return;
    // Scattered across the path more than along it, as a lead skips on paper.
    const v = weight * p.scatter * S * (p.sharpness + ((1 - p.sharpness) * gaussian()) / pressure);
    const across = v * rr(-1, 1);
    const along = 0.3 * v * rr(-1, 1);
    const d = pressure * pressure * p.weight * rr(0.85, 1.15) * weight * S;
    this._dot(x - uy * across + ux * along, y + ux * across + uy * along, d / 2, Math.max(0.9, pressure) * alpha * rr(0.75, 1.1));
  }

  /**
   * The pencil mask mixed into the sheet in its colour, and cleared. Where
   * the mask is dense the pigment is darkened, as pressed graphite is.
   */
  flush() {
    const it = this.flushSteps();
    while (!it.next().done);
  }

  /**
   * The same, a band of rows at a time, for a mask that covers the sheet --
   * a plate of hatching -- whose mixing is too much for one frame. Each band
   * says it was heavy. Nothing else should be drawn until it is done.
   */
  * flushSteps() {
    const d = this.dirty;
    const ink = this.ink;
    this.dirty = null;
    this.ink = null;
    if (!d || ink === null) return;
    const pig = packColour(ink);
    const pr = (pig >> 16) & 255;
    const pg = (pig >> 8) & 255;
    const pb = pig & 255;
    const darkened = new Map();
    const pigmentAt = (a) => {
      if (a <= 0.7) return pig;
      const q = Math.round(a * 32);
      let v = darkened.get(q);
      if (v === undefined) {
        const k = 0.5 * (Math.min(q / 32, 1) - 0.7);
        const f = (c) => Math.max(0, Math.round(c * (1 - k) - 127.5 * k));
        v = (f(pr) << 16) | (f(pg) << 8) | f(pb);
        darkened.set(q, v);
      }
      return v;
    };
    const W = this.W;
    const band = Math.max(1, Math.floor(BAND / (d[2] - d[0] + 1)));
    for (let y0 = d[1]; y0 <= d[3]; y0 += band) {
      const y1 = Math.min(d[3], y0 + band - 1);
      this._composite([d[0], y0, d[2], y1], (k) => this.mask[k], pigmentAt);
      // Clear what was used.
      for (let y = y0; y <= y1; y++) this.mask.fill(0, y * W + d[0], y * W + d[2] + 1);
      if (y1 < d[3]) yield true;
    }
  }

  /**
   * Mix a mask into the sheet over a rectangle: every pixel the mask touches
   * becomes the paint mix of what was there and the pigment.
   */
  _composite([x0, y0, x1, y1], amountAt, pigmentAt) {
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;
    const img = this.g.getImageData(x0, y0, w, h);
    const px = img.data;
    const W = this.W;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const a = amountAt((y0 + yy) * W + x0 + xx, xx, yy);
        if (!(a > 0.002)) continue;
        const t = a > 1 ? 1 : a;
        mixPixel(px, (yy * w + xx) * 4, pigmentAt(t), t, this.light);
      }
    }
    this.g.putImageData(img, x0, y0);
  }

  // --- the fill mask ---

  /**
   * A polygon laid into the fill mask at `alpha`, as a canvas fills one --
   * the nonzero rule, so where the outline crosses itself the shape is laid
   * once -- a row of the mask at a time, without antialiasing: the mask is
   * softened before it is used.
   *
   * @param {{x:number,y:number}[]} v  in the sheet's pixels
   */
  _fillPolygon(v, alpha) {
    const n = v.length;
    const a8 = Math.round(alpha * 255);
    if (n < 3 || !(a8 > 0)) return;
    const fs = this.fs;
    const FW = this.fw;
    const FH = this.fh;
    // The edges, each from its top: where it starts and ends, in rows, its
    // x at the top, how far x moves a row, and which way it winds.
    const top = new Float32Array(n);
    const bot = new Float32Array(n);
    const x0 = new Float32Array(n);
    const slope = new Float32Array(n);
    const wind = new Int8Array(n);
    let ymin = Infinity;
    let ymax = -Infinity;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const a = v[i];
      const b = v[i + 1 < n ? i + 1 : 0];
      const ay = a.y * fs;
      const by = b.y * fs;
      if (ay === by) continue;
      const ax = a.x * fs;
      const bx = b.x * fs;
      if (ay < by) {
        top[m] = ay;
        bot[m] = by;
        x0[m] = ax;
        wind[m] = 1;
      } else {
        top[m] = by;
        bot[m] = ay;
        x0[m] = bx;
        wind[m] = -1;
      }
      slope[m] = (bx - ax) / (by - ay);
      if (top[m] < ymin) ymin = top[m];
      if (bot[m] > ymax) ymax = bot[m];
      m++;
    }
    const r0 = Math.max(0, Math.ceil(ymin - 0.5));
    const r1 = Math.min(FH - 1, Math.ceil(ymax - 0.5) - 1);
    if (r1 < r0) return;
    // Edges by the row they start in, then a list of those live.
    const order = new Int32Array(m);
    for (let i = 0; i < m; i++) order[i] = i;
    order.sort((p, q) => top[p] - top[q]);
    const live = new Int32Array(m);
    const xs = new Float32Array(m);
    const ws = new Int8Array(m);
    let nLive = 0;
    let next = 0;
    const mask = this.fill;
    for (let row = r0; row <= r1; row++) {
      const yc = row + 0.5;
      while (next < m && top[order[next]] <= yc) live[nLive++] = order[next++];
      // Crossings of this row's centre, by x.
      let c = 0;
      let keep = 0;
      for (let k = 0; k < nLive; k++) {
        const e = live[k];
        if (bot[e] <= yc) continue;
        live[keep++] = e;
        if (top[e] > yc) continue;
        const x = x0[e] + (yc - top[e]) * slope[e];
        let j = c++;
        while (j > 0 && xs[j - 1] > x) {
          xs[j] = xs[j - 1];
          ws[j] = ws[j - 1];
          j--;
        }
        xs[j] = x;
        ws[j] = wind[e];
      }
      nLive = keep;
      const base = row * FW;
      let w = 0;
      for (let k = 0; k + 1 < c; k++) {
        w += ws[k];
        if (w === 0) continue;
        const a = Math.max(0, Math.ceil(xs[k] - 0.5));
        const b = Math.min(FW - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
        for (let x = a; x <= b; x++) {
          const i = base + x;
          mask[i] += a8 - div255(mask[i] * a8);
        }
      }
    }
  }

  /**
   * A polygon's outline laid into the fill mask, `width` wide in the sheet's
   * pixels, each pixel of it once: the dried edge of one layer of a wash.
   */
  _strokePolygon(v, width, alpha) {
    const n = v.length;
    const a8 = Math.round(alpha * 255);
    if (n < 2 || !(a8 > 0)) return;
    const fs = this.fs;
    const FW = this.fw;
    const FH = this.fh;
    const r = Math.max(0.5, (width * fs) / 2);
    const r2 = r * r;
    const gen = ++this.fillGen;
    const stamp = this.fillStamp;
    const mask = this.fill;
    const dab = (cx, cy) => {
      const xa = Math.max(0, Math.ceil(cx - r - 0.5));
      const xb = Math.min(FW - 1, Math.floor(cx + r - 0.5));
      const ya = Math.max(0, Math.ceil(cy - r - 0.5));
      const yb = Math.min(FH - 1, Math.floor(cy + r - 0.5));
      for (let y = ya; y <= yb; y++) {
        const dy = y + 0.5 - cy;
        for (let x = xa; x <= xb; x++) {
          const dx = x + 0.5 - cx;
          if (dx * dx + dy * dy > r2) continue;
          const i = y * FW + x;
          if (stamp[i] === gen) continue;
          stamp[i] = gen;
          mask[i] += a8 - div255(mask[i] * a8);
        }
      }
    };
    const step = Math.max(0.5, r * 0.75);
    for (let i = 0; i < n; i++) {
      const a = v[i];
      const b = v[i + 1 < n ? i + 1 : 0];
      const ax = a.x * fs;
      const ay = a.y * fs;
      const dx = b.x * fs - ax;
      const dy = b.y * fs - ay;
      const k = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / step));
      for (let j = 0; j < k; j++) dab(ax + (dx * j) / k, ay + (dy * j) / k);
    }
  }

  /** A disc taken out of the fill mask by `alpha`, as a canvas's destination-out. */
  _eraseDisc(cx, cy, rad, alpha) {
    const fs = this.fs;
    const FW = this.fw;
    const x = cx * fs;
    const y = cy * fs;
    const r = rad * fs;
    const keep = 255 - Math.round(alpha * 255);
    if (keep >= 255) return;
    const ya = Math.max(0, Math.ceil(y - r - 0.5));
    const yb = Math.min(this.fh - 1, Math.floor(y + r - 0.5));
    const mask = this.fill;
    for (let row = ya; row <= yb; row++) {
      const dy = row + 0.5 - y;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const xa = Math.max(0, Math.ceil(x - half - 0.5));
      const xb = Math.min(FW - 1, Math.floor(x + half - 0.5));
      for (let i = row * FW + xa, end = row * FW + xb; i <= end; i++) mask[i] = div255(mask[i] * keep);
    }
  }

  _fillBounds(v, pad) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of v) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
    const b = [Math.max(0, Math.floor(x0 - pad)), Math.max(0, Math.floor(y0 - pad)), Math.min(this.W - 1, Math.ceil(x1 + pad)), Math.min(this.H - 1, Math.ceil(y1 + pad))];
    const d = this.fillDirty;
    if (!d) this.fillDirty = b;
    else {
      d[0] = Math.min(d[0], b[0]);
      d[1] = Math.min(d[1], b[1]);
      d[2] = Math.max(d[2], b[2]);
      d[3] = Math.max(d[3], b[3]);
    }
  }

  /**
   * The fill mask mixed into the sheet and cleared. A wash darkens where its
   * mask changes fastest -- the rim it dries to -- by the rule of p5.brush's
   * shader: the change of the mask, taken at nine points round each pixel,
   * pushes the amount up by as much as a tenth.
   */
  _flushFill(colour) {
    const it = this._mixFill(colour);
    while (!it.next().done);
  }

  /**
   * The same, a band of rows at a time: a wash the size of the sheet is a
   * million pixels to mix, too many for one frame, so each band says it was
   * heavy and the caller may stop there until the next.
   */
  * _mixFill(colour) {
    const d = this.fillDirty;
    if (!d) return;
    this.fillDirty = null;
    const fs = this.fs;
    // The rectangle in the mask's own pixels.
    const lx0 = Math.max(0, Math.floor(d[0] * fs));
    const ly0 = Math.max(0, Math.floor(d[1] * fs));
    const lx1 = Math.min(this.fw - 1, Math.ceil(d[2] * fs));
    const ly1 = Math.min(this.fh - 1, Math.ceil(d[3] * fs));
    const w = lx1 - lx0 + 1;
    const h = ly1 - ly0 + 1;
    if (w <= 0 || h <= 0) return;
    // Taken out of the mask, which is left clear for the next.
    let A = new Float32Array(w * h);
    const FW = this.fw;
    for (let y = 0; y < h; y++) {
      const from = (ly0 + y) * FW + lx0;
      for (let x = 0; x < w; x++) A[y * w + x] = this.fill[from + x] / 255;
      this.fill.fill(0, from, from + w);
    }
    // Paint diffuses in wet paper: the mask is softened by about the width of
    // a pencil line before it is mixed, so the edge of every one of the thin
    // layers -- and the chords they share where they were cut -- melts into
    // the wash instead of standing in it as a hairline. Two box blurs, which
    // is near enough a gaussian.
    const r = Math.max(1, Math.round(this.scale * 0.8 * fs));
    A = boxBlur(boxBlur(A, w, h, r), w, h, r);
    // How fast the mask changes, measured across four pixels of the sheet
    // rather than one. Every layer of a wash ends in a step of a percent or
    // two; taken a pixel at a time, each of those steps reads as an edge and
    // the wash is drawn over with hairlines. Across four pixels a lone step
    // is too small to count, and only the rim -- where many layers end
    // together, which is where a wash dries dark -- is steep enough.
    const k = Math.max(1, Math.round(2 * fs));
    const span = (2 * k) / fs;
    const G = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const ya = Math.max(0, y - k) * w;
      const yb = Math.min(h - 1, y + k) * w;
      for (let x = 0; x < w; x++) {
        const dx = (A[row + Math.min(w - 1, x + k)] - A[row + Math.max(0, x - k)]) / span;
        const dy = (A[yb + x] - A[ya + x]) / span;
        G[row + x] = smoothstep(0.05, 0.35, 15 * Math.sqrt(dx * dx + dy * dy));
      }
    }
    // The amount: the mask, pushed up by the edge at nine points round it.
    const M = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = A[y * w + x];
        if (a <= 0) continue;
        let e = 0;
        for (let j = -k; j <= k; j += k) {
          const yy = Math.min(h - 1, Math.max(0, y + j)) * w;
          for (let i = -k; i <= k; i += k) e += G[yy + Math.min(w - 1, Math.max(0, x + i))];
        }
        M[y * w + x] = Math.min(1, a + (e / 9) * 0.1);
      }
    }
    // Read back at the sheet's resolution, between the mask's pixels.
    const pig = packColour(colour);
    const [x0, y0, x1, y1] = d;
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    // Where each column of the sheet falls between two of the mask's.
    const cu = new Int32Array(cw);
    const cu1 = new Int32Array(cw);
    const cf = new Float32Array(cw);
    for (let x = 0; x < cw; x++) {
      let u = (x0 + x + 0.5) * fs - 0.5 - lx0;
      u = u < 0 ? 0 : u > w - 1 ? w - 1 : u;
      cu[x] = u | 0;
      cu1[x] = cu[x] + 1 < w ? cu[x] + 1 : cu[x];
      cf[x] = u - cu[x];
    }
    const band = Math.max(1, Math.floor(BAND / cw));
    for (let b0 = 0; b0 < ch; b0 += band) {
      const rows = Math.min(band, ch - b0);
      const img = this.g.getImageData(x0, y0 + b0, cw, rows);
      const px = img.data;
      for (let yy = 0; yy < rows; yy++) {
        const y = b0 + yy;
        let v = (y0 + y + 0.5) * fs - 0.5 - ly0;
        v = v < 0 ? 0 : v > h - 1 ? h - 1 : v;
        const iv = v | 0;
        const fv = v - iv;
        const r0 = iv * w;
        const r1 = (iv + 1 < h ? iv + 1 : iv) * w;
        for (let x = 0; x < cw; x++) {
          const iu = cu[x];
          const iu1 = cu1[x];
          const m00 = M[r0 + iu];
          const m01 = M[r0 + iu1];
          const m10 = M[r1 + iu];
          const m11 = M[r1 + iu1];
          if (m00 + m01 + m10 + m11 <= 0) continue;
          const fu = cf[x];
          const top = m00 + (m01 - m00) * fu;
          const t = top + (m10 + (m11 - m10) * fu - top) * fv;
          if (!(t > 0.002)) continue;
          mixPixel(px, (yy * cw + x) * 4, pig, t > 1 ? 1 : t, this.light);
        }
      }
      this.g.putImageData(img, x0, y0 + b0);
      yield true;
    }
  }

  /**
   * A flat wash: the shape laid once at one opacity, out of 255, and mixed in.
   * @param {number[][]} points
   */
  wash(points, colour, opacity = 150) {
    if (!points || points.length < 3) return;
    this.flush();
    const v = points.map(([x, y]) => ({ x, y }));
    this._fillPolygon(v, opacity / 255);
    this._fillBounds(v, 4);
    this._flushFill(colour);
  }

  /**
   * A watercolour fill, all at once. See `watercolourSteps` for one a few
   * layers at a time.
   */
  watercolour(points, o) {
    const it = this.watercolourSteps(points, o);
    while (!it.next().done);
  }

  /**
   * A watercolour fill as a sequence of steps, one layer of the twenty at a
   * time, so a picture can lay a wash over several frames as paint spreads.
   *
   * @param {number[][]} points  the shape, as [x, y] pairs
   * @param {object} o
   * @param {string} o.colour
   * @param {number} [o.opacity]   out of 255
   * @param {number} [o.bleed]     how far the edge runs, 0 to 1
   * @param {number} [o.texture]   how much of the paper shows through, 0 to 1
   * @param {number} [o.border]    how dark the dried rim is, 0 to 1
   * @param {string} [o.direction] 'out' to run outwards, 'in' to pull in
   */
  * watercolourSteps(points, { colour, opacity = 190, bleed = 0.15, texture = 0.4, border = 0.5, direction = 'out' } = {}) {
    if (!points || points.length < 3) return;
    this.flush();
    const sides = [];
    const verts = densify(points).map(([x, y]) => ({ x, y }));
    for (let i = 0; i < verts.length; i++) sides.push([verts[i], verts[(i + 1) % verts.length]]);
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const p of verts) {
      bx0 = Math.min(bx0, p.x);
      by0 = Math.min(by0, p.y);
      bx1 = Math.max(bx1, p.x);
      by1 = Math.max(by1, p.y);
    }
    const ctx = { sides, bb: [bx0, by0, bx1, by1], bleed, border, direction, cap: 2024 * Math.max(0.2, 2 * bleed) };
    // Which vertices run freely and which barely move, and where the edge starts.
    const wr = rr(0, 75);
    const fluid = Math.floor(verts.length * 0.25 * (wr < 5 ? 1 : wr < 15 ? 2 : 3));
    const mods = verts.map((_, i) => (i > fluid ? 1 : 0.3) * rr(0.85, 1.4) * bleed);
    const shift = Math.floor(rr(0, verts.length));
    const v = verts.map((_, i) => verts[(i + shift) % verts.length]);
    const first = new WetPoly(ctx, v, mods, centreOf(v), [], true);
    yield* this._layers(first, ctx, colour, opacity / 255, texture);
  }

  * _layers(first, ctx, colour, intensity, tex) {
    const numLayers = 20;
    const texture = tex * 3;
    const int = 2 * intensity * (1 + tex / 2);
    const size = Math.max(first.sizeX, first.sizeY);
    const darker = rr(0.15, 0.7);
    let pol = first.grow();
    const sparse = first.scatter(0.1).grow().scatter(0.75).flip();
    let pols = [];
    const lay = (p, i, amount) => {
      const width = mapTo(i, 0, 24, size / 25, size / 30, true) * ctx.border;
      this._fillPolygon(p.v, amount / 100);
      this._strokePolygon(p.v, width, ctx.border * 0.01);
      this._fillBounds(p.v, width + 4 + 2 / this.fs);
    };
    for (let i = 0; i < numLayers; i++) {
      if (i % 4 === 0) pol = pol.grow();
      if (i % 2 === 0) pols = [pol.grow(1 - 0.0125 * i), pol.grow(0.7 - 0.0125 * i), pol.grow(0.4 - 0.0125 * i)];
      for (const p of pols) lay(p.grow(999).grow(997), i, int);
      lay(sparse.grow(999).flip().grow(997), i, int * texture);
      if (i % 2 === 0) lay(pol.grow(darker).grow(999), i, int * 2);
      if (i % 8 === 0 || i === numLayers - 1) {
        if (texture !== 0) this._rubOut(pol, texture * 3, intensity);
        yield* this._mixFill(colour);
      }
      yield false;
    }
  }

  /** Circles rubbed out of the wash, for the paper showing through. */
  _rubOut(pol, texture, intensity) {
    const n = Math.floor(rr(80, 110) * mapTo(texture, 0, 1, 2, 3.5));
    const hx = pol.sizeX / 1.3;
    const hy = pol.sizeY / 1.3;
    const minSize = Math.min(pol.sizeX, pol.sizeY) * 1.3;
    const alpha = ((5 - mapTo(intensity, 80, 100, 0.3, 0.7, true)) * texture) / 255;
    for (let i = 0; i < n; i++) {
      const x = pol.midP.x + gaussian(0, hx);
      const y = pol.midP.y + gaussian(0, hy);
      // A diameter, as p5.brush gives it.
      const d = rr(0.03 * minSize, 0.45 * minSize);
      if (i % 5 === 0) continue;
      this._eraseDisc(x, y, d / 2, alpha);
    }
  }

  /**
   * One dot of ink, as a pen touched to the paper and lifted: flick work.
   * Its wobble comes from where it is, so the same dot is the same twice.
   */
  dab(x, y, r, colour = '#1d1a15') {
    if (this.ink !== null && this.ink !== colour) this.flush();
    this.ink = colour;
    const c = chanceOf(Math.round(x * 7) * 65537 + Math.round(y * 7));
    this._dot(x - 0.3 + 0.6 * c(), y - 0.3 + 0.6 * c(), r * (0.8 + 0.35 * c()), 0.85);
  }

  /**
   * An engraver's line drawn with a pen: a path whose width follows a tone,
   * swelling where it is dark and lifting off the paper where it is light,
   * laid as ink dots into the pencil mask like any other stroke, so its edge
   * is ragged with the grain and its course wanders as a hand's does. The
   * same contract as `burin` in engrave.js, which hands its lines here when
   * it is given a Paper rather than a canvas.
   *
   * @param {(t: number) => number[]} at          the path, t from 0 to 1
   * @param {(x: number, y: number) => number} tone  0 light to 1 dark
   * @param {object} [o]
   * @param {string} [o.colour]
   * @param {number} [o.weight]  the line's width at full dark, in pixels
   * @param {number} [o.steps]   samples of the path
   * @param {number} [o.gamma]
   * @param {number} [o.min]     a tone below this lifts the pen
   * @param {number} [o.hand]    how far the line wanders, in pixels
   */
  engrave(at, tone, { colour = '#1d1a15', weight = 1.5, steps = 26, gamma = 1, min = 0.04, hand = 0.6, seed = null } = {}) {
    // A line given a seed is drawn the same way every time, so a plate cut
    // again over a changing picture changes only where the picture did.
    const base = seed === null ? (Math.random() * 4294967296) | 0 : seed | 0;
    const rand = chanceOf(base);
    const r2 = (a, b) => a + rand() * (b - a);
    // Each dot's own chance comes from where it is along the line, not from
    // its turn in a sequence: a dot skipped for want of tone must not change
    // every dot after it.
    const dotChance = (k, j) => {
      let h = Math.imul(k ^ base, 0x27d4eb2d) ^ Math.imul(j + 1, 0x165667b1);
      h ^= h >>> 15;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      return (h >>> 0) / 4294967296;
    };
    if (this.ink !== null && this.ink !== colour) this.flush();
    this.ink = colour;
    // The path as a polyline, and its length.
    const xs = new Float32Array(steps + 1);
    const ys = new Float32Array(steps + 1);
    const ls = new Float32Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const p = at(i / steps);
      xs[i] = p[0];
      ys[i] = p[1];
      if (i) ls[i] = ls[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    const L = ls[steps];
    if (!(L > 0)) return;
    // Dots close enough to make a line, and no closer.
    const step = Math.max(0.35, weight * 0.3);
    const n = Math.ceil(L / step);
    const wander = rand() * 1000;
    const freq = 1 / Math.max(8, 30 * this.scale);
    // A hand does not rule a line across the plate. It hatches in strokes a
    // finger's length long, each a little off the slope of the last and
    // fading at both ends, with a hair of paper between one and the next.
    const reach = () => r2(18, 46) * this.scale;
    let from = -r2(0, 1) * reach();
    let to = from + reach();
    let tilt = r2(-0.035, 0.035);
    let lift = 0;
    // How hard the pen is pressed along this line, a little different from
    // the last, as a hand never cuts two lines quite alike.
    const press = r2(0.85, 1.1);
    let seg = 1;
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * L;
      if (s > to) {
        from = to + r2(0.6, 1.8) * this.scale * 0.5;
        to = from + reach();
        tilt = r2(-0.035, 0.035);
        lift = r2(-0.4, 0.4) * hand;
      }
      if (s < from) continue;
      while (seg < steps && ls[seg] < s) seg++;
      const f = (s - ls[seg - 1]) / Math.max(1e-6, ls[seg] - ls[seg - 1]);
      let x = xs[seg - 1] + (xs[seg] - xs[seg - 1]) * f;
      let y = ys[seg - 1] + (ys[seg] - ys[seg - 1]) * f;
      const v = tone(x, y);
      if (!(v >= min)) continue;
      const dx = (xs[seg] - xs[seg - 1]) / Math.max(1e-6, ls[seg] - ls[seg - 1]);
      const dy = (ys[seg] - ys[seg - 1]) / Math.max(1e-6, ls[seg] - ls[seg - 1]);
      const off = noise1(s * freq, wander) * hand + lift + (s - from) * tilt;
      x -= dy * off;
      y += dx * off;
      // Now and then the pen skips on the grain, more where it is light.
      if (dotChance(k, 0) < 0.03 + 0.09 * (1 - v)) continue;
      // Thinner where the stroke begins and ends.
      const u = (s - from) / (to - from);
      const ends = Math.min(1, 0.45 + 2.2 * Math.min(u, 1 - u));
      const r = (Math.pow(v > 1 ? 1 : v, gamma) * weight * press * ends * (0.85 + 0.3 * dotChance(k, 1))) / 2;
      // Ink is ink: a light passage is a thinner line, not a paler one.
      this._dot(x - 0.2 + 0.4 * dotChance(k, 2), y - 0.2 + 0.4 * dotChance(k, 3), r, 0.8 + 0.15 * v);
    }
  }

  /**
   * Hatching across a shape: parallel lines `dist` apart at `angle` degrees,
   * clipped to it, each drawn with the pen as a stroke of its own.
   *
   * @param {number[][]} points
   * @param {object} h  { dist, angle, rand, continuous, gradient }
   * @param {object} pen  as for `stroke`
   */
  hatch(points, h, pen) {
    for (const s of hatchLines(points, h)) this.stroke([[s.x1, s.y1], [s.x2, s.y2]], { ...pen, weight: (pen.weight || 1) * rr(0.9, 1.1) });
  }
}

/** A box blur of a w by h field, `r` either way, horizontal then vertical, by running sums. */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * A shape with no side longer than a sixteenth of its size. The edge grows
 * by displacing midpoints in proportion to the side, so a shape given as a
 * few corners -- a rectangle, a ridge of hills -- would otherwise grow spikes
 * as long as its sides; subdivided, it runs at every point, as paint does.
 */
function densify(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  const most = Math.max(6, Math.max(x1 - x0, y1 - y0) / 16);
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / most));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

const centreOf = (pts) => {
  const n = pts.length;
  if (n < 8) {
    let x = 0;
    let y = 0;
    for (const p of pts) {
      x += p.x;
      y += p.y;
    }
    return { x: x / n, y: y / n };
  }
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 < n ? i + 1 : 0;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    area += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  area *= 0.5;
  return area ? { x: cx / (6 * area), y: cy / (6 * area) } : { x: pts[0].x, y: pts[0].y };
};

/**
 * A wet shape: its vertices, how freely each runs, and which way, outward or
 * in. Growing it puts a new vertex between every two, pushed out by a
 * gaussian amount -- midpoint displacement -- so the edge gets more ragged
 * every time, which is the whole of the watercolour edge.
 */
class WetPoly {
  constructor(ctx, v, m, centre, dir = [], first = false, sx = 0, sy = 0) {
    this.ctx = ctx;
    this.v = v;
    this.m = m;
    this.dir = dir;
    this.midP = centre;
    if (first) {
      let maxX = 0;
      let maxY = 0;
      for (const p of v) {
        maxX = Math.max(maxX, Math.abs(centre.x - p.x));
        maxY = Math.max(maxY, Math.abs(centre.y - p.y));
      }
      this.sizeX = maxX;
      this.sizeY = maxY;
      // Which way is out at every edge: a ray from its middle, square to it,
      // crossing the shape's sides an even number of times.
      const sides = ctx.sides;
      this.dir = v.map((a, i) => {
        const b = v[(i + 1) % v.length];
        const sx2 = b.x - a.x;
        const sy2 = b.y - a.y;
        const mx = a.x + sx2 / 2;
        const my = a.y + sy2 / 2;
        const rdx = sy2;
        const rdy = -sx2;
        const eNeg = -(sx2 * sx2 + sy2 * sy2);
        let count = 0;
        for (const [sa, sb] of sides) {
          const sdx = sb.x - sa.x;
          const sdy = sb.y - sa.y;
          const den = sdy * rdx - sdx * rdy;
          if (den === 0) continue;
          const ub = (rdx * (my - sa.y) - rdy * (mx - sa.x)) / den;
          if (ub < 0 || ub > 1) continue;
          const ua = (sdx * (my - sa.y) - sdy * (mx - sa.x)) / den;
          if (ua * eNeg <= 0.01) continue;
          count++;
        }
        return count % 2 === 0;
      });
      this.midP = { x: centre.x + rr(-0.6, 0.6) * maxX, y: centre.y + rr(-0.6, 0.6) * maxY };
    } else {
      this.sizeX = sx;
      this.sizeY = sy;
    }
  }

  make(v, m, dir) {
    return new WetPoly(this.ctx, v, m, this.midP, dir, false, this.sizeX, this.sizeY);
  }

  /** Part of the shape cut away and bridged, for the layers that do not cover it all. */
  trim(f) {
    if (f >= 1 || f < 0 || this.v.length <= 8) return { v: this.v, m: this.m, dir: this.dir };
    const n = this.v.length;
    const nTrim = Math.floor((1 - f) * n);
    const s = Math.floor(n / 2 - nTrim / 2);
    const e0 = this.v[(s - 1 + n) % n];
    const e1 = this.v[(s + nTrim) % n];
    const evx = e1.x - e0.x;
    const evy = e1.y - e0.y;
    const len = Math.hypot(evx, evy);
    const si = s >= 2 ? Math.floor(rr(0, s - 1)) : (s + nTrim < n - 1 ? s + nTrim : 0);
    const sa = this.v[si];
    const sb = this.v[(si + 1) % n];
    const typical = Math.max(1, Math.hypot(sb.x - sa.x, sb.y - sa.y));
    const nIns = Math.max(2, Math.ceil((len / typical) * 0.05));
    const v = [];
    const m = [];
    const dir = [];
    for (let i = 0; i < s; i++) {
      v.push(this.v[i]);
      m.push(this.m[i]);
      dir.push(this.dir[i]);
    }
    const jit = len * 0.06;
    const d0 = this.dir[s % this.dir.length];
    for (let k = 0; k < nIns; k++) {
      const t = (k + 1) / (nIns + 1);
      v.push({ x: e0.x + evx * t + rr(-jit, jit), y: e0.y + evy * t + rr(-jit, jit) });
      m.push(rr(0.3, 0.5));
      dir.push(d0);
    }
    for (let i = s + nTrim; i < n; i++) {
      v.push(this.v[i]);
      m.push(this.m[i]);
      dir.push(this.dir[i]);
    }
    return { v, m, dir };
  }

  /** A sparse copy: a fraction of the vertices, any outside the shape pulled in. */
  scatter(ratio = 0.3) {
    const L = this.v.length;
    const keep = Math.max(3, Math.floor(L * ratio));
    const step = L / keep;
    const [bx0, by0, bx1, by1] = this.ctx.bb;
    const sv = [];
    const sm = [];
    const sd = [];
    for (let i = 0; i < keep; i++) {
      const j = Math.floor(i * step + rr(0, step * 0.8)) % L;
      let p = this.v[j];
      let outside = p.x < bx0 || p.x > bx1 || p.y < by0 || p.y > by1;
      if (!outside) {
        let crossings = 0;
        for (const [a, b] of this.ctx.sides) {
          if ((a.y > p.y) === (b.y > p.y)) continue;
          const t = (p.y - a.y) / (b.y - a.y);
          if (p.x < a.x + t * (b.x - a.x)) crossings++;
        }
        outside = crossings % 2 === 0;
      }
      if (outside) p = { x: this.midP.x + (p.x - this.midP.x) * rr(0.3, 0.6), y: this.midP.y + (p.y - this.midP.y) * rr(0.3, 0.6) };
      sv.push(p);
      sm.push(this.m[j]);
      sd.push(!this.dir[j]);
    }
    return this.make(sv, sm, sd);
  }

  flip() {
    return this.make(this.v, this.m, this.dir.map((d) => !d));
  }

  /** Midpoint displacement: a new vertex between every two, pushed out or in. */
  grow(f = 1) {
    const { v, m, dir } = this.trim(f);
    const len = v.length;
    const bleedDeg = this.ctx.direction === 'out' ? -90 : 90;
    let mod = f === 999 ? rr(0.6, 0.8) : this.ctx.bleed;
    const outV = [];
    const outM = [];
    const outD = [];
    for (let i = 0; i < len; i++) {
      const cv = v[i];
      const nv = v[i + 1 < len ? i + 1 : 0];
      const mi = m[i];
      const di = dir[i];
      if (f < 997) mod = mi;
      outV.push(cv);
      outM.push(mi);
      outD.push(di);
      if (mod < 0.05) {
        outV.push({ x: (cv.x + nv.x) / 2, y: (cv.y + nv.y) / 2 });
        outM.push(mi);
        outD.push(di);
        continue;
      }
      const deg = ((di ? bleedDeg : -bleedDeg) + rr(-1, 1) * 5) * (Math.PI / 180);
      const c = Math.cos(deg);
      const s = Math.sin(deg);
      const sx = nv.x - cv.x;
      const sy = nv.y - cv.y;
      // Displaced in proportion to the side, but never further than a tenth
      // of the shape: the sparse layers keep one vertex in ten, their sides
      // are long, and unchecked they throw spikes far outside the wash.
      const side = Math.hypot(sx, sy);
      const reach = 0.1 * Math.max(this.sizeX, this.sizeY);
      const d = Math.min(gaussian(0.5, 0.2) * rr(0.65, 1.35) * mod, side > 0 ? reach / side : 0);
      outV.push({ x: cv.x + sx * 0.5 + (c * sx + s * sy) * d, y: cv.y + sy * 0.5 + (c * sy - s * sx) * d });
      outM.push(mi + gaussian(0, 0.02));
      outD.push(di);
    }
    // A ceiling on vertices: past it, every other one is let go.
    if (outV.length > this.ctx.cap) {
      const stepK = Math.ceil(outV.length / this.ctx.cap);
      const fv = [];
      const fm = [];
      const fd = [];
      for (let j = 0; j < outV.length; j += stepK) {
        fv.push(outV[j]);
        fm.push(outM[j]);
        fd.push(outD[j]);
      }
      return this.make(fv, fm, fd);
    }
    return this.make(outV, outM, outD);
  }
}

/**
 * The lines that hatch a shape: scanlines `dist` apart at `angle` degrees,
 * paired at the shape's edges, now and then jittered, optionally widening by
 * `gradient` from one side to the other. Pure geometry, so it is testable.
 *
 * @param {number[][]} points
 * @param {object} o
 * @returns {{x1:number,y1:number,x2:number,y2:number}[]}
 */
export function hatchLines(points, { dist = 5, angle = 45, rand = 0, gradient = 0 } = {}) {
  const a = (((angle % 180) + 180) % 180) * (Math.PI / 180);
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const rot = points.map(([x, y]) => [x * cosA - y * sinA, x * sinA + y * cosA]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of rot) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const grow = gradient ? mapTo(gradient, 0, 1, 1, 1.1, true) : 1;
  const out = [];
  let Y = minY + dist * 0.5;
  let step = dist;
  while (Y < maxY) {
    const cx = [];
    for (let i = 0; i < rot.length; i++) {
      const [x1, y1] = rot[i];
      const [x2, y2] = rot[(i + 1) % rot.length];
      if (y1 === y2) continue;
      if ((y1 <= Y) !== (y2 <= Y)) cx.push(x1 + ((Y - y1) / (y2 - y1)) * (x2 - x1));
    }
    cx.sort((p, q) => p - q);
    for (let i = 0; i + 1 < cx.length; i += 2) {
      let x1 = cx[i] * cosA + Y * sinA;
      let y1 = -cx[i] * sinA + Y * cosA;
      let x2 = cx[i + 1] * cosA + Y * sinA;
      let y2 = -cx[i + 1] * sinA + Y * cosA;
      if (rand) {
        x1 += 2 * rand * dist * rr(-1, 1);
        y1 += 2 * rand * dist * rr(-1, 1);
        x2 += 2 * rand * dist * rr(-1, 1);
        y2 += 2 * rand * dist * rr(-1, 1);
      }
      out.push({ x1, y1, x2, y2 });
    }
    Y += step;
    step *= grow;
  }
  return out;
}

// --- shapes, as a hand would draw them ----------------------------------------------------

/** A circle as points, a little out of round when `wobble` is above nought. */
export function circlePoints(cx, cy, r, { wobble = 0, n = 0 } = {}) {
  const k = n || Math.max(12, Math.min(160, Math.round(r * 0.6)));
  const seed = Math.random() * 100;
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const rr2 = r * (1 + wobble * 0.15 * noise1(i * (6 / k), seed));
    out.push([cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2]);
  }
  return out;
}

/**
 * A blob: a circle out of round, squashed and turned, the shape a loaded
 * brush leaves when it is touched to the paper.
 */
export function blobPoints(cx, cy, r, { squash = rr(0.6, 1), turn = rr(0, Math.PI * 2), wobble = rr(0.6, 1.4) } = {}) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return circlePoints(0, 0, r, { wobble }).map(([u, v]) => {
    v *= squash;
    return [cx + u * c - v * s, cy + u * s + v * c];
  });
}

/** A rectangle as points, its corners where a hand would put them. */
export function rectPoints(x, y, w, h, { wobble = 0 } = {}) {
  const j = () => (wobble ? rr(-1, 1) * wobble * 0.04 * Math.min(w, h) : 0);
  return [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]];
}

/**
 * Run queued drawing jobs -- generators, or plain functions -- a few steps
 * at a time, so a burst of marks costs a few frames a little each rather
 * than one frame a lot. At most `steps` steps, and none after one that
 * reports itself heavy, as a wash does when it is mixed in. Counted in
 * steps rather than timed, so a seeded picture comes out the same on a slow
 * machine as on a fast one.
 *
 * @param {Array<Generator|Function>} jobs  consumed from the front
 * @returns {number} how many are left
 */
export function drainJobs(jobs, steps = 4) {
  let n = steps;
  while (jobs.length && n-- > 0) {
    const j = jobs[0];
    if (typeof j === 'function') {
      jobs.shift();
      j();
      continue;
    }
    const r = j.next();
    if (r.done) jobs.shift();
    else if (r.value === true) break;
  }
  return jobs.length;
}
