export type SyncData = Readonly<Record<string, unknown>>;

export const SYNC_ATTRIBUTES_KEY = 'attributes';
const ATTRIBUTE_PREFIX = `${SYNC_ATTRIBUTES_KEY}.`;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lifts each entry of an object's attributes to a top-level `attributes.<name>` key.
 *
 * A diff over the result tells which attribute changed rather than only that the attributes
 * did. Everything else is left as it is.
 */
export function flattenSyncData(data: SyncData): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (key === SYNC_ATTRIBUTES_KEY && isPlainRecord(value)) {
      for (const name of Object.keys(value)) flat[ATTRIBUTE_PREFIX + name] = value[name];
      continue;
    }
    flat[key] = value;
  }
  return flat;
}

/** Gathers `attributes.<name>` keys back into one attributes record, the reverse of `flattenSyncData`. */
export function expandSyncPaths(flat: SyncData): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(flat)) {
    if (!key.startsWith(ATTRIBUTE_PREFIX)) {
      data[key] = flat[key];
      continue;
    }
    const attributes = (data[SYNC_ATTRIBUTES_KEY] ??= {}) as Record<string, unknown>;
    attributes[key.slice(ATTRIBUTE_PREFIX.length)] = flat[key];
  }
  return data;
}

/** Lays one set of object fields over another, attribute by attribute rather than replacing the attributes whole. */
export function mergeSyncData(base: SyncData, overlay: SyncData): Record<string, unknown> {
  return expandSyncPaths({ ...flattenSyncData(base), ...flattenSyncData(overlay) });
}

/** The value of a named field, looked for among the attributes first and then at the top level. */
export function syncValueOf(data: SyncData, name: string): unknown {
  const attributes = data[SYNC_ATTRIBUTES_KEY];
  if (isPlainRecord(attributes) && name in attributes) return attributes[name];
  return data[name];
}

/** Whether a set of changed keys names the field, either directly or as an attribute. */
export function hasChangedKey(keys: ReadonlySet<string>, name: string): boolean {
  return keys.has(name) || keys.has(ATTRIBUTE_PREFIX + name);
}

export interface SyncDataDiff {
  keys: readonly string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/** Whether two field values are equal, comparing arrays and objects by their contents at every depth. */
export function isSameSyncValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => isSameSyncValue(item, b[index]));
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => key in right && isSameSyncValue(left[key], right[key]));
}

/**
 * A deep copy of a field value, so a recorded value is not changed by later edits to the live one.
 *
 * Arrays and objects are copied at every depth, any object as a plain record of its own keys.
 */
export function cloneSyncValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(cloneSyncValue) as T;

  const source = value as Record<string, unknown>;
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(source)) clone[key] = cloneSyncValue(source[key]);
  return clone as T;
}

/** A deep copy of every field of an object's data. */
export function cloneSyncData(data: SyncData): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(data)) clone[key] = cloneSyncValue(data[key]);
  return clone;
}

/**
 * The top-level fields that differ between two states of an object, with copies of their
 * values before and after.
 *
 * A field that is gone has only a before value. With no earlier state every field counts as
 * changed. Null when nothing changed.
 */
export function diffSyncData(before: SyncData | null, after: SyncData): SyncDataDiff | null {
  const keys: string[] = [];
  const beforeChanged: Record<string, unknown> = {};
  const afterChanged: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    if (before && isSameSyncValue(before[key], after[key])) continue;
    keys.push(key);
    if (before && key in before) beforeChanged[key] = cloneSyncValue(before[key]);
    afterChanged[key] = cloneSyncValue(after[key]);
  }

  if (before) {
    for (const key of Object.keys(before)) {
      if (key in after) continue;
      keys.push(key);
      beforeChanged[key] = cloneSyncValue(before[key]);
    }
  }

  if (keys.length < 1) return null;
  return { keys, before: beforeChanged, after: afterChanged };
}
