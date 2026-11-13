import { diff, shuffle } from '@axe/core/util/array-util';

describe('diff()', () => {
  it('should return empty diffs for identical arrays', () => {
    const array1 = [1, 2, 3];
    const array2 = [1, 2, 3];

    const result = diff(array1, array2);

    expect(result.diff1).toEqual([]);
    expect(result.diff2).toEqual([]);
  });

  it('should find elements only in first array', () => {
    const array1 = [1, 2, 3, 4];
    const array2 = [1, 2];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(3);
    expect(result.diff1).toContain(4);
    expect(result.diff2).toEqual([]);
  });

  it('should find elements only in second array', () => {
    const array1 = [1, 2];
    const array2 = [1, 2, 3, 4];

    const result = diff(array1, array2);

    expect(result.diff1).toEqual([]);
    expect(result.diff2).toContain(3);
    expect(result.diff2).toContain(4);
  });

  it('should find differences in both arrays', () => {
    const array1 = [1, 2, 3];
    const array2 = [2, 3, 4];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(1);
    expect(result.diff2).toContain(4);
  });

  it('should handle empty arrays', () => {
    const array1: number[] = [];
    const array2: number[] = [];

    const result = diff(array1, array2);

    expect(result.diff1).toEqual([]);
    expect(result.diff2).toEqual([]);
  });

  it('should handle first array empty', () => {
    const array1: number[] = [];
    const array2 = [1, 2, 3];

    const result = diff(array1, array2);

    expect(result.diff1).toEqual([]);
    expect(result.diff2).toContain(1);
    expect(result.diff2).toContain(2);
    expect(result.diff2).toContain(3);
  });

  it('should handle second array empty', () => {
    const array1 = [1, 2, 3];
    const array2: number[] = [];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(1);
    expect(result.diff1).toContain(2);
    expect(result.diff1).toContain(3);
    expect(result.diff2).toEqual([]);
  });

  it('should work with string arrays', () => {
    const array1 = ['a', 'b', 'c'];
    const array2 = ['b', 'c', 'd'];

    const result = diff(array1, array2);

    expect(result.diff1).toContain('a');
    expect(result.diff2).toContain('d');
  });

  it('should work with object arrays using reference equality', () => {
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    const array1 = [obj1, obj2];
    const array2 = [obj2, obj3];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(obj1);
    expect(result.diff2).toContain(obj3);
    expect(result.diff1).not.toContain(obj2);
    expect(result.diff2).not.toContain(obj2);
  });

  it('should handle completely different arrays', () => {
    const array1 = [1, 2, 3];
    const array2 = [4, 5, 6];

    const result = diff(array1, array2);

    expect(result.diff1.length).toBe(3);
    expect(result.diff2.length).toBe(3);
    expect(result.diff1).toContain(1);
    expect(result.diff1).toContain(2);
    expect(result.diff1).toContain(3);
    expect(result.diff2).toContain(4);
    expect(result.diff2).toContain(5);
    expect(result.diff2).toContain(6);
  });

  it('should handle arrays with duplicate elements', () => {
    const array1 = [1, 1, 2, 2];
    const array2 = [2, 2, 3, 3];

    const result = diff(array1, array2);

    // Should contain duplicates as they appear
    expect(result.diff1.filter((x) => x === 1).length).toBeGreaterThanOrEqual(1);
    expect(result.diff2.filter((x) => x === 3).length).toBeGreaterThanOrEqual(1);
  });

  it('should handle single element arrays', () => {
    const array1 = [1];
    const array2 = [2];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(1);
    expect(result.diff2).toContain(2);
  });

  it('should handle arrays with same single element', () => {
    const array1 = [1];
    const array2 = [1];

    const result = diff(array1, array2);

    expect(result.diff1).toEqual([]);
    expect(result.diff2).toEqual([]);
  });

  it('should work with boolean arrays', () => {
    const array1 = [true, false];
    const array2 = [false, true];

    const result = diff(array1, array2);

    expect(result.diff1).toEqual([]);
    expect(result.diff2).toEqual([]);
  });

  it('should work with mixed type arrays', () => {
    const array1 = [1, 'a', true];
    const array2 = ['a', true, 2];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(1);
    expect(result.diff2).toContain(2);
  });

  it('should handle large arrays', () => {
    const array1 = Array.from({ length: 1000 }, (_, i) => i);
    const array2 = Array.from({ length: 1000 }, (_, i) => i + 500);

    const result = diff(array1, array2);

    // Should find first 500 elements unique to array1
    expect(result.diff1).toEqual(Array.from({ length: 500 }, (_, i) => i));
    // Should find last 500 elements unique to array2
    expect(result.diff2).toEqual(Array.from({ length: 500 }, (_, i) => i + 1000));
  });

  it('should handle null and undefined values', () => {
    const array1 = [null, undefined, 1];
    const array2 = [1, 2];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(null);
    expect(result.diff1).toContain(undefined);
    expect(result.diff2).toContain(2);
  });

  it('should not modify original arrays', () => {
    const array1 = [1, 2, 3];
    const array2 = [2, 3, 4];
    const array1Copy = [...array1];
    const array2Copy = [...array2];

    diff(array1, array2);

    expect(array1).toEqual(array1Copy);
    expect(array2).toEqual(array2Copy);
  });

  it('should return new array instances', () => {
    const array1 = [1, 2, 3];
    const array2 = [2, 3, 4];

    const result = diff(array1, array2);

    expect(result.diff1).not.toBe(array1);
    expect(result.diff2).not.toBe(array2);
  });

  it('should handle zero values correctly', () => {
    const array1 = [0, 1, 2];
    const array2 = [1, 2, 3];

    const result = diff(array1, array2);

    expect(result.diff1).toContain(0);
    expect(result.diff2).toContain(3);
  });
});

describe('shuffle()', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps every item, in place, and gives the array back', () => {
    const array = [1, 2, 3, 4, 5];

    const shuffled = shuffle(array);

    expect(shuffled).toBe(array);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('puts each item where the random draw says, from the last item down', () => {
    const draws = [0, 0, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => draws.shift() ?? 0);

    expect(shuffle(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  it('leaves an empty array and one item alone', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['only'])).toEqual(['only']);
  });
});
