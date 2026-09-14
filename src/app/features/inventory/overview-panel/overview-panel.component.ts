import { NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { turnCache } from '@axe/core/util/turn-cache';
import { Card } from '@axe/domain/card/card'; //
import { CardStack } from '@axe/domain/card/card-stack'; //
import { GameCharacter } from '@axe/domain/character/game-character'; //
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { createCalcPass, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';
import { MarkDown } from '@axe/domain/data/mark-down';
import {
  buildTableColumnHeaderGroups,
  canRenderAsTable,
  findGapCellInColumn,
  getCellLabel,
  getSelectOptions,
  getTableBodyRows,
  getTableCell,
  getTableColumns,
  isCheckCellChecked,
  isGapColumn,
  isSelectValueListed,
  nextCheckCellValue,
  type TableColumn as OverviewTableColumn,
  type TableColumnHeaderGroup as OverviewTableColumnHeaderGroup,
} from '@axe/domain/data/table-layout';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { TextNote } from '@axe/domain/tabletop/text-note'; //
import { CardFacePreviewComponent } from '@axe/ui/components/card-face-preview/card-face-preview.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { edgeDetailAnchor, EdgeDetailSeat } from '@axe/ui/tabletop/edge-detail-layout';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'overview-panel',
  templateUrl: './overview-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DraggableDirective,
    NgTemplateOutlet,
    NgClass,
    NgStyle,
    FormsModule,
    LinkifyPipe,
    SafePipe,
    TranslocoModule,
    CardFacePreviewComponent,
  ],
  host: {
    class: 'block',
    '(click)': 'onClick($event)',
  },
})
export class OverviewPanelComponent {
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly domSanitizer = inject(DomSanitizer);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly destroyRef = inject(DestroyRef);

  private get canEdit(): boolean {
    return this.rolePermission.canEditTabletop;
  }

  /**
   * Whether the reader may see the details of the panel's object; characters, notes, cards and dice
   * follow their disclosure, and anything else is always shown.
   */
  canViewObject(): boolean {
    const object = this.tabletopObject;
    if (
      object instanceof GameCharacter ||
      object instanceof TextNote ||
      object instanceof Card ||
      object instanceof DiceSymbol
    ) {
      return this.disclosureService.canView(object);
    }
    return true;
  }

  /** Sets a check field on the object from its tick box; ignored for a reader who may not edit the table. */
  setCheckValue(element: DataElement, value: number): void {
    if (!this.canEdit) return;
    element.value = value;
  }

  readonly draggablePanel = viewChild.required<ElementRef<HTMLElement>>('draggablePanel');
  tabletopObject: TabletopObject | null = null;

  left: number = 0;
  top: number = 0;
  rotationDegrees: number = 0;
  /** Set when this panel is one of the details pinned around the screen; null beside a piece. */
  edgeSeat: EdgeDetailSeat | null = null;
  /** Told whenever a pinned detail has been placed, so its owner can see what it now covers. */
  placementListener: (() => void) | null = null;

  readonly imageUrl = computed(() => {
    this.objectChange.fileVersion();
    if (this.tabletopObject) this.objectChange.versionOf(this.tabletopObject.identifier)();
    return this.tabletopObject && this.tabletopObject.imageFile ? this.tabletopObject.imageFile.url : '';
  });
  readonly hasImage = computed(() => this.imageUrl().length > 0);

  /**
   * The card whose face the panel previews: the card itself, a stack's top card, or null for
   * anything else.
   */
  get overviewFaceCard(): Card | null {
    const object = this.tabletopObject;
    if (object instanceof Card) return object;
    if (object instanceof CardStack) return object.topCard;
    return null;
  }

  /**
   * Moves whenever the object or any of its data does, which is what redraws the panel.
   *
   * The panel reads the object straight off the model - whose a die is, whether its face is on
   * show - so something drawn has to change for those to be read again. Versions only go up,
   * so their sum changes whenever any one of them does.
   */
  readonly objectVersion = computed(() => {
    if (!this.tabletopObject) return 0;
    let version = this.objectChange.versionOf(this.tabletopObject.identifier)();
    const trackChildren = (elms: readonly DataElement[]) => {
      for (const elm of elms) {
        version += this.objectChange.versionOf(elm.identifier)();
        if (elm.children.length) trackChildren(elm.children as DataElement[]);
      }
    };
    if (this.tabletopObject.commonDataElement)
      trackChildren(this.tabletopObject.commonDataElement.children as DataElement[]);
    if (this.tabletopObject.detailDataElement)
      trackChildren(this.tabletopObject.detailDataElement.children as DataElement[]);
    return version;
  });

