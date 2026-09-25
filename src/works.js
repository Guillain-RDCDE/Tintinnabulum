// Works: finished pieces, each a picture, a sound and a way of showing them.
//
// Everything a person can set -- a scene, a palette, a kit of sounds, the room
// it plays in, a finish, a frame, a pace, a living colour -- makes millions of
// combinations, and almost nobody wants to find the good ones by hand. A work
// is one of them, chosen, given a title and a label.
//
// Works hang in rooms named for their light: dawn, daylight, dusk and night.
// The first version named rooms by a country, a group of painters, a time of
// day and a trade, which are four different kinds of thing, and nobody could
// guess where to look. Light is the one question a person can answer about a
// picture before they have read a word, and it is also the practical one: a
// screen in a bright room wants a light work, a dark room a dark one. Within
// a room, a work is calm or lively.
//
// A work names only things that exist. The test suite checks every field
// against the catalogues, so a renamed scene or palette fails loudly here
// instead of producing a work that silently falls back to the defaults.

export const WORK_ROOMS = ['Dawn', 'Daylight', 'Dusk', 'Night'];

export const WORK_ROOM_NOTES = {
  Dawn: 'Pale grounds and soft colour, the first light of the day. Pictures to live beside quietly.',
  Daylight: 'Clear light and full colour: paper, gardens, workshops and studios.',
  Dusk: 'Low warm light and long shadows, colour going gold before it goes.',
  Night: 'Dark grounds and things that glow: lanterns, city lights, the sea and the sky.',
};

export const WORK_ENERGIES = ['calm', 'lively'];

/** Pace steps, as the Look panel numbers them: 0 very slow ... 3 real time ... 5 brisk. */
const VERY_SLOW = 0;
const SLOW = 1;
const UNHURRIED = 2;
const REAL_TIME = 3;
const LIVELY = 4;

const work = (room, energy, title, o) => ({
  room, energy, title,
  grain: false, mat: 'none', finish: 'none', ground: 'none', space: 'none', pace: REAL_TIME, living: 'still',
  ...o,
});

