import { NgClass } from '@angular/common';
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
  untracked,
  viewChild,
} from '@angular/core';
import { RoomFilesService } from '@axe/application/file/room-files.service';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { WIDGET_FAB } from '@axe/application/ui/widget-place';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { MENU_SURFACES, MenuCommand } from '@axe/domain/ui/menu-command';
import {
  isMenuGroupView,
  MenuCommandService,
  MenuEntryView,
  MenuGroupView,
  MenuNodeView,
} from '@axe/features/menu/menu-command.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { UiFabSubmenuComponent } from '@axe/ui/components/fab-submenu/fab-submenu.component';
import { UiFabSubmenuButtonComponent } from '@axe/ui/components/fab-submenu/fab-submenu-button.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import {
  FAB_COLUMN_CLASSES,
  FAB_GUIDE_DRAWER_CLASSES,
  FAB_GUIDE_ROW_CLASSES,
  fabDrawerPlaceClasses,
  FabDrawerSide,
  fabDrawerSide,
  fabLabelSideClasses,
  fabPopoverSideClasses,
  FabSubmenuAnchor,
  fabSubmenuAnchor,
} from '@axe/ui/fab-drawer';
import { TranslocoModule } from '@jsverse/transloco';

/** How far from the corner the button starts, before anybody has put it anywhere. */
const FAB_MARGIN_PX = 12;

/**
 * The menu button that floats over the table, and the drawer of menus it opens.
 *
 * While it is drawn it hands the menus its file picker, which is how a room is loaded from any of
 * them; a screen without the drawer has a picker of its own.
 */
