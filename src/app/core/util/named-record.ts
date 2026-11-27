/**
 * A record of things by names that come from outside, as a model names its materials and shapes,
 * which holds nothing but what is put in it: a name such as `constructor` reads nothing it was not
 * given, and one such as `__proto__` is kept as any other.
 */
export function namedRecord<T>(from?: Readonly<Record<string, T>>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  return from ? Object.assign(record, from) : record;
}