  /**
   * The data fields the panel lists for the object.
   *
   * They are the fields the inventory shows for it. For a character, fields marked to pop up or
   * picked for its overview are added too, kept in inventory order, and a field is left out when a
   * field containing it is already listed.
   */
  get inventoryDataElms(): DataElement[] {
    if (!this.tabletopObject) return [];
    const char = this.tabletopObject instanceof GameCharacter ? this.tabletopObject : null;
    if (char) {
      const customPopupElements = this.getCustomPopupElements(char);
      const inventoryElements = this.getInventoryTags(this.tabletopObject).filter((e): e is DataElement => e != null);
      if (customPopupElements.length < 1) return inventoryElements;
      return this.mergePopupElementsByInventoryOrder(inventoryElements, customPopupElements);
    }
    return this.getInventoryTags(this.tabletopObject).filter((e) => e != null);
  }

  private mergePopupElementsByInventoryOrder(
    inventoryElements: readonly DataElement[],
    customPopupElements: readonly DataElement[]
  ): DataElement[] {
    const result: DataElement[] = [];

    const appendUnique = (element: DataElement): void => {
      if (result.some((shownElement) => shownElement === element || this.isAncestorOf(shownElement, element))) return;
      for (let index = result.length - 1; index >= 0; index--) {
        if (this.isAncestorOf(element, result[index])) result.splice(index, 1);
      }
      result.push(element);
    };

    for (const inventoryElement of inventoryElements) {
      appendUnique(this.findCustomPopupAncestorOrSelf(inventoryElement, customPopupElements) ?? inventoryElement);
    }
    for (const customElement of customPopupElements) appendUnique(customElement);

    return result;
  }

  private findCustomPopupAncestorOrSelf(
    element: DataElement,
    customPopupElements: readonly DataElement[]
  ): DataElement | null {
    return (
      customPopupElements.find(
        (customElement) => customElement === element || this.isAncestorOf(customElement, element)
      ) ?? null
    );
  }

  private getCustomPopupElements(character: GameCharacter): DataElement[] {
    const detail = character.detailDataElement;
    if (!detail) return [];

    const elements: DataElement[] = [];
    const usedIds = new Set<string>();
    const collect = (dataElement: DataElement): void => {
      if (dataElement.getAttribute(DataElementAttribute.POPUP) === 'true') {
        elements.push(dataElement);
        usedIds.add(dataElement.identifier);
      }
      for (const child of dataElement.children) collect(child);
    };
    for (const child of detail.children) collect(child);

    for (const id of character.overViewDataTags) {
      if (usedIds.has(id)) continue;
      const element = this.objectStore.get<DataElement>(id);
      if (!element) continue;
      elements.push(element);
      usedIds.add(id);
    }

    const selectedIds = new Set(elements.map((element) => element.identifier));
    return elements.filter((element) => !this.hasSelectedPopupAncestor(element, selectedIds));
  }

  private hasSelectedPopupAncestor(element: DataElement, selectedIds: ReadonlySet<string>): boolean {
    let node = element.parent instanceof DataElement ? element.parent : null;
    while (node) {
      if (selectedIds.has(node.identifier)) return true;
      node = node.parent instanceof DataElement ? node.parent : null;
    }
    return false;
  }

  private isAncestorOf(ancestor: DataElement, element: DataElement): boolean {
    let node = element.parent instanceof DataElement ? element.parent : null;
    while (node) {
      if (node === ancestor) return true;
      node = node.parent instanceof DataElement ? node.parent : null;
    }
    return false;
  }

  /** Whether a data field is set to show as a table and has the rows and columns to draw one. */
  shouldRenderTableView(element: DataElement): boolean {
    return (
      element.viewMode === DataElementViewMode.TABLE &&
      canRenderAsTable(element) &&
      this.getTableRows(element).length > 0 &&
      this.getTableColumns(element).length > 0
    );
  }

