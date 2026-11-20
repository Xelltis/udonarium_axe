import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import {
  movedAPlace,
  newTableColumn,
  newTableRow,
  TABLE_CELL_KINDS,
  type TableShape,
  type TableShapeColumn,
  tableShapeProblems,
  type TableShapeRow,
} from '@axe/domain/data/table-shape';
import { TranslocoModule } from '@jsverse/transloco';

/** What the table builder is opened with: the table as it stands, and how many values a shape would take away. */
export interface TableBuilderOption {
  readonly title: string;
  readonly shape: TableShape;
  readonly cellsLostBy?: (shape: TableShape) => number;
}

/** A column as the builder edits it, with a key of its own to be told apart by while its name changes. */
interface EditedColumn extends TableShapeColumn {
  readonly key: number;
}

/** A row as the builder edits it, with a key of its own to be told apart by while its name changes. */
interface EditedRow extends TableShapeRow {
  readonly key: number;
}

/**
 * The table builder: a table's columns, each with its name, the words over it, the group above it,
 * what its cells hold and a select's choices, and its rows, each added, removed, named and moved in
 * lists, with no notation to write. It answers the table as built, which the caller builds through
 * `DataElementEditService.buildTable`, the same way as the table's own edit; or null where it was let
 * go without building.
 */
@Component({
  selector: 'table-builder-dialog',
  templateUrl: './table-builder-dialog.component.html',
  host: { class: 'text-ui-text block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class TableBuilderDialogComponent {
  private readonly modalService = inject(ModalService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly option = this.modalService.option as TableBuilderOption;
  private nextKey = 0;

  protected readonly kinds = TABLE_CELL_KINDS;
  protected readonly title = this.option.title;
  protected readonly columns = signal<readonly EditedColumn[]>(
    this.option.shape.columns.map((column) => this.keyed(column))
  );
  protected readonly rows = signal<readonly EditedRow[]>(this.option.shape.rows.map((row) => this.keyed(row)));

  /** The table as it is built now. */
  protected readonly shape = computed<TableShape>(() => ({
    columns: this.columns().map(({ key: _key, ...column }) => column),
    rows: this.rows().map(({ key: _key, ...row }) => row),
    gaps: this.option.shape.gaps,
    seen: this.option.shape.seen,
  }));

  /** What keeps the table from being built as it is now, as the builder tells it. */
  protected readonly problems = computed(() => tableShapeProblems(this.shape()));

  /** How many values the rows and columns taken away would take with them. */
  protected readonly cellsLost = computed(() => this.option.cellsLostBy?.(this.shape()) ?? 0);

  private keyed<T extends object>(thing: T): T & { key: number } {
    this.nextKey += 1;
    return { ...thing, key: this.nextKey };
  }

  protected setColumn(key: number, change: Partial<TableShapeColumn>): void {
    this.columns.update((columns) => columns.map((column) => (column.key === key ? { ...column, ...change } : column)));
  }

  protected setRow(key: number, change: Partial<TableShapeRow>): void {
    this.rows.update((rows) => rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  /** Adds a column of checks at the end, named apart from the others (see `newTableColumn`). */
  protected addColumn(): void {
    const column = newTableColumn(this.shape(), this.t('feature.dataElement.tableBuilder.newColumn'));
    this.columns.update((columns) => [...columns, this.keyed(column)]);
  }

  /** Adds a row at the end, numbered on from the others (see `newTableRow`). */
  protected addRow(): void {
    const row = newTableRow(this.shape());
    this.rows.update((rows) => [...rows, this.keyed(row)]);
  }

  protected removeColumn(key: number): void {
    this.columns.update((columns) => columns.filter((column) => column.key !== key));
  }

  protected removeRow(key: number): void {
    this.rows.update((rows) => rows.filter((row) => row.key !== key));
  }

  /** Moves a column or a row one place towards the start, or towards the end. */
  protected moveColumn(index: number, by: -1 | 1): void {
    this.columns.update((columns) => movedAPlace(columns, index, by));
  }

  protected moveRow(index: number, by: -1 | 1): void {
    this.rows.update((rows) => movedAPlace(rows, index, by));
  }

  /** Answers the table as built, where it may be built. */
  protected apply(): void {
    if (this.problems().length > 0) return;
    this.modalService.resolve(this.shape());
  }

  protected cancel(): void {
    this.modalService.resolve(null);
  }
}
