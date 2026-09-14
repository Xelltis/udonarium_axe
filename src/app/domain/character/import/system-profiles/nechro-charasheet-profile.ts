import {
  asString,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
  scalarField,
} from '@axe/domain/character/import/imported-character';
import {
  asArray,
  charasheetCharacterOf,
  isCharasheetGame,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

/**
 * The profile of one system at the archive.
 *
 * The manoeuvres come as parallel arrays: the name, the class, the part, the timing, the
 * cost, the range and the effect.
 * The part and timing codes are read through the options on its own page.
 */
const POWER_TYPE: Record<string, string> = {
  '1': 'ポジション',
  '2': 'メインクラス',
  '3': 'サブクラス',
  '4': '頭',
  '5': '腕',
  '6': '胴',
  '7': '足',
};

const POWER_TIMING: Record<string, string> = {
  '0': 'オート',
  '1': 'アクション',
  '2': 'ジャッジ',
  '3': 'ダメージ',
  '4': 'ラピッド',
};

const ROICE_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'damage', label: '損傷' },
  { suffix: 'neg', label: '負の感情' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'Position_Name', label: 'ポジション' },
  { key: 'MCLS_Name', label: 'メインクラス' },
  { key: 'SCLS_Name', label: 'サブクラス' },
];

/** Whether the pasted json is an archive sheet under the `nechro` system token. */
export function isNechroCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'nechro');
}

function mappedField(label: string, raw: unknown, map: Record<string, string>): ImportedField | null {
  if (!isNonEmptyScalar(raw)) return null;
  const key = asString(raw).trim();
  return { label, value: map[key] ?? key, kind: 'text' };
}

function buildManeuverSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['Power_name']);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields = [
      scalarField('分類', asArray(record['Power_shozoku'])[index]),
      mappedField('部位', asArray(record['Power_Type'])[index], POWER_TYPE),
      mappedField('タイミング', asArray(record['Power_timing'])[index], POWER_TIMING),
      scalarField('コスト', asArray(record['Power_cost'])[index]),
      scalarField('射程', asArray(record['Power_range'])[index]),
      scalarField('効果', asArray(record['Power_memo'])[index]),
    ].filter((field): field is ImportedField => field != null);
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: 'マニューバ', groups } : null;
}

function buildRoiceSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['roice_name']);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields = ROICE_COLUMNS.map((column) =>
      scalarField(column.label, asArray(record[`roice_${column.suffix}`])[index])
    ).filter((field): field is ImportedField => field != null);
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: '未練', groups } : null;
}

/**
 * Builds the imported model from a `nechro` archive sheet, or null for any other sheet.
 *
 * The system has no abilities to read, so there are no parameters. Maneuvers, with their part and
 * timing codes turned into names, regrets and the profile become sections, and the palette offers
 * the plain check and attack rolls.
 */
export function buildNechroCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isNechroCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Nechronica');

  character.sections = [
    buildManeuverSection(record),
    buildRoiceSection(record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = ['2NC 【判定】', '2NA 【攻撃判定】'].join('\n');

  return character;
}
