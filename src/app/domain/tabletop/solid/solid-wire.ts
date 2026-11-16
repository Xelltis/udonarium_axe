import type { FlatPoint, FootprintPart } from '@axe/domain/tabletop/solid/range-footprint';
import type { Solid } from '@axe/domain/tabletop/solid/solid';
import { along } from '@axe/domain/tabletop/solid/solid-points';
import type { SolidReach } from '@axe/domain/tabletop/solid/solid-reach';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/** A straight piece of line, from one point to another. */
export type WireSegment = readonly [Vec3, Vec3];

/** How many straight pieces a round line is drawn with. */
const ROUND_STEPS = 48;
/** How many lines run down the side of a cylinder and a cone, and over a sphere from pole to pole. */
const SIDE_LINES = 8;
/** The heights of the rings drawn round a sphere, as shares of the way from its middle to a pole. */
const SPHERE_RING_HEIGHTS = [-0.5, 0, 0.5];

/**
 * The lines a solid is drawn with, so that its shape reads at a glance however it is seen: the
 * edges of its flat faces, and round a round one rings and lines over it at even steps. A column of
 * several parts lying side by side is outlined round them all, with no lines between them.
 */
export function solidWireSegments(solid: Solid): WireSegment[] {
  switch (solid.kind) {
    case 'sphere':
      return sphereWire(solid.centre, solid.radius);
    case 'column':
      return columnWire(solid.parts, solid.bottom, solid.top);
    case 'cone': {
      const end = along(solid.apex, solid.frame.way, solid.length);
      const rim = ringAround(end, solid.frame.side, solid.frame.lift, solid.endRadius);
      const sides = Array.from({ length: SIDE_LINES }, (_, i): WireSegment => [
        solid.apex,
        rim[(i * ROUND_STEPS) / SIDE_LINES],
      ]);
      return [...loop(rim), ...sides];
    }
    case 'beam': {
      const end = along(solid.start, solid.frame.way, solid.length);
      const face = (from: Vec3) =>
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([side, lift]) =>
          along(along(from, solid.frame.side, side * solid.halfWidth), solid.frame.lift, lift * solid.halfWidth)
        );
      const near = face(solid.start);
      const far = face(end);
      return [...loop(near), ...loop(far), ...near.map((corner, i): WireSegment => [corner, far[i]])];
    }
  }
}

function sphereWire(centre: Vec3, radius: number): WireSegment[] {
  const segments: WireSegment[] = [];
  for (const height of SPHERE_RING_HEIGHTS) {
    const across = Math.sqrt(1 - height * height) * radius;
    segments.push(
      ...loop(
        ringAround({ ...centre, z: centre.z + height * radius }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, across)
      )
    );
  }
  for (let i = 0; i < SIDE_LINES / 2; i++) {
    const turn = (i / (SIDE_LINES / 2)) * Math.PI;
    segments.push(
      ...loop(ringAround(centre, { x: Math.cos(turn), y: Math.sin(turn), z: 0 }, { x: 0, y: 0, z: 1 }, radius))
    );
  }
  return segments;
}

/**
 * The outline of a column: round its parts at its bottom and its top, leaving out the edges two parts
 * share, and up its sides where the outline turns a corner, or at even steps round a round part.
 */
function columnWire(parts: readonly FootprintPart[], bottom: number, top: number): WireSegment[] {
  const segments: WireSegment[] = [];
  const polygons = parts.flatMap((part) => (part.kind === 'polygon' ? [part.corners] : []));
  const shared = sharedEdgeKeys(polygons);
  const outside: [FlatPoint, FlatPoint][] = [];
  for (const corners of polygons) {
    for (let i = 0; i < corners.length; i++) {
      const edge: [FlatPoint, FlatPoint] = [corners[i], corners[(i + 1) % corners.length]];
      if (!shared.has(edgeKey(edge[0], edge[1]))) outside.push(edge);
    }
  }
  for (const [a, b] of outside) {
    segments.push([at(a, bottom), at(b, bottom)], [at(a, top), at(b, top)]);
  }
  for (const corner of turningCorners(outside)) segments.push([at(corner, bottom), at(corner, top)]);
  for (const part of parts) {
    if (part.kind !== 'circle') continue;
    for (const z of [bottom, top]) {
      segments.push(
        ...loop(ringAround({ ...part.centre, z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, part.radius))
      );
    }
    for (let i = 0; i < SIDE_LINES; i++) {
      const turn = (i / SIDE_LINES) * Math.PI * 2;
      const point = {
        x: part.centre.x + Math.cos(turn) * part.radius,
        y: part.centre.y + Math.sin(turn) * part.radius,
      };
      segments.push([at(point, bottom), at(point, top)]);
    }
  }
  return segments;
}

/** The corners of an outline where it turns, rather than running on straight. */
function turningCorners(edges: readonly (readonly [FlatPoint, FlatPoint])[]): FlatPoint[] {
  const meeting = new Map<string, { point: FlatPoint; ways: { x: number; y: number }[] }>();
  for (const [a, b] of edges) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const key = pointKey(from);
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const entry = meeting.get(key) ?? { point: from, ways: [] };
      entry.ways.push({ x: (to.x - from.x) / length, y: (to.y - from.y) / length });
      meeting.set(key, entry);
    }
  }
  const corners: FlatPoint[] = [];
  for (const { point, ways } of meeting.values()) {
    const straight = ways.length === 2 && ways[0].x * ways[1].x + ways[0].y * ways[1].y < -0.999;
    if (!straight) corners.push(point);
  }
  return corners;
}

