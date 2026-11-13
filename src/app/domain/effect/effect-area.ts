import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/**
 * What an area attack takes in.
 *
 * It picks up by distance from the piece at the centre, nearest first.
 * That order is the order they fire in, so it spreads from the centre out.
 */

export interface EffectAreaCandidate {
  identifier: string;
  x: number;
  y: number;
}

export interface EffectAreaPoint {
  x: number;
  y: number;
}

/** Returns the pieces within the radius, nearest first, with the one at the centre always at the front. */
export function effectAreaTargets(
  center: EffectAreaPoint,
  candidates: readonly EffectAreaCandidate[],
  radius: number,
  limit: number
): string[] {
  if (!Number.isFinite(radius) || radius <= 0) return [];

  const withDistance = candidates
    .map((candidate) => ({
      identifier: candidate.identifier,
      distance: Math.hypot(candidate.x - center.x, candidate.y - center.y),
    }))
    .filter((entry) => entry.distance <= radius);

  withDistance.sort((left, right) => left.distance - right.distance);
  return withDistance.slice(0, Math.max(limit, 1)).map((entry) => entry.identifier);
}

/** The looks that go off where they land, which an area attack sets off whole only at its centre. */
const BLASTS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'burst',
  'nova',
  'mushroom',
  'impact',
  'rubble',
  'upheaval',
  'gravity',
  'frost',
]);

/** How large the blast an area attack strikes each target round its centre with is, as a share of the whole. */
const STRUCK_ROUND_SHARE = 0.4;

/**
 * How large an effect is drawn on one of its targets, as a share of its size. An area attack that
 * goes off where it lands goes off whole at the piece at its centre, the first of its targets, and
 * strikes each of the rest with a small blast of its own: gone off whole over every one of them, its
 * blasts would run together into a wall that hides the table.
 */
export function areaShareOf(
  preset: Pick<EffectPreset, 'areaRadiusCells' | 'effectKind'>,
  cast: Pick<EffectCast, 'targets'>,
  index: number
): number {
  if (index === 0 || cast.targets.length < 2 || preset.areaRadiusCells <= 0) return 1;
  return BLASTS.has(preset.effectKind) ? STRUCK_ROUND_SHARE : 1;
}
