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
  normalizeHexColor,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';
import { normalizeImage } from '@axe/domain/character/import/system-profiles/charasheet-shared';

function isScalar(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** The keys handled elsewhere, such as the name, the colour and the picture. They stay out of the data section. */
const META_KEYS = new Set([
  'pc_name',
  'color',
  'base64Image',
  'url',
  'pc_making_environ',
  'pc_id',
  'password',
  'pc_password',
  'game',
  'SAN_Left',
  'SAN_Max',
  'SAN_Danger',
]);

/**
 * The numbered ability keys of that system and their names.
 * The archive holds them by their place in the form, so they are mapped to readable names here.
 */
const COC_ABILITY_LABELS: Record<string, string> = {
  NA1: 'STR',
  NA2: 'CON',
  NA3: 'POW',
  NA4: 'DEX',
  NA5: 'APP',
  NA6: 'SIZ',
  NA7: 'INT',
  NA8: 'EDU',
  NA9: 'HP',
  NA10: 'MP',
  NA11: '幸運',
  NA12: 'アイデア',
  NA13: '正気度初期',
  NA14: '知識',
};

/** The prefixes of its skill arrays and their categories. An unknown prefix keeps its own. */
const COC_SKILL_CATEGORY: Record<string, string> = {
  TBA: '戦闘技能',
  TFA: '探索技能',
  TAA: '行動技能',
  TCA: '交渉技能',
  TKA: '知識技能',
};

/** The suffixes of those keys and their column names. An unknown suffix keeps its own. */
const COC_SKILL_COLUMN: Record<string, string> = {
  U: '使用',
  D: '初期値',
  S: '職業P',
  K: '趣味P',
  P: '合計',
  G: '成長',
};

/**
 * Every system in the archive names its rows in one array and uses the same column suffixes.
 * The family prefixes and their headings. An unknown family keeps its prefix.
 */
const FAMILY_LABELS: Record<string, string> = {
  skill: '技能',
  ippanskill: '一般技能',
  effect: '特技',
  easyeffect: 'コンボ',
  Power: '特技',
  power: '特技',
  ginou: '技能',
  jobginou: 'ジョブ技能',
  arms: '武器',
  item: '所持品',
  cls: 'クラス能力',
  spell: '呪文',
  magic: '魔法',
  acts: '行動',
  evades: '回避',
  roice: '未練',
  conne: 'コネ',
  friend: '仲間',
  implant: 'インプラント',
  ability: 'アビリティ',
};

/** The column suffixes and their names, as a list; anything else counts as internal and is left out. */
const COLUMN_LABELS: Record<string, string> = {
  lv: 'レベル',
  Lv: 'レベル',
  Level: 'レベル',
  sl: 'レベル',
  tlv: '技能レベル',
  timing: 'タイミング',
  hantei: '判定',
  taisho: '対象',
  taishou: '対象',
  range: '射程',
  cost: 'コスト',
  memo: '効果',
  kouka: '効果',
  shozoku: '所属',
  zentei: '前提',
  eishou: '詠唱',
  attr: '属性',
  zokusei: '属性',
  keitou: '系統',
  nanido: '難易度',
  power: '威力',
  iryoku: '威力',
  critical: 'C値',
  damage: 'ダメージ',
  cate: 'カテゴリ',
  yoho: '用法',
  hit: '命中',
  type: '種別',
  Type: '種別',
  limit: '制限',
  price: '価格',
  tanka: '単価',
  weight: '重量',
  num: '個数',
  life: '耐久',
  mp: 'MP',
  dest: '部位',
  neg: '負の感情',
  pos: '対象',
  like: '好意',
  dislike: '敵意',
  page: 'ページ',
  total: '合計',
  sonota: 'その他',
};

/**
 * Whether the pasted json is a sheet from the archive, which every one marks with a `pc_name`
 * string.
 */
export function isCharasheetCharacter(parsed: unknown): boolean {
  if (parsed == null || typeof parsed !== 'object') return false;
  return typeof (parsed as Record<string, unknown>)['pc_name'] === 'string';
}

/** Takes the current and maximum pairs some systems name in that way as resources. */
function parsePairedStatuses(record: Record<string, unknown>, handled: Set<string>): ImportedStatus[] {
  const statuses: ImportedStatus[] = [];
  for (const key of Object.keys(record)) {
    const match = /^N(.+)$/.exec(key);
    if (!match) continue;
    const maxKey = `M${match[1]}`;
    if (!(maxKey in record) || !isScalar(record[key]) || !isScalar(record[maxKey])) continue;
    const max = toFiniteNumber(record[maxKey], 0);
    statuses.push({ label: match[1], value: toFiniteNumber(record[key], max), max });
    handled.add(key);
    handled.add(maxKey);
  }
  return statuses;
}

function parseSanStatus(record: Record<string, unknown>): ImportedStatus | null {
  if (!('SAN_Max' in record) || !isScalar(record['SAN_Max'])) return null;
  const max = toFiniteNumber(record['SAN_Max'], 0);
  const left = isNonEmptyScalar(record['SAN_Left']) ? toFiniteNumber(record['SAN_Left'], max) : max;
  return { label: '正気度', value: left, max };
}

function parseCocAbilities(record: Record<string, unknown>, handled: Set<string>): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const [key, label] of Object.entries(COC_ABILITY_LABELS)) {
    if (isNonEmptyScalar(record[key])) {
      params.push({ label, value: asString(record[key]) });
      handled.add(key);
    }
  }
  return params;
}

