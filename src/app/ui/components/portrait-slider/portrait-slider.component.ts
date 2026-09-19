import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PortraitChoice } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * A small slider running through a character's portraits, followed by the place of the one it
 * rests on and its name.
 *
 * Each portrait is chosen as the knob passes it, so dragging runs through the faces one after
 * another. The wheel over the slider steps it too, as do the arrow keys.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'portrait-slider',
  templateUrl: './portrait-slider.component.html',
  host: { class: 'flex min-w-0 items-center gap-1.5' },
  imports: [TranslocoModule],
})
export class PortraitSliderComponent {
  readonly choices = input<PortraitChoice[]>([]);
  readonly selectedIndex = input(0);
  readonly picked = output<number>();

  /** The highest position of the knob: one for each portrait after the first. */
  readonly last = computed(() => Math.max(0, this.choices().length - 1));

  /** How far along the knob is, as the share of the bar drawn in the accent colour. */
  readonly progress = computed(() => {
    const last = this.last();
    return last > 0 ? `${(this.selectedIndex() / last) * 100}%` : '0%';
  });

  /** The name of the portrait the knob rests on, or null when it has none. */
  readonly name = computed(() => this.choices()[this.selectedIndex()]?.name || null);

  /** Chooses the portrait at a position of the knob; the one already chosen, or one off either end, is left alone. */
  pick(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index > this.last() || index === this.selectedIndex()) return;
    this.picked.emit(index);
  }

  /** Chooses the portrait the knob has been moved to. */
  slid(event: Event): void {
    this.pick(Number((event.target as HTMLInputElement).value));
  }

  /** Steps the knob one portrait along with the wheel: down or right for the next, up or left for the one before. */
  wheel(event: WheelEvent): void {
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    event.preventDefault();
    this.pick(this.selectedIndex() + (delta > 0 ? 1 : -1));
  }
}
