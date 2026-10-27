import { BattleTheme } from '@axe/domain/battle/battle-settings';

/**
 * The tool's own stages: the picture behind the fighters, and the colours the band, the plates and
 * the banner take on it.
 *
 * Each picture is fetched only when a stage plays on it, or as a small thumbnail when the battle
 * panel offers it; nothing of them is in what every screen downloads to open the room.
 */

/** How the band and what stands on it look on a stage. */
export interface BattleThemeLook {
  /** The picture behind the stage. */
  image: string;
  /** A small copy of the picture, for choosing the stage by. */
  thumbnail: string;
  /**
   * Which part of the picture is kept where the band is cut to a shape of its own, as an
   * `object-position`: the horizon kept near the middle, and what the picture is about kept in.
   */
  focus: string;
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
};

/** How the band and what stands on it look on a stage. */
export function battleThemeLook(theme: BattleTheme): BattleThemeLook {
  return LOOKS[theme];
}