/** Points round a circle about a point, in the plane two ways of length one lie in. */
function ringAround(centre: Vec3, first: Vec3, second: Vec3, radius: number): Vec3[] {
  return Array.from({ length: ROUND_STEPS }, (_, i) => {
    const turn = (i / ROUND_STEPS) * Math.PI * 2;
    return along(along(centre, first, Math.cos(turn) * radius), second, Math.sin(turn) * radius);
  });
}

/** The pieces of line running round points in order, back to the first. */
function loop(points: readonly Vec3[]): WireSegment[] {
  return points.map((point, i): WireSegment => [point, points[(i + 1) % points.length]]);
}

function at(point: FlatPoint, z: number): Vec3 {
  return { x: point.x, y: point.y, z };
}

/** The edges two parts lie against each other along, keyed as {@link edgeKey} keys them. */
export function sharedEdgeKeys(polygons: readonly (readonly FlatPoint[])[]): Set<string> {
  const seen = new Map<string, number>();
  for (const corners of polygons) {
    for (let i = 0; i < corners.length; i++) {
      const key = edgeKey(corners[i], corners[(i + 1) % corners.length]);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([key]) => key));
}

function pointKey(point: FlatPoint): string {
  return `${Math.round(point.x * 100) / 100},${Math.round(point.y * 100) / 100}`;
}

/** An edge between two points, keyed the same whichever way round it runs. */
export function edgeKey(a: FlatPoint, b: FlatPoint): string {
  const [p, q] = [pointKey(a), pointKey(b)].sort();
  return `${p}|${q}`;
}

/** The heights of the rings drawn round the room a solid range may be moved in, in degrees up from level. */
const DOME_RING_DEGREES = [-60, -30, 0, 30, 60];
/** How many lines run over the room from its bottom to its top, round it. */
const DOME_MERIDIANS = 12;

/**
 * The lines the room round a caster is drawn with while a solid range is moved or pointed in it: rings
 * at even steps of height, and lines over it from pole to pole, left out where they lie wholly below
 * its floor, as the ground hides them there. On the ground it reads as a dome.
 */
export function reachDomeWire(reach: SolidReach): WireSegment[] {
  const { centre, radius } = reach;
  if (!(radius > 0)) return [];
  const segments: WireSegment[] = [];
  for (const degrees of DOME_RING_DEGREES) {
    const up = Math.sin((degrees * Math.PI) / 180) * radius;
    if (centre.z + up < reach.floorZ) continue;
    const across = Math.cos((degrees * Math.PI) / 180) * radius;
    segments.push(
      ...loop(ringAround({ ...centre, z: centre.z + up }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, across))
    );
  }
  for (let i = 0; i < DOME_MERIDIANS; i++) {
    const turn = (i / DOME_MERIDIANS) * Math.PI * 2;
    const half = ringAround(centre, { x: Math.cos(turn), y: Math.sin(turn), z: 0 }, { x: 0, y: 0, z: 1 }, radius).slice(
      0,
      ROUND_STEPS / 2 + 1
    );
    const below = ringAround(
      centre,
      { x: Math.cos(turn), y: Math.sin(turn), z: 0 },
      { x: 0, y: 0, z: -1 },
      radius
    ).slice(0, ROUND_STEPS / 4 + 1);
    for (const arc of [half.slice(0, ROUND_STEPS / 4 + 1), below]) {
      for (let j = 0; j + 1 < arc.length; j++) {
        if (arc[j].z < reach.floorZ && arc[j + 1].z < reach.floorZ) continue;
        segments.push([arc[j], arc[j + 1]]);
      }
    }
  }
  return segments;
}

/** The line from a point straight down to a height under it, or none where it stands at that height or below. */
export function dropLine(point: Vec3, floorZ: number): WireSegment[] {
  return point.z - floorZ > 0.5 ? [[point, { ...point, z: floorZ }]] : [];
}
