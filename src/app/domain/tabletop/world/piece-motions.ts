import { Vec3 } from '@axe/domain/tabletop/surface-space';
import { TableWorldSprite, turnedAbout } from '@axe/domain/tabletop/world/table-sprites';

/** A move a piece plays through once, as the page plays it with a CSS animation of the same name. */
export type PieceMotionKind =
  | 'dice-tumble-a'
  | 'dice-tumble-b'
  | 'dice-tumble-c'
  | 'coin-flip'
  | 'coin-flip-turn'
  | 'bounce-in'
  | 'shuffle'
  | 'hit-shake'
  | 'defeat-dissolve'
  | 'defeat-bisect'
  | 'defeat-flinch';

/**
 * Where a moving piece is at one moment of a move: shifted across, down and out of its face, grown,
 * turned in its face (across towards down), and flipped over the line running down its face, all
 * about the middle of where it stands; and how much of it shows, from none at 0 to all of it at 1.
 */
export interface MotionPose {
  readonly across: number;
  readonly down: number;
  readonly out: number;
  readonly scale: number;
  readonly turnDeg: number;
  readonly flipDeg: number;
  readonly shown: number;
}

/** A pose at a share of the way through a move. */
interface Keyframe extends Partial<MotionPose> {
  readonly at: number;
}

/** A move: how long it plays, how each stretch between two keyframes eases, and its keyframes. */
interface Motion {
  readonly lengthMs: number;
  readonly easing: readonly [number, number, number, number];
  readonly keyframes: readonly Keyframe[];
}

const EASE: Motion['easing'] = [0.25, 0.1, 0.25, 1];
const TUMBLE_EASING: Motion['easing'] = [0.22, 0.9, 0.3, 1];
const FLIP_EASING: Motion['easing'] = [0.33, 0, 0.35, 1];
const EASE_IN_OUT: Motion['easing'] = [0.42, 0, 0.58, 1];

function tumble(
  first: [number, number, number, number],
  second: [number, number, number, number],
  third: [number, number, number, number],
  turnDeg: number
): Motion {
  return {
    lengthMs: 800,
    easing: TUMBLE_EASING,
    keyframes: [
      { at: 0, scale: 0.85, turnDeg: 0 },
      { at: 0.35, across: first[0], down: first[1], scale: first[2], turnDeg: first[3] },
      { at: 0.7, across: second[0], down: second[1], scale: second[2], turnDeg: second[3] },
      { at: 0.88, across: third[0], down: third[1], scale: third[2], turnDeg: third[3] },
      { at: 1, turnDeg },
    ],
  };
}

function flip(turns: [number, number, number]): Motion {
  return {
    lengthMs: 900,
    easing: FLIP_EASING,
    keyframes: [
      { at: 0 },
      { at: 0.35, out: 90, flipDeg: turns[0], scale: 1.18 },
      { at: 0.7, out: 60, flipDeg: turns[1], scale: 1.1 },
      { at: 1, flipDeg: turns[2] },
    ],
  };
}

/** The moves, keyframe for keyframe. */
const MOTIONS: Record<PieceMotionKind, Motion> = {
  'dice-tumble-a': tumble([20, -16, 1.18, 240], [-12, 9, 1.02, 470], [4, -3, 1.08, 640], 720),
  'dice-tumble-b': tumble([-22, -10, 1.2, -260], [11, 12, 1.03, -500], [-5, -4, 1.09, -660], -720),
  'dice-tumble-c': tumble([6, -24, 1.16, 200], [-8, 14, 1.04, 440], [3, -5, 1.1, 600], 720),
  'coin-flip': flip([720, 1440, 1800]),
  'coin-flip-turn': flip([792, 1584, 1980]),
  'bounce-in': {
    lengthMs: 600,
    easing: EASE,
    keyframes: [
      { at: 0, scale: 0 },
      { at: 0.5, scale: 1.5 },
      { at: 0.75, scale: 0.75 },
      { at: 0.875, scale: 1.125 },
      { at: 1 },
    ],
  },
  'hit-shake': {
    lengthMs: 420,
    easing: EASE_IN_OUT,
    keyframes: [
      { at: 0 },
      { at: 0.12, across: -5 },
      { at: 0.28, across: 4.5 },
      { at: 0.44, across: -3.5 },
      { at: 0.6, across: 2.5 },
      { at: 0.78, across: -1.5 },
      { at: 1 },
    ],
  },
  'defeat-dissolve': {
    lengthMs: 1900,
    easing: [0.4, 0, 0.6, 1],
    keyframes: [{ at: 0 }, { at: 0.1, down: 2 }, { at: 0.22, shown: 0 }, { at: 1, shown: 0 }],
  },
  'defeat-bisect': {
    lengthMs: 1600,
    easing: [0.3, 0, 0.2, 1],
    keyframes: [{ at: 0 }, { at: 0.16 }, { at: 0.22, shown: 0 }, { at: 1, shown: 0 }],
  },
  'defeat-flinch': {
    lengthMs: 900,
    easing: [0.36, 0.07, 0.19, 0.97],
    keyframes: [
      { at: 0 },
      { at: 0.1, across: -9, down: -3, turnDeg: -5 },
      { at: 0.26, across: 6, down: 2, turnDeg: 3 },
      { at: 0.46, across: -4, down: 1, turnDeg: -2 },
      { at: 0.7, across: 2, turnDeg: 1 },
      { at: 1 },
    ],
  },
  shuffle: {
    lengthMs: 800,
    easing: EASE,
    keyframes: [
      { at: 0, scale: 0, turnDeg: 0 },
      { at: 0.5, scale: 1.2, turnDeg: 360 },
      { at: 0.75, scale: 0.75, turnDeg: 520 },
      { at: 0.875, scale: 1.125, turnDeg: 630 },
      { at: 1, turnDeg: 720 },
    ],
  },
};

