import { GridType } from '@axe/domain/tabletop/grid-type';
import { computeLitCells } from '@axe/domain/tabletop/lit-cells';
import { Point, segmentClear, segmentsAbove } from '@axe/domain/tabletop/los/segments';
import { computeVisibilityPolygon } from '@axe/domain/tabletop/los/visibility-polygon';
import { cullSegments, occludersOf } from '@axe/domain/tabletop/vision-scene/light-reach';
import {
  clamp01,
  floorRadii,
  lightFloorPool,
  seesInDark,
  withinCone,
} from '@axe/domain/tabletop/vision-scene/light-shape';
import {
  OverlayPlan,
  OverlayShape,
  OverlayVision,
  SceneLight,
  SceneViewer,
  ShadowShape,
  VisionScene,
} from '@axe/domain/tabletop/vision-scene/scene-model';
import { ownedSources } from '@axe/domain/tabletop/vision-scene/viewer';
import { darknessAlphaFor } from '@axe/domain/tabletop/vision-scene/visibility';
import { maxLobeScale } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

const LIGHT_SAMPLE_COUNT = 64;
const VISION_SAMPLE_COUNT = 64;
const THERMAL_COLOR = '#ff5a1e';
const SHADOW_SPREAD = 2.2;
const TWO_PI = Math.PI * 2;

function lightClipPolygon(scene: VisionScene, light: SceneLight, radius: number = light.dimPx): Point[] | undefined {
  const occluders = occludersOf(scene, light, true).overhead;
  if (occluders.length === 0) return undefined;
  return computeVisibilityPolygon(light.x, light.y, occluders, radius, LIGHT_SAMPLE_COUNT);
}

function coneFloorFootprint(
  scene: VisionScene,
  light: SceneLight
): { cx: number; cy: number; maxR: number; points: Point[] } | null {
  const pool = lightFloorPool(light);
  if (!pool) return null;
  const { cx, cy } = pool;
  // The pool can sit off to one side of the light, so the box has to hold both.
  const occluders = cullSegments(
    occludersOf(scene, light, true).overhead,
    Math.min(light.x, cx - light.dimPx),
    Math.min(light.y, cy - light.dimPx),
    Math.max(light.x, cx + light.dimPx),
    Math.max(light.y, cy + light.dimPx)
  );
  const points: Point[] = [];
  let maxR = 0;
  for (let i = 0; i < LIGHT_SAMPLE_COUNT; i++) {
    const a = (i / LIGHT_SAMPLE_COUNT) * TWO_PI;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let lo = 0;
    let hi = light.dimPx;
    for (let it = 0; it < 16; it++) {
      const mid = (lo + hi) / 2;
      const px = cx + dx * mid;
      const py = cy + dy * mid;
      const inCone = withinCone(light, px, py, 0);
      const inReach = Math.hypot(px - light.x, py - light.y, light.z) <= light.dimPx;
      const clear = occluders.length === 0 || segmentClear(light.x, light.y, px, py, occluders);
      if (inCone && inReach && clear) lo = mid;
      else hi = mid;
    }
    points.push({ x: cx + dx * lo, y: cy + dy * lo });
    if (lo > maxR) maxR = lo;
  }
  if (maxR < 1) return null;
  return { cx, cy, maxR, points };
}

function lightOverlayShape(scene: VisionScene, light: SceneLight): OverlayShape | null {
  if (light.angle < 360) {
    const fp = coneFloorFootprint(scene, light);
    if (!fp) return null;
    const ratio = light.dimPx > 0 ? light.brightPx / light.dimPx : 1;
    return {
      x: fp.cx,
      y: fp.cy,
      brightPx: fp.maxR * ratio,
      dimPx: fp.maxR,
      angle: 360,
      direction: 0,
      color: light.color,
      full: false,
      clipPolygon: fp.points,
      animation: light.animation,
    };
  }
  const { brightFloor, dimFloor } = floorRadii(light);
  if (dimFloor < 1) return null;
  return {
    x: light.x,
    y: light.y,
    brightPx: brightFloor,
    dimPx: dimFloor,
    angle: 360,
    direction: 0,
    color: light.color,
    full: false,
    clipPolygon: lightClipPolygon(scene, light, dimFloor),
    animation: light.animation,
  };
}

