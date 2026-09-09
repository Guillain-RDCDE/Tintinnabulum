// Colour palettes for the canvas.
//
// Each palette must define every key below. `background` is the canvas ground;
// `text` is used for labels, which are stroked with `background` so they stay
// legible over any circle. The category keys colour the circles: `default` is
// the fallback for a category nobody defined, so a custom category always gets
// a visible colour rather than disappearing.
//
// Palettes are pure data. Adding one is adding an entry here.

import { lightnessOf } from './color.js';

export const PALETTE_KEYS = [
  'background', 'default', 'user', 'anon', 'bot', 'alert', 'text', 'banner', 'hud',
];

export const PALETTES = {
  nocturne: {
    label: 'Nocturne',
    family: 'Blue',
    note: 'The original: slate blue, night-time, high contrast.',
    colors: {
      background: '#1c2733',
      default: '#ffffff',
      user: '#5dade2',
      anon: '#2ecc71',
      bot: '#9b59b6',
      alert: '#e67e22',
      text: '#ffffff',
      banner: 'rgba(41, 128, 185, 0.85)',
      hud: 'rgba(41, 128, 185, 0.50)',
    },
  },

  bronze: {
    label: 'Bronze',
    family: 'Amber',
    note: 'Brass and copper. The colour of the bells the project is named after.',
    colors: {
      background: '#14100c',
      default: '#f2e2c4',
      user: '#5fb3a3',
      anon: '#d9a441',
      bot: '#8a4a26',
      alert: '#ff4d2e',
      text: '#f6ecdc',
      banner: 'rgba(176, 106, 59, 0.85)',
      hud: 'rgba(176, 106, 59, 0.50)',
    },
  },

  aurora: {
    label: 'Aurora',
    family: 'Teal',
    note: 'Mint and violet over deep teal. Cold and luminous.',
    colors: {
      background: '#071a1c',
      default: '#d7fff4',
      user: '#5ad1ff',
      anon: '#35e0a1',
      bot: '#7b6cf6',
      alert: '#ff7ab6',
      text: '#eafff9',
      banner: 'rgba(53, 224, 161, 0.75)',
      hud: 'rgba(53, 224, 161, 0.45)',
    },
  },

  ember: {
    label: 'Ember',
    family: 'Red',
    note: 'Banked fire. Warm, dim, easy at night.',
    colors: {
      background: '#1a0f0b',
      default: '#ffd9a8',
      user: '#6a9fb5',
      anon: '#ff8c42',
      bot: '#a8302c',
      alert: '#ffc300',
      text: '#fff1e0',
      banner: 'rgba(201, 69, 63, 0.85)',
      hud: 'rgba(201, 69, 63, 0.50)',
    },
  },

  ultraviolet: {
    label: 'Ultraviolet',
    family: 'Rose',
    note: 'Magenta and cyan on near-black. The loudest one here.',
    colors: {
      background: '#0d0518',
      default: '#f0e6ff',
      user: '#a3e635',
      anon: '#0891b2',
      bot: '#c026d3',
      alert: '#fbbf24',
      text: '#f5ecff',
      banner: 'rgba(192, 38, 211, 0.80)',
      hud: 'rgba(192, 38, 211, 0.50)',
    },
  },

  blueprint: {
    label: 'Blueprint',
    family: 'Blue',
    note: 'Technical drawing. Calm, and the most readable at a glance.',
    colors: {
      background: '#0b1f33',
      default: '#f1f5f9',
      user: '#2dd4bf',
      anon: '#38bdf8',
      bot: '#818cf8',
      alert: '#f59e0b',
      text: '#eaf3ff',
      banner: 'rgba(56, 189, 248, 0.75)',
      hud: 'rgba(56, 189, 248, 0.45)',
    },
  },

  sakura: {
    label: 'Sakura',
    family: 'Rose',
    note: 'Blossom and lilac on plum. Soft without losing contrast.',
    colors: {
      background: '#1b1020',
      default: '#fdf7fb',
      user: '#7ec98f',
      anon: '#ff9ec7',
      bot: '#8b5cf6',
      alert: '#ffd166',
      text: '#fff0f6',
      banner: 'rgba(255, 158, 199, 0.75)',
      hud: 'rgba(255, 158, 199, 0.45)',
    },
  },

  daylight: {
    label: 'Daylight',
    family: 'Neutral',
    note: 'Ink on paper. The one to use for screenshots and projectors.',
    colors: {
      background: '#f4f1ea',
      default: '#2f3a45',
      user: '#1d5fa8',
      anon: '#12805f',
      bot: '#7c3aed',
      alert: '#dc2626',
      text: '#1c2733',
      banner: 'rgba(47, 58, 69, 0.85)',
      hud: 'rgba(47, 58, 69, 0.45)',
    },
  },

  nordic: {
    label: 'Nordic',
    family: 'Blue',
    note: 'Ice and steel. Cool, restrained, easy to read for long stretches.',
    colors: {
      background: '#0f1720',
      default: '#eef4f8',
      user: '#8fb339',
      anon: '#4aa8c0',
      bot: '#8a7a63',
      alert: '#ffb454',
      text: '#f2f7fa',
      banner: 'rgba(74, 168, 192, 0.75)',
      hud: 'rgba(74, 168, 192, 0.45)',
    },
  },

  marine: {
    label: 'Marine',
    family: 'Blue',
    note: 'Deep water. Foam, shallows and the dark below.',
    colors: {
      background: '#04141c',
      default: '#dff3f4',
      user: '#f4795b',
      anon: '#39b7a8',
      bot: '#186b86',
      alert: '#ffd25e',
      text: '#eafafa',
      banner: 'rgba(57, 183, 168, 0.75)',
      hud: 'rgba(57, 183, 168, 0.45)',
    },
  },

  lacquer: {
    label: 'Lacquer',
    family: 'Red',
    note: 'Vermilion and gold on black, after Japanese lacquerware.',
    colors: {
      background: '#0e0a0a',
      default: '#f4ece0',
      user: '#00a878',
      anon: '#e03a26',
      bot: '#7d7468',
      alert: '#e8b44a',
      text: '#f7f1e8',
      banner: 'rgba(224, 58, 38, 0.78)',
      hud: 'rgba(224, 58, 38, 0.45)',
    },
  },

  solar: {
    label: 'Solar',
    family: 'Blue',
    note: 'Full daylight spectrum on deep navy. The brightest of the set.',
    colors: {
      background: '#0a1020',
      default: '#fff4dc',
      user: '#7ed957',
      anon: '#ffb02e',
      bot: '#c25a1c',
      alert: '#5ec8e5',
      text: '#fff8e8',
      banner: 'rgba(255, 176, 46, 0.75)',
      hud: 'rgba(255, 176, 46, 0.45)',
    },
  },

  sunset: {
    label: 'Sunset',
    family: 'Rose',
    note: 'Coral, teal and gold on deep indigo. The widest hue spread here.',
    colors: {
      background: '#14101f',
      default: '#ffe8d6',
      user: '#5b7cfa',
      anon: '#ff6b6b',
      bot: '#4ecdc4',
      alert: '#ffd23f',
      text: '#fff2e6',
      banner: 'rgba(255, 107, 107, 0.78)',
      hud: 'rgba(255, 107, 107, 0.45)',
    },
  },

  neon: {
    label: 'Neon',
    family: 'Rose',
    note: 'Arcade colours on black. Loud, and unmistakable at a glance.',
    colors: {
      background: '#05050a',
      default: '#f2f2f2',
      user: '#ff8c1a',
      anon: '#ff2e88',
      bot: '#00c8e0',
      alert: '#c6ff00',
      text: '#fafafa',
      banner: 'rgba(255, 46, 136, 0.78)',
      hud: 'rgba(255, 46, 136, 0.45)',
    },
  },

  rust: {
    label: 'Rust',
    family: 'Amber',
    note: 'Weathered iron and sand against deep teal. Warm without being loud.',
    colors: {
      background: '#101c1e',
      default: '#ece5d8',
      user: '#c47a9a',
      anon: '#d97742',
      bot: '#3f8f92',
      alert: '#f2c14e',
      text: '#f4efe6',
      banner: 'rgba(217, 119, 66, 0.78)',
      hud: 'rgba(217, 119, 66, 0.45)',
    },
  },

  papyrus: {
    label: 'Papyrus',
    family: 'Amber',
    note: 'A second light option, warmer than Daylight. Good on a projector.',
    colors: {
      background: '#f2ead8',
      default: '#1c1a17',
      user: '#4a6b2a',
      anon: '#2e7d9a',
      bot: '#b3243c',
      alert: '#e08a00',
      text: '#2b2318',
      banner: 'rgba(61, 52, 40, 0.85)',
      hud: 'rgba(61, 52, 40, 0.45)',
    },
  },

  monochrome: {
    label: 'Monochrome',
    family: 'Neutral',
    note: 'Categories separated by lightness alone, so colour vision is never required.',
    colors: {
      background: '#101214',
      default: '#c9c9c9',
      user: '#c9c9c9',
      anon: '#8a8a8a',
      bot: '#585858',
      alert: '#ffffff',
      text: '#fafafa',
      banner: 'rgba(120, 120, 120, 0.80)',
      hud: 'rgba(120, 120, 120, 0.45)',
    },
  },

  // --- paper -----------------------------------------------------------
  //
  // Two of the seventeen were on a light ground and fifteen were on the same
  // near-black: every dark one measured between 0.002 and 0.019 in relative
  // luminance, which is not a range, it is one colour with the hue changed.
  // These fill the two gaps -- more paper, and grounds that are neither paper
  // nor night.
  chalk: {
    label: 'Chalk',
    family: 'Neutral',
    note: 'Graphite and coloured pencil on cartridge paper. The coolest of the light grounds.',
    colors: {
      background: '#eef0f2',
      default: '#3c4750',
      user: '#1a6fbf',
      anon: '#0d6b3f',
      bot: '#8a4a10',
      alert: '#c0203a',
      text: '#222a30',
      banner: 'rgba(60, 71, 80, 0.85)',
      hud: 'rgba(60, 71, 80, 0.45)',
    },
  },

  linen: {
    label: 'Linen',
    family: 'Amber',
    note: 'Warm cream and sepia, the colours of a book left in the sun.',
    colors: {
      background: '#efe6d5',
      default: '#4a3d2e',
      user: '#9a5a10',
      anon: '#1f6f5a',
      bot: '#334f8a',
      alert: '#b02418',
      text: '#3a2f24',
      banner: 'rgba(74, 61, 46, 0.85)',
      hud: 'rgba(74, 61, 46, 0.45)',
    },
  },

  porcelain: {
    label: 'Porcelain',
    family: 'Blue',
    note: 'Cobalt on white, after Delft and Jingdezhen. Blue leads it, but not alone: four categories have to stay apart, and two shades of one blue cannot both be distinct from each other and legible on white.',
    colors: {
      background: '#f2f4f7',
      default: '#2b4a7a',
      user: '#0f2c63',
      anon: '#1d7f76',
      bot: '#8a5a1c',
      alert: '#a8202c',
      text: '#22304a',
      banner: 'rgba(43, 74, 122, 0.85)',
      hud: 'rgba(43, 74, 122, 0.45)',
    },
  },

  // --- grounds that are neither paper nor night --------------------------
  slate: {
    label: 'Slate',
    family: 'Blue',
    note: 'A mid grey-blue ground, the tone of a wet roof. Marks read as light on it without glaring.',
    colors: {
      background: '#48545e',
      default: '#e8edf1',
      user: '#ffc75f',
      anon: '#5fe0c8',
      bot: '#e08a9a',
      alert: '#ff7a4a',
      text: '#f2f6f9',
      banner: 'rgba(232, 237, 241, 0.32)',
      hud: 'rgba(232, 237, 241, 0.20)',
    },
  },

  terracotta: {
    label: 'Terracotta',
    family: 'Red',
    note: 'Fired clay: a warm mid ground with slip and glaze over it.',
    colors: {
      background: '#6b3628',
      default: '#f7e8dc',
      user: '#ffc247',
      anon: '#5fd8c0',
      bot: '#d4707f',
      alert: '#fff0d0',
      text: '#fdf1e8',
      banner: 'rgba(247, 232, 220, 0.32)',
      hud: 'rgba(247, 232, 220, 0.20)',
    },
  },

  sage: {
    label: 'Sage',
    family: 'Green',
    note: 'A grey-green ground, the colour of lichen on stone. Quiet, and the easiest of the set on a long session.',
    colors: {
      background: '#3f4a3c',
      default: '#f0f2e6',
      user: '#f2c14e',
      anon: '#7fe0c6',
      bot: '#e8a0b8',
      alert: '#ff7a45',
      text: '#f5f7ec',
      banner: 'rgba(240, 242, 230, 0.32)',
      hud: 'rgba(240, 242, 230, 0.20)',
    },
  },

  dusk: {
    label: 'Dusk',
    family: 'Blue',
    note: 'The half hour after sunset: a blue ground light enough to see, dark enough to be evening.',
    colors: {
      background: '#3d4a63',
      default: '#eef1f7',
      user: '#ffb26b',
      anon: '#6ec8ee',
      bot: '#e0a0d0',
      alert: '#ff5f7a',
      text: '#f3f6fb',
      banner: 'rgba(238, 241, 247, 0.32)',
      hud: 'rgba(238, 241, 247, 0.20)',
    },
  },

  // --- deep, but not black -----------------------------------------------
  cobalt: {
    label: 'Cobalt',
    family: 'Blue',
    note: 'Saturated blue rather than the usual near-black, so the ground itself is a colour.',
    colors: {
      background: '#10245c',
      default: '#dfe7ff',
      user: '#ffcf5c',
      anon: '#4fd6c4',
      bot: '#7a8fd0',
      alert: '#ff6f61',
      text: '#eaf0ff',
      banner: 'rgba(79, 214, 196, 0.75)',
      hud: 'rgba(79, 214, 196, 0.45)',
    },
  },

  oxblood: {
    label: 'Oxblood',
    family: 'Red',
    note: 'Deep red-brown, the colour of a bound ledger. Warm where the other dark grounds are cold.',
    colors: {
      background: '#2a1416',
      default: '#f3ded6',
      user: '#e8a33d',
      anon: '#6fb3a0',
      bot: '#a85c50',
      alert: '#ff5a4d',
      text: '#f8e9e3',
      banner: 'rgba(232, 163, 61, 0.75)',
      hud: 'rgba(232, 163, 61, 0.45)',
    },
  },


  // --- more paper --------------------------------------------------------
  //
  // The set was still two thirds night. These are grounds you could print on.
  mint: {
    label: 'Mint',
    family: 'Green',
    note: 'A cool green paper, the colour of an old ledger. The quietest light ground here.',
    colors: {
      background: '#e6efe8',
      default: '#33463c',
      user: '#1b6b43',
      anon: '#14508c',
      bot: '#9c6a15',
      alert: '#ad2424',
      text: '#22322b',
      banner: 'rgba(51, 70, 60, 0.85)',
      hud: 'rgba(51, 70, 60, 0.45)',
    },
  },

  blush: {
    label: 'Blush',
    family: 'Red',
    note: 'Warm pink paper with earth inks. Soft without being weak.',
    colors: {
      background: '#f6e9e4',
      default: '#4b3733',
      user: '#9c2f4a',
      anon: '#1c6f6a',
      bot: '#8a6a12',
      alert: '#1f4f96',
      text: '#3b2b28',
      banner: 'rgba(75, 55, 51, 0.85)',
      hud: 'rgba(75, 55, 51, 0.45)',
    },
  },

  newsprint: {
    label: 'Newsprint',
    family: 'Neutral',
    note: 'Grey stock and process inks. The colour of a paper read on a train, before anybody thought a screen should be white.',
    colors: {
      background: '#e3e1dc',
      default: '#2e2e2c',
      user: '#a8301f',
      anon: '#1c5f8c',
      bot: '#1f6b46',
      alert: '#8a6208',
      text: '#1f1f1e',
      banner: 'rgba(46, 46, 44, 0.85)',
      hud: 'rgba(46, 46, 44, 0.45)',
    },
  },

  vellum: {
    label: 'Vellum',
    family: 'Amber',
    note: 'Pale yellow calfskin, and the browns of iron-gall ink.',
    colors: {
      background: '#f4ecd6',
      default: '#4a3f28',
      user: '#8a5b13',
      anon: '#1c6b4e',
      bot: '#2f4f8c',
      alert: '#ae2a1c',
      text: '#3c3320',
      banner: 'rgba(74, 63, 40, 0.85)',
      hud: 'rgba(74, 63, 40, 0.45)',
    },
  },

  iceblue: {
    label: 'Ice',
    family: 'Blue',
    note: 'A very pale blue ground, the colour of a winter sky through glass.',
    colors: {
      background: '#e8eff4',
      default: '#2f4552',
      user: '#0f4f8f',
      anon: '#1c7a5a',
      bot: '#a06a12',
      alert: '#b02430',
      text: '#233541',
      banner: 'rgba(47, 69, 82, 0.85)',
      hud: 'rgba(47, 69, 82, 0.45)',
    },
  },

  // --- more grounds that are neither paper nor night ----------------------
  moss: {
    label: 'Moss',
    family: 'Green',
    note: 'A damp mid green, darker than sage and further from grey.',
    colors: {
      background: '#4a5540',
      default: '#eef0e2',
      user: '#f5c74a',
      anon: '#57d2bf',
      bot: '#9db6ff',
      alert: '#ff7358',
      text: '#f3f5e9',
      banner: 'rgba(238, 240, 226, 0.32)',
      hud: 'rgba(238, 240, 226, 0.20)',
    },
  },

  denim: {
    label: 'Denim',
    family: 'Blue',
    note: 'Indigo-dyed cloth at mid tone, worn rather than new.',
    colors: {
      background: '#41546e',
      default: '#eef2f7',
      user: '#a8c8ff',
      anon: '#ffce5c',
      bot: '#6fd6bf',
      alert: '#ff7a6a',
      text: '#f2f5fa',
      banner: 'rgba(238, 242, 247, 0.32)',
      hud: 'rgba(238, 242, 247, 0.20)',
    },
  },

  ochre: {
    label: 'Ochre',
    family: 'Amber',
    note: 'Raw earth pigment: a mid yellow-brown, the oldest colour anyone painted with.',
    colors: {
      background: '#7a5c2e',
      default: '#f7efdc',
      user: '#6fd8c4',
      anon: '#ffd98a',
      bot: '#a8bcff',
      alert: '#ff6f52',
      text: '#faf3e4',
      banner: 'rgba(247, 239, 220, 0.32)',
      hud: 'rgba(247, 239, 220, 0.20)',
    },
  },

  pewter: {
    label: 'Pewter',
    family: 'Neutral',
    note: 'A neutral mid grey with no hue at all in the ground, so the marks carry every bit of the colour.',
    colors: {
      background: '#5a5a5a',
      default: '#f0f0f0',
      user: '#ffcb4d',
      anon: '#4fd0c0',
      bot: '#8fb0ff',
      alert: '#ff7a66',
      text: '#f5f5f5',
      banner: 'rgba(240, 240, 240, 0.32)',
      hud: 'rgba(240, 240, 240, 0.20)',
    },
  },

  brick: {
    label: 'Brick',
    family: 'Red',
    note: 'Fired red at mid tone. Warmer than terracotta and a good deal louder.',
    colors: {
      background: '#7d3f38',
      default: '#f8e6df',
      user: '#efc94f',
      anon: '#6fc8b8',
      bot: '#9cb8ff',
      alert: '#ff5f4a',
      text: '#fbeee9',
      banner: 'rgba(248, 230, 223, 0.32)',
      hud: 'rgba(248, 230, 223, 0.20)',
    },
  },

  // --- more night, but each one a colour ---------------------------------
  ink: {
    label: 'Ink',
    family: 'Neutral',
    note: 'Iron-gall black with a blue cast, and the warm inks a scribe would have had beside it.',
    colors: {
      background: '#12161c',
      default: '#e6e9ee',
      user: '#e8b04a',
      anon: '#4fc9b6',
      bot: '#8fb0ff',
      alert: '#e8604f',
      text: '#eef1f5',
      banner: 'rgba(232, 176, 74, 0.75)',
      hud: 'rgba(232, 176, 74, 0.45)',
    },
  },

  abyss: {
    label: 'Abyss',
    family: 'Teal',
    note: 'Deep teal rather than deep blue: the ground has a hue, and it is not the sky.',
    colors: {
      background: '#08262b',
      default: '#dcf0ee',
      user: '#57d6dd',
      anon: '#ffc860',
      bot: '#9aa8ff',
      alert: '#ff7059',
      text: '#e6f4f2',
      banner: 'rgba(79, 208, 216, 0.75)',
      hud: 'rgba(79, 208, 216, 0.45)',
    },
  },

  amber: {
    label: 'Amber',
    family: 'Amber',
    note: 'A dark warm brown lit from inside, as resin is.',
    colors: {
      background: '#1d1408',
      default: '#f6e6c8',
      user: '#f0a827',
      anon: '#5fc0a8',
      bot: '#92aef0',
      alert: '#f4593c',
      text: '#f9eed8',
      banner: 'rgba(240, 168, 39, 0.75)',
      hud: 'rgba(240, 168, 39, 0.45)',
    },
  },

  coal: {
    label: 'Coal',
    family: 'Neutral',
    note: 'Near-black with no cast either way, and marks that are deliberately muted. The most restrained thing here.',
    colors: {
      background: '#131313',
      default: '#dcdcdc',
      user: '#c8a24a',
      anon: '#5c9e93',
      bot: '#93a9e8',
      alert: '#c25b45',
      text: '#e4e4e4',
      banner: 'rgba(220, 220, 220, 0.28)',
      hud: 'rgba(220, 220, 220, 0.18)',
    },
  },


  // --- forty more, and every one of them a different ground ---------------
  //
  // The set was forty, and the grounds were still bunched: twenty-one of them
  // near-black, and the light ones nearly all warm. These fill the wheel. Ten
  // more papers across the hues, fourteen more grounds that are neither paper
  // nor night, and sixteen more darks that are each a colour rather than the
  // same black with a tint.
  //
  // The category colours were not chosen by eye. A search took each ground and
  // returned the QUIETEST quartet clearing the suite's two rules, which is the
  // opposite of what a first attempt did: maximising perceptual distance gave
  // every ground the same garish magenta-cyan-green-red, and violet is out by
  // instruction anyway. The hue wheel is walked as a list with that band
  // removed, so nothing can land in it.

  seafoam: {
    label: 'Seafoam',
    family: 'Green',
    note: 'A pale green paper, the colour of sea glass held up to the light.',
    colors: {
      background: '#e4f0ec',
      default: '#2c4f43',
      user: '#702923',
      anon: '#a0a338',
      bot: '#286c55',
      alert: '#3f619d',
      text: '#1d342d',
      banner: 'rgba(44, 79, 67, 0.85)',
      hud: 'rgba(44, 79, 67, 0.45)',
    },
  },

  shell: {
    label: 'Shell',
    family: 'Amber',
    note: 'The inside of a shell: warm, faintly pink, and never quite white.',
    colors: {
      background: '#f5ece2',
      default: '#533e28',
      user: '#50882b',
      anon: '#40aeba',
      bot: '#363082',
      alert: '#b37947',
      text: '#372a1b',
      banner: 'rgba(83, 62, 40, 0.85)',
      hud: 'rgba(83, 62, 40, 0.45)',
    },
  },

  oyster: {
    label: 'Oyster',
    family: 'Neutral',
    note: 'Grey-beige, the colour of a wall nobody chose. Restful for exactly that reason.',
    colors: {
      background: '#eceae4',
      default: '#484333',
      user: '#2b5c88',
      anon: '#ba404c',
      bot: '#827530',
      alert: '#47b36f',
      text: '#302c22',
      banner: 'rgba(72, 67, 51, 0.85)',
      hud: 'rgba(72, 67, 51, 0.45)',
    },
  },

  periwinkle: {
    label: 'Periwinkle',
    family: 'Blue',
    note: 'The palest blue paper here, cool enough to make a warm mark look warmer.',
    colors: {
      background: '#e6e9f5',
      default: '#283053',
      user: '#703823',
      anon: '#83a338',
      bot: '#286c63',
      alert: '#3f4e9d',
      text: '#1b2037',
      banner: 'rgba(40, 48, 83, 0.85)',
      hud: 'rgba(40, 48, 83, 0.45)',
    },
  },

  straw: {
    label: 'Straw',
    family: 'Amber',
    note: 'Dry grass in late summer. The warmest light ground in the set.',
    colors: {
      background: '#f2eeda',
      default: '#534b28',
      user: '#2b882b',
      anon: '#409aba',
      bot: '#823046',
      alert: '#b38f47',
      text: '#37321b',
      banner: 'rgba(83, 75, 40, 0.85)',
      hud: 'rgba(83, 75, 40, 0.45)',
    },
  },

  rosewater: {
    label: 'Rosewater',
    family: 'Red',
    note: 'A pink so pale it reads as white until something white is put beside it.',
    colors: {
      background: '#f7e8ee',
      default: '#532839',
      user: '#2b4d88',
      anon: '#ba4840',
      bot: '#808230',
      alert: '#47b38f',
      text: '#371b26',
      banner: 'rgba(83, 40, 57, 0.85)',
      hud: 'rgba(83, 40, 57, 0.45)',
    },
  },

  celadon: {
    label: 'Celadon',
    family: 'Green',
    note: 'The green glaze Korean potters spent four centuries on, at its palest.',
    colors: {
      background: '#e8f1e4',
      default: '#36512a',
      user: '#75471f',
      anon: '#62aa31',
      bot: '#236970',
      alert: '#3f38a3',
      text: '#24361c',
      banner: 'rgba(54, 81, 42, 0.85)',
      hud: 'rgba(54, 81, 42, 0.45)',
    },
  },

  bone: {
    label: 'Bone',
    family: 'Neutral',
    note: 'Not white and not cream. The colour of a page that has been in a room for years.',
    colors: {
      background: '#f4f1ec',
      default: '#4e412d',
      user: '#2b884d',
      anon: '#4081ba',
      bot: '#823038',
      alert: '#b3a147',
      text: '#342c1e',
      banner: 'rgba(78, 65, 45, 0.85)',
      hud: 'rgba(78, 65, 45, 0.45)',
    },
  },

  cobweb: {
    label: 'Cobweb',
    family: 'Neutral',
    note: 'A cool grey with no colour to speak of, so every mark carries all of it.',
    colors: {
      background: '#eef0f3',
      default: '#333b48',
      user: '#2b3a88',
      anon: '#ba6040',
      bot: '#6a8230',
      alert: '#47b3a4',
      text: '#222730',
      banner: 'rgba(51, 59, 72, 0.85)',
      hud: 'rgba(51, 59, 72, 0.45)',
    },
  },

  apricot: {
    label: 'Apricot',
    family: 'Amber',
    note: 'Warm fruit skin. Light without being cold, which is rarer than it sounds.',
    colors: {
      background: '#f9ece0',
      default: '#533c28',
      user: '#705723',
      anon: '#38a338',
      bot: '#285a6c',
      alert: '#9d3f58',
      text: '#37281b',
      banner: 'rgba(83, 60, 40, 0.85)',
      hud: 'rgba(83, 60, 40, 0.45)',
    },
  },

  olive: {
    label: 'Olive',
    family: 'Green',
    note: 'The green of an army coat: dulled with brown, and the better for it.',
    colors: {
      background: '#4e5230',
      default: '#ebecdf',
      user: '#d3625a',
      anon: '#dde094',
      bot: '#60cda9',
      alert: '#98b1dc',
      text: '#f5f6ef',
      banner: 'rgba(211, 98, 90, 0.75)',
      hud: 'rgba(211, 98, 90, 0.45)',
    },
  },

  lagoon: {
    label: 'Lagoon',
    family: 'Teal',
    note: 'Shallow water over sand, seen from above.',
    colors: {
      background: '#1f4d50',
      default: '#ddedee',
      user: '#e86359',
      anon: '#efe19a',
      bot: '#5fe3b7',
      alert: '#9dc7ec',
      text: '#eef6f7',
      banner: 'rgba(232, 99, 89, 0.75)',
      hud: 'rgba(232, 99, 89, 0.45)',
    },
  },

  mulberry: {
    label: 'Mulberry',
    family: 'Red',
    note: 'Stained fingers in August. A red that has gone most of the way to purple without arriving.',
    colors: {
      background: '#6b3a52',
      default: '#eddee5',
      user: '#c3ad41',
      anon: '#7ad19a',
      bot: '#4986bc',
      alert: '#cc7f87',
      text: '#f6eef2',
      banner: 'rgba(195, 173, 65, 0.75)',
      hud: 'rgba(195, 173, 65, 0.45)',
    },
  },

  storm: {
    label: 'Storm',
    family: 'Blue',
    note: 'The sky twenty minutes before rain, which is a grey with blue in it.',
    colors: {
      background: '#4b5a66',
      default: '#e2e6e9',
      user: '#5ad3c3',
      anon: '#94b0e0',
      bot: '#cd7d60',
      alert: '#dadc98',
      text: '#f0f2f4',
      banner: 'rgba(90, 211, 195, 0.75)',
      hud: 'rgba(90, 211, 195, 0.45)',
    },
  },

  cedar: {
    label: 'Cedar',
    family: 'Amber',
    note: 'Cut cedar: warm, red-brown, and the smell is the point of it.',
    colors: {
      background: '#6b4a33',
      default: '#eee4dd',
      user: '#cd607d',
      anon: '#dcd198',
      bot: '#66c766',
      alert: '#9dbcd8',
      text: '#f7f1ee',
      banner: 'rgba(205, 96, 125, 0.75)',
      hud: 'rgba(205, 96, 125, 0.45)',
    },
  },

  fern: {
    label: 'Fern',
    family: 'Green',
    note: 'Undergrowth green, darker than sage and with none of its grey.',
    colors: {
      background: '#3f5c3f',
      default: '#e1eae1',
      user: '#5190c8',
      anon: '#d78e89',
      bot: '#c1af57',
      alert: '#8ed2bb',
      text: '#f0f5f0',
      banner: 'rgba(81, 144, 200, 0.75)',
      hud: 'rgba(81, 144, 200, 0.45)',
    },
  },

  indigo: {
    label: 'Indigo',
    family: 'Blue',
    note: 'The dye, not the colour name: deep, slightly dusty, and never quite even.',
    colors: {
      background: '#3c4478',
      default: '#dddfee',
      user: '#41b6c3',
      anon: '#807ad1',
      bot: '#bc7e49',
      alert: '#9ecc7f',
      text: '#eeeff6',
      banner: 'rgba(65, 182, 195, 0.75)',
      hud: 'rgba(65, 182, 195, 0.45)',
    },
  },

  rosewood: {
    label: 'Rosewood',
    family: 'Red',
    note: 'Dark furniture in a warm room.',
    colors: {
      background: '#6e4046',
      default: '#ecdfe1',
      user: '#cd606b',
      anon: '#dcd198',
      bot: '#66c78a',
      alert: '#9dbcd8',
      text: '#f6eff0',
      banner: 'rgba(205, 96, 107, 0.75)',
      hud: 'rgba(205, 96, 107, 0.45)',
    },
  },

  basalt: {
    label: 'Basalt',
    family: 'Neutral',
    note: 'Cooled lava: a mid grey with the faintest blue, and no warmth at all.',
    colors: {
      background: '#4a4a52',
      default: '#e4e4e7',
      user: '#accd60',
      anon: '#98dcc5',
      bot: '#6676c7',
      alert: '#d8a09d',
      text: '#f2f2f3',
      banner: 'rgba(172, 205, 96, 0.75)',
      hud: 'rgba(172, 205, 96, 0.45)',
    },
  },

  marsh: {
    label: 'Marsh',
    family: 'Green',
    note: 'Reed beds in winter. Green, brown, and undecided between them.',
    colors: {
      background: '#556348',
      default: '#e5eae1',
      user: '#4aabcf',
      anon: '#db849c',
      bot: '#c8a051',
      alert: '#89d789',
      text: '#f2f4f0',
      banner: 'rgba(74, 171, 207, 0.75)',
      hud: 'rgba(74, 171, 207, 0.45)',
    },
  },

  copper: {
    label: 'Copper',
    family: 'Amber',
    note: 'The metal before it turns: bright, orange, and about to be green.',
    colors: {
      background: '#7a4629',
      default: '#eee3dd',
      user: '#6a92d7',
      anon: '#e5a8a4',
      bot: '#ced270',
      alert: '#a8e1ce',
      text: '#f7f1ee',
      banner: 'rgba(106, 146, 215, 0.75)',
      hud: 'rgba(106, 146, 215, 0.45)',
    },
  },

  harbour: {
    label: 'Harbour',
    family: 'Blue',
    note: 'Working water: blue-grey, and busier than the sea.',
    colors: {
      background: '#26485c',
      default: '#dde8ee',
      user: '#c36441',
      anon: '#b7d17a',
      bot: '#49bcac',
      alert: '#7f8ccc',
      text: '#eef3f7',
      banner: 'rgba(195, 100, 65, 0.75)',
      hud: 'rgba(195, 100, 65, 0.45)',
    },
  },

  heather: {
    label: 'Heather',
    family: 'Rose',
    note: 'Moorland in flower, which is a grey with pink underneath it.',
    colors: {
      background: '#5f5570',
      default: '#e5e2e9',
      user: '#5a9ad3',
      anon: '#e09994',
      bot: '#cdbb60',
      alert: '#98dcc5',
      text: '#f2f1f4',
      banner: 'rgba(90, 154, 211, 0.75)',
      hud: 'rgba(90, 154, 211, 0.45)',
    },
  },

  tundra: {
    label: 'Tundra',
    family: 'Neutral',
    note: 'Lichen and stone at the treeline, where colour gives up gradually.',
    colors: {
      background: '#666a60',
      default: '#e6e7e4',
      user: '#64a5dd',
      anon: '#e8a5a1',
      bot: '#d7c56a',
      alert: '#a4e5cf',
      text: '#f2f3f2',
      banner: 'rgba(100, 165, 221, 0.75)',
      hud: 'rgba(100, 165, 221, 0.45)',
    },
  },

  obsidian: {
    label: 'Obsidian',
    family: 'Neutral',
    note: 'Volcanic glass. Black with a shine, and the darkest ground in the set.',
    colors: {
      background: '#0d0f12',
      default: '#e1e5ea',
      user: '#41c341',
      anon: '#7abad1',
      bot: '#bc4967',
      alert: '#ccb37f',
      text: '#f0f2f4',
      banner: 'rgba(65, 195, 65, 0.75)',
      hud: 'rgba(65, 195, 65, 0.45)',
    },
  },

  bottle: {
    label: 'Bottle',
    family: 'Green',
    note: 'Dark glass held to a window: green only where the light gets through.',
    colors: {
      background: '#0b1f18',
      default: '#ddeee8',
      user: '#4171c3',
      anon: '#d1807a',
      bot: '#b8bc49',
      alert: '#7fccb3',
      text: '#eef7f4',
      banner: 'rgba(65, 113, 195, 0.75)',
      hud: 'rgba(65, 113, 195, 0.45)',
    },
  },

  carbon: {
    label: 'Carbon',
    family: 'Neutral',
    note: 'Neutral black with no cast either way. The plainest thing here.',
    colors: {
      background: '#161616',
      default: '#e6e6e6',
      user: '#c37e41',
      anon: '#9dd17a',
      bot: '#49b0bc',
      alert: '#847fcc',
      text: '#f2f2f2',
      banner: 'rgba(195, 126, 65, 0.75)',
      hud: 'rgba(195, 126, 65, 0.45)',
    },
  },

  prussian: {
    label: 'Prussian',
    family: 'Blue',
    note: 'The first modern synthetic pigment, 1706, and still the deepest blue in a paintbox.',
    colors: {
      background: '#0a1e33',
      default: '#dde5ee',
      user: '#41c371',
      anon: '#7aa9d1',
      bot: '#bc4954',
      alert: '#ccbf7f',
      text: '#eef2f7',
      banner: 'rgba(65, 195, 113, 0.75)',
      hud: 'rgba(65, 195, 113, 0.45)',
    },
  },

  wine: {
    label: 'Wine',
    family: 'Red',
    note: 'The colour left in the bottom of a glass, held against the dark.',
    colors: {
      background: '#26101a',
      default: '#eedde5',
      user: '#4157c3',
      anon: '#d1917a',
      bot: '#99bc49',
      alert: '#7fccc2',
      text: '#f7eef2',
      banner: 'rgba(65, 87, 195, 0.75)',
      hud: 'rgba(65, 87, 195, 0.45)',
    },
  },

  espresso: {
    label: 'Espresso',
    family: 'Amber',
    note: 'Very dark brown. Warm, close, and the opposite of a night sky.',
    colors: {
      background: '#1a120c',
      default: '#eee4dd',
      user: '#c39841',
      anon: '#7ad17a',
      bot: '#499dbc',
      alert: '#cc7f94',
      text: '#f7f2ee',
      banner: 'rgba(195, 152, 65, 0.75)',
      hud: 'rgba(195, 152, 65, 0.45)',
    },
  },

  gunmetal: {
    label: 'Gunmetal',
    family: 'Blue',
    note: 'Blued steel: nearly black, with just enough blue to be a colour.',
    colors: {
      background: '#141a20',
      default: '#e0e6eb',
      user: '#41c398',
      anon: '#7a9ad1',
      bot: '#bc5049',
      alert: '#cacc7f',
      text: '#eff2f5',
      banner: 'rgba(65, 195, 152, 0.75)',
      hud: 'rgba(65, 195, 152, 0.45)',
    },
  },

  abysswater: {
    label: 'Deep water',
    family: 'Teal',
    note: 'Below the depth where blue has gone and only green is left.',
    colors: {
      background: '#07211f',
      default: '#ddeeed',
      user: '#5951c8',
      anon: '#d7bd89',
      bot: '#82c157',
      alert: '#8ec0d2',
      text: '#eef7f6',
      banner: 'rgba(89, 81, 200, 0.75)',
      hud: 'rgba(89, 81, 200, 0.45)',
    },
  },

  blackcurrant: {
    label: 'Blackcurrant',
    family: 'Red',
    note: 'Almost black, and unmistakably a fruit.',
    colors: {
      background: '#1a0f1c',
      default: '#ebdeed',
      user: '#c3ad41',
      anon: '#7ad19a',
      bot: '#4986bc',
      alert: '#cc7f87',
      text: '#f5eef6',
      banner: 'rgba(195, 173, 65, 0.75)',
      hud: 'rgba(195, 173, 65, 0.45)',
    },
  },

  pinewood: {
    label: 'Pinewood',
    family: 'Green',
    note: 'A conifer plantation at dusk, where the dark comes early.',
    colors: {
      background: '#0d1a12',
      default: '#ddeee4',
      user: '#41c3b2',
      anon: '#7a89d1',
      bot: '#bc6749',
      alert: '#b5cc7f',
      text: '#eef6f1',
      banner: 'rgba(65, 195, 178, 0.75)',
      hud: 'rgba(65, 195, 178, 0.45)',
    },
  },

  ironwork: {
    label: 'Ironwork',
    family: 'Neutral',
    note: 'Painted railings: black that has been black for a hundred years.',
    colors: {
      background: '#191c1e',
      default: '#e3e6e8',
      user: '#c34164',
      anon: '#d1b47a',
      bot: '#49bc49',
      alert: '#7fb8cc',
      text: '#f1f2f3',
      banner: 'rgba(195, 65, 100, 0.75)',
      hud: 'rgba(195, 65, 100, 0.45)',
    },
  },

  ochrenight: {
    label: 'Dark ochre',
    family: 'Amber',
    note: 'Earth pigment at its darkest, before it becomes brown.',
    colors: {
      background: '#1d1608',
      default: '#eee8dd',
      user: '#bfc341',
      anon: '#7ad1b4',
      bot: '#4973bc',
      alert: '#cc847f',
      text: '#f7f4ee',
      banner: 'rgba(191, 195, 65, 0.75)',
      hud: 'rgba(191, 195, 65, 0.45)',
    },
  },

  midnight: {
    label: 'Midnight',
    family: 'Blue',
    note: 'The sky at one in the morning, well away from a town.',
    colors: {
      background: '#080c1a',
      default: '#dde1ee',
      user: '#41b6c3',
      anon: '#807ad1',
      bot: '#bc7e49',
      alert: '#9ecc7f',
      text: '#eef0f7',
      banner: 'rgba(65, 182, 195, 0.75)',
      hud: 'rgba(65, 182, 195, 0.45)',
    },
  },

  forge: {
    label: 'Forge',
    family: 'Red',
    note: 'Iron before it glows: dark, warm, and about to be hot.',
    colors: {
      background: '#1f0e08',
      default: '#eee1dd',
      user: '#c3414e',
      anon: '#d1c37a',
      bot: '#49bc73',
      alert: '#7fa8cc',
      text: '#f7f0ee',
      banner: 'rgba(195, 65, 78, 0.75)',
      hud: 'rgba(195, 65, 78, 0.45)',
    },
  },

  slatenight: {
    label: 'Night slate',
    family: 'Blue',
    note: 'Wet roofs after dark, which is the same colour as Slate with the light taken away.',
    colors: {
      background: '#12171c',
      default: '#e0e6eb',
      user: '#9cc341',
      anon: '#7ad1c6',
      bot: '#495cbc',
      alert: '#cc947f',
      text: '#eff2f5',
      banner: 'rgba(156, 195, 65, 0.75)',
      hud: 'rgba(156, 195, 65, 0.45)',
    },
  },

  seanight: {
    label: 'Night sea',
    family: 'Blue',
    note: 'Open water at night. Marine, with the last of the day gone out of it.',
    colors: {
      background: '#04171f',
      default: '#dde9ee',
      user: '#41a0c3',
      anon: '#d17a91',
      bot: '#bc9549',
      alert: '#7fcc7f',
      text: '#eef4f7',
      banner: 'rgba(65, 160, 195, 0.75)',
      hud: 'rgba(65, 160, 195, 0.45)',
    },
  },

};

