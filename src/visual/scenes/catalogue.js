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
  'Paper and print',
  'Nature',
  'Water',
  'Night',
  'Materials',
  'Pattern',
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
  lilies: S('Painting', 'A pond of broken brush strokes, with pads and flowers and the sky in it.'),
  mondrian: S('Painting', 'A canvas divided into rooms of colour, one line at a time.'),
  opwaves: S('Painting', 'Bands that swell and turn, so a flat wall seems to breathe.'),
  ribbons: S('Painting', 'Thick ribbons of colour following an unseen current, packed close and never crossing.'),
  aura: S('Painting', 'Wide soft clouds of colour drifting into one another, like light through frosted glass.'),
  asemic: S('Paper and print', 'A page written in a hand nobody can read, one letter for every event.'),
  rise: S('Painting', 'Rings and rays in two colours trading places where they cross, and each event running out through them.'),

  // --- nature ------------------------------------------------------------
  murmuration: S('Nature', 'Starlings at dusk, one cloud folding into a ribbon and back again.'),
  canopy: S('Nature', 'Pools of sunlight on a path, trembling as the leaves move overhead.'),
  dunes: S('Nature', 'Sand dunes in low evening light, one face warm and one in shadow.'),
  coral: S('Nature', 'Something slowly building itself grain by grain, like coral, or frost on a window.'),
  boids: S('Nature', 'A flock that moves as one without anyone leading it.'),
  growth: S('Nature', 'A single line that keeps growing and folding without ever touching itself, like coral or lichen.'),
  physarum: S('Nature', 'A slime mould spreading its glowing veins, finding the shortest way to wherever events fall.'),
  topo: S('Nature', 'A survey map drawn in contour lines and hachures, the land rising and sinking under each event.'),
  roots: S('Nature', 'Roots reaching out through dark soil towards whatever calls them, branching as they go.'),

  // --- water -------------------------------------------------------------
  bloom: S('Water', 'Each event opens like a flower and lets go, leaving a ring on the water behind it.'),
  ripples: S('Water', 'Rings spreading on a still pond, crossing and forgetting each other.'),
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
  digitalrain: S('Night', 'The titles of events falling in green down a black screen, letter by letter, among a softer rain of code.'),

  // --- materials ---------------------------------------------------------
  lavalamp: S('Materials', 'Warm wax rising in slow columns, pinching apart and joining again.'),
  spray: S('Materials', 'A wall worked with spray cans: soft strokes, overspray and the odd drip.'),
  tesserae: S('Materials', 'Small stones set in mortar, laid in rows that follow the flow of the floor.'),
  tornpaper: S('Materials', 'Coloured papers torn by hand and laid over one another, white edges showing.'),
  washes: S('Materials', 'Watercolour touched onto wet paper, spreading and darkening at its edges.'),
  zengarden: S('Materials', 'Raked gravel, straight lines and rings drawn round each stone.'),
  bubbles: S('Materials', 'Soap bubbles drifting on a soft light, their skins swirling with colour.'),
  paperforest: S('Materials', 'A forest cut from paper in layers, like a toy theatre.'),
  spectrogram: S('Materials', 'The sound of the piece written down as it happens, one column of spectrum per instant, scrolling.'),
  groove: S('Materials', 'The sound cut as a spiral from the outside in, the way it was written before anybody could play it back.'),
  chladni: S('Materials', 'Sand on a singing metal plate, gathering on the lines where it is still.'),
  substrate: S('Materials', 'Cracks spreading across drying clay until they draw the plan of a city.'),
  reaction: S('Materials', "Two colours feeding on each other, making the spots and stripes of an animal's coat."),
  burin: S('Materials', 'The picture cut as an old engraving, its lines swelling where things are busy.'),
  metaballs: S('Materials', 'Blobs of liquid light that merge before they touch.'),
  frost: S('Materials', 'Ice spreading across a cold window, feathering out from every speck it started at.'),
  fracture: S('Materials', 'A pane struck once, then again: cracks running out and stopping dead on the ones already there.'),
  stipple: S('Materials', 'Light and shade made of nothing but dots, placed as an engraver would, drifting as the light moves.'),

  // --- pattern -----------------------------------------------------------
  flow: S('Pattern', 'Motes carried on a current you cannot see, leaving the shape of the wind behind them.'),
  grid: S('Pattern', 'A calm grid that each event nudges out of true, and that slowly settles back.'),
  truchet: S('Pattern', 'Tiles turning over one at a time, until a single line wanders through the whole wall.'),
  wavefield: S('Pattern', 'A meadow of short strokes leaning together in a slow breeze.'),
  tenprint: S('Pattern', 'The same small gesture repeated until it becomes a labyrinth.'),
  interruptions: S('Pattern', 'A calm field of strokes with pieces missing, where the gaps are the drawing.'),
  moire: S('Pattern', 'Two ring patterns laid over each other, and a third appearing that belongs to neither.'),
  packing: S('Pattern', 'Bubbles that grow until they touch, filling the space between them.'),
  quasicrystal: S('Pattern', 'Overlapping waves that make a pattern which never quite repeats.'),
  voronoi: S('Pattern', "The pattern of a giraffe's coat or of dried mud: every point belongs to its nearest neighbour."),
  apollonian: S('Pattern', 'Circles fitted into the gaps between circles, smaller and smaller, forever.'),
  maze: S('Pattern', 'A walled garden of corridors, lit wherever an event walks through.'),
  poisson: S('Pattern', 'An even scatter with no clumps and no rows, like stars in a clear sky.'),
  worley: S('Pattern', 'Stones, scales and cells, softly shaded where they meet.'),
  penrose: S('Pattern', 'A floor of two tiles that never repeats, however far you walk across it.'),
  girih: S('Pattern', 'Stars laced into one another, as in the tiled walls of old Isfahan.'),
  benday: S('Pattern', 'The dot screen of an old comic, printed from a heat map: the dots swell where things are busy.'),

  // --- drawing machines --------------------------------------------------

  // --- forms and numbers -------------------------------------------------
  hilbert: S('Forms and numbers', 'One unbroken line that visits every room of a house without crossing itself.'),
  dragon: S('Forms and numbers', 'A strip of paper folded again and again, opening into a dragon.'),
  attractor: S('Forms and numbers', 'A cloud of dust that keeps returning to the same impossible shape.'),
  dejong: S('Forms and numbers', 'A silk scarf folding through itself in the dark.'),
  rule30: S('Forms and numbers', 'One rule, eight bits long, and a tapestry that looks random all the way down.'),
  life: S('Forms and numbers', 'Tiny colonies that grow, collide and die out, and a few that walk away.'),
  langton: S('Forms and numbers', 'One small creature pacing a floor, making a mess, then suddenly setting off in a straight line.'),
  walk: S('Forms and numbers', 'Wandering lines, each one lost in thought.'),
  collapse: S('Forms and numbers', 'Tiles that may only sit beside tiles they join up with, settling into a pattern that is continuous everywhere.'),
  sorts: S('Paper and print', 'A plate of type set solid -- letters, ideographs and ornaments packed line upon line, with one red heart in the whole page.'),
  emergence: S('Paper and print', 'A sentence repeated line after line, coming apart into pure sign across a band that drifts down the page.'),
  nodes: S('Paper and print', 'Plotter plates: fat dots of ink joined by level runs, stems and long arcs, each drawing made twice about its own axis.'),
  cutpaper: S('Paper and print', 'Shapes cut out of coloured paper and butted edge to edge until no ground is left, flat and without a shadow anywhere.'),
  planes: S('Paper and print', 'A few very large transparent forms laid over one another, and colours at the crossings that are in none of them.'),
  comb: S('Paper and print', 'Ninety pens drawn down the page together, and a band straight across where they all lost their composure at once.'),
  hatched: S('Paper and print', 'Fields of colour filled in by hand -- rules, crossed hatching, graphite scribbled nearly solid -- with thin coloured rails crossing the sheet.'),
  skein: S('Paper and print', 'One line that never leaves the paper, winding down to a tight knot and pulled open again by every event.'),
  worlds: S('Paper and print', 'One heavy diagonal with everything hung on it, a planet set apart in a corner, and a kit of ruled nets, sheared chequers and swelling arcs between them. What an event sounds like decides the form it takes.'),
  spindles: S('Paper and print', 'A sheet of cells filled with lines that swell and thin like thread on a spindle, some struck solid, some only grain, on the ruled grid they were laid out on.'),
  lattice: S('Paper and print', 'A fine screen of thousands of small black bars whose size runs in waves along the rows and down the columns, so the wall seems to move as you look.'),
  desordres: S('Paper and print', 'A plotter drawing the same square over and over on a grid of nine, each pass a little turned and a little moved, so a busy cell becomes a scribble with a square in it.'),
  scanlines: S('Paper and print', 'A landscape drawn with nothing but level lines: where the ground rises the line is lifted and hides what lies behind, so every event stands up as a cube, a faceted crystal or a rounded mass.'),
  orbs: S('Paper and print', 'Discs plotted in a black pen and a red one, ruled or crossed into a mesh, hung on a few construction lines or set over a horizon of reeds and water; where two overlap, a texture neither pen drew.'),
  tartan: S('Paper and print', 'A sheet woven from columns and rows of unequal width, each cell the crossing of the two -- ruling over ruling, black over anything -- cut apart in black on cream, or laid edge to edge in flat colour, and punched through with discs.'),
  peals: S('Paper and print', 'Every event a bell struck in a cloud of red dots: rings dense round a bright centre, thinning to dust on the paper, close for a high note and wide for a low one.'),
  lanes: S('Paper and print', 'White bars ruled across a black field like the rows of a knitting chart, and here and there a stitch dropped half a bar; a large event drops a staircase of them.'),
  meshes: S('Paper and print', 'A square cut and cut again into blocks, each ruled with its own mesh -- coarse, fine, crossed into stars -- over tints of stone, sand, chalk and umber, with a square of orange somewhere.'),
  lineage: S('Paper and print', 'Coloured discs on the crossings of a pale grid, each joined by a black line to the one it came from and numbered in the order it arrived: a family tree on squared paper.'),
  harmonograph: S('Forms and numbers', 'A pendulum pen that draws while it slows, and stops when the drawing is finished.'),
  ulam: S('Forms and numbers', 'Whole numbers laid on a spiral, and the prime ones lining up on diagonals nobody can explain.'),
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
