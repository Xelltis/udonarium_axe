import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import { isCharasheetGame } from '@axe/domain/character/import/system-profiles/charasheet-shared';
import { buildSwordWorldCharasheet } from '@axe/domain/character/import/system-profiles/swordworld-charasheet-shared';

const SW2_SKILL_COLUMNS = [
  { suffix: 'lv', label: 'レベル' },
  { suffix: 'kouka', label: '効果' },
  { suffix: 'zentei', label: '前提' },
];

/** Whether the pasted json is an archive sheet under the `swordworld2` system token. */
export function isSwordWorld2CharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'swordworld2');
}

/**
 * Builds the imported model from a `swordworld2` archive sheet through the shared builder, reading
 * its skills from the `ST` columns. Null for any other sheet.
 */
export function buildSwordWorld2CharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  return buildSwordWorldCharasheet(parsed, {
    game: 'swordworld2',
    dicebot: 'SwordWorld2.0',
    skillLabel: '技能',
    skillPrefix: 'ST',
    skillColumns: SW2_SKILL_COLUMNS,
  });
}
