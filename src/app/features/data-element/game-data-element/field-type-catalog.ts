import { DataElementFieldType, type DataElementFieldTypeValue } from '@axe/domain/data/data-element';

/** One kind of field a sheet row can be, as the pickers offer it. */
export interface FieldTypeEntry {
  type: DataElementFieldTypeValue;
  /** The icon the type is drawn with where it is chosen from a grid. */
  icon: string;
  labelKey: string;
}

/**
 * The kinds of field a row can be switched to, in the order every picker lists them.
 *
 * Markdown and check tables are kinds the data still reads but nothing offers any more, so they are
 * left out here.
 */
export const FIELD_TYPE_CATALOG: readonly FieldTypeEntry[] = [
  { type: DataElementFieldType.TEXT, icon: 'short_text', labelKey: 'feature.dataElement.fieldType.text' },
  { type: DataElementFieldType.NUMBER, icon: 'numbers', labelKey: 'feature.dataElement.fieldType.number' },
  { type: DataElementFieldType.RESOURCE, icon: 'battery_5_bar', labelKey: 'feature.dataElement.fieldType.resource' },
  { type: DataElementFieldType.LONG_TEXT, icon: 'notes', labelKey: 'feature.dataElement.fieldType.longText' },
  { type: DataElementFieldType.CHECK, icon: 'check_box', labelKey: 'feature.dataElement.fieldType.check' },
  {
    type: DataElementFieldType.SELECT,
    icon: 'arrow_drop_down_circle',
    labelKey: 'feature.dataElement.fieldType.select',
  },
  { type: DataElementFieldType.CALC, icon: 'functions', labelKey: 'feature.dataElement.fieldType.calc' },
  { type: DataElementFieldType.IMAGE, icon: 'image', labelKey: 'feature.dataElement.fieldType.image' },
  { type: DataElementFieldType.RANGE_SHAPE, icon: 'category', labelKey: 'feature.dataElement.fieldType.rangeShape' },
  { type: DataElementFieldType.EFFECT, icon: 'auto_awesome', labelKey: 'feature.dataElement.fieldType.effect' },
];

/** The catalog entry for a type, falling back to text for a kind the pickers do not offer. */
export function fieldTypeEntry(type: string): FieldTypeEntry {
  return FIELD_TYPE_CATALOG.find((entry) => entry.type === type) ?? FIELD_TYPE_CATALOG[0];
}
