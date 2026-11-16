import type { Staged } from '@axe/domain/effect/scene/choreography';
import type { DarkTones } from '@axe/domain/effect/scene/dark/dark-parts';
import { haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * A hand of shadow risen out of the floor: an arm of black, thick at its root and bent at the elbow,
 * a palm, and four long fingers and a thumb drawn to points, all of it edged in burning violet. It
 * sways as it gropes; where it has something to seize it bends over onto it and its fingers close;
 * and pulled, it shortens, dragging what it holds down.
 */

/** A hand: where it is rooted, the way it faces over the floor, how tall it stands and how large it is, in cells. */
export interface Hand {
  readonly root: Point;
  /** The way over the floor it faces and closes its fingers, of length one. */
  readonly toward: { readonly x: number; readonly y: number };
  readonly tall: number;
  readonly size: number;
  /** When it rises, in seconds. */
  readonly risesAt: number;
  readonly phase: number;
  /** What it bends onto and seizes, where it has something. */
  readonly grabs?: Point;
}

/** How a hand is held at a moment: how far risen, how far closed, and how far pulled down, each from 0 to 1. */
export interface HandPose {
  readonly risen: number;
  readonly grip: number;
  readonly pulled: number;
  readonly t: number;
}

/** How wide an arm is along it, from its root to the heel of its palm, in cells. */
const ARM_WIDTHS = [0.24, 0.19, 0.15, 0.12, 0.1, 0.125, 0.17];
/** How long a finger is, in cells, and the angles the fingers and the thumb are spread at, in radians. */
const FINGER_CELLS = 0.62;
const SPREAD = [-1.05, -0.42, -0.12, 0.2, 0.52];

function add(a: Point, b: Point, far: number): Point {
  return { x: a.x + b.x * far, y: a.y + b.y * far, z: a.z + b.z * far };
}

function unit(way: Point): Point {
  const length = Math.hypot(way.x, way.y, way.z) || 1;
  return { x: way.x / length, y: way.y / length, z: way.z / length };
}

/** Lays one band of a hand: its burning edge, frayed, a little wider than its body by `rim`, to be covered by its body. */
function edgeOf(points: Point[], widths: number[], rim: number, tones: DarkTones, alpha: number, t: number) {
  return {
    points,
    widths: widths.map((width) => width * 1.35 + rim),
    color: tones.edge,
    core: tones.glow,
    alpha,
    blend: 'color' as const,
    torn: 0.3,
    flowed: t * 1.5,
  };
}

/** A hand of shadow at a moment: see the header. */
export function drawHand(drawn: Staged, hand: Hand, cell: number, tones: DarkTones, pose: HandPose): void {
  if (pose.risen <= 0.02) return;
  const U = cell * hand.size;
  const high = hand.tall * cell * pose.risen * (1 - 0.4 * pose.pulled);
  const sway = Math.sin(pose.t * 2.3 + hand.phase) * 0.14 * high * (1 - pose.grip * 0.8);
  const across = { x: -hand.toward.y, y: hand.toward.x, z: 0 };
  const facing = { x: hand.toward.x, y: hand.toward.y, z: 0 };
  const upright = {
    x: hand.root.x + across.x * sway + facing.x * high * 0.12,
    y: hand.root.y + across.y * sway + facing.y * high * 0.12,
    z: hand.root.z + high,
  };
  const seized = hand.grabs
    ? {
        x: hand.grabs.x - facing.x * U * 0.22,
        y: hand.grabs.y - facing.y * U * 0.22,
        z: Math.max(hand.root.z + U * 0.45, Math.min(hand.grabs.z, hand.root.z + high) - high * 0.3 * pose.pulled),
      }
    : upright;
  const closing = hand.grabs ? pose.grip : 0;
  const wrist = {
    x: upright.x + (seized.x - upright.x) * closing,
    y: upright.y + (seized.y - upright.y) * closing,
    z: upright.z + (seized.z - upright.z) * closing,
  };
  const elbow = {
    x: hand.root.x - facing.x * high * 0.22 + across.x * sway * 0.5,
    y: hand.root.y - facing.y * high * 0.22 + across.y * sway * 0.5,
    z: hand.root.z + high * (0.62 + 0.2 * closing),
  };
  const arm = ARM_WIDTHS.map((_width, index) => {
    const share = index / (ARM_WIDTHS.length - 1);
    const left = 1 - share;
    return {
      x: left * left * hand.root.x + 2 * left * share * elbow.x + share * share * wrist.x,
      y: left * left * hand.root.y + 2 * left * share * elbow.y + share * share * wrist.y,
      z: left * left * hand.root.z + 2 * left * share * elbow.z + share * share * wrist.z,
    };
  });
  const widths = ARM_WIDTHS.map((width) => width * U);
  const along = unit({ x: wrist.x - elbow.x, y: wrist.y - elbow.y, z: wrist.z - elbow.z });
  const curl = 0.2 + 0.8 * pose.grip;
  const bands: { points: Point[]; widths: number[] }[] = [{ points: arm, widths }];
  SPREAD.forEach((angle, finger) => {
    const spread = angle * (1 - 0.45 * pose.grip);
    const way = unit({
      x: along.x * Math.cos(spread) + across.x * Math.sin(spread),
      y: along.y * Math.cos(spread) + across.y * Math.sin(spread),
      z: along.z * Math.cos(spread),
    });
    const long = U * FINGER_CELLS * (finger === 0 ? 0.7 : finger === 2 ? 1.1 : 1);
    const base = add(wrist, along, U * 0.12);
    const knuckle = add(add(base, way, long * 0.45), facing, long * 0.18 * curl);
    const bent = unit({
      x: way.x * (1 - curl) + facing.x * curl,
      y: way.y * (1 - curl) + facing.y * curl,
      z: way.z * (1 - curl) - 0.5 * curl,
    });
    const joint = add(knuckle, bent, long * 0.35);
    const claw = unit({
      x: bent.x * (1 - curl * 0.5) + facing.x * curl * 0.5,
      y: bent.y * (1 - curl * 0.5) + facing.y * curl * 0.5,
      z: bent.z - 0.6 * curl,
    });
    const tip = add(joint, claw, long * 0.32);
    bands.push({ points: [base, knuckle, joint, tip], widths: [U * 0.11, U * 0.095, U * 0.07, 0] });
  });
  bands.push({ points: [wrist, add(wrist, along, U * 0.16)], widths: [U * 0.16, U * 0.26] });
  drawn.motes.push(haze(wrist, U * 0.8, tones.edge, 0.4 * pose.risen, cell * 0.4));
  for (const band of bands) drawn.ribbons.push(edgeOf(band.points, band.widths, U * 0.06, tones, pose.risen, pose.t));
  for (const band of bands) {
    drawn.ribbons.push({
      points: band.points,
      widths: band.widths,
      color: tones.ink,
      core: '#000000',
      alpha: pose.risen,
      blend: 'color',
    });
  }
}
