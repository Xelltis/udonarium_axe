import { SurfaceDims, surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { surfaceOf, TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

export interface BeamWallFaceGrid {
  matrix3d: string;
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  prefix: string;
}

const WALL_PREFIX: Partial<Record<TableSurface, string>> = {
  'north-wall': 'N',
  'east-wall': 'E',
  'south-wall': 'S',
  'west-wall': 'W',
};

const FACE_LIFT_PX = 5.0;

/**
 * How to lay a grid over the face of a terrain standing out from a wall.
 *
 * The answer is a CSS matrix that sets the grid just in front of the face, the grid's size, where
 * it starts on the wall and the wall's letter for the cell labels. Null for terrain on the floor,
 * terrain without a grid, or a face with no area.
 */
export function beamWallFaceGrid(terrain: Terrain, dims: SurfaceDims, gridSize: number): BeamWallFaceGrid | null {
  const surface = surfaceOf(terrain);
  if (surface === 'floor' || !terrain.isGrid) return null;
  const prefix = WALL_PREFIX[surface];
  if (prefix == null) return null;
  const width = terrain.width * gridSize;
  const height = terrain.depth * gridSize;
  if (width <= 0 || height <= 0) return null;
  const frame = surfaceFrame(surface, dims);
  const lx = terrain.location.x;
  const ly = terrain.location.y;
  const protrusion = (terrain.altitude + terrain.height) * gridSize + terrain.posZ + FACE_LIFT_PX;
  const o = frame.origin;
  const p0x = o.x + frame.u.x * lx + frame.v.x * ly + frame.normal.x * protrusion;
  const p0y = o.y + frame.u.y * lx + frame.v.y * ly + frame.normal.y * protrusion;
  const p0z = o.z + frame.u.z * lx + frame.v.z * ly + frame.normal.z * protrusion;
  const m = [
    frame.u.x,
    frame.u.y,
    frame.u.z,
    0,
    frame.v.x,
    frame.v.y,
    frame.v.z,
    0,
    frame.normal.x,
    frame.normal.y,
    frame.normal.z,
    0,
    p0x,
    p0y,
    p0z,
    1,
  ];
  return { matrix3d: `matrix3d(${m.join(',')})`, width, height, offsetLeft: lx, offsetTop: ly, prefix };
}
