import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { LightBeam, LightGlow, SceneLight } from '@axe/domain/tabletop/vision-scene/scene-model';
import { VisionType } from '@axe/domain/tabletop/vision-types';

const BEAM_FIN_COUNT = 3;
const GLOW_MAX_RADIUS_PX = 450;

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * The unit vector a light points along, from its direction across the table and its pitch up or
 * down.
 */
export function lightAxis(light: SceneLight): { x: number; y: number; z: number } {
  const dir = (light.direction * Math.PI) / 180;
  const pit = (light.pitch * Math.PI) / 180;
  const cp = Math.cos(pit);
  return { x: Math.cos(dir) * cp, y: Math.sin(dir) * cp, z: Math.sin(pit) };
}

/**
 * How far a light carries across a level surface, once the climb down to it is paid for.
 *
 * `planeZ` is the height of the surface being lit, which is the ground for most of a table and
 * the top of a wall for whatever has climbed onto one. A lamp hung level with a walkway reaches
 * along it, and reading that walkway against the pool on the ground far below said otherwise.
 */
export function floorRadii(light: SceneLight, planeZ = 0): { brightFloor: number; dimFloor: number } {
  const drop = light.z - planeZ;
  const z2 = drop * drop;
  return {
    brightFloor: Math.sqrt(Math.max(0, light.brightPx * light.brightPx - z2)),
    dimFloor: Math.sqrt(Math.max(0, light.dimPx * light.dimPx - z2)),
  };
}

/**
 * Where a light lands on the floor, and how far it carries once it is there.
 *
 * The floor and the things standing on it both read the pool from here. Measuring a block by
 * the plain distance through the air instead would light it apart from the floor: a lamp hung
 * on a wall is nearer to the block beside it than to the floor below, so the block would be
 * lit over a floor left dark.
 */
export function lightFloorPool(
  light: SceneLight,
  planeZ = 0
): { cx: number; cy: number; brightPx: number; dimPx: number } | null {
  const { brightFloor, dimFloor } = floorRadii(light, planeZ);
  if (dimFloor < 1) return null;
  if (light.angle >= 360) return { cx: light.x, cy: light.y, brightPx: brightFloor, dimPx: dimFloor };

  // A wide cone reaches a surface whichever way its axis is turned: what settles it is the ray
  // on that side of the spread. The floor below is reached by the lowest ray, which is the axis
  // tilted down by half of it; a roof above by the highest, tilted up by the same.
  const above = planeZ > light.z;
  if (above ? light.pitch + light.angle / 2 <= 0 : light.pitch >= light.angle / 2) return null;
  const axis = lightAxis(light);
  // Where the axis meets the surface, when it meets it in front of the light; otherwise the
  // pool lies about the spot below the lamp, which is where a sconce throws it.
  const towards = above ? axis.z > 0.05 : axis.z < -0.05;
  const t = towards ? -(light.z - planeZ) / axis.z : 0;
  const ratio = light.dimPx > 0 ? light.brightPx / light.dimPx : 1;
  return {
    cx: light.x + axis.x * t,
    cy: light.y + axis.y * t,
    brightPx: dimFloor * ratio,
    dimPx: dimFloor,
  };
}

/**
 * The shape of the visible beam of a cone light, or null for an all-round light or a beam too short
 * to draw.
 *
 * A beam turned down stops at the floor. It is drawn as three crossed fins about its axis, each
 * given as a CSS 3D transform.
 */
