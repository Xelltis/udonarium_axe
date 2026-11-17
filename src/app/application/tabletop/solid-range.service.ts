import { computed, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { RangeArea } from '@axe/domain/tabletop/range';
import { Solid, solidOf } from '@axe/domain/tabletop/solid/solid';
import { SolidCaster, solidRangePlace } from '@axe/domain/tabletop/solid/solid-range-place';
import { SolidAim, SolidReach } from '@axe/domain/tabletop/solid/solid-reach';
import { dropLine, reachDomeWire, WireSegment } from '@axe/domain/tabletop/solid/solid-wire';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import {
  REACH_GUIDE_COLOUR,
  SOLID_RANGE_KIND,
  solidOpacityOf,
  TableWorldGuide,
  TableWorldSolid,
} from '@axe/domain/tabletop/world/table-solids';

/** A range standing up off the table in view, where it stands for this seat. */
export interface PlacedSolidRange {
  readonly range: RangeArea;
  readonly solid: Solid;
  /**
   * Its point, in table pixels: the bottom of a column, the middle of a sphere, the tip of a cone or a
   * beam, which it turns about.
   */
  readonly origin: Vec3;
  /** The room round the piece it follows it may be moved or pointed in, or null where it follows none. */
  readonly reach: SolidReach | null;
  /** The piece it follows, or null for none. */
  readonly caster: GameCharacter | null;
}

/** Which of two places a press lands on first: a solid stands over the flat pieces lying on the floor. */
const SOLID_PICK_ORDER = 1;

/** How opaque the room round a caster is drawn while a range is moved or pointed in it. */
const REACH_GUIDE_OPACITY = 0.7;

/** How finely the turn and the tip of a cone or a beam are written once let go, in degrees. */
const AIM_WRITTEN_STEP = 0.1;

/** How finely where a sphere or a column stands round its caster is written once let go, in cells. */
const OFFSET_WRITTEN_STEP = 0.01;

/**
 * Where the ranges standing up off the table in view stand, worked out once for all who read them:
 * the scene that draws them, the picking that says what a press lands on, and the aiming at the pieces
 * within one. A range stands up only on the floor; on a board or a wall it is drawn flat as before.
 */
@Injectable({ providedIn: 'root' })
export class SolidRangeService {
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly pieces = inject(TablePiecesService);
  private readonly objectStore = inject(ObjectStore);
  private readonly transient = inject(TransientPlacementService);
  private readonly standing = inject(StandingGroundService);

  /** The way this seat is pointing a cone or a beam it holds by its tip, which the range is drawn with until let go. */
  private readonly aims = signal<ReadonlyMap<string, SolidAim>>(new Map());

  /**
   * Every range standing up off the table in view, read again as a range, what it holds, the piece it
   * follows or the table's grid changes, and as a piece moved by this seat moves.
   */
  readonly placed = computed<readonly PlacedSolidRange[]>(() => {
    this.objectChange.collectionOf(RangeArea.aliasName)();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.tabletop.currentTableVersion();
    const placed: PlacedSolidRange[] = [];
    for (const range of this.tabletop.ranges) {
      this.objectChange.versionOf(range.identifier)();
      if (!range.isSolid) continue;
      for (const element of collectDataElements(range.rootDataElement)) {
        this.objectChange.versionOf(element.identifier)();
      }
      const one = this.place(range);
      if (one) placed.push(one);
    }
    return placed;
  });

  /**
   * The ranges standing up off the table in view, as the scene draws them: the same list as before
   * while none of them is drawn otherwise, as while a piece elsewhere is moved, so the scene does not
   * lay them again.
   */
  readonly solids = computed<readonly TableWorldSolid[]>(
    () =>
      this.placed().map(({ range, solid }) => {
        const opacity = solidOpacityOf(range.opacity);
        return {
          id: `${range.identifier}#solid`,
          owner: range.identifier,
          solid,
          fill: range.gridColor,
          edge: range.rangeColor,
          fillOpacity: opacity.fill,
          edgeOpacity: opacity.edge,
        };
      }),
    { equal: sameSolids }
  );

  /**
   * The lines this seat is shown while it moves a sphere or a column round its caster, or points a
   * cone or a beam: the room it may be put or pointed in, the line from the caster to where it stands,
   * and the line down from there to the ground.
   */
  readonly guides = computed<readonly TableWorldGuide[]>(() => {
    const aims = this.aims();
    const moving = this.transient.placed();
    const guides: TableWorldGuide[] = [];
    for (const placed of this.placed()) {
      const id = placed.range.identifier;
      if (!aims.has(id) && !moving.has(id)) continue;
      const room = this.roomOf(placed);
      if (!room) continue;
      const point = this.heldPointOf(placed);
      const ground = this.standing.heightPxAt(point.x, point.y);
      const segments: WireSegment[] = [...reachDomeWire(room), [room.centre, point], ...dropLine(point, ground)];
      guides.push({ id: `${id}#reach`, segments, colour: REACH_GUIDE_COLOUR, opacity: REACH_GUIDE_OPACITY });
    }
    return guides;
  });

  /**
   * The room a held range is moved or pointed in: round its caster for a sphere or a column, and round
   * its tip as far as it reaches for a cone or a beam, whether or not it follows a piece.
   */
  roomOf(placed: PlacedSolidRange): SolidReach | null {
    if (placed.reach) return placed.reach;
    const solid = placed.solid;
    if (solid.kind !== 'cone' && solid.kind !== 'beam') return null;
    const ground = this.standing.heightPxAt(placed.origin.x, placed.origin.y);
    return { centre: placed.origin, radius: solid.length, floorZ: Math.min(ground, placed.origin.z) };
  }

  /** The point a range is held by: where a sphere or a column stands, or the tip of a cone or a beam. */
  heldPointOf(placed: PlacedSolidRange): Vec3 {
    const solid = placed.solid;
    if (solid.kind === 'cone' || solid.kind === 'beam') {
      const way = solid.frame.way;
      return {
        x: placed.origin.x + way.x * solid.length,
        y: placed.origin.y + way.y * solid.length,
        z: placed.origin.z + way.z * solid.length,
      };
    }
    return placed.origin;
  }

  /** Points a cone or a beam this seat holds by its tip, for this seat alone until it is let go. */
  holdAim(identifier: string, aim: SolidAim): void {
    const next = new Map(this.aims());
    next.set(identifier, aim);
    this.aims.set(next);
  }

  /**
   * Lets go of a cone or a beam held by its tip, writing the way it was pointed into the range for
   * everyone; nothing where it was let go of without being pointed anywhere.
   */
  letGoAim(identifier: string): void {
    const aim = this.aims().get(identifier);
    if (!aim) return;
    const next = new Map(this.aims());
    next.delete(identifier);
    this.aims.set(next);
    const range = this.objectStore.get<RangeArea>(identifier);
    if (!(range instanceof RangeArea)) return;
    range.rotate = roundTo(aim.yaw, AIM_WRITTEN_STEP);
    range.aimPitch = roundTo(aim.pitch, AIM_WRITTEN_STEP);
  }

  /** Lets go of a cone or a beam held by its tip without writing anything. */
  dropAim(identifier: string): void {
    if (!this.aims().has(identifier)) return;
    const next = new Map(this.aims());
    next.delete(identifier);
    this.aims.set(next);
  }

  /**
   * Writes where a sphere or a column following a piece was let go, brought within its room round the
   * piece, as how far off the middle of the piece it stands and how high over its feet, so that it keeps
   * there as the piece moves. Nothing for any other range.
   */
  settleRoundCaster(range: RangeArea): void {
    if (!range.keepsCasterOffset) return;
    const placed = this.placedOf(range.identifier);
    if (!placed?.reach || !placed.caster) return;
    const gridSize = this.tabletop.currentTable.gridSize > 0 ? this.tabletop.currentTable.gridSize : 50;
    const { origin, reach } = placed;
    range.casterOffset = {
      x: roundTo((origin.x - reach.centre.x) / gridSize, OFFSET_WRITTEN_STEP),
      y: roundTo((origin.y - reach.centre.y) / gridSize, OFFSET_WRITTEN_STEP),
    };
    range.location = { ...range.location, x: origin.x, y: origin.y };
    range.altitude = roundTo((origin.z - reach.centre.z) / gridSize, OFFSET_WRITTEN_STEP);
  }

  /** The ranges standing up off the table in view, by identifier. */
  private readonly placedById = computed(
    () => new Map(this.placed().map((one) => [one.range.identifier, one] as const))
  );

  /** Where a range stands up off the table in view, or null for one that lies flat or is not there. */
  placedOf(identifier: string): PlacedSolidRange | null {
    return this.placedById().get(identifier) ?? null;
  }

  /** What a press lands on for each range standing up off the table in view. */
  pickTargets(): PickTarget[] {
    return this.placed().map(({ range, solid }) => ({
      id: range.identifier,
      layer: SOLID_RANGE_KIND,
      order: SOLID_PICK_ORDER,
      surface: 'floor',
      shapes: [{ kind: 'solid', solid }],
    }));
  }

  private place(range: RangeArea): PlacedSolidRange | null {
    const foot = this.pieces.footOf(range);
    if (foot.surface !== 'floor') return null;
    const table = this.tabletop.currentTable;
    const gridSize = table.gridSize > 0 ? table.gridSize : 50;
    const squarePx = this.tabletop.squarePx();
    const caster = this.casterOf(range);
    if (caster) this.objectChange.versionOf(caster.identifier)();
    const kind = range.solidKind;
    const aim = this.aims().get(range.identifier);
    const { origin, reach } = solidRangePlace({
      kind,
      x: foot.x,
      y: foot.y,
      groundZ: foot.height,
      altitudePx: range.altitude * gridSize,
      caster: caster ? this.standingOf(caster, gridSize) : null,
      reachPx: range.reachSquares * squarePx,
      lengthPx: Math.max(1, range.length) * squarePx,
    });
    const solid = solidOf({
      kind,
      type: range.type,
      length: range.length,
      width: range.width,
      rotate: aim?.yaw ?? range.rotate,
      origin: { x: origin.x, y: origin.y },
      cellPattern: range.cellPattern,
      gridType: table.gridType,
      squarePx,
      originZ: origin.z,
      height: range.columnHeight,
      pitch: aim?.pitch ?? range.aimPitch,
    });
    return solid ? { range, solid, origin, reach, caster } : null;
  }

  /** The piece a range follows, where it is on the table, or null for none. */
  private casterOf(range: RangeArea): GameCharacter | null {
    const identifier = range.followingCharacterIdentifier;
    if (!identifier) return null;
    const caster = this.objectStore.get<GameCharacter>(identifier);
    return caster instanceof GameCharacter && caster.isVisibleOnTable ? caster : null;
  }

  /** Where a piece stands for a range following it, as the table draws it now. */
  private standingOf(caster: GameCharacter, gridSize: number): SolidCaster {
    const foot = this.pieces.footOf(caster);
    const bodyPx = Math.max(0, caster.size) * gridSize;
    return {
      x: foot.x + bodyPx / 2,
      y: foot.y + bodyPx / 2,
      footZ: foot.height + caster.altitude * gridSize,
      groundZ: foot.height,
      bodyPx,
    };
  }
}

/** A value rounded to a step that is a whole fraction of one, as a tenth, with no tail of error left on it. */
function roundTo(value: number, step: number): number {
  const scale = Math.round(1 / step);
  return Math.round(value * scale) / scale;
}

/** Whether two lists of solids draw the same, entry for entry. */
function sameSolids(a: readonly TableWorldSolid[], b: readonly TableWorldSolid[]): boolean {
  return a.length === b.length && a.every((one, i) => JSON.stringify(one) === JSON.stringify(b[i]));
}
