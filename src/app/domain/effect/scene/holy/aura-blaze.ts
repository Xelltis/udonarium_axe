import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { type AuraTones } from '@axe/domain/effect/scene/holy/aura-parts';
import { glow, haze, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The blaze of an aura of fighting spirit: tongues of it standing close about the body of a piece and
 * licking straight up past its head, each a band that wavers as it climbs, torn at its edges by a
 * pattern that runs up it fast, laid in sheets as one body: a dark rim, its full deep colour, gold
 * within and a heart of light. They are drawn by halves, so those behind the piece stand in full and
 * those before it are thin enough to see it through. Tongues break off their tips and rise burning
 * over its head, and sparks are flung up out of it as it bursts.
 *
 * Every length here is in table pixels.
 */

/** One tongue of the blaze. */
interface Tongue {
  readonly turn: number;
  readonly out: number;
  readonly tall: number;
  readonly wide: number;
  readonly phase: number;
}

/** How a blaze stands at a moment: about what, how tall it reaches over the floor, how wide its tongues are and how fierce it is. */
export interface Blaze {
  readonly foot: Point;
  readonly cell: number;
  /** How far out from the middle of the piece its tongues are rooted. */
  readonly out: number;
  readonly tall: number;
  readonly wide: number;
  /** How many tongues it is made of. */
  readonly tongues: number;
  /** How much of it is seen, from nothing to 1. */
  readonly alpha: number;
  readonly seconds: number;
  readonly seed: number;
}

/** How wide a tongue is along it, from its root to its tip, as shares of its width. */
const SHARES = [0, 0.14, 0.32, 0.52, 0.72, 0.88, 1];
const WIDTHS = [0.8, 1, 0.95, 0.78, 0.5, 0.22, 0];
/** How much of the blaze is seen where it stands before the piece, against where it stands behind it. */
const SEEN_BEFORE = 0.3;
/** How fast the pattern runs up the tongues, in widths a second. */
const RUNS_UP = 7;
/** The sheets the tongues are laid in, the widest first. */
const SHEETS = [
  { wide: 1.5, tint: 'shade', core: undefined, alpha: 1, torn: 0.35, soft: 0.1, blend: 'color' },
  { wide: 1.15, tint: 'rim', core: 'deep', alpha: 1, torn: 0.5, soft: 0, blend: 'color' },
  { wide: 0.66, tint: 'deep', core: 'gold', alpha: 1, torn: 0.55, soft: 0, blend: 'color' },
  { wide: 0.26, tint: 'gold', core: 'pale', alpha: 0.45, torn: 0.3, soft: 0.4, blend: 'light' },
] as const;

/** The tones a blaze is laid in: the aura's own, its rim taken towards its shadow and its body towards its rim, so it burns deep. */
function blazeTonesOf(tones: AuraTones): AuraTones & { readonly deep: string } {
  return {
    ...tones,
    rim: mixColor(tones.rim, tones.shade, 0.2),
    deep: mixColor(tones.body, tones.rim, 0.45),
  };
}
/** How many tongues break off the tips at once, and how long one burns as it rises, in seconds. */
const BREAKING_OFF = 9;
const BREAKS_OFF_S = 0.55;

/** The tongues of a blaze at a moment: rooted in a ring about the piece, each of its own height, flickering. */
function tonguesOf(blaze: Blaze): Tongue[] {
  const next = seededRun(blaze.seed * 23 + 5);
  return Array.from({ length: blaze.tongues }, (_unused, index) => {
    const phase = next() * 6.28;
    const flicker =
      0.78 + 0.14 * Math.sin(blaze.seconds * 13 + phase) + 0.08 * Math.sin(blaze.seconds * 29 + phase * 2);
    const inner = index % 3 === 2;
    return {
      turn: (index / blaze.tongues) * Math.PI * 2 + next() * 0.4,
      out: blaze.out * (inner ? 0.55 : 0.9 + 0.2 * next()),
      tall: blaze.tall * (inner ? 1 : 0.6 + 0.35 * next()) * flicker,
      wide: blaze.wide * (inner ? 0.85 : 0.8 + 0.4 * next()),
      phase,
    };
  });
}

/** Lays the tongues of a blaze, a sheet at a time over all of them so they run together into one body. */
export function layBlaze(drawn: Staged, blaze: Blaze, aura: AuraTones): void {
  if (blaze.alpha <= 0.01) return;
  const tones = blazeTonesOf(aura);
  const { foot, seconds: t } = blaze;
  const tongues = tonguesOf(blaze);
  const bands = tongues.map((tongue) => {
    const points: Point[] = [];
    const about: Point[] = [];
    for (const share of SHARES) {
      const sway = Math.sin(t * 6.1 + tongue.phase + share * 5.4) * 0.22 * share;
      const turn = tongue.turn + sway;
      const out =
        tongue.out * (1 + 0.25 * share - 0.45 * share * share) +
        Math.sin(t * 8.3 + tongue.phase * 1.7 + share * 5) * tongue.wide * 0.25 * share;
      const z = foot.z + tongue.tall * share;
      points.push({ x: foot.x + Math.cos(turn) * out, y: foot.y + Math.sin(turn) * out, z });
      about.push({ x: foot.x, y: foot.y, z });
    }
    return { tongue, points, about, widths: WIDTHS.map((share) => share * tongue.wide) };
  });
  for (const sheet of SHEETS) {
    for (const band of bands) {
      for (const [half, seen] of [
        ['far', 1],
        ['near', SEEN_BEFORE],
      ] as const) {
        drawn.ribbons.push({
          points: band.points,
          about: band.about,
          half,
          widths: band.widths.map((wide) => wide * sheet.wide),
          color: tones[sheet.tint],
          core: sheet.core ? tones[sheet.core] : undefined,
          alpha: sheet.alpha * blaze.alpha * seen,
          blend: sheet.blend,
          torn: sheet.torn,
          soft: sheet.soft,
          flowed: -t * RUNS_UP + band.tongue.phase,
        });
      }
    }
  }
  layBreakingOff(drawn, blaze, tongues, tones);
}

/** Tongues broken off the tips of a blaze, each rising over the piece as it burns out, a dark rim under its colour. */
function layBreakingOff(drawn: Staged, blaze: Blaze, tongues: readonly Tongue[], tones: AuraTones): void {
  const { foot, cell, seconds: t } = blaze;
  const next = seededRun(blaze.seed * 41 + 9);
  for (let index = 0; index < BREAKING_OFF; index++) {
    const from = tongues[index % tongues.length];
    const phase = next();
    const age = ((t / BREAKS_OFF_S + phase) % 1) * BREAKS_OFF_S;
    const share = age / BREAKS_OFF_S;
    const wide = blaze.wide * (0.75 - 0.5 * share);
    const at = {
      x: foot.x + Math.cos(from.turn) * from.out * 0.6,
      y: foot.y + Math.sin(from.turn) * from.out * 0.6,
      z: foot.z + from.tall * 0.8 + cell * 2.2 * age,
    };
    const up = { x: Math.sin(t * 4 + index) * 0.2, y: 0, z: 1 };
    const paint = {
      alpha: blaze.alpha * Math.min(1, share * 8) * (1 - share),
      forward: cell * 0.3,
      variant: index * 1.7,
    };
    drawn.motes.push(
      flowingMote('lick', at, up, wide * 1.3, wide * 2.6, t * 6 + index, { ...paint, color: tones.shade }),
      flowingMote('lick', at, up, wide, wide * 2.3, t * 6 + index, { ...paint, color: tones.rim, core: tones.gold })
    );
  }
}

/**
 * Sparks flung up and out of a blaze as it bursts, `since` seconds after: white as they leave, cooling
 * to its gold and its colour, slowed and falling.
 */
export function layBurstSparks(
  drawn: Staged,
  foot: Point,
  cell: number,
  since: number,
  count: number,
  seed: number,
  tones: AuraTones
): void {
  if (since < 0 || since >= 0.6) return;
  const next = seededRun(seed * 31 + 17);
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const fast = cell * (2.5 + next() * 4);
    const up = cell * (4 + next() * 5);
    const life = 0.3 + next() * 0.3;
    if (since >= life) continue;
    const age = since / life;
    const slowed = Math.exp(-2.5 * since);
    const gone = (fast * (1 - slowed)) / 2.5;
    const at = {
      x: foot.x + Math.cos(turn) * (cell * 0.35 + gone),
      y: foot.y + Math.sin(turn) * (cell * 0.35 + gone),
      z: foot.z + cell * 0.3 + up * since - 6.5 * cell * since * since,
    };
    const velocity = {
      x: Math.cos(turn) * fast * slowed,
      y: Math.sin(turn) * fast * slowed,
      z: up - 13 * cell * since,
    };
    drawn.motes.push(
      { ...haze(at, cell * 0.14, tones.rim, 1 - age, cell * 0.3), shape: 'spark', velocity, trail: 0.05 },
      {
        ...glow(at, cell * 0.09, age < 0.35 ? '#ffffff' : tones.gold, 1 - age * age, cell * 0.3 + 1),
        shape: 'spark',
        velocity,
        trail: 0.04,
      }
    );
  }
}
