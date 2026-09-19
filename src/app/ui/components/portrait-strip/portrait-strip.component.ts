import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { PortraitChoice } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * A character's portraits side by side as small pictures, any of which is chosen with one press.
 *
 * The row slides sideways, with the wheel as well as by dragging or swiping, and the left and
 * right keys step through it. It keeps the chosen portrait in view as the choice changes.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'portrait-strip',
  templateUrl: './portrait-strip.component.html',
  host: { class: 'flex min-w-0' },
  imports: [SafePipe, TranslocoModule],
})
export class PortraitStripComponent {
  readonly choices = input<PortraitChoice[]>([]);
  readonly selectedIndex = input(0);
  readonly picked = output<number>();

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');

  constructor() {
    afterRenderEffect(() => {
      const index = this.selectedIndex();
      this.choices();
      this.bringIntoView(index);
    });
  }

  /** Chooses a portrait; choosing the one already chosen does nothing. */
  pick(index: number): void {
    if (index < 0 || index >= this.choices().length || index === this.selectedIndex()) return;
    this.picked.emit(index);
  }

  /** Turns the wheel's up and down into the row's left and right, when the row holds more than it shows. */
  slide(event: WheelEvent): void {
    const track = this.track().nativeElement;
    if (track.scrollWidth <= track.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    track.scrollLeft += event.deltaY;
  }

  /** Steps to the portrait on the left or the right with the arrow keys. */
  step(event: KeyboardEvent): void {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    this.pick(this.selectedIndex() + direction);
  }

  /** Scrolls the row just far enough for the portrait to show whole. */
  private bringIntoView(index: number): void {
    const track = this.track().nativeElement;
    const button = track.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!button) return;
    const start = button.offsetLeft;
    const end = start + button.offsetWidth;
    if (start < track.scrollLeft) track.scrollLeft = start;
    else if (end > track.scrollLeft + track.clientWidth) track.scrollLeft = end - track.clientWidth;
  }
}
