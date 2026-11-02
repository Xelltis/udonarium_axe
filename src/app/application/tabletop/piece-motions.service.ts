import { inject, Injectable, signal } from '@angular/core';
import { MotionService } from '@axe/application/ui/motion.service';
import { motionLengthMs, MotionPose, motionPoseAt, PieceMotionKind } from '@axe/domain/tabletop/world/piece-motions';

/** What else a move is played with. */
export interface MotionOptions {
  /** The parts of the piece the move moves, named as its sprites are after their `#`; all of it where not given. */
  readonly parts?: readonly string[];
  /** For a piece that turns over, whether it lies back up as it starts, whichever way it is to land. */
  readonly backUp?: boolean;
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

/**
 * The moves the pieces on the table's canvas are playing, as a die tumbles when it is rolled: the
 * canvas plays them itself, frame by frame, where the page would play a CSS animation. While motion
 * is turned down nothing is played, as the page then ends its animations at once.
 */
@Injectable({ providedIn: 'root' })
export class PieceMotionsService {
  private readonly motion = inject(MotionService);
  private readonly playing = signal<ReadonlyMap<string, Playing>>(new Map());
  private readonly clock = signal(0);
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

  /** Where each piece playing a move is now. Follows the frames as they go by. */
  posesNow(): ReadonlyMap<string, PlayingPose> {
    const now = this.clock();
    const poses = new Map<string, PlayingPose>();
    for (const [owner, playing] of this.playing()) {
      const pose = motionPoseAt(playing.kind, now - playing.startedAt);
      if (pose) poses.set(owner, { pose, parts: playing.parts, backUp: playing.backUp });
    }
    return poses;
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
      const still = [...this.playing()].filter(([, playing]) => motionPoseAt(playing.kind, now - playing.startedAt));
      if (still.length !== this.playing().size) this.playing.set(new Map(still));
      this.clock.set(now);
      if (still.length) this.tickSoon();
    });
  }
}