  /** The body rows of a data field drawn as a table. */
  getTableRows(element: DataElement): DataElement[] {
    return getTableBodyRows(element);
  }

  /** The columns of a data field drawn as a table. */
  getTableColumns(element: DataElement): OverviewTableColumn[] {
    return getTableColumns(element);
  }

  /** Whether any of the table's columns belongs to a group, which adds a grouped header row. */
  hasTableColumnGroups(element: DataElement): boolean {
    return this.getTableColumns(element).some((column) => column.group.length > 0);
  }

  /** The grouped header cells spanning the table's columns. */
  getTableColumnHeaderGroups(element: DataElement): OverviewTableColumnHeaderGroup[] {
    return buildTableColumnHeaderGroups(this.getTableColumns(element));
  }

  /** The caption set for the table's row header column; empty when none is set. */
  getTableRowHeaderLabel(element: DataElement): string {
    return element.getAttribute(DataElementAttribute.ROW_HEADER_LABEL).trim();
  }

  /** The cell of a table row in the named column, or null when the row has none. */
  getTableCell(row: DataElement, columnName: string): DataElement | null {
    return getTableCell(row, columnName);
  }

  /** Whether a table column is a gap between data columns, whose gap cell carries a check in the header. */
  isGapTableColumn(column: OverviewTableColumn): boolean {
    return isGapColumn(column);
  }

  /** Whether a gap column's check is ticked; false when the column has no gap cell. */
  isGapTableColumnActive(element: DataElement, column: OverviewTableColumn): boolean {
    const gapCell = this.getGapTableColumnCell(element, column);
    return gapCell ? this.isTableCheckCellChecked(gapCell) : false;
  }

  /** The header title of a gap column: its gap cell's text, or the column's own label. */
  getGapTableColumnTitle(element: DataElement, column: OverviewTableColumn): string {
    const gapCell = this.getGapTableColumnCell(element, column);
    return gapCell ? this.getTableCellLabel(gapCell) || column.label : column.label;
  }

  /**
   * Flips a gap column's check from its header, keeping the click from reaching the rest of the
   * panel; does nothing for other columns.
   */
  toggleGapTableColumn(element: DataElement, column: OverviewTableColumn, event?: Event): void {
    if (!this.isGapTableColumn(column)) return;
    event?.stopPropagation();
    const gapCell = this.getGapTableColumnCell(element, column);
    if (!gapCell) return;
    this.toggleTableCheckCell(gapCell);
  }

  /** Sets a gap column's check from its header tick box; ignored for a reader who may not edit the table. */
  setGapTableColumnActive(element: DataElement, column: OverviewTableColumn, event: Event): void {
    if (!this.canEdit) return;
    event.stopPropagation();
    const gapCell = this.getGapTableColumnCell(element, column);
    if (!gapCell) return;
    const checked =
      event.target instanceof HTMLInputElement ? event.target.checked : !this.isTableCheckCellChecked(gapCell);
    gapCell.value = checked ? 1 : 0;
  }

  private getGapTableColumnCell(element: DataElement, column: OverviewTableColumn): DataElement | null {
    return findGapCellInColumn(element, column);
  }

  /** Every cell asks while the table is being drawn, and they all read the same sheets. */
  private readonly calcPass = turnCache(createCalcPass);

  /**
   * The text shown in a table cell: current over maximum for a resource, the cell text for a check,
   * the result for a calculation, and otherwise the value with its whitespace collapsed.
   */
  getTableCellDisplayText(cell: DataElement): string {
    switch (cell.fieldType) {
      case DataElementFieldType.RESOURCE:
        return `${cell.currentValue}/${cell.value}`;
      case DataElementFieldType.CHECK:
        return getCellLabel(cell);
      case DataElementFieldType.CALC:
        return evaluateCalcElement(cell, this.calcPass());
      default:
        return String(cell.value ?? '')
          .replace(/\s+/g, ' ')
          .trim();
    }
  }

  /** Whether a data field is a calculation, which is shown as its result. */
  isCalcElement(element: DataElement): boolean {
    return element.fieldType === DataElementFieldType.CALC;
  }

  /** The evaluated result of a calculation field. */
  calcText(element: DataElement): string {
    return evaluateCalcElement(element, this.calcPass());
  }

  /** The choices a select cell offers. */
  getTableSelectOptions(cell: DataElement): string[] {
    return getSelectOptions(cell);
  }

