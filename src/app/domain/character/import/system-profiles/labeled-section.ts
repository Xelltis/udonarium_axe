import {
  asString,
  classifyScalar,
  FieldLabel,
  ImportedField,
  ImportedGroup,
  ImportedSection,
  isNonEmptyScalar,
} from '@axe/domain/character/import/imported-character';

/**
 * Turns an array of records into a section: a group per record named by its `name`, with a field
 * for each listed key that holds something.
 *
 * `source` picks where within a record the fields are read from, such as a nested column; the name
 * is still read from the record itself. An unnamed record is numbered after the section label, and
 * one with neither a name nor a field is dropped. Null when no group is left.
 */
export function labeledSection(
  label: string,
  array: unknown,
  fieldLabels: readonly FieldLabel[],
  source?: (record: Record<string, unknown>) => Record<string, unknown>
): ImportedSection | null {
  const groups: ImportedGroup[] = [];
  asArray(array).forEach((element, index) => {
    const record = asRecord(element);
    if (!record) return;
    const data = source ? (source(record) ?? record) : record;
    const name = asString(record['name']).trim();
    const fields: ImportedField[] = [];
    for (const field of fieldLabels) {
      const raw = data[field.key];
      if (!isNonEmptyScalar(raw)) continue;
      const classified = classifyScalar(raw);
      fields.push({ label: field.label, value: classified.value, kind: classified.kind });
    }
    if (name === '' && fields.length === 0) return;
    groups.push({ label: name === '' ? `${label} ${index + 1}` : name, fields });
  });
  return groups.length > 0 ? { label, groups } : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
