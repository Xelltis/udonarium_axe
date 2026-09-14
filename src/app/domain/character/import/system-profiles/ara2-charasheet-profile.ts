import {
  asString,
  classifyScalar,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedParam,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  asArray,
  charasheetCharacterOf,
  isCharasheetGame,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The abilities of that system, in their usual order. One key holds the value and another the bonus rolled with.
const ABILITIES: { value: string; bonus: string; label: string }[] = [
  { value: 'NK1', bonus: 'NB1', label: '器用' },
  { value: 'NK2', bonus: 'NB2', label: '敏捷' },
  { value: 'NK3', bonus: 'NB3', label: '筋力' },
  { value: 'NK4', bonus: 'NB4', label: '感覚' },
  { value: 'NK5', bonus: 'NB5', label: '知力' },
  { value: 'NK6', bonus: 'NB6', label: '精神' },
];

const SKILL_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'lv', label: 'レベル' },
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'hantei', label: '判定' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'range', label: '射程' },
  { suffix: 'cost', label: 'コスト' },
  { suffix: 'shozoku', label: '所属' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'shuzoku', label: '種族' },
  { key: 'main_class', label: 'メインクラス' },
  { key: 'support_class', label: 'サポートクラス' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `ara2` system token. */
export function isAra2CharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'ara2');
}

function buildParams(record: Record<string, unknown>): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const ability of ABILITIES) {
    if (isNonEmptyScalar(record[ability.value]))
      params.push({ label: ability.label, value: asString(record[ability.value]) });
    if (isNonEmptyScalar(record[ability.bonus]))
      params.push({ label: `${ability.label}B`, value: asString(record[ability.bonus]) });
  }
  for (const [key, label] of [
    ['V_level', 'レベル'],
    ['V_fate', 'フェイト'],
  ] as const) {
    if (isNonEmptyScalar(record[key])) params.push({ label, value: asString(record[key]) });
  }
  return params;
}

function buildSkillSection(label: string, prefix: string, record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record[`${prefix}_name`]);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    for (const column of SKILL_COLUMNS) {
      const cell = asArray(record[`${prefix}_${column.suffix}`])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label: column.label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label, groups } : null;
}

function buildItemSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['item_name']);
  const columns: [string, string][] = [
    ['item_weight', '重量'],
    ['item_price', '価格'],
    ['item_memo', 'メモ'],
  ];
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    for (const [key, label] of columns) {
      const cell = asArray(record[key])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: '所持品', groups } : null;
}

function buildPalette(params: ImportedParam[]): string {
  const abilityLines = ABILITIES.filter((ability) => params.some((param) => param.label === `${ability.label}B`)).map(
    (ability) => `2d6+{${ability.label}B} 【${ability.label}判定】`
  );
  return ['2d6 【判定】', ...abilityLines].join('\n');
}

/**
 * Builds the imported model from an `ara2` archive sheet, or null for any other sheet.
 *
 * Abilities with their bonuses, level and fate become parameters; skills, general skills,
 * belongings and the profile become sections; and the palette offers a 2d6 roll for each ability
 * bonus.
 */
export function buildAra2CharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isAra2CharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Arianrhod');

  const params = buildParams(record);
  character.params = params;
  character.sections = [
    buildSkillSection('スキル', 'skill', record),
    buildSkillSection('一般スキル', 'ippanskill', record),
    buildItemSection(record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(params);

  return character;
}
