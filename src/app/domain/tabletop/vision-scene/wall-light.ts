import { Point, Segment } from '@axe/domain/tabletop/los/segments';
import { lightReaches, occludersFor } from '@axe/domain/tabletop/vision-scene/light-reach';
import { withinCone } from '@axe/domain/tabletop/vision-scene/light-shape';
import {
  LightSegment,
  SceneLight,
  VisionScene,
  WallFace,
  WallLight,
  WallSilhouette,
} from '@axe/domain/tabletop/vision-scene/scene-model';

const WALL_FACE_OFFSET_PX = 0.5;
const WALL_LIGHT_SAMPLE_STEP_PX = 12;
const WALL_LIGHT_MIN_SAMPLES = 9;
const WALL_LIGHT_MAX_SAMPLES = 49;
const WALL_LIGHT_EDGE_STEPS = 5;
const WALL_LIGHT_EDGE_JUMP_PX = 2;
const WALL_LIGHT_FLAT_PX = 0.5;

/**
 * The shadows pieces throw onto one wall face, one for each light and piece in front of the face.
 *
 * A shadow is left out when the light does not reach the piece, or when the wall is already in
 * shade that high at that spot.
 */
export function computeWallSilhouettes(scene: VisionScene, face: WallFace, casterHeightPx: number): WallSilhouette[] {
  const result: WallSilhouette[] = [];
  const dax = face.bx - face.ax;
  const day = face.by - face.ay;
  const len = Math.hypot(dax, day);
  if (len < 1) return result;
  const ux = dax / len;
  const uy = day / len;

  for (const light of scene.lights) {
    if ((light.x - face.ax) * face.nx + (light.y - face.ay) * face.ny <= 0) continue;
    let occluders: LightSegment[] | null = null;
    for (const caster of scene.shadowCasters) {
      if (caster.ownerId === light.sourceId) continue;
      if ((caster.x - face.ax) * face.nx + (caster.y - face.ay) * face.ny <= 0) continue;
      const toLight = Math.hypot(light.x - caster.x, light.y - caster.y);
      let lx = caster.x;
      let ly = caster.y;
      if (toLight > caster.radiusPx) {
        const u = caster.radiusPx / toLight;
        lx = caster.x + (light.x - caster.x) * u;
        ly = caster.y + (light.y - caster.y) * u;
      }
      if (!lightReaches(scene, light, lx, ly, true)) continue;

      const dx = caster.x - light.x;
      const dy = caster.y - light.y;
      const denom = dx * day - dy * dax;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((face.ax - light.x) * day - (face.ay - light.y) * dax) / denom;
      const s = ((face.ax - light.x) * dy - (face.ay - light.y) * dx) / denom;
      if (t <= 1) continue;

      const width = caster.radiusPx * 2 * t;
      const center = s * len;
      if (center + width / 2 <= 0 || center - width / 2 >= len) continue;
      const height = Math.min(casterHeightPx * t, face.heightPx);
      occluders ??= nearbyOccluders(occludersFor(scene, light, true), light, face);
      const at = Math.min(Math.max(center, 0), len);
      if (shadeHeightAt(light, face, occluders, ux, uy, at) >= height) continue;
      result.push({ localX: center, width, height, alpha: 0.75, imageUrl: caster.imageUrl });
    }
  }
  return result;
}

function crossingParam(ax: number, ay: number, bx: number, by: number, seg: Segment): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const sdx = seg.x2 - seg.x1;
  const sdy = seg.y2 - seg.y1;
  const denom = dx * sdy - dy * sdx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((seg.x1 - ax) * sdy - (seg.y1 - ay) * sdx) / denom;
  const u = ((seg.x1 - ax) * dy - (seg.y1 - ay) * dx) / denom;
  if (t <= 1e-9 || t >= 1 || u < 0 || u > 1) return null;
  return t;
}

/**
 * How high the shade reaches on the face, where the light stands at `along`.
 *
 * A ray from the light to a point on the face climbs as the point does, so what it clears
 * is a matter of how tall the thing in the way is: a low wall shades only the foot of a
 * tall one behind it.
 */
function shadeHeightAt(
  light: SceneLight,
  face: WallFace,
  occluders: readonly LightSegment[],
  ux: number,
  uy: number,
  along: number
): number {
  const x = face.ax + ux * along + face.nx * WALL_FACE_OFFSET_PX;
  const y = face.ay + uy * along + face.ny * WALL_FACE_OFFSET_PX;
  if (Math.hypot(x - light.x, y - light.y, light.z) > light.dimPx) return Infinity;
  if (!withinCone(light, x, y)) return Infinity;
  let shade = 0;
  for (const seg of occluders) {
    const t = crossingParam(light.x, light.y, x, y, seg);
    if (t === null) continue;
    if (seg.heightPx === undefined) return Infinity;
    const reached = light.z + (seg.heightPx - light.z) / t;
    if (reached > shade) shade = reached;
  }
  return shade;
}

