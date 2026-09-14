// How the scenes are presented: which shelf each sits on, and what it says.
//
// The notes that live beside each scene's code were written by somebody who
// had just written the code, and they read like it: dates, theorems, the name
// of the equation. That is worth keeping and it is kept -- as "How it's made",
// one click away. What a person choosing a picture wants first is what it
// looks like and what it feels like, so that is what is said first.
//
// Kept here rather than in the eleven family files, because presentation is a
// curatorial decision taken across all of them at once. A scene added without
// an entry still works: it keeps its own note and goes on the last shelf.

export const SCENE_SHELVES = [
  "Painters' rooms",
  'Nature and night',
  'Materials',
  'Light and marks',
  'Weaves and fields',
  'Drawing machines',
  'Growth and matter',
  'Landscapes and records',
  'Pattern and tile',
  'Deep structures',
  'Curiosities',
  'Other',
];

const S = (shelf, note) => ({ shelf, note });

export const CATALOGUE = {
  // --- painters' rooms ----------------------------------------------------
  squares: S("Painters' rooms", 'Squares inside squares, in colours close enough to change one another as you look.'),
  fields: S("Painters' rooms", 'Soft rectangles of colour hovering on a coloured ground, breathing very slowly.'),
  cutouts: S("Painters' rooms", 'Leaves and fronds cut straight out of painted paper, turning in the air.'),
  discs: S("Painters' rooms", 'Great wheels of colour, each quarter making its neighbour look different.'),
  signs: S("Painters' rooms", 'Stars, moons and eyes strung together on fine threads across the night.'),
  mobile: S("Painters' rooms", 'Discs balanced on wire arms, turning in air you cannot feel.'),
  bauhaus: S("Painters' rooms", 'Circles, bars and half-moons on a strict grid, a poster that rearranges itself.'),
  weaving: S("Painters' rooms", 'Bands of colour growing row by row, as if the cloth were still on the loom.'),
  memphis: S("Painters' rooms", 'Squiggles, confetti and terrazzo in loud colours with black outlines.'),
  stillness: S("Painters' rooms", 'Pencil lines on a pale ground and bands of colour you feel more than see.'),
  drip: S("Painters' rooms", 'Paint flung from a stick in loops that thin to threads and break into spatter.'),
  temperament: S("Painters' rooms", 'A calm grid when the world is quiet; paint starts to fly when it is not.'),

  // --- nature and night ---------------------------------------------------
  windowrain: S('Nature and night', 'Rain on a window at night, the city gone soft and round behind the glass.'),
  fireflies: S('Nature and night', 'A warm meadow at dusk, and fireflies that fall into step with one another.'),
  murmuration: S('Nature and night', 'Starlings at dusk, one cloud folding into a ribbon and back again.'),
  seaglow: S('Nature and night', 'Waves breaking on a dark beach and glowing blue where they are stirred.'),
  canopy: S('Nature and night', 'Pools of sunlight on a path, trembling as the leaves move overhead.'),
  aurora: S('Nature and night', 'Curtains of green light hanging in folds over a dark landscape.'),
  dunes: S('Nature and night', 'Sand dunes in low evening light, one face warm and one in shadow.'),
  nightflight: S('Nature and night', 'A city seen from a plane at night, streets in sodium orange sliding below.'),
  fireworks: S('Nature and night', 'Small silent fireworks over a far shore, trembling in the water of the bay.'),

  // --- materials ----------------------------------------------------------
  marbling: S('Materials', 'Colour dropped onto water and combed slowly into feathers and veins.'),
  floatingink: S('Materials', 'Rings of ink floating on still water, spreading like the grain of wood.'),
  lavalamp: S('Materials', 'Warm wax rising in slow columns, pinching apart and joining again.'),
  spray: S('Materials', 'A wall worked with spray cans: soft strokes, overspray and the odd drip.'),
  tesserae: S('Materials', 'Small stones set in mortar, laid in rows that follow the flow of the floor.'),
  tornpaper: S('Materials', 'Coloured papers torn by hand and laid over one another, white edges showing.'),

  // --- light and marks ----------------------------------------------------
  bloom: S('Light and marks', 'Each event opens like a flower and lets go, leaving a ring on the water behind it.'),
  constellation: S('Light and marks', 'Events become stars, and the busy ones find each other across the dark.'),
  ripples: S('Light and marks', 'Rings spreading on a still pond, crossing and forgetting each other.'),
  radar: S('Light and marks', 'A slow sweep of light that finds each event as it passes, like a lighthouse over a night sea.'),
  nebula: S('Light and marks', 'Soft light piled on soft light, so the busy moments glow and the quiet ones stay dim.'),
  rain: S('Light and marks', 'Drops falling through the dark and breaking on a surface you cannot see.'),
  orbits: S('Light and marks', 'Small things circling fast and close, large ones drifting slowly far out.'),
  spiral: S('Light and marks', 'Seeds set out one by one, in the pattern of a sunflower head.'),

  // --- weaves and fields --------------------------------------------------
  flow: S('Weaves and fields', 'Motes carried on a current you cannot see, leaving the shape of the wind behind them.'),
  grid: S('Weaves and fields', 'A calm grid that each event nudges out of true, and that slowly settles back.'),
  truchet: S('Weaves and fields', 'Tiles turning over one at a time, until a single line wanders through the whole wall.'),
  threads: S('Weaves and fields', 'Level threads parted by each event, weaving a cloth out of where things happened.'),
  wavefield: S('Weaves and fields', 'A meadow of short strokes leaning together in a slow breeze.'),
  tenprint: S('Weaves and fields', 'The same small gesture repeated until it becomes a labyrinth.'),
  interruptions: S('Weaves and fields', 'A calm field of strokes with pieces missing, where the gaps are the drawing.'),
  moire: S('Weaves and fields', 'Two ring patterns laid over each other, and a third appearing that belongs to neither.'),
  opwaves: S('Weaves and fields', 'Bands that swell and turn, so a flat wall seems to breathe.'),

  // --- drawing machines ---------------------------------------------------
  spirograph: S('Drawing machines', 'The toy that draws: a wheel rolling inside a ring, and a loop that closes on itself.'),
  harmonograph: S('Drawing machines', 'A pendulum pen that draws while it slows, and stops when the drawing is finished.'),
  guilloche: S('Drawing machines', 'The fine engraved rosettes on the back of a pocket watch.'),
  maurer: S('Drawing machines', 'Straight lines stitched across a rose until it turns into lace.'),
  supershape: S('Drawing machines', 'One shape that can be a flower, a star or a shard, depending on how it is held.'),
  rose: S('Drawing machines', 'Petals drawn in a single stroke, overlapping into a bouquet.'),
  lissajous: S('Drawing machines', 'Each event traces its own loop, a knot tied from two slow rhythms.'),
  timestable: S('Drawing machines', 'Threads pulled across a circle, and a heart appearing out of them.'),
  polar: S('Drawing machines', 'Rings added one by one, like the grain of a cut tree.'),

  // --- growth and matter --------------------------------------------------
  coral: S('Growth and matter', 'Something slowly building itself grain by grain, like coral, or frost on a window.'),
  substrate: S('Growth and matter', 'Cracks spreading across drying clay until they draw the plan of a city.'),
  reaction: S('Growth and matter', "Two colours feeding on each other, making the spots and stripes of an animal's coat."),
  sandpile: S('Growth and matter', 'Sand poured on a table, holding and holding, then sliding all at once.'),
  fern: S('Growth and matter', 'A single fern frond unfurling out of the dark.'),
  lsystem: S('Growth and matter', 'A tree growing branch by branch, each branch a smaller copy of the whole.'),
  metaballs: S('Growth and matter', 'Blobs of liquid light that merge before they touch.'),
  walk: S('Growth and matter', 'Wandering lines, each one lost in thought.'),
  boids: S('Growth and matter', 'A flock that moves as one without anyone leading it.'),
  life: S('Growth and matter', 'Tiny colonies that grow, collide and die out, and a few that walk away.'),
  langton: S('Growth and matter', 'One small creature pacing a floor, making a mess, then suddenly setting off in a straight line.'),
  pursuit: S('Growth and matter', 'Dancers each chasing the next, spiralling in towards the middle.'),

  // --- landscapes and records ---------------------------------------------
  terrain: S('Landscapes and records', 'A mountain ridge rising under each event and drifting away behind you.'),
  skyline: S('Landscapes and records', 'A city built one tower at a time, scrolling past a train window.'),
  pile: S('Landscapes and records', 'Everything that happened falls and settles into a heap you can watch growing.'),
  ripple: S('Landscapes and records', 'Waves in a shallow tank, bouncing off the walls and passing through each other.'),
  chladni: S('Landscapes and records', 'Sand on a singing metal plate, gathering on the lines where it is still.'),
  burin: S('Landscapes and records', 'The picture cut as an old engraving, its lines swelling where things are busy.'),

  // --- pattern and tile ---------------------------------------------------
  penrose: S('Pattern and tile', 'A floor of two tiles that never repeats, however far you walk across it.'),
  girih: S('Pattern and tile', 'Stars laced into one another, as in the tiled walls of old Isfahan.'),
  carpet: S('Pattern and tile', 'A square cut away inside itself, again and again, like lace made of rooms.'),
  apollonian: S('Pattern and tile', 'Circles fitted into the gaps between circles, smaller and smaller, forever.'),
  packing: S('Pattern and tile', 'Bubbles that grow until they touch, filling the space between them.'),
  mondrian: S('Pattern and tile', 'A canvas divided into rooms of colour, one line at a time.'),
  voronoi: S('Pattern and tile', "The pattern of a giraffe's coat or of dried mud: every point belongs to its nearest neighbour."),
  delaunay: S('Pattern and tile', 'A web of triangles strung between events, taut and even.'),
  worley: S('Pattern and tile', 'Stones, scales and cells, softly shaded where they meet.'),
  poisson: S('Pattern and tile', 'An even scatter with no clumps and no rows, like stars in a clear sky.'),
  maze: S('Pattern and tile', 'A walled garden of corridors, lit wherever an event walks through.'),
  quasicrystal: S('Pattern and tile', 'Overlapping waves that make a pattern which never quite repeats.'),

  // --- deep structures ----------------------------------------------------
  attractor: S('Deep structures', 'A cloud of dust that keeps returning to the same impossible shape.'),
  lorenz: S('Deep structures', 'The two wings of a butterfly, traced by something that can never settle.'),
  dejong: S('Deep structures', 'A silk scarf folding through itself in the dark.'),
  julia: S('Deep structures', 'The coastline of an imaginary island, endlessly detailed.'),
  koch: S('Deep structures', 'A snowflake whose edge grows longer every time you look closer.'),
  dragon: S('Deep structures', 'A strip of paper folded again and again, opening into a dragon.'),
  hilbert: S('Deep structures', 'One unbroken line that visits every room of a house without crossing itself.'),

  // --- curiosities --------------------------------------------------------
  ulam: S('Curiosities', 'Whole numbers laid on a spiral, and the prime ones lining up on diagonals nobody can explain.'),
  collatz: S('Curiosities', 'A strange tree grown from one simple rule about numbers.'),
  rule30: S('Curiosities', 'One rule, eight bits long, and a tapestry that looks random all the way down.'),
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
