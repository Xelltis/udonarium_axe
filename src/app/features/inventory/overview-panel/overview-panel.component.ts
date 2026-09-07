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

  get overviewFaceCard(): Card | null {
    const object = this.tabletopObject;
    if (object instanceof Card) return object;
    if (object instanceof CardStack) return object.topCard;
    return null;
  }

  readonly objectVersion = computed(() => {
    if (!this.tabletopObject) return 0;
    this.objectChange.versionOf(this.tabletopObject.identifier)();
    const trackChildren = (elms: readonly DataElement[]) => {
      for (const elm of elms) {
        this.objectChange.versionOf(elm.identifier)();
        if (elm.children.length) trackChildren(elm.children as DataElement[]);
      }
    };
    if (this.tabletopObject.commonDataElement)
      trackChildren(this.tabletopObject.commonDataElement.children as DataElement[]);
    if (this.tabletopObject.detailDataElement)
      trackChildren(this.tabletopObject.detailDataElement.children as DataElement[]);
    return 1;
  });

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

  shouldRenderTableView(element: DataElement): boolean {
    return (
      element.viewMode === DataElementViewMode.TABLE &&
      canRenderAsTable(element) &&
      this.getTableRows(element).length > 0 &&
      this.getTableColumns(element).length > 0
    );
  }

  getTableRows(element: DataElement): DataElement[] {
    return getTableBodyRows(element);
  }

  getTableColumns(element: DataElement): OverviewTableColumn[] {
    return getTableColumns(element);
  }

  hasTableColumnGroups(element: DataElement): boolean {
    return this.getTableColumns(element).some((column) => column.group.length > 0);
  }

  getTableColumnHeaderGroups(element: DataElement): OverviewTableColumnHeaderGroup[] {
    return buildTableColumnHeaderGroups(this.getTableColumns(element));
  }

  getTableRowHeaderLabel(element: DataElement): string {
    return element.getAttribute(DataElementAttribute.ROW_HEADER_LABEL).trim();
  }

  getTableCell(row: DataElement, columnName: string): DataElement | null {
    return getTableCell(row, columnName);
  }

  isGapTableColumn(column: OverviewTableColumn): boolean {
    return isGapColumn(column);
  }

  isGapTableColumnActive(element: DataElement, column: OverviewTableColumn): boolean {
    const gapCell = this.getGapTableColumnCell(element, column);
    return gapCell ? this.isTableCheckCellChecked(gapCell) : false;
  }

  getGapTableColumnTitle(element: DataElement, column: OverviewTableColumn): string {
    const gapCell = this.getGapTableColumnCell(element, column);
    return gapCell ? this.getTableCellLabel(gapCell) || column.label : column.label;
  }

  toggleGapTableColumn(element: DataElement, column: OverviewTableColumn, event?: Event): void {
    if (!this.isGapTableColumn(column)) return;
    event?.stopPropagation();
    const gapCell = this.getGapTableColumnCell(element, column);
    if (!gapCell) return;
    this.toggleTableCheckCell(gapCell);
  }

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

  isCalcElement(element: DataElement): boolean {
    return element.fieldType === DataElementFieldType.CALC;
  }

  calcText(element: DataElement): string {
    return evaluateCalcElement(element, this.calcPass());
  }

  getTableSelectOptions(cell: DataElement): string[] {
    return getSelectOptions(cell);
  }

  isTableSelectValueListed(cell: DataElement): boolean {
    return isSelectValueListed(cell);
  }

  setTableSelectCellValue(cell: DataElement, value: string): void {
    if (!this.canEdit) return;
    cell.value = value;
  }

  setTableSelectCellValueFromEvent(cell: DataElement, event: Event): void {
    if (!this.canEdit) return;
    cell.value = event.target instanceof HTMLSelectElement ? event.target.value : '';
  }

  getTableCellImageUrl(cell: DataElement): string {
    this.objectChange.fileVersion();
    const value = String(cell.value ?? '').trim();
    return this.imageStorage.get(value)?.url ?? value;
  }

  isImagePopupOriginal(element: DataElement): boolean {
    return element.getAttribute(DataElementAttribute.IMAGE_POPUP_ORIGINAL) === 'true';
  }

  getTableCellLabel(cell: DataElement): string {
    return getCellLabel(cell);
  }

  getPopupCurrentValueColor(element: DataElement): string | null {
    const color = element.nowValueColor.trim().toLowerCase();
    return color === '#444' ? null : color;
  }

  isTableCheckCellChecked(cell: DataElement): boolean {
    return isCheckCellChecked(cell);
  }

  toggleTableCheckCell(cell: DataElement, event?: Event): void {
    if (!this.canEdit) return;
    cell.value = nextCheckCellValue(cell, event);
  }

  get dataElms(): DataElement[] {
    return this.tabletopObject && this.tabletopObject.detailDataElement
      ? this.tabletopObject.detailDataElement.children.filter((e) => e != null)
      : [];
  }
  get hasDataElms(): boolean {
    return this.dataElms.length > 0;
  }

  get rangeElms(): DataElement[] {
    return this.tabletopObject && this.tabletopObject.commonDataElement
      ? this.tabletopObject.commonDataElement.children.filter((e) => e != null)
      : [];
  }
  get hasRangeElms(): boolean {
    return this.rangeElms.length > 0;
  }

  get newLineString(): string {
    return this.inventoryService.newLineString;
  }
  get isPointerDragging(): boolean {
    return this.pointerDeviceService.isDragging;
  }

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

  chanageImageView(isOpen: boolean) {
    this.isOpenImageView = isOpen;
  }

  private getInventoryTags(gameObject: TabletopObject): (DataElement | null)[] {
    return this.inventoryService.tableInventory.dataElementMap.get(gameObject.identifier) ?? [];
  }

  get overViewNoteWidth(): number {
    const note = this.tabletopObject as TextNote;
    if (!note) return 250;
    let width = note.overViewWidth;
    if (width < 250) width = 250;
    if (width > 800) width = 800;

    return width;
  }

  get overViewNoteMaxHeight(): number {
    const note = this.tabletopObject as TextNote;
    if (!note) return 250;
    let maxHeight = note.overViewMaxHeight;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;

    return maxHeight;
  }

  get overViewCharacterWidth(): number {
    const character = this.tabletopObject as GameCharacter;
    if (!character) return 270;
    let width = character.overViewWidth;
    if (width < 270) width = 270;
    if (width > 800) width = 800;

    return width;
  }

  get overViewCharacterMaxHeight(): number {
    const character = this.tabletopObject as GameCharacter;
    if (!character) return 250;
    let maxHeight = character.overViewMaxHeight;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;

    return maxHeight;
  }

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

  get overViewCardWidthNoMargin(): number {
    if (this.hasImage()) return this.overViewCardWidth - 60 - 12 - 2;

    return this.overViewCardWidth - 12 - 2;
  }

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

  escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  get markdown(): MarkDown {
    // 'markdwon' is the legacy identifier; keep as fallback for old peers in P2P sessions
    return (this.objectStore.get<MarkDown>('markdown') ?? this.objectStore.get<MarkDown>('markdwon'))!;
  }

  escapeHtmlMarkDown(text: string, baseId: string): SafeHtml {
    const textCheckBox = this.markdown.markDownCheckBox(text, baseId);
    const textTable = this.markdown.markDownTable(textCheckBox);

    return this.domSanitizer.bypassSecurityTrustHtml(textTable.replace(/\n/g, '<br>'));
  }

  onClick(event: MouseEvent) {
    if (this.markdown) {
      this.markdown.changeMarkDownCheckBox((event.target as HTMLElement).id, event.timeStamp);
    }
  }

  protected editCheckedIds = new Set<string>();

  isEditUrl(dataElmIdentifier: string) {
    return this.editCheckedIds.has(dataElmIdentifier);
  }

  isUrlText(text: string) {
    if (text.match(/^https:\/\//)) return true;
    if (text.match(/^http:\/\//)) return true;
    return false;
  }

  changeChk(dataElmIdentifier: string) {
    if (this.editCheckedIds.has(dataElmIdentifier)) {
      this.editCheckedIds.delete(dataElmIdentifier);
    } else {
      this.editCheckedIds.add(dataElmIdentifier);
    }
  }

  textFocus(dataElmIdentifier: string) {
    this.editCheckedIds.add(dataElmIdentifier);
  }
}
