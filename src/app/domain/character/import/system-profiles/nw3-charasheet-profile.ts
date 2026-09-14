import {
  asString,
  ImportedCharacter,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  buildPrefixedSection,
  charasheetCharacterOf,
  isCharasheetGame,
  paramsOf,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The abilities of that system, in the order the headings of its own page give.
const ABILITIES: { key: string; label: string }[] = [
  { key: 'S1', label: '筋力' },
  { key: 'S2', label: '器用' },
  { key: 'S3', label: '感覚' },
  { key: 'S4', label: '理知' },
  { key: 'S5', label: '意思' },
  { key: 'S6', label: '幸運' },
  { key: 'S7', label: '耐久' },
  { key: 'S8', label: '魔法' },
];

const EFFECT_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'lv', label: 'レベル' },
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'hantei', label: '判定' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'range', label: '射程' },
  { suffix: 'cost', label: '代償' },
  { suffix: 'shozoku', label: 'クラス' },
  { suffix: 'memo', label: '効果' },
];

const WEAPON_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'range', label: '射程' },
  { suffix: 'memory', label: '記憶' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'level', label: 'レベル' },
  { key: 'class1_name', label: 'クラス1' },
  { key: 'class2_name', label: 'クラス2' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `nw3` system token. */
export function isNw3CharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'nw3');
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = ABILITIES.filter((ability) => isNonEmptyScalar(record[ability.key])).map(
    (ability) => `${asString(record[ability.key]).trim()}NW 【${ability.label}】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from an `nw3` archive sheet, or null for any other sheet.
 *
 * Abilities become parameters; feats, weapons and the profile become sections; and the palette
 * offers a roll for each ability.
 */
export function buildNw3CharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isNw3CharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'NightWizard3rd');

  character.params = paramsOf(record, ABILITIES);
  character.sections = [
    buildPrefixedSection('特技', 'effect', EFFECT_COLUMNS, record),
    buildPrefixedSection('武器', 'arms', WEAPON_COLUMNS, record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record);

  return character;
}
