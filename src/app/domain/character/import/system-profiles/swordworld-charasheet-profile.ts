import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import { isCharasheetGame } from '@axe/domain/character/import/system-profiles/charasheet-shared';
import { buildSwordWorldCharasheet } from '@axe/domain/character/import/system-profiles/swordworld-charasheet-shared';

const SW1_SKILL_COLUMNS = [
  { suffix: 'lv', label: 'レベル' },
  { suffix: 'kouka', label: '効果' },
  { suffix: 'zentei', label: '前提' },
  { suffix: 'eishou', label: '詠唱' },
];

/** Whether the pasted json is an archive sheet under the `swordworld` system token. */
export function isSwordWorldCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'swordworld');
}

/**
 * Builds the imported model from a `swordworld` archive sheet through the shared builder, reading
 * its skills from the `JK` columns. Null for any other sheet.
 */
export function buildSwordWorldCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  return buildSwordWorldCharasheet(parsed, {
    game: 'swordworld',
    dicebot: 'SwordWorld',
    skillLabel: '技能',
    skillPrefix: 'JK',
    skillColumns: SW1_SKILL_COLUMNS,
  });
}
