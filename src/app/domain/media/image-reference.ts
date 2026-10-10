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
    const before = at > 0 ? text[at - 1] : '';
    const after = text[at + from.length] ?? '';
    const alone = !IDENTIFIER_CHARACTER.test(before) && !IDENTIFIER_CHARACTER.test(after);
    out += text.slice(index, at) + (alone ? to : from);
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
