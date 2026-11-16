import {
  cloneSyncData,
  cloneSyncValue,
  diffSyncData,
  expandSyncPaths,
  flattenSyncData,
  hasChangedKey,
  isSameSyncValue,
  syncDataOf,
  syncValueOf,
} from '@axe/domain/replay/replay-diff';

describe('isSameSyncValue()', () => {
  it('compares a plain value by its value', () => {
    expect(isSameSyncValue(1, 1)).toBe(true);
    expect(isSameSyncValue('a', 'a')).toBe(true);
    expect(isSameSyncValue(1, '1')).toBe(false);
    expect(isSameSyncValue(null, undefined)).toBe(false);
  });

  it('compares nested objects all the way down', () => {
    expect(isSameSyncValue({ x: 1, y: { z: 2 } }, { x: 1, y: { z: 2 } })).toBe(true);
    expect(isSameSyncValue({ x: 1, y: { z: 2 } }, { x: 1, y: { z: 3 } })).toBe(false);
  });

  it('counts two objects of different sizes as different', () => {
    expect(isSameSyncValue({ x: 1 }, { x: 1, y: 2 })).toBe(false);
  });

  it('compares arrays in order', () => {
    expect(isSameSyncValue([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isSameSyncValue([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(isSameSyncValue([1, 2], [1, 2, 3])).toBe(false);
  });

  it('counts an array and an object as different', () => {
    expect(isSameSyncValue([], {})).toBe(false);
  });
});

describe('diffSyncData()', () => {
  it('returns nothing when nothing changed', () => {
    const data = { name: '盗賊', location: { name: 'table', x: 10, y: 20 } };
    expect(diffSyncData(data, structuredClone(data))).toBeNull();
  });

  it('returns only the keys that changed, before and after', () => {
    const before = { name: '盗賊', posZ: 0, rotate: 0 };
    const after = { name: '盗賊', posZ: 30, rotate: 0 };
    expect(diffSyncData(before, after)).toEqual({
      keys: ['posZ'],
      before: { posZ: 0 },
      after: { posZ: 30 },
    });
  });

  it('picks up a change to a nested position', () => {
    const before = { location: { name: 'table', x: 0, y: 0 } };
    const after = { location: { name: 'table', x: 100, y: 50 } };
    const diff = diffSyncData(before, after);
    expect(diff?.keys).toEqual(['location']);
    expect(diff?.before['location']).toEqual({ name: 'table', x: 0, y: 0 });
    expect(diff?.after['location']).toEqual({ name: 'table', x: 100, y: 50 });
  });

  it('returns every key as new when there was nothing before', () => {
    const diff = diffSyncData(null, { name: '盗賊', posZ: 0 });
    expect(diff?.keys).toEqual(['name', 'posZ']);
    expect(diff?.before).toEqual({});
    expect(diff?.after).toEqual({ name: '盗賊', posZ: 0 });
  });

  it('returns a key that went as a change too', () => {
    const diff = diffSyncData({ owner: 'alice', posZ: 0 }, { posZ: 0 });
    expect(diff?.keys).toEqual(['owner']);
    expect(diff?.before).toEqual({ owner: 'alice' });
    expect(diff?.after).toEqual({});
  });

  it('shares no reference with what it was given', () => {
    const before = { location: { name: 'table', x: 0, y: 0 } };
    const after = { location: { name: 'table', x: 5, y: 0 } };
    const diff = diffSyncData(before, after)!;
    (after.location as { x: number }).x = 999;
    expect(diff.after['location']).toEqual({ name: 'table', x: 5, y: 0 });
  });
});

describe('flattenSyncData() / expandSyncPaths()', () => {
  const nested = {
    value: '',
    parentIdentifier: 'p1',
    attributes: { location: { name: 'table', x: 10, y: 0 }, posZ: 30, name: 'HP' },
  };
  const flat = {
    value: '',
    parentIdentifier: 'p1',
    'attributes.location': { name: 'table', x: 10, y: 0 },
    'attributes.posZ': 30,
    'attributes.name': 'HP',
  };

  it('flattens the attributes into paths', () => {
    expect(flattenSyncData(nested)).toEqual(flat);
  });

  it('nests them again from that flat form', () => {
    expect(expandSyncPaths(flat)).toEqual(nested);
  });

  it('makes the round trip without any attributes', () => {
    const plain = { userId: 'alice', peerId: 'p1' };
    expect(expandSyncPaths(flattenSyncData(plain))).toEqual(plain);
  });

  it('leaves an attribute that is not a holder as it is', () => {
    expect(flattenSyncData({ attributes: 'not-a-record' })).toEqual({ attributes: 'not-a-record' });
  });

  it('keeps a name at the top from colliding with one among the attributes', () => {
    const collide = { value: '外', attributes: { value: '中' } };
    expect(flattenSyncData(collide)).toEqual({ value: '外', 'attributes.value': '中' });
    expect(expandSyncPaths(flattenSyncData(collide))).toEqual(collide);
  });
});

describe('syncValueOf() / hasChangedKey()', () => {
  const data = { value: '外', attributes: { posZ: 30, value: '中' } };

  it('looks among the attributes first', () => {
    expect(syncValueOf(data, 'posZ')).toBe(30);
    expect(syncValueOf(data, 'value')).toBe('中');
  });

  it('looks at the top when it is not there', () => {
    expect(syncValueOf({ value: '外' }, 'value')).toBe('外');
    expect(syncValueOf(data, 'unknown')).toBeUndefined();
  });

  it('finds a change by a name given as a path', () => {
    expect(hasChangedKey(new Set(['attributes.location']), 'location')).toBe(true);
    expect(hasChangedKey(new Set(['value']), 'value')).toBe(true);
    expect(hasChangedKey(new Set(['attributes.posZ']), 'location')).toBe(false);
  });
});

describe('cloneSyncValue()', () => {
  it('returns a plain value as it is', () => {
    expect(cloneSyncValue(1)).toBe(1);
    expect(cloneSyncValue('a')).toBe('a');
    expect(cloneSyncValue(true)).toBe(true);
    expect(cloneSyncValue(null)).toBeNull();
    expect(cloneSyncValue(undefined)).toBeUndefined();
  });

  it('copies nested arrays and objects', () => {
    const source = { rows: [{ x: 1 }, { x: 2 }] };
    const copy = cloneSyncValue(source);
    expect(copy).toEqual(source);
    source.rows[0].x = 99;
    expect(copy.rows[0].x).toBe(1);
  });
});

describe('cloneSyncData()', () => {
  it('returns a copy all the way down', () => {
    const source = { location: { x: 1, y: 2 }, tags: ['a'] };
    const copy = cloneSyncData(source);
    expect(copy).toEqual(source);
    source.location.x = 99;
    source.tags.push('b');
    expect(copy['location']).toEqual({ x: 1, y: 2 });
    expect(copy['tags']).toEqual(['a']);
  });
});

describe('syncDataOf()', () => {
  it('reads the synced data off the context an object gives', () => {
    const syncData = { name: 'orc', attributes: { location: { x: 1, y: 2 } } };
    const object = { toContext: () => ({ identifier: 'a', aliasName: 'character', syncData }) };

    expect(syncDataOf(object)).toBe(syncData);
  });
});
