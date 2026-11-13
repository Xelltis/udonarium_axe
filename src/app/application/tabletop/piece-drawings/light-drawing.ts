import type { DrawnPlace, PiecePictures } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { LightSource } from '@axe/domain/tabletop/light-source';
import { lightSourceSprites } from '@axe/domain/tabletop/world/light-source-sprites';
import type { PagePicture, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/**
 * A light source drawn at a place from its own picture where it has one and otherwise from the
 * picture the page takes of what marks it. The page shows a light's own picture as a background,
 * which a picture it takes of itself comes out without.
 */
export function drawLight(
  light: LightSource,
  place: DrawnPlace,
  gridSize: number,
  pictures: PiecePictures
): TableWorldSprite[] {
  return lightSourceSprites({
    id: light.identifier,
    ...place,
    altitudePx: light.altitude * gridSize,
    cellPx: gridSize,
    lit: light.lightEnabled,
    picture: ownPictureOf(light, gridSize, pictures) ?? pictures.pageOf(light.identifier),
  });
}

/** A light's own picture, held inside a cell keeping its shape as the page shows it, or null where it has none. */
function ownPictureOf(light: LightSource, cellPx: number, pictures: PiecePictures): PagePicture | null {
  const own = pictures.sized(pictures.urlOf(light.imageFile));
  if (!own || !(own.width > 0) || !(own.height > 0)) return null;
  const scale = cellPx / Math.max(own.width, own.height);
  return { url: own.url, widthPx: own.width * scale, heightPx: own.height * scale };
}
