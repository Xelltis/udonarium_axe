import { recordOf, storedRecordOf } from '@axe/core/util/stored-record';

describe('recordOf', () => {
  it('answers a record as it is and null for anything else', () => {
    const record = { a: 1 };
    expect(recordOf(record)).toBe(record);
    expect(recordOf([1])).toBeNull();
    expect(recordOf('a')).toBeNull();
    expect(recordOf(null)).toBeNull();
  });
});

describe('storedRecordOf', () => {
  it('reads the text of a JSON object', () => {
    expect(storedRecordOf(' {"a":1} ')).toEqual({ a: 1 });
  });

  it('answers null for nothing stored, for text that is no object, and for text that cannot be read', () => {
    expect(storedRecordOf('')).toBeNull();
    expect(storedRecordOf(undefined)).toBeNull();
    expect(storedRecordOf('[1]')).toBeNull();
    expect(storedRecordOf('12')).toBeNull();
    expect(storedRecordOf('{"a":')).toBeNull();
  });

  it('takes a record never made text as it is', () => {
    expect(storedRecordOf({ a: 1 })).toEqual({ a: 1 });
  });
});
