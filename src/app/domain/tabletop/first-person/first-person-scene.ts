import {
  clipPolygonToEye,
  clipSpanToEye,
  depthOf,
  EyeFrame,
  eyeFrameOf,
  lateralOf,
} from '@axe/domain/tabletop/first-person/first-person-clip';
import { FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { FirstPersonRoof } from '@axe/domain/tabletop/first-person/first-person-roof';
import {
  FirstPersonCap,
  FirstPersonFloor,
  FirstPersonWall,
  FirstPersonWorld,
} from '@axe/domain/tabletop/first-person/first-person-world';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellIndexAt, CellPoint, cellPolygonOf, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';

export const FIRST_PERSON_FOV_DEG = 90;
const FOV_MARGIN_DEG = 12;
const PROBE_CELLS = 0.25;

export interface FirstPersonWallQuad {
  kind: 'wall';
  id: string;
  terrain: string;
  x: number;
  y: number;
  length: number;
  angle: number;
  basePx: number;
  heightPx: number;
  image: string;
  uStart: number;
  fullLength: number;
  glass: boolean;
  seeThrough: boolean;
  door: boolean;
  depth: number;
  cell: number;
}

export interface FirstPersonPlaneQuad {
  kind: 'floor' | 'ceiling' | 'cap';
  id: string;
  terrain: string;
  zPx: number;
  facing: 'up' | 'down';
  minX: number;
  minY: number;
  width: number;
  height: number;
  polygon: CellPoint[];
  image: string;
  frame: FirstPersonFloor | null;
  glass: boolean;
  depth: number;
  cell: number;
}

export type FirstPersonQuad = FirstPersonWallQuad | FirstPersonPlaneQuad;

export interface FirstPersonSceneInput {
  world: FirstPersonWorld;
  grid: CellGrid;
  pose: FirstPersonPose;
  seen: CellBits | null;
  depthPx: number;
  nearPx: number;
  fovDeg?: number;
  /** The roof over the ground walls shut in; without one the sky is open everywhere. */
  roof?: FirstPersonRoof | null;
}

interface SceneFrame {
  eye: EyeFrame;
  input: FirstPersonSceneInput;
  limitDeg: number;
}

export function firstPersonScene(input: FirstPersonSceneInput): FirstPersonQuad[] {
  const scene: SceneFrame = {
    eye: eyeFrameOf(input.pose),
    input,
    limitDeg: (input.fovDeg ?? FIRST_PERSON_FOV_DEG) / 2 + FOV_MARGIN_DEG,
  };
  const quads: FirstPersonQuad[] = [];
  for (const wall of input.world.walls) {
    const quad = wallQuadOf(wall, scene);
    if (quad) quads.push(quad);
  }
  for (const cap of input.world.caps) {
    const quad = capQuadOf(cap, scene);
    if (quad) quads.push(quad);
  }
  const reach = input.depthPx + input.grid.sizePx;
  const { x, y } = input.pose;
  forEachCellInBox(input.grid, x - reach, y - reach, x + reach, y + reach, (index) => {
    if (input.seen && !input.seen.get(index)) return;
    const polygon = clipPolygonToEye(scene.eye, cellPolygonOf(input.grid, index), input.nearPx);
    if (!keepsPlane(polygon, scene)) return;
    const floor = input.world.floor;
    quads.push(planeQuadOf('floor', `floor:${index}`, index, '', polygon, 0, 'up', floor.image, floor, false, scene));
    const roof = input.roof;
    if (roof && roof.heightPx > input.pose.z && roof.cells.get(index)) {
      quads.push(
        planeQuadOf('ceiling', `ceiling:${index}`, index, '', polygon, roof.heightPx, 'down', '', null, false, scene)
      );
    }
  });
  return quads;
}

function wallQuadOf(wall: FirstPersonWall, scene: SceneFrame): FirstPersonWallQuad | null {
  const { eye, input } = scene;
  const a = { x: wall.ax, y: wall.ay };
  const b = { x: wall.bx, y: wall.by };
  if ((eye.x - a.x) * wall.nx + (eye.y - a.y) * wall.ny <= 0) return null;
  const span = clipSpanToEye(eye, a, b, input.nearPx);
  if (!span) return null;
  const start = pointAlong(a, b, span.t0);
  const end = pointAlong(a, b, span.t1);
  if (Math.min(depthOf(eye, start), depthOf(eye, end)) > input.depthPx) return null;
  if (!inView([start, end], scene)) return null;
  const cell = wallCell(wall, start, end, scene);
  if (input.seen && cell < 0) return null;
  const fullLength = Math.hypot(b.x - a.x, b.y - a.y);
  const middle = pointAlong(start, end, 0.5);
  return {
    kind: 'wall',
    id: wall.id,
    terrain: wall.terrain,
    x: start.x,
    y: start.y,
    length: (span.t1 - span.t0) * fullLength,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    basePx: wall.basePx,
    heightPx: wall.topPx - wall.basePx,
    image: wall.image,
    uStart: span.t0 * fullLength,
    fullLength,
    glass: wall.glass,
    seeThrough: wall.seeThrough,
    door: wall.door,
    depth: depthOf(eye, middle),
    cell,
  };
}

function wallCell(wall: FirstPersonWall, start: CellPoint, end: CellPoint, scene: SceneFrame): number {
  const { seen, grid } = scene.input;
  const probe = PROBE_CELLS * grid.sizePx;
  const samples = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / (grid.sizePx / 2)));
  for (let sample = 0; sample < samples; sample++) {
    const at = pointAlong(start, end, (sample + 0.5) / samples);
    const cell = cellIndexAt(grid, at.x + wall.nx * probe, at.y + wall.ny * probe);
    if (cell < 0) continue;
    if (!seen || seen.get(cell)) return cell;
  }
  return -1;
}

