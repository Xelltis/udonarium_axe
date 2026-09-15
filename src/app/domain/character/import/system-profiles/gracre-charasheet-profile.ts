import {
  asString,
  ImportedCharacter,
  ImportedParam,
  ImportedSection,
  profileSectionOf,
} from '@axe/domain/character/import/imported-character';
import {
  asArray,
  buildPrefixedSection,
  charasheetCharacterOf,
  isCharasheetGame,
  paramsOf,
} from '@axe/domain/character/import/system-profiles/charasheet-shared';

// The ability bonuses of that system, in the usual order of that publisher's six abilities.
const ABILITY_BONUSES: { key: string; label: string }[] = [
  { key: 'NB1', label: '器用B' },
  { key: 'NB2', label: '敏捷B' },
  { key: 'NB3', label: '筋力B' },
  { key: 'NB4', label: '生命力B' },
  { key: 'NB5', label: '知力B' },
  { key: 'NB6', label: '精神B' },
];

const ACT_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'hit', label: '命中' },
  { suffix: 'power', label: '威力' },
  { suffix: 'range', label: '射程' },
  { suffix: 'cost', label: 'コスト' },
];

const FEAT_COLUMNS: { suffix: string; label: string }[] = [
  { suffix: 'shozoku', label: '系統' },
  { suffix: 'timing', label: 'タイミング' },
  { suffix: 'taisho', label: '対象' },
  { suffix: 'range', label: '射程' },
  { suffix: 'cost', label: 'コスト' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'shuzoku', label: '種族' },
  { key: 'age', label: '年齢' },
  { key: 'sex', label: '性別' },
];

/** Whether the pasted json is an archive sheet under the `gracre` system token. */
export function isGracreCharasheetCharacter(parsed: unknown): boolean {
  return isCharasheetGame(parsed, 'gracre');
}

function rollLines(prefix: string, fallbackName: string, record: Record<string, unknown>): string[] {
  const names = asArray(record[`${prefix}_name`]);
  const hits = asArray(record[`${prefix}_hit`]);
  const lines: string[] = [];
  hits.forEach((rawHit, index) => {
    const roll = asString(rawHit).trim();
    if (roll === '' || !/\dd/i.test(roll)) return;
    const name = asString(names[index]).trim() || fallbackName;
    lines.push(`${roll} 【${name}】`);
  });
  return lines;
}

function buildPalette(record: Record<string, unknown>, params: ImportedParam[]): string {
  const lines: string[] = ['2d6 【判定】'];

  const abilityLines = ABILITY_BONUSES.filter((ability) => params.some((param) => param.label === ability.label)).map(
    (ability) => `2d6+{${ability.label}} 【${ability.label.replace('B', '')}判定】`
  );
  if (abilityLines.length > 0) lines.push('◆能力値', ...abilityLines);

  const actLines = rollLines('acts', '行動', record);
  if (actLines.length > 0) lines.push('◆行動', ...actLines);

  const evadeLines = rollLines('evades', '回避', record);
  if (evadeLines.length > 0) lines.push('◆回避', ...evadeLines);

  return lines.join('\n');
}

/**
 * Builds the imported model from a `gracre` archive sheet, or null for any other sheet.
 *
 * Ability bonuses become parameters; actions, feats, magic and the profile become sections; and the
 * palette offers a 2d6 roll for each ability bonus plus the action and evasion rolls the sheet
 * writes out.
 */
export function buildGracreCharasheetCharacter(parsed: unknown): ImportedCharacter | null {
  if (!isGracreCharasheetCharacter(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = charasheetCharacterOf(record, 'GranCrest');

  const params = paramsOf(record, ABILITY_BONUSES);
  character.params = params;
  character.sections = [
    buildPrefixedSection('行動', 'acts', ACT_COLUMNS, record),
    buildPrefixedSection('特技', 'effect', FEAT_COLUMNS, record),
    buildPrefixedSection('魔法', 'magic', FEAT_COLUMNS, record),
    profileSectionOf(record, PROFILE_FIELDS),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record, params);

  return character;
}
