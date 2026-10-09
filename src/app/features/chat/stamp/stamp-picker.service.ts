import { ComponentRef, Injectable } from '@angular/core';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { placePopover } from '@axe/ui/anchored-popover';
import { StampPickerComponent } from '@axe/ui/components/stamp-picker/stamp-picker.component';

const PICKER_WIDTH = 320;
const PICKER_MIN_HEIGHT = 200;

interface OpenPicker {
  readonly ref: ComponentRef<StampPickerComponent>;
  readonly anchor: Element;
  readonly stopWatching: () => void;
}

/**
 * Opens the stamps under a button, one picker at a time for the whole page.
 *
 * A line of chat asks for it to answer that line and the chat input asks for it to send one, so it
 * is made when asked for rather than kept by every line. It closes on a pick, on a press outside it,
 * and on Escape.
 */
@Injectable({ providedIn: 'root' })
export class StampPickerService {
  private opened: OpenPicker | null = null;

  /**
   * Opens the stamps under `anchor`, handing the one picked to `pick`, or closes them where the same
   * button opened them last.
   */
  toggle(anchor: Element, pick: (stampId: string) => void): void {
    if (this.opened?.anchor === anchor) {
      this.close();
      return;
    }
    this.open(anchor, pick);
  }

  /** Opens the stamps under `anchor`, closing any already open. */
  open(anchor: Element, pick: (stampId: string) => void): void {
    this.close();
    const parent =
      OverlayLayers.layerFor(anchor.ownerDocument) ??
      OverlayLayers.current() ??
      ContextMenuService.defaultParentViewContainerRef;
    if (!parent) return;

    const ref = parent.createComponent(StampPickerComponent, { index: parent.length, injector: parent.injector });
    const element = ref.location.nativeElement as HTMLElement;
    ref.instance.picked.subscribe((stampId) => {
      this.close();
      pick(stampId);
    });
    ref.changeDetectorRef.detectChanges();
    if (typeof element.showPopover === 'function') element.showPopover();
    placePopover(element, anchor.getBoundingClientRect(), {
      width: PICKER_WIDTH,
      minHeight: PICKER_MIN_HEIGHT,
      align: 'center',
    });

    const page = element.ownerDocument;
    const onPointerDown = (event: Event) => {
      const target = event.target as Node;
      if (element.contains(target) || anchor.contains(target)) return;
      this.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      this.close();
    };
    page.addEventListener('pointerdown', onPointerDown, true);
    page.addEventListener('keydown', onKeyDown, true);
    this.opened = {
      ref,
      anchor,
      stopWatching: () => {
        page.removeEventListener('pointerdown', onPointerDown, true);
        page.removeEventListener('keydown', onKeyDown, true);
      },
    };
  }

  /** Closes the stamps; nothing where none are open. */
  close(): void {
    const opened = this.opened;
    if (!opened) return;
    this.opened = null;
    opened.stopWatching();
    opened.ref.destroy();
  }

  /** Whether the stamps stand open under this button. */
  isOpenFor(anchor: Element): boolean {
    return this.opened?.anchor === anchor;
  }
}
