import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import {
  FirstPersonLook,
  homeward,
  isAtRest,
  LOOK_REST,
  lookDragged,
  lookEased,
} from '@axe/domain/tabletop/first-person/first-person-look';

/** How long the view takes to come back to where the piece faces, in ms. */
export const LOOK_RETURN_MS = 240;

/** How far a press has to move before it is a look rather than a click, in screen pixels. */
export const LOOK_DRAG_THRESHOLD_PX = 8;

/** What a press may start on without becoming a look: the controls and anything else to press. */
const NOT_A_LOOK = 'button, a, input, select, textarea, [role="button"]';

interface Press {
  readonly pointerId: number;
  x: number;
  y: number;
  start: FirstPersonLook;
  readonly element: Element | null;
}

/**
 * Where this screen looks away from where its piece faces, while the user looks about.
 *
 * The look is the screen's own: it turns and tips the camera, never the piece, and is neither shared
 * nor kept. It stays where a drag leaves it, so the eye can be left on something while the hand goes
 * to the chat, and goes back to where the piece faces once the piece moves or turns, unless a drag is
 * under way. Looking out of another piece starts level and ahead.
 */
@Injectable()
export class FirstPersonLookService {
  private readonly firstPerson = inject(FirstPersonService);
  private readonly motion = inject(MotionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly current = signal<FirstPersonLook>(LOOK_REST);
  private readonly viewer = computed(() => this.firstPerson.piece()?.identifier ?? null);
  private readonly draggingNow = signal(false);
  private frame: number | null = null;
  private pressed: Press | null = null;
  private clickToSwallow = false;

  /** How far the screen looks away from where its piece faces. */
  readonly look = this.current.asReadonly();

  /** Whether the user is dragging the view about. */
  readonly dragging = this.draggingNow.asReadonly();

  /** Whether the view is dragged about or left looking away from where the piece faces. */
  readonly away = computed(() => this.draggingNow() || !isAtRest(this.current()));

  constructor() {
    effect(() => {
      this.viewer();
      untracked(() => this.reset());
    });
    let standing: FirstPersonPose | null = null;
    effect(() => {
      const pose = this.firstPerson.pose();
      untracked(() => {
        const moved = standing !== null && pose !== null && pose !== standing;
        standing = pose;
        if (moved && !this.draggingNow()) this.release();
      });
    });
    this.destroyRef.onDestroy(() => this.reset());
  }

  /**
   * A press on the view, which becomes a look once it moves far enough. A press on the controls, or
   * with any but the main button, is left to them.
   */
  press(event: PointerEvent): void {
    this.clickToSwallow = false;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if ((event.target as Element | null)?.closest?.(NOT_A_LOOK)) return;
    this.pressed = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: this.current(),
      element: event.currentTarget as Element | null,
    };
  }

  /**
   * Turns the view towards where the pointer moves, and tips it up as the pointer goes up, by
   * `degPerPx` for each pixel, once the press has moved far enough to be more than a click. A pointer
   * that comes back with nothing held, let go somewhere the view did not hear of, lets go here.
   */
  drag(event: PointerEvent, degPerPx: number): void {
    const pressed = this.pressed;
    if (!pressed || event.pointerId !== pressed.pointerId) return;
    if ((event.buttons & 1) === 0) {
      this.letGo(event);
      return;
    }
    if (!this.draggingNow()) {
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < LOOK_DRAG_THRESHOLD_PX) return;
      pressed.x = event.clientX;
      pressed.y = event.clientY;
      pressed.start = this.current();
      this.draggingNow.set(true);
      this.clickToSwallow = true;
      holdOn(pressed.element, event.pointerId);
    }
    this.lookTo(lookDragged(pressed.start, event.clientX - pressed.x, event.clientY - pressed.y, degPerPx));
  }

  /** Lets go of a press: a look stays where it was dragged to; a click is left to happen. */
  letGo(event?: PointerEvent): void {
    if (event && this.pressed && event.pointerId !== this.pressed.pointerId) return;
    this.pressed = null;
    this.draggingNow.set(false);
  }

  /** Drops any press under way and goes back to where the piece faces. */
  lookAhead(): void {
    this.letGo();
    this.release();
  }

  /**
   * Whether the click that ends a press should be let pass unheeded, the press having been a look.
   * Asking answers once.
   */
  takeClickAsLook(): boolean {
    const swallow = this.clickToSwallow;
    this.clickToSwallow = false;
    return swallow;
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

  /** Looks where the piece faces, level, at once, dropping any press under way. */
  reset(): void {
    this.pressed = null;
    this.draggingNow.set(false);
    this.rest();
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

/**
 * Holds on to a pointer, so a drag carried off the view goes on turning it. One the page cannot hold,
 * as a pointer no longer down, is followed for as long as it stays over the view.
 */
function holdOn(element: Element | null, pointerId: number): void {
  try {
    element?.setPointerCapture?.(pointerId);
  } catch {
    return;
  }
}
