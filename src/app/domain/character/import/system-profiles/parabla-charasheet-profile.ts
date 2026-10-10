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

// The six abilities of that system, in the order the headings of its own page give.
// One key holds the ability and another the value added to the roll, which the real data shows to be two more.
const ABILITIES: { value: string; rate: string; label: string }[] = [
  { value: 'S1', rate: 'NB1', label: '肉体' },
  { value: 'S2', rate: 'NB2', label: '機敏' },
  { value: 'S3', rate: 'NB3', label: '感覚' },
  { value: 'S4', rate: 'NB4', label: '幸運' },
  { value: 'S5', rate: 'NB5', label: '知力' },
  { value: 'S6', rate: 'NB6', label: '精神' },
];

const POWER_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'shozoku', label: '系統' },
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'cost', label: 'コスト' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'range', label: '射程' },
  { suffix: 'memo', label: '効果' },
];

const WEAPON_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'hit', label: '命中' },
  { suffix: 'damage_dice', label: 'ダメージダイス' },
  { suffix: 'damage_base', label: 'ダメージ' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'race', label: '種族' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `parabla` system token. */
export function isParablaCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'parabla');
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = ABILITIES.filter((ability) => isNonEmptyScalar(record[ability.rate])).map(
    (ability) => `2d6+${asString(record[ability.rate]).trim()} 【${ability.label}判定】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from a `parabla` archive sheet, or null for any other sheet.
 *
 * Ability values become parameters; powers, weapons and the profile become sections; and the
 * palette offers a 2d6 roll with each ability's check value added.
 */
export function buildParablaCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isParablaCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'ParasiteBlood');

  character.params = paramsOf(
    record,
    ABILITIES.map((ability) => ({ key: ability.value, label: ability.label }))
  );
  character.sections = [
    buildPrefixedSection('異能', 'Power', POWER_COLUMNS, record),
    buildPrefixedSection('武器', 'arms', WEAPON_COLUMNS, record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record);

  return character;
}
