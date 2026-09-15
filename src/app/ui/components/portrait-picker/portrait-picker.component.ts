import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

export interface PortraitChoice {
  readonly index: number;
  readonly name: string;
  readonly url: string;
}

const LIST_WIDTH = 296;
const LIST_MIN_HEIGHT = 176;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'portrait-picker',
  templateUrl: './portrait-picker.component.html',
  host: {
    class:
      'rounded-b-ui-sm flex h-4.5 items-center justify-between overflow-hidden bg-[rgba(0,0,0,0.55)] px-0.5 select-none',
  },
  imports: [SafePipe, TranslocoModule],
})
export class PortraitPickerComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly popoverRef = viewChild.required<ElementRef<HTMLElement>>('popover');

  readonly choices = input<PortraitChoice[]>([]);
  readonly selectedIndex = input(0);
  readonly picked = output<number>();

  readonly isOpen = signal(false);

  readonly label = computed(() => {
    const choices = this.choices();
    const index = this.selectedIndex();
    const name = choices[index]?.name ?? '';
    return name.length > 0 ? name : `${index + 1}/${choices.length}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopWatching());
  }

  /** Picks the previous or next portrait from the arrow buttons; nothing past either end. */
  step(direction: number): void {
    const next = this.selectedIndex() + direction;
    if (next < 0 || next >= this.choices().length) return;
    this.picked.emit(next);
  }

  /** Called when a portrait in the list is clicked: closes the list and emits it if it is a different one. */
  pick(index: number): void {
    this.close();
    if (index !== this.selectedIndex()) this.picked.emit(index);
  }

  /**
   * Opens the list of portraits above or below the picker, or closes it if it is open.
   *
   * While open, the current portrait is scrolled into view, and a press outside, Escape or a
   * window resize is listened for. Does nothing in a browser without the popover API.
   */
  toggle(): void {
    if (this.isOpen()) {
      this.close();
      return;
    }
    const popover = this.popoverRef().nativeElement;
    if (typeof popover.showPopover !== 'function') return;
    popover.showPopover();
    popover.style.display = 'flex';
    this.isOpen.set(true);
    this.place();
    popover.querySelector<HTMLElement>('[data-current]')?.scrollIntoView?.({ block: 'nearest' });
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.onResize);
  }

  /** Hides the list and stops listening for presses outside it; nothing when it is already closed. */
  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.stopWatching();
    const popover = this.popoverRef().nativeElement;
    popover.style.display = '';
    popover.hidePopover();
  }

  private readonly onPointerDown = (event: Event): void => {
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.close();
  };

  private readonly onResize = (): void => this.place();

  private stopWatching(): void {
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.onResize);
  }

  private place(): void {
    const popover = this.popoverRef().nativeElement;
    const anchor = this.host.nativeElement.getBoundingClientRect();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const width = Math.min(LIST_WIDTH, viewWidth - VIEWPORT_MARGIN * 2);
    const roomAbove = anchor.top - VIEWPORT_MARGIN - ANCHOR_GAP;
    const roomBelow = viewHeight - anchor.bottom - VIEWPORT_MARGIN - ANCHOR_GAP;
    const opensUpward = roomBelow < roomAbove;

    popover.style.width = `${width}px`;
    popover.style.maxHeight = `${Math.max(LIST_MIN_HEIGHT, opensUpward ? roomAbove : roomBelow)}px`;
    popover.style.left = '0px';
    popover.style.top = '0px';

    const origin = popover.getBoundingClientRect();
    const left = clamp(
      anchor.left + anchor.width / 2 - width / 2,
      VIEWPORT_MARGIN,
      viewWidth - width - VIEWPORT_MARGIN
    );
    const top = opensUpward ? anchor.top - ANCHOR_GAP - origin.height : anchor.bottom + ANCHOR_GAP;
    popover.style.left = `${left - origin.left}px`;
    popover.style.top = `${clamp(top, VIEWPORT_MARGIN, viewHeight - origin.height - VIEWPORT_MARGIN) - origin.top}px`;
  }
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.max(lowest, Math.min(value, highest));
}
