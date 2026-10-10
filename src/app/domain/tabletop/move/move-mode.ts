/**
 * How a piece is getting about, which is what its reach is worked out for.
 *
 * Walking is what a table assumes and what every reach was worked out as. The rest are the
 * ways a piece crosses ground it cannot simply walk over: hauling itself up a cliff, swimming
 * a river, crawling under a low roof, or flying over the lot. What tells them apart is what
 * each one costs and what each one has to go round.
 */
export const MOVE_MODES = ['walk', 'climb', 'swim', 'crawl', 'fly'] as const;

export type MoveMode = (typeof MOVE_MODES)[number];

export const DEFAULT_MOVE_MODE: MoveMode = 'walk';

export interface MoveModeTerms {
  /** What every cell costs on top of the one step the ground is already worth. */
  toll: number;
  /** Whether the ground's own charges are owed at all: a bog is nothing to a piece over it. */
  paysGround: boolean;
  /** Whether it goes over what only a jump would clear rather than round it. */
  clears: boolean;
}

/**
 * What each way of getting about comes to.
 *
 * Hauling, swimming and crawling all cost a step again for every step, which is the rule most
 * games settle on and comes to a reach of half. Flying pays the ground nothing - a swamp is
 * no harder to cross than a floor when the feet are not in it - and goes over whatever a
 * jump would clear.
 */
export const MOVE_MODE_TERMS: Record<MoveMode, MoveModeTerms> = {
  walk: { toll: 0, paysGround: true, clears: false },
  climb: { toll: 1, paysGround: true, clears: true },
  swim: { toll: 1, paysGround: true, clears: false },
  crawl: { toll: 1, paysGround: true, clears: false },
  fly: { toll: 0, paysGround: false, clears: true },
};

/** Reads a stored way of getting about, with anything unknown - an empty one included - walking. */
export function asMoveMode(value: unknown): MoveMode {
  return typeof value === 'string' && (MOVE_MODES as readonly string[]).includes(value)
    ? (value as MoveMode)
    : DEFAULT_MOVE_MODE;
}

/** What one way of getting about comes to, reading an unknown one as walking. */
export function moveModeTermsOf(mode: unknown): MoveModeTerms {
  return MOVE_MODE_TERMS[asMoveMode(mode)];
}
