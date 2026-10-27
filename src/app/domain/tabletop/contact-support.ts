import { WorldBox } from '@axe/domain/tabletop/surface-space';
import { turnedBoxCovers } from '@axe/domain/tabletop/terrain-box';

export interface ContactFootprint {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bottomZ: number;
  topZ: number;
  /**
   * How far this is turned about its middle, in degrees, as a turned block is.
   *
   * The sides are then the ones it had before the turn, so a piece stands on the block where
   * it is drawn rather than where it would be lying square to the table.
   */
  rotate?: number;
  /** Whether a piece may come to rest on top of this. A sheer face may be stood beside, not on. */
  climbable?: boolean;
  /**
   * How high the top stands over one point, for something whose top is not level.
   *
   * A sloping block answers with the height of its surface there, so a piece dragged across it
   * follows the slope instead of riding along at the height of its highest corner.
   */
  topAt?: (x: number, y: number) => number;
  /** What this footprint belongs to, so a piece can keep to the surface it is already on. */
  identifier?: string;
}

export interface ContactRider {
  altitudePx: number;
  thicknessPx: number;
  ridesUp: boolean;
  restingZ: number;
  /** What the piece is resting on, whose surface it keeps to while that surface is under it. */
  restingOn?: string;
}

/** Where a dragged piece rests, and what it is resting on. */
export interface ContactSupport {
  z: number;
  on?: string;
}

const CONTACT_EPSILON_PX = 0.5;
const CONTACT_MIN_THICKNESS_PX = 1;

const FLAT_ON_THE_FLOOR: ContactRider = { altitudePx: 0, thicknessPx: 0, ridesUp: true, restingZ: 0 };

/**
 * Every height a piece centred at the given point could come to rest at, lowest first.
 *
 * The floor counts, as does the top of each climbable footprint under the centre. A level is
 * left out when the piece, at its own thickness, would push into something hanging above it.
 */
export function contactRestLevels(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): number[] {
  const under = footprintsUnder(footprints, centerX, centerY);
  const levels = new Set<number>();
  for (const level of contactLevels(under)) {
    if (riderFits(under, rider, level)) levels.add(level);
  }
  return [...levels].sort((a, b) => a - b);
}

/**
 * The rest level just above or just below `from`, for stepping a held piece up or down.
 *
 * Levels within half a pixel of `from` do not count as a step. Null when there is nothing
 * further in that direction.
 */
export function nextContactLevel(levels: readonly number[], from: number, isUp: boolean): number | null {
  if (isUp) {
    for (const level of levels) {
      if (level > from + CONTACT_EPSILON_PX) return level;
    }
    return null;
  }
  for (let i = levels.length - 1; i >= 0; i--) {
    if (levels[i] < from - CONTACT_EPSILON_PX) return levels[i];
  }
  return null;
}

/**
 * The height a piece dragged to the given point stands on.
 *
 * The piece takes the level nearest the height it is already at, so a low step is risen onto
 * while the ground stays the ground beside a wall, and one dragged off a block drops to what
 * is under it. Two levels equally near leave it on the lower one. With nothing under its
 * centre it takes the floor, and failing that the highest climbable top there.
 */
export function findContactSupportZ(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): number {
  return findContactSupport(footprints, centerX, centerY, rider).z;
}

/**
 * The same, together with what the piece came to rest on.
 *
 * A piece already resting on something keeps to that thing's surface while it is still under
 * it, rising as well as falling, so one dragged along a ramp walks up and down the ramp rather
 * than stepping off it into the air or onto the floor.
 */
