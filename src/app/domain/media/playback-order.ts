/**
 * The tracks in the order shuffle plays them: each once, mixed by the seed.
 *
 * Every track draws its place from the seed and its own identifier alone, so every peer that
 * holds the same tracks and seed comes to the same order without telling the others, and adding
 * or taking out a track leaves the rest where they were. A leading track, when it is among them,
 * starts the order and the ones that would have come before it follow on at the end.
 */
export function shuffledOrder(tracks: readonly string[], seed: number, leading: string = ''): string[] {
  const order = [...new Set(tracks)]
    .map((identifier) => ({ identifier, place: placeOf(seed, identifier) }))
    .sort((a, b) => a.place - b.place || compareText(a.identifier, b.identifier))
    .map((track) => track.identifier);
  const start = order.indexOf(leading);
  return start > 0 ? [...order.slice(start), ...order.slice(0, start)] : order;
}

/**
 * The track after the current one, and whether reaching it went round from the last to the first.
 *
 * A current track that is not in the order is followed by the first, without going round.
 */
export function trackAfter(order: readonly string[], current: string): { identifier: string | null; wrapped: boolean } {
  if (order.length === 0) return { identifier: null, wrapped: false };
  const index = order.indexOf(current);
  if (index < 0) return { identifier: order[0], wrapped: false };
  if (index + 1 < order.length) return { identifier: order[index + 1], wrapped: false };
  return { identifier: order[0], wrapped: true };
}

/** The track before the current one, going round from the first to the last; the last when the current is not in the order. */
export function trackBefore(order: readonly string[], current: string): string | null {
  if (order.length === 0) return null;
  const index = order.indexOf(current);
  return order[(index <= 0 ? order.length : index) - 1];
}

/** The seed for the next time round, which every peer works out the same from the last one. */
export function nextShuffleSeed(seed: number): number {
  return mix((seed >>> 0) + 0x9e3779b9);
}

/** A fresh seed for a shuffle somebody has just asked for. */
export function randomShuffleSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function placeOf(seed: number, identifier: string): number {
  let hash = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < identifier.length; i++) {
    hash = Math.imul(hash ^ identifier.charCodeAt(i), 0x01000193);
  }
  return mix(hash);
}

function mix(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
