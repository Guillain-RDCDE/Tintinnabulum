// Colour palettes for the canvas.
//
// Each palette must define every key below. `background` is the canvas ground;
// `text` is used for labels, which are stroked with `background` so they stay
// legible over any circle. The category keys colour the circles: `default` is
// the fallback for a category nobody defined, so a custom category always gets
// a visible colour rather than disappearing.
//
// Palettes are pure data. Adding one is adding an entry here.

export const PALETTE_KEYS = [
  'background', 'default', 'user', 'anon', 'bot', 'alert', 'text', 'banner', 'hud',
];

export const PALETTES = {
  nocturne: {
    label: 'Nocturne',
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

/** The few colours a picker needs to show for a palette, ground first. */
export function swatchOf(name) {
  const c = resolvePalette(name);
  return { background: c.background, dots: [c.user, c.anon, c.bot, c.alert] };
}
