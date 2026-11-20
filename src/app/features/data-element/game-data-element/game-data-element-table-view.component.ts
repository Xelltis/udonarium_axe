import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { clamp } from '@axe/core/util/clamp';
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
  isSelectValueChosen,
  isSelectValueListed,
  isTableControlRow as isTableControlRowShared,
  nextCheckCellValue,
  type TableColumn as DataElementTableColumn,
  type TableColumnHeaderGroup as DataElementTableColumnHeaderGroup,
} from '@axe/domain/data/table-layout';
import {
  movedAPlace,
  newTableColumn,
  newTableRow,
  TABLE_CELL_KINDS,
  type TableShape,
  type TableShapeColumn,
} from '@axe/domain/data/table-shape';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
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
  private readonly edit = inject(DataElementEditService);
  private readonly confirm = inject(ConfirmService);

  readonly element = input.required<DataElement>();
  readonly isValueLocked = input(false);
  readonly isJudgeModeEnabled = input(false);
  readonly loopHorizontal = input(false);
  readonly loopVertical = input(false);
  /** Whether the table's rows and columns are edited on it, as they are in edit mode for a seat that may edit the table. */
  readonly editable = input(false);

  protected readonly kinds = TABLE_CELL_KINDS;

  /**
   * The column, by its name, or the row, by its identifier, whose settings the bar over the table
   * edits; none once the table stops being edited or another table is shown.
   */
  protected readonly editing = linkedSignal<
    { editable: boolean; element: DataElement },
    { column: string } | { row: string } | null
  >({
    source: () => ({ editable: this.editable(), element: this.element() }),
    computation: () => null,
  });

  /** Why the last change asked for on the table was not made, as the builder names it; none once another is picked. */
  protected readonly editProblem = linkedSignal<unknown, string | null>({
    source: this.editing,
    computation: () => null,
  });

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

  /** The table as it stands, as the table's own edit and the table builder both change it (see `tableShapeOf`). */
  private readonly shape = computed<TableShape>(() => {
    this.trackTableDependencies();
    return this.edit.tableShapeOf(this.element());
  });

  /** The column the bar edits, with where it stands among the columns; null for none. */
  protected readonly editedColumn = computed(() => {
    const editing = this.editing();
    if (!this.editable() || !editing || !('column' in editing)) return null;
    const columns = this.shape().columns;
    const index = columns.findIndex((column) => column.name === editing.column);
    return index < 0 ? null : { column: columns[index], index, last: index === columns.length - 1 };
  });

  /** The row the bar edits, with where it stands among the rows; null for none. */
  protected readonly editedRow = computed(() => {
    const editing = this.editing();
    if (!this.editable() || !editing || !('row' in editing)) return null;
    const rows = this.shape().rows;
    const index = rows.findIndex((row) => row.from === editing.row);
    return index < 0 ? null : { row: rows[index], index, last: index === rows.length - 1 };
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

  /** Whether the bar edits the column of this name. */
  protected isEditedColumn(name: string): boolean {
    const editing = this.editing();
    return !!editing && 'column' in editing && editing.column === name;
  }

  /** Whether the bar edits this row. */
  protected isEditedRow(row: DataElement): boolean {
    const editing = this.editing();
    return !!editing && 'row' in editing && editing.row === row.identifier;
  }

  /** Puts the column of this name on the bar, or takes it off where it is there already. */
  protected editColumn(name: string): void {
    this.editing.set(this.isEditedColumn(name) ? null : { column: name });
  }

  /** Puts the row on the bar, or takes it off where it is there already. */
  protected editRow(row: DataElement): void {
    this.editing.set(this.isEditedRow(row) ? null : { row: row.identifier });
  }

  protected stopEditing(): void {
    this.editing.set(null);
  }

  /**
   * Writes one setting of the column at `index` as it was typed or picked on the bar, keeping the column
   * on the bar under its new name. A setting refused is put back on the bar as it stood.
   */
  protected async setColumn(
    index: number,
    setting: 'name' | 'label' | 'group' | 'kind' | 'choices',
    field: EventTarget | null
  ): Promise<void> {
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) return;
    const shape = this.shape();
    const column = { ...shape.columns[index], [setting]: field.value } as TableShapeColumn;
    const built = await this.build({
      ...shape,
      columns: shape.columns.map((each, at) => (at === index ? column : each)),
    });
    if (built) this.editing.set({ column: column.name.trim() });
    else field.value = shape.columns[index][setting];
  }

  /** Changes the row at `index`'s name as typed on the bar; a name refused is put back as it stood. */
  protected async renameRow(index: number, field: EventTarget | null): Promise<void> {
    if (!(field instanceof HTMLInputElement)) return;
    const shape = this.shape();
    const built = await this.build({
      ...shape,
      rows: shape.rows.map((row, at) => (at === index ? { ...row, name: field.value } : row)),
    });
    if (!built) field.value = shape.rows[index].name;
  }

  protected async moveColumn(index: number, by: -1 | 1): Promise<void> {
    const shape = this.shape();
    await this.build({ ...shape, columns: movedAPlace(shape.columns, index, by) });
  }

  protected async moveRow(index: number, by: -1 | 1): Promise<void> {
    const shape = this.shape();
    await this.build({ ...shape, rows: movedAPlace(shape.rows, index, by) });
  }

  /** Takes the column away, asking first where cells under it hold something. */
  protected async removeColumn(index: number): Promise<void> {
    const shape = this.shape();
    if (await this.build({ ...shape, columns: shape.columns.filter((_column, at) => at !== index) }))
      this.stopEditing();
  }

  /** Takes the row away, asking first where cells of it hold something. */
  protected async removeRow(index: number): Promise<void> {
    const shape = this.shape();
    if (await this.build({ ...shape, rows: shape.rows.filter((_row, at) => at !== index) })) this.stopEditing();
  }

  /** Adds a column of checks at the right end, a cell of it in every row, and puts it on the bar to be named. */
  protected async addColumn(): Promise<void> {
    const shape = this.shape();
    const column = newTableColumn(shape, this.t('feature.dataElement.tableBuilder.newColumn'));
    if (await this.build({ ...shape, columns: [...shape.columns, column] })) this.editing.set({ column: column.name });
  }

  /** Adds a row at the end, a cell of every column in it holding nothing, and puts it on the bar to be named. */
  protected async addRow(): Promise<void> {
    const shape = this.shape();
    if (!(await this.build({ ...shape, rows: [...shape.rows, newTableRow(shape)] }))) return;
    const added = this.edit.tableShapeOf(this.element()).rows.at(-1)?.from;
    if (added) this.editing.set({ row: added });
  }

  /**
   * Builds the table as changed on it, through the same one place as the table builder
   * (`DataElementEditService.buildTable`). A change that leaves the table one that may not be built
   * is refused, and the bar says why; one that takes away cells holding something is asked about first.
   */
  private async build(shape: TableShape): Promise<boolean> {
    const element = this.element();
    if (!this.mayBuild(element, shape)) return false;
    const lost = this.edit.cellsLostBy(element, shape);
    if (lost > 0) {
      const sure = await this.confirm.ask(this.t('feature.dataElement.tableView.edit.confirmLost', { count: lost }));
      if (!sure || !this.mayBuild(element, shape)) return false;
    }
    this.editProblem.set(null);
    return this.edit.buildTable(element, shape);
  }

  /**
   * Whether a shape may be built on the table as it stands now, the bar told why not where it may not
   * (see `tableBuildProblems`): asked again once the question of the cells to lose is answered, as
   * another seat may change the table while it stands open.
   */
  private mayBuild(element: DataElement, shape: TableShape): boolean {
    const [problem] = this.edit.tableBuildProblems(element, shape);
    if (problem) this.editProblem.set(problem);
    return !problem;
  }

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

  /** Whether a choice is the one a select cell holds. */
  isTableSelectChosen(cell: DataElement, option: string): boolean {
    this.objectChange.versionOf(cell.identifier)();
    return isSelectValueChosen(cell, option);
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
    const nextScrollLeft = clamp(scrollElement.scrollLeft + delta, 0, maxScrollLeft);
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