function nearbyOccluders(occluders: readonly LightSegment[], light: SceneLight, face: WallFace): LightSegment[] {
  const minX = Math.min(light.x, face.ax, face.bx);
  const maxX = Math.max(light.x, face.ax, face.bx);
  const minY = Math.min(light.y, face.ay, face.by);
  const maxY = Math.max(light.y, face.ay, face.by);
  return occluders.filter(
    (s) =>
      Math.min(s.x1, s.x2) <= maxX &&
      Math.max(s.x1, s.x2) >= minX &&
      Math.min(s.y1, s.y2) <= maxY &&
      Math.max(s.y1, s.y2) >= minY
  );
}

function litFootAt(
  light: SceneLight,
  face: WallFace,
  occluders: readonly LightSegment[],
  ux: number,
  uy: number,
  along: number
): number {
  const shade = shadeHeightAt(light, face, occluders, ux, uy, along);
  if (!(shade > 0)) return face.heightPx;
  if (!(shade < face.heightPx)) return 0;
  return face.heightPx - shade;
}

function pruneFlat(line: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of line) {
    while (kept.length >= 2) {
      const a = kept[kept.length - 2];
      const b = kept[kept.length - 1];
      const span = point.x - a.x;
      const between = span > 1e-9 ? a.y + ((point.y - a.y) * (b.x - a.x)) / span : b.y;
      if (Math.abs(between - b.y) > WALL_LIGHT_FLAT_PX) break;
      kept.pop();
    }
    kept.push(point);
  }
  return kept;
}

/**
 * The foot of the lit part of the face, followed across the stretch the pool covers.
 *
 * Asking only where the light stands square to the face answers for a point that can sit off
 * the end of it, so a wall around the corner would be lit through whatever hides it.
 */
function faceShadowLine(
  light: SceneLight,
  face: WallFace,
  occluders: readonly LightSegment[],
  ux: number,
  uy: number,
  from: number,
  to: number
): Point[] {
  const count = Math.min(
    WALL_LIGHT_MAX_SAMPLES,
    Math.max(WALL_LIGHT_MIN_SAMPLES, Math.ceil((to - from) / WALL_LIGHT_SAMPLE_STEP_PX) + 1)
  );
  const line: Point[] = [];
  let previous = { x: from, y: 0 };
  for (let i = 0; i < count; i++) {
    const at = from + ((to - from) * i) / (count - 1);
    const point = { x: at, y: litFootAt(light, face, occluders, ux, uy, at) };
    if (i > 0 && Math.abs(point.y - previous.y) > WALL_LIGHT_EDGE_JUMP_PX) {
      let low = previous;
      let high = point;
      for (let step = 0; step < WALL_LIGHT_EDGE_STEPS; step++) {
        const mid = (low.x + high.x) / 2;
        const y = litFootAt(light, face, occluders, ux, uy, mid);
        if (Math.abs(y - low.y) < Math.abs(y - high.y)) low = { x: mid, y };
        else high = { x: mid, y };
      }
      line.push(low, high);
    }
    line.push(point);
    previous = point;
  }
  return pruneFlat(line);
}

/**
 * The pools of light falling on one wall face, one for each light in front of it and near enough to
 * reach it.
 *
 * Where something in the way shades part of the face, the pool carries the line along the face at
 * which the lit part begins.
 */
export function computeWallLights(scene: VisionScene, face: WallFace): WallLight[] {
  const result: WallLight[] = [];
  const dax = face.bx - face.ax;
  const day = face.by - face.ay;
  const len = Math.hypot(dax, day);
  if (len < 1) return result;
  const ux = dax / len;
  const uy = day / len;

  for (const light of scene.lights) {
    const rel = (light.x - face.ax) * face.nx + (light.y - face.ay) * face.ny;
    if (rel <= 0 || rel > light.dimPx) continue;
    const half = Math.sqrt(Math.max(0, light.dimPx * light.dimPx - rel * rel));
    if (half < 1) continue;
    const along = (light.x - face.ax) * ux + (light.y - face.ay) * uy;
    const from = Math.max(0, along - half);
    const to = Math.min(len, along + half);
    if (to - from < 1) continue;

    const occluders = nearbyOccluders(occludersFor(scene, light, true), light, face);
    const line = faceShadowLine(light, face, occluders, ux, uy, from, to);
    if (line.every((point) => point.y <= 0)) continue;
    const pool: WallLight = {
      localX: along,
      localY: face.heightPx - light.z,
      radiusX: half,
      radiusY: half,
      color: light.color,
      intensity: rel <= light.brightPx ? 1 : 0.6,
    };
    result.push(line.every((point) => point.y >= face.heightPx) ? pool : { ...pool, shadow: line });
  }
  return result;
}
