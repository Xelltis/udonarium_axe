import type { Solid, SolidFrame } from '@axe/domain/tabletop/solid/solid';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/** How many points a round edge is told by, enough for its outline to read as round. */
const ROUND_POINTS = 24;
/** How many rings of points a sphere is told by between its poles. */
const SPHERE_RINGS = 7;

/**
 * Points of a solid's outside, enough that the outline round where they are drawn is the outline of
 * the solid as it is drawn: the corners of its flat faces and points round its round edges.
 */
export function solidSamplePoints(solid: Solid): Vec3[] {
  switch (solid.kind) {
    case 'sphere': {
      const { centre, radius } = solid;
      const points: Vec3[] = [
        { x: centre.x, y: centre.y, z: centre.z + radius },
        { x: centre.x, y: centre.y, z: centre.z - radius },
      ];
      for (let ring = 1; ring <= SPHERE_RINGS; ring++) {
        const tilt = Math.PI * (ring / (SPHERE_RINGS + 1) - 0.5);
        const across = Math.cos(tilt) * radius;
        const up = Math.sin(tilt) * radius;
        for (let i = 0; i < ROUND_POINTS; i++) {
          const turn = (i / ROUND_POINTS) * Math.PI * 2;
          points.push({
            x: centre.x + Math.cos(turn) * across,
            y: centre.y + Math.sin(turn) * across,
            z: centre.z + up,
          });
        }
      }
      return points;
    }
    case 'column': {
      const points: Vec3[] = [];
      for (const part of solid.parts) {
        const corners =
          part.kind === 'polygon'
            ? part.corners
            : Array.from({ length: ROUND_POINTS }, (_, i) => {
                const turn = (i / ROUND_POINTS) * Math.PI * 2;
                return {
                  x: part.centre.x + Math.cos(turn) * part.radius,
                  y: part.centre.y + Math.sin(turn) * part.radius,
                };
              });
        for (const corner of corners) {
          points.push({ x: corner.x, y: corner.y, z: solid.bottom }, { x: corner.x, y: corner.y, z: solid.top });
        }
      }
      return points;
    }
    case 'cone': {
      const end = along(solid.apex, solid.frame.way, solid.length);
      return [solid.apex, ...ring(end, solid.frame, solid.endRadius)];
    }
    case 'beam': {
      const end = along(solid.start, solid.frame.way, solid.length);
      const points: Vec3[] = [];
      for (const from of [solid.start, end]) {
        for (const [side, lift] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          points.push(
            along(along(from, solid.frame.side, side * solid.halfWidth), solid.frame.lift, lift * solid.halfWidth)
          );
        }
      }
      return points;
    }
  }
}

/** The point so far from another along a way. */
export function along(point: Vec3, way: Vec3, distance: number): Vec3 {
  return { x: point.x + way.x * distance, y: point.y + way.y * distance, z: point.z + way.z * distance };
}

/** Points round a circle about a point, square to the way a frame points. */
function ring(centre: Vec3, frame: SolidFrame, radius: number): Vec3[] {
  return Array.from({ length: ROUND_POINTS }, (_, i) => {
    const turn = (i / ROUND_POINTS) * Math.PI * 2;
    return along(along(centre, frame.side, Math.cos(turn) * radius), frame.lift, Math.sin(turn) * radius);
  });
}
