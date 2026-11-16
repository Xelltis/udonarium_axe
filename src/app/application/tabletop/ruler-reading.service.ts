import { inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { RulerEnd, RulerLine, RulerReading, rulerReadingOf } from '@axe/domain/tabletop/ruler/ruler-line';
import { measureBetween } from '@axe/domain/tabletop/ruler/ruler-measure';
import { dropLine, WireSegment } from '@axe/domain/tabletop/solid/solid-wire';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import type { TableWorldGuide } from '@axe/domain/tabletop/world/table-solids';

const RULER_OPACITY = 1;
/** How wide a ruler is drawn, and the darker line under it that keeps it readable over any board. */
const RULER_WIDTH_PX = 3;
const RULER_OUTLINE = { colour: '#1a1405', opacity: 0.75, widthPx: 7 } as const;
/** How far round each end of a ruler the ring marking it reaches, in the table's squares. */
const END_RING_SQUARES = 0.18;
/** How many straight pieces the ring marking an end is drawn with. */
const END_RING_STEPS = 24;

/** A ruler as this seat sees it: where its ends stand now, and what it measures. */
export interface MeasuredRuler {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly reading: RulerReading;
}

/**
 * What every ruler on the table is worked out by, whoever lays it: where its ends stand now, whether
 * this seat may see them, what the room's rules make of the line between them, and the lines it is
 * drawn with in the scene. An end held to a piece stands at the middle of the piece's feet, its
 * altitude included, lifted as far as the end was lifted over them.
 */
@Injectable({ providedIn: 'root' })
export class RulerReadingService {
  private readonly tabletop = inject(TabletopService);
  private readonly pieces = inject(TablePiecesService);
  private readonly standing = inject(StandingGroundService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly roomRules = inject(RoomRulesService);
  private readonly vision = inject(VisionService);

  /** A ruler between two ends as this seat sees it now, or null where one of its ends cannot be told. */
  measure(line: RulerLine): MeasuredRuler | null {
    const from = this.pointOf(line.from);
    const to = this.pointOf(line.to);
    return from && to ? { from, to, reading: this.readingBetween(from, to) } : null;
  }

  /** Where an end stands now: where it was laid, or over the feet of the piece it is held to where that piece stands now. */
  pointOf(end: RulerEnd): Vec3 | null {
    if (!end.piece) return { x: end.x, y: end.y, z: end.z };
    this.objectChange.versionOf(end.piece)();
    const piece = this.objectStore.get<GameCharacter>(end.piece);
    if (!(piece instanceof GameCharacter) || !piece.isVisibleOnTable) return { x: end.x, y: end.y, z: end.z };
    const feet = this.pieceFeet(piece);
    return { ...feet, z: feet.z + (end.lift ?? 0) };
  }

  /** Whether this seat may see an end of a ruler: the piece it is held to, or the ground it is laid on. */
  maySee(end: RulerEnd): boolean {
    if (end.piece) {
      this.objectChange.versionOf(end.piece)();
      const piece = this.objectStore.get<GameCharacter>(end.piece);
      if (!(piece instanceof GameCharacter) || !piece.isVisibleOnTable) return !this.vision.isHiddenByFog(end.x, end.y);
      return this.vision.isTokenVisible(piece);
    }
    return !this.vision.isHiddenByFog(end.x, end.y);
  }

  /** An end held to a piece, at the middle of its feet, its altitude included, lifted so far over them. */
  endOnPiece(piece: GameCharacter, lift: number): RulerEnd {
    return { ...this.pieceFeet(piece), piece: piece.identifier, lift };
  }

  /** What the room's rules make of the ruler between two points, said afresh as the rules change. */
  readingBetween(from: Vec3, to: Vec3): RulerReading {
    this.tabletop.currentTableVersion();
    this.objectChange.versionOf('Config')();
    const table = this.tabletop.currentTable;
    const rules = this.roomRules.rulesFor(table);
    const measured = measureBetween({
      from,
      to,
      squarePx: this.tabletop.squarePx(),
      gridType: table.gridType,
      diagonal: rules.diagonalMove,
    });
    return rulerReadingOf(measured, rules.cellDistance, parseMoveUnit(rules.cellDistanceUnit));
  }

  /** How a ruler between two points is drawn in the scene, in a colour, over a darker line. */
  guideOf(id: string, measured: { readonly from: Vec3; readonly to: Vec3 }, colour: string): TableWorldGuide {
    return {
      id,
      segments: this.segmentsOf(measured),
      colour,
      opacity: RULER_OPACITY,
      widthPx: RULER_WIDTH_PX,
      outline: RULER_OUTLINE,
    };
  }

  /**
   * The lines a ruler between two points is drawn with: from end to end, a ring lying round each end,
   * and down from an end off the ground.
   */
  segmentsOf(measured: { readonly from: Vec3; readonly to: Vec3 }): WireSegment[] {
    const { from, to } = measured;
    const radius = END_RING_SQUARES * this.tabletop.squarePx();
    return [
      [from, to],
      ...ringRound(from, radius),
      ...ringRound(to, radius),
      ...dropLine(from, this.standing.heightPxAt(from.x, from.y)),
      ...dropLine(to, this.standing.heightPxAt(to.x, to.y)),
    ];
  }

  /** How high the ground is at a point of the table, in table pixels. */
  groundAt(x: number, y: number): number {
    return this.standing.heightPxAt(x, y);
  }

  /** How wide a cell of the table in view is, in table pixels. */
  gridSize(): number {
    const size = this.tabletop.currentTable.gridSize;
    return size > 0 ? size : 50;
  }

  private pieceFeet(piece: GameCharacter): Vec3 {
    const gridSize = this.gridSize();
    const foot = this.pieces.footOf(piece);
    const half = (Math.max(0, piece.size) * gridSize) / 2;
    return { x: foot.x + half, y: foot.y + half, z: foot.height + piece.altitude * gridSize };
  }
}

/** A ring lying level round a point. */
function ringRound(centre: Vec3, radius: number): WireSegment[] {
  const points = Array.from({ length: END_RING_STEPS }, (_, i) => {
    const turn = (i / END_RING_STEPS) * Math.PI * 2;
    return { x: centre.x + Math.cos(turn) * radius, y: centre.y + Math.sin(turn) * radius, z: centre.z };
  });
  return points.map((point, i): WireSegment => [point, points[(i + 1) % points.length]]);
}