const REST: MotionPose = { across: 0, down: 0, out: 0, scale: 1, turnDeg: 0, flipDeg: 0, shown: 1 };

/** Where a move leaves a piece once it has played through, as a CSS animation that fills forwards does. */
export function motionEndPose(kind: PieceMotionKind): MotionPose {
  const frames = MOTIONS[kind].keyframes;
  const { at: _at, ...last } = { ...REST, ...frames[frames.length - 1] };
  return last;
}

/** How long a move plays, in milliseconds. */
export function motionLengthMs(kind: PieceMotionKind): number {
  return MOTIONS[kind].lengthMs;
}

/**
 * How far along a cubic Bézier easing curve, through (0, 0), the two control points and (1, 1), a
 * share of the time has come, as CSS eases a stretch of an animation.
 */
export function eased(easing: readonly [number, number, number, number], time: number): number {
  const [x1, y1, x2, y2] = easing;
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  const curve = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const slope = (a: number, b: number, t: number) =>
    3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  let t = time;
  for (let step = 0; step < 8; step++) {
    const miss = curve(x1, x2, t) - time;
    if (Math.abs(miss) < 1e-6) break;
    const rate = slope(x1, x2, t);
    if (Math.abs(rate) < 1e-6) break;
    t -= miss / rate;
  }
  if (!(t >= 0 && t <= 1) || Math.abs(curve(x1, x2, t) - time) > 1e-4) {
    let low = 0;
    let high = 1;
    t = time;
    for (let step = 0; step < 40; step++) {
      if (curve(x1, x2, t) < time) low = t;
      else high = t;
      t = (low + high) / 2;
    }
  }
  return curve(y1, y2, t);
}

/**
 * Where a piece is a given time into a move, or null once the move has played through. Each stretch
 * between two keyframes eases on its own, and what a keyframe leaves out is the piece at rest.
 */
export function motionPoseAt(kind: PieceMotionKind, elapsedMs: number): MotionPose | null {
  const motion = MOTIONS[kind];
  if (!(elapsedMs < motion.lengthMs)) return null;
  const share = Math.max(0, elapsedMs) / motion.lengthMs;
  const frames = motion.keyframes;
  let next = 1;
  while (next < frames.length - 1 && frames[next].at <= share) next++;
  const from = { ...REST, ...frames[next - 1] };
  const to = { ...REST, ...frames[next] };
  const along = eased(motion.easing, (share - from.at) / (to.at - from.at));
  const mix = (key: keyof MotionPose) => from[key] + (to[key] - from[key]) * along;
  return {
    across: mix('across'),
    down: mix('down'),
    out: mix('out'),
    scale: mix('scale'),
    turnDeg: mix('turnDeg'),
    flipDeg: mix('flipDeg'),
    shown: mix('shown'),
  };
}

/** Where a moving piece moves about: the middle of where it stands, and its directions across and down its face. */
export interface MotionPivot {
  readonly point: Vec3;
  readonly across: Vec3;
  readonly down: Vec3;
}

/**
 * A sprite of a moving piece where the pose puts it: shifted, grown and turned about the pivot. A
 * sprite turned to the eye keeps turning to it and is turned in the face on top of that, and of
 * whatever turn it already had in the face.
 */
export function movedSprite(sprite: TableWorldSprite, pose: MotionPose, pivot: MotionPivot): TableWorldSprite {
  const { across, down } = pivot;
  const out = {
    x: across.y * down.z - across.z * down.y,
    y: across.z * down.x - across.x * down.z,
    z: across.x * down.y - across.y * down.x,
  };
  const turn = (v: Vec3) => turnedAbout(turnedAbout(v, down, pose.flipDeg), out, pose.turnDeg);
  const fromPivot = turn({
    x: sprite.centre.x - pivot.point.x,
    y: sprite.centre.y - pivot.point.y,
    z: sprite.centre.z - pivot.point.z,
  });
  const shift = (axis: 'x' | 'y' | 'z') =>
    pivot.point[axis] + across[axis] * pose.across + down[axis] * pose.down + out[axis] * pose.out;
  const moved: TableWorldSprite = {
    ...sprite,
    ...(pose.shown < 1 ? { opacity: (sprite.opacity ?? 1) * pose.shown } : {}),
    centre: {
      x: shift('x') + fromPivot.x * pose.scale,
      y: shift('y') + fromPivot.y * pose.scale,
      z: shift('z') + fromPivot.z * pose.scale,
    },
    widthPx: sprite.widthPx * pose.scale,
    heightPx: sprite.heightPx * pose.scale,
  };
  if (sprite.facing === 'eye') {
    return pose.turnDeg ? { ...moved, turn: { axis: out, deg: (sprite.turn?.deg ?? 0) + pose.turnDeg } } : moved;
  }
  return { ...moved, facing: { across: turn(sprite.facing.across), down: turn(sprite.facing.down) } };
}
