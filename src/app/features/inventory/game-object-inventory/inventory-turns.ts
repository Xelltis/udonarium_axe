import { computed, inject } from '@angular/core';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { GameObject } from '@axe/core/sync/game-object';
import {
  bandRowsBySide,
  type InventoryRow,
  type SideBand,
} from '@axe/features/inventory/game-object-inventory/inventory-list';
import { InventoryTableRow } from '@axe/features/inventory/game-object-inventory/inventory-table';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';

/** What the turn handling of an inventory reads of the panel it stands in. */
export interface InventoryTurnsHost {
  /** The tab on view. */
  selectTab(): string;
  /** Whether the list is gathered into its folders, which does its own gathering. */
  showsTree(): boolean;
  /** Whether the list is narrowed by a search. */
  hasQuery(): boolean;
  /** The rows the panel lists. */
  rows(): InventoryRow[];
  /** The rows of the table view. */
  tableRows(): InventoryTableRow[];
  /** Whether the reader has the round's strip put away until a round begins, with the tabs on show for the button that begins one. */
  stripWaitsForRound(): boolean;
}

/**
 * The turn order as an inventory's list handles it: the button on a row that gives its piece the
 * turn, the rows gathered under their sides, and what a row's menu may do with the turn.
 *
 * Made where services can be injected, as the panel makes its fields.
 */
export class InventoryTurns {
  private readonly round = inject(InventoryRoundService);
  private readonly turnOrder = inject(TurnOrderService);

  constructor(private readonly host: InventoryTurnsHost) {}

  /**
   * Whether the round's strip is put away until a round begins, leaving the button beside the tabs
   * to begin one. With the tabs put away there would be nowhere for that button, so the strip
   * stands as it always has.
   */
  readonly waitsForPlay = computed(() => this.host.stripWaitsForRound() && this.round.progress().round === 0);

  /**
   * The listed rows gathered under their sides, or nothing where they should not be.
   *
   * Only the table's own list is banded, and only while the round is taken side by side.
   * A search or a folder tree does its own gathering, and a second one over the top of it
   * would leave the reader with two answers to the same question.
   */
  readonly sideBands = computed<SideBand<InventoryRow>[] | null>(() => {
    if (this.host.selectTab() !== 'table') return null;
    if (this.host.showsTree() || this.host.hasQuery()) return null;
    const sides = this.round.sides();
    if (sides.length < 1) return null;
    return bandRowsBySide(this.host.rows(), sides, (row) => row.identifier);
  });

  /** The same banding for the table view, whose rows carry their piece rather than being one. */
  readonly tableSideBands = computed<SideBand<InventoryTableRow>[] | null>(() => {
    if (this.host.selectTab() !== 'table') return null;
    if (this.host.hasQuery()) return null;
    const sides = this.round.sides();
    if (sides.length < 1) return null;
    return bandRowsBySide(this.host.tableRows(), sides, (row) => row.object.identifier);
  });

  /**
   * Gives the turn to a piece from the button on its row, without the press selecting the row. A
   * piece waiting to step in steps in.
   */
  give(event: Event, gameObject: GameObject): void {
    event.stopPropagation();
    this.round.giveTurnTo(gameObject.identifier);
  }

  /** What a row's menu may do with the turn of its piece: have it wait, or step it in. */
  menuStateOf(gameObject: GameObject): { mayHold: boolean; mayInterrupt: boolean } {
    return {
      mayHold: this.turnOrder.mayHold(gameObject.identifier),
      mayInterrupt: this.turnOrder.mayInterrupt(gameObject.identifier),
    };
  }

  /** Has a piece wait to step in later, from its row's menu. */
  hold(gameObject: GameObject): void {
    this.turnOrder.hold(gameObject.identifier);
  }

  /** Steps a waiting piece in, from its row's menu. */
  interrupt(gameObject: GameObject): void {
    this.turnOrder.interrupt(gameObject.identifier);
  }
}
