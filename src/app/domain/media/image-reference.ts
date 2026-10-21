/** A character that can be part of an identifier, so a match beside one is part of another identifier. */
const IDENTIFIER_CHARACTER = /[A-Za-z0-9_]/;

/**
 * Text with every mention of one picture's identifier put to another.
 *
 * Only a mention standing on its own counts: one with a letter, digit or underscore right before
 * or after it is part of some other identifier and is left alone. A mention after `image:` in a
 * stamp, inside a JSON string or in a list on lines of its own all stand on their own.
 */
export function replaceIdentifierInText(text: string, from: string, to: string): string {
  if (from.length === 0 || !text.includes(from)) return text;
  let out = '';
  let index = 0;
  for (let at = text.indexOf(from); at >= 0; at = text.indexOf(from, index)) {
    out += text.slice(index, at) + (standsAlone(text, at, from.length) ? to : from);
    index = at + from.length;
  }
  return out + text.slice(index);
}

/**
 * A value of synced data with every mention of one picture's identifier put to another, down
 * through its lists and records, and whether anything changed. What did not change is handed
 * back as it was.
 */
export function replaceIdentifierIn<T>(value: T, from: string, to: string): { value: T; changed: boolean } {
  if (typeof value === 'string') {
    const replaced = replaceIdentifierInText(value, from, to);
    return { value: replaced as T, changed: replaced !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const result = replaceIdentifierIn(item, from, to);
      changed ||= result.changed;
      return result.value;
    });
    return { value: (changed ? items : value) as T, changed };
  }
  if (value !== null && typeof value === 'object') {
    let changed = false;
    const record: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = replaceIdentifierIn(item, from, to);
      changed ||= result.changed;
      record[key] = result.value;
    }
    return { value: (changed ? record : value) as T, changed };
  }
  return { value, changed: false };
}

/**
 * Whether synced data mentions any of the identifiers on its own anywhere, down through its lists and
 * records. It stops at the first mention and copies nothing, so a whole room can be asked about many.
 */
export function mentionsAnyOf(value: unknown, identifiers: readonly string[]): boolean {
  if (typeof value === 'string') return identifiers.some((identifier) => mentionsInText(value, identifier));
  if (Array.isArray(value)) return value.some((item) => mentionsAnyOf(item, identifiers));
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => mentionsAnyOf(item, identifiers));
  }
  return false;
}

function mentionsInText(text: string, identifier: string): boolean {
  if (identifier.length === 0) return false;
  for (let at = text.indexOf(identifier); at >= 0; at = text.indexOf(identifier, at + 1)) {
    if (standsAlone(text, at, identifier.length)) return true;
  }
  return false;
}

/** Whether the mention at `at` stands on its own, with no letter, digit or underscore right before or after it. */
function standsAlone(text: string, at: number, length: number): boolean {
  const before = at > 0 ? text[at - 1] : '';
  const after = text[at + length] ?? '';
  return !IDENTIFIER_CHARACTER.test(before) && !IDENTIFIER_CHARACTER.test(after);
}
