import { FootprintInput, FootprintPart, rangeFootprint } from '@axe/domain/tabletop/solid/range-footprint';
import { SolidKind, solidKindOf } from '@axe/domain/tabletop/solid/solid-kind';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/**
 * Three ways from a point, each of length one: the way it points, level across it to its right as the
 * table is seen from above, and up across it.
 */
export interface SolidFrame {
  readonly way: Vec3;
  readonly side: Vec3;
  readonly lift: Vec3;
}

/**
 * A range stood up, in table pixels: x east, y south and z up off the table.
 *
 * - a column is the ground it covers raised straight up from its bottom to its top
 * - a sphere is every point within its radius of its middle
 * - a cone opens from its tip along the way it points, as far as its length, to a round end of its
 *   end radius
 * - a beam is a square bar from its start along the way it points, as long as its length and as wide
 *   each way across as twice its half width
 */
export type Solid =
  | {
      readonly kind: 'column';
      readonly parts: readonly FootprintPart[];
      readonly bottom: number;
      readonly top: number;
    }
  | { readonly kind: 'sphere'; readonly centre: Vec3; readonly radius: number }
  | {
      readonly kind: 'cone';
      readonly apex: Vec3;
      readonly frame: SolidFrame;
      readonly length: number;
      readonly endRadius: number;
    }
  | {
      readonly kind: 'beam';
      readonly start: Vec3;
      readonly frame: SolidFrame;
      readonly length: number;
      readonly halfWidth: number;
    };

/** What of a range it is stood up from. */
export interface SolidInput extends FootprintInput {
  /** What it stands up as; flat stands up as nothing. */
  readonly kind: SolidKind;
  /**
   * How high its point stands off the table, in table pixels: the bottom of a column, the middle of a
   * sphere, or the tip of a cone or a beam.
   */
  readonly originZ: number;
  /** How tall a column is, in the range's squares. */
  readonly height: number;
  /** How steeply a cone or a beam points up, in degrees: up is positive, and level is nought. */
  readonly pitch: number;
}

/** The shortest a range reaches, and the least a column is tall or a line or fan wide, in squares. */
const SHORTEST = 1;
const THINNEST = 0.1;

/**
 * The range stood up as its kind, or null for a flat range. A kind that does not fit the flat shape
 * stands up as a column, as {@link solidKindOf} reads it.
 */
export function solidOf(input: SolidInput): Solid | null {
  const kind = solidKindOf(input.kind, input.type);
  if (kind === '') return null;
  const sq = input.squarePx;
  const reach = atLeast(input.length, SHORTEST) * sq;
  const halfWidth = (atLeast(input.width, THINNEST) * sq) / 2;
  const origin: Vec3 = { x: input.origin.x, y: input.origin.y, z: finiteOr(input.originZ, 0) };
  switch (kind) {
    case 'sphere':
      return { kind, centre: origin, radius: reach };
    case 'cone':
      return { kind, apex: origin, frame: solidFrame(input.rotate, input.pitch), length: reach, endRadius: halfWidth };
    case 'beam':
      return { kind, start: origin, frame: solidFrame(input.rotate, input.pitch), length: reach, halfWidth };
    case 'column':
    default:
      return {
        kind: 'column',
        parts: rangeFootprint(input),
        bottom: origin.z,
        top: origin.z + atLeast(input.height, THINNEST) * sq,
      };
  }
}

/**
 * The ways from a point turned clockwise by `yawDegrees` as the table is seen from above, and tipped
 * up by `pitchDegrees`, which is held between straight down and straight up.
 */
export function solidFrame(yawDegrees: number, pitchDegrees: number): SolidFrame {
  const yaw = (finiteOr(yawDegrees, 0) * Math.PI) / 180;
  const pitch = (Math.max(-90, Math.min(90, finiteOr(pitchDegrees, 0))) * Math.PI) / 180;
  const level = Math.cos(pitch);
  const rise = Math.sin(pitch);
  const east = Math.cos(yaw);
  const south = Math.sin(yaw);
  return {
    way: { x: east * level, y: south * level, z: rise },
    side: { x: -south, y: east, z: 0 },
    lift: { x: -east * rise, y: -south * rise, z: level },
  };
}

/** The value where it is a number at least as large as the least, and the least otherwise. */
function atLeast(value: number, least: number): number {
  return Number.isFinite(value) && value >= least ? value : least;
}

function finiteOr(value: number, otherwise: number): number {
  return Number.isFinite(value) ? value : otherwise;
}
