import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { GameTable } from '@axe/domain/tabletop/game-table';

/** The most a stretch of ground may charge over the one step it is already worth. */
export const MOST_MOVE_COST_EXTRA = 9;

export const DEFAULT_MOVE_COST_EXTRA = 1;
export const DEFAULT_MOVE_COST_COLOR = '#6d9b5a';

/**
 * What a road takes off the one step a cell is worth, which is half of it.
 *
 * Held as what it changes rather than as what it costs, so that it sits in the same reckoning
 * as ground that charges more: every cell is one step, plus whatever is painted on it.
 */
export const MOVE_COST_HALF_EXTRA = -0.5;

/** What a road is drawn in where nobody has said otherwise. */
export const DEFAULT_MOVE_COST_ROAD_COLOR = '#c9b58a';

/**
 * Ground that takes more out of a piece than plain footing does.
 *
 * Undergrowth, rubble, a ford, ice. It stands on the table beside the walls and the traps
 * rather than inside the map editor, because what a swamp costs to wade is part of the table
 * rather than part of the drawing of it: a table saved and opened again is still boggy.
 *
 * Nobody may hide it. A piece that walks into it comes up short, so the shape of a reach
 * would give the ground away whatever the master meant, and a room that can see why a piece
 * stopped is a room that stops asking.
 */
@SyncObject('table-move-cost')
export class TableMoveCost extends ObjectNode {
  @SyncVar() col: number = 0;
  @SyncVar() row: number = 0;
  @SyncVar() width: number = 1;
  @SyncVar() height: number = 1;
  /** What entering it costs on top of the one step the ground is worth. */
  @SyncVar() extraCost: number = DEFAULT_MOVE_COST_EXTRA;
  /**
   * Whether it is a road: ground crossed in half a step rather than in one.
   *
   * The one thing on a table that makes going easier rather than harder, so it is held as a
   * flag of its own rather than as a charge below one. A road pays no heed to what else is
   * painted under it - a made road through a swamp is a road - which is the whole reason for
   * making one.
   */
  @SyncVar() halves: boolean = false;
  @SyncVar() color: string = DEFAULT_MOVE_COST_COLOR;

  /** The ground it covers in cells, rounded to whole cells and at least one cell each way. */
  get rect(): CellRect {
    return {
      col: Math.round(this.col),
      row: Math.round(this.row),
      width: Math.max(1, Math.round(this.width)),
      height: Math.max(1, Math.round(this.height)),
    };
  }

  /** What it charges, held to a whole number of steps that is worth charging at all. */
  get charge(): number {
    return asMoveCostExtra(this.extraCost);
  }

  /** What it comes to over plain footing: half a step off for a road, its charge otherwise. */
  get toll(): number {
    return this.halves ? MOVE_COST_HALF_EXTRA : this.charge;
  }
}

/**
 * Reads a stored charge, which is a whole number of steps from one to nine.
 *
 * Nothing below one is ground worth painting, and the ceiling keeps a slip of the finger from
 * walling a table off with a number nobody meant to type.
 */
export function asMoveCostExtra(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return DEFAULT_MOVE_COST_EXTRA;
  return Math.min(MOST_MOVE_COST_EXTRA, Math.max(1, Math.round(amount)));
}

/** The dear ground laid on a table, or none when there is no table. */
export function moveCostsOn(table: GameTable | null | undefined): TableMoveCost[] {
  if (!table) return [];
  return table.children.filter((child): child is TableMoveCost => child instanceof TableMoveCost);
}
