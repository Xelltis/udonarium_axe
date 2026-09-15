export const FOG_MODES = ['easy', 'normal', 'hard'] as const;

export type FogMode = (typeof FOG_MODES)[number];

export const DEFAULT_FOG_MODE: FogMode = 'normal';

/** Reads a stored fog mode, falling back to normal for anything unknown. */
export function asFogMode(value: unknown): FogMode {
  return typeof value === 'string' && (FOG_MODES as readonly string[]).includes(value)
    ? (value as FogMode)
    : DEFAULT_FOG_MODE;
}

/** What a mode of the fog asks for, which is the whole of what tells the three apart. */
export interface FogRules {
  /**
   * Whether ground the party has walked to is written down, so that it stays cleared once
   * nobody is standing in it. Without it the fog closes behind the party as they go.
   */
  remembersGround: boolean;
  /**
   * Whether ground once cleared is held in plain sight: lit as though a lamp stood there,
   * and never veiled again. The party keeps what it has taken.
   */
  clearedStaysLit: boolean;
  /**
   * Whether a piece once found is followed wherever it goes, the fog notwithstanding. What
   * is being read is a map the party is keeping, and a monster they have seen is on it.
   */
  tracksFoundPieces: boolean;
}

const RULES: Record<FogMode, FogRules> = {
  easy: { remembersGround: true, clearedStaysLit: true, tracksFoundPieces: true },
  normal: { remembersGround: true, clearedStaysLit: false, tracksFoundPieces: false },
  hard: { remembersGround: false, clearedStaysLit: false, tracksFoundPieces: false },
};

/** What a table's fog mode asks for, with an unknown mode read as normal. */
export function fogRules(mode: unknown): FogRules {
  return RULES[asFogMode(mode)];
}

/**
 * What the fog is made of before anybody says otherwise.
 *
 * Pale, because the fog stands apart from the dark: a lit board wants weather over the part
 * nobody has walked to, not a hole cut in it. A night table sets it dark.
 */
export const DEFAULT_FOG_COLOR = '#aeb9c4';

/**
 * Ground the party has been shown and cannot see now.
 *
 * No mist over it: the fog there has been cleared and stays cleared, and thinning the mist
 * instead read as a lighter fog rather than as a cleared one. It is shaded a little instead,
 * which is what tells it apart from ground somebody is standing in.
 */
export const FOG_VEIL_COLOR = '#000000';

export const FOG_VEIL_ALPHA = 0.3;

export const FOG_UNEXPLORED_ALPHA = 1;

export const FOG_GM_ALPHA_FACTOR = 0.22;

export const FOG_EDGE_BLUR_RATIO = 0.35;