export const WORKS = {
  // --- Dawn --------------------------------------------------------------------------
  glass: work('Dawn', 'calm', 'A drop in the glass', {
    scene: 'inkwater', palette: 'porcelain', kit: 'water', space: 'room', pace: SLOW,
    cartel: 'Colour falling into a glass of clear water and opening into slow clouds. Each event is one drop from the brush, and the sound of it landing.',
  }),
  pond: work('Dawn', 'calm', 'Morning pond', {
    scene: 'ripples', palette: 'porcelain', kit: 'chimes', space: 'room',
    finish: 'watercolour', mat: 'thin', pace: SLOW,
    cartel: 'Rings on a garden pond on a pale morning, painted wet into wet. Wind chimes somewhere along the veranda.',
  }),
  blossom: work('Dawn', 'calm', 'Cherry blossom', {
    scene: 'petals', palette: 'porcelain', kit: 'koto', space: 'hall', pace: UNHURRIED, living: 'drift',
    cartel: 'Petals coming down onto a still pond and drifting together on the current, with a koto in the next room. The colours wander very slowly, as the morning does.',
  }),
  washes: work('Dawn', 'calm', 'Wet paper', {
    scene: 'washes', palette: 'straw', kit: 'chimes', space: 'room',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Watercolour touched onto paper still wet from the brush, each wash spreading by itself and darkening at its edge as it dries.',
  }),
  loom: work('Dawn', 'calm', 'On the loom', {
    scene: 'weaving', palette: 'linen', kit: 'strings', space: 'room', mat: 'thin', pace: UNHURRIED,
    cartel: 'Bands of colour growing row by row, and plucked strings for the shuttle going across.',
  }),
  sampler: work('Dawn', 'calm', 'Sampler', {
    scene: 'bloom', palette: 'bone', kit: 'musicbox', space: 'room',
    finish: 'stitch', mat: 'gallery', pace: SLOW,
    cartel: 'The first scene of all, worked in cross-stitch on linen, with a music box to sew by.',
  }),

  // --- Daylight --------------------------------------------------------------------------
  lilypond: work('Daylight', 'calm', 'The lily pond', {
    scene: 'lilies', palette: 'porcelain', kit: 'water', space: 'room', mat: 'gallery', living: 'daylight',
    cartel: 'A pond painted in broken strokes, with the sky in it and flowers opening at each event. Its light follows the real hour, as the painters who stood beside such ponds all day found it did.',
  }),
  gravel: work('Daylight', 'calm', 'Stones and gravel', {
    scene: 'zengarden', palette: 'bone', kit: 'handbells', space: 'hall', pace: VERY_SLOW,
    cartel: 'Raked gravel and a few stones, the rake going round each new stone as it is set down. Handbells, a long way apart.',
  }),
  squares: work('Daylight', 'calm', 'Homage in three squares', {
    scene: 'squares', palette: 'linen', kit: 'handbells', space: 'hall',
    finish: 'paper', mat: 'gallery', pace: VERY_SLOW,
    cartel: 'Squares set inside squares, the colours close enough to change one another.',
  }),
  constellations: work('Daylight', 'calm', 'Signs on the page', {
    scene: 'signs', palette: 'newsprint', kit: 'musicbox', space: 'room',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Stars, moons and eyes strung on fine threads across a page, one sign for each event, one note of a music box for each sign.',
  }),
  limetrees: work('Daylight', 'calm', 'Under the lime trees', {
    scene: 'canopy', palette: 'straw', kit: 'birds', space: 'none',
    finish: 'watercolour', mat: 'thin', pace: UNHURRIED,
    cartel: 'Pools of sunlight trembling on a path under a tree, and birds in the branches overhead.',
  }),
  sunday: work('Daylight', 'calm', 'Sunday in the park', {
    scene: 'canopy', palette: 'straw', kit: 'birds', space: 'none',
    finish: 'pointillist', mat: 'gallery', pace: UNHURRIED,
    cartel: 'Light through the leaves set down in dots of pure colour, left for the eye to mix, as the pointillists painted an afternoon by the river.',
  }),
  marbler: work('Daylight', 'calm', "The marbler's tray", {
    scene: 'marbling', palette: 'papyrus', kit: 'water', space: 'room',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Colour dropped on water and drawn into veins with a comb. Each event is a drop, and the sound of it landing.',
  }),
  bauhaus: work('Daylight', 'lively', 'Bauhaus workshop', {
    scene: 'bauhaus', palette: 'papyrus', kit: 'marimba', space: 'room',
    finish: 'riso', mat: 'thin',
    cartel: 'Circles, bars and half-moons rearranged on a grid, printed in two inks. The marimba keeps the time of a busy workshop.',
  }),
  scissors: work('Daylight', 'lively', 'Scissors and gouache', {
    scene: 'cutouts', palette: 'chalk', kit: 'steelpan', space: 'room',
    finish: 'paper', mat: 'thin', pace: UNHURRIED,
    cartel: 'Leaves and fronds cut straight out of painted paper, turning slowly. The steel pan keeps it light.',
  }),
  bubbles: work('Daylight', 'lively', 'Bubbles', {
    scene: 'bubbles', palette: 'daylight', kit: 'glassy', space: 'room', pace: UNHURRIED,
    cartel: 'Soap bubbles drifting across a soft light, their skins swirling with colour. Every event blows another, and each has its glass note.',
  }),
  studiofloor: work('Daylight', 'lively', 'The studio floor', {
    scene: 'drip', palette: 'vellum', kit: 'clay', space: 'room', pace: LIVELY, living: 'mood',
    cartel: 'Paint flung across a canvas laid on the floor, loop over loop, the colours warming as the feed gets busy. Clay and wood for the knock of the stick on the rim of the can.',
  }),

  // --- Dusk -----------------------------------------------------------------------------
  templebell: work('Dusk', 'calm', 'Temple bell at dusk', {
    scene: 'stillness', palette: 'bone', kit: 'gongs', space: 'cathedral',
    finish: 'paper', mat: 'gallery', pace: VERY_SLOW, living: 'daylight',
    cartel: 'A pale grid that barely moves, tinted by the hour, and a gong whose sound takes longer to fade than the picture takes to change.',
  }),
  chapel: work('Dusk', 'calm', 'Chapel of colour', {
    scene: 'fields', palette: 'terracotta', kit: 'glassy', space: 'cathedral',
    finish: 'paper', mat: 'gallery', pace: VERY_SLOW, living: 'drift',
    cartel: 'Two fields of colour that seem to breathe on a warm ground, in a room built for sitting still, the colours drifting over the hours.',
  }),
  dunes: work('Dusk', 'calm', 'Evening in the dunes', {
    scene: 'dunes', palette: 'ochre', kit: 'chimes', space: 'canyon',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Ridges of sand in low light, paler with distance. Chimes carried a long way on dry air.',
  }),
  toytheatre: work('Dusk', 'calm', 'Toy theatre', {
    scene: 'paperforest', palette: 'terracotta', kit: 'marimba', space: 'room', mat: 'thin', pace: UNHURRIED,
    cartel: 'A forest cut from paper and set in layers under a low sun; each event sends a paper bird across the stage.',
  }),
  starlings: work('Dusk', 'lively', 'Starlings over the marsh', {
    scene: 'murmuration', palette: 'bone', kit: 'birds', space: 'none',
    finish: 'paper',
    cartel: 'A flock at dusk folding into a ribbon and back, and a falcon going through it at every event.',
  }),
  mosaic: work('Dusk', 'lively', 'Mosaic floor', {
    scene: 'tesserae', palette: 'terracotta', kit: 'clay', space: 'hall', mat: 'thin',
    cartel: 'Stones set in mortar where each event lands, in rows that follow the floor. Clay and wood underfoot.',
  }),
  underpass: work('Dusk', 'lively', 'Wall of the underpass', {
    scene: 'spray', palette: 'slate', kit: 'synth', space: 'cistern', pace: LIVELY,
    cartel: 'Spray paint on concrete, stroke over stroke, with the echo of a tunnel.',
  }),

  // --- Night -----------------------------------------------------------------------------
  kyoto: work('Night', 'calm', 'Nocturne in Kyoto', {
    scene: 'floatingink', palette: 'ink', kit: 'koto', space: 'hall',
    finish: 'ink', mat: 'gallery', pace: SLOW,
    cartel: 'Rings of ink spread on still water while a koto is plucked in the next room. Each event is one touch of the brush and one note; nothing hurries.',
  }),
  floatingworld: work('Night', 'calm', 'Floating world', {
    scene: 'marbling', palette: 'lacquer', kit: 'koto', space: 'hall',
    finish: 'gold', mat: 'gallery', pace: SLOW,
    cartel: 'Colour dropped on water and combed, then laid in gold on black lacquer. The strings answer every drop.',
  }),
  lanterns: work('Night', 'calm', 'Lanterns on the lake', {
    scene: 'lanterns', palette: 'ink', kit: 'handbells', space: 'canyon', grain: true, pace: SLOW,
    cartel: 'Paper lanterns let go from the shore one by one, rising until each is one more star, their light lying in the water. A bell across the lake for each.',
  }),
  deepwater: work('Night', 'calm', 'Deep water', {
    scene: 'jellyfish', palette: 'abyss', kit: 'water', space: 'cistern', pace: SLOW, living: 'mood',
    cartel: 'Jellyfish pulsing in the dark, lit from inside; the water warms a little when the feed is busy and cools again when it is quiet.',
  }),
  firstsnow: work('Night', 'calm', 'First snow', {
    scene: 'snowfall', palette: 'prussian', kit: 'musicbox', space: 'hall', pace: SLOW,
    cartel: 'Snow falling past lit windows and settling on the roofs a little more every minute. Somewhere a light goes on, with a note of a music box.',
  }),
  rain: work('Night', 'calm', 'Rain in the city', {
    scene: 'windowrain', palette: 'prussian', kit: 'night', space: 'room',
    mat: 'thin', grain: true, pace: UNHURRIED,
    cartel: 'A window at night, the street gone soft behind the glass, drops sliding down it. The sounds of the night outside.',
  }),
  fireflies: work('Night', 'calm', 'Fireflies in the meadow', {
    scene: 'fireflies', palette: 'ink', kit: 'camargue', space: 'none', pace: SLOW,
    cartel: 'A warm meadow after dark, and fireflies that fall into step with each other whenever something happens.',
  }),
  seaglow: work('Night', 'calm', 'Sea glow', {
    scene: 'seaglow', palette: 'abyss', kit: 'shore', space: 'none', grain: true, pace: SLOW,
    cartel: 'Waves breaking on a dark beach and lighting up blue where they are stirred. The sea, and nothing else.',
  }),
  aurora: work('Night', 'calm', 'Northern lights', {
    scene: 'aurora', palette: 'seanight', kit: 'glacier', space: 'cathedral', pace: VERY_SLOW,
    cartel: 'Curtains of light over a dark landscape, and the long groan of ice somewhere out of sight.',
  }),
  lavalamp: work('Night', 'calm', 'Lava lamp', {
    scene: 'lavalamp', palette: 'amber', kit: 'synth', space: 'plate', pace: SLOW,
    cartel: 'Warm wax rising and sinking in a glass, and a soft synthesiser for the hours it keeps you company.',
  }),
  fallingcode: work('Night', 'lively', 'Falling code', {
    scene: 'digitalrain', palette: 'ink', kit: 'synth', space: 'plate', grain: true,
    cartel: "Every event's title falling down a black screen in green, one letter at a time, among a softer rain of characters. A synthesiser note for each line as it starts to fall.",
  }),
  fireworks: work('Night', 'lively', 'Fireworks across the bay', {
    scene: 'fireworks', palette: 'cobalt', kit: 'hatnote', space: 'canyon', mat: 'thin',
    cartel: 'Small silent bursts over a far shore, trembling in the water. The bells arrive a moment late, as sound does over water.',
  }),
  mould: work('Night', 'lively', 'The mould at night', {
    scene: 'physarum', palette: 'abyss', kit: 'synth', space: 'plate', ground: 'black',
    cartel: 'A slime mould spreading its veins across black card, rewiring itself towards every event as a mould reaches for food. A synthesiser note for each one it finds.',
  }),

  window: work('Night', 'calm', 'Frost on the window', {
    scene: 'frost', palette: 'prussian', kit: 'glassy', space: 'hall', pace: UNHURRIED,
    cartel: 'A cold window, taking the night. Each event is a speck for the ice to start from, and every wandering particle that touches what is already frozen stays there for good -- which is the whole reason frost is feathered. Glass, held long, for each one that settles.',
  }),
  struck: work('Daylight', 'lively', 'The struck pane', {
    scene: 'fracture', palette: 'bone', kit: 'clay', space: 'plate', ground: 'cotton',
    cartel: 'A sheet of glass, struck wherever an event lands. The cracks run out until they meet a crack already there and stop dead, so the pane keeps the order it was broken in: the first blow is the wide pattern, and every one after it is smaller.',
  }),

  // --- grown on paper ------------------------------------------------------------------
  currents: work('Daylight', 'lively', 'Gouache currents', {
    scene: 'ribbons', palette: 'linen', kit: 'marimba', space: 'room', ground: 'cotton',
    cartel: 'Ribbons of gouache laid along an unseen current on heavy cotton paper, each event starting one, none ever crossing another. A marimba for every stroke.',
  }),
  engraved: work('Daylight', 'calm', 'Spheres, engraved', {
    scene: 'stipple', palette: 'bone', kit: 'musicbox', space: 'room', ground: 'cotton', mat: 'gallery', pace: SLOW,
    cartel: 'Spheres on a table, stippled dot by dot as an engraver shades a ball, with their shadows cast behind them. Every event sets another down, and the dots drift to model it.',
  }),
  underground: work('Daylight', 'calm', 'Under the garden', {
    scene: 'roots', palette: 'linen', kit: 'koto', space: 'room', ground: 'kraft', pace: UNHURRIED,
    cartel: 'Roots drawn in ink on brown paper, reaching out for whatever each event leaves in the soil. A koto, plucked as they branch.',
  }),
  coral: work('Dawn', 'calm', 'Coral line', {
    scene: 'growth', palette: 'porcelain', kit: 'glassy', space: 'hall', ground: 'washi', pace: SLOW,
    cartel: 'One line on washi paper that keeps growing and folding without ever touching itself, leaving its past shapes behind it like the rings of a coral. Glass, softly, for each fold.',
  }),
  survey: work('Dusk', 'calm', 'Survey of the hills', {
    scene: 'topo', palette: 'straw', kit: 'clay', space: 'room', ground: 'aged', mat: 'thin', pace: SLOW,
    cartel: 'A survey map on an old sheet, the contours and hachures redrawn as every event raises a hill or sinks a hollow. Clay and wood for the surveyor\'s pegs.',
  }),

  arrival: work('Night', 'lively', 'Arrival by night', {
    scene: 'nightflight', palette: 'amber', kit: 'airports', space: 'hall',
    mat: 'gallery', pace: UNHURRIED,
    cartel: 'A city in sodium orange sliding beneath the wing, headlights moving along its streets. Music for the terminal below.',
  }),
};

