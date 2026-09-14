import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { TranslocoModule } from '@jsverse/transloco';

const SUBMENU_OVERLAP_PX = 4;
const SUBMENU_RISE_PX = 16;

function screenDeltaToMenuDelta(x: number, y: number, rotationDegrees: number): { x: number; y: number } {
  const radians = (-rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'context-menu',
  templateUrl: './context-menu.component.html',
  imports: [NgClass, FormsModule, NgTemplateOutlet, TranslocoModule],
  host: { class: 'block', '(contextmenu)': 'onContextMenu($event)' },
})
export class ContextMenuComponent {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  contextMenuService = inject(ContextMenuService);
  private readonly panelService = inject(PanelService);
  private readonly modalService = inject(ModalService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * The translated title of the index menu.
   *
   * A menu carrying this title lists jump targets rather than actions and opens to the left.
   */
  get indexTitle(): string {
    return this.t('ui.contextMenu.index');
  }

  readonly rootElementRef = viewChild.required<ElementRef<HTMLElement>>('root');

  readonly isSubmenu = input(false);
  /**
   * How far down the menu the row this submenu belongs to sits, in pixels.
   *
   * A submenu is laid outside the list rather than inside the row it opens from: a list that
   * scrolls clips whatever leans out of it, so a submenu nested in a row could only be shown
   * by taking the scrolling away, which sent a long menu back to its first item and put the
   * rest of it out of reach.
   */
  readonly anchorTop = input<number | null>(null);
  readonly detachedItems = input(false);

  /** Where this menu sits, for one opened by something that lives above where menus usually go. */
  protected layer(): number {
    return this.contextMenuService.layer;
  }

  /** How much larger than usual this menu draws its text; see {@link ContextMenuService.fontScale}. */
  protected fontScale(): number {
    return this.contextMenuService.fontScale;
  }
  protected readonly titleInput = input('', { alias: 'title' });
  readonly titleColor = input('');
  readonly titleBold = input(false);
  protected readonly actionsInput = input<ContextMenuAction[]>([], { alias: 'actions' });

  /** The menu's heading: a submenu's own, or whatever the context menu service was opened with. */
  get title(): string {
    return this.isSubmenu() ? this.titleInput() : this.contextMenuService.title;
  }
  /** The rows of the menu: a submenu's own, or whatever the context menu service was opened with. */
  get actions(): ContextMenuAction[] {
    return this.isSubmenu() ? this.actionsInput() : this.contextMenuService.actions;
  }

  readonly parentMenu = signal<ContextMenuAction | undefined>(undefined);
  readonly subMenu = signal<ContextMenuAction[] | undefined>(undefined);
  /** Where the row a submenu belongs to sits, read as it opens rather than while it is up. */
  readonly subMenuAnchorTop = signal<number | null>(null);

  private showSubMenuTimer: ReturnType<typeof setTimeout> | undefined;
  private hideSubMenuTimer: ReturnType<typeof setTimeout> | undefined;

  private callbackOnOutsideClick = (e: Event) => this.onOutsideClick(e);

  constructor() {
    afterNextRender(() => {
      if (!this.isSubmenu()) {
        this.adjustPositionRoot();
        document.addEventListener('touchstart', this.callbackOnOutsideClick, true);
        document.addEventListener('mousedown', this.callbackOnOutsideClick, true);
      } else {
        this.adjustPositionSub();
      }
      this.indexMenuPosion();
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.showSubMenuTimer);
      clearTimeout(this.hideSubMenuTimer);
      document.removeEventListener('touchstart', this.callbackOnOutsideClick, true);
      document.removeEventListener('mousedown', this.callbackOnOutsideClick, true);
    });
  }

  /** Whether something is being dragged, during which the menu lets the pointer through. */
  get isPointerDragging(): boolean {
    return this.pointerDeviceService.isDragging;
  }

  /**
   * The piece whose altitude this menu offers a slider for, taken from the first action that
   * carries one; null shows no slider.
   */
  get altitudeHandle(): TabletopObject | null {
    for (const action of this.actions) {
      if (action && action.altitudeHandle) return action.altitudeHandle;
    }
    return null;
  }

  /** Sets the piece's altitude from the slider and syncs it; nothing without a piece. */
  onAltitudeChange(value: number | string): void {
    const target = this.altitudeHandle;
    if (!target) return;
    target.altitude = Number(value);
    target.update();
  }

