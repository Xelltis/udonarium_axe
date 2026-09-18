import { DestroyRef, inject, Injectable } from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  footprintOf,
  TabletopOverlapRegistryEntry,
  TabletopOverlapService,
} from '@axe/application/ui/tabletop-overlap.service';
import { perfCounters, perfTimed } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GridType } from '@axe/domain/tabletop/game-table';
import { SurfaceDims, surfaceWorldBox } from '@axe/domain/tabletop/surface-space';
import { boardSurfaceOf, surfaceOf, TableSurface, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainSlopeRoofOf, terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';

const POSZ_EPSILON = 0.5;
const DEBOUNCE_MS = 80;
const MAX_PASSES = 8;
const BUCKET_PX = 200;

const GRAVITY_ALIASES = ['terrain', 'character', 'table-mask', 'text-note'] as const;

interface CachedEntry {
  entry: TabletopOverlapRegistryEntry;
  // world-space axis-aligned footprint (x/y) and vertical extent (z)
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  bottomZ: number;
  topZ: number;
  altitudePx: number;
  thicknessPx: number;
  posZ: number;
  surface: TableSurface;
  isGravity: boolean;
  /** A sloping block, whose top is read where it is stood on rather than at its highest. */
  sloping: Terrain | null;
  /** Whether something that has come down inside this is stood on top of it instead. */
  liftsOut: boolean;
  gridSizePx: number;
  gridType: GridType;
}

@Injectable({ providedIn: 'root' })
export class GravityService {
  private readonly overlapService = inject(TabletopOverlapService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private applying = false;

  constructor() {
    for (const alias of GRAVITY_ALIASES) {
      this.objectChange.onObjectChangedForSingleAlias(alias, () => this.schedule(), this.destroyRef);
    }
    this.destroyRef.onDestroy(() => {
      if (this.timer != null) clearTimeout(this.timer);
      this.timer = null;
    });
  }

  private schedule(): void {
    if (this.applying) return;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pointerDeviceService.isDragging) {
        this.schedule();
        return;
      }
      this.apply();
    }, DEBOUNCE_MS);
  }

  private apply(): void {
    perfCounters.bump('gravityPass');
    perfTimed('gravity', () => this.applyNow());
  }

  private applyNow(): void {
    this.applying = true;
    try {
      // All surfaces participate: a floor object can rest on a wall terrain (a beam) and
      // vice versa, so every object is projected into one shared world-space box.
      const entries = this.overlapService.entries();
      if (entries.length === 0) return;

      // Read each footprint and height once into a cache, so the inner loop never triggers a reflow
      const gridSize = this.tabletopService.gridSize();
      const cached = GravityService.buildCache(
        entries,
        this.surfaceDims(gridSize),
        gridSize,
        this.tabletopService.currentTable.gridType
      );
      const targets = cached.filter((c) => c.isGravity);
      if (targets.length === 0) return;

      // Register every object in its cell, so a support search only walks the cell under the centre
      const grid = GravityService.buildSpatialIndex(cached);

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let changed = false;
        for (const c of targets) {
          const support = GravityService.findSupportZAtCenter(c, grid);
          const resting = GravityService.restingPosZ(c.entry.object, support, c.altitudePx);
          if (Math.abs(c.posZ - resting) > POSZ_EPSILON) {
            c.entry.object.posZ = resting;
            c.posZ = resting;
            c.bottomZ = c.altitudePx + resting;
            c.topZ = c.bottomZ + c.thicknessPx;
            changed = true;
          }
        }
        if (!changed) break;
      }
    } finally {
      // Dropping the flag before the microtask from the position change calls back into schedule
      // would chain another pass off the settling this one caused.
      // Riding a microtask absorbs the reschedule that gravity itself provokes.
      queueMicrotask(() => {
        this.applying = false;
      });
    }
  }

  /**
   * Where an object comes to rest over a support reaching up to `supportZ`.
   *
   * A character's altitude is the height it keeps over whatever is under it, so it rides up with
   * the support. Terrain's is the height it was built at — a canopy is three cells off the ground,
   * not three cells over the trunk it crowns — so the support only fills the gap beneath it.
   */
  static restingPosZ(obj: TabletopObject, supportZ: number, altitudePx: number): number {
    if (obj instanceof Terrain) return Math.max(0, supportZ - altitudePx);
    return supportZ;
  }

  /** Nothing standing on a board falls: the board holds it, whatever angle the board is at. */
  static isAffectedByGravity(obj: TabletopObject): boolean {
    if (!(obj instanceof Terrain || obj instanceof GameCharacter)) return false;
    return !boardSurfaceOf(obj);
  }

  /**
   * How high the tallest thing under an object's middle reaches, without reaching above the
   * object's own base.
   *
   * Something overhead does not lift the object into it. With nothing underneath the answer is the
   * floor, 0.
   */
  static findSupportZ(
    target: TabletopOverlapRegistryEntry,
    entries: TabletopOverlapRegistryEntry[],
    gridSize: number
  ): number {
    const center = GravityService.footprintCenter(target, gridSize);
    const targetBottom = target.object.altitude * gridSize + target.object.posZ;
    let maxZ = 0;
    for (const entry of entries) {
      if (entry.object.identifier === target.object.identifier) continue;
      if (!GravityService.containsPoint(entry, center.x, center.y, gridSize)) continue;
      const topZ = GravityService.topZ(entry.object, gridSize);
      if (topZ > targetBottom + POSZ_EPSILON) continue;
      if (topZ > maxZ) maxZ = topZ;
    }
    return maxZ;
  }

  /**
   * Whether a block stands what has come down inside it on top of itself.
   *
   * Only a slope does: its surface rises across it, so a piece let go part way up ends with
   * the surface over its feet. A face too sheer to climb and a door standing open are things a
   * piece is never put on top of, and a block with a level top is either stood on or walked
   * beneath, never climbed out of.
   */
  private static liftsWhatIsInside(terrain: Terrain, gridSizePx: number, gridType: GridType): boolean {
    if (terrain.blocksClimb) return false;
    if (terrain.isDoor && terrain.isDoorOpen) return false;
    return terrainSlopeRoofOf(terrain, gridSizePx, gridType) != null;
  }

  /** How high an object's top stands above the floor, in pixels, counting a terrain's own height. */
  static topZ(obj: TabletopObject, gridSize: number): number {
    const baseZ = obj.altitude * gridSize + obj.posZ;
    if (obj instanceof Terrain) return baseZ + obj.height * gridSize;
    return baseZ;
  }

  /**
   * How high an object's top stands on the surface it is on, which is what another object rests
   * against.
   *
   * Altitude only counts on the floor; on a wall or a board the object's height is measured from
   * that surface.
   */
  static contactTopZ(obj: TabletopObject, surface: TableSurface, gridSize: number): number {
    if (surface === 'floor') return GravityService.topZ(obj, gridSize);
    const heightPx = obj instanceof Terrain ? obj.height * gridSize : 0;
    return obj.posZ + heightPx;
  }

  /** How high an object's base stands on the surface it is on. Altitude only counts on the floor. */
  static contactBottomZ(obj: TabletopObject, surface: TableSurface, gridSize: number): number {
    if (surface === 'floor') return obj.altitude * gridSize + obj.posZ;
    return obj.posZ;
  }

  private static footprintCenter(entry: TabletopOverlapRegistryEntry, gridSize: number): { x: number; y: number } {
    const { width, height } = footprintOf(entry, gridSize);
    return { x: entry.object.location.x + width / 2, y: entry.object.location.y + height / 2 };
  }

  private static containsPoint(entry: TabletopOverlapRegistryEntry, x: number, y: number, gridSize: number): boolean {
    const { width, height } = footprintOf(entry, gridSize);
    const left = entry.object.location.x;
    const top = entry.object.location.y;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  private surfaceDims(gridSize: number): SurfaceDims {
    const table = this.tabletopService.currentTable;
    return {
      widthPx: table.width * gridSize,
      depthPx: table.height * gridSize,
      wallHeightPx: table.wallHeight * gridSize,
    };
  }

  private static buildCache(
    entries: TabletopOverlapRegistryEntry[],
    dims: SurfaceDims,
    gridSizePx: number,
    gridType: GridType
  ): CachedEntry[] {
    const cached: CachedEntry[] = [];
    for (const entry of entries) {
      const obj = entry.object;
      const surface = surfaceOf(obj);
      const { width: w, height: h } = footprintOf(entry, gridSizePx);
      const altitudePx = obj.altitude * gridSizePx;
      const posZ = obj.posZ;
      const thicknessPx = obj instanceof Terrain ? obj.height * gridSizePx : 0;
      const box = surfaceWorldBox(surface, obj.location.x, obj.location.y, w, h, altitudePx + posZ, thicknessPx, dims);
      cached.push({
        entry,
        minX: box.minX,
        maxX: box.maxX,
        minY: box.minY,
        maxY: box.maxY,
        centerX: (box.minX + box.maxX) / 2,
        centerY: (box.minY + box.maxY) / 2,
        bottomZ: box.minZ,
        topZ: box.maxZ,
        altitudePx,
        thicknessPx,
        posZ,
        surface,
        isGravity: surface === 'floor' && GravityService.isAffectedByGravity(obj),
        sloping: obj instanceof Terrain && terrainSlopeRoofOf(obj, gridSizePx, gridType) != null ? obj : null,
        liftsOut: obj instanceof Terrain && GravityService.liftsWhatIsInside(obj, gridSizePx, gridType),
        gridSizePx,
        gridType,
      });
    }
    return cached;
  }

  private static buildSpatialIndex(cached: CachedEntry[]): Map<string, CachedEntry[]> {
    const grid = new Map<string, CachedEntry[]>();
    for (const c of cached) {
      const minCellX = Math.floor(c.minX / BUCKET_PX);
      const maxCellX = Math.floor(c.maxX / BUCKET_PX);
      const minCellY = Math.floor(c.minY / BUCKET_PX);
      const maxCellY = Math.floor(c.maxY / BUCKET_PX);
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        for (let cy = minCellY; cy <= maxCellY; cy++) {
          const key = `${cx},${cy}`;
          let bucket = grid.get(key);
          if (!bucket) {
            bucket = [];
            grid.set(key, bucket);
          }
          bucket.push(c);
        }
      }
    }
    return grid;
  }

  private static findSupportZAtCenter(target: CachedEntry, grid: Map<string, CachedEntry[]>): number {
    const cellX = Math.floor(target.centerX / BUCKET_PX);
    const cellY = Math.floor(target.centerY / BUCKET_PX);
    const bucket = grid.get(`${cellX},${cellY}`);
    if (!bucket) return 0;

    const targetBottom = target.bottomZ;
    const targetId = target.entry.object.identifier;
    const cx = target.centerX;
    const cy = target.centerY;

    let maxZ = 0;
    for (const c of bucket) {
      if (c.entry.object.identifier === targetId) continue;
      if (cx < c.minX || cx > c.maxX) continue;
      if (cy < c.minY || cy > c.maxY) continue;
      const topZ = GravityService.topOfEntry(c, cx, cy);
      // Something wholly overhead does not lift what walks beneath it. A slope is the one
      // thing that lifts what has come down inside it: let go on a ramp, a piece lands where
      // the grid puts it, which can be further up the slope than the surface it was dragged
      // along, and it stands on the ramp rather than sinking through it. Standing level with
      // the foot of a thing is not inside it, so two blocks filling the same space still
      // leave each other where they are.
      const inside = c.liftsOut && c.bottomZ < targetBottom - POSZ_EPSILON;
      if (topZ > targetBottom + POSZ_EPSILON && !inside) continue;
      if (topZ > maxZ) maxZ = topZ;
    }
    return maxZ;
  }

  /**
   * How high one thing reaches under a point.
   *
   * A sloping block is read where it is stood on, so something set down on a ramp rests on the
   * ramp rather than level with its high end.
   */
  private static topOfEntry(cached: CachedEntry, x: number, y: number): number {
    const sloping = cached.sloping;
    if (!sloping) return cached.topZ;
    return terrainTopPxAt(sloping, cached.gridSizePx, cached.gridType, x, y);
  }
}
