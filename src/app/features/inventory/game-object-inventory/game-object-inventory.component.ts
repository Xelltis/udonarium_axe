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
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ResourceSliderService } from '@axe/application/character/resource-slider.service';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { StealthService } from '@axe/application/character/stealth.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { tableItemNames } from '@axe/application/inventory/summary-items';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { NpcDragService } from '@axe/application/tabletop/npc-drag.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelHeaderControl, PanelService } from '@axe/application/ui/panel.service';
import { PieceDragGhostService } from '@axe/application/ui/piece-drag-ghost.service';
import { SelectionSignalService, TabletopObjectSelection } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { Network } from '@axe/core/index';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { turnCache } from '@axe/core/util/turn-cache';
import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { BuffBadge, buffIconUrlOf, toBuffBadges } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeRatio } from '@axe/domain/character/piece-gauge';
import { StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { createCalcPass, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';
import { SortOrder } from '@axe/domain/data/data-summary-setting';
import { normalizeFolderPath } from '@axe/domain/folder/folder-path';
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
import { isWithheldHere } from '@axe/domain/tabletop/withheld';
import {
  buildInventoryFolderAssignMenu,
  buildInventoryFolderContextMenu,
  buildInventoryMultiMoveContextMenu,
  buildInventoryObjectContextMenu,
} from '@axe/features/inventory/game-object-inventory/game-object-inventory-context-menu';
import { InventoryFolders } from '@axe/features/inventory/game-object-inventory/inventory-folders';
import {
  bandRowsBySide,
  buildInventoryRow,
  filterInventoryRows,
  filterInventoryRowsByHidden,
  type InventoryHiddenFilter,
  type InventoryRow,
  inventorySearchText,
  PERSONAL_INVENTORY_TAB,
  type SideBand,
} from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryObjectDrag } from '@axe/features/inventory/game-object-inventory/inventory-object-drag';
import {
  buildInventoryTable,
  InventoryTable,
  InventoryTableColumn,
  InventoryTableRow,
} from '@axe/features/inventory/game-object-inventory/inventory-table';
import { InventoryFilterService } from '@axe/features/inventory/inventory-filter.service';
import {
  INVENTORY_FILTER_PANEL,
  InventoryFilterPanelComponent,
} from '@axe/features/inventory/inventory-filter-panel/inventory-filter-panel.component';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { InventoryRoundStripComponent } from '@axe/features/inventory/inventory-round-strip/inventory-round-strip.component';
import { InventoryRoundViewComponent } from '@axe/features/inventory/inventory-round-view/inventory-round-view.component';
import { InventoryViewPreferenceService } from '@axe/features/inventory/inventory-view-preference.service';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { AutoFocusDirective } from '@axe/ui/directives/auto-focus.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const FOCUS_BLOCKED_TAGS = new Set(['input', 'button']);

const ROW_BUFF_BADGE_LIMIT = 6;
/** The panel's own frame around the content it was asked to fit: its bar and its border. */
const PANEL_FIT_MARGIN_PX = 34;
const NO_BUFF_BADGES = { shown: [] as BuffBadge[], more: 0 };
const NO_METERS: ReadonlyMap<string, readonly ResourceMeter[]> = new Map();

/** A number resource read for the thin gauge of a folded row. */
export interface ResourceMeter {
  readonly identifier: string;
  readonly name: string;
  readonly current: string;
  readonly max: number | null;
  /** How full the gauge is, 0 to 100; null where there is no maximum to measure the value against. */
  readonly percent: number | null;
  readonly color: string;
}

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
  imports: [
    TextTooltipDirective,
    NgClass,
    NgTemplateOutlet,
    FormsModule,
    AutoFocusDirective,
    SafePipe,
    TranslocoModule,
    InventoryRoundStripComponent,
    InventoryRoundViewComponent,
  ],
  // A window apiece, so a second inventory can be narrowed and read its own way. What the room
  // decided - the order, the display items - still comes from the one place it is written down.
  providers: [InventoryFilterService, InventoryViewPreferenceService],
})
export class GameObjectInventoryComponent {
  /**
   * A resource field's value read as a number for the gauge's custom properties, 0 for anything that
   * is not a number. A value is anything a peer sends, so it never reaches a style string as it is.
   */
  asNumber(value: number | string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * The maximum a resource gauge counts up to, written beside its value; null where none is set, as
   * an empty field is not a maximum of nought, or where it is not a number.
   */
  resourceMax(dataElm: DataElement): number | null {
    const raw = dataElm.value;
    if (typeof raw === 'string' && raw.trim().length < 1) return null;
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * The number resources among a piece's display items, read for the thin gauges of a folded row.
   * One with no maximum, or a maximum of nought, shows its value without a gauge, as there is
   * nothing to measure it against.
   */
  resourceMetersOf(gameObject: GameCharacter): ResourceMeter[] {
    return this.getInventoryTags(gameObject)
      .filter((element): element is DataElement => !!element?.isNumberResource)
      .map((element) => {
        const max = this.resourceMax(element);
        const current = Number(element.currentValue);
        const percent = max !== null && max > 0 && Number.isFinite(current) ? gaugeRatio(current, max) * 100 : null;
        return {
          identifier: element.identifier,
          name: element.name,
          current: String(element.currentValue ?? ''),
          max,
          percent,
          color: element.nowValueColor || 'var(--ui-accent)',
        };
      });
  }

  /**
   * Whether a data element is a calculated field, whose shown value is worked out rather than
   * typed.
   */
  isCalcElement(element: DataElement): boolean {
    return element.fieldType === DataElementFieldType.CALC;
  }

  /** Every row asks while the list is being drawn, and they all read the same sheets. */
  private readonly calcPass = turnCache(createCalcPass);

  /**
   * The worked-out value of a calculated field, sharing one evaluation pass among the rows drawn in
   * the same turn.
   */
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
  private readonly tableFocus = inject(TableFocusService);
  private readonly turnOrderService = inject(TurnOrderService);
  protected readonly turns = inject(InventoryRoundService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly resourceSliders = inject(ResourceSliderService);
  private readonly vision = inject(VisionService);
  private readonly ailmentService = inject(StatusAilmentService);
  private readonly viewPreference = inject(InventoryViewPreferenceService);
  private readonly isCompact = inject(ViewportService).isCompact;
  private readonly filter = inject(InventoryFilterService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly npcDrag = inject(NpcDragService);
  private readonly pieceGhost = inject(PieceDragGhostService);
  private readonly stealth = inject(StealthService);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  readonly folders = new InventoryFolders(
    {
      selectTab: () => this.selectTab(),
      visibleRows: () => this.visibleRows(),
      filteredRows: () => this.filteredRows(),
      hasQuery: () => this.hasQuery(),
      canEdit: () => this.rolePermission.canEditTabletop(),
      pick: (identifiers) => this.multiMoveTargets.update((current) => new Set([...current, ...identifiers])),
    },
    this.inventoryService,
    this.objectStore,
    this.confirm,
    this.t
  );

  protected readonly drag = new InventoryObjectDrag({
    canFile: () => this.folders.foldersApply() && this.rolePermission.canEditTabletop(),
    canMove: () => this.rolePermission.canEditTabletop(),
    canHandOver: () => PeerCursor.isMyselfGameMaster,
    currentTab: () => this.selectTab(),
    travellingWith: (character) => {
      const selected = this.multiMoveTargets();
      if (this.isMultiMove() && selected.has(character.identifier)) return new Set(selected);
      return new Set([character.identifier]);
    },
    ownsElement: (element) => this.hostElement.nativeElement.contains(element),
    handOverBegin: (character) => this.npcDrag.begin(character),
    handOverEnd: (accepted) => this.npcDrag.end(accepted),
    ghostBegin: (character, count, x, y) => this.pieceGhost.show(character, x, y, count),
    ghostMove: (x, y) => this.pieceGhost.move(x, y),
    ghostEnd: () => this.pieceGhost.hide(),
    fileInto: (identifiers, folderPath) => {
      const target = normalizeFolderPath(folderPath);
      const moving = [...identifiers].filter(
        (identifier) => (this.objectStore.get<GameCharacter>(identifier)?.folderName ?? '') !== target
      );
      if (moving.length < 1) return;
      this.folders.setFolderOf(moving, folderPath);
      SoundEffect.play(PresetSound.piecePut);
    },
    moveTo: (identifiers, tab) => this.moveToTab(identifiers, tab),
  });

  constructor() {
    effect(() => {
      if (this.viewPreference.foldsOnOpen()) this.folders.foldOnOpen();
    });
    queueMicrotask(() => (this.panelService.title = this.t('common.panel.inventory')));
    effect(() => {
      this.panelService.headerControls.set(this.viewControls());
    });
  }

  readonly inventoryTypes = signal<string[]>(['table', 'common', PERSONAL_INVENTORY_TAB, 'graveyard']);

  /** Where the pieces of a tab stand: this connection's peer id for the personal tab, the tab's own name otherwise. */
  private locationOfTab(tab: string): string {
    return tab === PERSONAL_INVENTORY_TAB ? Network.peerId : tab;
  }

  /** The tab a piece standing at a location is listed on: the personal tab for this connection's peer id. */
  private tabOfLocation(location: string): string {
    return location === Network.peerId ? PERSONAL_INVENTORY_TAB : location;
  }

  readonly selectTab = signal('table');
  /** The piece last selected anywhere, kept while the selection moves to something that is not a piece. */
  readonly selectedIdentifier = linkedSignal<TabletopObjectSelection | null, string>({
    source: this.selectionSignalService.selectedObject,
    computation: (selection, previous) =>
      selection && this.objectStore.get(selection.identifier) instanceof TabletopObject
        ? selection.identifier
        : (previous?.value ?? ''),
  });
  readonly multiMoveTargets = signal(new Set<string>());

  readonly isEdit = this.filter.isPanelOpen;
  readonly isMultiMove = signal(false);

  readonly searchQuery = this.filter.searchQuery;
  readonly searchTerms = this.filter.searchTerms;
  readonly hasQuery = this.filter.hasQuery;

  /** Empties the inventory search. */
  clearSearch(): void {
    this.filter.clearSearch();
  }

  /**
   * Gives the turn to a piece from the button on its row, without the press selecting the row. A
   * piece waiting to step in steps in.
   */
  setTurnOrder(event: Event, gameObject: GameObject): void {
    event.stopPropagation();
    this.turns.giveTurnTo(gameObject.identifier);
  }

  readonly viewMode = this.viewPreference.mode;

  /** Whether a search box stands above the list, which the reader turns on in the display settings. */
  readonly showsSearchBar = this.viewPreference.searchBar;

  /**
   * The thin gauges of every folded row, by piece, worked out again only as the pieces or their
   * sheets change rather than on every pass over the list.
   */
  readonly foldedMeters = computed<ReadonlyMap<string, readonly ResourceMeter[]>>(() => {
    if (!this.viewPreference.compact()) return NO_METERS;
    this.inventoryService.inventoryVersion();
    this.objectChange.collectionOf('data')();
    const meters = new Map<string, readonly ResourceMeter[]>();
    for (const row of this.filteredRows()) {
      if (row.object instanceof GameCharacter) meters.set(row.identifier, this.resourceMetersOf(row.object));
    }
    return meters;
  });

  /**
   * Whether a row of the rich view is folded down to its name and thin gauges. Only the picked row
   * opens out, so a value is changed on the row the reader meant.
   */
  isFoldedRow(gameObject: TabletopObject): boolean {
    return this.viewPreference.compact() && this.selectedIdentifier() !== gameObject.identifier;
  }

  /**
   * Whether the round's strip is put away until a round begins, leaving the button beside the tabs
   * to begin one. With the tabs put away there would be nowhere for that button, so the strip
   * stands as it always has.
   */
  readonly roundWaitsForPlay = computed(
    () => this.viewPreference.roundInPlay() && this.shows('tabs') && this.turns.progress().round === 0
  );
  protected readonly viewLabelKeys = INVENTORY_VIEW_LABEL_KEYS;

  /**
   * Whether the panel is showing the turn order alone.
   *
   * The panel shrinks to it, which is the frame's own doing, so this follows what the frame did
   * rather than the setting: letting the panel out from its bar goes back to the list. It is apart
   * from minimising, which folds the inventory to its bar as it does any panel.
   */
  readonly isRoundView = computed(() => this.panelService.isShrunk());

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
    const objects = this.filteredRows().map((row) => row.object);
    const ailments = this.ailmentService.ailments();
    const tags = tableItemNames(
      this.inventoryService.tableDataTags,
      objects,
      ailments.map((ailment) => ailment.name)
    );
    return buildInventoryTable(
      objects,
      tags,
      ailments,
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

  /**
   * The colour behind a status column's heading in the table view, transparent for any other
   * column.
   */
  ailmentSwatch(column: InventoryTableColumn): string {
    return column.ailment ? resolveBuffColor(column.ailment.color) || 'transparent' : 'transparent';
  }

  /**
   * What is on a piece right now, as the badges that stand over it on the table.
   *
   * Without them a row says what a piece can do and nothing about what has been done to it, so a
   * poisoned goblin would read the same as a clean one.
   */
  buffBadgesOf(gameObject: TabletopObject): { shown: BuffBadge[]; more: number } {
    if (!(gameObject instanceof GameCharacter)) return NO_BUFF_BADGES;
    this.objectChange.collectionOf('data')();
    this.objectChange.versionOf(gameObject.identifier)();
    const badges = toBuffBadges(gameObject.buffDataElement ?? null);
    // A row keeps its height however much is wrong with the piece; the rest are counted.
    return { shown: badges.slice(0, ROW_BUFF_BADGE_LIMIT), more: Math.max(0, badges.length - ROW_BUFF_BADGE_LIMIT) };
  }

  /** The icon of a status column's heading in the table view, empty for any other column. */
  ailmentIconUrl(column: InventoryTableColumn): string {
    this.objectChange.fileVersion();
    return column.ailment ? buffIconUrlOf(column.ailment.icon) : '';
  }

  /**
   * Whether a status is on a piece, as its box in the table view shows; always false for anything
   * but a character.
   */
  isAilmentOn(object: TabletopObject, ailment: StatusAilment): boolean {
    this.objectChange.collectionOf('data')();
    this.objectChange.versionOf(object.identifier)();
    return object instanceof GameCharacter && this.ailmentService.isOn(object, ailment.name);
  }

  /** Puts a status on a character or takes it off, from its box in the table view. */
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

  /**
   * Switches the panel between the full list, the table and the turn order.
   *
   * The turn order is the panel shrunk down rather than a saved preference, and a phone skips it.
   * Leaving the table view puts the panel's box back on.
   */
  setViewMode(mode: InventoryViewMode): void {
    // Standing on a phone, a panel fills the screen and has nothing to shrink to, so the
    // turn order is passed over rather than left as a way out of the cycle.
    const wanted = mode === 'round' && this.isCompact() ? nextInventoryViewMode(mode) : mode;
    // The box goes back on with the view that needs it, rather than leaving a full view of
    // gauges floating over the map with nothing behind it.
    if (wanted !== 'table') this.isGhost.set(false);
    this.panelService.shrinkRequest$.emit(wanted === 'round');
    if (wanted !== 'round') this.viewPreference.set(wanted);
  }

  /**
   * The listed rows gathered under their sides, or nothing where they should not be.
   *
   * Only the table's own list is banded, and only while the round is taken side by side.
   * A search or a folder tree does its own gathering, and a second one over the top of it
   * would leave the reader with two answers to the same question.
   */
  readonly sideBands = computed<SideBand<InventoryRow>[] | null>(() => {
    if (this.selectTab() !== 'table') return null;
    if (this.folders.showTree() || this.hasQuery()) return null;
    const sides = this.turns.sides();
    if (sides.length < 1) return null;
    return bandRowsBySide(this.filteredRows(), sides, (row) => row.identifier);
  });

  /** The same banding for the table view, whose rows carry their piece rather than being one. */
  readonly tableSideBands = computed<SideBand<InventoryTableRow>[] | null>(() => {
    if (this.selectTab() !== 'table') return null;
    if (this.hasQuery()) return null;
    const sides = this.turns.sides();
    if (sides.length < 1) return null;
    return bandRowsBySide(this.inventoryTable().rows, sides, (row) => row.object.identifier);
  });

  /**
   * The display item the inventory is sorted by, which is the room's setting and so shared with
   * every peer.
   */
  get sortTag(): string {
    return this.inventoryService.sortTag;
  }
  set sortTag(sortTag: string) {
    this.inventoryService.sortTag = sortTag;
  }
  /** The direction of the room's main sort. */
  get sortOrder(): SortOrder {
    return this.inventoryService.sortOrder;
  }
  set sortOrder(sortOrder: SortOrder) {
    this.inventoryService.sortOrder = sortOrder;
  }

  /** The display item that breaks ties in the room's main sort. */
  get sortTag2nd(): string {
    return this.inventoryService.sortTag2nd;
  }
  set sortTag2nd(sortTag: string) {
    this.inventoryService.sortTag2nd = sortTag;
  }
  /** The direction of the tie-breaking sort. */
  get sortOrder2nd(): SortOrder {
    return this.inventoryService.sortOrder2nd;
  }
  set sortOrder2nd(sortOrder: SortOrder) {
    this.inventoryService.sortOrder2nd = sortOrder;
  }

  /** The display items shown on each row, as written in the room's settings. */
  get dataTag(): string {
    return this.inventoryService.dataTag;
  }
  set dataTag(dataTag: string) {
    this.inventoryService.dataTag = dataTag;
  }
  /** The room's display items as a list. */
  get dataTags(): string[] {
    return this.inventoryService.dataTags;
  }

  /** The translated name of the main sort's direction. */
  get sortOrderName(): string {
    return this.sortOrder === SortOrder.ASC
      ? this.t('feature.inventory.panel.asc')
      : this.t('feature.inventory.panel.desc');
  }
  /** The translated name of the tie-breaking sort's direction. */
  get sortOrderName2nd(): string {
    return this.sortOrder2nd === SortOrder.ASC
      ? this.t('feature.inventory.panel.asc')
      : this.t('feature.inventory.panel.desc');
  }

  /**
   * The places picked pieces can be sent to from the multi-select bar, leaving out the tab on view.
   */
  get multiMoveLocations(): { name: string; labelKey: string }[] {
    const all = [
      { name: 'table', labelKey: 'feature.inventory.tabs.table' },
      { name: 'common', labelKey: 'feature.inventory.tabs.common' },
      { name: Network.peerId, labelKey: 'feature.inventory.tabs.personal' },
      { name: 'graveyard', labelKey: 'feature.inventory.tabs.graveyard' },
    ];
    return all.filter((loc) => loc.name !== this.locationOfTab(this.selectTab()));
  }

  /** The display item name that stands for a line break in a row. */
  get newLineString(): string {
    return this.inventoryService.newLineString;
  }

  /**
   * The translated title of an inventory tab; any name that is not the table, this seat's own or
   * the graveyard is the common tab.
   */
  getTabTitle(inventoryType: string) {
    switch (inventoryType) {
      case 'table':
        return this.t('feature.inventory.tabs.table');
      case PERSONAL_INVENTORY_TAB:
        return this.t('feature.inventory.tabs.personal');
      case 'graveyard':
        return this.t('feature.inventory.tabs.graveyard');
      default:
        return this.t('feature.inventory.tabs.common');
    }
  }

  /**
   * The inventory behind a tab; any name that is not the table, this seat's own or the graveyard
   * gives the common one.
   */
  getInventory(inventoryType: string) {
    switch (inventoryType) {
      case 'table':
        return this.inventoryService.tableInventory;
      case PERSONAL_INVENTORY_TAB:
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
        // What the table does not draw for this reader is not listed either, whatever mode the
        // list is in: a row would name what the dark or the fog is keeping back.
        const listed = (this.inventoryService.tableInventory.tabletopObjects as GameCharacter[]).filter((character) =>
          this.vision.mayBeListed(character)
        );
        const showHidden = this.isMultiMove() || this.isEdit() || this.rolePermission.canSeeHidden();
        return showHidden ? listed : listed.filter((character) => !character.hideInventory);
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

  readonly canSeeHidden = computed<boolean>(() => this.rolePermission.canSeeHidden());

  readonly activeHiddenFilter = computed<InventoryHiddenFilter>(() =>
    this.canSeeHidden() ? this.hiddenFilter() : 'all'
  );

  readonly isHiddenFiltered = computed<boolean>(() => this.activeHiddenFilter() !== 'all');

  /** Switches rows hidden from the inventory between dimmed and shown in full. */
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

  readonly canEdit = computed<boolean>(() => this.rolePermission.canEditTabletop());

  /** Files every picked piece into a folder and leaves multi-select. */
  multiSetFolder(folderPath: string): void {
    this.folders.setFolderOf(this.multiMoveTargets(), folderPath);
    this.toggleMultiMove();
    SoundEffect.play(PresetSound.piecePut);
  }

  /** Opens the folder menu for the picked pieces, from the multi-select bar. */
  onMultiMoveFolderMenu(): void {
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryFolderAssignMenu(
      null,
      this.folders.knownFolderPaths(),
      {
        setFolder: (folderPath) => this.multiSetFolder(folderPath),
        createFolder: () => {
          const targets = [...this.multiMoveTargets()];
          this.toggleMultiMove();
          this.folders.createFolderOf(targets);
        },
      },
      this.t
    );
    this.contextMenuService.open(position, actions, this.t('feature.inventory.panel.folder'));
  }

  /** Opens the context menu of a folder heading. */
  onFolderContextMenu(event: Event, folderPath: string): void {
    event.stopPropagation();
    event.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryFolderContextMenu(
      folderPath,
      this.isMultiMove(),
      {
        renameFolder: () => this.folders.startFolderRename(folderPath),
        createSubfolder: () => this.folders.createFolder(folderPath),
        deleteFolder: () => this.folders.deleteFolder(folderPath),
        selectFolder: () => this.folders.selectFolder(folderPath),
        collapseAll: () => this.folders.collapseAllFolders(),
        expandAll: () => this.folders.expandAllFolders(),
      },
      this.t,
      this.folders.canNestInside(folderPath),
      this.canEdit()
    );
    this.contextMenuService.open(
      position,
      actions,
      folderPath.length > 0 ? folderPath : this.t('feature.inventory.panel.unfiled')
    );
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

  /** Whether the piece is a character in stealth, which only some of the table can see. */
  isInStealth(gameObject: TabletopObject): boolean {
    return gameObject instanceof GameCharacter && gameObject.stealth === '1';
  }

  /** Whether the piece is a character hidden from the inventory. */
  isInventoryHiddenObject(gameObject: TabletopObject): boolean {
    return gameObject instanceof GameCharacter && gameObject.hideInventory;
  }

  /**
   * Whether the piece's row is drawn dimmed, because it is hidden from the inventory and hidden
   * rows are set to dim.
   */
  isHiddenRowDimmed(gameObject: TabletopObject): boolean {
    return this.isInventoryHiddenObject(gameObject) && this.hiddenDisplay() === 'dim';
  }

  /** Whether this seat may see a piece's details; only characters are ever withheld. */
  canView(gameObject: TabletopObject): boolean {
    this.objectChange.trackMyCursor();
    if (gameObject instanceof GameCharacter) return this.disclosureService.canView(gameObject);
    return true;
  }

  /**
   * The data elements shown on a character's row, in display item order, with null where the sheet
   * has no such item.
   */
  getInventoryTags(gameObject: GameCharacter): (DataElement | null)[] {
    return (
      this.getInventory(this.tabOfLocation(gameObject.location.name)).dataElementMap.get(gameObject.identifier) ?? []
    );
  }

  /**
   * Opens the context menu of a piece's row, selecting the piece.
   *
   * It stays out of the way while a field inside a row is being edited, and does nothing for a
   * piece this seat may not see.
   */
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
        focusOnTable: (o) => this.tableFocus.focusOn(o),
        cloneGameObject: (o) => this.cloneGameObject(o),
        deleteGameObject: (o) => this.deleteGameObject(o),
        setFolder: (o, folderPath) => this.folders.setFolder(o, folderPath),
        createFolder: (o) => this.folders.createFolderFor(o),
        setStealth: (o, on) => {
          if (o instanceof GameCharacter) this.stealth.set(o, on);
        },
        holdTurn: (o) => this.turnOrderService.hold(o.identifier),
        interruptTurn: (o) => this.turnOrderService.interrupt(o.identifier),
      },
      this.t,
      this.folders.foldersApply() ? this.folders.knownFolderPaths() : null,
      gameObject instanceof GameCharacter && this.stealth.mayToggle(gameObject)
        ? { on: gameObject.stealth === '1' }
        : null,
      {
        mayHold: this.turnOrderService.mayHold(gameObject.identifier),
        mayInterrupt: this.turnOrderService.mayInterrupt(gameObject.identifier),
      }
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
    if (!this.rolePermission.canEditTabletop()) return;
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

  /** Enters or leaves multi-select; leaving drops every pick. */
  toggleMultiMove() {
    if (this.isMultiMove()) {
      this.multiMoveTargets.set(new Set());
    }
    this.isMultiMove.update((v) => !v);
  }

  /**
   * Deletes every piece listed on the tab, or only those the search matches, once the user
   * confirms; does nothing for a seat that may not edit the table.
   */
  async cleanInventory(): Promise<void> {
    if (!this.rolePermission.canEditTabletop()) return;
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

  /** Whether any row listed on the tab is picked. */
  existsMultiMoveSelectedInTab(): boolean {
    return this.filteredRows().some((row) => this.multiMoveTargets().has(row.identifier));
  }

  /** Picks or unpicks a piece from its row's checkbox. */
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

  /** Unpicks every listed row when any of them is picked, and otherwise picks them all. */
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

  /** Opens the menu of moves for the picked pieces. */
  onMultiMoveContextMenu() {
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const position = this.pointerDeviceService.pointers[0];
    const actions = buildInventoryMultiMoveContextMenu(
      this.locationOfTab(this.selectTab()),
      {
        multiMove: (loc) => this.multiMove(loc),
        toggleMultiMove: () => this.toggleMultiMove(),
        multiDelete: () => this.multiDelete(),
      },
      this.t
    );

    this.contextMenuService.open(position, actions, this.t('feature.inventory.contextMenu.multiMoveTitle'));
  }

  /**
   * Moves every picked character to a location for every peer; does nothing for a seat that may not
   * edit the table.
   */
  multiMove(location: string) {
    if (!this.rolePermission.canEditTabletop()) return;
    this.moveCharacters(this.multiMoveTargets(), location);
  }

  /** Moves the characters among the identifiers to a location for every peer, passing over anything else. */
  private moveCharacters(identifiers: Iterable<string>, location: string): void {
    for (const identifier of identifiers) {
      const gameObject = this.objectStore.get(identifier);
      if (gameObject instanceof GameCharacter) gameObject.setLocation(location);
    }
  }

  /**
   * Moves characters to the place a tab shows, as letting them go over the tab does, and drops them
   * from the ticked selection, which only ever holds pieces on view. Does nothing for a seat that
   * may not edit the table.
   */
  moveToTab(identifiers: ReadonlySet<string>, tab: string): void {
    if (!this.rolePermission.canEditTabletop()) return;
    this.moveCharacters(identifiers, this.locationOfTab(tab));
    this.multiMoveTargets.update((targets) => new Set([...targets].filter((target) => !identifiers.has(target))));
    SoundEffect.play(PresetSound.piecePut);
  }

  /**
   * Moves every picked character to a location, leaves multi-select and plays the piece-put sound.
   */
  moveToAndClose(location: string) {
    this.multiMove(location);
    this.toggleMultiMove();
    SoundEffect.play(PresetSound.piecePut);
  }

  /**
   * Hides every picked character from the inventory or shows them again, then leaves multi-select.
   */
  multiSetHideInventory(hide: boolean) {
    if (!this.rolePermission.canEditTabletop()) return;
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

  /**
   * Gives every resource of the picked pieces a slider, or takes every one away, whatever the room's
   * default, and leaves multi-select.
   */
  multiSetResourceSliders(shown: boolean) {
    if (!this.rolePermission.canEditTabletop()) return;
    for (const gameObjectIdentifier of this.multiMoveTargets()) {
      const gameObject = this.objectStore.get<GameCharacter>(gameObjectIdentifier);
      if (gameObject instanceof GameCharacter) this.resourceSliders.setAll(gameObject, shown);
    }
    this.toggleMultiMove();
    SoundEffect.play(PresetSound.sweep);
  }

  /**
   * Deletes the picked pieces in the graveyard, leaving multi-select only when something was
   * deleted.
   */
  async deleteAndClose(): Promise<void> {
    if (await this.multiDelete()) {
      this.toggleMultiMove();
      SoundEffect.play(PresetSound.sweep);
    }
  }

  /**
   * Deletes the picked pieces that are in the graveyard, once the user confirms.
   *
   * Picks anywhere else are left alone. Resolves false when nothing was deleted: no picks in the
   * graveyard, a refusal, or a seat that may not edit the table.
   */
  async multiDelete(): Promise<boolean> {
    if (!this.rolePermission.canEditTabletop()) return false;
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
    if (!this.rolePermission.canEditTabletop() || isWithheldHere(gameObject)) return;
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
    this.tableFocus.focusOn(gameObject);
  }

  /**
   * Selects and highlights a piece when its row is clicked, and in multi-select picks or unpicks it
   * too.
   *
   * The click that ends a drag is ignored, and so is one on a character this seat may not see.
   */
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
    if (!this.rolePermission.canEditTabletop()) return;
    gameObject.destroy();
  }
}