function arrayPrefix(key: string): string {
  return key.length <= 1 ? key : key.slice(0, -1);
}

/**
 * Spreads an array family that names its rows into a section of named rows.
 * The row label comes from that array and the column label from the suffix.
 * What it handles is recorded, and the unnamed arrays of some systems are left to the next pass.
 */
function buildNamedFamilySections(
  arrays: [string, unknown[]][],
  handled: Set<string>,
  uniqueSectionLabel: (base: string) => string
): ImportedSection[] {
  const families = arrays
    .filter(([key]) => key.endsWith('_name'))
    .map(([key]) => key.slice(0, -'_name'.length))
    .filter((family) => family.length > 0)
    .sort((a, b) => b.length - a.length);
  if (families.length === 0) return [];

  const arrayMap = new Map(arrays);
  const sections: ImportedSection[] = [];

  for (const family of families) {
    const names = arrayMap.get(`${family}_name`);
    if (!names) continue;
    handled.add(`${family}_name`);

    const columns: { key: string; label: string }[] = [];
    for (const [key, array] of arrays) {
      if (handled.has(key) || key === `${family}_name` || !key.startsWith(`${family}_`)) continue;
      if (array.length !== names.length) continue;
      const suffix = key.slice(family.length + 1);
      const label = COLUMN_LABELS[suffix];
      if (label == null) continue;
      columns.push({ key, label });
      handled.add(key);
    }

    const groups: ImportedGroup[] = [];
    names.forEach((rawName, index) => {
      const name = asString(rawName).trim();
      if (name === '') return;
      const fields: ImportedField[] = [];
      for (const column of columns) {
        const cell = (arrayMap.get(column.key) ?? [])[index];
        if (!isNonEmptyScalar(cell)) continue;
        const classified = classifyScalar(cell);
        fields.push({ label: column.label, value: classified.value, kind: classified.kind });
      }
      groups.push({ label: name, fields });
    });

    if (groups.length > 0) {
      sections.push({ label: uniqueSectionLabel(FAMILY_LABELS[family] ?? family), groups });
    }
  }
  return sections;
}

/**
 * Groups the parallel arrays by their prefix and length and zips them into a row per index.
 * It is the fallback for the systems whose rows have no names.
 * A row empty in every column is passed over.
 */
