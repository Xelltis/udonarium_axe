import {
  asString,
  createEmptyImportedCharacter,
  ImportedCharacter,
  ImportedParam,
  ImportedStatus,
  normalizeHexColor,
  toFiniteNumber,
} from '@axe/domain/character/import/imported-character';

interface CcfoliaStatus {
  label?: unknown;
  value?: unknown;
  max?: unknown;
}

interface CcfoliaParam {
  label?: unknown;
  value?: unknown;
}

interface CcfoliaData {
  name?: unknown;
  memo?: unknown;
  initiative?: unknown;
  externalUrl?: unknown;
  status?: unknown;
  params?: unknown;
  iconUrl?: unknown;
  width?: unknown;
  height?: unknown;
  color?: unknown;
  commands?: unknown;
}

function parseStatuses(raw: unknown): ImportedStatus[] {
  if (!Array.isArray(raw)) return [];
  const statuses: ImportedStatus[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const status = entry as CcfoliaStatus;
    const label = asString(status.label).trim();
    if (label === '') continue;
    const max = toFiniteNumber(status.max, 0);
    const value = toFiniteNumber(status.value, max);
    statuses.push({ label, value, max });
  }
  return statuses;
}

function parseParams(raw: unknown): ImportedParam[] {
  if (!Array.isArray(raw)) return [];
  const params: ImportedParam[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const param = entry as CcfoliaParam;
    const label = asString(param.label).trim();
    if (label === '') continue;
    params.push({ label, value: asString(param.value) });
  }
  return params;
}

function sizeFromCells(width: unknown, height: unknown): number {
  const w = Math.round(toFiniteNumber(width, 0));
  const h = Math.round(toFiniteNumber(height, 0));
  const size = Math.max(w, h);
  return size >= 1 ? size : 1;
}

/**
 * Both the clipboard form of a piece from the other tool and its data alone are taken.
 * Null for anything it cannot recognise.
 */
export function isCcfoliaCharacter(parsed: unknown): boolean {
  if (parsed == null || typeof parsed !== 'object') return false;
  const record = parsed as Record<string, unknown>;
  if (record['kind'] === 'character' && record['data'] != null && typeof record['data'] === 'object') return true;
  if (record['data'] != null && typeof record['data'] === 'object') {
    const data = record['data'] as Record<string, unknown>;
    return Array.isArray(data['status']) || Array.isArray(data['params']) || typeof data['name'] === 'string';
  }
  return false;
}

/**
 * Reads a piece from the other tool into the imported model: name, notes, source link, colour,
 * palette, picture, resources, parameters, size in cells and initiative. Null when there is no
 * `data` object to read.
 */
export function parseCcfoliaCharacter(parsed: unknown): ImportedCharacter | null {
  if (parsed == null || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const dataSource = record['data'];
  if (dataSource == null || typeof dataSource !== 'object') return null;
  const data = dataSource as CcfoliaData;

  const character = createEmptyImportedCharacter('ccfolia');
  character.name = asString(data.name).trim();
  character.memo = asString(data.memo);
  character.externalUrl = asString(data.externalUrl).trim();
  character.color = normalizeHexColor(data.color);
  character.commands = asString(data.commands);
  character.iconUrl = asString(data.iconUrl).trim();
  character.statuses = parseStatuses(data.status);
  character.params = parseParams(data.params);
  character.size = sizeFromCells(data.width, data.height);
  character.initiative =
    data.initiative == null || asString(data.initiative).trim() === '' ? null : toFiniteNumber(data.initiative, 0);

  return character;
}
