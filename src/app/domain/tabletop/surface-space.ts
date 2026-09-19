import type { TableSurface } from '@axe/domain/tabletop/tabletop-object';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SurfaceFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
}

export interface SurfaceDims {
  widthPx: number;
  depthPx: number;
  wallHeightPx: number;
}

/**
 * The local axes of a table face in world space: its origin corner, the directions its x and y run,
 * and the normal pointing into the room.
 *
 * A wall's origin is at its top edge with y running down. Anything that is not a wall is the floor.
 */
export function surfaceFrame(surface: TableSurface, dims: SurfaceDims): SurfaceFrame {
  const { widthPx, depthPx, wallHeightPx } = dims;
  switch (surface) {
    case 'north-wall':
      return {
        origin: { x: 0, y: 0, z: wallHeightPx },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: -1 },
        normal: { x: 0, y: 1, z: 0 },
      };
    case 'south-wall':
      return {
        origin: { x: widthPx, y: depthPx, z: wallHeightPx },
        u: { x: -1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: -1 },
        normal: { x: 0, y: -1, z: 0 },
      };
    case 'west-wall':
      return {
        origin: { x: 0, y: depthPx, z: wallHeightPx },
        u: { x: 0, y: -1, z: 0 },
        v: { x: 0, y: 0, z: -1 },
        normal: { x: 1, y: 0, z: 0 },
      };
    case 'east-wall':
      return {
        origin: { x: widthPx, y: 0, z: wallHeightPx },
        u: { x: 0, y: 1, z: 0 },
        v: { x: 0, y: 0, z: -1 },
        normal: { x: -1, y: 0, z: 0 },
      };
    default:
      return {
        origin: { x: 0, y: 0, z: 0 },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 1, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
      };
  }
}

/** Where a point on a table face lands in world space, lifted `heightAbove` pixels off the face. */
export function surfacePointTo3D(
  surface: TableSurface,
  localX: number,
  localY: number,
  dims: SurfaceDims,
  heightAbove = 0
): Vec3 {
  const f = surfaceFrame(surface, dims);
  return {
    x: f.origin.x + f.u.x * localX + f.v.x * localY + f.normal.x * heightAbove,
    y: f.origin.y + f.u.y * localX + f.v.y * localY + f.normal.y * heightAbove,
    z: f.origin.z + f.u.z * localX + f.v.z * localY + f.normal.z * heightAbove,
  };
}

/**
 * The bearing on the table, in degrees, that points from a face into the room. The floor gives 0.
 */
export function surfaceInwardDirection(surface: TableSurface): number {
  const n = surfaceFrame(surface, { widthPx: 0, depthPx: 0, wallHeightPx: 0 }).normal;
  return (Math.atan2(n.y, n.x) * 180) / Math.PI;
}

export interface WorldBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Project an object placed on a surface into a world-space axis-aligned box.
 * The object occupies the surface-local rectangle [localX, localX+footW] x [localY, localY+footH]
 * and extends along the surface normal from normalBase to normalBase+normalThickness.
 * Every table surface is axis-aligned, so the projected box is exact.
 */
export function surfaceWorldBox(
  surface: TableSurface,
  localX: number,
  localY: number,
  footW: number,
  footH: number,
  normalBase: number,
  normalThickness: number,
  dims: SurfaceDims
): WorldBox {
  const f = surfaceFrame(surface, dims);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const lx of [localX, localX + footW]) {
    for (const ly of [localY, localY + footH]) {
      for (const h of [normalBase, normalBase + normalThickness]) {
        const x = f.origin.x + f.u.x * lx + f.v.x * ly + f.normal.x * h;
        const y = f.origin.y + f.u.y * lx + f.v.y * ly + f.normal.y * h;
        const z = f.origin.z + f.u.z * lx + f.v.z * ly + f.normal.z * h;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}
