import type { DieShape } from '@axe/domain/dice/dice-3d/polyhedra';
import type { Quat, Vec3 } from '@axe/domain/dice/dice-3d/rotation';
import type { ThrowFault, Tray } from '@axe/domain/dice/dice-3d/throw-validation';

/** Which edge of the tray the dice are thrown in from. */
export type ThrowEdge = 'left' | 'right' | 'near';

/** A throw to work out: which dice, onto what tray, from where, seeded from what, to show what. */
export interface DiceThrowRequest {
  /** What every peer shares about the roll, which seeds the throw. */
  readonly key: string;
  readonly shapes: readonly DieShape[];
  /** The face each die has to show, or for a d4 the corner it has to show on top. */
  readonly targets: readonly number[];
  readonly tray: Tray;
  readonly edge: ThrowEdge;
  /** The direction across the floor that runs up the viewer's screen, which the numbers are turned to read along. */
  readonly away: Vec3;
}

/** How the dice of a throw moved and where they came to rest. */
export interface DiceThrowResult {
  readonly frameCount: number;
  /** The frame the dice stopped moving in; the frames after it hold them still. */
  readonly restFrame: number;
  /** Seven numbers per die per frame: the position x, y and z, then the rotation x, y, z and w. */
  readonly frames: Float32Array;
  /** The face each die came to rest showing, or the corner on top for a d4, before it is turned to its target. */
  readonly landed: readonly number[];
  /** The turn inside each die that brings its target up, reading as near upright to the viewer as it can. */
  readonly corrections: readonly Quat[];
  /** Which attempt was kept, from 0. */
  readonly attempt: number;
  /** What spoiled the throw kept, when every attempt was spoiled; null for a clean throw. */
  readonly fault: ThrowFault | null;
}

/** The numbers kept for each die in each frame. */
export const FRAME_STRIDE = 7;

/** Frames per second of the recording, the rate it was worked out at. */
export const FRAMES_PER_SECOND = 60;

/** A throw handed to the worker, numbered so its answer can be told apart from others. */
export interface DicePhysicsJob {
  readonly id: number;
  readonly request: DiceThrowRequest;
}

/** The worker's answer to a throw: how it went, or null when it could not be worked out. */
export interface DicePhysicsReply {
  readonly id: number;
  readonly result: DiceThrowResult | null;
}
