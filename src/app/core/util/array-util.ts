/** The items only in the first array and the items only in the second, each kept in its original order. */
export function diff<T>(array1: T[], array2: T[]): { diff1: T[]; diff2: T[] } {
  const set1 = new Set(array1);
  const set2 = new Set(array2);
  const diff1 = array1.filter((item) => !set2.has(item));
  const diff2 = array2.filter((item) => !set1.has(item));
  return { diff1, diff2 };
}

/** Puts the items in a random order, in place, each order as likely as any other, and gives the array back. */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; 0 <= i; i--) {
    const rand = Math.floor(Math.random() * (i + 1));
    [array[i], array[rand]] = [array[rand], array[i]];
  }
  return array;
}