export const DEFAULT_PALETTE_NAME = 'marine';

/** Accepts a palette name or a colours object; always returns a full set. */
export function resolvePalette(nameOrColors) {
  if (nameOrColors && typeof nameOrColors === 'object') {
    return { ...PALETTES[DEFAULT_PALETTE_NAME].colors, ...nameOrColors };
  }
  const entry = PALETTES[nameOrColors] || PALETTES[DEFAULT_PALETTE_NAME];
  return { ...entry.colors };
}

// --- how forty palettes are put in front of somebody ---------------------
//
// A grid of forty swatches is a grid of forty swatches: you look at the first
// row, decide it is a lot, and take the default. So they are offered grouped,
// two ways, because there are two questions anybody actually asks.
//
// HOW LIGHT IS IT. Derived, never declared: it is a measurement of the ground,
// and a measurement cannot fall out of step with the colour the way a label
// can. The bands are the same ones the test suite holds the set to.
export const GROUND_BANDS = ['Paper', 'Twilight', 'Night'];

/**
 * Which lightness band a palette's ground falls in.
 * @param {string} name
 * @returns {'Paper'|'Twilight'|'Night'}
 */
export function groundBandOf(name) {
  const L = lightnessOf(resolvePalette(name).background);
  return L >= 0.7 ? 'Paper' : L >= 0.3 ? 'Twilight' : 'Night';
}

// WHAT COLOUR IS IT. Declared, and deliberately so. Deriving it was tried and
// is worse than it sounds: a rule taking the ground's hue calls every
// near-black neutral, and a rule falling back to the marks called Marine amber,
// because the commonest mark in this set is a gold and the marks are
// systematised while the grounds are not. A family is a judgement about what a
// palette looks like, so it is written down where somebody can disagree with
// it rather than inferred from numbers that do not know.
export const PALETTE_FAMILIES = ['Blue', 'Teal', 'Green', 'Amber', 'Red', 'Rose', 'Neutral'];

/** The declared dominant of a palette, falling back for anything unlabelled. */
export function familyOf(name) {
  const entry = PALETTES[name];
  return (entry && entry.family) || 'Neutral';
}

/** The few colours a picker needs to show for a palette, ground first. */
export function swatchOf(name) {
  const c = resolvePalette(name);
  return { background: c.background, dots: [c.user, c.anon, c.bot, c.alert] };
}
