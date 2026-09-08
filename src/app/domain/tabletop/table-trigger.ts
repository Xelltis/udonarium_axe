import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  asTriggerMoment,
  asTriggerTarget,
  DEFAULT_TRIGGER_COLOR,
  DEFAULT_TRIGGER_MOMENT,
  DEFAULT_TRIGGER_TARGET,
  TriggerMoment,
  TriggerTarget,
} from '@axe/domain/tabletop/trigger-event';

/**
 * Ground that does something to whoever walks onto it.
 *
 * It stands on the table beside the walls and the masks rather than inside the map editor,
 * because a trap is part of the table rather than part of the drawing of it: a table saved
 * and opened again is still trapped, and a room that never opens the editor still walks into
 * one. It carries what it does, whom it does it to, and whether it has been sprung.
 */
@SyncObject('table-trigger')
export class TableTrigger extends ObjectNode {
  @SyncVar() name: string = '';
  @SyncVar() col: number = 0;
  @SyncVar() row: number = 0;
  @SyncVar() width: number = 1;
  @SyncVar() height: number = 1;
  /** One of TRIGGER_MOMENTS: as a walk ends on it, or the moment it is stepped on. */
  @SyncVar() moment: string = DEFAULT_TRIGGER_MOMENT;
  /** One of TRIGGER_TARGETS: everyone, the players' pieces, or the master's. */
  @SyncVar() targets: string = DEFAULT_TRIGGER_TARGET;
  /** Whether springing it once is the end of it. */
  @SyncVar() once: boolean = false;
  /** Whether the room sees the ground, or only the master does. */
  @SyncVar() open: boolean = false;
  /** Whether going off is what shows the ground to the room, a trap giving itself away. */
  @SyncVar() reveals: boolean = false;
  @SyncVar() color: string = DEFAULT_TRIGGER_COLOR;
  /** The name of what it takes from, and how much. A resource of the piece that walked in. */
  @SyncVar() element: string = '';
  @SyncVar() amount: string = '';
  /** The effect played on whoever sets it off, by name. Empty plays nothing. */
  @SyncVar() effect: string = '';
  /** Whether it has already gone off, which only ground that goes off once ever holds. */
  @SyncVar() spent: boolean = false;
  /**
   * Whether going off has shown it to the room.
   *
   * Kept apart from what was painted rather than written back over it: the painting is what the
   * ground is, and being found is what has happened to it. Painting the same ground again would
   * otherwise read the finding as a different painting and lay down a fresh, unsprung trap.
   */
  @SyncVar() found: boolean = false;

  get rect(): CellRect {
    return {
      col: Math.round(this.col),
      row: Math.round(this.row),
      width: Math.max(1, Math.round(this.width)),
      height: Math.max(1, Math.round(this.height)),
    };
  }

  get firesOn(): TriggerMoment {
    return asTriggerMoment(this.moment);
  }

  get catches(): TriggerTarget {
    return asTriggerTarget(this.targets);
  }

  /** Whether this ground still has anything left in it. */
  get isArmed(): boolean {
    return !(this.once && this.spent);
  }

  /** Whether the room is being shown it: painted open, or given away by going off. */
  get isShown(): boolean {
    return this.open || this.found;
  }

  covers(col: number, row: number): boolean {
    const rect = this.rect;
    return col >= rect.col && col < rect.col + rect.width && row >= rect.row && row < rect.row + rect.height;
  }
}

export function triggersOn(table: GameTable | null | undefined): TableTrigger[] {
  if (!table) return [];
  return table.children.filter((child): child is TableTrigger => child instanceof TableTrigger);
}
