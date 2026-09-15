import {
  asString,
  classifyScalar,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedParam,
  ImportedSection,
  ImportedStatus,
  isNonEmptyScalar,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';
import { labeledSection } from '@axe/domain/character/import/system-profiles/labeled-section';

interface FieldLabel {
  key: string;
  label: string;
}

const BASE_ABILITIES: FieldLabel[] = [
  { key: 'body', label: '肉体' },
  { key: 'sense', label: '感覚' },
  { key: 'mind', label: '精神' },
  { key: 'society', label: '社会' },
];

const COMMON_SKILLS: { key: string; name: string; ability: string }[] = [
  { key: 'hak', name: '白兵', ability: '肉体' },
  { key: 'kai', name: '回避', ability: '肉体' },
  { key: 'sha', name: '射撃', ability: '感覚' },
  { key: 'tik', name: '知覚', ability: '感覚' },
  { key: 'rc', name: 'RC', ability: '精神' },
  { key: 'isi', name: '意志', ability: '精神' },
  { key: 'kou', name: '交渉', ability: '社会' },
  { key: 'tyo', name: '調達', ability: '社会' },
];

const COMBO_FIELDS: FieldLabel[] = [
  { key: 'timing', label: 'タイミング' },
  { key: 'type', label: '種別' },
  { key: 'target', label: '対象' },
  { key: 'range', label: '射程' },
  { key: 'attack', label: '攻撃力' },
  { key: 'cost', label: '侵蝕値' },
  { key: 'critical', label: 'C値' },
  { key: 'dice', label: 'ダイス' },
  { key: 'combination', label: 'コンボ構成' },
  { key: 'notes', label: '効果' },
];

const ARTS_FIELDS: FieldLabel[] = [
  { key: 'level', label: 'レベル' },
  { key: 'type', label: '種別' },
  { key: 'timing', label: 'タイミング' },
  { key: 'target', label: '対象' },
  { key: 'range', label: '射程' },
  { key: 'cost', label: '侵蝕値' },
  { key: 'limit', label: '制限' },
  { key: 'notes', label: '効果' },
];

const WEAPON_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'skill', label: '技能' },
  { key: 'attack', label: '攻撃' },
  { key: 'guard', label: 'ガード' },
  { key: 'range', label: '射程' },
  { key: 'notes', label: '効果' },
];

const ARMOUR_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'armour', label: '装甲' },
  { key: 'dodge', label: 'ドッジ' },
  { key: 'notes', label: '効果' },
];

const ITEM_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'skill', label: '技能' },
  { key: 'notes', label: '効果' },
];

const LOIS_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'Pemotion', label: 'P感情' },
  { key: 'Nemotion', label: 'N感情' },
  { key: 'txt', label: '説明' },
];

const PROFILE_FIELDS: FieldLabel[] = [
  { key: 'nameKana', label: 'ふりがな' },
  { key: 'sex', label: '性別' },
  { key: 'age', label: '年齢' },
  { key: 'cover', label: 'カヴァー' },
  { key: 'works', label: 'ワークス' },
  { key: 'Height', label: '身長' },
  { key: 'weight', label: '体重' },
  { key: 'blood', label: '血液型' },
  { key: 'zodiac', label: '星座' },
  { key: 'player', label: 'PL' },
];

