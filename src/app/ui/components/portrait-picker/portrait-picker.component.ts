import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { AnchoredPopover } from '@axe/ui/anchored-popover';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

export interface PortraitChoice {
  readonly index: number;
  readonly name: string;
  readonly url: string;
}

const LIST_WIDTH = 296;
const LIST_MIN_HEIGHT = 176;

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

  private readonly list = new AnchoredPopover(
    () => this.host.nativeElement,
    () => this.popoverRef().nativeElement,
    { width: LIST_WIDTH, minHeight: LIST_MIN_HEIGHT }
  );

  readonly isOpen = this.list.isOpen;

  readonly label = computed(() => {
    const choices = this.choices();
    const index = this.selectedIndex();
    const name = choices[index]?.name ?? '';
    return name.length > 0 ? name : `${index + 1}/${choices.length}`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.list.destroy());
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

  /** Opens the list of portraits, or closes it if it is open, and shows which one is in use. */
  toggle(): void {
    if (!this.list.toggle()) return;
    this.popoverRef()
      .nativeElement.querySelector<HTMLElement>('[data-current]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Hides the list; nothing when it is already closed. */
  close(): void {
    this.list.close();
  }
}
