import { sameEntries, sameFields } from '@axe/core/util/same-fields';

describe('sameFields', () => {
  it('takes records with the same keys and the same values for the same, in whatever order', () => {
    expect(sameFields({ a: 1, b: 'x' }, { b: 'x', a: 1 })).toBe(true);
    expect(sameFields({ a: NaN }, { a: NaN })).toBe(true);
  });

  it('tells apart a value changed, a key more or fewer, and objects that only look alike', () => {
    expect(sameFields({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameFields({ a: 1 }, { a: 1, b: 1 })).toBe(false);
    expect(sameFields({ a: 1, b: 1 }, { a: 1 })).toBe(false);
    expect(sameFields({ a: {} }, { a: {} })).toBe(false);
    expect(sameFields({ a: 0 }, { a: -0 })).toBe(false);
  });
});

describe('sameEntries', () => {
  it('takes the same list, and lists of entries with the same values in the same order, for the same', () => {
    const list = [{ a: 1 }];
    expect(sameEntries(list, list)).toBe(true);
    expect(sameEntries([{ a: 1 }, { a: 2 }], [{ a: 1 }, { a: 2 }])).toBe(true);
    expect(sameEntries([], [])).toBe(true);
  });

  it('tells apart lists of another length, another order or another value', () => {
    expect(sameEntries([{ a: 1 }], [{ a: 1 }, { a: 2 }])).toBe(false);
    expect(sameEntries([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }])).toBe(false);
    expect(sameEntries([{ a: 1 }], [{ a: 3 }])).toBe(false);
  });
});
