import {
  asString,
  classifyScalar,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedSection,
  isNonEmptyScalar,
  normalizeHexColor,
} from '@axe/domain/character/import/imported-character';

/** The keys of that service are a family, a number and a field. These are the family prefixes and their headings. */
const FAMILY_LABELS: Record<string, string> = {
  ability: '能力値',
  weapon: '武器',
  armor: '防具',
  shield: '盾',
  skill: '技能',
  generalSkill: '一般技能',
  combatSkill: '戦闘特技',
  spell: '呪文',
  arts: '特技',
  magic: '魔法',
  item: '所持品',
  history: '冒険の記録',
  honor: '名誉点',
  connection: 'コネクション',
};

/** The field suffixes and their column names, shared across that framework. An unknown suffix keeps its own. */
const FIELD_LABELS: Record<string, string> = {
  Name: '名前',
  Power: '威力',
  Range: '射程',
  Hit: '命中',
  HitTotal: '命中',
  Grade: '習熟度',
  Type: '種別',
  Class: '系統',
  Attr: '属性',
  Material: '素材',
  Weight: '重量',
  Armor: '防護点',
  Stealth: '隠密性',
  Dodge: '回避',
  DodgeTotal: '回避',
  Block: '受け',
  Usage: '用法',
  Page: 'ページ',
  Effect: '効果',
  Memo: 'メモ',
  Cost: 'コスト',
  Mp: 'MP',
  Adp: '適用',
};

/** The keys with no family that can be translated. An unknown one keeps its own. */
const SCALAR_LABELS: Record<string, string> = {
  race: '種族',
  age: '年齢',
  gender: '性別',
  level: 'レベル',
  rank: '等級',
  faith: '信仰',
  statusLife: '生命力',
  statusMove: '移動力',
  statusResist: '生命抵抗力',
  statusSpell: '精神抵抗力',
  expTotal: '合計経験点',
  expRest: '残り経験点',
  moneyTotal: '所持金',
};

/** What is not imported: the internal, the display and the sync fields. */
const INTERNAL_KEY =
  /^(id|mode|ver|result|message|group|tags|completed|lasttimever|updateTime|sheetURL|sheetDescription[MS]|unitStatus|protect|protectOld|palette|color[A-Z]|image[A-Z]|words[XY]|birthTime)/;

const FAMILY_KEY = /^([a-z][a-zA-Z]*?)(\d+)([A-Z][a-zA-Z0-9]*)$/;

// Systems name the character in different keys, so the first that holds something is taken.
const NAME_KEYS = ['characterName', 'aka', 'name', 'pcName'];

function resolveName(record: Record<string, unknown>): string {
  for (const key of NAME_KEYS) {
    const value = asString(record[key]).trim();
    if (value !== '') return value;
  }
  return '';
}

/**
 * Whether the pasted json is a character from that service: its `sheetURL` points there, or it
 * carries a `ver` and a name under one of the usual keys.
 */
export function isYtsheetCharacter(parsed: unknown): boolean {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  if (asString(record['sheetURL']).includes('ytsheet')) return true;
  return isNonEmptyScalar(record['ver']) && NAME_KEYS.some((key) => isNonEmptyScalar(record[key]));
}

function fieldLabel(suffix: string): string {
  return FIELD_LABELS[suffix] ?? suffix;
}

function buildFamilySections(record: Record<string, unknown>, handled: Set<string>): ImportedSection[] {
  // family → index → [field, value]
  const families = new Map<string, Map<string, [string, unknown][]>>();
  for (const [key, raw] of Object.entries(record)) {
    if (handled.has(key) || !isNonEmptyScalar(raw)) continue;
    const match = FAMILY_KEY.exec(key);
    if (!match) continue;
    const [, family, index, field] = match;
    handled.add(key);
    const byIndex = families.get(family) ?? new Map<string, [string, unknown][]>();
    const fields = byIndex.get(index) ?? [];
    fields.push([field, raw]);
    byIndex.set(index, fields);
    families.set(family, byIndex);
  }

  const sections: ImportedSection[] = [];
  for (const [family, byIndex] of families) {
    const groups: ImportedGroup[] = [];
    for (const [index, entries] of byIndex) {
      const nameEntry = entries.find(([field]) => field === 'Name');
      const label = nameEntry && asString(nameEntry[1]).trim() !== '' ? asString(nameEntry[1]).trim() : `${index}`;
      const fields: ImportedField[] = entries
        .filter(([field]) => field !== 'Name')
        .map(([field, raw]) => {
          const classified = classifyScalar(raw as string | number);
          return { label: fieldLabel(field), value: classified.value, kind: classified.kind };
        });
      if (fields.length > 0 || nameEntry) groups.push({ label, fields });
    }
    if (groups.length > 0) sections.push({ label: FAMILY_LABELS[family] ?? family, groups });
  }
  return sections;
}

function buildScalarSection(record: Record<string, unknown>, handled: Set<string>): ImportedSection | null {
  const fields: ImportedField[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (handled.has(key) || INTERNAL_KEY.test(key) || !isNonEmptyScalar(raw)) continue;
    const classified = classifyScalar(raw);
    fields.push({ label: SCALAR_LABELS[key] ?? key, value: classified.value, kind: classified.kind });
  }
  return fields.length > 0 ? { label: 'データ', groups: [{ label: '基本', fields }] } : null;
}

/**
 * Reads a character from that service into the imported model without a system-specific profile.
 *
 * Keys shaped as a family, a number and a field, such as `weapon1Name`, gather into a section per
 * family and a group per number; the other scalars go into a `データ` section, and the summary becomes
 * the notes. Null for anything else.
 */
export function parseYtsheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isYtsheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = createEmptyImportedCharacter('ytsheet');
  character.name = resolveName(record);
  character.color = normalizeHexColor(record['color']);
  character.memo = asString(record['sheetDescriptionM']);

  const handled = new Set<string>([...NAME_KEYS, 'color']);
  const familySections = buildFamilySections(record, handled);
  const scalarSection = buildScalarSection(record, handled);
  character.sections = [...(scalarSection ? [scalarSection] : []), ...familySections];

  return character;
}