function capQuadOf(cap: FirstPersonCap, scene: SceneFrame): FirstPersonPlaneQuad | null {
  const { input } = scene;
  const eyeZ = input.pose.z;
  if (cap.facing === 'up' ? eyeZ <= cap.zPx : eyeZ >= cap.zPx) return null;
  const polygon = clipPolygonToEye(scene.eye, cap.outline, input.nearPx);
  if (!keepsPlane(polygon, scene)) return null;
  const centre = centreOf(polygon);
  const cell = cellIndexAt(input.grid, centre.x, centre.y);
  if (input.seen && (cell < 0 || !input.seen.get(cell))) return null;
  return planeQuadOf('cap', cap.id, cell, cap.terrain, polygon, cap.zPx, cap.facing, cap.image, null, cap.glass, scene);
}

function keepsPlane(polygon: readonly CellPoint[], scene: SceneFrame): boolean {
  if (polygon.length < 3) return false;
  const nearest = Math.min(...polygon.map((point) => depthOf(scene.eye, point)));
  return nearest <= scene.input.depthPx && inView(polygon, scene);
}

function inView(points: readonly CellPoint[], scene: SceneFrame): boolean {
  let left = true;
  let right = true;
  for (const point of points) {
    const angle = (Math.atan2(lateralOf(scene.eye, point), depthOf(scene.eye, point)) * 180) / Math.PI;
    if (angle >= -scene.limitDeg) left = false;
    if (angle <= scene.limitDeg) right = false;
  }
  return !left && !right;
}

function planeQuadOf(
  kind: FirstPersonPlaneQuad['kind'],
  id: string,
  cell: number,
  terrain: string,
  polygon: CellPoint[],
  zPx: number,
  facing: 'up' | 'down',
  image: string,
  frame: FirstPersonFloor | null,
  glass: boolean,
  scene: SceneFrame
): FirstPersonPlaneQuad {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    kind,
    id,
    terrain,
    zPx,
    facing,
    minX,
    minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    polygon,
    image,
    frame,
    glass,
    depth: depthOf(scene.eye, centreOf(polygon)),
    cell,
  };
}

function pointAlong(a: CellPoint, b: CellPoint, t: number): CellPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function centreOf(points: readonly CellPoint[]): CellPoint {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}
