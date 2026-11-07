/** Whether two flat records hold the same keys with the same values, each weighed as `Object.is` weighs it. */
export function sameFields(a: object, b: object): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
