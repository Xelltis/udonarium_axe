import {
  asString,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedParam,
  ImportedSection,
  ImportedStatus,
  isNonEmptyScalar,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';

const ABILITIES: { value: string; bonus: string; label: string }[] = [
  { value: 'sttDex', bonus: 'bonusDex', label: '器用' },
  { value: 'sttAgi', bonus: 'bonusAgi', label: '敏捷' },
  { value: 'sttStr', bonus: 'bonusStr', label: '筋力' },
  { value: 'sttVit', bonus: 'bonusVit', label: '生命力' },
  { value: 'sttInt', bonus: 'bonusInt', label: '知力' },
  { value: 'sttMnd', bonus: 'bonusMnd', label: '精神' },
];

// The abbreviated level keys of that system and their skills, as the real samples show.
const SKILLS: { key: string; name: string }[] = [
  { key: 'lvFig', name: 'ファイター' },
  { key: 'lvFen', name: 'フェンサー' },
  { key: 'lvGra', name: 'グラップラー' },
  { key: 'lvSho', name: 'シューター' },
  { key: 'lvSco', name: 'スカウト' },
  { key: 'lvRan', name: 'レンジャー' },
  { key: 'lvSag', name: 'セージ' },
  { key: 'lvEnh', name: 'エンハンサー' },
  { key: 'lvBar', name: 'バード' },
  { key: 'lvRid', name: 'ライダー' },
  { key: 'lvAlc', name: 'アルケミスト' },
  { key: 'lvWar', name: 'ウォーリーダー' },
  { key: 'lvSor', name: 'ソーサラー' },
  { key: 'lvCon', name: 'コンジャラー' },
  { key: 'lvPri', name: 'プリースト' },
  { key: 'lvMag', name: 'マギテック' },
  { key: 'lvFai', name: 'フェアリーテイマー' },
  { key: 'lvDru', name: 'ドルイド' },
  { key: 'lvDem', name: 'デーモンルーラー' },
  { key: 'lvMin', name: 'ミンストレル' },
  { key: 'lvGeo', name: 'ジオマンサー' },
  { key: 'lvSeeker', name: 'アビスシーカー' },
];

const COMBAT_FEATS: { key: string; label: string }[] = [
  { key: 'combatFeatsAuto', label: '自動取得' },
  { key: 'combatFeatsLv1', label: 'Lv1' },
  { key: 'combatFeatsLv3', label: 'Lv3' },
  { key: 'combatFeatsLv5', label: 'Lv5' },
  { key: 'combatFeatsLv7', label: 'Lv7' },
  { key: 'combatFeatsLv9', label: 'Lv9' },
];

const PROFILE_FIELDS: { key: string; label: string }[] = [
  { key: 'race', label: '種族' },
  { key: 'age', label: '年齢' },
  { key: 'gender', label: '性別' },
  { key: 'faith', label: '信仰' },
  { key: 'level', label: '冒険者レベル' },
  { key: 'expTotal', label: '経験点' },
  { key: 'playerName', label: 'PL' },
];

/**
 * Whether the pasted json is a character from that service in the one system it has a dedicated
 * profile for, told by a `characterName` alongside `sttStr` and `bonusStr`.
 */
export function isYtsheetSw25Character(parsed: unknown): boolean {
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  return typeof record['characterName'] === 'string' && 'sttStr' in record && 'bonusStr' in record;
}

function buildParams(record: Record<string, unknown>): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const ability of ABILITIES) {
    if (isNonEmptyScalar(record[ability.value]))
      params.push({ label: ability.label, value: asString(record[ability.value]) });
    if (isNonEmptyScalar(record[ability.bonus]))
      params.push({ label: `${ability.label}B`, value: asString(record[ability.bonus]) });
  }
  for (const [key, label] of [
    ['vitResistTotal', '生命抵抗'],
    ['mndResistTotal', '精神抵抗'],
    ['initiative', '先制力'],
    ['mobilityTotal', '移動力'],
  ] as const) {
    if (isNonEmptyScalar(record[key])) params.push({ label, value: asString(record[key]) });
  }
  return params;
}

function buildStatuses(record: Record<string, unknown>): ImportedStatus[] {
  const statuses: ImportedStatus[] = [];
  if (isNonEmptyScalar(record['hpTotal'])) {
    const hp = toFiniteNumber(record['hpTotal'], 0);
    statuses.push({ label: 'HP', value: hp, max: hp });
  }
  if (isNonEmptyScalar(record['mpTotal'])) {
    const mp = toFiniteNumber(record['mpTotal'], 0);
    statuses.push({ label: 'MP', value: mp, max: mp });
  }
  return statuses;
}

function buildSkillSection(record: Record<string, unknown>): ImportedSection | null {
  const fields: ImportedField[] = [];
  for (const skill of SKILLS) {
    const level = toFiniteNumber(record[skill.key], 0);
    if (level >= 1) fields.push({ label: skill.name, value: level, kind: 'number' });
  }
  return fields.length > 0 ? { label: '技能', groups: [{ label: '技能', fields }] } : null;
}

