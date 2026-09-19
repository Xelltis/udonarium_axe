import { easeInOut, pointAlongRoute } from '@axe/domain/replay/replay-route';
import type { ReplayMotion } from '@axe/domain/replay/video/replay-video-timeline';

/** How a piece stands at a moment of a beat of the board, over where the board says it is. */
export interface ReplayPieceState {
  /** Where it is on the way along a move, in table pixels. Null when it stands where the board has it. */
  position: { x: number; y: number } | null;
  alpha: number;
  scale: number;
  /** How wide it looks as it turns over, from 1 flat to 0 edge on. */
  scaleX: number;
  /** The angle it has turned to, in degrees. Null when it stands as the board has it. */
  rotate: number | null;
  /** How far it is shaken aside, as a share of a cell, and how far it is tipped, in degrees. */
  shakeX: number;
  shakeAngle: number;
  /** Whether it still shows the face it had before it was turned over. */
  showsBefore: boolean;
  /** How far it has risen as it arrives, as a share of a cell. */
  lift: number;
}

export const STILL_PIECE: ReplayPieceState = {
  position: null,
  alpha: 1,
  scale: 1,
  scaleX: 1,
  rotate: null,
  shakeX: 0,
  shakeAngle: 0,
  showsBefore: false,
  lift: 0,
};

/**
 * How a piece stands `localMs` into a beat, given what happens to it in the beat, in order.
 *
 * Before its first move it waits where the move starts, and between moves where the last one
 * left it. A piece arriving is unseen until its moment and fades in as it drops into place; one
 * leaving fades out and stays gone. A die shakes as it rolls, a card turns over edge on and shows
 * its new face from halfway, and a piece turned swings round to its new angle.
 */
export function replayPieceStateAt(motions: readonly ReplayMotion[], localMs: number): ReplayPieceState {
  if (motions.length < 1) return STILL_PIECE;
  let state: ReplayPieceState = { ...STILL_PIECE };

  for (const [index, motion] of motions.entries()) {
    const progress = motion.durationMs > 0 ? (localMs - motion.startMs) / motion.durationMs : 1;
    const started = progress >= 0;
    const eased = easeInOut(progress);

    switch (motion.kind) {
      case 'path': {
        if (!started && index > 0) break;
        const at = pointAlongRoute(motion.route, started ? eased : 0);
        state = {
          ...state,
          position: progress >= 1 && index === lastOf(motions, 'path') ? null : { x: at.x, y: at.y },
        };
        break;
      }
      case 'arrive':
        if (!started) state = { ...state, alpha: 0 };
        else if (progress < 1) state = { ...state, alpha: eased, scale: 0.85 + 0.15 * eased, lift: 0.4 * (1 - eased) };
        break;
      case 'depart':
        if (progress >= 1) state = { ...state, alpha: 0 };
        else if (started) state = { ...state, alpha: 1 - eased, scale: 1 - 0.1 * eased };
        break;
      case 'shake':
        if (started && progress < 1) {
          const fade = 1 - progress;
          state = {
            ...state,
            shakeX: Math.sin(localMs * 0.06) * 0.15 * fade,
            shakeAngle: Math.sin(localMs * 0.045) * 14 * fade,
          };
        }
        break;
      case 'flip':
        if (!started) state = { ...state, showsBefore: true };
        else if (progress < 1)
          state = { ...state, scaleX: Math.abs(Math.cos(Math.PI * eased)), showsBefore: eased < 0.5 };
        break;
      case 'spin':
        if (!started) state = { ...state, rotate: motion.fromAngle };
        else if (progress < 1)
          state = { ...state, rotate: motion.fromAngle + (motion.toAngle - motion.fromAngle) * eased };
        break;
    }
  }
  return state;
}

function lastOf(motions: readonly ReplayMotion[], kind: ReplayMotion['kind']): number {
  for (let index = motions.length - 1; index >= 0; index -= 1) if (motions[index].kind === kind) return index;
  return -1;
}