  /** Whether a select cell's current value is one of its choices. */
  isTableSelectValueListed(cell: DataElement): boolean {
    return isSelectValueListed(cell);
  }

  /** Writes a select cell's value; ignored for a reader who may not edit the table. */
  setTableSelectCellValue(cell: DataElement, value: string): void {
    if (!this.canEdit) return;
    cell.value = value;
  }

  /**
   * Writes a select cell's value from its dropdown's change event; ignored for a reader who may not
   * edit the table.
   */
  setTableSelectCellValueFromEvent(cell: DataElement, event: Event): void {
    if (!this.canEdit) return;
    cell.value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  }

  /**
   * The URL of an image field's picture, looked up in image storage by identifier; a value that is
   * not a stored image is used as a URL itself.
   */
  getTableCellImageUrl(cell: DataElement): string {
    this.objectChange.fileVersion();
    const value = String(cell.value ?? '').trim();
    return this.imageStorage.get(value)?.url ?? value;
  }

  /** Whether an image field asks to be shown at its original size in the overview. */
  isImagePopupOriginal(element: DataElement): boolean {
    return element.getAttribute(DataElementAttribute.IMAGE_POPUP_ORIGINAL) === 'true';
  }

  /** The text set on a cell, which a check cell shows as its label. */
  getTableCellLabel(cell: DataElement): string {
    return getCellLabel(cell);
  }

  /**
   * The colour a field's current value is written in, or null for the default grey so the
   * stylesheet decides.
   */
  getPopupCurrentValueColor(element: DataElement): string | null {
    const color = element.nowValueColor.trim().toLowerCase();
    return color === '#444' ? null : color;
  }

  /** Whether a check cell is ticked. */
  isTableCheckCellChecked(cell: DataElement): boolean {
    return isCheckCellChecked(cell);
  }

  /** Moves a check cell to its next value; ignored for a reader who may not edit the table. */
  toggleTableCheckCell(cell: DataElement, event?: Event): void {
    if (!this.canEdit) return;
    cell.value = nextCheckCellValue(cell, event);
  }

  /** The top-level fields of the object's detail data; empty when it has none. */
  get dataElms(): DataElement[] {
    return this.tabletopObject && this.tabletopObject.detailDataElement
      ? this.tabletopObject.detailDataElement.children.filter((e) => e != null)
      : [];
  }
  /** Whether the object has any detail fields to list. */
  get hasDataElms(): boolean {
    return this.dataElms.length > 0;
  }

  /** The top-level fields of the object's common data; empty when it has none. */
  get rangeElms(): DataElement[] {
    return this.tabletopObject && this.tabletopObject.commonDataElement
      ? this.tabletopObject.commonDataElement.children.filter((e) => e != null)
      : [];
  }
  /** Whether the object has any common data fields to list. */
  get hasRangeElms(): boolean {
    return this.rangeElms.length > 0;
  }

  /** The marker the inventory uses for a line break inside a field's value. */
  get newLineString(): string {
    return this.inventoryService.newLineString;
  }
  /** Whether a pointer drag is under way, during which the panel lets pointer events pass through. */
  get isPointerDragging(): boolean {
    return this.pointerDeviceService.isDragging;
  }

  /**
   * The pointer-events classes for the panel, which takes no input during a drag or while pinned to
   * a screen edge.
   */
  get pointerEventsStyle(): Record<string, boolean> {
    // A detail pinned to an edge is for reading from across the table, so it takes no input at all.
    const interactive = !this.isPointerDragging && this.edgeSeat === null;
    return { 'pointer-events-auto': interactive, 'pointer-events-none': !interactive };
  }

  isOpenImageView: boolean = false;

  constructor() {
    afterNextRender(() => {
      if (this.edgeSeat) {
        this.applyEdgePlacement();
        this.followOwnSize();
        return;
      }
      this.initPanelPosition();
      this.adjustPositionRoot();
    });
  }

