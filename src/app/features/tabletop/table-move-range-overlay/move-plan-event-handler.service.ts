import { DestroyRef, effect, inject, Injectable } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { isTypingTarget } from '@axe/core/input/typing-target';

/**
 * The hand and the keys, while a move is being worked out.
 *
 * The piece is left where it stands during a planned move, so nothing is holding the pointer
 * and the way has to be drawn from the table itself. The press that opens the move lets go
 * over the piece, and the click that follows it is that same press finishing rather than a
 * choice, so clicks are only listened to once the pointer has been let go of.
 */
@Injectable({ providedIn: 'root' })
export class MovePlanEventHandlerService {
  private readonly movePlan = inject(MovePlanService);
  private readonly coordinate = inject(CoordinateService);
  private readonly destroyRef = inject(DestroyRef);

  private listening = false;
  private armed = false;
  /** The move the press in hand belongs to, so a press cannot answer for the move after it. */
  private armedFor = 0;

  constructor() {
    effect(() => {
      const opening = this.movePlan.openings();
      if (this.movePlan.isPlanning()) this.listen(opening);
      else this.stop();
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  private listen(opening: number): void {
    // Every move opens on a press that has yet to finish, this one included: a move opened
    // while another was already open was closed by the very press that opened it, since the
    // click that press ends with was taken for a choice.
    if (this.armedFor !== opening) {
      this.armedFor = opening;
      this.armed = false;
    }
    if (this.listening) return;
    this.listening = true;
    this.armed = false;
    document.addEventListener('pointermove', this.onPointerMove, true);
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('contextmenu', this.onContextMenu, true);
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  private stop(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('pointermove', this.onPointerMove, true);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('contextmenu', this.onContextMenu, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.onTable(event)) return;
    const at = this.tablePoint(event);
    this.movePlan.lookAt(at.x, at.y);
  };

  private readonly onPointerDown = (): void => {
    this.armed = true;
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (!this.armed || !this.onTable(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      this.movePlan.settle();
      return;
    }
    // A tap that would walk the piece nowhere is the way out of a move, since a hand with no
    // keys to hold has nothing else to say "leave it" with.
    if (this.movePlan.wholeWay().length < 2) {
      this.movePlan.cancel();
      return;
    }
    void this.movePlan.run();
  };

  /**
   * A press held down settles the leg drawn so far, as shift and a click does.
   *
   * A long press is the only second button a finger has, and it is already carrying the
   * context menu, so the menu is kept shut for as long as a move is being worked out.
   */
  private readonly onContextMenu = (event: MouseEvent): void => {
    if (!this.onTable(event)) return;
    event.preventDefault();
    event.stopPropagation();
    this.movePlan.settle();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.movePlan.cancel();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.movePlan.run();
    }
  };

  private onTable(event: Event): boolean {
    const target = event.target;
    return target instanceof Node && this.coordinate.tabletopOriginElement.contains(target);
  }

  private tablePoint(event: MouseEvent): { x: number; y: number } {
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    return this.coordinate.calcTabletopLocalCoordinate({ x: event.clientX, y: event.clientY, z: 0 }, target);
  }
}
