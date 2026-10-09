import { ComponentRef, inject, Injectable } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { PanelService } from '@axe/application/ui/panel.service';
import { StampPackPanelComponent } from '@axe/features/chat/stamp-pack-panel/stamp-pack-panel.component';
import { placePopover } from '@axe/ui/anchored-popover';
import { StampPickerComponent } from '@axe/ui/components/stamp-picker/stamp-picker.component';

const PICKER_WIDTH = 320;
const PICKER_MIN_HEIGHT = 200;
const PACK_PANEL_WIDTH = 520;
const PACK_PANEL_HEIGHT = 480;

interface OpenPicker {
  readonly ref: ComponentRef<StampPickerComponent>;
  readonly anchor: Element;
  readonly stopWatching: () => void;
}

/**
 * Opens the stamps under a button, one picker at a time for the whole page.
 *
 * A line of chat asks for it to answer that line and the chat input asks for it to send one, so it
 * is made when asked for rather than kept by every line. It offers the room's own sets with the
 * stamps that come with the app, and closes on a pick, on a press outside it, on Escape, and on a
 * request to manage the sets, which opens the panel for them.
 */
@Injectable({ providedIn: 'root' })
export class StampPickerService {
  private readonly packs = inject(StampPackService);
  private readonly panelService = inject(PanelService);
  private readonly t = inject(TRANSLATE_FN);
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
    ref.setInput('packs', this.packs.packs());
    ref.setInput('canManage', this.packs.canManage);
    ref.instance.picked.subscribe((stampId) => {
      this.close();
      pick(stampId);
    });
    ref.instance.manage.subscribe(() => {
      this.close();
      this.openPackPanel();
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

  /** Opens the panel where the room's own sets of stamps are made and filled, in the middle of the window. */
  openPackPanel(): void {
    this.panelService.open(StampPackPanelComponent, {
      title: this.t('feature.chat.stampPack.title'),
      width: PACK_PANEL_WIDTH,
      height: PACK_PANEL_HEIGHT,
      left: Math.max(8, (window.innerWidth - PACK_PANEL_WIDTH) / 2),
      top: Math.max(8, (window.innerHeight - PACK_PANEL_HEIGHT) / 2),
    });
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
