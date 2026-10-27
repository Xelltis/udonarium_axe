import { segmentClearBetween, segmentsAbove } from '@axe/domain/tabletop/los/segments';
import { isLit, isSnuffed, lightReaches } from '@axe/domain/tabletop/vision-scene/light-reach';
import { clamp01, distance, lightFloorPool, seesInDark } from '@axe/domain/tabletop/vision-scene/light-shape';
import { SceneViewer, SceneVisionSource, VisionScene } from '@axe/domain/tabletop/vision-scene/scene-model';
import { ownedSources } from '@axe/domain/tabletop/vision-scene/viewer';
import { visionLobeScale } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

const GM_DIM_FACTOR = 0.4;

/**
 * How dark the overlay is for a viewer: the table's darkness less the global illumination, and much
 * lighter for the game master. 0 when darkness is off.
 */
export function darknessAlphaFor(scene: VisionScene, viewer: SceneViewer): number {
  if (!scene.darknessEnabled) return 0;
  const global = clamp01(scene.globalIllumination);
  const base = clamp01(scene.darknessLevel) * (1 - global);
  return viewer.isGameMaster ? base * GM_DIM_FACTOR : base;
}

/**
 * Whether a viewer can see a point through the pieces they see through.
 *
 * The game master sees everything, and a viewer with no such pieces sees whatever is lit.
 */
export function isPointVisible(scene: VisionScene, x: number, y: number, viewer: SceneViewer, z = 0): boolean {
  if (viewer.isGameMaster) return true;
  return isPointVisibleFrom(scene, x, y, ownedSources(scene, viewer), z);
}

/**
 * A table with the dark switched off has nothing to be lit by, so everything counts as lit and
 * what is left to settle a look is the walls in the way and which way the piece is facing.
 */
export function isPointVisibleFrom(
  scene: VisionScene,
  x: number,
  y: number,
  sources: readonly SceneVisionSource[],
  z = 0
): boolean {
  const lit = (!scene.darknessEnabled || isLit(scene, x, y, true, z)) && !isSnuffed(scene, x, y);
  if (sources.length === 0) return lit;

  for (const source of sources) {
    const scale = visionLobeScale(source.lobes, source.direction, source.x, source.y, x, y);
    if (scale <= 0) continue;
    // The range on a piece is how far it sees with nothing to see by. Ground a lamp reaches
    // is seen as far as the lamp carries, so a torch-bearer with two cells of night sight
    // still sees the whole of the room its torch lights. With no dark on the table there is
    // nothing to see by or without, and the range is the whole of the limit.
    const withinRange = source.rangePx > 0 && distance(x, y, source.x, source.y) <= source.rangePx * scale;
    if (!scene.darknessEnabled && source.rangePx > 0 && !withinRange) continue;
    if (source.type === VisionType.TRUESIGHT && withinRange) return true;
    const between = segmentsAbove(scene.sightSegments, source.z);
    if (!segmentClearBetween(source.x, source.y, source.z, x, y, z, between)) continue;
    if (lit) return true;
    if (seesInDark(source.type) && withinRange) return true;
  }
  return false;
}

/** What a thing is worth to the eye before any light falls on it. */
const SEEN_BRIGHTNESS = 0.4;

/**
 * How much of a light is left at a distance from it.
 *
 * Full out to the bright radius, then away to nothing at the edge of the dim one. The middle
 * of that fall is a half.
 */
function lightFalloff(reach: number, brightPx: number, dimPx: number): number {
  if (reach <= brightPx) return 1;
  const ring = dimPx - brightPx;
  if (ring <= 0) return 0;
  return clamp01(1 - (reach - brightPx) / ring);
}

/**
 * How lit a thing of this radius is, from 0 to 1, fading from full within a light's bright reach to
 * nothing at the edge of its dim reach.
 *
 * The edge of the thing nearest the light counts, the reach is measured on the surface at height
 * `pz`, and the level never falls below the global illumination.
 */
export function objectLightLevel(
  scene: VisionScene,
  x: number,
  y: number,
  radiusPx: number,
  ignoreShadowCasters = false,
  pz = 0
): number {
  let level = clamp01(scene.globalIllumination);
  for (const light of scene.lights) {
    // The surface the thing is standing on, which is what the light has to reach across.
    const pool = lightFloorPool(light, pz);
    if (!pool) continue;
    const dx = pool.cx - x;
    const dy = pool.cy - y;
    const dist = Math.hypot(dx, dy);
    if (dist - radiusPx > pool.dimPx) continue;
    let sx = x;
    let sy = y;
    if (radiusPx > 0 && dist > radiusPx) {
      const u = radiusPx / dist;
      sx = x + dx * u;
      sy = y + dy * u;
    }
    if (!lightReaches(scene, light, sx, sy, ignoreShadowCasters, pz)) continue;
    const contribution = lightFalloff(Math.hypot(pool.cx - sx, pool.cy - sy), pool.brightPx, pool.dimPx);
    if (contribution > level) level = contribution;
  }
  return level;
}

/**
 * How bright to draw a thing for a viewer, from the level the darkness overlay leaves up to 1.
 *
 * What is lit or in the viewer's sight starts from 0.4 and the light carries it the rest of the
 * way; what is neither stays at the overlay's level. With no darkness it is always 1.
 */
export function objectBrightnessFor(
  scene: VisionScene,
  viewer: SceneViewer,
  x: number,
  y: number,
  radiusPx: number,
  ignoreShadowCasters = false,
  pz = 0
): number {
  const base = 1 - darknessAlphaFor(scene, viewer);
  // Nothing below can come out under the base, so a table with no dark in it is at full
  // brightness wherever the light and the sight lines happen to fall.
  if (base >= 1) return 1;
  const level = objectLightLevel(scene, x, y, radiusPx, ignoreShadowCasters, pz);
  if (level >= 1) return 1;
  // Lit or merely in sight, a thing is worth four tenths before any light is added to it, and
  // the light carries it the rest of the way. Nothing in between is a step.
  const lit = level > 0 || isPointVisible(scene, x, y, viewer, pz);
  const floor = lit ? SEEN_BRIGHTNESS : base;
  return Math.max(base, floor + (1 - floor) * level);
}
