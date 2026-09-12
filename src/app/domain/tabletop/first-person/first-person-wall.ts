import { SurfaceDims, surfaceFrame, surfacePointTo3D } from '@axe/domain/tabletop/surface-space';
import { TableSurface } from '@axe/domain/tabletop/tabletop-object';

export interface FirstPersonWallPlacement {
  x: number;
  y: number;
  z: number;
  rotate: number;
}

export function wallYawOf(surface: TableSurface): number {
  const normal = surfaceFrame(surface, { widthPx: 0, depthPx: 0, wallHeightPx: 0 }).normal;
  const degrees = (Math.atan2(-normal.x, normal.y) * 180) / Math.PI;
  return (Math.round(degrees) + 360) % 360;
}

export function wallPlacementOf(
  surface: TableSurface,
  localX: number,
  localY: number,
  widthPx: number,
  heightPx: number,
  dims: SurfaceDims
): FirstPersonWallPlacement {
  const foot = surfacePointTo3D(surface, localX + widthPx / 2, localY + heightPx, dims);
  return { x: foot.x, y: foot.y, z: foot.z, rotate: wallYawOf(surface) };
}
