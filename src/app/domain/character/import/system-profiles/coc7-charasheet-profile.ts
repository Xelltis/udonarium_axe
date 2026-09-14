import {
  asString,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedParam,
  ImportedSection,
  ImportedStatus,
  isNonEmptyScalar,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';
import {
  asArray,
  buildOtherSection,
  buildParallelSection,
  charasheetCharacterOf,
  isCharasheetGame,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';
import { ITEM_COLUMNS, WEAPON_COLUMNS } from '@axe/domain/character/import/system-profiles/coc-charasheet-shared';

const ABILITIES: { key: string; label: string }[] = [
  { key: 'NA1', label: 'STR' },
  { key: 'NA2', label: 'CON' },
  { key: 'NA3', label: 'DEX' },
  { key: 'NA4', label: 'APP' },
  { key: 'NA5', label: 'POW' },
  { key: 'NA6', label: 'SIZ' },
  { key: 'NA7', label: 'INT' },
  { key: 'NA8', label: 'EDU' },
];

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  '0': '戦闘技能',
  '1': '探索技能',
  '2': '行動技能',
  '3': '技術技能',
  '4': '交渉技能',
  '5': '知識技能',
};

const EXCLUDED_KEYS = new Set([
  'pc_name',
  'color',
  'base64Image',
  'url',
  'pc_making_environ',
  'pc_id',
  'password',
  'pc_password',
  'game',
  'dmg_bonus',
  'build_bonus',
  'SAN_Left',
  'SAN_Max',
  'SAN_Danger',
  'SAN_start',
  'Luck_Left',
  'Luck_start',
  'works_param',
  'phrase',
  'money',
  'block_account',
  'mode',
  'message',
  'pc_tags',
]);

interface CocSkill {
  category: string;
  name: string;
  value: number;
}

function isStructuredKey(key: string): boolean {
  return (
    EXCLUDED_KEYS.has(key) ||
    /^NA\d+$/.test(key) ||
    /^(NP|NS|NM)\d+$/.test(key) ||
    /^SK[A-Z]/.test(key) ||
    /_(Total|Maximum)$/.test(key) ||
    key.startsWith('arms_') ||
    key.startsWith('item_') ||
    key.startsWith('V_') ||
    key.startsWith('SL_') ||
    key.startsWith('kihon_') ||
    key.startsWith('is_disp') ||
    key.startsWith('save_') ||
    key.startsWith('data_') ||
    key.startsWith('price_') ||
    key.startsWith('color_') ||
    key.startsWith('dodontof') ||
    key.startsWith('pc_making')
  );
}

/** Whether the pasted json is an archive sheet under the `coc7` system token. */
export function isCoc7CharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'coc7');
}

function buildStatuses(record: Record<string, unknown>): ImportedStatus[] {
  const statuses: ImportedStatus[] = [];
  if (isNonEmptyScalar(record['SAN_Max'])) {
    const max = toFiniteNumber(record['SAN_Max'], 0);
    const left = isNonEmptyScalar(record['SAN_Left']) ? toFiniteNumber(record['SAN_Left'], max) : max;
    statuses.push({ label: '正気度', value: left, max });
  }
  if (isNonEmptyScalar(record['NA10'])) {
    const hp = toFiniteNumber(record['NA10'], 0);
    statuses.push({ label: 'HP', value: hp, max: hp });
  }
  if (isNonEmptyScalar(record['NA11'])) {
    const mp = toFiniteNumber(record['NA11'], 0);
    statuses.push({ label: 'MP', value: mp, max: mp });
  }
  if (isNonEmptyScalar(record['Luck_Left'])) {
    const left = toFiniteNumber(record['Luck_Left'], 0);
    const max = isNonEmptyScalar(record['Luck_start']) ? toFiniteNumber(record['Luck_start'], left) : left;
    statuses.push({ label: '幸運', value: left, max: Math.max(max, left) });
  }
  return statuses;
}

