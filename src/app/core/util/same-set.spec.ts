import { sameSet } from '@axe/core/util/same-set';

describe('sameSet', () => {
  it('holds two sets of the same members the same, whatever their order', () => {
    expect(sameSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
    expect(sameSet(new Set(), new Set())).toBe(true);
  });

  it('holds two sets apart by a member or by their size', () => {
    expect(sameSet(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false);
    expect(sameSet(new Set(['a']), new Set(['a', 'b']))).toBe(false);
  });
});
