import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { collectDataElements } from '@axe/domain/data/data-element-tree';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { RangeArea } from '@axe/domain/tabletop/range';
import { Solid, solidOf } from '@axe/domain/tabletop/solid/solid';
import { SolidCaster, solidRangePlace } from '@axe/domain/tabletop/solid/solid-range-place';
import { SolidReach } from '@axe/domain/tabletop/solid/solid-reach';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
import { SOLID_RANGE_KIND, solidOpacityOf, TableWorldSolid } from '@axe/domain/tabletop/world/table-solids';

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

  /** The ranges standing up off the table in view, as the scene draws them. */
  readonly solids = computed<readonly TableWorldSolid[]>(() =>
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
    })
  );

  /** Where a range stands up off the table in view, or null for one that lies flat or is not there. */
  placedOf(identifier: string): PlacedSolidRange | null {
    return this.placed().find((one) => one.range.identifier === identifier) ?? null;
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
      rotate: range.rotate,
      origin: { x: origin.x, y: origin.y },
      cellPattern: range.cellPattern,
      gridType: table.gridType,
      squarePx,
      originZ: origin.z,
      height: range.columnHeight,
      pitch: range.aimPitch,
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