export function findContactSupport(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): ContactSupport {
  const under = footprintsUnder(footprints, centerX, centerY);
  const stayingOn = under.find(
    (footprint) =>
      footprint.climbable !== false &&
      rider.restingOn !== undefined &&
      footprint.identifier === rider.restingOn &&
      riderFits(under, rider, footprint.topZ)
  );
  if (stayingOn) return { z: stayingOn.topZ, on: stayingOn.identifier };

  const levels = contactRestLevels(footprints, centerX, centerY, rider);
  const standingAt = contactBottomAt(rider, rider.restingZ);
  // A piece held above the ground reads that height as clearance rather than as a step it has
  // taken, so what it flies over is not something to come to rest on top of.
  const keepsClearance = rider.altitudePx > CONTACT_EPSILON_PX;
  let nearest: number | null = null;
  for (const level of levels) {
    if (keepsClearance && level > standingAt + CONTACT_EPSILON_PX) continue;
    // Levels come lowest first, so only a level nearer by more than a rounding takes over,
    // which leaves the lower of two equally near ones.
    if (nearest === null || Math.abs(level - standingAt) < Math.abs(nearest - standingAt) - CONTACT_EPSILON_PX) {
      nearest = level;
    }
  }
  if (nearest !== null) return { z: nearest, on: restingOnAt(under, nearest) };

  let highest = 0;
  for (const footprint of under) {
    if (footprint.climbable === false) continue;
    if (footprint.topZ > highest) highest = footprint.topZ;
  }
  return { z: highest, on: restingOnAt(under, highest) };
}

/** What holds a piece up at this height, of the things under it. */
function restingOnAt(under: readonly ContactFootprint[], level: number): string | undefined {
  for (const footprint of under) {
    if (footprint.climbable === false) continue;
    if (Math.abs(footprint.topZ - level) <= CONTACT_EPSILON_PX) return footprint.identifier;
  }
  return undefined;
}

function footprintsUnder(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number
): ContactFootprint[] {
  const under: ContactFootprint[] = [];
  for (const footprint of footprints) {
    if (!footprintCovers(footprint, centerX, centerY)) continue;
    under.push(footprint.topAt ? { ...footprint, topZ: footprint.topAt(centerX, centerY) } : footprint);
  }
  return under;
}

function footprintCovers(footprint: ContactFootprint, x: number, y: number): boolean {
  if (!footprint.rotate) {
    return x >= footprint.left && x <= footprint.right && y >= footprint.top && y <= footprint.bottom;
  }
  const box = { minX: footprint.left, minY: footprint.top, maxX: footprint.right, maxY: footprint.bottom };
  return turnedBoxCovers(box, footprint.rotate, x, y);
}

function contactLevels(under: readonly ContactFootprint[]): number[] {
  const levels = [0];
  for (const footprint of under) {
    if (footprint.climbable === false) continue;
    if (footprint.topZ > 0) levels.push(footprint.topZ);
  }
  return levels;
}

/**
 * Where the underside of a piece sits when it rests on `level`.
 *
 * A piece that rides up carries its altitude on top of what it stands on; one that does not,
 * such as terrain, keeps its own altitude unless the level is already higher.
 */
export function contactBottomAt(rider: Pick<ContactRider, 'altitudePx' | 'ridesUp'>, level: number): number {
  return rider.ridesUp ? level + rider.altitudePx : Math.max(rider.altitudePx, level);
}

function riderFits(under: readonly ContactFootprint[], rider: ContactRider, level: number): boolean {
  const bottom = contactBottomAt(rider, level);
  const top = bottom + Math.max(rider.thicknessPx, CONTACT_MIN_THICKNESS_PX);
  for (const footprint of under) {
    if (bottom >= footprint.topZ - CONTACT_EPSILON_PX) continue;
    if (top > footprint.bottomZ + CONTACT_EPSILON_PX) return false;
  }
  return true;
}

/**
 * The top-left corner and height at which a piece of the given size sits on top of a beam.
 *
 * The piece's centre is pulled inside the beam's footprint and it is laid on the beam's top.
 */
export function beamRestPosition(
  box: WorldBox,
  worldX: number,
  worldY: number,
  width: number,
  height: number
): { x: number; y: number; z: number } {
  const centerX = Math.min(box.maxX, Math.max(box.minX, worldX));
  const centerY = Math.min(box.maxY, Math.max(box.minY, worldY));
  return { x: Math.floor(centerX - width / 2), y: Math.floor(centerY - height / 2), z: box.maxZ };
}
