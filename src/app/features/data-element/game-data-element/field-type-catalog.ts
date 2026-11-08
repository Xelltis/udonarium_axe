import { DataElementFieldType, type DataElementFieldTypeValue } from '@axe/domain/data/data-element';

/** One kind of field a sheet row can be, as the pickers offer it. */
export interface FieldTypeEntry {
  type: DataElementFieldTypeValue;
  /** The icon the type is drawn with where it is chosen from a grid. */
  icon: string;
  labelKey: string;
  /** What the kind is for, in a line, where a kind is chosen for a field about to be added. */
  hintKey: string;
}

/**
 * The kinds of field a row can be switched to, in the order every picker lists them.
 *
 * Markdown and check tables are kinds the data still reads but nothing offers any more, so they are
 * left out here.
 */
export const FIELD_TYPE_CATALOG: readonly FieldTypeEntry[] = [
  {
    type: DataElementFieldType.TEXT,
    icon: 'short_text',
    labelKey: 'feature.dataElement.fieldType.text',
    hintKey: 'feature.dataElement.fieldTypeHint.text',
  },
  {
    type: DataElementFieldType.NUMBER,
    icon: 'numbers',
    labelKey: 'feature.dataElement.fieldType.number',
    hintKey: 'feature.dataElement.fieldTypeHint.number',
  },
  {
    type: DataElementFieldType.RESOURCE,
    icon: 'battery_5_bar',
    labelKey: 'feature.dataElement.fieldType.resource',
    hintKey: 'feature.dataElement.fieldTypeHint.resource',
  },
  {
    type: DataElementFieldType.LONG_TEXT,
    icon: 'notes',
    labelKey: 'feature.dataElement.fieldType.longText',
    hintKey: 'feature.dataElement.fieldTypeHint.longText',
  },
  {
    type: DataElementFieldType.CHECK,
    icon: 'check_box',
    labelKey: 'feature.dataElement.fieldType.check',
    hintKey: 'feature.dataElement.fieldTypeHint.check',
  },
  {
    type: DataElementFieldType.SELECT,
    icon: 'arrow_drop_down_circle',
    labelKey: 'feature.dataElement.fieldType.select',
    hintKey: 'feature.dataElement.fieldTypeHint.select',
  },
  {
    type: DataElementFieldType.CALC,
    icon: 'functions',
    labelKey: 'feature.dataElement.fieldType.calc',
    hintKey: 'feature.dataElement.fieldTypeHint.calc',
  },
  {
    type: DataElementFieldType.IMAGE,
    icon: 'image',
    labelKey: 'feature.dataElement.fieldType.image',
    hintKey: 'feature.dataElement.fieldTypeHint.image',
  },
  {
    type: DataElementFieldType.RANGE_SHAPE,
    icon: 'category',
    labelKey: 'feature.dataElement.fieldType.rangeShape',
    hintKey: 'feature.dataElement.fieldTypeHint.rangeShape',
  },
  {
    type: DataElementFieldType.EFFECT,
    icon: 'auto_awesome',
    labelKey: 'feature.dataElement.fieldType.effect',
    hintKey: 'feature.dataElement.fieldTypeHint.effect',
  },
];

/** The catalog entry for a type, falling back to text for a kind the pickers do not offer. */
export function fieldTypeEntry(type: string): FieldTypeEntry {
  return FIELD_TYPE_CATALOG.find((entry) => entry.type === type) ?? FIELD_TYPE_CATALOG[0];
}
