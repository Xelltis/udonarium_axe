import { BattleTheme } from '@axe/domain/battle/battle-settings';

/**
 * The tool's own stages: the picture behind the fighters, and the colours the band, the plates and
 * the banner take on it.
 *
 * Each picture is fetched only when a stage plays on it, or as a small thumbnail when the battle
 * panel offers it; nothing of them is in what every screen downloads to open the room.
 */

/** How the band and what stands on it look, whatever picture is behind them. */
export interface BattleBandLook {
  /** The lines along the top and the bottom of the band. */
  edge: string;
  /** The streak of light that sweeps the band as it opens. */
  sweep: string;
  /** The colours the plates of the left and the right side are marked in. */
  left: string;
  right: string;
  /** How the banner over the fallen reads. */
  banner: Record<string, string>;
}

/** How the band and what stands on it look on one of the tool's own stages. */
export interface BattleThemeLook extends BattleBandLook {
  /** The picture behind the stage. */
  image: string;
  /** A small copy of the picture, for choosing the stage by. */
  thumbnail: string;
  /**
   * Which part of the picture is kept where the band is cut to a shape of its own, as an
   * `object-position`: the horizon kept near the middle, and what the picture is about kept in.
   */
  focus: string;
}

/**
 * How the band looks on a picture of the room's own: plain silver lines and the usual blue and red,
 * as nothing is known of what the picture shows.
 */
export const BATTLE_PICTURE_LOOK: BattleBandLook = {
  edge: 'linear-gradient(to right, transparent, #c8d2de, #ffffff, #c8d2de, transparent)',
  sweep: 'linear-gradient(to right, transparent, rgb(255 255 255 / 0.35), transparent)',
  left: '#4aa3ff',
  right: '#ff5a5a',
  banner: {
    color: '#ffffff',
    'text-shadow': '0 0 16px rgb(255 70 70 / 0.9), 0 3px 0 rgb(20 20 30 / 0.9)',
  },
};

