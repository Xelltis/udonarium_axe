import { inject, Injectable } from '@angular/core';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { tableFocusPoint } from '@axe/domain/tabletop/table-focus-point';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

/** Brings the table view to a piece, on whichever face of the table the piece stands. */
@Injectable({ providedIn: 'root' })
export class TableFocusService {
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly selection = inject(SelectionSignalService);

  /**
   * Glides the table view over to a piece on the table in view.
   *
   * A piece on a wall is looked for at the foot of that wall, and a piece on a board where the board
   * stands. With no table in view there are no walls to measure, and the piece's own x and y are
   * used.
   */
  focusOn(object: TabletopObject): void {
    const table = this.tableSelecter.viewTable;
    if (!table) {
      this.selection.focusToCoordinate(object.location.x, object.location.y);
      return;
    }
    const grid = table.gridSize;
    const point = tableFocusPoint(
      object,
      { widthPx: table.width * grid, depthPx: table.height * grid, wallHeightPx: table.wallHeight * grid },
      (identifier) => this.objectStore.get<TabletopObject>(identifier)
    );
    this.selection.focusToCoordinate(point.x, point.y);
  }
}
