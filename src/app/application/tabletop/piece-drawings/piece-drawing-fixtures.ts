import type { DrawnPlace, PiecePictures } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { ImageFile } from '@axe/core/storage/image-file';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import type { SizedPicture } from '@axe/domain/tabletop/world/card-sprites';
import type { PagePicture } from '@axe/domain/tabletop/world/table-sprites';

/** A place on the floor of a table a thousand pixels across, at a corner, as the drawings are given one. */
export function floorPlace(x: number, y: number, z = 0, placedZ = z): DrawnPlace {
  const frame = surfaceFrame('floor', { widthPx: 1000, depthPx: 1000, wallHeightPx: 100 });
  return { frame, onFloor: true, x, y, z, placedZ };
}

/** A place on the north wall of the same table. */
export function wallPlace(x: number, y: number): DrawnPlace {
  const frame = surfaceFrame('north-wall', { widthPx: 1000, depthPx: 1000, wallHeightPx: 100 });
  return { frame, onFloor: false, x, y, z: 0, placedZ: 0 };
}

/** What the drawings can be handed of pictures in a spec: a page picture by piece, and a size by URL. */
export interface StubPictures extends PiecePictures {
  readonly pages: Map<string, PagePicture>;
  readonly sizes: Map<string, SizedPicture>;
}

/**
 * Pictures as a spec holds them: a file is read as its own URL, or as nothing where it has none; a
 * picture's size is known where the spec says so; and the skeleton stands in for an empty file.
 */
export function stubPictures(): StubPictures {
  const pages = new Map<string, PagePicture>();
  const sizes = new Map<string, SizedPicture>();
  const urlOf = (image: ImageFile | string | null): string => {
    if (typeof image === 'string') return image;
    return image && !image.isEmpty ? image.url : '';
  };
  return {
    pages,
    sizes,
    pageOf: (identifier) => pages.get(identifier) ?? null,
    sized: (url) => sizes.get(url) ?? null,
    urlOf,
    urlOrSkeletonOf: (image) => urlOf(image) || 'skeleton.png',
  };
}
