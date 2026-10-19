import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { centreOf, EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { gatherSpotsAround } from '@axe/domain/tabletop/move/gather-cells';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import {
  DistanceModifier,
  modifierFor,
  parseDistanceModifiers,
  parsePlacementDistances,
  parseSituationModifiers,
  PlacementDistance,
  pointAtBearing,
  SituationModifier,
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
  private readonly chat = inject(ChatMessageService);
  private readonly t = inject(TRANSLATE_FN);

  /** The distances the room writes for two sides to start at. */
  distances(): PlacementDistance[] {
    return parsePlacementDistances(this.config()?.placementDistances ?? '');
  }

  /** What the room writes a distance between the sides does. */
  modifiers(): DistanceModifier[] {
    return parseDistanceModifiers(this.config()?.distanceModifiers ?? '');
  }

  /** The rows of the room's table that name a situation, such as a kind of move, rather than a distance. */
  situations(): SituationModifier[] {
    return parseSituationModifiers(this.config()?.distanceModifiers ?? '');
  }

  /**
   * Says in chat how far apart two leaders stand and what follows from it: the row for the distance,
   * and the rows of the situations named that apply. Answers whether anything was said.
   */
  announce(a: GameCharacter, b: GameCharacter, situationNames: readonly string[]): boolean {
    const metres = this.distanceM(a, b);
    if (metres === null) return false;
    const notes = [
      this.modifierBetween(a, b)?.note ?? null,
      ...this.situations()
        .filter((row) => situationNames.includes(row.name))
        .map((row) => `${row.name}：${row.note}`),
    ].filter((note): note is string => !!note);
    this.chat.sendSystemMessage(
      this.t('feature.zone.placement.announce', {
        metres: metres.toFixed(1),
        notes: notes.length > 0 ? notes.join(' / ') : this.t('feature.zone.placement.noNote'),
      })
    );
    return true;
  }

  /** The pieces standing on the floor of the table, each with the side it fights on. */
  pieces(): { piece: GameCharacter; side: string | null }[] {
    const reading = this.zones.reading();
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && surfaceOf(piece) === 'floor')
      .map((piece) => ({ piece, side: reading.sideOf(piece) }));
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
   *
   * A piece riding another or held on to by another is set out with that one, where it stands, rather
   * than on a cell of its own: with its own side, or with the other where the other holds on to it.
   */
  place(leader: GameCharacter, other: GameCharacter, bearingDeg: number, distanceM: number): boolean {
    const table = this.tableSelecter.viewTable;
    const pxPerMetre = this.zones.pxPerMetre();
    const sideA = this.zones.sideOf(leader);
    const sideB = this.zones.sideOf(other);
    if (!table || !pxPerMetre || sideA === null || sideB === null || sideA === sideB) return false;
    const from = centreOf(leader, table.gridSize);
    const to = pointAtBearing(from, bearingDeg, Math.max(0, distanceM) * pxPerMetre);
    const grid = moveGridOf(table);
    const startA = cellIndexAt(grid, from.x, from.y);
    const startB = cellIndexAt(grid, to.x, to.y);
    if (startA < 0 || startB < 0) return false;

    const everyone = this.pieces();
    const sides = new Map(everyone.map((entry) => [entry.piece.identifier, entry.side]));
    const anchorOf = new Map(everyone.map((entry) => [entry.piece.identifier, this.zones.anchorOf(entry.piece)]));
    const groupOf = (side: string, first: GameCharacter) => {
      const group = [anchorOf.get(first.identifier) ?? first];
      for (const entry of everyone) {
        if (entry.side !== side || entry.piece.offField === '1') continue;
        const anchor = anchorOf.get(entry.piece.identifier) ?? entry.piece;
        if (sides.get(anchor.identifier) === side && !group.includes(anchor)) group.push(anchor);
      }
      return group;
    };
    const groupA = groupOf(sideA, leader);
    const groupB = groupOf(sideB, other);
    const anchors = new Set([...groupA, ...groupB]);
    const carried = everyone
      .map((entry) => entry.piece)
      .filter((piece) => !anchors.has(piece) && anchors.has(anchorOf.get(piece.identifier) ?? piece));
    const moving = new Set([...anchors, ...carried].map((piece) => piece.identifier));
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
      for (const piece of carried) {
        piece.engagementZone = '';
        piece.zoneLeaveRound = '';
      }
    });
    for (const spot of spots) this.zones.carryBound(spot.character);
    for (const spot of spots) this.objectChange.notifyChanged(spot.character.identifier);
    if (spots.length > 0) SoundEffect.play(PresetSound.piecePut);
    return spots.length > 0;
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
