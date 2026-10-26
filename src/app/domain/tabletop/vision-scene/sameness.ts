import { Point } from '@axe/domain/tabletop/los/segments';
import { OverlayPlan, OverlayShape, OverlayVision, ShadowShape } from '@axe/domain/tabletop/vision-scene/scene-model';

/**
 * Whether two plans draw the same picture.
 *
 * The scene is built again whenever something on the table moves, and the plan with it, though
 * most of what moves is neither a light nor the reader's own eyes. Drawn again, the same plan lays
 * the whole overlay down for nothing.
 */
export function sameOverlayPlan(a: OverlayPlan, b: OverlayPlan): boolean {
  return (
    a.darknessAlpha === b.darknessAlpha &&
    a.darknessColor === b.darknessColor &&
    a.baseRevealAlpha === b.baseRevealAlpha &&
    sameList(a.reveals, b.reveals, sameOverlayShape) &&
    sameList(a.glows, b.glows, sameOverlayShape) &&
    sameList(a.shadows, b.shadows, sameShadowShape) &&
    sameList(a.revealCells ?? [], b.revealCells ?? [], samePoints) &&
    sameOverlayVision(a.vision, b.vision)
  );
}

/** Whether two accounts of what the reader sees and remembers cover the same cells in the same way. */
export function sameOverlayVision(a: OverlayVision | undefined, b: OverlayVision | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.grid.type === b.grid.type &&
    a.grid.cols === b.grid.cols &&
    a.grid.rows === b.grid.rows &&
    a.grid.sizePx === b.grid.sizePx &&
    a.clipReveals === b.clipReveals &&
    a.fogEnabled === b.fogEnabled &&
    a.fogColor === b.fogColor &&
    a.veilColor === b.veilColor &&
    a.veilAlpha === b.veilAlpha &&
    a.unexploredAlpha === b.unexploredAlpha &&
    a.blurPx === b.blurPx &&
    a.rememberSeen === b.rememberSeen &&
    a.clearedStaysLit === b.clearedStaysLit &&
    a.visible.equals(b.visible) &&
    a.explored.equals(b.explored)
  );
}

function sameList<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
  return true;
}

function samePoints(a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  return true;
}

function sameOverlayShape(a: OverlayShape, b: OverlayShape): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.brightPx === b.brightPx &&
    a.dimPx === b.dimPx &&
    a.angle === b.angle &&
    a.direction === b.direction &&
    a.color === b.color &&
    a.full === b.full &&
    a.animation === b.animation &&
    samePoints(a.clipPolygon, b.clipPolygon)
  );
}

function sameShadowShape(a: ShadowShape, b: ShadowShape): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.fx === b.fx &&
    a.fy === b.fy &&
    a.width === b.width &&
    a.color === b.color &&
    a.imageUrl === b.imageUrl &&
    samePoints(a.points, b.points) &&
    samePoints(a.clipPolygon, b.clipPolygon)
  );
}
