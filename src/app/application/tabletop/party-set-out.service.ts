import { inject, Injectable, Injector } from '@angular/core';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';

/** Where a piece is set down as a party is set out: its corner, in table px. */
export interface PartySpot {
  readonly carrier: GameCharacter;
  readonly x: number;
  readonly y: number;
}

/**
 * Sets a party out on the floor whole, as gathering it on a table and mustering it at a generated
 * dungeon's way in both do.
 *
 * A member is set down as what it is carried off with: the mount it rides or the body it is a part
 * of, so a member riding a mount outside the party brings the mount along rather than leaving it
 * behind still ridden. What goes with each piece set down, its parts, those riding it and those it
 * holds, comes along, and whatever comes along held on to by a piece left where it stands is let go
 * of, or the holder would pull it back the next time it moved.
 */
@Injectable({ providedIn: 'root' })
export class PartySetOutService {
  private readonly links = inject(PieceLinksService);
  private readonly objectStore = inject(ObjectStore);
  /** Asked for the engagement zones only to let go of a piece, so that setting nothing out sets none of them up. */
  private readonly injector = inject(Injector);

  /** For each member, the pieces it is carried off with, up to the one set down for it; see `rideChainOf`. */
  chainsOf(members: readonly GameCharacter[]): Map<GameCharacter, GameCharacter[]> {
    return new Map(members.map((member) => [member, this.links.rideChainOf(member)]));
  }

  /** The pieces set down for the members, once each, in the order of the members they are set down for. */
  carriersOf(chains: ReadonlyMap<GameCharacter, readonly GameCharacter[]>): GameCharacter[] {
    const carriers: GameCharacter[] = [];
    for (const chain of chains.values()) {
      const carrier = chain[chain.length - 1];
      if (!carriers.includes(carrier)) carriers.push(carrier);
    }
    return carriers;
  }

  /**
   * The pieces that move as the carriers are set down: the carriers, the members carried as them,
   * and every piece on the table bound to a carrier, as those riding it, its parts and those it holds.
   */
  movingWith(carriers: readonly GameCharacter[], members: readonly GameCharacter[]): Set<GameCharacter> {
    const moving = new Set<GameCharacter>([...carriers, ...members]);
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (!piece.isVisibleOnTable || moving.has(piece)) continue;
      if (carriers.includes(this.links.anchorOf(piece))) moving.add(piece);
    }
    return moving;
  }

  /**
   * Sets each carrier down on the floor at its spot, the members carried as it taken out onto the
   * table with it where they were put away, lets go of what moves held by a piece that stays, and
   * brings along what goes with each carrier, stood on it by cells `cellPx` across where given and
   * by those of the table in view otherwise. A member held fast is stood on its carrier all the same.
   * Answers every piece moved.
   */
  setOut(
    spots: readonly PartySpot[],
    chains: ReadonlyMap<GameCharacter, readonly GameCharacter[]>,
    cellPx?: number
  ): GameCharacter[] {
    const carriers = spots.map((spot) => spot.carrier);
    const placed = [...chains].filter(([, chain]) => carriers.includes(chain[chain.length - 1]));
    return GameObject.batch(() => {
      for (const carrier of carriers) if (carrier.location.name !== 'table') carrier.setLocation('table');
      for (const [member] of placed) if (member.location.name !== 'table') member.setLocation('table');
      for (const { carrier, x, y } of spots) {
        carrier.location = { name: 'table', x, y };
        carrier.posZ = 0;
        carrier.update();
      }
      const members = placed.map(([member]) => member);
      const moving = this.movingWith(carriers, members);
      for (const piece of moving) {
        const holder = this.links.boundHolderOf(piece);
        if (holder && !moving.has(holder)) this.injector.get(EngagementZoneService).release(piece);
      }
      const carried = this.links.carryBoundOntoFloor(carriers, cellPx);
      for (const [, chain] of placed) this.links.standChainOn(chain, cellPx);
      return [...new Set([...carriers, ...members, ...carried])];
    });
  }
}