/** The works in a room, in the order they are hung. */
export const worksIn = (room) => Object.entries(WORKS).filter(([, w]) => w.room === room);

/** How fast a work runs, as a multiplier and as a word. */
export const WORK_PACE = [0.25, 0.5, 0.75, 1, 1.3, 1.7];
const PACE_WORDS = ['very slow', 'slow', 'unhurried', 'real time', 'lively', 'brisk'];

/**
 * The line under a title, the way a museum label gives the medium.
 *
 * It lives here rather than in the panel that first needed it, because the
 * wall needs the same sentence: a label on a projection and a label in the
 * Gallery that disagreed about what a work is made of would be worse than no
 * label at all.
 */
export function mediumOf(work, catalogues) {
  const w = typeof work === 'string' ? WORKS[work] : work;
  if (!w) return '';
  const { SCENES, PALETTES, FINISHES, GROUNDS, MATS, KITS, SPACES, LIVING } = catalogues;
  return [
    SCENES[w.scene].label,
    `${PALETTES[w.palette].label} palette`,
    w.finish === 'none' ? '' : FINISHES[w.finish].label,
    w.ground === 'none' ? '' : `on ${GROUNDS[w.ground].label.toLowerCase()}`,
    w.mat === 'none' ? '' : MATS[w.mat].label.toLowerCase(),
    KITS[w.kit].label,
    !SPACES || w.space === 'none' ? '' : SPACES[w.space].label.toLowerCase(),
    PACE_WORDS[w.pace],
    w.living === 'still' ? '' : LIVING[w.living].label.toLowerCase(),
  ].filter(Boolean).join(' · ');
}
