export interface EffectCastTarget {
  identifier: string;
  x: number;
  y: number;
  z: number;
}

export interface EffectCast {
  presetIdentifier: string;
  casterIdentifier: string;
  /** Where a projectile is fired from. Without one it comes straight down onto the target. */
  origin: EffectCastPoint | null;
  targets: EffectCastTarget[];
  seed: number;
}

export interface EffectCastPoint {
  x: number;
  y: number;
  z: number;
}

const MAX_TARGETS_PER_CAST = 32;

/**
 * Reads a cast that came in over the network into a shape that is safe to play.
 *
 * Null when there is no effect named or no target left to play on. Targets past 32 are
 * dropped, and a coordinate or seed that is not a number reads as 0.
 */
export function normalizeEffectCast(raw: unknown): EffectCast | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;

  const presetIdentifier = typeof source['presetIdentifier'] === 'string' ? source['presetIdentifier'] : '';
  if (presetIdentifier.length < 1) return null;

  const rawTargets = Array.isArray(source['targets']) ? source['targets'] : [];
  const targets: EffectCastTarget[] = [];
  for (const rawTarget of rawTargets.slice(0, MAX_TARGETS_PER_CAST)) {
    const target = normalizeTarget(rawTarget);
    if (target) targets.push(target);
  }
  if (targets.length < 1) return null;

  return {
    presetIdentifier,
    casterIdentifier: typeof source['casterIdentifier'] === 'string' ? source['casterIdentifier'] : '',
    origin: normalizePoint(source['origin']),
    targets,
    seed: coerceNumber(source['seed'], 0),
  };
}

function normalizePoint(raw: unknown): EffectCastPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  return {
    x: coerceNumber(source['x'], 0),
    y: coerceNumber(source['y'], 0),
    z: coerceNumber(source['z'], 0),
  };
}

function normalizeTarget(raw: unknown): EffectCastTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  return {
    identifier: typeof source['identifier'] === 'string' ? source['identifier'] : '',
    x: coerceNumber(source['x'], 0),
    y: coerceNumber(source['y'], 0),
    z: coerceNumber(source['z'], 0),
  };
}

function coerceNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
