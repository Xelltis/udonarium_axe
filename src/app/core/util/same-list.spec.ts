import { sameList } from '@axe/core/util/same-list';

describe('sameList', () => {
  it('holds two lists of the same items in the same order the same', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameList([], [])).toBe(true);
    const one = [{ id: 1 }];
    expect(sameList(one, [one[0]])).toBe(true);
  });

  it('holds two lists apart by an item, by order or by length', () => {
    expect(sameList(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(sameList(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameList(['a'], ['a', 'b'])).toBe(false);
    expect(sameList([{ id: 1 }], [{ id: 1 }])).toBe(false);
  });

  it('weighs each pair as it is told to', () => {
    const byId = (x: { id: number }, y: { id: number }) => x.id === y.id;
    expect(sameList([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }], byId)).toBe(true);
    expect(sameList([{ id: 1 }], [{ id: 2 }], byId)).toBe(false);
  });

  it('answers for the one list without looking at its items', () => {
    const one = ['a'];
    const looked = vi.spyOn(one, 'every');
    expect(sameList(one, one)).toBe(true);
    expect(looked).not.toHaveBeenCalled();
  });
});