@Component({
  selector: 'app-fab-drawer',
  templateUrl: './fab-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgClass,
    DraggableDirective,
    WidgetPlaceDirective,
    UiFabSubmenuComponent,
    UiFabSubmenuButtonComponent,
    TranslocoModule,
  ],
  // The drawer opens toward whichever side of the screen has room for it, and a window that
  // changes shape can leave the button on the other side without anybody touching it.
  host: { '(window:resize)': 'measureFabSides()' },
})
export class FabDrawerComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly menuCommands = inject(MenuCommandService);
  private readonly menuLayouts = inject(MenuLayoutService);
  private readonly fabLayout = this.menuLayouts.layoutOf('fab');
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointers = inject(PointerDeviceService);
  private readonly confirm = inject(ConfirmService);
  private readonly hotbarFill = inject(HotbarFillService);
  protected readonly roomFiles = inject(RoomFilesService);

  readonly fabOpen = signal(true);

  protected readonly fabWidget = WIDGET_FAB;
  protected readonly fabFallback = () => ({ left: FAB_MARGIN_PX, top: FAB_MARGIN_PX });
  private readonly fabMenuRef = viewChild<ElementRef<HTMLElement>>('fabMenu');
  private readonly fabSide = signal<FabDrawerSide>({ up: false, left: false });

  /**
   * Where the drawer hangs from the button, which is wherever there is room for it.
   *
   * The order of what is in it never turns round with the drawer: the first thing on the
   * list is at the top whichever way it opens, so a menu learnt in one corner is the same
   * menu in another.
   */
  protected readonly fabDrawerPlace = computed(() => fabDrawerPlaceClasses(this.fabSide()));

  /** Which side of an item its name is written on, so it is never written off the screen. */
  protected readonly fabLabelSide = computed(() => fabLabelSideClasses(this.fabSide()));

  protected readonly fabColumns = FAB_COLUMN_CLASSES;

  /** Whether every button in the drawer and on the toolbars is saying what it is. */
  protected readonly guide = inject(ButtonGuideService);
  protected readonly fabGuideDrawer = FAB_GUIDE_DRAWER_CLASSES;
  protected readonly fabGuideRow = FAB_GUIDE_ROW_CLASSES;

  /** The drawer as this seat is offered it, in the order this screen has it arranged. */
  protected readonly fabNodes = computed<MenuNodeView[]>(() => this.menuCommands.viewOf(this.fabLayout()));

  /** Which of the drawer's menus is open beside it, if any; opening one closes the one before. */
  protected readonly fabSubmenu = signal<string | null>(null);

  /** The small menu open beside the drawer, once the drawer still holds one by that name. */
  protected readonly openGroup = computed<MenuGroupView | null>(() => {
    const open = this.fabSubmenu();
    if (!open) return null;
    const node = this.fabNodes().find((held) => isMenuGroupView(held) && held.id === open);
    return node && isMenuGroupView(node) ? node : null;
  });

  /** Which side of the drawer they open on, which is the side with room. */
  protected readonly fabSubmenuSide = computed(() => fabPopoverSideClasses(this.fabSide()));

  /** Where the open menu is pinned, level with the item it was opened from. */
  protected readonly fabSubmenuPlace = signal<FabSubmenuAnchor>({ top: null, bottom: 0 });

  private readonly zipInput = viewChild<ElementRef<HTMLInputElement>>('zipInput');

  protected readonly isGroup = isMenuGroupView;

  constructor() {
    // Asking for files to load is this drawer's to do, the picker being an element of it; it closes
    // its small menu as the picker opens.
    this.menuCommands.registerFilePicker(() => {
      this.closeFabSubmenu();
      this.zipInput()?.nativeElement.click();
    });
    inject(DestroyRef).onDestroy(() => this.menuCommands.registerFilePicker(null));

    // What a small menu holds is written out beside it with the rest, so one left open would only
    // say it twice, and over the names beside it. A save gets the menu out of the way as it runs.
    effect(() => {
      if (this.guide.shown() || this.roomFiles.isSaving()) untracked(() => this.fabSubmenu.set(null));
    });

    afterNextRender(() => this.measureFabSides());
  }

  /**
   * The way back into the menus, from the drawer's own button.
   *
   * Everything else about the drawer can be arranged away, the entry that opens the editor
   * included, and somebody who takes that one off has nothing left to put it back with. The
   * button is not part of any arrangement, so what it offers cannot be arranged away either.
   */
  protected onFabContextMenu(event: MouseEvent): void {
    if (!this.pointers.isAllowedToOpenContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(
      this.pointers.pointers[0],
      [
        { name: this.t('feature.menuEditor.title'), action: () => this.roomPanels.open('menuEditor') },
        { name: this.t('feature.menuEditor.resetAll'), action: () => void this.resetEveryMenu() },
        { name: this.t('app.fab.buttonGuide'), action: () => this.guide.show() },
      ],
      this.t('app.fab.menuOpen')
    );
  }

  /** Puts every menu on this screen back the way it came, once whoever asked has said they mean it. */
  private async resetEveryMenu(): Promise<void> {
    if (!(await this.confirm.ask(this.t('feature.menuEditor.resetAllConfirm')))) return;
    for (const surface of MENU_SURFACES) this.menuLayouts.reset(surface);
  }

  protected toggleFab(): void {
    this.measureFabSides();
    this.fabOpen.set(!this.fabOpen());
    if (!this.fabOpen()) this.fabSubmenu.set(null);
  }

  protected toggleFabSubmenu(kind: string, event: Event): void {
    this.measureFabSides();
    const opener = event.currentTarget;
    if (opener instanceof HTMLElement && opener.offsetParent instanceof HTMLElement) {
      const box = opener.getBoundingClientRect();
      this.fabSubmenuPlace.set(
        fabSubmenuAnchor({
          offsetTop: opener.offsetTop,
          height: opener.offsetHeight,
          drawerHeight: opener.offsetParent.clientHeight,
          centerInWindow: box.top + box.height / 2,
          windowHeight: window.innerHeight,
        })
      );
    }
    this.fabSubmenu.update((open) => (open === kind ? null : kind));
  }

  protected closeFabSubmenu(): void {
    this.fabSubmenu.set(null);
  }

  /** Reads where the button has been put, which is what settles the way the drawer opens. */
  protected measureFabSides(): void {
    const element = this.fabMenuRef()?.nativeElement;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.width < 1 && box.height < 1) return;
    this.fabSide.set(fabDrawerSide(box, { width: window.innerWidth, height: window.innerHeight }));
  }

  /**
   * Opens a small menu of the drawer, or does what one of its own entries is for.
   *
   * With every name written out, a small menu is opened the usual way once the guide is put away,
   * so whoever went looking for it sees where it lives.
   */
  protected chooseFab(node: MenuNodeView, event: Event): void {
    if (isMenuGroupView(node)) {
      this.guide.hide();
      this.toggleFabSubmenu(node.id, event);
    } else this.chooseFromFabSubmenu(node);
  }

  /**
   * Presses an entry of the drawer from a click.
   *
   * A click with the pointer hands the focus back to the page, as it did before an entry could take
   * it, so the table's own keys still answer once the menu has done its work.
   */
  protected clickFab(node: MenuNodeView, event: MouseEvent): void {
    if (event.detail > 0 && event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
    this.chooseFab(node, event);
  }

  /**
   * Presses an entry of the drawer from Enter or Space, as a click would.
   *
   * A key pressed on one of the buttons written beside it while every name is shown is left to
   * that button.
   */
  protected pressFabFromKey(node: MenuNodeView, event: Event): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.chooseFab(node, event);
  }

  /** What a small menu holds, written beside it while every name is written out. */
  protected entriesOf(node: MenuNodeView): readonly MenuEntryView[] {
    return isMenuGroupView(node) ? node.entries : [];
  }

  /**
   * Does what an entry is for, and closes the menu it was in behind it, unless the entry is a
   * switch of this seat's own that is pressed in turn to see each choice.
   */
  protected chooseFromFabSubmenu(entry: MenuEntryView): void {
    if (entry.disabled) return;
    if (!entry.command.stays) this.closeFabSubmenu();
    this.menuCommands.run(entry.command);
  }

  /**
   * Offers to put an entry of the drawer on the hotbar, where a key presses it.
   *
   * An entry that draws a menu of its own has nothing a slot could press, so it offers nothing and
   * the browser's own menu is left alone.
   */
  protected onFabEntryContextMenu(event: MouseEvent, entry: MenuEntryView): void {
    if (entry.command.action.kind === 'custom' || !this.pointers.isAllowedToOpenContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(
      this.pointers.pointers[0],
      [{ name: this.t('feature.hotbar.menu.fillFromHere'), action: () => this.putOnHotbar(entry.command) }],
      this.fabNodeLabel(entry)
    );
  }

  private putOnHotbar(command: MenuCommand): void {
    const draft = emptyHotbarSlotDraft('menu');
    draft.payload = { kind: 'menu', command: command.key };
    this.hotbarFill.fill(draft);
  }

  /**
   * What is written in the bubble beside an entry.
   *
   * A name somebody gave it wins; otherwise the command names itself, with a word in front where
   * the name alone would not say what it is. While a save runs, the one that started it counts
   * out instead.
   */
  protected fabNodeLabel(node: MenuNodeView): string {
    if (isMenuGroupView(node)) {
      if (node.id === 'saveLoad' && this.roomFiles.isSaving()) return `${this.roomFiles.progressPercent()}%`;
      return node.label ?? this.t(node.labelKey);
    }
    if (node.label) return node.label;
    const name = this.t(node.labelKey);
    return node.prefixKey ? `${this.t(node.prefixKey)}: ${name}` : name;
  }
}