function buildParams(record: Record<string, unknown>): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const ability of ABILITIES) {
    if (isNonEmptyScalar(record[ability.key]))
      params.push({ label: ability.label, value: asString(record[ability.key]) });
  }
  if (isNonEmptyScalar(record['NA9'])) params.push({ label: '移動率', value: asString(record['NA9']) });
  if (isNonEmptyScalar(record['dmg_bonus']))
    params.push({ label: 'ダメージボーナス', value: asString(record['dmg_bonus']) });
  if (isNonEmptyScalar(record['build_bonus'])) params.push({ label: 'ビルド', value: asString(record['build_bonus']) });
  return params;
}

function collectSkills(record: Record<string, unknown>): CocSkill[] {
  const names = asArray(record['SKAN']);
  const totals = asArray(record['SKAP']);
  const bases = asArray(record['SKAD']);
  const types = asArray(record['SKTP']);

  const skills: CocSkill[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const total = toFiniteNumber(totals[index], NaN);
    const base = toFiniteNumber(bases[index], NaN);
    const value = Number.isFinite(total) ? total : base;
    if (!Number.isFinite(value)) return;
    const category = SKILL_CATEGORY_LABELS[asString(types[index]).trim()] ?? '技能';
    skills.push({ category, name, value });
  });
  return skills;
}

function buildSkillSection(skills: CocSkill[]): ImportedSection | null {
  if (skills.length === 0) return null;
  const groupsByCategory = new Map<string, ImportedField[]>();
  for (const skill of skills) {
    const fields = groupsByCategory.get(skill.category) ?? [];
    fields.push({ label: skill.name, value: skill.value, kind: 'number' });
    groupsByCategory.set(skill.category, fields);
  }
  const groups: ImportedGroup[] = [...groupsByCategory.entries()].map(([label, fields]) => ({ label, fields }));
  return { label: '技能', groups };
}

function buildPalette(
  params: ImportedParam[],
  statuses: ImportedStatus[],
  skills: CocSkill[],
  record: Record<string, unknown>
): string {
  const lines: string[] = ['CC<=50 【1D100ロール】'];

  const abilityLines = ABILITIES.filter((ability) => params.some((param) => param.label === ability.label)).map(
    (ability) => `CC<={${ability.label}} 【${ability.label}】`
  );
  if (statuses.some((status) => status.label === '幸運')) abilityLines.push('CC<={幸運} 【幸運】');
  if (abilityLines.length > 0) lines.push('◆能力値', ...abilityLines);

  if (statuses.some((status) => status.label === '正気度')) lines.push('◆正気度', 'CC<={正気度} 【正気度ロール】');

  const skillLines = skills.map((skill) => `CC<={${skill.name}} 【${skill.name}】`);
  if (skillLines.length > 0) lines.push('◆技能', ...skillLines);

  const damageBonus = asString(record['dmg_bonus']).trim();
  if (damageBonus !== '' && damageBonus !== '0') lines.push('◆戦闘', `${damageBonus} 【ダメージボーナス】`);

  return lines.join('\n');
}

/**
 * Builds the imported model from a `coc7` archive sheet, or null for any other sheet.
 *
 * Sanity, HP, MP and luck become resources; abilities, movement, damage bonus and build parameters;
 * named skills grouped by type, weapons, belongings and the remaining keys sections; and the
 * palette offers percentile rolls for the abilities, luck, sanity, each skill and the damage bonus.
 */
export function buildCoc7CharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isCoc7CharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Cthulhu7th');

  const statuses = buildStatuses(record);
  const params = buildParams(record);
  const skills = collectSkills(record);
  character.statuses = statuses;
  character.params = params;
  character.sections = [
    buildSkillSection(skills),
    buildParallelSection('武器', 'arms_name', WEAPON_COLUMNS, record),
    buildParallelSection('所持品', 'item_name', ITEM_COLUMNS, record),
    buildOtherSection(record, isStructuredKey),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(params, statuses, skills, record);

  return character;
}
