import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ModalService } from '@axe/application/ui/modal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import type { DataElement } from '@axe/domain/data/data-element';
import { newTableColumn, newTableRow, type TableShape } from '@axe/domain/data/table-shape';
import { DataElementEditService } from '@axe/features/data-element/game-data-element/data-element-edit.service';
import type { TableBuilderOption } from '@axe/features/data-element/table-builder/table-builder-dialog.component';

/**
 * Opens the table builder from wherever a sheet offers it, the heading's buttons of a wide sheet and
 * the group editor of a narrow one alike, and builds what it answers through
 * `DataElementEditService`, the one way a table is built.
 */
@Injectable({ providedIn: 'root' })
export class TableBuilderLauncher {
  private readonly modalService = inject(ModalService);
  private readonly edit = inject(DataElementEditService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly snackbar = inject(SnackbarService);

  /**
   * Opens the builder on a group or section's table as it stands, and builds the table it answers;
   * whether it was built. Where the table changed under the builder, as by another seat, nothing is
   * built and a notice says why (see `tableBuildProblems`).
   */
  async buildTable(element: DataElement): Promise<boolean> {
    const shape = await this.open({
      title: this.t('feature.dataElement.tableBuilder.titleBuild'),
      shape: this.edit.tableShapeOf(element),
      cellsLostBy: (wanted) => this.edit.cellsLostBy(element, wanted),
    });
    if (!shape) return false;
    const [problem] = this.edit.tableBuildProblems(element, shape);
    if (problem) {
      this.snackbar.show(this.t(`feature.dataElement.tableBuilder.problems.${problem}`));
      return false;
    }
    return this.edit.buildTable(element, shape);
  }

  /**
   * Opens the builder on a new table, two columns of checks over three rows, and adds the table it
   * answers at the end of the container; the table added, or null.
   */
  async addTable(container: DataElement): Promise<DataElement | null> {
    const base = this.t('feature.dataElement.tableBuilder.newColumn');
    let starter: TableShape = { columns: [], rows: [] };
    for (let count = 0; count < 2; count++)
      starter = { ...starter, columns: [...starter.columns, newTableColumn(starter, base)] };
    for (let count = 0; count < 3; count++) starter = { ...starter, rows: [...starter.rows, newTableRow(starter)] };
    const shape = await this.open({ title: this.t('feature.dataElement.tableBuilder.titleNew'), shape: starter });
    return shape ? this.edit.addTable(container, this.t('feature.dataElement.tableBuilder.newTable'), shape) : null;
  }

  /** Opens the builder, fetched the first time it is asked for, and answers the table built or null. */
  private open(option: TableBuilderOption): Promise<TableShape | null> {
    return this.modalService.openLazy<TableShape | null>(
      () =>
        import('@axe/features/data-element/table-builder/table-builder-dialog.component').then(
          (loaded) => loaded.TableBuilderDialogComponent
        ),
      option
    );
  }
}
