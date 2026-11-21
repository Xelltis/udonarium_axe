/** A value as a record of fields, or null for anything that is not one. */
export function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The record a field stored as the text of a JSON object holds, or the record itself where it was
 * never made text; null where nothing was stored, or what was cannot be read as one.
 */
export function storedRecordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return recordOf(value);
  const text = value.trim();
  if (!text.startsWith('{')) return null;
  try {
    return recordOf(JSON.parse(text));
  } catch {
    return null;
  }
}
