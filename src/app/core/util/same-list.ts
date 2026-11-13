/**
 * Whether two lists hold the same items in the same order, each pair weighed by `same`, which is
 * `Object.is` unless another is given.
 */
export function sameList<T>(
  a: readonly T[],
  b: readonly T[],
  same: (x: T, y: T) => boolean = Object.is as (x: T, y: T) => boolean
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => same(item, b[index]));
}
