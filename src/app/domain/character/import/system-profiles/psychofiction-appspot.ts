import {
  asString,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedSection,
  ImportedSkillTable,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import { labeledSection } from '@axe/domain/character/import/system-profiles/labeled-section';

export interface FieldLabel {
  key: string;
  label: string;
}

/**
 * The shared builder for one publisher's family of systems at the warehouse.
 * Each has a skill table laid out as a grid of fields against ranks with gaps between them,
 * and an array of powers that each call for a skill. What differs is settled by the configuration.
 */
export interface PsychoFictionConfig {
  dicebot: string;
  categories: string[];
  skillsByCategory: string[][];
  abilityKey: string;
  abilitySectionLabel: string;
  abilityFields: FieldLabel[];
  profileFields: FieldLabel[];
  /** The key that holds the skill a power calls for, which is named differently by some systems. */
  targetSkillKey?: string;
  /** Takes the further arrays some systems carry as labelled sections. */
  extraSections?: { key: string; label: string; fields: FieldLabel[] }[];
}

const BACKGROUND_FIELDS: FieldLabel[] = [
  { key: 'type', label: '種別' },
  { key: 'point', label: '功績' },
  { key: 'effect', label: '効果' },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isChecked(value: unknown): boolean {
  const text = asString(value).trim();
  return text !== '' && text !== '0';
}

function resolveRoot(record: Record<string, unknown>, abilityKey: string): Record<string, unknown> {
  if (asRecord(record['base']) != null || Array.isArray(record[abilityKey])) return record;
  return asRecord(record['data']) ?? record;
}

/**
 * Whether the pasted json looks like a warehouse character of that family of systems: a named
 * `base`, or an array of abilities under `abilityKey`, bare or wrapped in `data`.
 */
export function isPsychoFictionAppspotCharacter(parsed: unknown, abilityKey: string): boolean {
  const record = asRecord(parsed);
  if (!record) return false;
  const root = resolveRoot(record, abilityKey);
  const base = asRecord(root['base']);
  return (base != null && typeof base['name'] === 'string') || Array.isArray(root[abilityKey]);
}

function buildSkillTable(root: Record<string, unknown>, config: PsychoFictionConfig): ImportedSkillTable {
  const rows = config.skillsByCategory[0]?.length ?? 11;
  const checked = config.categories.map(() => new Array<boolean>(rows).fill(false));

  for (const element of asArray(root['learned'])) {
    const record = asRecord(element);
    const match = /skills\.row(\d+)\.name(\d+)/.exec(asString(record?.['id']));
    if (!match) continue;
    const row = Number(match[1]);
    const column = Number(match[2]);
    if (checked[column]?.[row] !== undefined) checked[column][row] = true;
  }

  const skills = asRecord(root['skills']) ?? {};
  const gaps = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => isChecked(skills[key]));

  return {
    name: '特技表',
    categories: config.categories,
    skillsByCategory: config.skillsByCategory,
    checked,
    gaps,
  };
}

function buildPalette(abilities: unknown, targetSkillKey: string): string {
  const lines: string[] = ['2D6>=5 【判定】'];
  for (const element of asArray(abilities)) {
    const record = asRecord(element);
    if (!record) continue;
    const name = asString(record['name']).trim();
    if (name === '') continue;
    const targetSkill = asString(record[targetSkillKey]).trim();
    lines.push(`2D6>=5 【${name}${targetSkill === '' ? '' : `／${targetSkill}`}】`);
  }
  return lines.join('\n');
}

/**
 * Builds the imported model from a warehouse character of that family of systems, as `config`
 * describes it, or null for data of another shape.
 *
 * Abilities, background, any extra sections, the profile and the outline become sections; the
 * learned skills and gaps a skill table; and the palette offers a 2D6 roll of 5 or more for each
 * ability.
 */
export function buildPsychoFictionCharacter(parsed: unknown, config: PsychoFictionConfig): ImportedCharacter | null {
  if (!isPsychoFictionAppspotCharacter(parsed, config.abilityKey)) return null;
  const root = resolveRoot(asRecord(parsed)!, config.abilityKey);
  const base = asRecord(root['base']);

  const character = createEmptyImportedCharacter('appspot');
  character.name = asString(base?.['name'] ?? root['name']).trim();
  character.memo = asString(base?.['memo']);
  character.dicebot = config.dicebot;

  character.sections = [
    labeledSection(config.abilitySectionLabel, root[config.abilityKey], config.abilityFields),
    labeledSection('背景', root['background'], BACKGROUND_FIELDS),
    ...(config.extraSections ?? []).map((extra) => labeledSection(extra.label, root[extra.key], extra.fields)),
    profileSectionOf(base, config.profileFields),
  ].filter((section): section is ImportedSection => section != null);

  const outline = asString(root['outline']).trim();
  if (outline !== '') {
    character.sections.push({
      label: '設定',
      groups: [{ label: '基本', fields: [{ label: '設定', value: outline, kind: 'note' }] }],
    });
  }

  character.skillTables = [buildSkillTable(root, config)];
  character.commands = buildPalette(root[config.abilityKey], config.targetSkillKey ?? 'targetSkill');

  return character;
}