  /** Closes the menu when a press lands anywhere outside it. */
  onOutsideClick(event: Event) {
    if (!this.rootElementRef().nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  /** Keeps a right-click on the menu from opening the browser's menu or another context menu. */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Moves the index menu one menu-width to the left of where it opened; other menus are left alone. */
  indexMenuPosion() {
    if (this.title != this.indexTitle) return;

    const panel: HTMLElement = this.rootElementRef().nativeElement;
    const panelBox = panel.getBoundingClientRect();

    const w = panelBox.right - panelBox.left;
    const newLeft = panelBox.left - w;

    panel.style.left = newLeft + 'px';
    //    panel.style.right = newRight + 'px';
  }

  private adjustPositionRoot() {
    const panel: HTMLElement = this.rootElementRef().nativeElement;

    panel.style.left = this.contextMenuService.position.x + 'px';
    panel.style.top = this.contextMenuService.position.y + 'px';

    const panelBox = panel.getBoundingClientRect();

    let diffLeft = 0;
    let diffTop = 0;

    if (window.innerWidth < panelBox.right + diffLeft) {
      diffLeft += window.innerWidth - (panelBox.right + diffLeft);
    }
    if (panelBox.left + diffLeft < 0) {
      diffLeft += 0 - (panelBox.left + diffLeft);
    }

    if (window.innerHeight < panelBox.bottom + diffTop) {
      diffTop += window.innerHeight - (panelBox.bottom + diffTop);
    }
    if (panelBox.top + diffTop < 0) {
      diffTop += 0 - (panelBox.top + diffTop);
    }

    panel.style.left = panel.offsetLeft + diffLeft + 'px';
    panel.style.top = panel.offsetTop + diffTop + 'px';
  }

  private adjustPositionSub() {
    const parent: HTMLElement = this.elementRef.nativeElement.parentElement!;
    const submenu: HTMLElement = this.rootElementRef().nativeElement;

    let left = parent.offsetWidth - SUBMENU_OVERLAP_PX;
    let top = (this.anchorTop() ?? 0) - SUBMENU_RISE_PX;
    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;

    const placed = submenu.getBoundingClientRect();
    const margin = 8;
    const screenX =
      placed.left < margin
        ? margin - placed.left
        : placed.right > window.innerWidth - margin
          ? window.innerWidth - margin - placed.right
          : 0;
    const screenY =
      placed.top < margin
        ? margin - placed.top
        : placed.bottom > window.innerHeight - margin
          ? window.innerHeight - margin - placed.bottom
          : 0;
    const localCorrection = screenDeltaToMenuDelta(screenX, screenY, this.contextMenuService.rotationDegrees);
    left += localCorrection.x;
    top += localCorrection.y;
    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
  }

  /** How far the list this row sits in has been scrolled, which its own offset knows nothing of. */
  private listScrollTop(row: HTMLElement): number | null {
    for (let held = row.parentElement; held; held = held.parentElement) {
      if (held.scrollHeight > held.clientHeight && held.scrollTop > 0) return held.scrollTop;
      if (held.hasAttribute('data-context-menu-root')) return null;
    }
    return null;
  }

  /** Closes an open submenu when the list scrolls, since it would no longer line up with its row. */
  onListScroll(): void {
    if (this.subMenu()) this.subMenu.set(undefined);
  }

  /** Called when an index row is clicked: asks for a jump to that line of the item it belongs to. */
  indexAction(indexline: number, id: string) {
    this.uiSignalService.requestJumpIndex(id, indexline);
  }

  /**
   * Called when a row is clicked.
   *
   * Its submenu, if any, opens at once. A row with an action runs it, so that any panel or modal
   * it opens is turned the way the menu is, and then closes the menu.
   */
  doAction(action: ContextMenuAction, row?: HTMLElement) {
    this.showSubMenu(action, true, row);
    if (action.action != null) {
      const rotationDegrees = this.contextMenuService.rotationDegrees;
      this.panelService.runWithInitialRotation(rotationDegrees, () =>
        this.modalService.runWithInitialRotation(rotationDegrees, action.action!)
      );
      this.close();
    }
  }

  /**
   * Opens a row's submenu beside it, after a short hover delay unless `immediately` is set.
   *
   * Any submenu already open is scheduled to close, and a row without sub-actions opens nothing.
   */
  showSubMenu(action: ContextMenuAction, immediately = false, row?: HTMLElement) {
    this.hideSubMenu();
    clearTimeout(this.showSubMenuTimer);
    if (action.subActions == null || action.subActions.length === 0) return;
    const open = () => {
      this.parentMenu.set(action);
      this.subMenuAnchorTop.set(row ? row.offsetTop - (this.listScrollTop(row) ?? 0) : null);
      this.subMenu.set(action.subActions ?? []);
      clearTimeout(this.hideSubMenuTimer);
    };
    if (immediately) {
      open();
    } else {
      this.showSubMenuTimer = setTimeout(open, 250);
    }
  }

  /** Closes the open submenu after a grace period, so the pointer can cross over to it. */
  hideSubMenu() {
    clearTimeout(this.hideSubMenuTimer);
    this.hideSubMenuTimer = setTimeout(() => {
      this.subMenu.set(undefined);
    }, 1200);
  }

  /** Closes the whole context menu, submenus and all. */
  close() {
    if (this.contextMenuService) this.contextMenuService.close();
  }
}
