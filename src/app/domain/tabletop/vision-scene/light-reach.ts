import { segmentClearBetween, segmentsAbove, TallSegment } from '@axe/domain/tabletop/los/segments';
import { clamp01, withinCone } from '@axe/domain/tabletop/vision-scene/light-shape';
import { SceneBrightness, SceneLight, VisionScene } from '@axe/domain/tabletop/vision-scene/scene-model';

/**
 * What stands in a light's way, worked out once for that light.
 *
 * Gathering it afresh on every question asked about the light would build a new array out of
 * every wall on the table each time. A cone light asks a thousand times over while it feels
 * for the edge of its own pool, and every piece on the board asks once per light per repaint,
 * so the gathering would cost more than the answering does.
 *
 * It is remembered against the scene and the light together, so it needs no clearing: a
 * new scene brings a new answer, and when the old scene goes what was remembered of it
 * goes with it. Against the light alone it would be wrong the moment the same light were
 * asked about under two scenes.
 */
interface LightOccluders {
  /**
   * Everything, for a caller that culls in its own way and reckons with heights itself.
   *
   * Shading a wall face works out how far up the shadow of each thing climbs, so it wants
   * everything, including what the lamp is hung above.
   */
  all: readonly TallSegment[];
  /**
   * What still stands in this lamp's way, given how high the lamp is hung.
   *
   * A lamp carried to the top of a tower is above the tower, and above most of what stood in
   * its way on the ground. The flat reckoning of whether a spot is lit cannot tell, so what
   * the lamp is over is taken out before it is asked.
   */
  overhead: readonly TallSegment[];
  /** Only what falls within the light's own reach, and still stands in its way. */
  near: readonly TallSegment[];
}

type OccluderSlots = { yes?: LightOccluders; no?: LightOccluders };

const occluderMemo = new WeakMap<VisionScene, WeakMap<SceneLight, OccluderSlots>>();

export function occludersOf(scene: VisionScene, light: SceneLight, ignoreShadowCasters: boolean): LightOccluders {
  let byLight = occluderMemo.get(scene);
  if (!byLight) {
    byLight = new WeakMap();
    occluderMemo.set(scene, byLight);
  }
  let held = byLight.get(light);
  if (!held) {
    held = {};
    byLight.set(light, held);
  }
  const slot = ignoreShadowCasters ? 'yes' : 'no';
  const known = held[slot];
  if (known) return known;

  const walls: TallSegment[] = light.ignoreOcclusion ? [] : scene.lightSegments;
  let all: TallSegment[] = walls;
  if (!ignoreShadowCasters && light.castShadows) {
    const shadowSegments: TallSegment[] = [];
    for (const caster of scene.shadowCasters) {
      if (caster.ownerId === light.sourceId) continue;
      shadowSegments.push(...caster.segments);
    }
    if (shadowSegments.length > 0) all = [...walls, ...shadowSegments];
  }

  const overhead = segmentsAbove(all, light.z);
  const built: LightOccluders = {
    all,
    overhead,
    near: cullSegments(
      overhead,
      light.x - light.dimPx,
      light.y - light.dimPx,
      light.x + light.dimPx,
      light.y + light.dimPx
    ),
  };
  held[slot] = built;
  return built;
}

/** The segments that could possibly cross a box, which is most of them thrown away. */
export function cullSegments(
  segments: readonly TallSegment[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): TallSegment[] {
  const kept: TallSegment[] = [];
  for (const seg of segments) {
    if (Math.min(seg.x1, seg.x2) > maxX) continue;
    if (Math.max(seg.x1, seg.x2) < minX) continue;
    if (Math.min(seg.y1, seg.y2) > maxY) continue;
    if (Math.max(seg.y1, seg.y2) < minY) continue;
    kept.push(seg);
  }
  return kept;
}

export function occludersFor(
  scene: VisionScene,
  light: SceneLight,
  ignoreShadowCasters = false
): readonly TallSegment[] {
  return occludersOf(scene, light, ignoreShadowCasters).all;
}

/**
 * Whether a light reaches a point: within its dim reach and its cone, with nothing standing
 * between.
 *
 * With `ignoreShadowCasters` only walls stand in the way, not the pieces that cast shadows.
 */
export function lightReaches(
  scene: VisionScene,
  light: SceneLight,
  x: number,
  y: number,
  ignoreShadowCasters = false,
  pz = 0
): boolean {
  if (Math.hypot(x - light.x, y - light.y, pz - light.z) > light.dimPx) return false;
  if (!withinCone(light, x, y, pz)) return false;
  // The point is inside the light's reach, so nothing outside that reach can stand between.
  const occluders = occludersOf(scene, light, ignoreShadowCasters).near;
  if (occluders.length === 0) return true;
  return segmentClearBetween(light.x, light.y, light.z, x, y, pz, occluders);
}

/**
 * How lit a point is: 1 within some light's bright reach, 0.5 within dim reach only, and never
 * below the global illumination.
 */
export function lightLevelAt(scene: VisionScene, x: number, y: number, ignoreShadowCasters = false, pz = 0): number {
  let level = clamp01(scene.globalIllumination);
  for (const light of scene.lights) {
    if (!lightReaches(scene, light, x, y, ignoreShadowCasters, pz)) continue;
    const contribution = Math.hypot(x - light.x, y - light.y, pz - light.z) <= light.brightPx ? 1 : 0.5;
    if (contribution > level) level = contribution;
  }
  return shadedLevel(scene, x, y, level);
}

/** Whether a patch covers a point, counted from its top left corner as everything on a table is. */
function coversPoint(patch: SceneBrightness, x: number, y: number): boolean {
  return x >= patch.x && y >= patch.y && x < patch.x + patch.widthPx && y < patch.y + patch.heightPx;
}

/**
 * The light on a point once the patches laid over it have had their say.
 *
 * What brightens sets a floor and what darkens sets a ceiling, and the ceiling is put on last:
 * a pool of magical darkness under a lamp, or over a shaft of daylight, is dark.
 */
function shadedLevel(scene: VisionScene, x: number, y: number, lit: number): number {
  const patches = scene.brightAreas;
  if (!patches || patches.length < 1) return lit;
  let level = lit;
  let ceiling = 1;
  for (const patch of patches) {
    if (!coversPoint(patch, x, y)) continue;
    if (patch.snuffs) ceiling = Math.min(ceiling, patch.level);
    else if (patch.level > level) level = patch.level;
  }
  return Math.min(level, ceiling);
}

/**
 * Whether the light on a point has been put out by something laid over it.
 *
 * Asked apart from the rest of the light because it holds on a table with no dark on it at
 * all: a pool of magical darkness in a lit room is the one piece of night on the board.
 */
export function isSnuffed(scene: VisionScene, x: number, y: number): boolean {
  const patches = scene.brightAreas;
  if (!patches || patches.length < 1) return false;
  return patches.some((patch) => patch.snuffs && patch.level <= 0 && coversPoint(patch, x, y));
}

/** Whether any light, or the global illumination, lights a point at all. */
export function isLit(scene: VisionScene, x: number, y: number, ignoreShadowCasters = false, pz = 0): boolean {
  return lightLevelAt(scene, x, y, ignoreShadowCasters, pz) > 0;
}