function addLightShadows(
  scene: VisionScene,
  light: SceneLight,
  clipPolygon: Point[] | undefined,
  shadows: ShadowShape[]
): void {
  for (const caster of scene.shadowCasters) {
    if (caster.ownerId === light.sourceId) continue;
    const dx = caster.x - light.x;
    const dy = caster.y - light.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1 || dist - caster.radiusPx > light.dimPx) continue;
    if (!withinCone(light, caster.x, caster.y)) continue;
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy;
    const py = ux;
    const len = Math.max(caster.radiusPx * 2, light.dimPx - dist);
    const nearR = caster.radiusPx;
    const farR = caster.radiusPx * SHADOW_SPREAD;
    const fx = caster.x + ux * len;
    const fy = caster.y + uy * len;
    shadows.push({
      x: caster.x,
      y: caster.y,
      fx,
      fy,
      width: caster.radiusPx * 2,
      color: scene.ambientColor,
      imageUrl: caster.imageUrl,
      points: [
        { x: caster.x + px * nearR, y: caster.y + py * nearR },
        { x: fx + px * farR, y: fy + py * farR },
        { x: fx - px * farR, y: fy - py * farR },
        { x: caster.x - px * nearR, y: caster.y - py * nearR },
      ],
      clipPolygon,
    });
  }
}

/**
 * Everything the darkness overlay draws for one viewer: the darkness, the pool each light reveals
 * with its glow and the shadows pieces cast in it, and the reach of the viewer's own dark-seeing
 * pieces.
 *
 * The game master's plan leaves out that sight, since the game master sees everything. When the
 * scene snaps light to the grid, the lit cells are included too.
 */
export function computeOverlayPlan(scene: VisionScene, viewer: SceneViewer, vision?: OverlayVision): OverlayPlan {
  const glows: OverlayShape[] = [];
  const reveals: OverlayShape[] = [];
  const shadows: ShadowShape[] = [];
  const isGm = viewer.isGameMaster;
  const global = clamp01(scene.globalIllumination);

  for (const light of scene.lights) {
    const shape = lightOverlayShape(scene, light);
    if (!shape) continue;
    reveals.push(shape);
    glows.push(shape);
    if (light.castShadows) addLightShadows(scene, light, shape.clipPolygon, shadows);
  }

  if (!isGm) {
    for (const source of ownedSources(scene, viewer)) {
      if (!seesInDark(source.type) || source.rangePx <= 0) continue;
      const reach = source.rangePx * maxLobeScale(source.lobes);
      if (reach < 1) continue;
      const clipPolygon =
        source.type === VisionType.TRUESIGHT
          ? undefined
          : computeVisibilityPolygon(
              source.x,
              source.y,
              segmentsAbove(scene.sightSegments, source.z),
              reach,
              VISION_SAMPLE_COUNT
            );
      for (const lobe of source.lobes) {
        const radius = source.rangePx * lobe.rangeScale;
        if (radius < 1) continue;
        const shape: OverlayShape = {
          x: source.x,
          y: source.y,
          brightPx: radius,
          dimPx: radius,
          angle: lobe.angle,
          direction: source.direction + lobe.direction,
          color: scene.ambientColor,
          full: true,
          clipPolygon,
        };
        reveals.push(shape);
        if (source.type === VisionType.THERMAL) glows.push({ ...shape, color: THERMAL_COLOR, full: false });
      }
    }
  }

  return {
    darknessAlpha: darknessAlphaFor(scene, viewer),
    darknessColor: scene.ambientColor,
    baseRevealAlpha: global,
    reveals,
    revealCells: scene.snapLightToGrid
      ? computeLitCells(reveals, scene.gridSize, scene.gridType ?? GridType.SQUARE, {
          widthPx: scene.widthPx,
          heightPx: scene.heightPx,
        })
      : [],
    glows,
    shadows,
    vision,
  };
}