  /**
   * Places a pinned detail against its edge.
   *
   * Everything else that moves the panel — the first render, a picture that finished
   * loading, a window resized under it — ends here, so this is the last word on where a
   * pinned detail sits.
   */
  applyEdgePlacement(): void {
    const seat = this.edgeSeat;
    if (!seat) return;

    const panel: HTMLElement = this.draggablePanel().nativeElement;
    const anchor = edgeDetailAnchor(seat, panel.offsetWidth, panel.offsetHeight, window.innerWidth, window.innerHeight);
    panel.style.left = anchor.left + 'px';
    panel.style.top = anchor.top + 'px';
    this.placementListener?.();
  }

  /** Whether a pinned detail lies over the given point on the screen. */
  coversPoint(x: number, y: number): boolean {
    if (!this.edgeSeat) return false;

    const rect = this.draggablePanel().nativeElement.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return false;
    return rect.left <= x && x <= rect.right && rect.top <= y && y <= rect.bottom;
  }

  /**
   * Takes a pinned detail out of sight without taking it apart.
   *
   * Hiding it rather than removing it keeps its size measurable, which is what the
   * placement and the size watch both read.
   */
  setPointerHidden(hidden: boolean): void {
    this.draggablePanel().nativeElement.style.visibility = hidden ? 'hidden' : '';
  }

