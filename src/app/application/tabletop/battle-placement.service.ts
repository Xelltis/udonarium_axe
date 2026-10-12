import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { centreOf, EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { gatherSpotsAround } from '@axe/domain/tabletop/move/gather-cells';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import {
  DistanceModifier,
  modifierFor,
  parseDistanceModifiers,
  parsePlacementDistances,
  PlacementDistance,
  pointAtBearing,
} from '@axe/domain/tabletop/zone/battle-placement';

/**
 * Sets two sides out at the start of a fight, and says what the distance between them does.
 *
 * The game master picks a piece to lead each side, a direction and a distance; the second leader is
 * put that far from the first that way, and each side gathers about its leader. Pieces out of the
 * fight stay where they are. Distances are read from the table the room writes, as is what a
 * distance does.
 */
@Injectable({ providedIn: 'root' })
export class BattlePlacementService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly zones = inject(EngagementZoneService);

  /** The distances the room writes for two sides to start at. */
  distances(): PlacementDistance[] {
    return parsePlacementDistances(this.config()?.placementDistances ?? '');
  }

  /** What the room writes a distance between the sides does. */
  modifiers(): DistanceModifier[] {
    return parseDistanceModifiers(this.config()?.distanceModifiers ?? '');
  }

  /** The pieces standing on the floor of the table, each with the side it fights on. */
  pieces(): { piece: GameCharacter; side: string | null }[] {
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && surfaceOf(piece) === 'floor')
      .map((piece) => ({ piece, side: this.zones.sideOf(piece) }));
  }

  /** How far apart two pieces stand, in metres, as the zones measure it; null where there is no table. */
  distanceM(a: GameCharacter, b: GameCharacter): number | null {
    const pxPerMetre = this.zones.pxPerMetre();
    if (!pxPerMetre) return null;
    const from = this.zones.pointOf(a);
    const to = this.zones.pointOf(b);
    return Math.hypot(to.x - from.x, to.y - from.y) / pxPerMetre;
  }

  /** What the distance between two pieces does, by the room's table; null past every row or with none. */
  modifierBetween(a: GameCharacter, b: GameCharacter): DistanceModifier | null {
    const distance = this.distanceM(a, b);
    return distance === null ? null : modifierFor(this.modifiers(), distance);
  }

  /**
   * Puts the second leader `distanceM` metres from the first in a direction, and gathers each side
   * about its leader. Answers whether anything was placed.
   */
  place(leader: GameCharacter, other: GameCharacter, bearingDeg: number, distanceM: number): boolean {
    const table = this.tableSelecter.viewTable;
    const pxPerMetre = this.zones.pxPerMetre();
    const sideA = this.zones.sideOf(leader);
    const sideB = this.zones.sideOf(other);
    if (!table || !pxPerMetre || sideA === null || sideB === null || sideA === sideB) return false;
    const from = centreOf(leader, table.gridSize);
    const to = pointAtBearing(from, bearingDeg, Math.max(0, distanceM) * pxPerMetre);
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const startA = cellIndexAt(grid, from.x, from.y);
    const startB = cellIndexAt(grid, to.x, to.y);
    if (startA < 0 || startB < 0) return false;

    const everyone = this.pieces();
    const sideOf = (side: string, first: GameCharacter) => [
      first,
      ...everyone
        .filter((entry) => entry.side === side && entry.piece !== first && entry.piece.offField !== '1')
        .map((entry) => entry.piece),
    ];
    const groupA = sideOf(sideA, leader);
    const groupB = sideOf(sideB, other);
    const moving = new Set([...groupA, ...groupB].map((piece) => piece.identifier));
    const taken = occupiedCells(
      grid,
      everyone.map((entry) => entry.piece).filter((piece) => !moving.has(piece.identifier)),
      ''
    );
    const spots = [
      ...gatherSpotsAround(grid, table.gridSize, startA, groupA, taken),
      ...gatherSpotsAround(grid, table.gridSize, startB, groupB, taken),
    ];
    GameObject.batch(() => {
      for (const spot of spots) {
        spot.character.location.x = spot.x;
        spot.character.location.y = spot.y;
        spot.character.posZ = 0;
        spot.character.engagementZone = '';
        spot.character.zoneLeaveRound = '';
        spot.character.update();
      }
    });
    for (const spot of spots) this.objectChange.notifyChanged(spot.character.identifier);
    if (spots.length > 0) SoundEffect.play(PresetSound.piecePut);
    return spots.length > 0;
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
