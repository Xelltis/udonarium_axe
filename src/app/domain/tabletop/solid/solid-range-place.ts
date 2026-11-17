import { isAimedSolid, SolidKind } from '@axe/domain/tabletop/solid/solid-kind';
import { clampIntoReach, SolidReach } from '@axe/domain/tabletop/solid/solid-reach';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/** Where the piece a solid range follows stands, in table pixels. */
export interface SolidCaster {
  /** The middle of its footprint. */
  readonly x: number;
  readonly y: number;
  /** How high its feet are, its own altitude included. */
  readonly footZ: number;
  /** How high what it stands on is, which is its feet unless it is up in the air. */
  readonly groundZ: number;
  /** How tall its body stands, which is as wide as it is. */
  readonly bodyPx: number;
}

/** What of a solid range and the piece it follows its place is worked out from, in table pixels. */
export interface SolidRangePlaceInput {
  readonly kind: SolidKind;
  /** Where the range stands: its point over the table, and how high the face under that point is. */
  readonly x: number;
  readonly y: number;
  readonly groundZ: number;
  /** How far the range is lifted off what it stands on, or off the feet of the piece it follows. */
  readonly altitudePx: number;
  /** The piece it follows, or null for none. */
  readonly caster: SolidCaster | null;
  /** How far round the piece a sphere or a column may be put. */
  readonly reachPx: number;
  /** How far a cone or a beam reaches, which is how far round its tip it may be pointed. */
  readonly lengthPx: number;
}

/**
 * Where a solid range stands, and the room round the piece it follows it may be moved or pointed in.
 *
 * - With no piece, its point stands over the face under it by its altitude, with no room round it.
 * - A cone or a beam following a piece starts from the middle of the piece's body, lifted by its
 *   altitude, and may point anywhere within its length of there down to the ground.
 * - A sphere or a column following a piece stands where it was put round it, at its altitude over the
 *   piece's feet, brought within the dome round the feet as far as it reaches.
 */
export function solidRangePlace(input: SolidRangePlaceInput): { origin: Vec3; reach: SolidReach | null } {
  const lift = Number.isFinite(input.altitudePx) ? input.altitudePx : 0;
  const caster = input.caster;
  if (!caster) return { origin: { x: input.x, y: input.y, z: input.groundZ + lift }, reach: null };
  if (isAimedSolid(input.kind)) {
    const origin = { x: caster.x, y: caster.y, z: caster.footZ + caster.bodyPx / 2 + lift };
    return { origin, reach: { centre: origin, radius: input.lengthPx, floorZ: caster.groundZ } };
  }
  const reach: SolidReach = {
    centre: { x: caster.x, y: caster.y, z: caster.footZ },
    radius: input.reachPx,
    floorZ: caster.groundZ,
  };
  return { origin: clampIntoReach({ x: input.x, y: input.y, z: caster.footZ + lift }, reach), reach };
}
