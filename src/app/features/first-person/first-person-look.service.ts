import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MotionService } from '@axe/application/ui/motion.service';
import {
  FirstPersonLook,
  homeward,
  isAtRest,
  LOOK_REST,
  lookEased,
} from '@axe/domain/tabletop/first-person/first-person-look';

/** How long the view takes to come back to where the piece faces once the screen lets go, in ms. */
export const LOOK_RETURN_MS = 240;

/**
 * Where this screen looks away from where its piece faces, while the user looks about.
 *
 * The look is the screen's own: it turns and tips the camera, never the piece, and is neither shared
 * nor kept. Looking out of another piece starts level and ahead.
 */
@Injectable()
export class FirstPersonLookService {
  private readonly firstPerson = inject(FirstPersonService);
  private readonly motion = inject(MotionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly current = signal<FirstPersonLook>(LOOK_REST);
  private readonly viewer = computed(() => this.firstPerson.piece()?.identifier ?? null);
  private frame: number | null = null;

  /** How far the screen looks away from where its piece faces. */
  readonly look = this.current.asReadonly();

  constructor() {
    effect(() => {
      this.viewer();
      untracked(() => this.rest());
    });
    this.destroyRef.onDestroy(() => this.rest());
  }

  /** Looks away as far as given, drawing the sight all round while it does. */
  lookTo(look: FirstPersonLook): void {
    this.stopReturn();
    this.firstPerson.lookAround(true);
    this.current.set(look);
  }

  /**
   * Goes back to where the piece faces, level, easing there over a moment, or at once where motion
   * is turned down.
   */
  release(): void {
    this.stopReturn();
    const from = homeward(this.current());
    if (isAtRest(from) || !this.motion.enabled()) {
      this.rest();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = (now - start) / LOOK_RETURN_MS;
      if (t >= 1) {
        this.frame = null;
        this.rest();
        return;
      }
      this.current.set(lookEased(from, t));
      this.frame = requestAnimationFrame(step);
    };
    this.current.set(from);
    this.frame = requestAnimationFrame(step);
  }

  /** Looks where the piece faces, level, at once. */
  rest(): void {
    this.stopReturn();
    this.current.set(LOOK_REST);
    this.firstPerson.lookAround(false);
  }

  private stopReturn(): void {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
