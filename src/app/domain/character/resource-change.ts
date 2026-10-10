import { ResourceSoundSet } from '@axe/domain/character/resource-feedback';

export type ResourceChangeKind = 'damage' | 'heal';

export type ResourceChangeSeverity = 'small' | 'medium' | 'large';

const MEDIUM_RATIO = 0.15;
const LARGE_RATIO = 0.4;

export interface ResourceSnapshot {
  current: number;
  max: number;
  inverted?: boolean;
  playsEffect?: boolean;
  playsSound?: boolean;
  soundSet?: ResourceSoundSet;
  /**
   * How often this end has changed that field.
   * A value arriving by load or sync does not count, which is how a real change is told apart.
   */
  changedBySelf?: number;
}

export interface ResourceChange {
  identifier: string;
  name: string;
  kind: ResourceChangeKind;
  delta: number;
  label: string;
  ratio: number;
  playsEffect: boolean;
  playsSound: boolean;
  soundSet: ResourceSoundSet;
}

/**
 * How hard a change hit, by the share of the maximum it moved: under 15% small, under 40% medium,
 * anything more large. A zero or unknown share reads as medium.
 */
export function resourceChangeSeverity(ratio: number): ResourceChangeSeverity {
  if (!Number.isFinite(ratio) || ratio <= 0) return 'medium';
  if (ratio < MEDIUM_RATIO) return 'small';
  if (ratio < LARGE_RATIO) return 'medium';
  return 'large';
}

/**
 * The change that moved the largest share of its maximum, or null for none. The earlier one wins a
 * tie.
 */
export function loudestChange(changes: readonly ResourceChange[]): ResourceChange | null {
  return changes.reduce<ResourceChange | null>(
    (loudest, change) => (loudest === null || change.ratio > loudest.ratio ? change : loudest),
    null
  );
}

/** The share of its maximum that the largest change moved, or 0 when nothing changed. */
export function loudestChangeRatio(changes: readonly ResourceChange[]): number {
  return loudestChange(changes)?.ratio ?? 0;
}

/**
 * The changes between two readings of a piece's resources, for the damage and healing effects.
 *
 * Only a field this browser changed itself counts; a value replaced by a load or a sync is passed
 * over. Moves of the current value and of the maximum add together, and whether it is damage
 * follows whether the resource grows worse as it rises.
 */
export function diffResourceSnapshots(
  before: ReadonlyMap<string, ResourceSnapshot>,
  after: ReadonlyMap<string, ResourceSnapshot>,
  nameOf: (identifier: string) => string
): ResourceChange[] {
  const changes: ResourceChange[] = [];

  for (const [identifier, next] of after) {
    const previous = before.get(identifier);
    if (!previous) continue;

    // Only what you changed counts; a value replaced by a load or a sync is no change.
    if ((next.changedBySelf ?? 0) <= (previous.changedBySelf ?? 0)) continue;

    const delta = next.current - previous.current + (next.max - previous.max);
    if (delta === 0) continue;

    const max = Math.max(previous.max, next.max);
    const worse = next.inverted ? delta > 0 : delta < 0;
    changes.push({
      identifier,
      name: nameOf(identifier),
      kind: worse ? 'damage' : 'heal',
      delta,
      label: `${delta < 0 ? '' : '+'}${trim(delta)}`,
      ratio: Number.isFinite(max) && max > 0 ? Math.abs(delta) / max : 0,
      playsEffect: next.playsEffect === true,
      playsSound: next.playsSound === true,
      soundSet: next.soundSet ?? 'flesh',
    });
  }
  return changes;
}

function trim(value: number): string {
  return Number(value.toFixed(2)).toString();
}
