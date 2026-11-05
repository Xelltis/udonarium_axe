import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/**
 * The order the sprites lying flat on a face are drawn in, one after another: from the lowest off its
 * face, and the earlier of two as low first. They write no depth, so this order alone says which is
 * drawn over which where they overlap. Answers, for each lying sprite by its index among the sprites,
 * its place in that order from 0.
 */
export function lyingDrawOrder(sprites: readonly TableWorldSprite[]): Map<number, number> {
  const lying = sprites
    .map((sprite, index) => ({ order: sprite.order, index }))
    .filter((entry): entry is { order: number; index: number } => entry.order !== undefined)
    .sort((a, b) => a.order - b.order || a.index - b.index);
  return new Map(lying.map(({ index }, place) => [index, place]));
}

/**
 * For each piece drawn with a sprite lying flat on a face, the place in {@link lyingDrawOrder} of the
 * last of them drawn: of two pieces, the one at the later place is drawn over the other where their
 * lying sprites overlap.
 */
export function lyingPlaceOfOwners(sprites: readonly TableWorldSprite[]): Map<string, number> {
  const places = new Map<string, number>();
  for (const [index, place] of lyingDrawOrder(sprites)) {
    const owner = sprites[index].owner;
    places.set(owner, Math.max(places.get(owner) ?? -1, place));
  }
  return places;
}
