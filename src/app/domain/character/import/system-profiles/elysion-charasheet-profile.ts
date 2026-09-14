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
  paramsOf,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The three abilities of that system. Their order and the codes of the skills come from the headings and options of its own page.
const ABILITIES: { key: string; label: string }[] = [
  { key: 'NB1', label: '学力' },
  { key: 'NB2', label: '青春力' },
  { key: 'NB3', label: '政治力' },
];

// The ability codes of the skills and their labels, taken from the options on that page. Zero means none.
const SKILL_ABILITY: Record<string, string> = {
  '1': '学力',
  '2': '青春力',
  '3': '政治力',
  '4': '力',
  '5': '力',
};

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'shuzoku_name', label: '種族' },
  { key: 'class_name', label: 'クラス' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `elysion` system token. */
export function isElysionCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'elysion');
}

function mappedField(label: string, raw: unknown, map: Record<string, string>): ImportedField | null {
  if (!isNonEmptyScalar(raw)) return null;
  const key = asString(raw).trim();
  const value = map[key];
  return value == null ? null : { label, value, kind: 'text' };
}

function buildSkillSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['Power_name']);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields = [
      scalarField('レベル', asArray(record['Power_Level'])[index]),
      mappedField('能力', asArray(record['Power_hantei'])[index], SKILL_ABILITY),
      scalarField('タイミング', asArray(record['Power_timing'])[index]),
      scalarField('射程', asArray(record['Power_range'])[index]),
      scalarField('コスト', asArray(record['Power_cost'])[index]),
      scalarField('制限', asArray(record['Power_limit'])[index]),
    ].filter((field): field is ImportedField => field != null);
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: 'スキル', groups } : null;
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = ABILITIES.filter((ability) => isNonEmptyScalar(record[ability.key])).map(
    (ability) => `EL${asString(record[ability.key]).trim()} 【${ability.label}判定】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from an `elysion` archive sheet, or null for any other sheet.
 *
 * Abilities become parameters; skills, with their ability codes turned into names, and the profile
 * become sections; and the palette offers a roll for each ability.
 */
export function buildElysionCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isElysionCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Elysion');

  character.params = paramsOf(record, ABILITIES);
  character.sections = [buildSkillSection(record), profileSectionOf(record, PROFILE_FIELDS)].filter(
    (section): section is ImportedSection => section != null
  );

  character.commands = buildPalette(record);

  return character;
}
