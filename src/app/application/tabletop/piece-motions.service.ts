import { inject, Injectable, signal } from '@angular/core';
import { MotionService } from '@axe/application/ui/motion.service';
import { MultiAngleOrbitMode, multiAngleTurnAt } from '@axe/domain/tabletop/multi-angle';
import {
  motionEndPose,
  motionLengthMs,
  MotionPose,
  motionPoseAt,
  PieceMotionKind,
} from '@axe/domain/tabletop/world/piece-motions';

/** What else a move is played with. */
export interface MotionOptions {
  /** The parts of the piece the move moves, named as its sprites are after their `#`; all of it where not given. */
  readonly parts?: readonly string[];
  /** For a piece that turns over, whether it lies back up as it starts, whichever way it is to land. */
  readonly backUp?: boolean;
  /** Whether the piece stays where the move leaves it once it has played through, until it is stopped. */
  readonly holds?: boolean;
}

/** A move a piece is playing, when it started, and what else it is played with. */
interface Playing extends MotionOptions {
  readonly kind: PieceMotionKind;
  readonly startedAt: number;
}

/** Where a piece playing a move is now, and what else the move is played with. */
export interface PlayingPose extends MotionOptions {
  readonly pose: MotionPose;
}

/** How a piece turns on its own, round and round, as a piece on a table seen from straight above does. */
export interface TurningOnItsOwn {
  readonly mode: MultiAngleOrbitMode;
  readonly revolutionSeconds: number;
  readonly pauseSeconds: number;
  /** How far round a turn it is ahead of the others, from 0 to 1. */
  readonly phase: number;
}

const REST: MotionPose = { across: 0, down: 0, out: 0, scale: 1, turnDeg: 0, flipDeg: 0, shown: 1 };

/**
 * The moves the pieces on the table's canvas are playing, as a die tumbles when it is rolled: the
 * canvas plays them itself, frame by frame, where the page would play a CSS animation. While motion
 * is turned down nothing is played, as the page then ends its animations at once.
 */
@Injectable({ providedIn: 'root' })
export class PieceMotionsService {
  private readonly motion = inject(MotionService);
  private readonly playing = signal<ReadonlyMap<string, Playing>>(new Map());
  private readonly turning = signal<ReadonlyMap<string, TurningOnItsOwn>>(new Map());
  private readonly clock = signal(0);
  /** How far into its move every piece is held, in milliseconds, or null while the moves play by the clock. */
  private readonly heldAt = signal<number | null>(null);
  private frame: number | null = null;

  /**
   * Has a piece play a move from now. Hands back how long it plays for, in milliseconds: nothing
   * while motion is turned down.
   */
  play(owner: string, kind: PieceMotionKind, options: MotionOptions = {}): number {
    if (!this.motion.enabled()) return 0;
    const now = performance.now();
    this.clock.set(now);
    this.playing.update((playing) => new Map(playing).set(owner, { ...options, kind, startedAt: now }));
    this.tickSoon();
    return motionLengthMs(kind);
  }

  /**
   * Has a piece turn on its own from now on, round and round, or with null stop. It turns while
   * motion is turned down too, as the page turns it then.
   */
  turnOnItsOwn(owner: string, turning: TurningOnItsOwn | null): void {
    const was = this.turning().get(owner);
    if (turning === null ? !was : was && JSON.stringify(was) === JSON.stringify(turning)) return;
    this.turning.update((all) => {
      const next = new Map(all);
      if (turning) next.set(owner, turning);
      else next.delete(owner);
      return next;
    });
    this.clock.set(performance.now());
    this.tickSoon();
  }

  /**
   * Where each piece playing a move, or turning on its own, is now. Follows the frames as they go
   * by. A piece turning on its own and playing a move as well turns on top of the move.
   */
  posesNow(): ReadonlyMap<string, PlayingPose> {
    const now = this.clock();
    const held = this.heldAt();
    const poses = new Map<string, PlayingPose>();
    for (const [owner, playing] of this.playing()) {
      const pose =
        motionPoseAt(playing.kind, held ?? now - playing.startedAt) ??
        (playing.holds ? motionEndPose(playing.kind) : null);
      if (pose) poses.set(owner, { pose, parts: playing.parts, backUp: playing.backUp });
    }
    for (const [owner, turning] of this.turning()) {
      const turnDeg = multiAngleTurnAt(
        turning.mode,
        turning.revolutionSeconds,
        turning.pauseSeconds,
        turning.phase,
        now / 1000
      );
      const moving = poses.get(owner);
      poses.set(
        owner,
        moving
          ? { ...moving, pose: { ...moving.pose, turnDeg: moving.pose.turnDeg + turnDeg } }
          : { pose: { ...REST, turnDeg } }
      );
    }
    return poses;
  }

  /**
   * Holds every piece playing a move as far into it as asked, in milliseconds, however long ago it
   * started, or lets the moves play by the clock again given null: for pictures of the table that
   * must come out the same, as the page holds its animations at a moment for them.
   */
  holdAt(ms: number | null): void {
    this.heldAt.set(ms);
  }

  /** Stops the move a piece is playing, or lets go of the pose a held move left it in. */
  stop(owner: string): void {
    if (!this.playing().has(owner)) return;
    this.playing.update((playing) => {
      const next = new Map(playing);
      next.delete(owner);
      return next;
    });
  }

  /** Whether a piece is playing a move now. */
  isPlaying(owner: string): boolean {
    return this.posesNow().has(owner);
  }

  private tickSoon(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const now = performance.now();
      const held = this.heldAt();
      const kept = [...this.playing()].filter(
        ([, playing]) => playing.holds || held !== null || motionPoseAt(playing.kind, now - playing.startedAt)
      );
      if (kept.length !== this.playing().size) this.playing.set(new Map(kept));
      this.clock.set(now);
      const moving = kept.some(([, playing]) => motionPoseAt(playing.kind, now - playing.startedAt));
      if (moving || this.turning().size) this.tickSoon();
    });
  }
}
