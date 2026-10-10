import { replaceIdentifierIn, replaceIdentifierInText } from '@axe/domain/media/image-reference';

describe('image-reference', () => {
  const old = 'a'.repeat(64);
  const next = 'b'.repeat(64);

  it('puts the identifier to the new one wherever it stands on its own', () => {
    expect(replaceIdentifierInText(old, old, next)).toBe(next);
    expect(replaceIdentifierInText(`image:${old}`, old, next)).toBe(`image:${next}`);
    expect(replaceIdentifierInText(`["${old}","x"]`, old, next)).toBe(`["${next}","x"]`);
    expect(replaceIdentifierInText(`${old}\n${old}`, old, next)).toBe(`${next}\n${next}`);
  });

  it('leaves a mention that is part of another identifier alone', () => {
    expect(replaceIdentifierInText('portrait_1', 'portrait', 'face')).toBe('portrait_1');
    expect(replaceIdentifierInText('my-portrait', 'portrait', 'face')).toBe('my-face');
    expect(replaceIdentifierInText(`imagetag_${old}`, old, next)).toBe(`imagetag_${old}`);
  });

  it('goes down through lists and records, and says whether anything changed', () => {
    const data = { attributes: { imageIdentifier: old, name: 'コマ' }, slots: ['', old], depth: 3 };

    const result = replaceIdentifierIn(data, old, next);

    expect(result.changed).toBe(true);
    expect(result.value).toEqual({ attributes: { imageIdentifier: next, name: 'コマ' }, slots: ['', next], depth: 3 });
    expect(data.attributes.imageIdentifier).toBe(old);
  });

  it('hands back what does not mention the identifier as it was', () => {
    const data = { attributes: { name: 'コマ' }, slots: [''] };

    const result = replaceIdentifierIn(data, old, next);

    expect(result.changed).toBe(false);
    expect(result.value).toBe(data);
  });
});
