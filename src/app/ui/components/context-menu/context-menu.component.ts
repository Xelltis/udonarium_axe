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

  get indexTitle(): string {
    return this.t('ui.contextMenu.index');
  }

  readonly rootElementRef = viewChild.required<ElementRef<HTMLElement>>('root');

  readonly isSubmenu = input(false);
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

  get title(): string {
    return this.isSubmenu() ? this.titleInput() : this.contextMenuService.title;
  }
  get actions(): ContextMenuAction[] {
    return this.isSubmenu() ? this.actionsInput() : this.contextMenuService.actions;
  }

  readonly parentMenu = signal<ContextMenuAction | undefined>(undefined);
  readonly subMenu = signal<ContextMenuAction[] | undefined>(undefined);

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

  get isPointerDragging(): boolean {
    return this.pointerDeviceService.isDragging;
  }

  get altitudeHandle(): TabletopObject | null {
    for (const action of this.actions) {
      if (action && action.altitudeHandle) return action.altitudeHandle;
    }
    return null;
  }

  onAltitudeChange(value: number | string): void {
    const target = this.altitudeHandle;
    if (!target) return;
    target.altitude = Number(value);
    target.update();
  }

  onOutsideClick(event: Event) {
    if (!this.rootElementRef().nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }

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
    let top = -SUBMENU_RISE_PX;
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

  onListScroll(): void {
    if (this.subMenu()) this.subMenu.set(undefined);
  }

  indexAction(indexline: number, id: string) {
    this.uiSignalService.requestJumpIndex(id, indexline);
  }

  doAction(action: ContextMenuAction) {
    this.showSubMenu(action, true);
    if (action.action != null) {
      const rotationDegrees = this.contextMenuService.rotationDegrees;
      this.panelService.runWithInitialRotation(rotationDegrees, () =>
        this.modalService.runWithInitialRotation(rotationDegrees, action.action!)
      );
      this.close();
    }
  }

  showSubMenu(action: ContextMenuAction, immediately = false) {
    this.hideSubMenu();
    clearTimeout(this.showSubMenuTimer);
    if (action.subActions == null || action.subActions.length === 0) return;
    const open = () => {
      this.parentMenu.set(action);
      this.subMenu.set(action.subActions ?? []);
      clearTimeout(this.hideSubMenuTimer);
    };
    if (immediately) {
      open();
    } else {
      this.showSubMenuTimer = setTimeout(open, 250);
    }
  }

  hideSubMenu() {
    clearTimeout(this.hideSubMenuTimer);
    this.hideSubMenuTimer = setTimeout(() => {
      this.subMenu.set(undefined);
    }, 1200);
  }

  close() {
    if (this.contextMenuService) this.contextMenuService.close();
  }
}
