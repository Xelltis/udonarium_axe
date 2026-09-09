import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { tabInsertIndex } from '@axe/application/ui/panel-drag-helpers';
import { TranslocoModule } from '@jsverse/transloco';

/** How far a name is carried before it counts as being dragged rather than pressed. */
const DRAG_THRESHOLD_PX = 6;

/**
 * The row of names along the top of a frame holding more than one panel.
 *
 * It draws names and carries them about: which panels a frame holds is the frame's business,
 * and the strip is told what to say and answers with what the reader did. A name dragged
 * within the row is a reorder; one dragged out of it is the frame's to deal with, since only
 * the frame knows what else is on the screen to drop it on.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'panel-tab-strip',
  templateUrl: './panel-tab-strip.component.html',
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class PanelTabStripComponent {
  readonly tabs = input.required<readonly string[]>();
  readonly active = input.required<number>();
  /** How far down the strip sits, which is wherever the title bar leaves off. */
  readonly top = input('28px');

  readonly chose = output<number>();
  readonly closed = output<number>();
  /** A name has begun to move. */
  readonly grabbed = output<number>();
  readonly dragged = output<{ x: number; y: number }>();
  /** A name was let go of somewhere else on the screen. */
  readonly tookOut = output<{ index: number; x: number; y: number }>();
  readonly moved = output<{ from: number; to: number }>();

  private readonly strip = viewChild.required<ElementRef<HTMLDivElement>>('strip');
  private held: { index: number; x: number; y: number } | null = null;
  private carrying = false;

  protected onPillPointerDown(event: PointerEvent, index: number): void {
    if (event.button !== 0) return;
    this.chose.emit(index);
    this.held = { index, x: event.clientX, y: event.clientY };
    this.carrying = false;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPillPointerMove(event: PointerEvent): void {
    const held = this.held;
    if (!held) return;
    if (!this.carrying) {
      if (Math.hypot(event.clientX - held.x, event.clientY - held.y) < DRAG_THRESHOLD_PX) return;
      this.carrying = true;
      this.grabbed.emit(held.index);
    }
    this.dragged.emit({ x: event.clientX, y: event.clientY });
  }

  protected onPillPointerUp(event: PointerEvent): void {
    const held = this.held;
    this.held = null;
    if (!held || !this.carrying) return;
    this.carrying = false;

    const at = { x: event.clientX, y: event.clientY };
    if (!this.withinStrip(at)) {
      this.tookOut.emit({ index: held.index, ...at });
      return;
    }
    const landing = tabInsertIndex(at.x, this.pillRects());
    const to = landing > held.index ? landing - 1 : landing;
    if (to !== held.index) this.moved.emit({ from: held.index, to });
  }

  private withinStrip(at: { x: number; y: number }): boolean {
    const box = this.strip().nativeElement.getBoundingClientRect();
    return at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom;
  }

  private pillRects(): DOMRect[] {
    return [...this.strip().nativeElement.querySelectorAll('[role="tab"]')].map((pill) => pill.getBoundingClientRect());
  }
}
