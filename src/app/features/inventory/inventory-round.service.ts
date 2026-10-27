import { computed, inject, Injectable } from '@angular/core';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { GameCharacter } from '@axe/domain/character/game-character';

/** A side of the round as the inventory names it, with only the pieces this reader can see on it. */
export interface InventoryRoundSide {
  readonly side: string;
  readonly name: string;
  readonly color: string;
  readonly members: GameCharacter[];
}

/**
 * The round as the inventory shows it to this reader, and the presses that move it on.
 *
 * Every list leaves out the pieces this reader cannot see on the table, so the round's order, its
 * companions and its sides never name what the dark or the fog is keeping back.
 */
@Injectable({ providedIn: 'root' })
export class InventoryRoundService {
  private readonly turnOrder = inject(TurnOrderService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);

  /** Where the round stands. */
  readonly progress = this.turnOrder.progress;

  /** The round in order, leaving out the pieces this reader cannot see on the table. */
  readonly order = computed<GameCharacter[]>(() => {
    this.inventory.inventoryVersion();
    this.objectChange.trackMyCursor();
    return this.turnOrder
      .orderedCharacters(this.rolePermission.canSeeHidden())
      .filter((character) => this.vision.mayBeListed(character));
  });

  /** The pieces this reader can see that take their turn in another's, under the one whose turn it is. */
  readonly companions = computed<ReadonlyMap<string, GameCharacter[]>>(() => {
    this.inventory.inventoryVersion();
    this.objectChange.trackMyCursor();
    const companions = new Map<string, GameCharacter[]>();
    for (const [carrier, pieces] of this.turnOrder.companionsByCarrier()) {
      const listed = pieces.filter((piece) => this.vision.mayBeListed(piece));
      if (listed.length > 0) companions.set(carrier, listed);
    }
    return companions;
  });

  /** The pieces gathered under their sides, empty unless the round is taken side by side. */
  readonly sides = computed<InventoryRoundSide[]>(() => {
    this.inventory.inventoryVersion();
    this.objectChange.versionOf('Config')();
    this.objectChange.collectionOf('party')();
    this.objectChange.trackMyCursor();
    // The same grouping the round itself walks. Banding a game master's strip by what only they
    // can see would offer a side the round cannot reach: handing it the turn would write a side
    // nothing can resolve afterwards, and the next press would give the turn to somebody else's piece.
    // Only the pieces this reader can see are named, and a side with none of them is not shown:
    // its name alone would say something stands in the dark.
    return this.turnOrder
      .orderedSides()
      .map((group) => ({
        side: group.side,
        name: this.turnOrder.sideName(group.side),
        color: this.turnOrder.sideColor(group.side),
        members: group.members.filter((member) => this.vision.mayBeListed(member)),
      }))
      .filter((group) => group.members.length > 0);
  });

  /** The side whose phase it is, empty unless the round is taken side by side. */
  readonly currentSide = computed<string>(() => {
    this.progress();
    this.objectChange.versionOf('Config')();
    this.objectChange.collectionOf('party')();
    // Which side is up is worked out against the sides that exist, and those come and go with
    // the pieces on the table; without this the strip highlights a band that has left it.
    this.inventory.inventoryVersion();
    return this.turnOrder.currentSide;
  });

  /** Whether the piece whose turn it is may wait to step in later, which the round strip offers. */
  readonly mayHoldCurrent = computed<boolean>(() => {
    const current = this.progress().currentIdentifier;
    this.objectChange.trackMyCursor();
    this.inventory.inventoryVersion();
    return current !== '' && this.turnOrder.mayHold(current);
  });

  /** Gives the turn to a piece, or steps it in where it is waiting to. */
  giveTurnTo(identifier: string): void {
    if (this.turnOrder.mayInterrupt(identifier)) this.turnOrder.interrupt(identifier);
    else this.turnOrder.setCurrent(identifier);
  }

  /** Has the piece whose turn it is wait to step in later, handing the turn on. */
  holdCurrent(): void {
    this.turnOrder.hold(this.turnOrder.currentIdentifier);
  }

  /** Moves the turn on to the next piece, starting or finishing the round when it is time. */
  next(): void {
    this.turnOrder.next();
  }

  /** Takes the turn order back one step, buffs and all. */
  prev(): void {
    this.turnOrder.prev();
  }

  /**
   * Moves on to the next round; while pieces are still waiting they are named and a second press is
   * needed.
   */
  advanceRound(): void {
    void this.turnOrder.advanceRound();
  }

  /** Takes the round back to where the one before it left off, buffs and all. */
  retreatRound(): void {
    this.turnOrder.retreatRound();
  }

  /** Stops the turn order and announces the reset in chat. */
  reset(): void {
    this.turnOrder.reset();
  }

  /** Switches whether buffs run down as turns and rounds pass. */
  toggleBuffDecay(): void {
    this.turnOrder.setBuffDecay(!this.turnOrder.buffDecay);
  }
}
