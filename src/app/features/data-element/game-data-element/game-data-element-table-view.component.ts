import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
import { calcSourceIdentifiers, createCalcPass, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';
import { findJudgementCandidates, type SkillJudgementCandidate } from '@axe/domain/data/skill-table-judgement';
import {
  buildTableColumnHeaderGroups,
  findGapCellInColumn,
  getCellLabel,
  getCellUnit,
  getRawTableRows,
  getSelectOptions,
  getTableCell as getTableCellShared,
  getTableColumns as getTableColumnsShared,
  isCheckCellChecked,
  isGapColumn,
  isSelectValueListed,
  isTableControlRow as isTableControlRowShared,
  nextCheckCellValue,
  type TableColumn as DataElementTableColumn,
  type TableColumnHeaderGroup as DataElementTableColumnHeaderGroup,
} from '@axe/domain/data/table-layout';
import {
  type JudgeCandidatesState,
  JudgementCandidatesModalComponent,
} from '@axe/features/data-element/game-data-element/judgement-candidates-modal.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-data-element-table-view',
  templateUrl: './game-data-element-table-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JudgementCandidatesModalComponent, SafePipe, TranslocoModule],
})
export class GameDataElementTableViewComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);

  readonly element = input.required<DataElement>();
  readonly isValueLocked = input(false);
  readonly isJudgeModeEnabled = input(false);
  readonly loopHorizontal = input(false);
  readonly loopVertical = input(false);

  readonly judgeCandidatesState = signal<JudgeCandidatesState | null>(null);
  private readonly _judgeActive = signal<boolean>(false);

  private trackTableDependencies(): void {
    const element = this.element();
    this.objectChange.versionOf(element.identifier)();
    for (const row of element.children) {
      this.objectChange.versionOf(row.identifier)();
      for (const child of row.children) {
        this.objectChange.versionOf(child.identifier)();
      }
    }
  }

  readonly tableRows = computed(() => {
    this.trackTableDependencies();
    return getRawTableRows(this.element());
  });

  readonly tableBodyRows = computed(() => this.tableRows().filter((row) => !isTableControlRowShared(row)));

  readonly tableColumns = computed<DataElementTableColumn[]>(() => {
    this.trackTableDependencies();
    return getTableColumnsShared(this.element());
  });

  readonly hasTableColumnGroups = computed(() => this.tableColumns().some((column) => column.group.length > 0));

  readonly tableColumnHeaderGroups = computed<DataElementTableColumnHeaderGroup[]>(() =>
    buildTableColumnHeaderGroups(this.tableColumns())
  );

  readonly tableRowHeaderLabel = computed(() => {
    const element = this.element();
    this.objectChange.versionOf(element.identifier)();
    return element.getAttribute(DataElementAttribute.ROW_HEADER_LABEL).trim();
  });

  /**
   * Whether a click on a check cell looks up judgement candidates instead of ticking it: the sheet
   * allows judgement and the reader has switched it on.
   */
  isJudgeMode(): boolean {
    return this.isJudgeModeEnabled() && this._judgeActive();
  }

  /**
   * Switches judgement mode on or off from the table's button, closing any candidate list that is
   * open.
   */
  toggleJudgeActive(): void {
    this._judgeActive.update((v) => !v);
    this.judgeCandidatesState.set(null);
  }

  /** The cell a row holds under the named column, or null when the row has none there. */
  getTableCell(row: DataElement, columnName: string): DataElement | null {
    return getTableCellShared(row, columnName);
  }

  /**
   * Whether the column is a gap: a narrow column between skill columns whose box, when ticked, adds
   * to the distance judged across it.
   */
  isGapTableColumn(column: DataElementTableColumn): boolean {
    return isGapColumn(column);
  }

  /** Whether a gap column's box is ticked; false for a column that is not a gap. */
  isGapTableColumnActive(column: DataElementTableColumn): boolean {
    const gapCell = this.getGapTableColumnCell(column);
    return gapCell ? this.isTableCheckCellChecked(gapCell) : false;
  }

  /**
   * The tooltip on a gap column's box: the label of its gap cell, or the column's own label when
   * the cell has none.
   */
  getGapTableColumnTitle(column: DataElementTableColumn): string {
    const gapCell = this.getGapTableColumnCell(column);
    return gapCell ? this.getTableCellLabel(gapCell) || column.label : column.label;
  }

  /**
   * Ticks or unticks a gap column from a click anywhere on it. Does nothing for a column that is
   * not a gap, or while values are locked.
   */
  toggleGapTableColumn(column: DataElementTableColumn, event?: Event): void {
    if (!this.isGapTableColumn(column)) return;
    event?.stopPropagation();
    if (this.isValueLocked()) return;
    const gapCell = this.getGapTableColumnCell(column);
    if (!gapCell) return;
    this.toggleTableCheckCell(gapCell);
  }

  /**
   * Sets a gap column from its box being changed. While values are locked the box is put back as it
   * was.
   */
  setGapTableColumnActive(column: DataElementTableColumn, event: Event): void {
    event.stopPropagation();
    const gapCell = this.getGapTableColumnCell(column);
    if (!gapCell) return;
    if (this.isValueLocked()) {
      if (event.target instanceof HTMLInputElement) event.target.checked = this.isTableCheckCellChecked(gapCell);
      return;
    }
    const checked =
      event.target instanceof HTMLInputElement ? event.target.checked : !this.isTableCheckCellChecked(gapCell);
    gapCell.value = checked ? 1 : 0;
    this.objectChange.notifyChanged(gapCell.identifier);
  }

  /**
   * The boxes a column holds, which is what a heading can tick the whole of at once.
   *
   * Gap columns are left out: theirs is a box of its own on the heading, not a column of them
   * underneath it.
   */
  private tableColumnCheckCells(column: DataElementTableColumn): DataElement[] {
    if (this.isGapTableColumn(column)) return [];
    const cells: DataElement[] = [];
    for (const row of this.tableBodyRows()) {
      const cell = this.getTableCell(row, column.name);
      if (cell?.fieldType === 'check') cells.push(cell);
    }
    return cells;
  }

  /**
   * Whether the column's heading gets a box that ticks every check cell under it. Judgement mode
   * takes the box away.
   */
  hasTableColumnChecks(column: DataElementTableColumn): boolean {
    return !this.isJudgeMode() && this.tableColumnCheckCells(column).length > 0;
  }

  /** Whether every check cell in the column is ticked; false for a column with none. */
  isTableColumnAllChecked(column: DataElementTableColumn): boolean {
    const cells = this.tableColumnCheckCells(column);
    return cells.length > 0 && cells.every((cell) => this.isTableCheckCellChecked(cell));
  }

  /** Some of the column but not all of it, which a box says by standing half filled. */
  isTableColumnPartlyChecked(column: DataElementTableColumn): boolean {
    const cells = this.tableColumnCheckCells(column);
    const ticked = cells.filter((cell) => this.isTableCheckCellChecked(cell)).length;
    return ticked > 0 && ticked < cells.length;
  }

  /**
   * Ticks or unticks every check cell in the column from the box on its heading.
   *
   * Only the cells whose state changes are written. While values are locked the box is put back as
   * it was.
   */
  setTableColumnChecked(column: DataElementTableColumn, event: Event): void {
    event.stopPropagation();
    const wanted = this.isTableColumnAllChecked(column);
    if (this.isValueLocked()) {
      if (event.target instanceof HTMLInputElement) event.target.checked = wanted;
      return;
    }
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : !wanted;
    for (const cell of this.tableColumnCheckCells(column)) {
      if (this.isTableCheckCellChecked(cell) === checked) continue;
      cell.value = checked ? 1 : 0;
      this.objectChange.notifyChanged(cell.identifier);
    }
  }

  private getGapTableColumnCell(column: DataElementTableColumn): DataElement | null {
    this.tableRows();
    return findGapCellInColumn(this.element(), column);
  }

  /**
   * Every calculating cell in the table, worked out once for the whole table.
   *
   * A formula reads the sheet it sits in, so asking cell by cell walks that sheet again for each
   * one — and the display text is read from the template, which asks on every pass.
   */
  private readonly calcCellTexts = computed<ReadonlyMap<string, string>>(() => {
    const cells = this.tableRows()
      .flatMap((row) => [...row.children])
      .filter((cell) => cell.fieldType === DataElementFieldType.CALC);
    const texts = new Map<string, string>();
    if (cells.length < 1) return texts;

    // Every cell in one table reads the same sheet, so its parts are watched once for all of them.
    this.objectChange.collectionOf('data')();
    for (const identifier of calcSourceIdentifiers(cells[0])) this.objectChange.versionOf(identifier)();

    const pass = createCalcPass();
    for (const cell of cells) texts.set(cell.identifier, evaluateCalcElement(cell, pass));
    return texts;
  });

  /**
   * The text a cell shows in the table.
   *
   * A resource reads as current/max with its unit, a check as its label, a formula as its result,
   * and an image as a note that its picture has not loaded; anything else is its value on one line.
   */
  getTableCellDisplayText(cell: DataElement): string {
    this.objectChange.versionOf(cell.identifier)();

    switch (cell.fieldType) {
      case DataElementFieldType.RESOURCE:
        return `${cell.currentValue}/${cell.value}${getCellUnit(cell)}`;
      case DataElementFieldType.CHECK:
        return getCellLabel(cell);
      case DataElementFieldType.CALC:
        return this.calcCellTexts().get(cell.identifier) ?? '';
      case DataElementFieldType.IMAGE:
        return cell.value ? this.t('feature.dataElement.imageUnloaded') : '';
      default:
        return String(cell.value ?? '')
          .replace(/\s+/g, ' ')
          .trim();
    }
  }

  /** The address of an image cell's picture, or empty while the room does not have the file. */
  getTableCellImageUrl(cell: DataElement): string {
    this.objectChange.versionOf(cell.identifier)();
    this.objectChange.fileVersion();
    const image = this.imageStorage.get(String(cell.value ?? ''));
    return image?.url ?? '';
  }

  /** The label a cell carries beside its value, such as the skill name next to a check box. */
  getTableCellLabel(cell: DataElement): string {
    this.objectChange.versionOf(cell.identifier)();
    return getCellLabel(cell);
  }

  /** Whether a check cell is ticked, as its box shows it and as judgement counts it. */
  isTableCheckCellChecked(cell: DataElement): boolean {
    this.objectChange.versionOf(cell.identifier)();
    return isCheckCellChecked(cell);
  }

  /**
   * Ticks or unticks a check cell, following its box when the change came from one and flipping it
   * otherwise.
   *
   * While values are locked the box is put back as it was.
   */
  toggleTableCheckCell(cell: DataElement, event?: Event): void {
    if (this.isValueLocked()) {
      if (event?.target instanceof HTMLInputElement) event.target.checked = this.isTableCheckCellChecked(cell);
      return;
    }
    cell.value = nextCheckCellValue(cell, event);
    this.objectChange.notifyChanged(cell.identifier);
  }

  /** The choices a select cell offers in its dropdown. */
  getTableSelectOptions(cell: DataElement): string[] {
    this.objectChange.versionOf(cell.identifier)();
    return getSelectOptions(cell);
  }

  /**
   * Whether a select cell's value is one of its choices; the dropdown adds an entry for a value
   * that is not, so it still shows.
   */
  isTableSelectValueListed(cell: DataElement): boolean {
    this.objectChange.versionOf(cell.identifier)();
    return isSelectValueListed(cell);
  }

  /**
   * Stores the choice picked in a select cell's dropdown. While values are locked the dropdown is
   * put back to the stored value.
   */
  setTableSelectCellValueFromEvent(cell: DataElement, event: Event): void {
    if (this.isValueLocked()) {
      if (event.target instanceof HTMLSelectElement) event.target.value = String(cell.value ?? '');
      return;
    }
    const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
    cell.value = value;
    this.objectChange.notifyChanged(cell.identifier);
  }

  /**
   * Turns the mouse wheel into sideways scrolling while the table is wider than its box.
   *
   * Once the table can scroll no further that way, the wheel is left to scroll the page.
   */
  onTableWheel(event: WheelEvent): void {
    const scrollElement = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!scrollElement || scrollElement.scrollWidth <= scrollElement.clientWidth) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollElement.scrollLeft + delta));
    if (nextScrollLeft === scrollElement.scrollLeft) return;

    event.preventDefault();
    scrollElement.scrollLeft = nextScrollLeft;
  }

  /**
   * In judgement mode, finds the ticked skills nearest to the clicked cell and opens the candidate
   * list for it.
   *
   * The distance across columns grows by the sheet's gap distance for each ticked gap between them,
   * and wraps round the edges where the sheet loops.
   */
  onJudgeCheckCellClick(row: DataElement, colName: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const element = this.element();
    const gapDistance = parseInt(element.getAttribute(DataElementAttribute.GAP_DISTANCE)) || 1;

    const rows = this.tableBodyRows();
    const allColumns = this.tableColumns();
    const techColumns = allColumns.filter((col) => !this.isGapTableColumn(col));
    const gapCostsBetweenCols = this.buildGapCostsBetweenCols(allColumns, gapDistance);

    const targetRowIndex = rows.indexOf(row);
    const targetColIndex = techColumns.findIndex((col) => col.name === colName);
    if (targetRowIndex < 0 || targetColIndex < 0) return;

    const candidates = findJudgementCandidates(
      rows,
      techColumns.map((col) => ({ name: col.name, label: col.label })),
      targetRowIndex,
      targetColIndex,
      (cell) => this.isTableCheckCellChecked(cell),
      5,
      {
        gapCostsBetweenCols,
        loopHorizontal: this.loopHorizontal(),
        loopVertical: this.loopVertical(),
      }
    );

    const clickedCell = this.getTableCell(row, colName);
    const fallbackLabel = techColumns.find((c) => c.name === colName)?.label ?? colName;
    const clickedCellLabel = clickedCell ? this.getTableCellLabel(clickedCell) || fallbackLabel : fallbackLabel;

    this.judgeCandidatesState.set({ clickedCellLabel, candidates });
  }

  private buildGapCostsBetweenCols(allColumns: DataElementTableColumn[], gapDistance: number): number[] {
    const techCols = allColumns.filter((c) => !this.isGapTableColumn(c));
    const costs: number[] = [];
    for (let ti = 0; ti < techCols.length - 1; ti++) {
      const idx1 = allColumns.findIndex((c) => c.name === techCols[ti].name);
      const idx2 = allColumns.findIndex((c) => c.name === techCols[ti + 1].name);
      let totalCost = 0;
      for (let k = idx1 + 1; k < idx2; k++) {
        if (this.isGapTableColumn(allColumns[k]) && this.isGapTableColumnActive(allColumns[k])) {
          totalCost += gapDistance;
        }
      }
      costs.push(totalCost);
    }
    return costs;
  }

  /** Closes the judgement candidate list. */
  closeJudgeCandidates(): void {
    this.judgeCandidatesState.set(null);
  }

  /**
   * Types a 2d6 roll for the chosen candidate into the chat input and closes the list.
   *
   * The target is the sheet's base difficulty (5 when unset) plus the candidate's distance,
   * followed by a note of what is judged from what. The roll is only typed in; sending it is left
   * to the reader.
   */
  sendCandidateToChat(candidate: SkillJudgementCandidate): void {
    const element = this.element();
    const baseDifficulty = parseInt(element.getAttribute(DataElementAttribute.BASE_DIFFICULTY)) || 5;
    const totalDifficulty = baseDifficulty + candidate.distance;
    this.uiSignalService.requestChatInputText(`2d6>=${totalDifficulty}${this.judgementNote(candidate)}`);
    this.judgeCandidatesState.set(null);
  }

  /**
   * What the roll is for: the skill being judged, and the learnt skill the distance is counted from.
   * A dice bot reads as far as the first space, so the note rides along behind one without
   * disturbing the roll. Without it the log holds a bare target number and nothing to read it against.
   */
  private judgementNote(candidate: SkillJudgementCandidate): string {
    const target = (this.judgeCandidatesState()?.clickedCellLabel ?? '').trim();
    const source = (candidate.cellLabel || candidate.colLabel).trim();
    if (target.length < 1 || source.length < 1) return '';
    return ` ${this.t('feature.dataElement.judgement.chatNote', { target, source, distance: candidate.distance })}`;
  }
}
