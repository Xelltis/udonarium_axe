import { DataElementFieldType } from '@axe/domain/data/data-element';
import { FIELD_TYPE_CATALOG, fieldTypeEntry } from '@axe/features/data-element/game-data-element/field-type-catalog';

describe('FIELD_TYPE_CATALOG', () => {
  it('offers the ten kinds a row can be switched to, in picker order', () => {
    expect(FIELD_TYPE_CATALOG.map((entry) => entry.type)).toEqual([
      'text',
      'number',
      'resource',
      'longText',
      'check',
      'select',
      'calc',
      'image',
      'rangeShape',
      'effect',
    ]);
  });

  it('leaves out the kinds nothing offers any more', () => {
    const types = FIELD_TYPE_CATALOG.map((entry) => entry.type as string);
    expect(types).not.toContain(DataElementFieldType.MARKDOWN);
    expect(types).not.toContain(DataElementFieldType.CHECK_TABLE);
  });

  it('gives every kind its own icon', () => {
    const icons = FIELD_TYPE_CATALOG.map((entry) => entry.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('labels every kind from the fieldType keys', () => {
    for (const entry of FIELD_TYPE_CATALOG) {
      expect(entry.labelKey).toBe(`feature.dataElement.fieldType.${entry.type}`);
    }
  });
});

describe('fieldTypeEntry', () => {
  it('finds the entry for a kind on offer', () => {
    expect(fieldTypeEntry('resource').icon).toBe('battery_5_bar');
  });

  it('falls back to text for a kind not on offer', () => {
    expect(fieldTypeEntry('markdown').type).toBe('text');
  });
});
