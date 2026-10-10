import {
  asString,
  classifyScalar,
  createEmptyImportedCharacter,
  FieldLabel,
  ImportedCharacter,
  ImportedField,
  ImportedGroup,
  ImportedParam,
  ImportedSection,
  isNonEmptyScalar,
  normalizeHexColor,
} from '@axe/domain/character/import/imported-character';

export interface Column {
  key: string;
  label: string;
}

/**
 * Whether a sheet from the archive belongs to that system.
 *
 * Every sheet carries a name and a system token, and nothing else is read.
 */
export function isCharasheetGame(parsed: unknown, game: string): boolean {
  return charasheetGameOf(parsed) === game;
}

/** The token the sheet gives for its system. Empty for anything but an archive sheet. */
export function charasheetGameOf(parsed: unknown): string {
  if (parsed == null || typeof parsed !== 'object') return '';
  const record = parsed as Record<string, unknown>;
  if (typeof record['pc_name'] !== 'string') return '';
  return asString(record['game']).trim().toLowerCase();
}

/**
 * The value when it is an array, otherwise an empty one, so a missing column of an archive sheet
 * reads as no rows.
 */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The abilities, laid out as they are. A field that holds nothing is left off.
 *
 * What is laid out and under which name differs between systems; how it is laid out does not.
 */
/** The portrait an archive sheet carries inline. Only one without a header is given one. */
export function normalizeImage(record: Record<string, unknown>): string {
  const raw = asString(record['base64Image']).trim();
  if (raw === '') return '';
  return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
}

/**
 * What every archive sheet has in common: the name, the colour, the portrait, the notes and the way back to the sheet itself.
 *
 * What follows differs between systems; this much sits in the same place under the same name.
 */
export function charasheetCharacterOf(record: Record<string, unknown>, dicebot: string): ImportedCharacter {
  const character = createEmptyImportedCharacter('charasheet');
  character.name = asString(record['pc_name']).trim();
  character.color = normalizeHexColor(record['color']);
  character.iconUrl = normalizeImage(record);
  character.memo = asString(record['pc_making_environ']);
  character.dicebot = dicebot;
  const url = asString(record['url']).trim();
  if (url !== '') character.externalUrl = url;
  return character;
}

/**
 * The parameters read from the listed keys of a sheet, in the order listed and under their labels.
 * A key that holds nothing is left off.
 */
export function paramsOf(record: Record<string, unknown>, fields: readonly FieldLabel[]): ImportedParam[] {
  const params: ImportedParam[] = [];
  for (const field of fields) {
    if (isNonEmptyScalar(record[field.key])) params.push({ label: field.label, value: asString(record[field.key]) });
  }
  return params;
}

/**
 * Pairs the names in one array with the cells at the same index in the column arrays, a group per
 * named row.
 *
 * A row with a blank name is dropped, as is a cell that holds nothing. Null when no row has a name.
 */
export function buildParallelSection(
  label: string,
  nameKey: string,
  columns: Column[],
  record: Record<string, unknown>
): ImportedSection | null {
  const names = asArray(record[nameKey]);
  const groups: ImportedGroup[] = [];
  names.forEach((rawName, index) => {
    const name = asString(rawName).trim();
    if (name === '') return;
    const fields: ImportedField[] = [];
    for (const column of columns) {
      const cell = asArray(record[column.key])[index];
      if (!isNonEmptyScalar(cell)) continue;
      const classified = classifyScalar(cell);
      fields.push({ label: column.label, value: classified.value, kind: classified.kind });
    }
    groups.push({ label: name, fields });
  });
  return groups.length > 0 ? { label, groups } : null;
}

/**
 * Pairs the names with the other columns, a row at a time.
 *
 * The archive holds one table as an array per column, one of names, one of powers and so on.
 * One index across them all makes a row.
 */
export function buildPrefixedSection(
  label: string,
  prefix: string,
  columns: { suffix: string; label: string }[],
  record: Record<string, unknown>
): ImportedSection | null {
  return buildParallelSection(
    label,
    `${prefix}_name`,
    columns.map((column) => ({ key: `${prefix}_${column.suffix}`, label: column.label })),
    record
  );
}

/**
 * Gathers the sheet's remaining scalar keys into an `その他` section, under their raw key names.
 *
 * Keys the profile already handles, as `isStructuredKey` answers, and arrays are left out. Null
 * when nothing is left.
 */
export function buildOtherSection(
  record: Record<string, unknown>,
  isStructuredKey: (key: string) => boolean
): ImportedSection | null {
  const fields: ImportedField[] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (isStructuredKey(key) || Array.isArray(raw) || !isNonEmptyScalar(raw)) continue;
    const classified = classifyScalar(raw);
    fields.push({ label: key, value: classified.value, kind: classified.kind });
  }
  return fields.length > 0 ? { label: 'その他', groups: [{ label: '基本', fields }] } : null;
}
