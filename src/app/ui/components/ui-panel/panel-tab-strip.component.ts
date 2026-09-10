import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
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
  /** A carry has ended, however it ended, so whoever was following it can stop. */
  readonly released = output<void>();

  private readonly strip = viewChild.required<ElementRef<HTMLDivElement>>('strip');
  /** The name being carried, drawn faded while it is in the air. */
  protected readonly carried = signal(-1);
  /** Where a name let go of now would land, drawn as a line between two of them. */
  protected readonly landing = signal(-1);
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
      this.carried.set(held.index);
      this.grabbed.emit(held.index);
    }
    const at = { x: event.clientX, y: event.clientY };
    this.landing.set(this.withinStrip(at) ? tabInsertIndex(at.x, this.pillRects()) : -1);
    this.dragged.emit(at);
  }

  protected onPillPointerUp(event: PointerEvent): void {
    const held = this.held;
    this.held = null;
    this.carried.set(-1);
    this.landing.set(-1);
    if (!held || !this.carrying) return;
    this.carrying = false;

    const at = { x: event.clientX, y: event.clientY };
    if (this.withinStrip(at)) {
      const landing = tabInsertIndex(at.x, this.pillRects());
      const to = landing > held.index ? landing - 1 : landing;
      if (to !== held.index) this.moved.emit({ from: held.index, to });
    } else {
      this.tookOut.emit({ index: held.index, ...at });
    }
    this.released.emit();
  }

  /** A carry the browser took away lands nowhere: the name stays where it was. */
  protected onPillPointerCancel(): void {
    const carrying = this.carrying;
    this.held = null;
    this.carrying = false;
    this.carried.set(-1);
    this.landing.set(-1);
    if (carrying) this.released.emit();
  }

  private withinStrip(at: { x: number; y: number }): boolean {
    const box = this.strip().nativeElement.getBoundingClientRect();
    return at.x >= box.left && at.x <= box.right && at.y >= box.top && at.y <= box.bottom;
  }

  private pillRects(): DOMRect[] {
    return [...this.strip().nativeElement.querySelectorAll('[role="tab"]')].map((pill) => pill.getBoundingClientRect());
  }
}
