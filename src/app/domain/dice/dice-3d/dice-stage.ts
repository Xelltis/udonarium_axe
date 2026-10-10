/**
 * Where a room shows the dice of a chat roll tumbling: in the frame of the line that gives the
 * result, on the table, in both at once, or nowhere.
 */
export type DiceStage = 'off' | 'frame' | 'table' | 'both';

export const DICE_STAGES: readonly DiceStage[] = ['off', 'frame', 'table', 'both'];

/**
 * Reads a room's setting. Anything else, such as nothing at all from a room saved before the
 * setting was there, is `off`; so is `both` to a build from before it was offered.
 */
export function asDiceStage(raw: unknown): DiceStage {
  return raw === 'frame' || raw === 'table' || raw === 'both' ? raw : 'off';
}

/** Whether a room shows its rolls' dice in the frame of their lines. */
export function showsInFrame(stage: DiceStage): boolean {
  return stage === 'frame' || stage === 'both';
}

/** Whether a room shows its rolls' dice on the table. */
export function showsOnTable(stage: DiceStage): boolean {
  return stage === 'table' || stage === 'both';
}
