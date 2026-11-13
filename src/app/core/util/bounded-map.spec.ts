import { BoundedMap, BoundedSet } from '@axe/core/util/bounded-map';

describe('BoundedMap', () => {
  it('keeps no more than its limit, letting the oldest go', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('a', 1).set('b', 2).set('c', 3);

    expect([...map]).toEqual([
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('keeps the place of a key set again, and makes it the newest once deleted first', () => {
    const map = new BoundedMap<string, number>(2);
    map.set('a', 1).set('b', 2);
    map.set('a', 3);
    map.set('c', 4);
    expect([...map.keys()]).toEqual(['b', 'c']);

    map.delete('b');
    map.set('b', 5);
    map.set('d', 6);
    expect([...map.keys()]).toEqual(['b', 'd']);
  });

  it('tells what it let go', () => {
    const gone: [string, number][] = [];
    const map = new BoundedMap<string, number>(1, (key, value) => gone.push([key, value]));
    map.set('a', 1).set('b', 2);

    expect(gone).toEqual([['a', 1]]);
    expect(map.get('b')).toBe(2);
  });
});

describe('BoundedSet', () => {
  it('keeps no more than its limit, letting the oldest go, and keeps the place of a member added again', () => {
    const set = new BoundedSet<string>(2);
    set.add('a').add('b').add('a').add('c');

    expect([...set]).toEqual(['b', 'c']);
  });
});
