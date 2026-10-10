import { correctionsFor } from '@axe/domain/dice/dice-3d/die-symmetry';
import { dieRadiusOf, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import {
  cross,
  dot,
  Quat,
  quatFromAxisAngle,
  quatMultiply,
  quatRotate,
  UP,
  Vec3,
} from '@axe/domain/dice/dice-3d/rotation';
import { Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import { faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { DiceThrowResult, FRAME_STRIDE } from '@axe/infrastructure/dice-3d/dice-physics-message';

/** A throw turned to its reader: the turn inside each die that shows its number, and the recording to play. */
export interface FacedThrow {
  readonly corrections: readonly Quat[];
  /** The recording, with any die that would come to rest upside down to the reader twisted round as it rolls. */
  readonly frames: Float32Array;
  /** How many dice still come to rest with their numbers upside down, having no room to turn. */
  readonly askew: number;
}

/**
 * How far round a number may end up from upright and be left so: past this it is twisted round
 * while its die rolls.
 */
const TWIST_FROM = Math.PI / 2;
/** How much of the lean a twisted number keeps, so it lands askew as a die does, not squared up. */
const LEAN_KEPT = 0.3;
/** How far into the roll the twist is done, as a share of the time until the dice stop. */
const TWIST_ENDS = 0.85;
/** The room a die needs about it to be twisted without brushing a wall or another die. */
const CLEARANCE = 0.08;
/** How many steps of a twist are checked for room. */
const TWIST_CHECKS = 8;

/**
 * Turns each die of a throw so the number it has to show comes up, reading as near upright as it
 * can to whoever looks on from the given side.
 *
 * Of the turns that bring the number up, the one leaving it most nearly upright is taken. A d10
 * has only the one, and a number it leaves upside down is twisted round about the upright through
 * the die's middle while it rolls, which keeps the die on the floor just as it was and is lost in
 * its tumbling, unless it would brush a wall or another die on the way round. A d4 reads by the
 * corner on top, upright on all three faces about it however the die is turned.
 *
 * @param away The direction across the floor that runs up the reader's screen.
 */
export function faceTheReader(
  shapes: readonly DieShape[],
  landed: readonly number[],
  targets: readonly number[],
  result: Pick<DiceThrowResult, 'frameCount' | 'restFrame' | 'frames'>,
  tray: Tray,
  away: Vec3
): FacedThrow {
  const count = shapes.length;
  const last = result.frameCount - 1;
  const rests = shapes.map((_, die) => frameRotation(result.frames, last, die, count));
  const places = shapes.map((_, die) => framePosition(result.frames, last, die, count));
  let frames = result.frames;
  let askew = 0;

  const corrections = shapes.map((shape, die) => {
    const poly = polyhedronOf(shape);
    const turns = correctionsFor(poly, landed[die], targets[die]);
    if (poly.readsCorners) return turns[0];
    const up = faceFramesOf(shape)[targets[die]].up;
    const leanOf = (turn: Quat) => signedAngle(quatRotate(quatMultiply(rests[die], turn), up), away);
    const best = turns.reduce((a, b) => (Math.abs(leanOf(b)) < Math.abs(leanOf(a)) ? b : a));
    const lean = leanOf(best);
    if (Math.abs(lean) <= TWIST_FROM) return best;
    const angle = (lean - Math.sign(lean) * Math.PI) * LEAN_KEPT - lean;
    if (hasRoom(die, angle, shapes, rests, places, tray)) {
      if (frames === result.frames) frames = result.frames.slice();
      twist(frames, die, count, angle, Math.max(1, Math.round(result.restFrame * TWIST_ENDS)));
    } else {
      askew++;
    }
    return best;
  });
  return { corrections, frames, askew };
}

/** How far a number's upright is turned from the reader's, anticlockwise seen from above, from −π to π. */
function signedAngle(up: Vec3, away: Vec3): number {
  const across: Vec3 = [up[0], up[1], 0];
  return Math.atan2(dot(cross(away, across), UP), dot(away, across));
}

/**
 * Whether a die can turn where it lies without brushing a wall or another die: its outline seen
 * from above, at each step of the turn, stays inside the walls and apart from the others'.
 */
function hasRoom(
  die: number,
  angle: number,
  shapes: readonly DieShape[],
  rests: readonly Quat[],
  places: readonly Vec3[],
  tray: Tray
): boolean {
  const others = shapes
    .map((shape, index) => (index === die ? null : outlineOf(shape, rests[index], places[index])))
    .filter((outline): outline is Point[] => outline !== null);
  for (let step = 1; step <= TWIST_CHECKS; step++) {
    const turned = quatMultiply(quatFromAxisAngle(UP, (angle * step) / TWIST_CHECKS), rests[die]);
    const outline = outlineOf(shapes[die], turned, places[die]);
    const inside = outline.every(
      ([x, y]) => Math.abs(x) < tray.halfWidth - CLEARANCE && Math.abs(y) < tray.halfDepth - CLEARANCE
    );
    if (!inside || others.some((other) => gapBetween(outline, other) < CLEARANCE)) return false;
  }
  return true;
}

type Point = readonly [number, number];

/** The outline a die casts straight down onto the floor, as the corners of its hull in turn. */
function outlineOf(shape: DieShape, rotation: Quat, at: Vec3): Point[] {
  const radius = dieRadiusOf(shape);
  const points = polyhedronOf(shape)
    .vertices.map((v) => quatRotate(rotation, v))
    .map(([x, y]): Point => [at[0] + x * radius, at[1] + y * radius])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Andrew's monotone chain.
  const turn = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (from: Point[]) => {
    const hull: Point[] = [];
    for (const p of from) {
      while (hull.length >= 2 && turn(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return [...half(points), ...half([...points].reverse())];
}

/** How far apart two convex outlines are along the line that parts them best; negative when they overlap. */
function gapBetween(a: readonly Point[], b: readonly Point[]): number {
  let best = -Infinity;
  for (const outline of [a, b]) {
    outline.forEach((p, i) => {
      const q = outline[(i + 1) % outline.length];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (length < 1e-9) return;
      const axis: Point = [(q[1] - p[1]) / length, -(q[0] - p[0]) / length];
      const along = (o: readonly Point[]) => o.map(([x, y]) => x * axis[0] + y * axis[1]);
      const [ia, ib] = [along(a), along(b)];
      const gap = Math.max(Math.min(...ib) - Math.max(...ia), Math.min(...ia) - Math.max(...ib));
      best = Math.max(best, gap);
    });
  }
  return best;
}

/** Turns one die about the upright through its middle, more and more until a frame and all of it after. */
function twist(frames: Float32Array, die: number, count: number, angle: number, until: number): void {
  const frameCount = frames.length / (count * FRAME_STRIDE);
  for (let frame = 0; frame < frameCount; frame++) {
    const t = Math.min(1, frame / until);
    const eased = t * t * (3 - 2 * t);
    const turned = quatMultiply(quatFromAxisAngle(UP, angle * eased), frameRotation(frames, frame, die, count));
    const at = (frame * count + die) * FRAME_STRIDE + 3;
    frames.set(turned, at);
  }
}

function frameRotation(frames: Float32Array, frame: number, die: number, count: number): Quat {
  const at = (frame * count + die) * FRAME_STRIDE + 3;
  return [frames[at], frames[at + 1], frames[at + 2], frames[at + 3]];
}

function framePosition(frames: Float32Array, frame: number, die: number, count: number): Vec3 {
  const at = (frame * count + die) * FRAME_STRIDE;
  return [frames[at], frames[at + 1], frames[at + 2]];
}
