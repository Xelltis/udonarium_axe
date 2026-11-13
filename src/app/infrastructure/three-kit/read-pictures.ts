import type { Material, Texture } from 'three';

/** Every picture a material wears: its colour, and its bumps, shine and glow where it has them. */
export function picturesOf(material: Material): Texture[] {
  const pictures = new Set<Texture>();
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && (value as Partial<Texture>).isTexture === true)
      pictures.add(value as Texture);
  }
  return [...pictures];
}

/**
 * Lets go of the pixels a model's pictures were read into from its file, which take as much memory
 * again as the graphics card's own copy and are never read once the card holds that. A picture the
 * model is drawn with keeps them until the card has been sent it, and every other picture drawn
 * from the same pixels has been sent as well; one it is not drawn with lets go of them at once,
 * unless a picture it is drawn with shares them. Only pixels that can be let go of, as a decoded
 * bitmap's, are: a canvas or an image element is left as it is.
 *
 * A picture is sent to the card once for each card it is drawn on, so the model must not be drawn
 * on another card after it has been sent: a table drawn afresh reads its models afresh.
 */
export function releaseReadPictures(drawn: Iterable<Texture>, undrawn: Iterable<Texture>): void {
  const waiting = new Map<unknown, Set<Texture>>();
  for (const picture of drawn) {
    const sharing = waiting.get(picture.source) ?? new Set<Texture>();
    sharing.add(picture);
    waiting.set(picture.source, sharing);
  }
  for (const picture of undrawn) {
    if (!waiting.has(picture.source)) letGo(picture.source.data);
  }
  for (const [source, sharing] of waiting) {
    for (const picture of sharing) {
      const before = picture.onUpdate;
      picture.onUpdate = (sent) => {
        before?.(sent);
        picture.onUpdate = before;
        sharing.delete(picture);
        if (sharing.size === 0) letGo((source as Texture['source']).data);
      };
    }
  }
}

/** Closes pixels that can be closed, as a decoded bitmap's. */
function letGo(pixels: unknown): void {
  const closable = pixels as { close?: unknown } | null | undefined;
  if (typeof closable?.close === 'function') (closable as { close(): void }).close();
}
