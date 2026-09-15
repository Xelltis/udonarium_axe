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
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isScalar(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** The top-level keys and their headings. An unknown system or key keeps its own key as the heading, so nothing is lost. */
const SECTION_LABELS: Record<string, string> = {
  base: 'プロフィール',
  ability: '能力値',
  skills: '技能',
  skill: '技能',
  combo: 'コンボ',
  combos: 'コンボ',
  weapons: '武器',
  armours: '防具',
  armors: '防具',
  items: 'アイテム',
  arts: 'エフェクト',
  powers: '特技',
  ninpou: '忍法',
  lois: 'ロイス',
  memory: 'メモリー',
  exp: '経験点',
  lifepath: 'ライフパス',
  ea: 'EA',
  erotion: 'エロージョン',
  outline: '設定',
  display: '表示',
  spell: '呪文',
  spells: '呪文',
};

const HANDLED_TOP_LEVEL = new Set(['base', 'baseAbility', 'subAbility']);

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key;
}

function hasCharacterShape(record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  const base = asRecord(record['base']);
  if (base != null && typeof base['name'] === 'string') return true;
  return asRecord(record['baseAbility']) != null;
}

/**
 * Takes the character itself out of the sheet warehouse data.
 * Some systems wrap it and some do not, and both are read.
 */
function resolveRoot(parsed: Record<string, unknown>): Record<string, unknown> {
  if (hasCharacterShape(parsed)) return parsed;
  const data = asRecord(parsed['data']);
  if (hasCharacterShape(data)) return data!;
  return parsed;
}

/**
 * Whether the pasted json is a character from the warehouse: one with a named `base` or a
 * `baseAbility`, bare or wrapped in `data`.
 */
export function isAppspotCharacter(parsed: unknown): boolean {
  const record = asRecord(parsed);
  if (!record) return false;
  return hasCharacterShape(record) || hasCharacterShape(asRecord(record['data']));
}

/**
 * Flattens nested objects and arrays into fields named with dots.
 * It keeps everything while fitting the three levels the sheet allows.
 */
function flattenFields(source: Record<string, unknown>, prefix: string): ImportedField[] {
  const fields: ImportedField[] = [];
  for (const [key, raw] of Object.entries(source)) {
    if (raw == null) continue;
    const label = prefix === '' ? key : `${prefix}.${key}`;
    if (isScalar(raw)) {
      if (typeof raw === 'string' && raw.trim() === '') continue;
      const classified = classifyScalar(raw);
      fields.push({ label, value: classified.value, kind: classified.kind });
    } else if (Array.isArray(raw)) {
      raw.forEach((element, index) => {
        const itemLabel = `${label}[${index + 1}]`;
        const child = asRecord(element);
        if (child) fields.push(...flattenFields(child, itemLabel));
        else if (isScalar(element)) {
          const classified = classifyScalar(element);
          fields.push({ label: itemLabel, value: classified.value, kind: classified.kind });
        }
      });
    } else {
      const child = asRecord(raw);
      if (child) fields.push(...flattenFields(child, label));
    }
  }
  return fields;
}

/** Each element of an array becomes one row, and an empty element is passed over. */
function arrayToGroups(keyLabel: string, array: unknown[]): ImportedGroup[] {
  const groups: ImportedGroup[] = [];
  array.forEach((element, index) => {
    const record = asRecord(element);
    if (record) {
      const fields = flattenFields(record, '');
      if (fields.length === 0) return;
      const name = asString(record['name'] ?? record['name1']).trim();
      groups.push({ label: name === '' ? `${keyLabel} ${index + 1}` : name, fields });
    } else if (isScalar(element)) {
      const classified = classifyScalar(element);
      groups.push({
        label: `${keyLabel} ${index + 1}`,
        fields: [{ label: keyLabel, value: classified.value, kind: classified.kind }],
      });
    }
  });
  return groups;
}

