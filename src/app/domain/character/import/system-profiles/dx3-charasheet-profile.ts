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

const ABILITIES: { key: string; label: string }[] = [
  { key: 'S1', label: '肉体' },
  { key: 'S2', label: '感覚' },
  { key: 'S3', label: '精神' },
  { key: 'S4', label: '社会' },
];

// The archive holds its twelve fixed skills as parallel arrays, three under each ability in turn.
// The field of study of a knowledge or information skill sits in the note beside it, as the real data shows.
const SKILLS: string[] = ['白兵', '回避', '運転', '射撃', '知覚', '芸術', 'RC', '意志', '知識', '交渉', '調達', '情報'];

const EFFECT_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'lv', label: 'レベル' },
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'hantei', label: '判定' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'range', label: '射程' },
  { suffix: 'cost', label: '侵蝕値' },
  { suffix: 'shozoku', label: 'シンドローム' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'works', label: 'ワークス' },
  { key: 'cover', label: 'カヴァー' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `dx3` system token. */
export function isDx3CharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'dx3');
}

function skillDisplayName(index: number, record: Record<string, unknown>): string {
  const base = SKILLS[index];
  const field = asString(asArray(record['skill_memo'])[index]).trim();
  return field === '' ? base : `${base}:${field}`;
}

function skillRoll(index: number, record: Record<string, unknown>): string {
  // The total comes in one notation and is converted into the one the dice bot reads.
  const total = asString(asArray(record['skill_total'])[index]).trim();
  if (total === '' || !/\dr/i.test(total)) return '';
  return total.replace(/r/gi, 'DX');
}

function buildSkillSection(record: Record<string, unknown>): ImportedSection | null {
  const groups: ImportedGroup[] = [];
  SKILLS.forEach((_, index) => {
    const roll = skillRoll(index, record);
    if (roll === '') return;
    const fields: ImportedField[] = [{ label: '技能値', value: roll, kind: 'text' }];
    const level = asArray(record['skill_tokugi'])[index];
    if (isNonEmptyScalar(level)) {
      const classified = classifyScalar(level);
      fields.push({ label: 'レベル', value: classified.value, kind: classified.kind });
    }
    groups.push({ label: skillDisplayName(index, record), fields });
  });
  return groups.length > 0 ? { label: '技能', groups } : null;
}

function buildEffectSection(label: string, prefix: string, record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record[`${prefix}_name`]);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    for (const column of EFFECT_COLUMNS) {
      const cell = asArray(record[`${prefix}_${column.suffix}`])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label: column.label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label, groups } : null;
}

function buildPalette(record: Record<string, unknown>): string {
  const lines: string[] = ['1DX 【判定】'];
  const skillLines: string[] = [];
  SKILLS.forEach((_, index) => {
    const roll = skillRoll(index, record);
    if (roll === '') return;
    skillLines.push(`${roll} 【${skillDisplayName(index, record)}】`);
  });
  if (skillLines.length > 0) lines.push('◆技能', ...skillLines);
  return lines.join('\n');
}

/**
 * Builds the imported model from a `dx3` archive sheet, or null for any other sheet.
 *
 * Abilities become parameters; the fixed skills with their totals converted to the dice bot's
 * notation, effects, combos and the profile become sections; and the palette offers a roll for each
 * skill that has a total.
 */
export function buildDx3CharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isDx3CharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'DoubleCross');

  character.params = paramsOf(record, ABILITIES);
  character.sections = [
    buildSkillSection(record),
    buildEffectSection('エフェクト', 'effect', record),
    buildEffectSection('コンボ', 'easyeffect', record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record);

  return character;
}
