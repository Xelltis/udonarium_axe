import { inject, Injectable } from '@angular/core';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { cellColRow, CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';
import { rollTriggerAmount, triggerCatches } from '@axe/domain/tabletop/trigger-event';

/** One piece of ground going off, and what it came to. */
export interface TriggerFiring {
  trigger: TableTrigger;
  /** What was taken, after the dice. Negative where the ground gave something back. */
  taken: number;
  /** The name of what it was taken from, or nothing where the piece carried no such thing. */
  from: string;
}

/**
 * Ground that goes off under a piece, set off by the seat that moved the piece.
 *
 * One seat has to be the one that springs a trap, or a room of five would spring it five
 * times. It is the seat doing the moving, since that is the one that knows a walk happened
 * at all, and what it changes is synced from there like any other change to a piece.
 */
@Injectable({ providedIn: 'root' })
export class TriggerFireService {
  private readonly tableSelecter = inject(TableSelecter);

  /** Where each piece was lifted from, so putting it down knows what it crossed to get here. */
  private readonly lifted = new Map<string, number>();

  /** Remembers the ground a piece was standing on before a hand took it off the table. */
  pickedUp(piece: GameCharacter): void {
    const cell = this.cellOf(piece);
    if (cell < 0) this.lifted.delete(piece.identifier);
    else this.lifted.set(piece.identifier, cell);
  }

  /**
   * Springs whatever the piece was put down on, which is the one cell a hand ever crosses.
   *
   * A piece carried by hand takes no way: it leaves one cell and arrives at another, and
   * whatever lies between was never walked. Ground that waits for a walk to end and ground
   * that goes off in passing therefore come to the same thing here.
   */
  putDown(piece: GameCharacter): TriggerFiring[] {
    const from = this.lifted.get(piece.identifier);
    this.lifted.delete(piece.identifier);
    const table = this.tableSelecter.viewTable;
    if (from === undefined || !table || table.gridSize <= 0) return [];
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const to = this.cellOf(piece);
    if (to < 0 || to === from) return [];
    return this.walked(piece, grid, [from, to]);
  }

  private cellOf(piece: GameCharacter): number {
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return -1;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    return pieceCellOf(grid, piece, table.gridSize);
  }

  /**
   * Springs whatever the piece walked onto, and answers with what went off.
   *
   * The way is given cell by cell, beginning where the piece set out from: ground under the
   * first cell is ground the piece was already standing on, and standing still springs
   * nothing. Ground that goes off the moment it is stepped on takes its chance anywhere along
   * the way; ground that waits for the walk to end takes only the last cell.
   */
  walked(piece: GameCharacter, grid: CellGrid, way: readonly number[]): TriggerFiring[] {
    const table = this.tableSelecter.viewTable;
    const armed = triggersOn(table).filter((trigger) => trigger.isArmed);
    if (armed.length < 1 || way.length < 2) return [];

    const walked = way.slice(1);
    const last = walked[walked.length - 1];
    const firings: TriggerFiring[] = [];
    const sprung = new Set<string>();

    for (const [index, cell] of walked.entries()) {
      const ending = index === walked.length - 1 && cell === last;
      const { col, row } = cellColRow(grid, cell);
      for (const trigger of armed) {
        if (sprung.has(trigger.identifier)) continue;
        if (!trigger.covers(col, row)) continue;
        if (trigger.firesOn === 'stop' && !ending) continue;
        if (!triggerCatches(trigger.catches, piece.isNpc)) continue;
        sprung.add(trigger.identifier);
        firings.push(this.spring(trigger, piece));
      }
    }
    return firings;
  }

  private spring(trigger: TableTrigger, piece: GameCharacter): TriggerFiring {
    const taken = rollTriggerAmount(trigger.amount);
    const held = this.resourceOf(piece, trigger.element);
    if (held) {
      const current = Number(held.currentValue);
      const most = Number(held.value);
      const next = (Number.isFinite(current) ? current : 0) - taken;
      // Given back rather than taken, a resource stops at the full it was written with.
      held.currentValue = taken < 0 && Number.isFinite(most) ? Math.min(most, next) : next;
    }
    if (trigger.once) trigger.spent = true;
    return { trigger, taken, from: held ? held.name : '' };
  }

  private resourceOf(piece: GameCharacter, name: string): DataElement | null {
    const root = piece.rootDataElement;
    if (!root || name.length < 1) return null;
    const held = DataElement.findElementByReference(root, name);
    return held && held.isNumberResource ? held : null;
  }
}