export function computeLightBeam(light: SceneLight): LightBeam | null {
  if (light.angle >= 360) return null;
  const axis = lightAxis(light);
  const half = (light.angle * Math.PI) / 360;
  const tanHalf = Math.tan(half);
  // A beam turned down is cut off where it meets the floor. Turned up or held level it meets
  // nothing, and runs the length the light carries.
  const toFloor = axis.z < -0.05 ? -light.z / axis.z : Number.POSITIVE_INFINITY;
  const slant = Math.min(toFloor, light.dimPx);
  if (slant < 1) return null;
  const height = slant;
  const width = Math.max(2 * slant * tanHalf, 1);
  let ux = axis.y;
  let uy = -axis.x;
  let uz = 0;
  let ulen = Math.hypot(ux, uy, uz);
  if (ulen < 1e-6) {
    ux = 1;
    uy = 0;
    uz = 0;
    ulen = 1;
  }
  ux /= ulen;
  uy /= ulen;
  uz /= ulen;
  const vx = axis.y * uz - axis.z * uy;
  const vy = axis.z * ux - axis.x * uz;
  const vz = axis.x * uy - axis.y * ux;
  const fins: string[] = [];
  for (let k = 0; k < BEAM_FIN_COUNT; k++) {
    const beta = (k / BEAM_FIN_COUNT) * Math.PI;
    const cb = Math.cos(beta);
    const sb = Math.sin(beta);
    const px = ux * cb + vx * sb;
    const py = uy * cb + vy * sb;
    const pz = uz * cb + vz * sb;
    const nx = py * axis.z - pz * axis.y;
    const ny = pz * axis.x - px * axis.z;
    const nz = px * axis.y - py * axis.x;
    const tx = light.x - px * (width / 2);
    const ty = light.y - py * (width / 2);
    const tz = light.z - pz * (width / 2);
    fins.push(`matrix3d(${px},${py},${pz},0,${axis.x},${axis.y},${axis.z},0,${nx},${ny},${nz},0,${tx},${ty},${tz},1)`);
  }
  return {
    width,
    height,
    clip: 'polygon(50% 0%, 0% 100%, 100% 100%)',
    color: light.color,
    fins,
    origin: { x: light.x, y: light.y, z: light.z },
  };
}

/**
 * The glow drawn at an all-round light itself, or null for a cone, a light with no reach, or one
 * whose bright radius is too large for a glow.
 *
 * On a wall the glow carries a transform that lays it flat against that wall.
 */
export function computeLightGlow(light: SceneLight, gridSize: number): LightGlow | null {
  if (light.angle < 360 || light.dimPx < 1 || light.brightPx > GLOW_MAX_RADIUS_PX) return null;
  const r = Math.min(gridSize, Math.max(0.4 * gridSize, light.brightPx * 0.3));
  const size = 2 * r;
  if (light.surface === 'floor') {
    return { x: light.x, y: light.y, z: light.z, size, color: light.color, transform: null };
  }
  const f = surfaceFrame(light.surface, { widthPx: 0, depthPx: 0, wallHeightPx: 0 });
  const tx = light.x - f.u.x * r - f.v.x * r;
  const ty = light.y - f.u.y * r - f.v.y * r;
  const tz = light.z - f.u.z * r - f.v.z * r;
  const transform =
    `matrix3d(${f.u.x},${f.u.y},${f.u.z},0,${f.v.x},${f.v.y},${f.v.z},0,` +
    `${f.normal.x},${f.normal.y},${f.normal.z},0,${tx},${ty},${tz},1)`;
  return { x: light.x, y: light.y, z: light.z, size, color: light.color, transform };
}

/**
 * Whether a point lies within a light's cone, in three dimensions. An all-round light holds
 * everything.
 */
export function withinCone(light: SceneLight, x: number, y: number, pz = 0): boolean {
  if (light.angle >= 360) return true;
  const vx = x - light.x;
  const vy = y - light.y;
  const vz = pz - light.z;
  const len = Math.hypot(vx, vy, vz);
  if (len < 1e-9) return true;
  const axis = lightAxis(light);
  const dot = (vx * axis.x + vy * axis.y + vz * axis.z) / len;
  return dot >= Math.cos((light.angle * Math.PI) / 360);
}

/** Whether a vision type sees without light: darkvision, truesight and thermal do. */
export function seesInDark(type: VisionType): boolean {
  return type === VisionType.DARKVISION || type === VisionType.TRUESIGHT || type === VisionType.THERMAL;
}
