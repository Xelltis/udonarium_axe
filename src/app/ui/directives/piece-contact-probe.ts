import { GravityService } from '@axe/application/tabletop/gravity.service';
import { footprintOf, TabletopOverlapRegistryEntry } from '@axe/application/ui/tabletop-overlap.service';
import { ContactFootprint, ContactRider } from '@axe/domain/tabletop/contact-support';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MoveBlock, turnedMoveBlock } from '@axe/domain/tabletop/move/blocked-path';
import { surfaceOf, TableSurface, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainSlopeRoofOf, terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';

/** The table a piece is dragged over, as far as what it can stand on depends on it. */
export interface ProbeTable {
  readonly gridSize: number;
  readonly gridType: GridType;
}

/** How the piece in hand sits on what it meets: its own height off the floor and its thickness. */
export interface RiderState {
  /** How high the piece is shown off its surface, in pixels. */
  readonly posZ: number;
  /** The level the drag last found for it, or null before the first. */
  readonly reachZ: number | null;
  /** What it was last found resting on, where that is known. */
  readonly restingOn: string | undefined;
}

/**
 * How high a sloping block's surface stands over a point, for the probe to ask as the piece
 * moves, or nothing for anything with a level top.
 */
export function slopeTopReader(
  object: TabletopObject,
  selfSurface: TableSurface,
  table: ProbeTable
): ((x: number, y: number) => number) | undefined {
  if (!(object instanceof Terrain) || selfSurface !== 'floor' || surfaceOf(object) !== 'floor') return undefined;
  if (!terrainSlopeRoofOf(object, table.gridSize, table.gridType)) return undefined;
  return (x, y) => terrainTopPxAt(object, table.gridSize, table.gridType, x, y);
}

/**
 * What a piece can stand on: the footprint of every other piece on the same face, with how high
 * each stands and whether it may be climbed. With `sheer`, a block that blocks climbing may only be
 * stood beside.
 */
export function buildContactProbe(
  self: TabletopObject,
  entries: readonly TabletopOverlapRegistryEntry[],
  table: ProbeTable,
  sheer: boolean
): ContactFootprint[] {
  const selfSurface = surfaceOf(self);
  const gridSize = table.gridSize;
  const footprints: ContactFootprint[] = [];
  for (const entry of entries) {
    if (entry.object.identifier === self.identifier) continue;
    if (surfaceOf(entry.object) !== selfSurface) continue;
    const left = entry.object.location.x;
    const top = entry.object.location.y;
    const footprint = footprintOf(entry, gridSize);
    footprints.push({
      left,
      top,
      right: left + footprint.width,
      bottom: top + footprint.height,
      bottomZ: GravityService.contactBottomZ(entry.object, selfSurface, gridSize),
      topZ: GravityService.contactTopZ(entry.object, selfSurface, gridSize),
      rotate: entry.object instanceof Terrain ? entry.object.rotate : undefined,
      climbable: !(sheer && entry.object instanceof Terrain && entry.object.blocksClimb),
      topAt: slopeTopReader(entry.object, selfSurface, table),
      identifier: entry.object.identifier,
    });
  }
  return footprints;
}

/** How the piece in hand sits on what the probe finds under it. */
export function contactRiderOf(self: TabletopObject, gridSize: number, state: RiderState): ContactRider {
  const altitudePx = surfaceOf(self) === 'floor' ? self.altitude * gridSize : 0;
  const ridesUp = !(self instanceof Terrain);
  return {
    altitudePx,
    thicknessPx: self instanceof Terrain ? self.height * gridSize : 0,
    ridesUp,
    restingZ: state.reachZ ?? (ridesUp ? state.posZ : altitudePx + state.posZ),
    restingOn: state.restingOn,
  };
}

/**
 * How far a piece hangs over the cell it stands in, which is what the ground beside it owes.
 *
 * A piece is stopped by where its middle is, and a piece of one cell already owns the cell
 * its middle is in, so the block itself is all that need stand in its way: grown by half a
 * piece as well, a gap one cell wide would be a gap of no width at all and nothing would
 * ever walk between two walls. What a piece wider than a cell hangs over is another matter,
 * and that much is asked of the ground beside the block.
 */
export function climbSpread(width: number, height: number, gridSize: number): { x: number; y: number } {
  return {
    x: Math.max(0, (width - gridSize) / 2),
    y: Math.max(0, (height - gridSize) / 2),
  };
}

/** The ground the piece in hand may not walk onto: every closed block on its face that blocks climbing. */
export function buildClimbBlocks(
  self: TabletopObject,
  entries: readonly TabletopOverlapRegistryEntry[],
  gridSize: number,
  spread: { x: number; y: number }
): MoveBlock[] {
  const selfSurface = surfaceOf(self);
  const blocks: MoveBlock[] = [];
  for (const entry of entries) {
    const object = entry.object;
    if (object.identifier === self.identifier) continue;
    if (!(object instanceof Terrain) || !object.blocksClimb) continue;
    if (surfaceOf(object) !== selfSurface) continue;
    if (object.isDoor && object.isDoorOpen) continue;
    const left = object.location.x;
    const top = object.location.y;
    const box = { minX: left, minY: top, maxX: left + object.width * gridSize, maxY: top + object.depth * gridSize };
    blocks.push(turnedMoveBlock(box, object.rotate, spread.x, spread.y));
  }
  return blocks;
}
