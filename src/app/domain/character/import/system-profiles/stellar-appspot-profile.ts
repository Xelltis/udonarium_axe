import {
  asString,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedParam,
  ImportedSection,
  ImportedStatus,
  isNonEmptyScalar,
  profileSectionOf,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';
import { labeledSection } from '@axe/domain/character/import/system-profiles/labeled-section';

interface FieldLabel {
  key: string;
  label: string;
}

const STATUS_PARAMS: FieldLabel[] = [
  { key: 'defense', label: '防御' },
  { key: 'charge', label: 'チャージ' },
  { key: 'resonance', label: '共鳴' },
  { key: 'medal', label: 'メダル' },
];

const SKILL_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'timing', label: 'タイミング' },
  { key: 'effect', label: '効果' },
];

const SHEATH_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'timing', label: 'タイミング' },
  { key: 'effect', label: '効果' },
];

const PROFILE_FIELDS: FieldLabel[] = [
  { key: 'knight', label: '騎士' },
  { key: 'organization', label: '所属' },
  { key: 'character', label: '種別' },
  { key: 'keyword', label: 'キーワード' },
  { key: 'wish', label: '願い' },
  { key: 'hopedespair', label: '希望／絶望' },
  { key: 'personalflower', label: '花' },
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
  if (asRecord(record['base']) != null) return record;
  return asRecord(record['data']) ?? record;
}

/**
 * Whether the pasted json is a warehouse character with a named `base` and a `status` object, bare
 * or wrapped in `data`.
 */
export function isStellarAppspotCharacter(parsed: unknown): boolean {
  const record = asRecord(parsed);
  if (!record) return false;
  const root = resolveRoot(record);
  const base = asRecord(root['base']);
  return base != null && typeof base['name'] === 'string' && asRecord(root['status']) != null;
}

/**
 * Builds the imported model from a `stellar` warehouse character, or null for any other data.
 *
 * HP becomes a resource and the other status values parameters; skills, the sheath, the profile and
 * the story become sections; and the palette offers the attack roll for two to five dice.
 */
export function buildStellarAppspotCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isStellarAppspotCharacter(parsed)) return null;
  const root = resolveRoot(asRecord(parsed)!);
  const base = asRecord(root['base']);
  const status = asRecord(root['status']) ?? {};

  const character = createEmptyImportedCharacter('appspot');
  character.name = asString(base?.['name']).trim();
  character.dicebot = 'StellarKnights';

  const statuses: ImportedStatus[] = [];
  if (isNonEmptyScalar(status['hp'])) {
    const hp = toFiniteNumber(status['hp'], 0);
    statuses.push({ label: 'HP', value: hp, max: hp });
  }
  character.statuses = statuses;

  const params: ImportedParam[] = [];
  for (const field of STATUS_PARAMS) {
    if (isNonEmptyScalar(status[field.key])) params.push({ label: field.label, value: asString(status[field.key]) });
  }
  character.params = params;

  character.sections = [
    labeledSection('スキル', root['skills'], SKILL_FIELDS),
    labeledSection('鞘', root['sheath'], SHEATH_FIELDS),
    profileSectionOf(base, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  const story = [asString(base?.['yourstory']).trim(), asString(root['outline']).trim()].filter((text) => text !== '');
  if (story.length > 0) {
    character.sections.push({
      label: '設定',
      groups: [{ label: '基本', fields: [{ label: '設定', value: story.join('\n'), kind: 'note' }] }],
    });
  }

  character.commands = [
    '◆アタック判定（nSK[防御力]）',
    '2SK 【アタック判定:2ダイス】',
    '3SK 【アタック判定:3ダイス】',
    '4SK 【アタック判定:4ダイス】',
    '5SK 【アタック判定:5ダイス】',
  ].join('\n');

  return character;
}
