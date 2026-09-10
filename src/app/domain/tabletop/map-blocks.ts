import { DungeonPropId } from '@axe/domain/media/texture-catalog';

/** What a thing is made of: one of the bundled pictures, or one out of the image storage. */
export type MapMaterial = { kind: 'texture'; id: string } | { kind: 'library'; identifier: string };

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

/** How big a board the table is given, in cells. */
export interface MapSize {
  width: number;
  height: number;
}

/** What a table looks and feels like, apart from what stands on it. */
export interface MapMood {
  /** Zero leaves the table lit. Anything else is how deep the dark goes. */
  darkness: number;
  ambientColor: string;
  weatherKind: string;
  weatherDensity: number;
  gridShow: boolean;
  torches: number;
}

export type MapBlockKind = 'wall' | 'door' | 'stairUp' | 'stairDown' | 'prop';

export interface MapBlock {
  kind: MapBlockKind;
  rect: MapRect;
  blocksSight: boolean;
  /** Whether a piece walks around it rather than up onto it. Left out, it may be climbed. */
  blocksClimb?: boolean;
  locked: boolean;
  rooms: number[];
  /** For a door, the axis it bars. A slab thin along x stands across an east-west passage. */
  across?: 'x' | 'y';
  /** A bundled picture for a piece that wears one of its own: a door, a stair, a tree. */
  prop?: DungeonPropId;
  /** What a prop is built from, when it is not made of the walls of the place. */
  skin?: { side: MapMaterial; top: MapMaterial };
  /** How tall it stands, in cells. Walls take the height the panel asks for. */
  height?: number;
  /**
   * How much of its cell it actually fills, in cells, when it is thinner than the ground it
   * stands on. A trunk is a post in the middle of its square, not the whole square.
   */
  footprint?: { w: number; d: number };
  /** How far off the ground it floats, in cells. A canopy hangs over what walks beneath it. */
  altitude?: number;
  /**
   * How far it is turned from the grid, in degrees.
   *
   * A boulder square to the board is a block of tofu. Nothing in open country is square to
   * anything, and a few degrees of turn is most of what tells one from a built thing.
   */
  rotate?: number;
  /** How far it sits from the middle of its cell, in cells. */
  offset?: { x: number; y: number };
  /** How a door moves when it opens. */
  doorStyle?: string;
  /** Whether this one opens the other way round, which is what makes a pair of doors a pair. */
  doorMirrored?: boolean;
  name?: string;
}

/**
 * Ground that is painted rather than built.
 *
 * A floor holds nothing up and stops no one seeing, so a slab of terrain per patch buys
 * only sync traffic. These go into the picture the table wears instead.
 */
export interface MapPaint {
  kind: 'floor' | 'hazard';
  rect: MapRect;
  /** The ground of a field changes from patch to patch, so a patch may name its own. */
  material?: MapMaterial;
}

export type MapLightKind = 'sconce' | 'campfire' | 'brazier' | 'stand' | 'lantern';

export interface MapLight extends MapPoint {
  kind: MapLightKind;
  room: number;
  /** Which way it throws its light, measured away from whatever it is fixed to. */
  facing: number;
}

/** An effect laid over a patch of the board and left there: a poisoned pool, a vent, a mire. */
export interface MapAmbience {
  rect: MapRect;
  kind: string;
  density: number;
  name: string;
}

export interface MapBlocks {
  blocks: MapBlock[];
  paint: MapPaint[];
  ambiences: MapAmbience[];
  torchRooms: number[];
  torchSpots: MapPoint[];
  lights: MapLight[];
}

/**
 * How many pieces one table will carry.
 *
 * A maze fills the rock between the rooms, which buys a dungeon worth walking through at
 * roughly twice the pieces a straight corridor would cost. A wood is dearer again: a tree
 * that reads as a tree is a post and a crown in three tapering layers, and a wood is a
 * hundred of them. The ceiling is set where a thick wood on a middling board fits under it.
 */
export const MAP_MAX_TERRAINS = 700;
export const MAP_HEAVY_TERRAINS = 350;

/** What one terrain costs to sync: itself, the five it is built from, and its six values. */
export const SYNC_OBJECTS_PER_TERRAIN = 12;

export function syncObjectCount(blocks: readonly MapBlock[]): number {
  return blocks.length * SYNC_OBJECTS_PER_TERRAIN;
}
