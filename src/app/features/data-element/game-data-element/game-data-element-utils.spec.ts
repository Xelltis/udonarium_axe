import { DataElement, DataElementFieldType, DataElementType } from '@axe/domain/data/data-element';
import { fieldHasOptions, isUrlText } from '@axe/features/data-element/game-data-element/game-data-element-utils';

describe('isUrlText', () => {
  it('is true for a secure address', () => {
    expect(isUrlText('https://example.com')).toBe(true);
  });

  it('is true for a plain one', () => {
    expect(isUrlText('http://example.com')).toBe(true);
  });

  it('is false for ordinary text', () => {
    expect(isUrlText('こんにちは')).toBe(false);
  });

  it('is false for an empty string', () => {
    expect(isUrlText('')).toBe(false);
  });

  it('is false for a number', () => {
    expect(isUrlText(42)).toBe(false);
  });

  it('is false for zero', () => {
    expect(isUrlText(0)).toBe(false);
  });
});

describe('fieldHasOptions', () => {
  it('is true for the kinds that always had settings', () => {
    for (const fieldType of ['select', 'number', 'resource', 'calc', 'image']) {
      expect(fieldHasOptions(DataElement.create('項目', '', { fieldType })), fieldType).toBe(true);
    }
  });

  it('is true for a checkbox, which may keep a default', () => {
    const check = DataElement.create('転倒', 0, { type: DataElementType.CHECK, fieldType: DataElementFieldType.CHECK });

    expect(fieldHasOptions(check)).toBe(true);
  });

  it('is true for a line of text holding a number or keeping a default, and false for a line of prose', () => {
    expect(fieldHasOptions(DataElement.create('命中', '5'))).toBe(true);
    expect(fieldHasOptions(DataElement.create('命中', '封印中', { 'cs-default': '5' }))).toBe(true);
    expect(fieldHasOptions(DataElement.create('種族', '人間'))).toBe(false);
    expect(fieldHasOptions(DataElement.create('備考', ''))).toBe(false);
  });

  it('is false for a note and a rule of text that keeps nothing', () => {
    expect(fieldHasOptions(DataElement.create('メモ', '12', { type: DataElementType.NOTE }))).toBe(false);
  });
});