function buildCombatFeatSection(record: Record<string, unknown>): ImportedSection | null {
  const fields: ImportedField[] = [];
  for (const feat of COMBAT_FEATS) {
    if (!isNonEmptyScalar(record[feat.key])) continue;
    fields.push({ label: feat.label, value: asString(record[feat.key]), kind: 'text' });
  }
  return fields.length > 0 ? { label: '戦闘特技', groups: [{ label: '習得', fields }] } : null;
}

function buildWeaponSection(record: Record<string, unknown>): ImportedSection | null {
  const count = Math.max(toFiniteNumber(record['weaponNum'], 0), 2);
  const groups: ImportedGroup[] = [];
  for (let i = 1; i <= count; i++) {
    const name = asString(record[`weapon${i}Name`]).trim();
    if (name === '') continue;
    const columns: [string, string][] = [
      [`weapon${i}Category`, '種別'],
      [`weapon${i}AccTotal`, '命中'],
      [`weapon${i}Rate`, '威力'],
      [`weapon${i}Crit`, 'C値'],
      [`weapon${i}DmgTotal`, '追加ダメージ'],
      [`weapon${i}Note`, '備考'],
    ];
    const fields: ImportedField[] = [];
    for (const [key, label] of columns) {
      if (!isNonEmptyScalar(record[key])) continue;
      const raw = record[key];
      const numeric =
        typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));
      fields.push({ label, value: numeric ? Number(raw) : asString(raw), kind: numeric ? 'number' : 'text' });
    }
    groups.push({ label: name, fields });
  }
  return groups.length > 0 ? { label: '武器', groups } : null;
}

function buildArmourSection(record: Record<string, unknown>): ImportedSection | null {
  const groups: ImportedGroup[] = [];
  for (let i = 1; i <= 2; i++) {
    const name = asString(record[`armour${i}Name`]).trim();
    if (name === '') continue;
    const columns: [string, string][] = [
      [`armour${i}Category`, '種別'],
      [`armour${i}Def`, '防護点'],
      [`armour${i}Eva`, '回避'],
    ];
    const fields: ImportedField[] = [];
    for (const [key, label] of columns) {
      if (!isNonEmptyScalar(record[key])) continue;
      const raw = record[key];
      const numeric =
        typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));
      fields.push({ label, value: numeric ? Number(raw) : asString(raw), kind: numeric ? 'number' : 'text' });
    }
    groups.push({ label: name, fields });
  }
  return groups.length > 0 ? { label: '防具', groups } : null;
}

function buildProfileSection(record: Record<string, unknown>): ImportedSection | null {
  const fields: ImportedField[] = [];
  for (const field of PROFILE_FIELDS) {
    if (!isNonEmptyScalar(record[field.key])) continue;
    const raw = record[field.key];
    const numeric =
      typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));
    fields.push({
      label: field.label,
      value: numeric ? Number(raw) : asString(raw),
      kind: numeric ? 'number' : 'text',
    });
  }
  return fields.length > 0 ? { label: 'プロフィール', groups: [{ label: '基本', fields }] } : null;
}

function buildPalette(record: Record<string, unknown>, params: ImportedParam[]): string {
  const lines: string[] = ['2d6 【判定】'];

  const abilityLines = ABILITIES.filter((ability) => params.some((param) => param.label === `${ability.label}B`)).map(
    (ability) => `2d6+{${ability.label}B} 【${ability.label}判定】`
  );
  if (abilityLines.length > 0) lines.push('◆能力値', ...abilityLines);

  const count = Math.max(toFiniteNumber(record['weaponNum'], 0), 2);
  const weaponLines: string[] = [];
  for (let i = 1; i <= count; i++) {
    const name = asString(record[`weapon${i}Name`]).trim();
    if (name === '') continue;
    const acc = asString(record[`weapon${i}AccTotal`]).trim();
    if (acc !== '') weaponLines.push(`2d6+${acc} 【${name} 命中】`);
    const rate = asString(record[`weapon${i}Rate`]).trim();
    if (rate !== '') {
      const crit = toFiniteNumber(record[`weapon${i}Crit`], 10);
      const dmg = toFiniteNumber(record[`weapon${i}DmgTotal`], 0);
      weaponLines.push(`K${rate}+${dmg}@${crit} 【${name} 打撃】`);
    }
  }
  if (weaponLines.length > 0) lines.push('◆武器', ...weaponLines);

  return lines.join('\n');
}

/**
 * Builds the imported model from that service's character in its profiled system, or null for
 * anything else.
 *
 * Abilities with their bonuses, resistances, initiative and movement become parameters and HP and
 * MP resources; skill levels, combat feats, weapons, armour and the profile become sections; and
 * the palette offers ability rolls and each weapon's hit and damage rolls.
 */
export function buildYtsheetSw25Character(parsed: unknown): ImportedCharacter | null {
  if (!isYtsheetSw25Character(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const character = createEmptyImportedCharacter('ytsheet');
  character.name = asString(record['characterName']).trim();
  character.memo = asString(record['freeNote']);
  character.dicebot = 'SwordWorld2.5';

  const params = buildParams(record);
  character.params = params;
  character.statuses = buildStatuses(record);
  character.sections = [
    buildSkillSection(record),
    buildCombatFeatSection(record),
    buildWeaponSection(record),
    buildArmourSection(record),
    buildProfileSection(record),
  ].filter((section): section is ImportedSection => section != null);

  character.commands = buildPalette(record, params);

  return character;
}