function buildArraySections(
  arrays: [string, unknown[]][],
  isCoc: boolean,
  uniqueSectionLabel: (base: string) => string
): ImportedSection[] {
  const buckets = new Map<string, [string, unknown[]][]>();
  for (const entry of arrays) {
    const bucketKey = `${arrayPrefix(entry[0])}|${entry[1].length}`;
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(entry);
    else buckets.set(bucketKey, [entry]);
  }

  const sections: ImportedSection[] = [];
  for (const bucket of buckets.values()) {
    const prefix = arrayPrefix(bucket[0][0]);
    const length = bucket[0][1].length;
    // Only several arrays are gathered under a prefix; a lone one keeps its full key as the heading.
    const baseLabel = bucket.length >= 2 ? (isCoc && COC_SKILL_CATEGORY[prefix]) || prefix : bucket[0][0];
    const sectionLabel = uniqueSectionLabel(baseLabel);
    const groups: ImportedGroup[] = [];

    for (let i = 0; i < length; i++) {
      const fields: ImportedField[] = [];
      for (const [key, array] of bucket) {
        const cell = array[i];
        if (!isNonEmptyScalar(cell)) continue;
        const column = (isCoc && COC_SKILL_COLUMN[key.slice(-1)]) || key;
        const classified = classifyScalar(cell);
        fields.push({ label: column, value: classified.value, kind: classified.kind });
      }
      if (fields.length > 0) groups.push({ label: `${sectionLabel} ${i + 1}`, fields });
    }
    if (groups.length > 0) sections.push({ label: sectionLabel, groups });
  }
  return sections;
}

/**
 * Reads an archive sheet into the imported model without a system-specific profile.
 *
 * Sanity and keys paired as current and maximum become resources, the remaining scalars a `データ`
 * section, and the arrays sections of their own, named where a family names its rows. `labelMap`
 * gives headings taken from the archive's own pages, keyed by input name. Null for anything that is
 * not an archive sheet.
 */
export function parseCharasheetCharacter(
  parsed: unknown,
  labelMap: Record<string, string> = {}
): ImportedCharacter | null {
  if (!isCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const game = asString(record['game']);
  const isCoc = game === 'coc' || game === 'coc7';

  const character = createEmptyImportedCharacter('charasheet');
  character.name = asString(record['pc_name']).trim();
  character.color = normalizeHexColor(record['color']);
  character.iconUrl = normalizeImage(record);
  character.memo = asString(record['pc_making_environ']);

  const handled = new Set(META_KEYS);

  const san = parseSanStatus(record);
  character.statuses = [...(san ? [san] : []), ...parsePairedStatuses(record, handled)];

  if (isCoc) character.params = parseCocAbilities(record, handled);

  const scalarFields: ImportedField[] = [];
  const arrayEntries: [string, unknown[]][] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (handled.has(key) || raw == null) continue;
    if (Array.isArray(raw)) {
      if (raw.length > 0) arrayEntries.push([key, raw]);
    } else if (isNonEmptyScalar(raw)) {
      const classified = classifyScalar(raw);
      scalarFields.push({ label: labelMap[key] ?? key, value: classified.value, kind: classified.kind });
    }
  }

  const usedSectionLabels = new Set<string>();
  const uniqueSectionLabel = (base: string): string => {
    let label = base;
    let counter = 2;
    while (usedSectionLabels.has(label)) label = `${base}_${counter++}`;
    usedSectionLabels.add(label);
    return label;
  };

  // A family that names its rows becomes a named section; the rest stay numbered.
  const namedSections = buildNamedFamilySections(arrayEntries, handled, uniqueSectionLabel);
  const remainingArrays = arrayEntries.filter(([key]) => !handled.has(key));

  const sections: ImportedSection[] = [];
  if (scalarFields.length > 0) {
    sections.push({ label: uniqueSectionLabel('データ'), groups: [{ label: '基本', fields: scalarFields }] });
  }
  sections.push(...namedSections);
  sections.push(...buildArraySections(remainingArrays, isCoc, uniqueSectionLabel));
  character.sections = sections;

  const url = asString(record['url']).trim();
  if (url !== '') character.externalUrl = url;

  return character;
}
