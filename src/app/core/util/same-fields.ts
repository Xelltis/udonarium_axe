/** Whether two flat records hold the same keys with the same values, each weighed as `Object.is` weighs it. */
export function sameFields(a: object, b: object): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * The same list, or one holding entries of the same values in the same order.
 *
 * What is drawn from those values alone need not be drawn again for a list worked out again from data
 * that did not change them, so a signal weighing its lists by this keeps the one it had.
 */
export function sameEntries<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((entry, index) => sameFields(entry, b[index]));
}
