import type { Point } from '@axe/domain/effect/scene/parts';

/*
 * The shapes the looks of space and time are laid out along: what turns about a piece or a point is
 * laid round a circle tipped from level, its far half drawn behind what it turns about and its near
 * half before it; and what is drawn across the eye, as a seam or an arc of bent light, is laid out on
 * the screen itself, the same from every side. What they are painted in is in `space-bold.ts`.
 */

/** A way across the screen, as `aside` takes it: to the right and up as the eye sees them. */
export interface Aside {
  readonly right: number;
  readonly up: number;
}

/** Points round an arc on the screen about a middle, from one turn to another, in radians, as `aside` takes them. */
export function screenArc(radius: number, from: number, to: number, steps: number, squash = 1): Aside[] {
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const turn = from + ((to - from) * index) / steps;
    return { right: Math.cos(turn) * radius, up: Math.sin(turn) * radius * squash };
  });
}

/**
 * Points round a circle about a middle, tipped from level by `tilt` about a level line headed
 * `heading`, from one turn to another, in radians.
 */
export function tippedCircle(
  middle: Point,
  radius: number,
  steps: number,
  tilt: number,
  heading: number,
  from = 0,
  to = Math.PI * 2
): Point[] {
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const cosHead = Math.cos(heading);
  const sinHead = Math.sin(heading);
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const turn = from + ((to - from) * index) / steps;
    const along = Math.cos(turn) * radius;
    const across = Math.sin(turn) * radius;
    const level = across * cosTilt;
    return {
      x: middle.x + along * cosHead - level * sinHead,
      y: middle.y + along * sinHead + level * cosHead,
      z: middle.z + across * sinTilt,
    };
  });
}

/** A number from 0 to 1 for a whole number and a salt, the same wherever it is asked. */
export function scatterOf(index: number, salt: number): number {
  const mixed = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return mixed - Math.floor(mixed);
}
