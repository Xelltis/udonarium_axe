import type { BattleSide } from '@axe/domain/battle/battle-lineup';
import { BATTLE_INTRO_MS, type BattleTimeline } from '@axe/domain/battle/battle-timeline';
import type { ModelAct } from '@axe/domain/tabletop/model-motions';

/** How far a fighter drawn as its model is turned from facing the screen towards the one across, in degrees. */
const FACING_ACROSS_DEG = 65;

/** A fighter drawn as its model, as far as what it does on the stage is worked out from. */
export interface ActingFighter {
  /** Whether it is the one striking. */
  readonly striking: boolean;
  /** The side of the stage it stands on. */
  readonly side: BattleSide;
  /** Whether the exchange brings it down. */
  readonly defeated: boolean;
  /** Whether the exchange hurts it. */
  readonly hurt: boolean;
}

/** What a fighter's model does at a moment of the stage: whether it walks, and what it acts. */
export interface FigureActing {
  readonly walking: boolean;
  readonly act?: ModelAct;
}

/**
 * How far a fighter's model is turned, in degrees clockwise seen from above from facing the screen:
 * towards the one across, yet enough towards the screen to be seen.
 */
export function figureTurnDeg(side: BattleSide): number {
  return side === 'left' ? -FACING_ACROSS_DEG : FACING_ACROSS_DEG;
}

/**
 * What a fighter's model does at a moment of the stage, `elapsed` milliseconds since it began to
 * open: it walks while the sides step in and, for the one striking, while it steps forward; the one
 * striking strikes its blow, or works its spell, as the effect of the blow begins; one the exchange
 * hurts takes the blow as it lands; and one brought down goes down once the bars have fallen.
 *
 * Each act is told with the moment it is due, on the clock frames are timed by, so a model asked
 * before then waits for it: `playedFromMs` is when the stage began to open on that clock, and
 * `playing` tells this playing of the stage from the others.
 */
export function figureActing(
  fighter: ActingFighter,
  timeline: BattleTimeline,
  elapsed: number,
  playedFromMs: number,
  playing: number,
  blow: 'attack' | 'cast'
): FigureActing {
  const towardEast = fighter.side === 'left' ? 1 : -1;
  const act = (role: ModelAct['role'], at: number): ModelAct => ({
    key: `battle:${playing}:${role}`,
    role,
    atMs: playedFromMs + at,
    toward: { x: towardEast, y: 0 },
  });
  const steppingIn = elapsed < BATTLE_INTRO_MS;
  if (fighter.striking) {
    const steppingUp = elapsed >= timeline.stepStart && elapsed < timeline.effectStart;
    return { walking: steppingIn || steppingUp, act: act(blow, timeline.effectStart) };
  }
  if (fighter.defeated && timeline.defeatStart >= 0 && elapsed >= timeline.defeatStart) {
    return { walking: false, act: act('defeat', timeline.defeatStart) };
  }
  return { walking: steppingIn, ...(fighter.hurt ? { act: act('hit', timeline.impact) } : {}) };
}
