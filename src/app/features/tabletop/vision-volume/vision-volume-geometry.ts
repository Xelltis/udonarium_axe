import { VisionLobe } from '@axe/domain/tabletop/vision-shape';

export interface VisionVolumeInput {
  x: number;
  y: number;
  /** The ground under the piece, which is where the shape stands. */
  z: number;
  radiusPx: number;
  direction: number;
  lobes: readonly VisionLobe[];
}

export interface VolumeRing {
  radius: number;
  height: number;
  size: number;
  transform: string;
  clipPath: string | null;
}

export interface VolumeRib {
  bearing: number;
  size: number;
  transform: string;
}

export interface VolumeShape {
  rings: VolumeRing[];
  ribs: VolumeRib[];
}

/** How many circles are drawn from the ground to the crown, the ground itself included. */
export const VOLUME_RING_COUNT = 4;
/** The widest a lobe may go between one rib and the next. */
export const VOLUME_RIB_STEP_DEG = 60;
const SECTOR_STEP_DEG = 6;
const TAU = Math.PI * 2;

/**
 * Builds the rings and ribs that draw a piece's vision as a dome over the table.
 *
 * Each lobe adds rings stacked from the ground up to its reach, clipped to a sector when the lobe
 * is narrower than a full circle, and quarter-circle ribs spread across its span. A non-positive
 * radius, or a lobe reaching less than a pixel, draws nothing.
 */
export function visionVolumeShape(input: VisionVolumeInput): VolumeShape {
  const rings: VolumeRing[] = [];
  const ribs: VolumeRib[] = [];
  if (!(input.radiusPx > 0)) return { rings, ribs };

  for (const lobe of input.lobes) {
    const reach = input.radiusPx * lobe.rangeScale;
    if (reach < 1) continue;
    const facing = input.direction + lobe.direction;
    const clipPath = lobe.angle >= 360 ? null : sectorClipPath(facing, lobe.angle);

    for (let step = 0; step < VOLUME_RING_COUNT; step++) {
      const tilt = (step * (90 / VOLUME_RING_COUNT) * Math.PI) / 180;
      const radius = reach * Math.cos(tilt);
      if (radius < 1) continue;
      const height = reach * Math.sin(tilt);
      rings.push({
        radius,
        height,
        size: radius * 2,
        transform: `translate3d(${input.x - radius}px, ${input.y - radius}px, ${input.z + height}px)`,
        clipPath,
      });
    }

    for (const bearing of ribBearings(facing, lobe.angle)) {
      ribs.push({ bearing, size: reach, transform: ribTransform(input, reach, bearing) });
    }
  }
  return { rings, ribs };
}

function ribBearings(facing: number, angle: number): number[] {
  if (angle >= 360) {
    const bearings: number[] = [];
    for (let turn = 0; turn < 360; turn += VOLUME_RIB_STEP_DEG) bearings.push(facing + turn);
    return bearings;
  }
  const half = angle / 2;
  const spans = Math.max(1, Math.ceil(angle / VOLUME_RIB_STEP_DEG));
  const bearings: number[] = [];
  for (let i = 0; i <= spans; i++) bearings.push(facing - half + (angle * i) / spans);
  return bearings;
}

/**
 * A quarter circle standing up in the plane that holds the bearing.
 *
 * Its top left corner is the crown of the shape and its bottom left is the middle of it, so
 * the rounding of the top right corner is the arc from one to the other.
 */
function ribTransform(input: VisionVolumeInput, reach: number, bearingDeg: number): string {
  const bearing = (bearingDeg * Math.PI) / 180;
  const ux = Math.cos(bearing);
  const uy = Math.sin(bearing);
  return (
    `matrix3d(${ux},${uy},0,0,` + `0,0,-1,0,` + `${-uy},${ux},0,0,` + `${input.x},${input.y},${input.z + reach},1)`
  );
}

function sectorClipPath(facingDeg: number, angle: number): string {
  const half = (angle / 2) * (Math.PI / 180);
  const facing = (facingDeg * Math.PI) / 180;
  const steps = Math.max(2, Math.ceil(angle / SECTOR_STEP_DEG));
  const points = ['50% 50%'];
  for (let i = 0; i <= steps; i++) {
    const at = facing - half + (2 * half * i) / steps;
    const x = 50 + 50 * Math.cos(((at % TAU) + TAU) % TAU);
    const y = 50 + 50 * Math.sin(((at % TAU) + TAU) % TAU);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${points.join(', ')})`;
}
