// How the scenes are presented: which shelf each sits on, and what it says.
//
// The notes that live beside each scene's code were written by somebody who
// had just written the code, and they read like it: dates, theorems, the name
// of the equation. That is worth keeping and it is kept -- as "How it's made",
// one click away. What a person choosing a picture wants first is what it
// looks like and what it feels like, so that is what is said first.
//
// Kept here rather than in the family files, because presentation is a
// curatorial decision taken across all of them at once. A scene added without
// an entry still works: it keeps its own note and goes on the last shelf.
//
// Eight shelves, each named for what is on it. The first arrangement had
// twelve, several named for the mathematics ("Deep structures", "Pattern and
// tile"), which is how the code is organised and not how anyone looks.

export const SCENE_SHELVES = [
  'Painting',
  'Nature',
  'Water',
  'Night',
  'Materials',
  'Pattern',
  'Drawing machines',
  'Forms and numbers',
  'Other',
];

const S = (shelf, note) => ({ shelf, note });

export const CATALOGUE = {
  // --- painting ----------------------------------------------------------
  squares: S('Painting', 'Squares inside squares, in colours close enough to change one another as you look.'),
  fields: S('Painting', 'Soft rectangles of colour hovering on a coloured ground, breathing very slowly.'),
  cutouts: S('Painting', 'Leaves and fronds cut straight out of painted paper, turning in the air.'),
  discs: S('Painting', 'Great wheels of colour, each quarter making its neighbour look different.'),
  signs: S('Painting', 'Stars, moons and eyes strung together on fine threads across the night.'),
  mobile: S('Painting', 'Discs balanced on wire arms, turning in air you cannot feel.'),
  bauhaus: S('Painting', 'Circles, bars and half-moons on a strict grid, a poster that rearranges itself.'),
  weaving: S('Painting', 'Bands of colour growing row by row, as if the cloth were still on the loom.'),
  memphis: S('Painting', 'Squiggles, confetti and terrazzo in loud colours with black outlines.'),
  stillness: S('Painting', 'Pencil lines on a pale ground and bands of colour you feel more than see.'),
  drip: S('Painting', 'Paint flung from a stick in loops that thin to threads and break into spatter.'),
  temperament: S('Painting', 'A calm grid when the world is quiet; paint starts to fly when it is not.'),
  lilies: S('Painting', 'A pond of broken brush strokes, with pads and flowers and the sky in it.'),
  mondrian: S('Painting', 'A canvas divided into rooms of colour, one line at a time.'),
  opwaves: S('Painting', 'Bands that swell and turn, so a flat wall seems to breathe.'),

  // --- nature ------------------------------------------------------------
  murmuration: S('Nature', 'Starlings at dusk, one cloud folding into a ribbon and back again.'),
  canopy: S('Nature', 'Pools of sunlight on a path, trembling as the leaves move overhead.'),
  dunes: S('Nature', 'Sand dunes in low evening light, one face warm and one in shadow.'),
  terrain: S('Nature', 'A mountain ridge rising under each event and drifting away behind you.'),
  coral: S('Nature', 'Something slowly building itself grain by grain, like coral, or frost on a window.'),
  boids: S('Nature', 'A flock that moves as one without anyone leading it.'),
  fern: S('Nature', 'A single fern frond unfurling out of the dark.'),
  lsystem: S('Nature', 'A tree growing branch by branch, each branch a smaller copy of the whole.'),

  // --- water -------------------------------------------------------------
  bloom: S('Water', 'Each event opens like a flower and lets go, leaving a ring on the water behind it.'),
  ripples: S('Water', 'Rings spreading on a still pond, crossing and forgetting each other.'),
  rain: S('Water', 'Drops falling through the dark and breaking on a surface you cannot see.'),
  ripple: S('Water', 'Waves in a shallow tank, bouncing off the walls and passing through each other.'),
  inkwater: S('Water', 'Drops of colour falling into a glass of water and opening into clouds.'),
  floatingink: S('Water', 'Rings of ink floating on still water, spreading like the grain of wood.'),
  marbling: S('Water', 'Colour dropped onto water and combed slowly into feathers and veins.'),
  petals: S('Water', 'Cherry blossom falling onto a pond and drifting together on the current.'),

  // --- night -------------------------------------------------------------
  windowrain: S('Night', 'Rain on a window at night, the city gone soft and round behind the glass.'),
  fireflies: S('Night', 'A warm meadow at dusk, and fireflies that fall into step with one another.'),
  seaglow: S('Night', 'Waves breaking on a dark beach and glowing blue where they are stirred.'),
  aurora: S('Night', 'Curtains of green light hanging in folds over a dark landscape.'),
  nightflight: S('Night', 'A city seen from a plane at night, streets in sodium orange sliding below.'),
  fireworks: S('Night', 'Small silent fireworks over a far shore, trembling in the water of the bay.'),
  lanterns: S('Night', 'Paper lanterns rising over a lake at night, their light in the water.'),
  jellyfish: S('Night', 'Jellyfish pulsing in deep water, lit from inside.'),
  snowfall: S('Night', 'Snow falling past lit windows and settling on the roofs.'),
  constellation: S('Night', 'Events become stars, and the busy ones find each other across the dark.'),
  radar: S('Night', 'A slow sweep of light that finds each event as it passes, like a lighthouse over a night sea.'),
  digitalrain: S('Night', 'The titles of events falling in green down a black screen, letter by letter, among a softer rain of code.'),
  nebula: S('Night', 'Soft light piled on soft light, so the busy moments glow and the quiet ones stay dim.'),

  // --- materials ---------------------------------------------------------
  lavalamp: S('Materials', 'Warm wax rising in slow columns, pinching apart and joining again.'),
  spray: S('Materials', 'A wall worked with spray cans: soft strokes, overspray and the odd drip.'),
  tesserae: S('Materials', 'Small stones set in mortar, laid in rows that follow the flow of the floor.'),
  tornpaper: S('Materials', 'Coloured papers torn by hand and laid over one another, white edges showing.'),
  washes: S('Materials', 'Watercolour touched onto wet paper, spreading and darkening at its edges.'),
  zengarden: S('Materials', 'Raked gravel, straight lines and rings drawn round each stone.'),
  bubbles: S('Materials', 'Soap bubbles drifting on a soft light, their skins swirling with colour.'),
  paperforest: S('Materials', 'A forest cut from paper in layers, like a toy theatre.'),
  chladni: S('Materials', 'Sand on a singing metal plate, gathering on the lines where it is still.'),
  substrate: S('Materials', 'Cracks spreading across drying clay until they draw the plan of a city.'),
  reaction: S('Materials', "Two colours feeding on each other, making the spots and stripes of an animal's coat."),
  sandpile: S('Materials', 'Sand poured on a table, holding and holding, then sliding all at once.'),
  burin: S('Materials', 'The picture cut as an old engraving, its lines swelling where things are busy.'),
  metaballs: S('Materials', 'Blobs of liquid light that merge before they touch.'),

  // --- pattern -----------------------------------------------------------
  flow: S('Pattern', 'Motes carried on a current you cannot see, leaving the shape of the wind behind them.'),
  grid: S('Pattern', 'A calm grid that each event nudges out of true, and that slowly settles back.'),
  truchet: S('Pattern', 'Tiles turning over one at a time, until a single line wanders through the whole wall.'),
  threads: S('Pattern', 'Level threads parted by each event, weaving a cloth out of where things happened.'),
  wavefield: S('Pattern', 'A meadow of short strokes leaning together in a slow breeze.'),
  tenprint: S('Pattern', 'The same small gesture repeated until it becomes a labyrinth.'),
  interruptions: S('Pattern', 'A calm field of strokes with pieces missing, where the gaps are the drawing.'),
  moire: S('Pattern', 'Two ring patterns laid over each other, and a third appearing that belongs to neither.'),
  packing: S('Pattern', 'Bubbles that grow until they touch, filling the space between them.'),
  quasicrystal: S('Pattern', 'Overlapping waves that make a pattern which never quite repeats.'),
  voronoi: S('Pattern', "The pattern of a giraffe's coat or of dried mud: every point belongs to its nearest neighbour."),
  apollonian: S('Pattern', 'Circles fitted into the gaps between circles, smaller and smaller, forever.'),
  maze: S('Pattern', 'A walled garden of corridors, lit wherever an event walks through.'),
  delaunay: S('Pattern', 'A web of triangles strung between events, taut and even.'),
  poisson: S('Pattern', 'An even scatter with no clumps and no rows, like stars in a clear sky.'),
  worley: S('Pattern', 'Stones, scales and cells, softly shaded where they meet.'),
  penrose: S('Pattern', 'A floor of two tiles that never repeats, however far you walk across it.'),
  girih: S('Pattern', 'Stars laced into one another, as in the tiled walls of old Isfahan.'),
  carpet: S('Pattern', 'A square cut away inside itself, again and again, like lace made of rooms.'),

  // --- drawing machines --------------------------------------------------
  spiral: S('Drawing machines', 'Seeds set out one by one, in the pattern of a sunflower head.'),
  polar: S('Drawing machines', 'Rings added one by one, like the grain of a cut tree.'),
  orbits: S('Drawing machines', 'Small things circling fast and close, large ones drifting slowly far out.'),
  lissajous: S('Drawing machines', 'Each event traces its own loop, a knot tied from two slow rhythms.'),
  supershape: S('Drawing machines', 'One shape that can be a flower, a star or a shard, depending on how it is held.'),
  maurer: S('Drawing machines', 'Straight lines stitched across a rose until it turns into lace.'),
  spirograph: S('Drawing machines', 'The toy that draws: a wheel rolling inside a ring, and a loop that closes on itself.'),
  harmonograph: S('Drawing machines', 'A pendulum pen that draws while it slows, and stops when the drawing is finished.'),
  timestable: S('Drawing machines', 'Threads pulled across a circle, and a heart appearing out of them.'),
  guilloche: S('Drawing machines', 'The fine engraved rosettes on the back of a pocket watch.'),
  rose: S('Drawing machines', 'Petals drawn in a single stroke, overlapping into a bouquet.'),

  // --- forms and numbers -------------------------------------------------
  pile: S('Forms and numbers', 'Everything that happened falls and settles into a heap you can watch growing.'),
  skyline: S('Forms and numbers', 'A city built one tower at a time, scrolling past a train window.'),
  hilbert: S('Forms and numbers', 'One unbroken line that visits every room of a house without crossing itself.'),
  dragon: S('Forms and numbers', 'A strip of paper folded again and again, opening into a dragon.'),
  attractor: S('Forms and numbers', 'A cloud of dust that keeps returning to the same impossible shape.'),
  lorenz: S('Forms and numbers', 'The two wings of a butterfly, traced by something that can never settle.'),
  dejong: S('Forms and numbers', 'A silk scarf folding through itself in the dark.'),
  koch: S('Forms and numbers', 'A snowflake whose edge grows longer every time you look closer.'),
  rule30: S('Forms and numbers', 'One rule, eight bits long, and a tapestry that looks random all the way down.'),
  life: S('Forms and numbers', 'Tiny colonies that grow, collide and die out, and a few that walk away.'),
  langton: S('Forms and numbers', 'One small creature pacing a floor, making a mess, then suddenly setting off in a straight line.'),
  walk: S('Forms and numbers', 'Wandering lines, each one lost in thought.'),
  pursuit: S('Forms and numbers', 'Dancers each chasing the next, spiralling in towards the middle.'),
  julia: S('Forms and numbers', 'The coastline of an imaginary island, endlessly detailed.'),
  ulam: S('Forms and numbers', 'Whole numbers laid on a spiral, and the prime ones lining up on diagonals nobody can explain.'),
  collatz: S('Forms and numbers', 'A strange tree grown from one simple rule about numbers.'),
};

/**
 * Apply the catalogue to a set of scenes, in place.
 *
 * The scene's own note becomes its "How it's made"; the catalogue's line
 * becomes what is shown first. Scenes with no entry keep their note and go on
 * the last shelf, so an addition never disappears for want of a curator.
 */
export function applyCatalogue(scenes) {
  for (const [name, scene] of Object.entries(scenes)) {
    const entry = CATALOGUE[name];
    if (scene.how === undefined) scene.how = entry ? scene.note : '';
    if (entry) {
      scene.note = entry.note;
      scene.shelf = entry.shelf;
    } else if (!scene.shelf) {
      scene.shelf = 'Other';
    }
  }
  return scenes;
}

/** The shelf a scene sits on. */
export function shelfOf(scenes, name) {
  return (scenes[name] && scenes[name].shelf) || 'Other';
}
