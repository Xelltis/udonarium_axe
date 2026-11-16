import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The parts of a shell that guards a piece: panes of glass, each a flat face with a dark rim, drawn
 * by halves so the far side of the shell stands behind the piece in full and the near side before it
 * thin enough to see the piece through; the light that runs over them; and the seal the shell stands
 * on. A pane is a short band along a line up the shell, wide in its middle and drawn to a point at
 * each end where it is a hexagon, turned about its line to face the eye.
 *
 * Every length here is in table pixels.
 */

/** The colours of a shell: the dark of its rims, its glass, its glow, and its pale and white lights. */
export interface ShellTones {
  readonly rim: string;
  readonly glass: string;
  readonly glow: string;
  readonly pale: string;
}

/** The colours of a shell, from an effect's ramp. */
export function shellTonesOf(ramp: readonly string[]): ShellTones {
  return { rim: mixColor(ramp[0], ramp[1], 0.3), glass: mixColor(ramp[1], ramp[2], 0.4), glow: ramp[3], pale: ramp[5] };
}

/** How a pane is seen at a moment. */
export interface PaneLook {
  /** The colour of its rim and of its glass. */
  readonly rim: string;
  readonly glass: string;
  /** How much of it is seen, and how much less of it on the near side of the shell. */
  readonly alpha: number;
  readonly nearShare: number;
  /** How bright the light on it is, from none to a white flash at 1. */
  readonly lit: number;
  /** The colour of the light on it. */
  readonly light: string;
  /** The colour of the shadow it is backed with on the far side of the shell, a little larger than it, where it has one. */
  readonly backing?: string;
}

/**
 * Lays one pane: its line from one end to the other, how wide it is at each point of it, and what
 * the shell it is a pane of stands about. A pane not seen at all may still be lit: its light alone
 * is laid, as a flash where it is about to stand.
 */
export function layPane(
  drawn: Staged,
  points: readonly Point[],
  widths: readonly number[],
  about: Point,
  look: PaneLook
): void {
  const seen = look.alpha > 0.01;
  if ((!seen && look.lit <= 0.01) || points.length < 2) return;
  const hubs = points.map(() => about);
  for (const [half, share] of [
    ['far', 1],
    ['near', look.nearShare],
  ] as const) {
    if (seen && look.backing && half === 'far') {
      drawn.ribbons.push({
        points: [...points],
        about: hubs,
        half,
        widths: widths.map((wide) => wide * 1.16 + 2),
        color: look.backing,
        alpha: 0.8 * look.alpha,
        blend: 'color',
      });
    }
    if (seen) {
      drawn.ribbons.push({
        points: [...points],
        about: hubs,
        half,
        widths: [...widths],
        color: look.rim,
        core: look.glass,
        alpha: look.alpha * share,
        blend: 'color',
      });
    }
    if (look.lit <= 0.01) continue;
    drawn.ribbons.push({
      points: [...points],
      about: hubs,
      half,
      widths: widths.map((wide) => wide * 0.86),
      color: look.light,
      core: '#ffffff',
      alpha: Math.min(1, look.lit) * (0.2 + 0.8 * share),
      blend: 'light',
    });
  }
}

/** How a line laid along a shell is seen: the colour of its dark sheath and of its light, and how much of each is seen. */
export interface ShellLineLook {
  readonly rim: string;
  readonly light: string;
  readonly alpha: number;
  readonly lit: number;
  /** How much less of it is seen on the near side of the shell. */
  readonly nearShare: number;
  /** Whether its dark sheath is laid on the near side of the shell too, and not on the far side alone. */
  readonly nearRim: boolean;
  /** Whether its light is laid on the near side of the shell too; on both sides where this is left out. */
  readonly nearLit?: boolean;
}

/**
 * Lays a line along a shell, drawn by halves: a dark sheath under a line of light, each point of it
 * on the near or the far side of the shell as it lies about the axis of the shell at its height. The
 * line lies on the shell itself, as the edges of its panes do, and is not turned to face the eye.
 */
export function layShellLine(
  drawn: Staged,
  points: readonly Point[],
  axis: Point,
  wide: number,
  look: ShellLineLook
): void {
  if (points.length < 2 || (look.alpha <= 0.01 && look.lit <= 0.01)) return;
  const about = points.map((point) => ({ x: axis.x, y: axis.y, z: point.z }));
  for (const [half, share] of [
    ['far', 1],
    ['near', look.nearShare],
  ] as const) {
    if (look.alpha > 0.01 && (half === 'far' || look.nearRim)) {
      drawn.ribbons.push({
        points: [...points],
        about,
        half,
        widths: wide,
        color: look.rim,
        alpha: look.alpha * share,
        blend: 'color',
      });
    }
    if (look.lit > 0.01 && (half === 'far' || look.nearLit !== false)) {
      drawn.ribbons.push({
        points: [...points],
        about,
        half,
        widths: wide * 0.5,
        color: look.light,
        core: '#ffffff',
        alpha: Math.min(1, look.lit) * (0.25 + 0.75 * share),
        blend: 'light',
        soft: 0.3,
      });
    }
  }
}

/** The seal a shell stands on: a dark ring, a ring of its glass, a line of light and a seal turning within. */
export function layShellSeal(
  drawn: Staged,
  floor: Point,
  radius: number,
  tones: ShellTones,
  alpha: number,
  turn: number
): void {
  if (alpha <= 0.01 || radius < 1) return;
  drawn.floor.push(floorMark('disc', floor, radius * 1.2, 1, tones.rim, 0.4 * alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius * 1.05, 0.18, tones.rim, 0.85 * alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius * 1.02, 0.1, tones.glass, alpha, 'color', 0));
  drawn.floor.push(floorMark('crest', floor, radius * 0.9, 0.09, tones.rim, 0.7 * alpha, 'color', 0, turn));
  drawn.floor.push(floorMark('crest', floor, radius * 0.9, 0.05, tones.glow, 0.9 * alpha, 'color', 0, turn));
  drawn.floor.push(floorMark('ring', floor, radius, 0.05, tones.pale, 0.9 * alpha, 'light', 0));
}

/** A ring of a shell's colours racing out over the floor, thinning as it goes. */
export function layShellRing(
  drawn: Staged,
  floor: Point,
  from: number,
  to: number,
  tones: ShellTones,
  share: number
): void {
  if (share <= 0 || share >= 1) return;
  const radius = from + (to - from) * (1 - (1 - share) * (1 - share) * (1 - share));
  const left = 1 - share;
  drawn.floor.push(floorMark('ring', floor, radius * 1.03, 0.12, tones.rim, 0.7 * left, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, 0.08, tones.glow, left, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, 0.05, '#ffffff', left, 'light', 0));
}
