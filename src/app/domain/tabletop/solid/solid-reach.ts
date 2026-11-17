import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/**
 * Where a solid range may be put round the piece casting it: every point within its radius of the
 * middle, down to the floor and no lower. On the ground the floor is the middle's own height and
 * the room is a dome; a caster up in the air keeps the room below it down to the ground.
 */
export interface SolidReach {
  readonly centre: Vec3;
  readonly radius: number;
  readonly floorZ: number;
}

/** Which way a cone or a beam points, in degrees: clockwise from east, and up from level. */
export interface SolidAim {
  readonly yaw: number;
  readonly pitch: number;
}

/** The step the tipping of a cone or a beam keeps to while Alt is held, in degrees. */
export const PITCH_SNAP_DEGREES = 15;

/**
 * The point brought within reach: put no lower than the floor, then drawn in along the line to the
 * middle as far as it reaches past the radius, so that one pulled past the edge slides round the
 * outside of the dome. One the floor still cuts off is set on it, as far out as the dome reaches there.
 */
export function clampIntoReach(point: Vec3, reach: SolidReach): Vec3 {
  const { centre } = reach;
  const radius = Math.max(0, Number.isFinite(reach.radius) ? reach.radius : 0);
  if (radius === 0) return { ...centre, z: Math.max(centre.z, reach.floorZ) };
  const raised = { x: point.x, y: point.y, z: Math.max(point.z, reach.floorZ) };
  const dx = raised.x - centre.x;
  const dy = raised.y - centre.y;
  const dz = raised.z - centre.z;
  const distance = Math.hypot(dx, dy, dz);
  const scale = distance > radius ? radius / distance : 1;
  const drawn = { x: centre.x + dx * scale, y: centre.y + dy * scale, z: centre.z + dz * scale };
  if (drawn.z >= reach.floorZ) return drawn;
  const rise = reach.floorZ - centre.z;
  const across = Math.sqrt(Math.max(0, radius * radius - rise * rise));
  const level = Math.hypot(drawn.x - centre.x, drawn.y - centre.y);
  const pull = level > across ? across / level : 1;
  return {
    x: centre.x + (drawn.x - centre.x) * pull,
    y: centre.y + (drawn.y - centre.y) * pull,
    z: reach.floorZ,
  };
}

/** Whether a point lies within reach, its edge included. */
export function withinReach(point: Vec3, reach: SolidReach): boolean {
  const near = clampIntoReach(point, reach);
  return Math.hypot(near.x - point.x, near.y - point.y, near.z - point.z) <= 1e-6;
}

/** The way from one point to another, or null where the two are the same point. */
export function aimOf(from: Vec3, to: Vec3): SolidAim | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const level = Math.hypot(dx, dy);
  if (level < 1e-9 && Math.abs(dz) < 1e-9) return null;
  const yaw = level < 1e-9 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
  return { yaw: normalizeDegrees(yaw), pitch: (Math.atan2(dz, level) * 180) / Math.PI };
}

/** The point so far along a way from a point. */
export function aimedPoint(from: Vec3, aim: SolidAim, distance: number): Vec3 {
  const yaw = (aim.yaw * Math.PI) / 180;
  const pitch = (aim.pitch * Math.PI) / 180;
  const level = Math.cos(pitch) * distance;
  return {
    x: from.x + Math.cos(yaw) * level,
    y: from.y + Math.sin(yaw) * level,
    z: from.z + Math.sin(pitch) * distance,
  };
}

/** The way kept to the nearest steps of the turn and the tip, each step in degrees. */
export function snapAim(aim: SolidAim, yawStep: number, pitchStep: number = PITCH_SNAP_DEGREES): SolidAim {
  const snap = (value: number, step: number) => (step > 0 ? Math.round(value / step) * step : value);
  return {
    yaw: normalizeDegrees(snap(aim.yaw, yawStep)),
    pitch: Math.max(-90, Math.min(90, snap(aim.pitch, pitchStep))),
  };
}

/** An angle brought to between nought and a whole turn. */
function normalizeDegrees(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360;
  return turned === 0 ? 0 : turned;
}