/** An object becomes a section, its scalars in the basic group and each nested part in its own. */
function objectToSection(
  label: string,
  source: Record<string, unknown>,
  sectionKey: string,
  labelMap: Record<string, string>
): ImportedSection | null {
  const baseFields: ImportedField[] = [];
  const groups: ImportedGroup[] = [];
  for (const [key, raw] of Object.entries(source)) {
    if (raw == null) continue;
    const keyLabel = labelMap[`${sectionKey}.${key}`] ?? key;
    if (Array.isArray(raw)) {
      groups.push(...arrayToGroups(keyLabel, raw));
    } else if (isScalar(raw)) {
      if (typeof raw === 'string' && raw.trim() === '') continue;
      const classified = classifyScalar(raw);
      baseFields.push({ label: keyLabel, value: classified.value, kind: classified.kind });
    } else {
      const child = asRecord(raw);
      if (!child) continue;
      const fields = flattenFields(child, '');
      if (fields.length > 0) groups.push({ label: keyLabel, fields });
    }
  }
  if (baseFields.length > 0) groups.unshift({ label: '基本', fields: baseFields });
  return groups.length > 0 ? { label, groups } : null;
}

function scalarToSection(label: string, raw: string | number): ImportedSection {
  const classified = classifyScalar(raw);
  return { label, groups: [{ label: '基本', fields: [{ label, value: classified.value, kind: classified.kind }] }] };
}

/** Takes the total out of each ability and sub-ability. */
function collectTotals(container: unknown): { label: string; value: number }[] {
  const record = asRecord(container);
  if (!record) return [];
  const result: { label: string; value: number }[] = [];
  for (const [key, raw] of Object.entries(record)) {
    const child = asRecord(raw);
    if (!child || !('total' in child)) continue;
    if (!isScalar(child['total'])) continue;
    result.push({ label: key, value: toFiniteNumber(child['total'], 0) });
  }
  return result;
}

function buildSections(root: Record<string, unknown>, labelMap: Record<string, string>): ImportedSection[] {
  const sections: ImportedSection[] = [];

  const base = asRecord(root['base']);
  if (base) {
    const profile: Record<string, unknown> = { ...base };
    delete profile['name'];
    const section = objectToSection(sectionLabel('base'), profile, 'base', labelMap);
    if (section) sections.push(section);
  }

  for (const [key, raw] of Object.entries(root)) {
    if (HANDLED_TOP_LEVEL.has(key) || raw == null) continue;
    const label = sectionLabel(key);
    if (Array.isArray(raw)) {
      const groups = arrayToGroups(label, raw);
      if (groups.length > 0) sections.push({ label, groups });
    } else if (isScalar(raw)) {
      if (typeof raw === 'string' && raw.trim() === '') continue;
      sections.push(scalarToSection(label, raw));
    } else {
      const child = asRecord(raw);
      if (!child) continue;
      const section = objectToSection(label, child, key, labelMap);
      if (section) sections.push(section);
    }
  }

  return sections;
}

/**
 * Reads a warehouse character into the imported model without knowing its system.
 *
 * Sub-ability totals become resources, base-ability totals parameters, and everything else is kept
 * as sections. `labelMap` gives headings taken from the warehouse's own pages, keyed by json path;
 * a key it lacks keeps its own name. Null for anything that is not a warehouse character.
 */
export function parseAppspotCharacter(
  parsed: unknown,
  labelMap: Record<string, string> = {}
): ImportedCharacter | null {
  const record = asRecord(parsed);
  if (!record || !isAppspotCharacter(record)) return null;
  const root = resolveRoot(record);
  const base = asRecord(root['base']);

  const character = createEmptyImportedCharacter('appspot');
  character.name = asString(base?.['name'] ?? root['name']).trim();

  const statuses: ImportedStatus[] = collectTotals(root['subAbility']).map((entry) => ({
    label: labelMap[`subAbility.${entry.label}`] ?? entry.label,
    value: entry.value,
    max: entry.value,
  }));
  character.statuses = statuses;

  const params: ImportedParam[] = collectTotals(root['baseAbility']).map((entry) => ({
    label: labelMap[`baseAbility.${entry.label}`] ?? entry.label,
    value: String(entry.value),
  }));
  character.params = params;

  character.sections = buildSections(root, labelMap);

  return character;
}
