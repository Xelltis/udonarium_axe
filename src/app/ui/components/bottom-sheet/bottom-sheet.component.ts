import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { BOTTOM_SHEET_FRAME_OPTIONS, BottomSheetRef } from '@axe/application/ui/bottom-sheet.service';
import { KeyboardInsetService } from '@axe/application/ui/keyboard-inset.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { sheetDragOffset, shouldDismissSheet } from '@axe/ui/bottom-sheet-gesture';
import { TranslocoModule } from '@jsverse/transloco';

/** What can take the focus inside the sheet, for keeping Tab within it. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextTitleId = 0;

/**
 * The frame a sheet's content is drawn in: a dimmed backdrop, a grip, a heading with a close button,
 * and the content scrolling under them.
 *
 * On a phone it rises from the bottom edge and stays above the on-screen keyboard; pulled down by
 * its grip or heading it closes. On a wider screen it stands in the middle as a dialog. The focus
 * moves into it, Tab stays inside it, and Escape or a tap on the backdrop closes it.
 */
@Component({
  selector: 'ui-bottom-sheet',
  templateUrl: './bottom-sheet.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'contents' },
})
export class BottomSheetComponent {
  private readonly ref = inject(BottomSheetRef);
  private readonly keyboard = inject(KeyboardInsetService);
  private readonly viewport = inject(ViewportService);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly options = inject(BOTTOM_SHEET_FRAME_OPTIONS);

  readonly content = viewChild.required('content', { read: ViewContainerRef });
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly titleId = `bottom-sheet-title-${nextTitleId++}`;
  protected readonly keyboardInset = this.keyboard.inset;
  /** Whether the sheet rises from the bottom, as on a phone, rather than standing in the middle. */
  protected readonly isDocked = this.viewport.isCompact;
  protected readonly dragOffset = signal(0);
  protected readonly isDragging = signal(false);
  protected readonly maxHeight = computed(
    () => `calc(100dvh - ${this.keyboardInset()}px - env(safe-area-inset-top) - 3rem)`
  );

  private readonly openerFocus = this.hostElement.nativeElement.ownerDocument.activeElement as HTMLElement | null;
  private drag: { pointerId: number; startY: number; startedAt: number } | null = null;

  constructor() {
    afterNextRender(() => this.focusFirst());
    // A keyboard coming up can cover the box being typed in; once the sheet has moved above the
    // keyboard, the box is brought back into view.
    effect(() => {
      if (this.keyboardInset() <= 0) return;
      const active = this.hostElement.nativeElement.ownerDocument.activeElement;
      if (active instanceof HTMLElement && this.panel().nativeElement.contains(active)) {
        queueMicrotask(() => active.scrollIntoView({ block: 'nearest' }));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.openerFocus?.isConnected) this.openerFocus.focus({ preventScroll: true });
    });
  }

  /** Closes the sheet without an answer. */
  close(): void {
    this.ref.close(null);
  }

  /** Closes the sheet when the backdrop itself is pressed. */
  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  /** Closes on Escape, and keeps Tab going round inside the sheet. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.focusables();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.hostElement.nativeElement.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Starts following a finger on the grip or the heading. */
  onGripDown(event: PointerEvent): void {
    if (!this.isDocked() || event.button > 0) return;
    if ((event.target as Element | null)?.closest('button')) return;
    this.drag = { pointerId: event.pointerId, startY: event.clientY, startedAt: event.timeStamp };
    this.isDragging.set(true);
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }

  /** Moves the sheet with the finger. */
  onGripMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.dragOffset.set(sheetDragOffset(event.clientY - this.drag.startY));
  }

  /** Lets go: closes the sheet when pulled or flicked far enough, and springs back otherwise. */
  onGripUp(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const dy = event.clientY - this.drag.startY;
    const ms = event.timeStamp - this.drag.startedAt;
    this.drag = null;
    this.isDragging.set(false);
    if (shouldDismissSheet({ dy, ms, height: this.panel().nativeElement.offsetHeight })) this.close();
    else this.dragOffset.set(0);
  }

  /** Gives the sheet up when the finger is taken away by the browser, such as for a scroll. */
  onGripCancel(): void {
    this.drag = null;
    this.isDragging.set(false);
    this.dragOffset.set(0);
  }

  private focusables(): HTMLElement[] {
    return Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === element.ownerDocument.activeElement
    );
  }

  private focusFirst(): void {
    const panel = this.panel().nativeElement;
    const wanted = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    (wanted ?? panel).focus({ preventScroll: true });
  }
}
