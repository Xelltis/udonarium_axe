import {
  asString,
  ImportedCharacter,
  ImportedSection,
  isNonEmptyScalar,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  buildPrefixedSection,
  charasheetCharacterOf,
  isCharasheetGame,
  paramsOf,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The four abilities of that system. Their keys carry their names, so nothing has to be guessed from position.
const ABILITIES: { key: string; label: string }[] = [
  { key: 'N_Yuuki', label: '勇気' },
  { key: 'N_Chie', label: '知恵' },
  { key: 'N_Aijou', label: '愛情' },
  { key: 'N_Kibou', label: '希望' },
];

const SKILL_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'sl', label: 'レベル' },
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'cost', label: 'コスト' },
  { suffix: 'power', label: '威力' },
  { suffix: 'memo', label: '効果' },
];

const FRIEND_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'lv', label: '絆' },
  { suffix: 'memo', label: 'メモ' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'race', label: '種族' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `utakaze` system token. */
export function isUtakazeCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'utakaze');
}

function buildPalette(record: Record<string, unknown>): string {
  const lines = ABILITIES.filter((ability) => isNonEmptyScalar(record[ability.key])).map(
    (ability) => `${asString(record[ability.key]).trim()}UK 【${ability.label}】`
  );
  return lines.join('\n');
}

/**
 * Builds the imported model from a `utakaze` archive sheet, or null for any other sheet.
 *
 * Abilities become parameters; feats, companions, belongings and the profile become sections; and
 * the palette offers a roll for each ability.
 */
export function buildUtakazeCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isUtakazeCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'Utakaze');

  character.params = paramsOf(record, ABILITIES);
  character.sections = [
    buildPrefixedSection('特技', 'skill', SKILL_COLUMNS, record),
    buildPrefixedSection('仲間', 'friend', FRIEND_COLUMNS, record),
    buildPrefixedSection('所持品', 'item', [{ suffix: 'memo', label: 'メモ' }], record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record);

  return character;
}
