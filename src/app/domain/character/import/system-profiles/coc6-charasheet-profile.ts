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

interface SkillCategory {
  prefix: string;
  label: string;
  names: string[];
}

const SKILL_CATEGORIES: SkillCategory[] = [
  {
    prefix: 'TBA',
    label: '戦闘技能',
    names: [
      '回避',
      'キック',
      '組み付き',
      'こぶし(パンチ)',
      '頭突き',
      '投擲',
      'マーシャルアーツ',
      '拳銃',
      'サブマシンガン',
      'ショットガン',
      'マシンガン',
      'ライフル',
    ],
  },
  {
    prefix: 'TFA',
    label: '探索技能',
    names: [
      '応急手当',
      '鍵開け',
      '隠す',
      '隠れる',
      '聞き耳',
      '忍び歩き',
      '写真術',
      '精神分析',
      '追跡',
      '登攀',
      '図書館',
      '目星',
    ],
  },
  {
    prefix: 'TAA',
    label: '行動技能',
    names: ['運転', '機械修理', '重機械操作', '乗馬', '水泳', '製作', '操縦', '跳躍', '電気修理', 'ナビゲート', '変装'],
  },
  {
    prefix: 'TCA',
    label: '交渉技能',
    names: ['言いくるめ', '信用', '説得', '値切り', '母国語'],
  },
  {
    prefix: 'TKA',
    label: '知識技能',
    names: [
      '医学',
      'オカルト',
      '化学',
      'クトゥルフ神話',
      '芸術',
      '経理',
      '考古学',
      'コンピューター',
      '心理学',
      '人類学',
      '生物学',
      '地質学',
      '電子工学',
      '天文学',
      '博物学',
      '物理学',
      '法律',
      '薬学',
      '歴史',
    ],
  },
];

const ABILITIES: { key: string; label: string }[] = [
  { key: 'NA1', label: 'STR' },
  { key: 'NA2', label: 'CON' },
  { key: 'NA3', label: 'POW' },
  { key: 'NA4', label: 'DEX' },
  { key: 'NA5', label: 'APP' },
  { key: 'NA6', label: 'SIZ' },
  { key: 'NA7', label: 'INT' },
  { key: 'NA8', label: 'EDU' },
];

const DERIVED: { key: string; label: string }[] = [
  { key: 'NA12', label: 'アイデア' },
  { key: 'NA11', label: '幸運' },
  { key: 'NA14', label: '知識' },
];

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
  'SAN_Left',
  'SAN_Max',
  'SAN_Danger',
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
    /^T(BA|FA|AA|CA|KA)/.test(key) ||
    key.startsWith('arms_') ||
    key.startsWith('item_')
  );
}

/** Whether the pasted json is an archive sheet under the `coc` system token. */
export function isCoc6CharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'coc');
}

function buildStatuses(record: Record<string, unknown>): ImportedStatus[] {
  const statuses: ImportedStatus[] = [];
  if (isNonEmptyScalar(record['SAN_Max'])) {
    const max = toFiniteNumber(record['SAN_Max'], 0);
    const left = isNonEmptyScalar(record['SAN_Left']) ? toFiniteNumber(record['SAN_Left'], max) : max;
    statuses.push({ label: '正気度', value: left, max });
  }
  if (isNonEmptyScalar(record['NA9'])) {
    const hp = toFiniteNumber(record['NA9'], 0);
    statuses.push({ label: 'HP', value: hp, max: hp });
  }
  if (isNonEmptyScalar(record['NA10'])) {
    const mp = toFiniteNumber(record['NA10'], 0);
    statuses.push({ label: 'MP', value: mp, max: mp });
  }
  return statuses;
}

function buildParams(record: Record<string, unknown>): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const ability of ABILITIES) {
    if (isNonEmptyScalar(record[ability.key]))
      params.push({ label: ability.label, value: asString(record[ability.key]) });
  }
  for (const derived of DERIVED) {
    if (isNonEmptyScalar(record[derived.key]))
      params.push({ label: derived.label, value: asString(record[derived.key]) });
  }
  return params;
}

function collectSkills(record: Record<string, unknown>): CocSkill[] {
  const skills: CocSkill[] = [];
  for (const category of SKILL_CATEGORIES) {
    const totals = asArray(record[`${category.prefix}P`]);
    const bases = asArray(record[`${category.prefix}D`]);
    const customNames = asArray(record[`${category.prefix}Name`]);
    const rowCount = Math.max(totals.length, bases.length, category.names.length + customNames.length);

    for (let i = 0; i < rowCount; i++) {
      const name =
        i < category.names.length ? category.names[i] : asString(customNames[i - category.names.length]).trim();
      if (name === '') continue;

      const total = toFiniteNumber(totals[i], NaN);
      const base = toFiniteNumber(bases[i], NaN);
      const value = Number.isFinite(total) ? total : base;
      if (!Number.isFinite(value)) continue;

      skills.push({ category: category.label, name, value });
    }
  }
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
  const lines: string[] = ['CCB<=50 【1D100ロール】'];

  const abilityLines = ABILITIES.filter((ability) => params.some((param) => param.label === ability.label)).map(
    (ability) => `CCB<={${ability.label}}*5 【${ability.label}】`
  );
  const derivedLines = DERIVED.filter((derived) => params.some((param) => param.label === derived.label)).map(
    (derived) => `CCB<={${derived.label}} 【${derived.label}】`
  );
  if (abilityLines.length > 0 || derivedLines.length > 0) lines.push('◆能力値', ...abilityLines, ...derivedLines);

  if (statuses.some((status) => status.label === '正気度')) lines.push('◆正気度', 'CCB<={正気度} 【正気度ロール】');

  const skillLines = skills.map((skill) => `CCB<={${skill.name}} 【${skill.name}】`);
  if (skillLines.length > 0) lines.push('◆技能', ...skillLines);

  const damageBonus = asString(record['dmg_bonus']).trim();
  if (damageBonus !== '' && damageBonus !== '0') lines.push('◆戦闘', `${damageBonus} 【ダメージボーナス】`);

  return lines.join('\n');
}

/**
 * Builds the imported model from a `coc` archive sheet, or null for any other sheet.
 *
 * Sanity, HP and MP become resources; abilities and derived values parameters; skills grouped by
 * category, weapons, belongings and the remaining keys sections; and the palette offers percentile
 * rolls for the abilities, sanity, each skill and the damage bonus.
 */
export function buildCoc6CharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isCoc6CharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Cthulhu');

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
