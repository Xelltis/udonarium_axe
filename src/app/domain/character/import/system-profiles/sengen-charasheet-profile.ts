import {
  asString,
  classifyScalar,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  asArray,
  charasheetCharacterOf,
  isCharasheetGame,
  paramsOf,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The five abilities of that system, each the total of its trait and its correction, in the order the headings of its own page give.
const ABILITIES: { key: string; label: string }[] = [
  { key: 'NP1', label: '身体' },
  { key: 'NP2', label: '耐久' },
  { key: 'NP3', label: '知性' },
  { key: 'NP4', label: '感覚' },
  { key: 'NP5', label: '意志' },
];

// The family codes of the arts and spells and their labels, taken from the options on that page.
const SPELL_CATEGORY: Record<string, string> = {
  '1': '神術/陰陽',
  '2': '魔法',
  '3': '属性/基本',
  '4': '属性/応用',
  '5': '妖術',
  '6': '妖術+妖弾',
  '7': '妖術+常在',
};

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'shuzoku', label: '種族' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `sengen` system token. */
export function isSengenCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'sengen');
}

function buildSpellSection(record: Record<string, unknown>): ImportedSection | null {
  const names = asArray(record['effect_name']);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    const category = asString(asArray(record['effect_shozoku'])[index]).trim();
    if (SPELL_CATEGORY[category] != null) fields.push({ label: '系統', value: SPELL_CATEGORY[category], kind: 'text' });
    for (const [suffix, label] of [
      ['lv', 'レベル'],
      ['memo', '効果'],
    ] as const) {
      const cell = asArray(record[`effect_${suffix}`])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label: '妖術・魔法', groups } : null;
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = ABILITIES.filter((ability) => isNonEmptyScalar(record[ability.key])).map(
    (ability) => `SGS+${asString(record[ability.key]).trim()} 【${ability.label}判定】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from a `sengen` archive sheet, or null for any other sheet.
 *
 * Abilities become parameters; spells, with their category codes turned into names, and the profile
 * become sections; and the palette offers a roll for each ability.
 */
export function buildSengenCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isSengenCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Sengensyou');

  character.params = paramsOf(record, ABILITIES);
  character.sections = [buildSpellSection(record), profileSectionOf(record, PROFILE_FIELDS)].filter(
    (section): section is ImportedSection => section != null
  );

  character.commands = buildPalette(record);

  return character;
}
