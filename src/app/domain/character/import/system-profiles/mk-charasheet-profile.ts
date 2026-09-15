import {
  asString,
  classifyScalar,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  asArray,
  charasheetCharacterOf,
  isCharasheetGame,
  paramsOf,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// That system's eight values, in the order the headings of its own page give.
// The first four are rolled with and the last four are lesser values.
const PRIMARY: { key: string; label: string }[] = [
  { key: 'NC1', label: '才覚' },
  { key: 'NC2', label: '魅力' },
  { key: 'NC3', label: '探索' },
  { key: 'NC4', label: '武勇' },
];

const SECONDARY: { key: string; label: string }[] = [
  { key: 'NC5', label: '器' },
  { key: 'NC6', label: '回避' },
  { key: 'NC7', label: '配下' },
  { key: 'NC8', label: '気力' },
];

const SKILL_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'memo', label: '効果' },
  { suffix: 'shozoku', label: '所属' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'class_name', label: 'クラス' },
  { key: 'job1_name', label: 'ジョブ' },
  { key: 'jobginou_name', label: 'ジョブ技能' },
  { key: 'nation_name', label: '所属国家' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `mk` system token. */
export function isMkCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'mk');
}

function buildSkillSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['ginou_name']);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    for (const column of SKILL_COLUMNS) {
      const cell = asArray(record[`ginou_${column.suffix}`])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label: column.label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: '技能', groups } : null;
}

function buildConneSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['conne_name']);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    for (const [suffix, label] of [
      ['like', '好意'],
      ['dislike', '敵意'],
    ] as const) {
      const cell = asArray(record[`conne_${suffix}`])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: 'コネ', groups } : null;
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = PRIMARY.filter((ability) => isNonEmptyScalar(record[ability.key])).map(
    (ability) => `2MK+${asString(record[ability.key]).trim()} 【${ability.label}判定】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from an `mk` archive sheet, or null for any other sheet.
 *
 * The primary and secondary abilities become parameters; skills, connections and the profile become
 * sections; and the palette offers a roll for each primary ability.
 */
export function buildMkCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isMkCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'MeikyuKingdom');

  character.params = paramsOf(record, [...PRIMARY, ...SECONDARY]);
  character.sections = [
    buildSkillSection(record),
    buildConneSection(record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record);

  return character;
}