  /** A detail grows as its picture and its numbers arrive, and has to keep its distance from the edge. */
  private followOwnSize(): void {
    if (typeof ResizeObserver !== 'function') return;

    const observer = new ResizeObserver(() => this.applyEdgePlacement());
    observer.observe(this.draggablePanel().nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private initPanelPosition() {
    const panel: HTMLElement = this.draggablePanel().nativeElement;
    const outerWidth = panel.offsetWidth;
    const outerHeight = panel.offsetHeight;

    let offsetLeft = this.left + 100;
    let offsetTop = this.top - outerHeight - 50;

    let isCollideLeft = false;

    if (window.innerWidth < offsetLeft + outerWidth) {
      offsetLeft = window.innerWidth - outerWidth;
      isCollideLeft = true;
    }

    if (offsetTop <= 0) {
      offsetTop = 0;
    }

    if (isCollideLeft) {
      offsetLeft = this.left - outerWidth - 100;
    }

    if (offsetLeft < 0) offsetLeft = 0;
    if (offsetTop < 0) offsetTop = 0;

    panel.style.left = offsetLeft + 'px';
    panel.style.top = offsetTop + 'px';
  }

  private adjustPositionRoot() {
    const panel: HTMLElement = this.draggablePanel().nativeElement;

    const alias = this.tabletopObject?.aliasName;
    let width: number = 250;

    if (alias == 'card') {
      width = this.overViewCardWidth;
    }

    if (alias == 'card-stack') {
      width = this.overViewCardWidth;
    }

    if (alias == 'text-note') {
      width = this.overViewNoteWidth;
    }

    if (alias == 'character') {
      width = this.overViewCharacterWidth;
    }

    const panelBox = panel.getBoundingClientRect();

    let diffLeft: number = 0;
    let diffTop: number = 0;
    const panelLeft: number = Number(panelBox.left);
    const panelRight: number = Number(panelBox.left) + Number(width);

    if (window.innerWidth < panelRight + diffLeft) {
      diffLeft += window.innerWidth - (panelRight + diffLeft);
    }
    if (panelLeft + diffLeft < 0) {
      diffLeft += 0 - (panelLeft + diffLeft);
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

  /** Opens or closes the enlarged view of the object's picture. */
  chanageImageView(isOpen: boolean) {
    this.isOpenImageView = isOpen;
  }

  private getInventoryTags(gameObject: TabletopObject): (DataElement | null)[] {
    return this.inventoryService.tableInventory.dataElementMap.get(gameObject.identifier) ?? [];
  }

  /** The width of a note's overview, from the note's own setting held between 250 and 800 pixels. */
  get overViewNoteWidth(): number {
    const note = this.tabletopObject as TextNote;
    if (!note) return 250;
    let width = note.overViewWidth;
    if (width < 250) width = 250;
    if (width > 800) width = 800;

    return width;
  }

  /** The tallest a note's overview grows, from the note's own setting held between 250 and 1000 pixels. */
  get overViewNoteMaxHeight(): number {
    const note = this.tabletopObject as TextNote;
    if (!note) return 250;
    let maxHeight = note.overViewMaxHeight;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;

    return maxHeight;
  }

  /**
   * The width of a character's overview, from the character's own setting held between 270 and 800
   * pixels.
   */
  get overViewCharacterWidth(): number {
    const character = this.tabletopObject as GameCharacter;
    if (!character) return 270;
    let width = character.overViewWidth;
    if (width < 270) width = 270;
    if (width > 800) width = 800;

    return width;
  }

  /**
   * The tallest a character's overview grows, from the character's own setting held between 250 and
   * 1000 pixels.
   */
  get overViewCharacterMaxHeight(): number {
    const character = this.tabletopObject as GameCharacter;
    if (!character) return 250;
    let maxHeight = character.overViewMaxHeight;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;

    return maxHeight;
  }

  /**
   * The width of a card's or card stack's overview, from its own setting held between 250 and 1000
   * pixels.
   */
  get overViewCardWidth(): number {
    const card = this.tabletopObject as Card;
    const cardStack = this.tabletopObject as CardStack;
    let object: Card | CardStack | null = null;

    if (!card && !cardStack) return 250;
    if (card) {
      object = card;
    } else if (cardStack) {
      object = cardStack;
    }

    let width = object!.overViewWidth;
    if (width < 250) width = 250;
    if (width > 1000) width = 1000;
    return width;
  }

  /**
   * The room left for a card's text in its overview, less the frame and, when there is a picture,
   * the picture's column.
   */
  get overViewCardWidthNoMargin(): number {
    if (this.hasImage()) return this.overViewCardWidth - 60 - 12 - 2;

    return this.overViewCardWidth - 12 - 2;
  }

  /**
   * The tallest a card's or card stack's overview grows, from its own setting held between 250 and
   * 1000 pixels.
   */
  get overViewCardMaxHeight(): number {
    const card = this.tabletopObject as Card;
    const cardStack = this.tabletopObject as CardStack;
    let object: Card | CardStack | null = null;

    if (!card && !cardStack) return 250;
    if (card) {
      object = card;
    } else if (cardStack) {
      object = cardStack;
    }
    let maxHeight = object!.overViewMaxHeight;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;
    return maxHeight;
  }

  /** Escapes a field's text for HTML, before any links in it are turned into anchors. */
  escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * The room's markdown helper, looked up under its identifier or the misspelled one older peers
   * still use.
   */
  get markdown(): MarkDown {
    // 'markdwon' is the legacy identifier; keep as fallback for old peers in P2P sessions
    return (this.objectStore.get<MarkDown>('markdown') ?? this.objectStore.get<MarkDown>('markdwon'))!;
  }

  /**
   * Renders a markdown field's text as trusted HTML, with its check boxes and tables drawn and its
   * line breaks kept.
   *
   * The check boxes get ids from `baseId`, which is how a click on one is traced back to the field.
   */
  escapeHtmlMarkDown(text: string, baseId: string): SafeHtml {
    const textCheckBox = this.markdown.markDownCheckBox(text, baseId);
    const textTable = this.markdown.markDownTable(textCheckBox);

    return this.domSanitizer.bypassSecurityTrustHtml(textTable.replace(/\n/g, '<br>'));
  }

  /**
   * Passes a click on the panel to the markdown helper, which ticks the markdown check box it
   * landed on, if any.
   */
  onClick(event: MouseEvent) {
    if (this.markdown) {
      this.markdown.changeMarkDownCheckBox((event.target as HTMLElement).id, event.timeStamp);
    }
  }

  protected editCheckedIds = new Set<string>();

  /** Whether a URL field is being edited, which shows its input in place of the link. */
  isEditUrl(dataElmIdentifier: string) {
    return this.editCheckedIds.has(dataElmIdentifier);
  }

  /** Whether a field's text starts with http:// or https://, and so is shown as a link. */
  isUrlText(text: string) {
    if (text.match(/^https:\/\//)) return true;
    if (text.match(/^http:\/\//)) return true;
    return false;
  }

  /** Switches a URL field between being edited and being shown as a link. */
  changeChk(dataElmIdentifier: string) {
    if (this.editCheckedIds.has(dataElmIdentifier)) {
      this.editCheckedIds.delete(dataElmIdentifier);
    } else {
      this.editCheckedIds.add(dataElmIdentifier);
    }
  }

  /** Keeps a URL field in edit mode once its input takes focus. */
  textFocus(dataElmIdentifier: string) {
    this.editCheckedIds.add(dataElmIdentifier);
  }
}
