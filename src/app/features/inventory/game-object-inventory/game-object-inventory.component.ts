import { NgClass, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import {
  buildInventoryTable,
  InventoryTable,
  InventoryTableColumn,
  InventoryTableRow,
} from '@axe/application/inventory/inventory-table';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { InventoryViewPreferenceService } from '@axe/application/ui/inventory-view-preference.service';
import { PanelHeaderControl, PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { Network } from '@axe/core/index';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { turnCache } from '@axe/core/util/turn-cache';
import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { BuffBadge, buffIconUrlOf, toBuffBadges } from '@axe/domain/character/buff-badge';
import {
  ancestorFolderPaths,
  FOLDER_SEPARATOR,
  folderSegments,
  isDescendantFolderPath,
  MAX_FOLDER_DEPTH,
  normalizeFolderPath,
  rewriteFolderPath,
} from '@axe/domain/character/character-folder';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { createCalcPass, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { InventoryChromePart } from '@axe/domain/inventory/inventory-chrome';
import {
  INVENTORY_VIEW_LABEL_KEYS,
  InventoryViewMode,
  nextInventoryViewMode,
} from '@axe/domain/inventory/inventory-view-mode';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { NpcDragService } from '@axe/features/gm-tools/npc-bar/npc-drag.service';
import {
  buildInventoryFolderAssignMenu,
  buildInventoryFolderContextMenu,
  buildInventoryMultiMoveContextMenu,
  buildInventoryObjectContextMenu,
} from '@axe/features/inventory/game-object-inventory/game-object-inventory-context-menu';
import {
  buildFolderTree,
  collectFolderPaths,
  type FolderTree,
} from '@axe/features/inventory/game-object-inventory/inventory-folder-tree';
import {
  bandRowsBySide,
  buildInventoryRow,
  filterInventoryRows,
  filterInventoryRowsByHidden,
  type InventoryHiddenFilter,
  type InventoryRow,
  inventorySearchText,
  type SideBand,
} from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryObjectDrag } from '@axe/features/inventory/game-object-inventory/inventory-object-drag';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import {
  INVENTORY_FILTER_PANEL,
  InventoryFilterPanelComponent,
} from '@axe/features/inventory/inventory-filter-panel/inventory-filter-panel.component';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { AutoFocusDirective } from '@axe/ui/directives/auto-focus.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const FOCUS_BLOCKED_TAGS = new Set(['input', 'button']);

const ROW_BUFF_BADGE_LIMIT = 6;
/** The panel's own frame around the content it was asked to fit: its bar and its border. */
const PANEL_FIT_MARGIN_PX = 34;
const NO_BUFF_BADGES = { shown: [] as BuffBadge[], more: 0 };

const VIEW_ICONS: Record<InventoryViewMode, string> = {
  rich: 'view_agenda',
  table: 'table_rows',
  round: 'change_circle',
};

@Component({
  selector: 'game-object-inventory',
  templateUrl: './game-object-inventory.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, NgTemplateOutlet, FormsModule, AutoFocusDirective, SafePipe, TranslocoModule],
  // A window apiece, so a second inventory can be narrowed and read its own way. What the room
  // decided - the order, the display items - still comes from the one place it is written down.
  providers: [InventoryFilterService, InventoryViewPreferenceService],
})
export class GameObjectInventoryComponent {
  isCalcElement(element: DataElement): boolean {
    return element.fieldType === DataElementFieldType.CALC;
  }

  /** Every row asks while the list is being drawn, and they all read the same sheets. */
  private readonly calcPass = turnCache(createCalcPass);

  calcText(element: DataElement): string {
    return evaluateCalcElement(element, this.calcPass());
  }

  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly objectStore = inject(ObjectStore);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly turnOrderService = inject(TurnOrderService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly ailmentService = inject(StatusAilmentService);
  private readonly viewPreference = inject(InventoryViewPreferenceService);
  private readonly isCompact = inject(ViewportService).isCompact;
  private readonly filter = inject(InventoryFilterService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly npcDrag = inject(NpcDragService);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  protected readonly drag = new InventoryObjectDrag({
    canFile: () => this.foldersApply() && this.rolePermission.canEditTabletop,
    canHandOver: () => PeerCursor.isMyselfGameMaster,
    travellingWith: (character) => {
      const selected = this.multiMoveTargets();
      if (this.isMultiMove() && selected.has(character.identifier)) return new Set(selected);
      return new Set([character.identifier]);
    },
    ownsPoint: (x, y) => {
      const element = document.elementFromPoint(x, y);
      return !!element && this.hostElement.nativeElement.contains(element);
    },
    handOverBegin: (character, x, y) => this.npcDrag.begin(character, x, y),
    handOverMove: (x, y) => this.npcDrag.move(x, y),
    handOverEnd: (accepted) => this.npcDrag.end(accepted),
    fileInto: (identifiers, folderPath) => {
      this.setFolderOf(identifiers, folderPath);
      SoundEffect.play(PresetSound.piecePut);
    },
  });

  constructor() {
    effect(() => {
      const selection = this.selectionSignalService.selectedObject();
      if (selection && this.objectStore.get(selection.identifier) instanceof TabletopObject) {
        this.selectedIdentifier.set(selection.identifier);
      }
    });
    queueMicrotask(() => (this.panelService.title = this.t('common.panel.inventory')));
    effect(() => {
      this.panelService.headerControls.set(this.viewControls());
    });
    this.objectChange.networkOpen$.subscribe(() => {
      this.inventoryTypes.set(['table', 'common', Network.peerId, 'graveyard']);
      if (!this.inventoryTypes().includes(this.selectTab())) {
        this.selectTab.set(Network.peerId);
      }
    }, this.destroyRef);
    this.inventoryTypes.set(['table', 'common', Network.peerId, 'graveyard']);
  }

  readonly inventoryTypes = signal<string[]>(['table', 'common', 'graveyard']);

  readonly selectTab = signal('table');
  readonly selectedIdentifier = signal('');
  readonly multiMoveTargets = signal(new Set<string>());

  readonly isEdit = this.filter.isPanelOpen;
  readonly isMultiMove = signal(false);

  readonly searchQuery = this.filter.searchQuery;
  readonly searchTerms = this.filter.searchTerms;
  readonly hasQuery = this.filter.hasQuery;

  clearSearch(): void {
    this.filter.clearSearch();
  }

  setTurnOrder(event: Event, gameObject: GameObject): void {
    event.stopPropagation();
    this.turnOrderService.setCurrent(gameObject.identifier);
  }

  readonly viewMode = this.viewPreference.mode;
  protected readonly viewLabelKeys = INVENTORY_VIEW_LABEL_KEYS;

  /**
   * Whether the panel is showing the turn order alone.
   *
   * The panel shrinks to it, which is the frame's own doing, so this follows what the frame
   * did rather than the setting: a reader who presses the panel's own minimise button gets
   * the same thing.
   */
  readonly isRoundView = computed(() => this.panelService.isMinimized());

  readonly isTableView = computed(() => this.viewMode() === 'table' && !this.isRoundView());

  /** Standing with the panel's box off, which only the table is drawn to survive. */
  readonly isGhost = this.panelService.isGhost;

  private readonly contentRoot = viewChild<ElementRef<HTMLElement>>('contentRoot');

  /**
   * The cast laid out sideways: one row a piece, one column a display item.
   *
   * The states the room keeps are watched as a whole rather than piece by piece, since ticking
   * one on writes a buff onto a sheet somewhere below the piece.
   */
  readonly inventoryTable = computed<InventoryTable>(() => {
    this.objectChange.collectionOf('data')();
    // The table keeps a list of its own, so the elements are looked up against that rather
    // than taken from the map the full view's list is cached in.
    const tags = this.inventoryService.tableDataTags;
    return buildInventoryTable(
      this.filteredRows().map((row) => row.object),
      tags,
      this.ailmentService.ailments(),
      (object) => this.elementsOf(object, tags),
      this.newLineString,
      this.inventoryService.sortTag
    );
  });

  private elementsOf(object: TabletopObject, tags: readonly string[]): (DataElement | null)[] {
    const root = object.rootDataElement;
    if (!root) return tags.map(() => null);
    return tags.map((tag) => (tag === this.newLineString ? null : DataElement.findElementByReference(root, tag)));
  }

  ailmentSwatch(column: InventoryTableColumn): string {
    return column.ailment ? resolveBuffColor(column.ailment.color) || 'transparent' : 'transparent';
  }

  /**
   * What is on a piece right now, as the badges that stand over it on the table.
   *
   * The full view had no sign of them: a row said what a piece could do and nothing about what
   * had been done to it, so a poisoned goblin read the same as a clean one.
   */
  buffBadgesOf(gameObject: TabletopObject): { shown: BuffBadge[]; more: number } {
    if (!(gameObject instanceof GameCharacter)) return NO_BUFF_BADGES;
    this.objectChange.collectionOf('data')();
    this.objectChange.versionOf(gameObject.identifier)();
    const badges = toBuffBadges(gameObject.buffDataElement ?? null);
    // A row keeps its height however much is wrong with the piece; the rest are counted.
    return { shown: badges.slice(0, ROW_BUFF_BADGE_LIMIT), more: Math.max(0, badges.length - ROW_BUFF_BADGE_LIMIT) };
  }

  ailmentIconUrl(column: InventoryTableColumn): string {
    this.objectChange.fileVersion();
    return column.ailment ? buffIconUrlOf(column.ailment.icon) : '';
  }

  isAilmentOn(object: TabletopObject, ailment: StatusAilment): boolean {
    this.objectChange.collectionOf('data')();
    this.objectChange.versionOf(object.identifier)();
    return object instanceof GameCharacter && this.ailmentService.isOn(object, ailment.name);
  }

  toggleAilment(event: Event, object: TabletopObject, ailment: StatusAilment): void {
    event.stopPropagation();
    if (!(object instanceof GameCharacter)) return;
    this.ailmentService.toggle(object, ailment, (event.target as HTMLInputElement).checked);
  }

  /**
   * The one button in the panel's bar that walks through the ways of reading it.
   *
   * One rather than one apiece: the bar it stands in is shared with the panel's own buttons,
   * and shrunk to the turn order there is barely room for those.
   */
  private readonly viewControls = computed<PanelHeaderControl[]>(() => {
    const showing = this.shownViewMode();
    const controls: PanelHeaderControl[] = [
      {
        icon: VIEW_ICONS[showing],
        label: this.t(this.viewLabelKeys[showing]),
        active: showing !== 'rich',
        press: () => this.setViewMode(nextInventoryViewMode(showing)),
      },
    ];
    // Only the table is worth floating over the map: the full view is a column of gauges, and
    // the turn order is already the panel shrunk to nothing.
    if (showing === 'table') {
      controls.push({
        icon: 'opacity',
        label: this.t('ui.panel.ghost'),
        active: this.isGhost(),
        press: () => this.toggleGhost(),
      });
    }
    // A way into the settings that no setting can take away: the button beside the tabs goes
    // with them when the tabs are put away.
    if (showing !== 'round') {
      controls.push({
        icon: 'tune',
        label: this.t('feature.inventory.panel.displaySettings'),
        active: this.isEdit(),
        press: () => this.toggleEdit(),
      });
    }
    return controls;
  });

  /** Whether a strip above the list is being shown. */
  shows(part: InventoryChromePart): boolean {
    return this.viewPreference.shows(part);
  }

  /** What is on screen, which is the turn order whenever the panel is shrunk to it. */
  private readonly shownViewMode = computed<InventoryViewMode>(() => (this.isRoundView() ? 'round' : this.viewMode()));

  /**
   * Takes the panel's box off, and with it the panel's borrowed size.
   *
   * Floating over the map, a window somebody has to scroll is worse than no window: the point
   * of it is to see the whole table at a glance. It grows to hold all of it, and gives the size
   * back when the box goes on again.
   */
  private toggleGhost(): void {
    const ghost = !this.isGhost();
    this.isGhost.set(ghost);
    if (!ghost) {
      this.panelService.resizeRequest$.emit(null);
      return;
    }
    // The rows have to be laid out under the new ground before they can be measured.
    afterNextRender({ read: () => this.fitToContent() }, { injector: this.injector });
  }

  /** Asks the frame for the size the whole list would need, measured as it stands. */
  fitToContent(): void {
    const content = this.contentRoot()?.nativeElement;
    if (!content) return;

    this.panelService.resizeRequest$.emit({
      width: content.scrollWidth + PANEL_FIT_MARGIN_PX,
      height: content.scrollHeight + PANEL_FIT_MARGIN_PX,
    });
  }

  setViewMode(mode: InventoryViewMode): void {
    // Standing on a phone, a panel fills the screen and has nothing to shrink to, so the
    // turn order is passed over rather than left as a way out of the cycle.
    const wanted = mode === 'round' && this.isCompact() ? nextInventoryViewMode(mode) : mode;
    // The box goes back on with the view that needs it, rather than leaving a full view of
    // gauges floating over the map with nothing behind it.
    if (wanted !== 'table') this.isGhost.set(false);
    this.panelService.minimizeRequest$.emit(wanted === 'round');
    if (wanted !== 'round') this.viewPreference.set(wanted);
  }

  readonly turnOrderList = computed<GameCharacter[]>(() => {
    this.inventoryService.inventoryVersion();
    this.objectChange.trackMyCursor();
    return this.turnOrderService.orderedCharacters(this.rolePermission.canSeeHidden);
  });

  readonly currentTurnId = computed<string>(() => {
    this.objectChange.versionOf('TurnState')();
    return this.turnOrderService.currentIdentifier;
  });

  readonly turnRound = computed<number>(() => {
    this.objectChange.versionOf('TurnState')();
    return this.turnOrderService.round;
  });

  /** The pieces gathered under their sides, empty unless the round is taken side by side. */
  readonly turnSides = computed<{ side: string; name: string; color: string; members: GameCharacter[] }[]>(() => {
    this.inventoryService.inventoryVersion();
    this.objectChange.versionOf('Config')();
    this.objectChange.collectionOf('party')();
    this.objectChange.trackMyCursor();
    // The same grouping the round itself walks. Banding a game master's strip by what only they
    // can see offered a side the round cannot reach: handing it the turn wrote a side nothing
    // could resolve afterwards, and the next press gave the turn away to somebody else's piece.
    return this.turnOrderService.orderedSides().map((group) => ({
      side: group.side,
      name: this.turnOrderService.sideName(group.side),
      color: this.turnOrderService.sideColor(group.side),
      members: group.members,
    }));
  });

  /**
   * The listed rows gathered under their sides, or nothing where they should not be.
   *
   * Only the table's own list is banded, and only while the round is taken side by side.
   * A search or a folder tree does its own gathering, and a second one over the top of it
   * would leave the reader with two answers to the same question.
   */
  readonly sideBands = computed<SideBand<InventoryRow>[] | null>(() => {
    if (this.selectTab() !== 'table') return null;
    if (this.showTree() || this.hasQuery()) return null;
    const sides = this.turnSides();
    if (sides.length < 1) return null;
    return bandRowsBySide(this.filteredRows(), sides, (row) => row.identifier);
  });

  /** The same banding for the table view, whose rows carry their piece rather than being one. */
  readonly tableSideBands = computed<SideBand<InventoryTableRow>[] | null>(() => {
    if (this.selectTab() !== 'table') return null;
    if (this.hasQuery()) return null;
    const sides = this.turnSides();
    if (sides.length < 1) return null;
    return bandRowsBySide(this.inventoryTable().rows, sides, (row) => row.object.identifier);
  });

  readonly currentTurnSide = computed<string>(() => {
    this.objectChange.versionOf('TurnState')();
    this.objectChange.versionOf('Config')();
    this.objectChange.collectionOf('party')();
    // Which side is up is worked out against the sides that exist, and those come and go with
    // the pieces on the table; without this the strip highlights a band that has left it.
    this.inventoryService.inventoryVersion();
    return this.turnOrderService.currentSide;
  });

  selectTurn(character: GameCharacter): void {
    this.turnOrderService.setCurrent(character.identifier);
  }

  readonly actedIds = computed<ReadonlySet<string>>(() => {
    this.objectChange.versionOf('TurnState')();
    return new Set(this.turnOrderService.actedIdentifiers);
  });

  readonly canUndoTurn = computed<boolean>(() => {
    this.objectChange.versionOf('TurnState')();
    return this.turnOrderService.canUndo;
  });

  turnNext(): void {
    this.turnOrderService.next();
  }

  turnAdvanceRound(): void {
    void this.turnOrderService.advanceRound();
  }

  turnRetreatRound(): void {
    this.turnOrderService.retreatRound();
  }

  turnPrev(): void {
    this.turnOrderService.prev();
  }

  turnReset(): void {
    this.turnOrderService.reset();
  }

  readonly buffDecay = computed<boolean>(() => {
    this.objectChange.versionOf('TurnState')();
    return this.turnOrderService.buffDecay;
  });

  toggleBuffDecay(): void {
    this.turnOrderService.setBuffDecay(!this.turnOrderService.buffDecay);
  }

  get sortTag(): string {
    return this.inventoryService.sortTag;
  }
  set sortTag(sortTag: string) {
    this.inventoryService.sortTag = sortTag;
  }
  get sortOrder(): SortOrder {
    return this.inventoryService.sortOrder;
  }
  set sortOrder(sortOrder: SortOrder) {
    this.inventoryService.sortOrder = sortOrder;
  }

  get sortTag2nd(): string {
    return this.inventoryService.sortTag2nd;
  }
  set sortTag2nd(sortTag: string) {
    this.inventoryService.sortTag2nd = sortTag;
  }
  get sortOrder2nd(): SortOrder {
    return this.inventoryService.sortOrder2nd;
  }
  set sortOrder2nd(sortOrder: SortOrder) {
    this.inventoryService.sortOrder2nd = sortOrder;
  }

  get dataTag(): string {
    return this.inventoryService.dataTag;
  }
  set dataTag(dataTag: string) {
    this.inventoryService.dataTag = dataTag;
  }
  get dataTags(): string[] {
    return this.inventoryService.dataTags;
  }

  get sortOrderName(): string {
    return this.sortOrder === SortOrder.ASC
      ? this.t('feature.inventory.panel.asc')
      : this.t('feature.inventory.panel.desc');
  }
  get sortOrderName2nd(): string {
    return this.sortOrder2nd === SortOrder.ASC
      ? this.t('feature.inventory.panel.asc')
      : this.t('feature.inventory.panel.desc');
  }

  get multiMoveLocations(): { name: string; labelKey: string }[] {
    const all = [
      { name: 'table', labelKey: 'feature.inventory.tabs.table' },
      { name: 'common', labelKey: 'feature.inventory.tabs.common' },
      { name: Network.peerId, labelKey: 'feature.inventory.tabs.personal' },
      { name: 'graveyard', labelKey: 'feature.inventory.tabs.graveyard' },
    ];
    return all.filter((loc) => loc.name !== this.selectTab());
  }

  get newLineString(): string {
    return this.inventoryService.newLineString;
  }

  getTabTitle(inventoryType: string) {
    switch (inventoryType) {
      case 'table':
        return this.t('feature.inventory.tabs.table');
      case Network.peerId:
        return this.t('feature.inventory.tabs.personal');
      case 'graveyard':
        return this.t('feature.inventory.tabs.graveyard');
      default:
        return this.t('feature.inventory.tabs.common');
    }
  }

  getInventory(inventoryType: string) {
    switch (inventoryType) {
      case 'table':
        return this.inventoryService.tableInventory;
      case Network.peerId:
        return this.inventoryService.privateInventory;
      case 'graveyard':
        return this.inventoryService.graveyardInventory;
      default:
        return this.inventoryService.commonInventory;
    }
  }

  private baseObjectsOf(inventoryType: string): TabletopObject[] {
    switch (inventoryType) {
      case 'table': {
        const all = this.inventoryService.tableInventory.tabletopObjects as GameCharacter[];
        const showHidden = this.isMultiMove() || this.isEdit() || this.rolePermission.canSeeHidden;
        return showHidden ? [...all] : all.filter((character) => !character.hideInventory);
      }

      default:
        return this.getInventory(inventoryType).tabletopObjects;
    }
  }

  readonly visibleRows = computed<InventoryRow[]>(() => {
    this.inventoryService.inventoryVersion();
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('character')();
    this.objectChange.trackMyCursor();
    return this.baseObjectsOf(this.selectTab()).map((object) =>
      buildInventoryRow(object, object instanceof GameCharacter ? object.folderName : '')
    );
  });

  private readonly hiddenFilterLabelKeys: Record<InventoryHiddenFilter, string> = {
    all: 'feature.inventory.panel.hiddenFilterAll',
    only: 'feature.inventory.panel.hiddenFilterOnly',
    exclude: 'feature.inventory.panel.hiddenFilterExclude',
  };

  readonly hiddenFilter = this.filter.hiddenFilter;
  readonly hiddenDisplay = this.filter.hiddenDisplay;

  readonly canSeeHidden = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canSeeHidden;
  });

  readonly activeHiddenFilter = computed<InventoryHiddenFilter>(() =>
    this.canSeeHidden() ? this.hiddenFilter() : 'all'
  );

  readonly isHiddenFiltered = computed<boolean>(() => this.activeHiddenFilter() !== 'all');

  toggleHiddenDisplay(): void {
    this.filter.toggleHiddenDisplay();
  }

  readonly filteredRows = computed<InventoryRow[]>(() => {
    const terms = this.searchTerms();
    const rows = filterInventoryRowsByHidden(this.visibleRows(), this.activeHiddenFilter(), (row) =>
      this.isInventoryHiddenObject(row.object)
    );
    if (terms.length < 1) return rows;

    // Owner names live on the cursors, so a rename over there has to reach the text being matched.
    this.objectChange.collectionOf('PeerCursor')();
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      this.objectChange.versionOf(cursor.identifier)();
    }
    const inventoryType = this.selectTab();
    return filterInventoryRows(rows, terms, (row) =>
      inventorySearchText(
        row,
        row.object instanceof OwnedTabletopObject ? row.object.ownerName : '',
        this.canView(row.object) ? this.elementTextsOf(inventoryType, row.object) : []
      )
    );
  });

  readonly collapsedFolders = signal<ReadonlySet<string>>(new Set());

  /**
   * Whether the tab on view keeps its folders for the room rather than for this device.
   * Anything that is not the table, the graveyard or this peer's own list reads the shared one,
   * so the test has to be the same as the one that picks the inventory, not a single name.
   */
  private readonly isSharedTab = computed<boolean>(() => this.foldersApply() && this.selectTab() !== Network.peerId);

  readonly declaredFolderPaths = computed<string[]>(() => {
    if (!this.foldersApply()) return [];
    if (!this.isSharedTab()) return this.inventoryService.personalFolderPaths();
    this.inventoryService.inventoryVersion();
    return this.inventoryService.folderPaths;
  });

  private setDeclaredFolderPaths(folderPaths: string[]): void {
    if (this.isSharedTab()) {
      this.inventoryService.folderPaths = folderPaths;
      return;
    }
    this.inventoryService.setPersonalFolderPaths(folderPaths);
  }

  readonly folderTree = computed<FolderTree<InventoryRow>>(() =>
    buildFolderTree(this.filteredRows(), (row) => row.folderPath, this.declaredFolderPaths())
  );

  readonly hasFolders = computed<boolean>(
    () => this.declaredFolderPaths().length > 0 || this.visibleRows().some((row) => row.folderPath.length > 0)
  );

  /**
   * Folders sort out what is kept between scenes. The table is the board in play, ordered by
   * turn, and the graveyard is what has already left it, so neither is filed.
   */
  readonly foldersApply = computed<boolean>(() => {
    const inventoryType = this.selectTab();
    return inventoryType !== 'table' && inventoryType !== 'graveyard';
  });

  readonly showTree = computed<boolean>(() => this.foldersApply() && this.hasFolders());

  readonly canEdit = computed<boolean>(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** A folder at the depth limit has no room for another level beneath it. */
  canNestInside(folderPath: string): boolean {
    return folderSegments(folderPath).length < MAX_FOLDER_DEPTH;
  }

  isFolderCollapsed(path: string): boolean {
    if (this.hasQuery()) return false;
    return this.collapsedFolders().has(path);
  }

  toggleFolder(path: string): void {
    if (this.hasQuery()) return;
    this.collapsedFolders.update((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  collapseAllFolders(): void {
    // A search opens every folder, so folding them now would only settle on the few that
    // survived the filter and show itself once the search is cleared.
    if (this.hasQuery()) return;
    const tree = this.folderTree();
    const paths = collectFolderPaths(tree);
    if (tree.loose.length > 0) paths.push('');
    this.collapsedFolders.set(new Set(paths));
  }

  expandAllFolders(): void {
    this.collapsedFolders.set(new Set());
  }

  readonly knownFolderPaths = computed<string[]>(() => {
    const paths = new Set<string>();
    for (const declared of this.declaredFolderPaths()) {
      for (const path of ancestorFolderPaths(declared)) paths.add(path);
    }
    for (const row of this.visibleRows()) {
      for (const path of ancestorFolderPaths(row.folderPath)) paths.add(path);
    }
    return [...paths].sort((left, right) => left.localeCompare(right, 'ja', { numeric: true }));
  });

  setFolder(gameObject: TabletopObject, folderPath: string): void {
    this.setFolderOf([gameObject.identifier], folderPath);
  }

  createFolderFor(gameObject: TabletopObject): void {
    this.createFolderOf([gameObject.identifier]);
  }

  createFolder(parentPath = ''): void {
    if (parentPath.length > 0 && !this.canNestInside(parentPath)) return;
    this.createFolderOf([], parentPath);
  }

  multiSetFolder(folderPath: string): void {
    this.setFolderOf(this.multiMoveTargets(), folderPath);
    this.toggleMultiMove();
    SoundEffect.play(PresetSound.piecePut);
  }

  onMultiMoveFolderMenu(): void {
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryFolderAssignMenu(
      null,
      this.knownFolderPaths(),
      {
        setFolder: (folderPath) => this.multiSetFolder(folderPath),
        createFolder: () => {
          const targets = [...this.multiMoveTargets()];
          this.toggleMultiMove();
          this.createFolderOf(targets);
        },
      },
      this.t
    );
    this.contextMenuService.open(position, actions, this.t('feature.inventory.panel.folder'));
  }

  onFolderContextMenu(event: Event, folderPath: string): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryFolderContextMenu(
      folderPath,
      this.isMultiMove(),
      {
        renameFolder: () => this.startFolderRename(folderPath),
        createSubfolder: () => this.createFolder(folderPath),
        deleteFolder: () => this.deleteFolder(folderPath),
        selectFolder: () => this.selectFolder(folderPath),
        collapseAll: () => this.collapseAllFolders(),
        expandAll: () => this.expandAllFolders(),
      },
      this.t,
      this.canNestInside(folderPath),
      this.canEdit()
    );
    this.contextMenuService.open(
      position,
      actions,
      folderPath.length > 0 ? folderPath : this.t('feature.inventory.panel.unfiled')
    );
  }

  readonly editingFolder = signal<string | null>(null);

  isEditingFolder(folderPath: string): boolean {
    return this.editingFolder() === folderPath;
  }

  startFolderRename(folderPath: string): void {
    if (!this.rolePermission.canEditTabletop || folderPath.length < 1) return;
    this.collapsedFolders.update((current) => {
      const next = new Set(current);
      next.delete(folderPath);
      return next;
    });
    this.editingFolder.set(folderPath);
  }

  cancelFolderRename(): void {
    this.editingFolder.set(null);
  }

  /** Leaving the field is never a trap: a name that cannot be taken is dropped rather than held. */
  commitFolderRename(folderPath: string, name: string, dropOnFailure = false): void {
    if (this.editingFolder() !== folderPath) return;
    if (this.renameFolder(folderPath, name) || dropOnFailure) this.editingFolder.set(null);
  }

  private createFolderOf(identifiers: readonly string[], parentPath = ''): void {
    if (!this.rolePermission.canEditTabletop) return;
    const path = this.unusedFolderPath(parentPath);
    this.declareFolder(path);
    if (identifiers.length > 0) this.setFolderOf(identifiers, path);
    this.collapsedFolders.update((current) => {
      const next = new Set(current);
      for (const ancestor of ancestorFolderPaths(path)) next.delete(ancestor);
      return next;
    });
    this.editingFolder.set(path);
  }

  private unusedFolderPath(parentPath: string): string {
    const parent = normalizeFolderPath(parentPath);
    const prefix = parent.length > 0 ? `${parent}${FOLDER_SEPARATOR}` : '';
    // Numbered across the whole tree rather than among siblings: the free number under
    // フォルダ1 is 1, and a フォルダ1 inside フォルダ1 is a worse name than a number that skips.
    const taken = new Set(this.knownFolderPaths().map((path) => folderSegments(path).at(-1)));
    let index = 1;
    while (taken.has(this.t('feature.inventory.panel.defaultFolderName', { index }))) index++;
    return normalizeFolderPath(prefix + this.t('feature.inventory.panel.defaultFolderName', { index }));
  }

  private declareFolder(folderPath: string): void {
    const declared = this.declaredFolderPaths();
    if (declared.includes(folderPath)) return;
    this.setDeclaredFolderPaths([...declared, folderPath]);
    this.inventoryService.notifyInventoryUpdate();
  }

  private undeclareFoldersUnder(folderPath: string): void {
    const declared = this.declaredFolderPaths();
    const kept = declared.filter((entry) => !isDescendantFolderPath(entry, folderPath));
    if (kept.length === declared.length) return;
    this.setDeclaredFolderPaths(kept);
  }

  /** False where the name cannot be taken, so the caller can leave the editor open on it. */
  renameFolder(folderPath: string, name: string): boolean {
    if (!this.rolePermission.canEditTabletop) return false;
    const segments = folderSegments(folderPath);
    const renamed = normalizeFolderPath([...segments.slice(0, -1), name].join(FOLDER_SEPARATOR));
    if (renamed.length < 1) return false;
    if (renamed === folderPath) return true;
    // Renaming into a deeper place would push the levels below past the limit, where they would be
    // cut off and folders that held different characters would silently become one.
    const deepest = this.deepestDepthUnder(folderPath);
    if (folderSegments(renamed).length + deepest - segments.length > MAX_FOLDER_DEPTH) return false;

    for (const character of this.charactersUnder(folderPath)) {
      character.folderName = rewriteFolderPath(normalizeFolderPath(character.folderName), folderPath, renamed);
    }
    this.setDeclaredFolderPaths([
      ...new Set(this.declaredFolderPaths().map((entry) => rewriteFolderPath(entry, folderPath, renamed))),
    ]);
    this.collapsedFolders.update(
      (current) => new Set([...current].map((entry) => rewriteFolderPath(entry, folderPath, renamed)))
    );
    this.inventoryService.notifyInventoryUpdate();
    return true;
  }

  private deepestDepthUnder(folderPath: string): number {
    let deepest = folderSegments(folderPath).length;
    for (const path of [...this.declaredFolderPaths(), ...this.visibleRows().map((row) => row.folderPath)]) {
      if (!isDescendantFolderPath(path, folderPath)) continue;
      deepest = Math.max(deepest, folderSegments(path).length);
    }
    return deepest;
  }

  async deleteFolder(folderPath: string): Promise<void> {
    if (!this.rolePermission.canEditTabletop) return;
    const characters = this.charactersUnder(folderPath);
    if (characters.length > 0) {
      const asked = await this.confirm.ask({
        message: this.t('feature.inventory.contextMenu.confirmDeleteFolder', {
          name: folderPath,
          count: characters.length,
        }),
        okLabel: this.t('common.button.delete'),
        danger: true,
      });
      if (!asked) return;
    }
    this.undeclareFoldersUnder(folderPath);
    this.setFolderOf(
      characters.map((character) => character.identifier),
      ''
    );
    this.inventoryService.notifyInventoryUpdate();
  }

  selectFolder(folderPath: string): void {
    const rows =
      folderPath.length < 1
        ? this.folderTree().loose
        : this.filteredRows().filter((row) => isDescendantFolderPath(row.folderPath, folderPath));
    this.multiMoveTargets.update((current) => {
      const next = new Set(current);
      rows.forEach((row) => next.add(row.identifier));
      return next;
    });
  }

  /**
   * A character carries one folder name wherever it stands, so a rename has to reach it even
   * while it is on the table. Scoping this to the tab on view left those behind, and the folder
   * came back the moment the character did.
   *
   * It stops at the edge of the scope on view, though. A folder kept for this device and one kept
   * for the room are separate folders that only share a name, so a rename of one must not empty
   * the other.
   */
  private charactersUnder(folderPath: string): GameCharacter[] {
    const shared = this.isSharedTab();
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((character) => (character.location.name === Network.peerId) !== shared)
      .filter((character) => isDescendantFolderPath(normalizeFolderPath(character.folderName), folderPath));
  }

  private setFolderOf(identifiers: Iterable<string>, folderPath: string): void {
    if (!this.rolePermission.canEditTabletop) return;
    const normalized = normalizeFolderPath(folderPath);
    for (const identifier of identifiers) {
      const character = this.objectStore.get<GameCharacter>(identifier);
      if (character instanceof GameCharacter) character.folderName = normalized;
    }
    this.inventoryService.notifyInventoryUpdate();
  }

  private elementTextsOf(inventoryType: string, object: TabletopObject): string[] {
    const elements = this.getInventory(inventoryType).dataElementMap.get(object.identifier) ?? [];
    const texts: string[] = [];
    for (const element of elements) {
      if (!element || element.name === this.newLineString) continue;
      texts.push(`${element.value}`);
      if (element.currentValue != null && element.currentValue !== '') texts.push(`${element.currentValue}`);
    }
    return texts;
  }

  isInventoryHiddenObject(gameObject: TabletopObject): boolean {
    return gameObject instanceof GameCharacter && gameObject.hideInventory;
  }

  isHiddenRowDimmed(gameObject: TabletopObject): boolean {
    return this.isInventoryHiddenObject(gameObject) && this.hiddenDisplay() === 'dim';
  }

  canView(gameObject: TabletopObject): boolean {
    this.objectChange.trackMyCursor();
    if (gameObject instanceof GameCharacter) return this.disclosureService.canView(gameObject);
    return true;
  }

  getInventoryTags(gameObject: GameCharacter): (DataElement | null)[] {
    return this.getInventory(gameObject.location.name).dataElementMap.get(gameObject.identifier) ?? [];
  }

  onContextMenu(e: Event, gameObject: TabletopObject) {
    // Leaves an edit in progress on a row alone, without the search box blocking every menu.
    const editing = document.activeElement;
    if (
      editing instanceof HTMLInputElement &&
      editing.getAttribute('type') !== 'range' &&
      editing.closest('[data-testid="inventory-item"]')
    )
      return;
    e.stopPropagation();
    e.preventDefault();

    if (!this.canView(gameObject)) return;
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    this.selectGameObject(gameObject);

    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryObjectContextMenu(
      gameObject,
      this.inventoryService,
      {
        showDetail: (c) => this.showDetail(c),
        showChatPalette: (c) => this.showChatPalette(c),
        showRemoteController: (c) => this.showRemoteController(c),
        cloneGameObject: (o) => this.cloneGameObject(o),
        deleteGameObject: (o) => this.deleteGameObject(o),
        setFolder: (o, folderPath) => this.setFolder(o, folderPath),
        createFolder: (o) => this.createFolderFor(o),
      },
      this.t,
      this.foldersApply() ? this.knownFolderPaths() : null
    );

    this.contextMenuService.open(position, actions, gameObject.name);
  }

  /**
   * The search and the settings stand in a window of their own; this opens and closes it.
   *
   * Only one such window stands at a time, and it works on the inventory that asked for it, so
   * opening it from a second inventory takes it off the first - which learns that the way any
   * panel does, by being told it has been closed.
   */
  toggleEdit() {
    // What this opens can show what the game master has hidden, so it stays theirs to open.
    if (!this.rolePermission.canEditTabletop) return;
    if (this.isEdit()) {
      this.panelService.closeSingle(INVENTORY_FILTER_PANEL);
      this.isEdit.set(false);
      return;
    }
    const coordinate = this.pointerDeviceService.pointers[0];
    const panel = this.panelService.open(InventoryFilterPanelComponent, {
      title: this.t('feature.inventory.panel.filterPanelTitle'),
      left: coordinate.x + 40,
      top: coordinate.y - 40,
      width: 360,
      height: 380,
      single: INVENTORY_FILTER_PANEL,
    });
    panel.filter = this.filter;
    panel.viewPreference = this.viewPreference;
    panel.closed = () => this.isEdit.set(false);
    this.isEdit.set(true);
  }

  /** What is in force, said in one line, so the list shows its own narrowing without the box. */
  readonly filterSummary = computed<string>(() => {
    const parts: string[] = [];
    if (this.hasQuery()) parts.push(`\u201c${this.searchQuery().trim()}\u201d`);
    if (this.isHiddenFiltered()) {
      parts.push(this.t(this.hiddenFilterLabelKeys[this.activeHiddenFilter()]));
    }
    if (this.sortTag) parts.push(`${this.sortTag} (${this.sortOrderName})`);
    return parts.length > 0 ? parts.join(' / ') : this.t('feature.inventory.panel.filterNone');
  });

  toggleMultiMove() {
    if (this.isMultiMove()) {
      this.multiMoveTargets.set(new Set());
    }
    this.isMultiMove.update((v) => !v);
  }

  async cleanInventory(): Promise<void> {
    if (!this.rolePermission.canEditTabletop) return;
    const rows = this.filteredRows();
    const message = this.hasQuery()
      ? this.t('feature.inventory.panel.confirmCleanFiltered', { count: rows.length })
      : this.t('feature.inventory.panel.confirmCleanTab', {
          tab: this.getTabTitle(this.selectTab()),
          count: rows.length,
        });
    if (!(await this.confirm.ask({ message, okLabel: this.t('common.button.delete'), danger: true }))) return;
    for (const row of rows) {
      this.deleteGameObject(row.object);
    }
    SoundEffect.play(PresetSound.sweep);
  }

  existsMultiMoveSelectedInTab(): boolean {
    return this.filteredRows().some((row) => this.multiMoveTargets().has(row.identifier));
  }

  toggleMultiMoveTarget(e: Event, gameObject: GameCharacter) {
    if (!(e.target instanceof HTMLInputElement)) {
      return;
    }
    if (e.target.checked) {
      this.multiMoveTargets.update((s) => new Set(s).add(gameObject.identifier));
    } else {
      this.multiMoveTargets.update((s) => {
        const n = new Set(s);
        n.delete(gameObject.identifier);
        return n;
      });
    }
  }

  allTabBoxCheck() {
    const rows = this.filteredRows();
    if (this.existsMultiMoveSelectedInTab()) {
      this.multiMoveTargets.update((s) => {
        const n = new Set(s);
        rows.forEach((row) => n.delete(row.identifier));
        return n;
      });
    } else {
      this.multiMoveTargets.update((s) => {
        const n = new Set(s);
        rows.forEach((row) => n.add(row.identifier));
        return n;
      });
    }
  }

  onMultiMoveContextMenu() {
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryMultiMoveContextMenu(
      this.selectTab(),
      {
        multiMove: (loc) => this.multiMove(loc),
        toggleMultiMove: () => this.toggleMultiMove(),
        multiDelete: () => this.multiDelete(),
      },
      this.t
    );

    this.contextMenuService.open(position, actions, this.t('feature.inventory.contextMenu.multiMoveTitle'));
  }

  multiMove(location: string) {
    if (!this.rolePermission.canEditTabletop) return;
    for (const gameObjectIdentifier of this.multiMoveTargets()) {
      const gameObject = this.objectStore.get(gameObjectIdentifier);
      if (gameObject instanceof GameCharacter) {
        gameObject.setLocation(location);
      }
    }
  }

  moveToAndClose(location: string) {
    this.multiMove(location);
    this.toggleMultiMove();
    SoundEffect.play(PresetSound.piecePut);
  }

  multiSetHideInventory(hide: boolean) {
    if (!this.rolePermission.canEditTabletop) return;
    for (const gameObjectIdentifier of this.multiMoveTargets()) {
      const gameObject = this.objectStore.get<GameCharacter>(gameObjectIdentifier);
      if (gameObject instanceof GameCharacter) {
        gameObject.hideInventory = hide;
      }
    }
    this.inventoryService.notifyInventoryUpdate();
    this.toggleMultiMove();
    SoundEffect.play(PresetSound.sweep);
  }

  async deleteAndClose(): Promise<void> {
    if (await this.multiDelete()) {
      this.toggleMultiMove();
      SoundEffect.play(PresetSound.sweep);
    }
  }

  async multiDelete(): Promise<boolean> {
    if (!this.rolePermission.canEditTabletop) return false;
    const inGraveyard: Set<GameCharacter> = new Set();
    for (const gameObjectIdentifier of this.multiMoveTargets()) {
      const gameObject = this.objectStore.get<GameCharacter>(gameObjectIdentifier);
      if (gameObject instanceof GameCharacter && gameObject.location.name == 'graveyard') {
        inGraveyard.add(gameObject);
      }
    }
    if (inGraveyard.size < 1) return false;

    const asked = await this.confirm.ask({
      message: this.t('feature.inventory.panel.confirmMultiDelete', { count: inGraveyard.size }),
      okLabel: this.t('common.button.delete'),
      danger: true,
    });
    if (!asked) return false;
    for (const gameObject of inGraveyard) {
      this.deleteGameObject(gameObject);
    }
    return true;
  }

  private cloneGameObject(gameObject: TabletopObject) {
    if (!this.rolePermission.canEditTabletop) return;
    gameObject.clone();
  }

  private showDetail(gameObject: GameCharacter) {
    this.objectPanels.openCharacterSheet(gameObject);
  }

  private showChatPalette(gameObject: GameCharacter) {
    this.objectPanels.openChatPalette(gameObject);
  }

  private showRemoteController(gameObject: GameCharacter) {
    this.objectPanels.openRemoteController(gameObject);
  }

  protected focusToObject(e: Event, gameObject: TabletopObject) {
    if (!this.canView(gameObject)) return;
    if (!(e.target instanceof HTMLElement)) {
      return;
    }
    if (FOCUS_BLOCKED_TAGS.has(e.target.tagName.toLowerCase())) {
      return;
    }
    if (gameObject.location.name != 'table') {
      return;
    }
    this.selectionSignalService.focusToCoordinate(gameObject.location.x, gameObject.location.y);
  }

  onObjectDragBlock(event: Event, gameObject: GameObject): void {
    if (gameObject instanceof GameCharacter && PeerCursor.isMyselfGameMaster) event.stopPropagation();
  }

  selectGameObject(gameObject: GameObject) {
    if (this.drag.takeSuppressedClick()) return;
    if (gameObject instanceof GameCharacter && !this.canView(gameObject)) return;
    if (this.isMultiMove()) {
      if (this.multiMoveTargets().has(gameObject.identifier)) {
        this.multiMoveTargets.update((s) => {
          const n = new Set(s);
          n.delete(gameObject.identifier);
          return n;
        });
      } else {
        this.multiMoveTargets.update((s) => new Set(s).add(gameObject.identifier));
      }
    }
    this.selectionSignalService.selectObject(gameObject.identifier, gameObject.aliasName);
    this.selectionSignalService.highlightObject(gameObject.identifier);
  }

  private deleteGameObject(gameObject: GameObject) {
    if (!this.rolePermission.canEditTabletop) return;
    gameObject.destroy();
  }
}
