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

  constructor() {
    effect(() => {
      if (this.movePlan.isPlanning()) this.listen();
      else this.stop();
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.armed = false;
    document.addEventListener('pointermove', this.onPointerMove, true);
    document.addEventListener('pointerup', this.onPointerUp, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  private stop(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('pointermove', this.onPointerMove, true);
    document.removeEventListener('pointerup', this.onPointerUp, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.onTable(event)) return;
    const at = this.tablePoint(event);
    this.movePlan.lookAt(at.x, at.y);
  };

  private readonly onPointerUp = (): void => {
    this.armed = true;
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (!this.armed || !this.onTable(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) this.movePlan.settle();
    else void this.movePlan.run();
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
