import { BuffSnapshotEntry } from '@axe/domain/character/buff-manager';
import { TurnPhase } from '@axe/domain/tabletop/turn-state';

/**
 * How many steps back the round can be taken. Older ones fall off the end.
 *
 * A round taken side by side costs a step per side on top of one per piece, and a round
 * cannot be put back at all once the step that opened it has fallen off the end.
 */
export const TURN_HISTORY_LIMIT = 60;

export interface CharacterBuffSnapshot {
  identifier: string;
  buffs: BuffSnapshotEntry[];
}

/** Where the round stood before one step of it, and what that step did to the buffs. */
export interface TurnStep {
  round: number;
  phase: TurnPhase;
  currentIdentifier: string;
  currentSide: string;
  acted: string[];
  buffs: CharacterBuffSnapshot[];
}

export function parseTurnHistory(json: string): TurnStep[] {
  try {
    const parsed: unknown = JSON.parse(json || '[]');
    if (!Array.isArray(parsed)) return [];
    // A step written where the round had no sides carries none, and reads as none.
    return (parsed as TurnStep[]).map((step) => ({ ...step, currentSide: step.currentSide ?? '' }));
  } catch {
    return [];
  }
}

export function stringifyTurnHistory(steps: readonly TurnStep[]): string {
  return JSON.stringify(steps.slice(-TURN_HISTORY_LIMIT));
}

/**
 * The buffs a step moved, and only those.
 *
 * A step usually touches one character's buffs or none at all, so keeping the whole table's
 * would make the record grow by the size of the table on every press.
 */
export function changedBuffs(
  before: ReadonlyMap<string, BuffSnapshotEntry[]>,
  after: ReadonlyMap<string, BuffSnapshotEntry[]>
): CharacterBuffSnapshot[] {
  const changed: CharacterBuffSnapshot[] = [];
  for (const [identifier, buffs] of before) {
    const now = after.get(identifier) ?? [];
    if (JSON.stringify(now) !== JSON.stringify(buffs)) changed.push({ identifier, buffs });
  }
  return changed;
}