const LOOKS: Record<BattleTheme, BattleThemeLook> = {
  fantasy: {
    image: './assets/images/battle/fantasy.webp',
    thumbnail: './assets/images/battle/thumb/fantasy.webp',
    focus: '60% 45%',
    edge: 'linear-gradient(to right, transparent, #f5c66a, #fff3d6, #f5c66a, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(255 236 190 / 0.4), transparent)',
    left: '#6fb7ff',
    right: '#ff6b6b',
    banner: {
      color: '#ffe7a8',
      'text-shadow': '0 0 18px rgb(255 120 40 / 0.9), 0 3px 0 rgb(80 30 0 / 0.9)',
    },
  },
  modern: {
    image: './assets/images/battle/modern.webp',
    thumbnail: './assets/images/battle/thumb/modern.webp',
    focus: '50% 50%',
    edge: 'linear-gradient(to right, transparent, #4aa3ff, #e8f2ff, #4aa3ff, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(220 236 255 / 0.4), transparent)',
    left: '#4aa3ff',
    right: '#ff4d5e',
    banner: {
      color: '#f4f8ff',
      'text-shadow': '0 0 16px rgb(74 163 255 / 0.9), 0 3px 0 rgb(10 20 40 / 0.9)',
    },
  },
  horror: {
    image: './assets/images/battle/horror.webp',
    thumbnail: './assets/images/battle/thumb/horror.webp',
    focus: '55% 45%',
    edge: 'linear-gradient(to right, transparent, #6b0f1a, #e04050, #6b0f1a, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(255 120 120 / 0.28), transparent)',
    left: '#a8b4c0',
    right: '#e04050',
    banner: {
      color: '#f6dcdc',
      'text-shadow': '0 0 20px rgb(200 20 30 / 0.95), 0 4px 0 rgb(40 0 0 / 0.95)',
    },
  },
  cyberpunk: {
    image: './assets/images/battle/cyberpunk.webp',
    thumbnail: './assets/images/battle/thumb/cyberpunk.webp',
    focus: '50% 50%',
    edge: 'linear-gradient(to right, transparent, #ff2e88, #ffffff, #2ef2ff, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(46 242 255 / 0.4), transparent)',
    left: '#2ef2ff',
    right: '#ff2e88',
    banner: {
      color: '#e9fdff',
      'text-shadow': '0 0 14px rgb(46 242 255 / 0.95), 3px 0 0 rgb(255 46 136 / 0.9), -3px 0 0 rgb(46 242 255 / 0.6)',
    },
  },
  mecha: {
    image: './assets/images/battle/mecha.webp',
    thumbnail: './assets/images/battle/thumb/mecha.webp',
    focus: '50% 55%',
    edge: 'linear-gradient(to right, transparent, #ff8a1f, #ffe2b8, #ff8a1f, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(255 210 150 / 0.35), transparent)',
    left: '#38bdf8',
    right: '#ff8a1f',
    banner: {
      color: '#ffd29a',
      'text-shadow': '0 0 16px rgb(255 138 31 / 0.95), 0 3px 0 rgb(40 20 0 / 0.95)',
    },
  },
  'fantasy-day': {
    image: './assets/images/battle/fantasy-day.webp',
    thumbnail: './assets/images/battle/thumb/fantasy-day.webp',
    focus: '60% 50%',
    edge: 'linear-gradient(to right, transparent, #f5c66a, #fffbe8, #f5c66a, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(255 248 220 / 0.45), transparent)',
    left: '#3b8cff',
    right: '#ff5a5a',
    banner: {
      color: '#fff4d0',
      'text-shadow': '0 0 18px rgb(255 120 40 / 0.9), 0 3px 0 rgb(80 30 0 / 0.9)',
    },
  },
  'modern-day': {
    image: './assets/images/battle/modern-day.webp',
    thumbnail: './assets/images/battle/thumb/modern-day.webp',
    focus: '50% 50%',
    edge: 'linear-gradient(to right, transparent, #2f8cff, #ffffff, #2f8cff, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(230 242 255 / 0.45), transparent)',
    left: '#2f8cff',
    right: '#ff4d5e',
    banner: {
      color: '#ffffff',
      'text-shadow': '0 0 16px rgb(47 140 255 / 0.9), 0 3px 0 rgb(10 20 40 / 0.9)',
    },
  },
  'horror-day': {
    image: './assets/images/battle/horror-day.webp',
    thumbnail: './assets/images/battle/thumb/horror-day.webp',
    focus: '65% 50%',
    edge: 'linear-gradient(to right, transparent, #3d4a3a, #a3b18a, #3d4a3a, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(200 214 180 / 0.25), transparent)',
    left: '#b8c4b0',
    right: '#c8323c',
    banner: {
      color: '#e8eadc',
      'text-shadow': '0 0 20px rgb(160 20 30 / 0.95), 0 4px 0 rgb(20 24 16 / 0.95)',
    },
  },
  'cyberpunk-day': {
    image: './assets/images/battle/cyberpunk-day.webp',
    thumbnail: './assets/images/battle/thumb/cyberpunk-day.webp',
    focus: '50% 50%',
    edge: 'linear-gradient(to right, transparent, #ffb547, #ffffff, #2ef2ff, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(255 220 160 / 0.4), transparent)',
    left: '#2ef2ff',
    right: '#ff2e88',
    banner: {
      color: '#fffaf0',
      'text-shadow': '0 0 14px rgb(255 46 136 / 0.9), 3px 0 0 rgb(46 242 255 / 0.8), 0 3px 0 rgb(40 20 0 / 0.9)',
    },
  },
  'mecha-day': {
    image: './assets/images/battle/mecha-day.webp',
    thumbnail: './assets/images/battle/thumb/mecha-day.webp',
    focus: '50% 50%',
    edge: 'linear-gradient(to right, transparent, #ffb020, #fff3d0, #ffb020, transparent)',
    sweep: 'linear-gradient(to right, transparent, rgb(255 236 200 / 0.4), transparent)',
    left: '#38bdf8',
    right: '#ff8a1f',
    banner: {
      color: '#fff1d6',
      'text-shadow': '0 0 16px rgb(255 138 31 / 0.95), 0 3px 0 rgb(40 20 0 / 0.95)',
    },
  },
};

/** How the band and what stands on it look on a stage. */
export function battleThemeLook(theme: BattleTheme): BattleThemeLook {
  return LOOKS[theme];
}
