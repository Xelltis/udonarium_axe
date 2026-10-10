import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { downloadBlob } from '@axe/core/util/download-blob';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { defaultMenuLayout } from '@axe/domain/ui/builtin-menu-layouts';
import {
  MENU_COMMANDS,
  MENU_SURFACES,
  MenuCommand,
  menuCommandOf,
  menuCommandsFor,
  MenuSurface,
  menuSurfaceTakesGroups,
} from '@axe/domain/ui/menu-command';
import { isMenuGroup, MenuGroup, MenuLayout, MenuNode } from '@axe/domain/ui/menu-layout';
import {
  addMenuGroup,
  addMenuItem,
  dropMenuNode,
  menuDropSpot,
  MenuParent,
  moveMenuNode,
  moveMenuNodeInto,
  parentOfMenuNode,
  placeMenuNode,
  removeMenuNode,
  renameMenuNode,
  setMenuNodeIcon,
} from '@axe/domain/ui/menu-layout-edit';
import { encodeMenuLayoutFile, MENU_LAYOUT_FILE_NAME, parseMenuLayoutFile } from '@axe/domain/ui/menu-layout-file';
import { MenuCommandService } from '@axe/features/menu/menu-command.service';
import { MenuCommandPickerComponent } from '@axe/features/menu/menu-editor-panel/menu-command-picker.component';
import { IconPickerComponent } from '@axe/ui/components/icon-picker/icon-picker.component';
import { RowReorder } from '@axe/ui/dragging/row-reorder';
import { TranslocoModule } from '@jsverse/transloco';

/** One row of the arrangement being edited, at whichever level it sits. */
interface EditorRow {
  node: MenuNode;
  /** Which small menu it sits in, for the picker that moves it elsewhere. */
  parent: MenuParent;
  /** Drawn a step in where it sits inside a small menu. */
  nested: boolean;
  /** The command it stands for, or null for a small menu and for a command this version lost. */
  command: MenuCommand | null;
  /** What it is called now, ready to show. */
  name: string;
  /** The mark it wears now. */
  icon: string;
  /** Whether the command it names is one this version no longer has. */
  lost: boolean;
}

/** The marks the menus already wear, which are the ones worth offering before anything is typed. */
function marksInUse(): string[] {
  const marks = new Set(MENU_COMMANDS.map((command) => command.icon));
  for (const surface of MENU_SURFACES) {
    for (const node of defaultMenuLayout(surface).nodes) if (isMenuGroup(node)) marks.add(node.icon);
  }
  return [...marks].sort();
}

