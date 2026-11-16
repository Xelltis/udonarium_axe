import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ALTITUDE_STEP_CELLS } from '@axe/domain/tabletop/altitude-step';
import { parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import {
  RulerEnd,
  RulerLine,
  RulerReading,
  rulerReadingOf,
  squareMiddleOf,
} from '@axe/domain/tabletop/ruler/ruler-line';
import { measureBetween } from '@axe/domain/tabletop/ruler/ruler-measure';
import { dropLine, WireSegment } from '@axe/domain/tabletop/solid/solid-wire';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import type { TableWorldGuide } from '@axe/domain/tabletop/world/table-solids';

/** The pick layer a character is pressed by, which a ruler's end holds to. */
const CHARACTER_LAYER = 'character';

/** The colour this seat's ruler is drawn in, and how opaque. */
export const OWN_RULER_COLOUR = '#ffec8c';
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
 * The ruler this seat measures the table with: whether it is in hand, the line it is laid along, and
 * what that line measures. An end laid on a piece is held to it, at the middle of its feet, and moves
 * with it; an end laid on the table keeps to the middle of a square where the table snaps, unless it
 * is laid freely. The far end may be lifted off what it was laid on.
 */
@Injectable({ providedIn: 'root' })
export class RulerService {
  private readonly tabletop = inject(TabletopService);
  private readonly pick = inject(TablePickService);
  private readonly pieces = inject(TablePiecesService);
  private readonly standing = inject(StandingGroundService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly roomRules = inject(RoomRulesService);

  /** Whether this seat has the ruler in hand: a press on the table lays it rather than doing anything else. */
  readonly inHand = signal(false);
  /** The ruler as this seat laid it, or null before it lays one. */
  readonly laid = signal<RulerLine | null>(null);
  /** Whether this seat is drawing the ruler out now, its far end following the pointer. */
  readonly drawing = signal(false);
  /** How far the far end is lifted off what it is laid on, in table pixels, which it keeps as it is drawn about. */
  private farLift = 0;

  /** The ruler as this seat sees it now, its ends held to pieces where they stand now. */
  readonly measured = computed<MeasuredRuler | null>(() => {
    const line = this.laid();
    if (!line) return null;
    const from = this.pointOf(line.from);
    const to = this.pointOf(line.to);
    if (!from || !to) return null;
    return { from, to, reading: this.readingBetween(from, to) };
  });

  /** The lines this seat's ruler is drawn with in the scene: from end to end, and down from an end off the ground. */
  readonly guides = computed<readonly TableWorldGuide[]>(() => {
    const measured = this.measured();
    if (!measured) return [];
    return [this.guideOf('ruler#own', measured, OWN_RULER_COLOUR)];
  });

  /** Takes the ruler up, or puts it away, as it was. */
  toggle(): void {
    if (this.inHand()) this.putAway();
    else this.inHand.set(true);
  }

  /** Puts the ruler away, and the line it was laid along with it. */
  putAway(): void {
    this.inHand.set(false);
    this.drawing.set(false);
    this.laid.set(null);
  }

  /** Takes the line away and keeps the ruler in hand, to lay it afresh. */
  clear(): void {
    this.drawing.set(false);
    this.laid.set(null);
  }

  /** Starts drawing the ruler out from a point of the page, its far end following the pointer from there. */
  startAt(pageX: number, pageY: number, free: boolean): void {
    const from = this.endAt(pageX, pageY, free);
    if (!from) return;
    this.farLift = 0;
    this.inHand.set(true);
    this.laid.set({ from, to: from });
    this.drawing.set(true);
  }

  /** Starts drawing the ruler out from a piece, its far end following the pointer until it is let go. */
  startFrom(piece: GameCharacter): void {
    const from = this.endOnPiece(piece, 0);
    this.farLift = 0;
    this.inHand.set(true);
    this.laid.set({ from, to: from });
    this.drawing.set(true);
  }

  /** Moves the far end of the ruler being drawn out to a point of the page, keeping how far it was lifted. */
  reachTo(pageX: number, pageY: number, free: boolean): void {
    const line = this.laid();
    if (!line || !this.drawing()) return;
    const to = this.endAt(pageX, pageY, free);
    if (!to) return;
    this.laid.set({ from: line.from, to: liftedBy(to, this.farLift) });
  }

  /** Stops drawing the ruler out, leaving it laid where it was let go until it is cleared or laid again. */
  letGo(): void {
    this.drawing.set(false);
  }

  /** Lifts the far end of the ruler by steps of altitude, or lowers it for fewer than none. */
  liftEnd(steps: number): void {
    const line = this.laid();
    if (!line || steps === 0) return;
    const step = steps * ALTITUDE_STEP_CELLS * this.gridSize();
    this.farLift += step;
    this.laid.set({ from: line.from, to: liftedBy(line.to, step) });
  }

  /**
   * Where an end laid at a point of the page stands: on the piece the point lands on, held to it, or
   * on the face the point lands on there, kept to the middle of its square on a table that snaps unless
   * laid freely. Null before the table has a camera.
   */
  endAt(pageX: number, pageY: number, free: boolean): RulerEnd | null {
    const hit = this.pick.pressedAt(pageX, pageY);
    if (hit?.target.layer === CHARACTER_LAYER) {
      const piece = this.objectStore.get<GameCharacter>(hit.target.id);
      if (piece instanceof GameCharacter) return this.endOnPiece(piece, 0);
    }
    if (!this.pick.rayAt(pageX, pageY)) return null;
    const landed = this.pick.landingAt(pageX, pageY);
    const table = this.tabletop.currentTable;
    if (free || !table.gridSnap) return { x: landed.x, y: landed.y, z: landed.z };
    const middle = squareMiddleOf(landed, this.tabletop.squarePx(), table.gridType);
    const onFloor = landed.z <= this.standing.heightPxAt(landed.x, landed.y) + 0.5;
    return { ...middle, z: onFloor ? this.standing.heightPxAt(middle.x, middle.y) : landed.z };
  }

  /** An end held to a piece, at the middle of its feet, its altitude included, lifted so far over them. */
  private endOnPiece(piece: GameCharacter, lift: number): RulerEnd {
    const at = this.pieceFeet(piece);
    return { ...at, piece: piece.identifier, lift };
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

  /** What the room's rules make of the ruler between two points. */
  readingBetween(from: Vec3, to: Vec3): RulerReading {
    this.tabletop.currentTableVersion();
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

  private pieceFeet(piece: GameCharacter): Vec3 {
    const gridSize = this.gridSize();
    const foot = this.pieces.footOf(piece);
    const half = (Math.max(0, piece.size) * gridSize) / 2;
    return { x: foot.x + half, y: foot.y + half, z: foot.height + piece.altitude * gridSize };
  }

  private gridSize(): number {
    const size = this.tabletop.currentTable.gridSize;
    return size > 0 ? size : 50;
  }
}

/** An end lifted so far: over the feet of its piece, or off the point it was laid on. */
function liftedBy(end: RulerEnd, lift: number): RulerEnd {
  if (lift === 0) return end;
  return end.piece ? { ...end, lift: (end.lift ?? 0) + lift } : { ...end, z: end.z + lift };
}

/** A ring lying level round a point. */
function ringRound(centre: Vec3, radius: number): WireSegment[] {
  const points = Array.from({ length: END_RING_STEPS }, (_, i) => {
    const turn = (i / END_RING_STEPS) * Math.PI * 2;
    return { x: centre.x + Math.cos(turn) * radius, y: centre.y + Math.sin(turn) * radius, z: centre.z };
  });
  return points.map((point, i): WireSegment => [point, points[(i + 1) % points.length]]);
}