interface Dx3Skill {
  name: string;
  ability: string;
  level: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function resolveRoot(record: Record<string, unknown>): Record<string, unknown> {
  if (asRecord(record['base']) != null || asRecord(record['baseAbility']) != null) return record;
  return asRecord(record['data']) ?? record;
}

/**
 * Whether the pasted json has the shape of a warehouse character: a named `base` or a
 * `baseAbility`, bare or wrapped in `data`.
 *
 * Every warehouse character has that shape, so this is only asked once the `dx3` slug has chosen
 * the profile.
 */
export function isDx3AppspotCharacter(parsed: unknown): boolean {
  const record = asRecord(parsed);
  if (!record) return false;
  const root = resolveRoot(record);
  const base = asRecord(root['base']);
  return (base != null && typeof base['name'] === 'string') || asRecord(root['baseAbility']) != null;
}

function totalOf(container: Record<string, unknown>, key: string): string {
  const entry = asRecord(container[key]);
  return entry ? asString(entry['total']) : '';
}

function buildParams(root: Record<string, unknown>): ImportedParam[] {
  const params: ImportedParam[] = [];
  const baseAbility = asRecord(root['baseAbility']) ?? {};
  for (const ability of BASE_ABILITIES) {
    const value = totalOf(baseAbility, ability.key);
    if (value !== '') params.push({ label: ability.label, value });
  }
  const sub = asRecord(root['subAbility']) ?? {};
  for (const [key, label] of [
    ['action', '行動値'],
    ['moveZen', '全力移動'],
    ['moveSen', '通常移動'],
  ] as const) {
    const value = totalOf(sub, key);
    if (value !== '') params.push({ label, value });
  }
  return params;
}

function buildStatuses(root: Record<string, unknown>): ImportedStatus[] {
  const sub = asRecord(root['subAbility']) ?? {};
  const statuses: ImportedStatus[] = [];
  const hp = totalOf(sub, 'hp');
  if (hp !== '') {
    const value = toFiniteNumber(hp, 0);
    statuses.push({ label: 'HP', value, max: value });
  }
  const erotion = totalOf(sub, 'erotion');
  if (erotion !== '') {
    const value = toFiniteNumber(erotion, 0);
    statuses.push({ label: '侵蝕率', value, max: Math.max(100, value) });
  }
  return statuses;
}

function collectSkills(root: Record<string, unknown>): Dx3Skill[] {
  const skillsObj = asRecord(root['skills']) ?? {};
  const skills: Dx3Skill[] = [];
  for (const common of COMMON_SKILLS) {
    const entry = asRecord(skillsObj[common.key]);
    const a = entry ? asRecord(entry['A']) : null;
    const level = a ? toFiniteNumber(a['lv'], 0) : 0;
    skills.push({ name: common.name, ability: common.ability, level });
  }
  for (const element of asArray(skillsObj['B'])) {
    const record = asRecord(element);
    if (!record) continue;
    for (let i = 1; i <= 4; i++) {
      const name = asString(record[`name${i}`]).trim();
      if (name === '') continue;
      skills.push({ name, ability: '', level: toFiniteNumber(record[`lv${i}`], 0) });
    }
  }
  return skills;
}

function buildSkillSection(skills: Dx3Skill[]): ImportedSection | null {
  if (skills.length === 0) return null;
  const groupsByAbility = new Map<string, ImportedField[]>();
  for (const skill of skills) {
    const group = skill.ability === '' ? 'その他技能' : `${skill.ability}技能`;
    const fields = groupsByAbility.get(group) ?? [];
    fields.push({ label: skill.name, value: skill.level, kind: 'number' });
    groupsByAbility.set(group, fields);
  }
  const groups: ImportedGroup[] = [...groupsByAbility.entries()].map(([label, fields]) => ({ label, fields }));
  return { label: '技能', groups };
}

function buildProfileSection(base: Record<string, unknown> | null): ImportedSection | null {
  if (!base) return null;
  const fields: ImportedField[] = [];
  const syndromes = asRecord(base['syndromes']);
  if (syndromes) {
    const parts = ['primary', 'secondary', 'tertiary']
      .map((key) => {
        const entry = asRecord(syndromes[key]);
        return entry ? asString(entry['syndrome']).trim() : '';
      })
      .filter((value) => value !== '');
    if (parts.length > 0) fields.push({ label: 'シンドローム', value: parts.join('／'), kind: 'text' });
  }
  for (const field of PROFILE_FIELDS) {
    const raw = base[field.key];
    if (!isNonEmptyScalar(raw)) continue;
    const classified = classifyScalar(raw);
    fields.push({ label: field.label, value: classified.value, kind: classified.kind });
  }
  return fields.length > 0 ? { label: 'プロフィール', groups: [{ label: '基本', fields }] } : null;
}

function buildPalette(params: ImportedParam[], skills: Dx3Skill[]): string {
  const lines: string[] = [];
  const abilityLines = BASE_ABILITIES.filter((ability) => params.some((param) => param.label === ability.label)).map(
    (ability) => `{${ability.label}}DX 【${ability.label}】`
  );
  if (abilityLines.length > 0) lines.push('◆能力値', ...abilityLines);

  const skillLines = skills
    .filter((skill) => skill.ability !== '')
    .map((skill) => `{${skill.ability}}DX${skill.level > 0 ? `+${skill.level}` : ''} 【${skill.name}】`);
  if (skillLines.length > 0) lines.push('◆技能', ...skillLines);

  return lines.join('\n');
}

/**
 * Builds the imported model from a `dx3` warehouse character, or null for data of another shape.
 *
 * Ability and sub-ability totals become parameters, HP and encroachment resources; skills grouped
 * by ability, effects, combos, weapons, armour, items, loises, the profile and the outline become
 * sections; and the palette offers a roll for each ability and each skill tied to one.
 */
export function buildDx3AppspotCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isDx3AppspotCharacter(parsed)) return null;
  const root = resolveRoot(asRecord(parsed)!);
  const base = asRecord(root['base']);

  const character = createEmptyImportedCharacter('appspot');
  character.name = asString(base?.['name'] ?? root['name']).trim();
  character.memo = asString(base?.['memo']);
  character.dicebot = 'DoubleCross';

  const params = buildParams(root);
  const skills = collectSkills(root);
  character.params = params;
  character.statuses = buildStatuses(root);
  character.sections = [
    buildSkillSection(skills),
    labeledSection('エフェクト', root['arts'], ARTS_FIELDS),
    labeledSection('コンボ', root['combo'], COMBO_FIELDS, (record) => asRecord(record['under100']) ?? record),
    labeledSection('武器', root['weapons'], WEAPON_FIELDS),
    labeledSection('防具', root['armours'], ARMOUR_FIELDS),
    labeledSection('アイテム', root['items'], ITEM_FIELDS),
    labeledSection('ロイス', root['lois'], LOIS_FIELDS),
    buildProfileSection(base),
  ].filter((section): section is ImportedSection => section != null);

  const outline = asString(root['outline']).trim();
  if (outline !== '') {
    character.sections.push({
      label: '設定',
      groups: [{ label: '基本', fields: [{ label: '設定', value: outline, kind: 'note' }] }],
    });
  }

  character.commands = buildPalette(params, skills);

  return character;
}
