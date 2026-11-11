import { buffNoteItems, parseBuffModifierItem } from '@axe/domain/character/buff-modifier';
import type { DataElement } from '@axe/domain/data/data-element';

/**
 * The mark before a status a buff moves for whoever aims a line at the piece wearing it, rather than
 * for the piece: `相手の物理特攻+2` on a monster adds 2 to the `{物理特攻}` of every line aimed at it,
 * and moves nothing of the monster's own.
 */
export const AIMED_AT_MARK = '相手の';

/** Whether a status a buff names is one it moves for whoever aims at the piece wearing it; see {@link AIMED_AT_MARK}. */
export function isAimedAtStatus(status: string): boolean {
  const written = status.trim();
  return written.startsWith(AIMED_AT_MARK) && written.length > AIMED_AT_MARK.length;
}

/**
 * What the buffs a piece wears give whoever aims a line at it, status by status: every item of their
 * notes marked {@link AIMED_AT_MARK} that moves a status by an amount, added up, `相手の物理特攻+2`
 * giving 物理特攻 2. An item holding a status at a value, or one naming a part of a resource such as
 * its maximum, gives nothing, as it says nothing to add to a reference.
 */
export function aimedAtBonusesOf(buffs: readonly DataElement[]): Map<string, number> {
  const bonuses = new Map<string, number>();
  for (const buff of buffs) {
    for (const item of buffNoteItems(`${buff.currentValue ?? ''}`)) {
      if (!isAimedAtStatus(item)) continue;
      const request = parseBuffModifierItem(item.trim().slice(AIMED_AT_MARK.length));
      if (!request || request.operator !== 'add' || request.slot !== 'now') continue;
      bonuses.set(request.target, (bonuses.get(request.target) ?? 0) + request.amount);
    }
  }
  return bonuses;
}
