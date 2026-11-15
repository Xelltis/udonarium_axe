import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { acrossOf, ball, glow, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The rock of a meteor and the fire it falls in, put together from the shapes every look is drawn
 * with. The rock is a dark chunk with its outline, two lumps standing out of it, its leading face
 * white-hot in three steps set before its middle on the side it flies to, and cracks glowing from
 * that face back over it. The fire streams from before its leading face back past it in sheets, from
 * a deep red, the longest and some nine times as long as the rock is wide, in to a white-hearted
 * yellow about the rock, with tongues torn off its sides.
 *
 * Every part is set in the table's own space along the way the rock flies, so it reads from whatever
 * side it is seen: from behind, a dark rock ringed in fire; from before, its white-hot face.
 */

/** The stone of the rock where it is not hot, and the dark of a crack gone cold. */
const ROCK = '#32272a';
const COLD_CRACK = '#1c1412';
/** How fast a crack is told to fly, in table pixels a second, for it to be drawn out as a streak: it goes nowhere. */
const CRACK_PACE = 100;
/** How many cracks run back over the rock. */
const CRACKS = 5;

/** A rock as it is drawn at a moment. */
export interface RockPose {
  /** Its middle, in table pixels. */
  readonly at: Point;
  /** The way its hot face is turned, of length one: the way it flies. */
  readonly way: Point;
  /** How wide it is, in table pixels. */
  readonly size: number;
  /** How hot it is, from 1 white-hot to 0 cold. */
  readonly heat: number;
  /** How far it has tumbled about the way it flies, in radians. */
  readonly turn: number;
  readonly seed: number;
  /** How far nearer the eye it is drawn, in table pixels. */
  readonly forward: number;
  /** How much of it shows, from 0 to 1. */
  readonly alpha: number;
  /** The lowest any part of it is set, in table pixels up: what of it would be set under the floor is kept at it. */
  readonly lowest: number;
}

/**
 * The sheets the fire a meteor falls in is laid in, the widest and deepest first, in widths of the
 * rock: how wide and how long each is, and the step of the ramp it is; the last has a white heart.
 */
const TAIL_SHEETS = [
  { wide: 2.05, long: 9, step: 1 },
  { wide: 1.8, long: 7.4, step: 2 },
  { wide: 1.5, long: 5.6, step: 3 },
  { wide: 1.25, long: 3.9, step: 4 },
  { wide: 1, long: 2.5, step: 5 },
] as const;
/** How far before the middle of the rock its fire is rooted, in widths of the rock: it wraps the rock's leading face. */
const TAIL_ROOTED_AHEAD = 0.58;
/** The tongues torn off the sides of the fire: how far round the rock each is set, in radians, and how long it is, in widths of the rock. */
const SIDE_TONGUES = [
  { round: 0.4, long: 4.4 },
  { round: 2.3, long: 3.6 },
  { round: 3.7, long: 4.8 },
  { round: 5.3, long: 3.2 },
] as const;
/** How fast the pattern of the fire runs back down it, in lengths of the pattern a second. */
const TAIL_FLOWS = 7;

/** How long each sheet of a meteor's fire is at the most, in widths of its rock, the longest first. */
export const METEOR_FLAME_LENGTHS: readonly number[] = TAIL_SHEETS.map((sheet) => sheet.long);

/** What sets a point off from the middle of a rock: on the way it flies, to its side and up across it. */
type Offset = (ahead: number, aside: number, above: number) => Point;

/** How points are set off from the middle of a rock in a pose, none of them lower than the pose lets. */
function offsetsOf(pose: RockPose): Offset {
  const { at, way, lowest } = pose;
  const { side, lift } = acrossOf(way);
  return (ahead, aside, above) => ({
    x: at.x + way.x * ahead + side.x * aside + lift.x * above,
    y: at.y + way.y * ahead + side.y * aside + lift.y * above,
    z: Math.max(lowest, at.z + way.z * ahead + side.z * aside + lift.z * above),
  });
}

/** A tongue of the fire, rooted at a point and drawn out along a way: a shape that flows, its pattern run down it. */
export function fireTongue(
  root: Point,
  way: Point,
  wide: number,
  long: number,
  flowed: number,
  color: string,
  core: string | undefined,
  alpha: number,
  forward: number,
  variant: number
): EffectMote {
  const reach = Math.max(long, wide);
  return {
    x: root.x + way.x * reach,
    y: root.y + way.y * reach,
    z: root.z + way.z * reach,
    size: wide,
    color,
    core,
    alpha: Math.max(0, alpha),
    blend: 'color',
    shape: 'lick',
    velocity: { x: way.x * 100, y: way.y * 100, z: way.z * 100 },
    trail: (reach - wide) / 100,
    spin: flowed,
    variant,
    forward,
  };
}

/**
 * The fire a meteor falls in at a moment: a wide light about it; tongues torn off its sides, each
 * swaying on its own; and its body, streaming back from before the rock's leading face in sheets, the
 * deepest the widest and longest and the hottest a white-hearted one about the rock, every one torn
 * by the same pattern running back down it, flickering in length. Drawn before the rock, which stands
 * dark against it.
 */
export function drawMeteorFlames(
  drawn: Staged,
  pose: RockPose,
  speed: number,
  ramp: readonly string[],
  seconds: number
): void {
  const { at, way, size, forward, alpha, seed } = pose;
  const offset = offsetsOf(pose);
  const back = { x: -way.x, y: -way.y, z: -way.z };
  const { side, lift } = acrossOf(way);
  const flowed = seconds * TAIL_FLOWS + (seed % 17);
  const hurried = Math.min(1.15, 0.85 + speed / Math.max(size * 40, 1));
  drawn.motes.push(glow(at, size * 4, ramp[3], 0.5 * alpha, forward));
  SIDE_TONGUES.forEach((torn, index) => {
    const round = torn.round + Math.sin(seconds * 9 + index * 2.1 + seed) * 0.25;
    const out = { x: Math.cos(round), y: Math.sin(round) };
    const lean = 0.2 + 0.08 * Math.sin(seconds * 13 + index * 1.7 + seed);
    const leaning = {
      x: back.x + (side.x * out.x + lift.x * out.y) * lean,
      y: back.y + (side.y * out.x + lift.y * out.y) * lean,
      z: back.z + (side.z * out.x + lift.z * out.y) * lean,
    };
    const far = Math.hypot(leaning.x, leaning.y, leaning.z);
    const aimed = { x: leaning.x / far, y: leaning.y / far, z: leaning.z / far };
    const root = offset(size * 0.1, out.x * size * 0.5, out.y * size * 0.5);
    const flickers = 0.8 + 0.2 * Math.sin(seconds * (23 + index * 5) + seed + index);
    const long = size * torn.long * flickers * hurried;
    drawn.motes.push(
      fireTongue(root, aimed, size * 1.1, long, flowed + index * 2.3, ramp[1], ramp[3], alpha, forward, seed + index)
    );
  });
  const root = offset(size * TAIL_ROOTED_AHEAD, 0, 0);
  TAIL_SHEETS.forEach((sheet, index) => {
    const flickers = 0.9 + 0.1 * Math.sin(seconds * (27 + index * 4) + seed + index * 1.7);
    const long = size * sheet.long * flickers * hurried;
    const hottest = index === TAIL_SHEETS.length - 1;
    drawn.motes.push(
      fireTongue(
        root,
        back,
        size * sheet.wide,
        long,
        flowed,
        ramp[sheet.step],
        hottest ? '#ffffff' : undefined,
        alpha,
        forward,
        seed % 6
      )
    );
  });
}

/**
 * A rock at a moment: its lumps and its body, dark and outlined, tumbling about the way it flies;
 * its leading face in three steps of heat, each gone as it cools past it; and its cracks, glowing
 * from that face back over it, which are left dark when it is cold.
 */
export function drawRock(drawn: Staged, pose: RockPose, ramp: readonly string[]): void {
  const { size, heat, turn, seed, forward, alpha } = pose;
  const offset = offsetsOf(pose);
  const stone = mixColor(ROCK, ramp[1], 0.12 * heat);
  const chunk = (where: Point, wide: number, variant: number): EffectMote => ({
    ...ball(where, wide, stone, alpha, forward, variant),
    shape: 'chunk',
    spin: turn + variant,
  });
  for (const [lump, round] of [
    [0, 0.6],
    [1, 3.4],
  ] as const) {
    const about = turn + round;
    const where = offset(-size * 0.12, Math.cos(about) * size * 0.24, Math.sin(about) * size * 0.24);
    drawn.motes.push(chunk(where, size * 0.58, (seed + lump * 2.7) % 6));
  }
  drawn.motes.push(chunk(offset(0, 0, 0), size, seed % 6));

  const face = (ahead: number, wide: number, color: string, variant: number): EffectMote =>
    ball(offset(size * ahead, 0, 0), size * wide, color, alpha, forward, variant);
  if (heat >= 0.2) drawn.motes.push(face(0.28, 0.6, heat >= 0.5 ? ramp[2] : ramp[1], seed));
  if (heat >= 0.5) drawn.motes.push(face(0.36, 0.44, heat >= 0.8 ? ramp[4] : ramp[2], seed + 1.3));
  if (heat >= 0.8) drawn.motes.push(face(0.44, 0.28, '#ffffff', seed + 2.9));

  const glowing = heat >= 0.6 ? ramp[4] : heat >= 0.3 ? ramp[2] : heat >= 0.08 ? ramp[1] : COLD_CRACK;
  for (let crack = 0; crack < CRACKS; crack++) {
    const about = turn + (crack / CRACKS) * Math.PI * 2 + Math.sin(seed + crack * 3.1) * 0.4;
    const back = 0.2 + 0.1 * Math.abs(Math.sin(seed * 1.7 + crack * 2.3));
    const out = { x: Math.cos(about), y: Math.sin(about) };
    const inner = offset(size * 0.02, out.x * size * 0.08, out.y * size * 0.08);
    const outer = offset(-size * back, out.x * size * 0.3, out.y * size * 0.3);
    const long = Math.hypot(inner.x - outer.x, inner.y - outer.y, inner.z - outer.z) || 1;
    const wide = size * 0.07;
    drawn.motes.push({
      ...ball(inner, wide, glowing, alpha, forward, 0),
      shape: 'spark',
      velocity: {
        x: ((inner.x - outer.x) / long) * CRACK_PACE,
        y: ((inner.y - outer.y) / long) * CRACK_PACE,
        z: ((inner.z - outer.z) / long) * CRACK_PACE,
      },
      trail: Math.max(long - wide, 0) / CRACK_PACE,
    });
  }
}
