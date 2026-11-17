import { computed, inject, Injectable } from '@angular/core';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { SolidRangeService } from '@axe/application/tabletop/solid-range.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeArea } from '@axe/domain/tabletop/range';
import { rangeCovers } from '@axe/domain/tabletop/range-coverage';
import type { Solid } from '@axe/domain/tabletop/solid/solid';
import { solidTouchesSegment } from '@axe/domain/tabletop/solid/solid-touch';

@Injectable({ providedIn: 'root' })
export class PieceTargetService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly effectTargeting = inject(EffectTargetingService);
  private readonly zones = inject(EngagementZoneService);
  private readonly vision = inject(VisionService);
  private readonly solidRanges = inject(SolidRangeService);
  private readonly pieces = inject(TablePiecesService);
  private readonly tabletop = inject(TabletopService);

  /**
   * The pieces on the table aimed at, read again as an aim is put on or taken off, as a piece
   * arrives or goes, and as an aimed-at piece changes, which is how it leaves the table.
   */
  readonly onTable = computed<GameCharacter[]>(() => {
    this.uiSignal.targetChange();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const aimed: GameCharacter[] = [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (!piece.targeted) continue;
      this.objectChange.versionOf(piece.identifier)();
      if (piece.isVisibleOnTable) aimed.push(piece);
    }
    return aimed;
  });

  toggle(piece: GameCharacter): void {
    piece.targeted = !piece.targeted;
    this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
  }

  /**
   * Takes every aim off. An effect's targets being picked are let go of first: the picks are what the
   * effect would be cast at, and marks taken off while they were kept would leave it cast at pieces
   * that no longer look aimed at.
   */
  clear(): void {
    this.effectTargeting.cancel();
    this.drop(this.objectStore.getObjects<GameCharacter>(GameCharacter));
  }

  /** Aims at exactly these pieces, taking the aim off every other. */
  setOnly(pieces: readonly GameCharacter[]): void {
    const wanted = new Set(pieces.map((piece) => piece.identifier));
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      const next = wanted.has(piece.identifier);
      if (piece.targeted === next) continue;
      piece.targeted = next;
      this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
    }
  }

  /**
   * Aims at every piece a range takes in that the reader can see, counted in squares of `squarePx`,
   * and at nothing else. A piece in an engagement zone is taken in where the range takes in the
   * zone's centre; a piece taken out of the fight is not taken in at all. A range standing up off the
   * table takes in a piece any part of whose body reaches into it, high or low.
   */
  targetInsideRange(range: RangeArea, squarePx: number): void {
    const placed = range.isSolid ? this.solidRanges.placedOf(range.identifier) : null;
    if (placed) {
      this.setOnly(this.takenIntoSolid(placed.solid));
      return;
    }
    const shape = {
      type: range.type,
      length: range.length,
      width: range.width,
      rotate: range.rotate,
      origin: { x: range.location.x, y: range.location.y },
    };
    const reading = this.zones.reading();
    const inside = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && piece.offField !== '1' && this.vision.isTokenVisible(piece))
      .filter((piece) => rangeCovers(shape, squarePx, reading.pointOf(piece)) === true);
    this.setOnly(inside);
  }

  /**
   * The pieces the reader can see that any part of reaches into a solid: the upright line through the
   * middle of a piece, from its feet, its altitude included, up as far as it is wide. A piece in an
   * engagement zone is read across the table at the zone's centre, and up from its own feet.
   */
  private takenIntoSolid(solid: Solid): GameCharacter[] {
    const reading = this.zones.reading();
    const table = this.tabletop.currentTable;
    const gridSize = table.gridSize > 0 ? table.gridSize : 50;
    return this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter((piece) => piece.isVisibleOnTable && piece.offField !== '1' && this.vision.isTokenVisible(piece))
      .filter((piece) => {
        const at = reading.pointOf(piece);
        const feet = this.pieces.footOf(piece).height + piece.altitude * gridSize;
        const tall = Math.max(0, piece.size) * gridSize;
        return solidTouchesSegment(solid, { x: at.x, y: at.y, z: feet }, { x: at.x, y: at.y, z: feet + tall });
      });
  }

  /** Takes the aim off these pieces, saying so for each that was aimed at, and leaves every other as it is. */
  drop(pieces: readonly GameCharacter[]): void {
    for (const piece of pieces) {
      if (!piece.targeted) continue;
      piece.targeted = false;
      this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
    }
  }

  anything(): boolean {
    return this.objectStore.getObjects<GameCharacter>(GameCharacter).some((piece) => piece.targeted);
  }
}
