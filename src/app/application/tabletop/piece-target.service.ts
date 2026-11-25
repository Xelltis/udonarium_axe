import { computed, inject, Injectable } from '@angular/core';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { PartyService } from '@axe/application/party/party.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { SolidRangeService } from '@axe/application/tabletop/solid-range.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import type { BattleSide } from '@axe/domain/battle/battle-lineup';
import { standingBattleSide } from '@axe/domain/battle/battle-side';
import { GameCharacter } from '@axe/domain/character/game-character';
import { type AimCandidate, aimOrder, nextAim } from '@axe/domain/tabletop/aim-order';
import { RangeArea } from '@axe/domain/tabletop/range';
import { rangeCovers } from '@axe/domain/tabletop/range-coverage';
import type { Solid } from '@axe/domain/tabletop/solid/solid';
import { solidTouchesSegment } from '@axe/domain/tabletop/solid/solid-touch';
import { surfacePointTo3D } from '@axe/domain/tabletop/surface-space';
import { tableFocusPoint } from '@axe/domain/tabletop/table-focus-point';
import { boardSurfaceOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';

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
  private readonly links = inject(PieceLinksService);
  private readonly parties = inject(PartyService);

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

  /**
   * The pieces this seat may aim at without pressing them, as from a list of them or by a key: on the
   * table in view, in the fight, and seen by this seat. Read again as a piece arrives, goes or
   * changes, and as what this seat sees does.
   */
  readonly aimable = computed<GameCharacter[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const aimable: GameCharacter[] = [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      this.objectChange.versionOf(piece.identifier)();
      if (this.mayAimAt(piece)) aimable.push(piece);
    }
    return aimable;
  });

  /** Whether this seat may aim at a piece: one on the table in view, not taken out of the fight, and seen by this seat. */
  mayAimAt(piece: GameCharacter): boolean {
    return piece.isVisibleOnTable && piece.offField !== '1' && this.vision.isTokenVisible(piece);
  }

  /**
   * The piece aims are taken from, of these in order: the first on the table in view that this seat
   * sees. A piece kept from its sight, as one in stealth, fog or darkness whose turn it is, is passed
   * over, for an order measured from it would tell where it stands.
   */
  aimedFromOf(candidates: readonly (GameCharacter | null | undefined)[]): GameCharacter | null {
    return (
      candidates.find(
        (piece): piece is GameCharacter => !!piece && piece.isVisibleOnTable && this.vision.isTokenVisible(piece)
      ) ?? null
    );
  }

  /**
   * The side of the fight a piece is aimed at as standing on: its own, or for a part with none of its
   * own, its body's. A piece with no side of its own stands on its party's, so read where signals are
   * followed, the side is read again as a party is put on another side or goes.
   */
  sideOf(piece: GameCharacter): BattleSide | null {
    this.parties.parties();
    const own = standingBattleSide(piece);
    if (own) return own;
    const body = this.links.bodyOf(piece);
    return body ? standingBattleSide(body) : null;
  }

  /**
   * The pieces this seat may aim at, in the order a key aims at them one at a time from a piece (see
   * `aimOrder`), measured where each stands in the room: a piece on the floor at the height it stands
   * at, at the centre of an engagement zone it is in; one on a wall where on the wall it hangs; one on
   * a board where the board stands.
   */
  aimOrderFrom(from: GameCharacter | null): GameCharacter[] {
    const candidateOf = this.aimCandidateReader();
    const aimable = this.aimable();
    const byIdentifier = new Map(aimable.map((piece) => [piece.identifier, piece]));
    return aimOrder(from ? candidateOf(from) : null, aimable.map(candidateOf))
      .map((identifier) => byIdentifier.get(identifier))
      .filter((piece): piece is GameCharacter => piece !== undefined);
  }

  /**
   * Aims at the next piece of {@link aimOrderFrom} a piece, a step on (1) or back (-1) from the one
   * aimed at now, and at it alone, as a key does over and over. Answers the piece aimed at, or null
   * where there is none.
   */
  aimNext(from: GameCharacter | null, step: 1 | -1): GameCharacter | null {
    const order = this.aimOrderFrom(from);
    const aimed = new Set(order.filter((piece) => piece.targeted).map((piece) => piece.identifier));
    const nextIdentifier = nextAim(
      order.map((piece) => piece.identifier),
      aimed,
      step
    );
    const next = order.find((piece) => piece.identifier === nextIdentifier) ?? null;
    if (next) this.setOnly([next]);
    return next;
  }

  private aimCandidateReader(): (piece: GameCharacter) => AimCandidate {
    const reading = this.zones.reading();
    const table = this.tabletop.currentTable;
    const grid = table.gridSize > 0 ? table.gridSize : 50;
    const dims = { widthPx: table.width * grid, depthPx: table.height * grid, wallHeightPx: table.wallHeight * grid };
    const standing = (piece: GameCharacter): { x: number; y: number; z: number } => {
      if (boardSurfaceOf(piece)) {
        const board = tableFocusPoint(piece, dims, (identifier) => this.objectStore.get<TabletopObject>(identifier));
        return { ...board, z: 0 };
      }
      const surface = surfaceOf(piece);
      if (surface !== 'floor') return surfacePointTo3D(surface, piece.location.x, piece.location.y, dims);
      const at = reading.pointOf(piece);
      return { x: at.x, y: at.y, z: this.pieces.footOf(piece).height + piece.altitude * grid };
    };
    return (piece) => ({
      identifier: piece.identifier,
      ...standing(piece),
      side: this.sideOf(piece),
      whole: this.links.bodyOf(piece)?.identifier ?? piece.identifier,
    });
  }

  /**
   * Aims at a piece or takes the aim off it. While an effect is held ready, the aim is what it is cast
   * at, so the piece is taken as a press of it would be (see `EffectTargetingService.press`).
   */
  toggle(piece: GameCharacter): void {
    if (this.effectTargeting.isPicking()) {
      this.effectTargeting.press(piece.identifier);
      return;
    }
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

  /**
   * Aims at exactly these pieces, taking the aim off every other. While an effect is held ready, they
   * are what it is cast at instead (see `EffectTargetingService.pickOnly`), for the marks copy its picks.
   */
  setOnly(pieces: readonly GameCharacter[]): void {
    if (this.effectTargeting.isPicking()) {
      this.effectTargeting.pickOnly(pieces.map((piece) => piece.identifier));
      return;
    }
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
      .filter((piece) => this.mayAimAt(piece))
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
      .filter((piece) => this.mayAimAt(piece))
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