/**
 * Arranging the drawer and the two toolbars.
 *
 * What is arranged here belongs to this browser: the room never sees it, and neither does anybody
 * else at the table. Every menu can be emptied outright and put back the way it came, so there is
 * nothing here somebody can break and not undo.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-menu-editor-panel',
  templateUrl: './menu-editor-panel.component.html',
  imports: [FormsModule, IconPickerComponent, MenuCommandPickerComponent, TranslocoModule],
})
export class MenuEditorPanelComponent {
  private readonly layouts = inject(MenuLayoutService);
  private readonly commands = inject(MenuCommandService);
  private readonly confirm = inject(ConfirmService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly pointers = inject(PointerDeviceService);
  private readonly injector = inject(Injector);
  private readonly t = inject(TRANSLATE_FN);

  /** The marks offered before anything is typed into the search. */
  protected readonly suggestedIcons = marksInUse();

  /** Which menu is being arranged. */
  readonly surface = signal<MenuSurface>('fab');

  /** The menus this seat may arrange; a player has no master's bar to arrange and the other way about. */
  protected readonly surfaces = computed<MenuSurface[]>(() => {
    const role = this.commands.role();
    return MENU_SURFACES.filter((held) => {
      if (held === 'gmToolbar') return role === PeerRole.GameMaster;
      if (held === 'plToolbar') return role === PeerRole.Player;
      return true;
    });
  });

  /** Whether this menu has anywhere to open a small menu, which only the drawer has. */
  protected readonly takesGroups = computed(() => menuSurfaceTakesGroups(this.surface()));

  private readonly layout = computed<MenuLayout>(() => this.layouts.layoutOf(this.surface())());

  /** Whether this screen has arranged this menu itself, which is what there is to put back. */
  protected readonly arranged = computed(() => {
    this.layout();
    return this.layouts.isArranged(this.surface());
  });

  /** The arrangement as rows, the small menus with what is in them beneath. */
  protected readonly rows = computed<EditorRow[]>(() => {
    const rows: EditorRow[] = [];
    for (const node of this.layout().nodes) {
      rows.push(this.rowOf(node, null));
      if (isMenuGroup(node)) for (const item of node.items) rows.push(this.rowOf(item, node.id));
    }
    return rows;
  });

  /** The commands this seat may still put on this menu, those already on it left out. */
  protected readonly offered = computed<MenuCommand[]>(() => {
    const used = new Set(
      this.rows()
        .map((row) => row.command?.key)
        .filter((key): key is string => key !== undefined)
    );
    return menuCommandsFor(this.surface(), this.commands.role()).filter((command) => !used.has(command.key));
  });

  protected choose(surface: MenuSurface): void {
    this.surface.set(surface);
  }

  protected surfaceLabelKey(surface: MenuSurface): string {
    return `feature.menuEditor.surface.${surface}`;
  }

  protected isGroupRow(row: EditorRow): boolean {
    return isMenuGroup(row.node);
  }

  private readonly rowsRef = viewChild<ElementRef<HTMLElement>>('rowsEl');

  /** Puts a command on the end of the menu, and brings the end of the menu into view. */
  protected addCommand(key: string): void {
    this.write(addMenuItem(this.layout(), key, null));
    this.showTheEnd();
  }

  /**
   * Makes an empty small menu on the end, named for now.
   *
   * It is named here rather than asked for beforehand, since the row it makes already has a name
   * to write in and asking twice for the same thing is a form to fill in, not a menu to arrange.
   */
  protected addGroup(): void {
    this.write(addMenuGroup(this.layout(), this.t('feature.menuEditor.newGroup')));
    this.showTheEnd();
  }

  private showTheEnd(): void {
    afterNextRender(
      () => {
        const rows = this.rowsRef()?.nativeElement;
        if (rows) rows.scrollTop = rows.scrollHeight;
      },
      { injector: this.injector }
    );
  }

  protected remove(row: EditorRow): void {
    this.write(removeMenuNode(this.layout(), row.node.id));
  }

  protected rename(row: EditorRow, label: string): void {
    this.write(renameMenuNode(this.layout(), row.node.id, label));
  }

  protected setIcon(row: EditorRow, icon: string): void {
    this.write(setMenuNodeIcon(this.layout(), row.node.id, icon));
  }

  protected move(row: EditorRow, delta: number): void {
    this.write(moveMenuNode(this.layout(), row.node.id, delta));
  }

  /** Puts this menu back the way it came, once whoever asked has said they mean it. */
  protected async reset(): Promise<void> {
    if (!(await this.confirm.ask(this.t('feature.menuEditor.resetConfirm')))) return;
    this.layouts.reset(this.surface());
  }

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Whether there is anything to write out: a screen that has arranged nothing has nothing to carry. */
  protected readonly hasArrangements = computed(() => {
    this.layout();
    return Object.keys(this.layouts.arrangements()).length > 0;
  });

  /** Writes out every menu this screen has arranged, for carrying to another screen. */
  protected writeOut(): void {
    const written = encodeMenuLayoutFile(this.layouts.arrangements());
    downloadBlob(new Blob([written], { type: 'application/json' }), MENU_LAYOUT_FILE_NAME);
  }

  protected chooseFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** Takes the arrangements out of a file, leaving the menus it says nothing about alone. */
  protected async readIn(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const layouts = parseMenuLayoutFile(await file.text());
    if (!layouts) {
      this.failed.set(true);
      return;
    }
    this.failed.set(false);
    this.layouts.adopt(layouts);
  }

  /** Whether the last file offered could not be read as an arrangement. */
  protected readonly failed = signal(false);

  private write(layout: MenuLayout): void {
    this.layouts.save(this.surface(), layout);
  }

  private rowOf(node: MenuNode, parent: MenuParent): EditorRow {
    const group = isMenuGroup(node);
    const command = group ? null : menuCommandOf(node.command);
    return {
      node,
      parent: group ? null : parent,
      nested: parent !== null,
      command,
      name: group ? this.nameOfGroup(node) : this.nameOfItem(node.label, command),
      icon: group ? node.icon : (node.icon ?? command?.icon ?? 'help_outline'),
      lost: !group && command === null,
    };
  }

  private nameOfGroup(group: MenuGroup): string {
    return group.label ?? (group.labelKey ? this.t(group.labelKey) : this.t('feature.menuEditor.unnamedGroup'));
  }

  private nameOfItem(label: string | undefined, command: MenuCommand | null): string {
    if (label) return label;
    if (!command) return this.t('feature.menuEditor.lost');
    return this.t(command.labelKey);
  }

  /** Where the row sits among the ones it sits with, so the ends know not to offer a move. */
  protected placeOf(row: EditorRow): { index: number; count: number } {
    const siblings = this.rows().filter((held) => held.parent === row.parent && held.nested === row.nested);
    return { index: siblings.indexOf(row), count: siblings.length };
  }

  /** The drag of a row, which puts entries in order and carries them in and out of small menus. */
  protected readonly dragging = new RowReorder<string>();

  protected onDragStart(event: DragEvent, row: EditorRow, element: HTMLElement): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setDragImage(element, 0, 0);
    }
    this.dragging.begin(row.node.id);
  }

  /** Marks the row under the pointer, unless what is held has nowhere to land beside it. */
  protected onDragOver(event: DragEvent, row: EditorRow, element: HTMLElement): void {
    event.preventDefault();
    const held = this.dragging.held();
    if (held === null) return;
    if (menuDropSpot(this.layout(), held, row.node.id, 'after') === null) {
      this.dragging.leave();
      return;
    }
    const bounds = element.getBoundingClientRect();
    this.dragging.hoverHalf(row.node.id, { top: bounds.top, height: bounds.height }, event.clientY);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const dropped = this.dragging.release();
    if (dropped === null) return;
    const held = this.layout();
    const after = dropMenuNode(held, dropped.held, dropped.over, dropped.side ?? 'before');
    if (after !== held) this.write(after);
  }

  protected onDragEnd(): void {
    this.dragging.cancel();
  }

  /** Whether a drop now would put what is held inside this small menu, rather than after it. */
  protected dropsInto(row: EditorRow): boolean {
    const held = this.dragging.held();
    if (held === null || !this.dragging.isDropAfter(row.node.id)) return false;
    return menuDropSpot(this.layout(), held, row.node.id, 'after')?.parent === row.node.id;
  }

  /**
   * Moving a row from its own menu, opened by a right click or a press held on it.
   *
   * The rows are otherwise arranged by dragging, which a touch screen may not start at all, so
   * everything dragging does is offered here as well: the steps up and down, and the small menu
   * to carry the entry into or out of.
   */
  protected onRowContextMenu(event: MouseEvent, row: EditorRow): void {
    if (!this.pointers.isAllowedToOpenContextMenu) return;
    const actions = [...this.stepActions(row), ...this.carryActions(row)];
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.open(this.pointers.pointers[0], actions, row.name);
  }

  private stepActions(row: EditorRow): ContextMenuAction[] {
    const place = this.placeOf(row);
    return buildReorderContextMenu(
      place,
      {
        moveToTop: () => this.slide(row, 0),
        moveUp: () => this.move(row, -1),
        moveDown: () => this.move(row, 1),
        moveToBottom: () => this.slide(row, place.count),
      },
      this.t
    );
  }

  private carryActions(row: EditorRow): ContextMenuAction[] {
    if (isMenuGroup(row.node)) return [];
    const here = parentOfMenuNode(this.layout(), row.node.id);
    const actions: ContextMenuAction[] = [];
    if (here !== null) {
      actions.push({ name: this.t('feature.menuEditor.topLevel'), action: () => this.carry(row, null) });
    }
    for (const group of this.layout().nodes.filter(isMenuGroup)) {
      if (group.id !== here) actions.push({ name: this.nameOfGroup(group), action: () => this.carry(row, group.id) });
    }
    return actions.length > 0 ? [{ name: this.t('feature.menuEditor.moveInto'), subActions: actions }] : [];
  }

  private carry(row: EditorRow, into: MenuParent): void {
    const held = this.layout();
    const after = moveMenuNodeInto(held, row.node.id, into);
    if (after !== held) this.write(after);
  }

  private slide(row: EditorRow, index: number): void {
    const held = this.layout();
    const after = placeMenuNode(held, row.node.id, { parent: row.parent, index });
    if (after !== held) this.write(after);
  }
}
