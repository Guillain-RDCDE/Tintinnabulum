// Works: finished pieces, each a picture, a sound and a way of showing them.
//
// Everything a person can set -- a scene, a palette, a kit of sounds, the room
// it plays in, a finish, a frame, a pace -- makes several hundred thousand
// combinations, and almost nobody wants to find the good ones by hand. A work
// is one of them, chosen, given a title and a label, and hung in a room with
// others that belong with it. Choosing a work is one click; everything it sets
// can still be changed afterwards.
//
// A work names only things that exist. The test suite checks every field
// against the catalogues, so a renamed scene or palette fails loudly here
// instead of producing a work that silently falls back to the defaults.

export const WORK_ROOMS = ['Japan', 'The painters', 'Nature', 'Night', 'The workshop'];

/** Pace steps, as the Look panel numbers them: 0 very slow ... 3 real time ... 5 brisk. */
const VERY_SLOW = 0;
const SLOW = 1;
const UNHURRIED = 2;
const REAL_TIME = 3;
const LIVELY = 4;

const work = (room, title, o) => ({ room, title, grain: false, mat: 'none', finish: 'none', space: 'none', pace: REAL_TIME, ...o });

export const WORKS = {
  // --- Japan -------------------------------------------------------------------
  kyoto: work('Japan', 'Nocturne in Kyoto', {
    scene: 'floatingink', palette: 'ink', kit: 'koto', space: 'hall',
    finish: 'ink', mat: 'gallery', pace: SLOW,
    cartel: 'Rings of ink spread on still water while a koto is plucked in the next room. Each event is one touch of the brush and one note; nothing hurries.',
  }),
  floatingworld: work('Japan', 'Floating world', {
    scene: 'marbling', palette: 'lacquer', kit: 'koto', space: 'hall',
    finish: 'gold', mat: 'gallery', pace: SLOW,
    cartel: 'Colour dropped on water and combed, then laid in gold on black lacquer. The strings answer every drop.',
  }),
  pond: work('Japan', 'Petals on the pond', {
    scene: 'ripples', palette: 'porcelain', kit: 'chimes', space: 'room',
    finish: 'watercolour', mat: 'thin', pace: SLOW,
    cartel: 'Rings on a garden pond on a pale morning, painted wet into wet. Wind chimes somewhere along the veranda.',
  }),
  templebell: work('Japan', 'Temple bell at dusk', {
    scene: 'stillness', palette: 'bone', kit: 'gongs', space: 'cathedral',
    finish: 'paper', mat: 'gallery', pace: VERY_SLOW,
    cartel: 'A pale grid that barely moves, and a gong whose sound takes longer to fade than the picture takes to change.',
  }),

  // --- The painters ---------------------------------------------------------------
  bauhaus: work('The painters', 'Bauhaus workshop', {
    scene: 'bauhaus', palette: 'papyrus', kit: 'marimba', space: 'room',
    finish: 'riso', mat: 'thin',
    cartel: 'Circles, bars and half-moons rearranged on a grid, printed in two inks. The marimba keeps the time of a busy workshop.',
  }),
  squares: work('The painters', 'Homage in three squares', {
    scene: 'squares', palette: 'linen', kit: 'handbells', space: 'hall',
    finish: 'paper', mat: 'gallery', pace: VERY_SLOW,
    cartel: 'Squares set inside squares, the colours close enough to change one another. Handbells, a long way apart.',
  }),
  chapel: work('The painters', 'Chapel of colour', {
    scene: 'fields', palette: 'terracotta', kit: 'glassy', space: 'cathedral',
    finish: 'paper', mat: 'gallery', pace: VERY_SLOW,
    cartel: 'Two fields of colour that seem to breathe on a warm ground, in a room built for sitting still. Glass tones in a stone space.',
  }),
  scissors: work('The painters', 'Scissors and gouache', {
    scene: 'cutouts', palette: 'chalk', kit: 'steelpan', space: 'room',
    finish: 'paper', mat: 'thin', pace: UNHURRIED,
    cartel: 'Leaves and fronds cut straight out of painted paper, turning slowly. The steel pan keeps it light.',
  }),
  constellations: work('The painters', 'Signs in the night', {
    scene: 'signs', palette: 'newsprint', kit: 'musicbox', space: 'room',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Stars, moons and eyes strung on fine threads across a page, one sign for each event, one note of a music box for each sign.',
  }),
  studiofloor: work('The painters', 'The studio floor', {
    scene: 'drip', palette: 'vellum', kit: 'clay', space: 'room', pace: LIVELY,
    cartel: 'Paint flung across a canvas laid on the floor, loop over loop. Clay and wood for the knock of the stick on the rim of the can.',
  }),

  // --- Nature -----------------------------------------------------------------------
  starlings: work('Nature', 'Starlings over the marsh', {
    scene: 'murmuration', palette: 'bone', kit: 'birds', space: 'none',
    finish: 'paper',
    cartel: 'A flock at dusk folding into a ribbon and back, and a falcon going through it at every event. The dawn chorus, heard at the other end of the day.',
  }),
  dunes: work('Nature', 'Evening in the dunes', {
    scene: 'dunes', palette: 'ochre', kit: 'chimes', space: 'canyon',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Ridges of sand in low light, one face warm and one in shadow. Chimes carried a long way on dry air.',
  }),
  limetrees: work('Nature', 'Under the lime trees', {
    scene: 'canopy', palette: 'straw', kit: 'birds', space: 'none',
    finish: 'watercolour', mat: 'thin', pace: UNHURRIED,
    cartel: 'Pools of sunlight trembling on a path under a tree, and birds in the branches overhead.',
  }),

  // --- Night --------------------------------------------------------------------------
  rain: work('Night', 'Rain in the city', {
    scene: 'windowrain', palette: 'prussian', kit: 'night', space: 'room',
    mat: 'thin', grain: true, pace: UNHURRIED,
    cartel: 'A window at night, the street gone soft behind the glass, drops sliding down it. The sounds of the night outside.',
  }),
  fireflies: work('Night', 'Fireflies in the meadow', {
    scene: 'fireflies', palette: 'ink', kit: 'camargue', space: 'none', pace: SLOW,
    cartel: 'A warm meadow after dark, and fireflies that fall into step with each other whenever something happens.',
  }),
  seaglow: work('Night', 'Sea glow', {
    scene: 'seaglow', palette: 'abyss', kit: 'shore', space: 'none', grain: true, pace: SLOW,
    cartel: 'Waves breaking on a dark beach and lighting up blue where they are stirred. The sea, and nothing else.',
  }),
  arrival: work('Night', 'Arrival by night', {
    scene: 'nightflight', palette: 'amber', kit: 'airports', space: 'hall',
    mat: 'gallery', pace: UNHURRIED,
    cartel: 'A city in sodium orange sliding beneath the wing, headlights moving along its streets. Music for the terminal below.',
  }),
  aurora: work('Night', 'Northern lights', {
    scene: 'aurora', palette: 'seanight', kit: 'glacier', space: 'cathedral', pace: VERY_SLOW,
    cartel: 'Curtains of light over a dark landscape, and the long groan of ice somewhere out of sight.',
  }),
  fireworks: work('Night', 'Fireworks across the bay', {
    scene: 'fireworks', palette: 'cobalt', kit: 'hatnote', space: 'canyon', mat: 'thin',
    cartel: 'Small silent bursts over a far shore, trembling in the water. The bells arrive a moment late, as sound does over water.',
  }),

  // --- The workshop ---------------------------------------------------------------------
  marbler: work('The workshop', "The marbler's tray", {
    scene: 'marbling', palette: 'papyrus', kit: 'water', space: 'room',
    finish: 'paper', mat: 'gallery', pace: SLOW,
    cartel: 'Colour dropped on water and drawn into veins with a comb. Each event is a drop, and the sound of it landing.',
  }),
  lavalamp: work('The workshop', 'Lava lamp', {
    scene: 'lavalamp', palette: 'amber', kit: 'synth', space: 'plate', pace: SLOW,
    cartel: 'Warm wax rising and sinking in a glass, and a soft synthesiser for the hours it keeps you company.',
  }),
  mosaic: work('The workshop', 'Mosaic floor', {
    scene: 'tesserae', palette: 'terracotta', kit: 'clay', space: 'hall', mat: 'thin',
    cartel: 'Stones set in mortar where each event lands, in rows that follow the floor. Clay and wood underfoot.',
  }),
  underpass: work('The workshop', 'Wall of the underpass', {
    scene: 'spray', palette: 'slate', kit: 'synth', space: 'cistern', pace: LIVELY,
    cartel: 'Spray paint on concrete, stroke over stroke, with the echo of a tunnel.',
  }),
  loom: work('The workshop', 'On the loom', {
    scene: 'weaving', palette: 'linen', kit: 'strings', space: 'room', mat: 'thin', pace: UNHURRIED,
    cartel: 'Bands of colour growing row by row, and plucked strings for the shuttle going across.',
  }),
  sampler: work('The workshop', 'Sampler', {
    scene: 'bloom', palette: 'bone', kit: 'musicbox', space: 'room',
    finish: 'stitch', mat: 'gallery', pace: SLOW,
    cartel: 'The first scene of all, worked in cross-stitch on linen, with a music box to sew by.',
  }),
};

/** The works in a room, in the order they are hung. */
export const worksIn = (room) => Object.entries(WORKS).filter(([, w]) => w.room === room);
