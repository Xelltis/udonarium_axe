import {
  asString,
  ImportedCharacter,
  ImportedParam,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  buildPrefixedSection,
  charasheetCharacterOf,
  isCharasheetGame,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The four abilities of that system, each held as the size of its die, in the order the headings of its own page give.
const ABILITIES: { key: string; label: string }[] = [
  { key: 'S1', label: '体力' },
  { key: 'S2', label: '敏捷' },
  { key: 'S3', label: '知力' },
  { key: 'S4', label: '精神' },
];

const CLASS_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'hantei', label: '判定' },
  { suffix: 'taishou', label: '対象' },
  { suffix: 'kouka', label: '効果' },
];

const SPELL_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'mp', label: 'MP' },
  { suffix: 'time', label: 'タイミング' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'range', label: '射程' },
  { suffix: 'memo', label: '効果' },
];

const ITEM_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'life', label: '耐久' },
  { suffix: 'weight', label: '重量' },
  { suffix: 'price', label: '価格' },
  { suffix: 'memo', label: '効果' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'class_name', label: 'クラス' },
  { key: 'shuzoku_name', label: '種族' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `ryutama` system token. */
export function isRyutamaCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'ryutama');
}

function buildParams(record: Record<string, unknown>): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const ability of ABILITIES) {
    if (isNonEmptyScalar(record[ability.key]))
      params.push({ label: ability.label, value: `d${asString(record[ability.key]).trim()}` });
  }
  return params;
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = ABILITIES.filter((ability) => isNonEmptyScalar(record[ability.key])).map(
    (ability) => `1d${asString(record[ability.key]).trim()} 【${ability.label}】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from a `ryutama` archive sheet, or null for any other sheet.
 *
 * Abilities become parameters written as the die they roll, such as `d8`; class abilities, spells,
 * belongings and the profile become sections; and the palette offers a roll of each ability's die.
 */
export function buildRyutamaCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isRyutamaCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Ryutama');

  character.params = buildParams(record);
  character.sections = [
    buildPrefixedSection('クラス能力', 'cls', CLASS_COLUMNS, record),
    buildPrefixedSection('呪文', 'spell', SPELL_COLUMNS, record),
    buildPrefixedSection('所持品', 'item', ITEM_COLUMNS, record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record);

  return character;
}
