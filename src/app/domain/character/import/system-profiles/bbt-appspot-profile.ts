import {
  asString,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedParam,
  ImportedSection,
  ImportedStatus,
  profileSectionOf,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';
import { labeledSection } from '@axe/domain/character/import/system-profiles/labeled-section';

interface FieldLabel {
  key: string;
  label: string;
}

const ABILITIES: FieldLabel[] = [
  { key: 'body', label: '肉体' },
  { key: 'emotion', label: '情動' },
  { key: 'skill', label: '技術' },
  { key: 'society', label: '社会' },
  { key: 'divine', label: '神威' },
];

const ARTS_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'level', label: 'レベル' },
  { key: 'timing', label: 'タイミング' },
  { key: 'target', label: '対象' },
  { key: 'range', label: '射程' },
  { key: 'cost', label: 'コスト' },
  { key: 'notes', label: '効果' },
];

const WEAPON_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'attack', label: '攻撃' },
  { key: 'guard', label: 'ガード' },
  { key: 'attribute', label: '属性' },
  { key: 'range', label: '射程' },
  { key: 'notes', label: '備考' },
];

const ARMOUR_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'armour', label: '装甲' },
  { key: 'dodge', label: '回避' },
  { key: 'notes', label: '備考' },
];

const BIND_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'relation', label: '関係' },
];

const ITEM_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'target', label: '対象' },
  { key: 'range', label: '射程' },
  { key: 'notes', label: '効果' },
];

const PROFILE_FIELDS: FieldLabel[] = [
  { key: 'race', label: '種族' },
  { key: 'bloods', label: 'ブラッド' },
  { key: 'style', label: 'スタイル' },
  { key: 'cover', label: 'カヴァー' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
  { key: 'player', label: 'PL' },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveRoot(record: Record<string, unknown>): Record<string, unknown> {
  if (asRecord(record['base']) != null || asRecord(record['baseAbility']) != null) return record;
  return asRecord(record['data']) ?? record;
}

function totalOf(container: Record<string, unknown>, key: string): string {
  const entry = asRecord(container[key]);
  return entry ? asString(entry['total']) : '';
}

/**
 * Whether the pasted json is a warehouse character whose base abilities include `divine` and
 * `emotion`, which marks the `bbt` system, bare or wrapped in `data`.
 */
export function isBbtAppspotCharacter(parsed: unknown): boolean {
  const record = asRecord(parsed);
  if (!record) return false;
  const root = resolveRoot(record);
  const ability = asRecord(root['baseAbility']);
  return ability != null && 'divine' in ability && 'emotion' in ability;
}

/**
 * Builds the imported model from a `bbt` warehouse character, or null for any other data.
 *
 * Ability totals and FP become parameters and humanity a resource; effects, weapons, armour, bonds,
 * items, the profile and the outline become sections; and the palette offers a 2D6 roll for each
 * ability.
 */
export function buildBbtAppspotCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isBbtAppspotCharacter(parsed)) return null;
  const root = resolveRoot(asRecord(parsed)!);
  const base = asRecord(root['base']);
  const baseAbility = asRecord(root['baseAbility']) ?? {};

  const character = createEmptyImportedCharacter('appspot');
  character.name = asString(base?.['name']).trim();
  character.memo = asString(base?.['memo']);
  character.dicebot = 'BeastBindTrinity';

  const params: ImportedParam[] = [];
  for (const ability of ABILITIES) {
    const value = totalOf(baseAbility, ability.key);
    if (value !== '') params.push({ label: ability.label, value });
  }
  const fp = totalOf(root, 'fp');
  if (fp !== '') params.push({ label: 'FP', value: fp });
  character.params = params;

  const statuses: ImportedStatus[] = [];
  const humanity = totalOf(root, 'humanity');
  if (humanity !== '') {
    const value = toFiniteNumber(humanity, 0);
    statuses.push({ label: '人間性', value, max: value });
  }
  character.statuses = statuses;

  character.sections = [
    labeledSection('エフェクト', root['arts'], ARTS_FIELDS),
    labeledSection('武器', root['weapons'], WEAPON_FIELDS),
    labeledSection('防具', root['armours'], ARMOUR_FIELDS),
    labeledSection('絆', root['binds'], BIND_FIELDS),
    labeledSection('アイテム', root['items'], ITEM_FIELDS),
    profileSectionOf(base, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  const outline = asString(root['outline']).trim();
  if (outline !== '') {
    character.sections.push({
      label: '設定',
      groups: [{ label: '基本', fields: [{ label: '設定', value: outline, kind: 'note' }] }],
    });
  }

  const abilityLines = ABILITIES.filter((ability) => params.some((param) => param.label === ability.label)).map(
    (ability) => `2D6+{${ability.label}} 【${ability.label}判定】`
  );
  character.commands = ['2D6 【判定】', ...abilityLines].join('\n');

  return character;
}
