import type { ImageFile } from '@axe/core/storage/image-file';
import type { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import type { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import type { SizedPicture } from '@axe/domain/tabletop/world/card-sprites';
import type { PagePicture } from '@axe/domain/tabletop/world/table-sprites';

/** Where a piece is drawn: on which face, at which corner of it, and how far off it. */
export interface DrawnPlace {
  readonly frame: SurfaceFrame;
  readonly onFloor: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /**
   * How far off its face it is placed, where it stands or where this seat is moving it, before the
   * raised ground lifts it.
   */
  readonly placedZ: number;
}

/**
 * How each piece of a kind is drawn: what all of them are drawn with alike, whether one is drawn at
 * all, and its parts at a place.
 */
export interface PieceDrawing<P extends TabletopObject, T, L> {
  /**
   * What every piece of the kind is drawn with, read for each piece on its own, so that each is drawn
   * again when what it reads changes.
   */
  readonly look: () => L;
  readonly shown: (piece: P, look: L) => boolean;
  readonly draw: (piece: P, place: DrawnPlace, moving: boolean, look: L) => readonly T[];
}

/** What most kinds of piece are drawn with alike: how big a cell is. */
export interface GridLook {
  readonly gridSize: number;
}

/** The pictures the pieces are drawn from, as this seat holds them. */
export interface PiecePictures {
  /** The picture the page takes of a piece, or null for none. */
  pageOf(identifier: string): PagePicture | null;
  /** A picture at a URL with how big it is, or null while that is not known. */
  sized(url: string): SizedPicture | null;
  /** Where the picture of a file is read from, or nothing for one missing, unknown or empty. */
  urlOf(image: ImageFile | string | null): string;
  /** Where the picture of a file is read from, or the skeleton's for one missing, unknown or empty. */
  urlOrSkeletonOf(image: ImageFile | string | null): string;
}

/** The picture the page takes of a piece, sized as a sprite's picture is, or null for none. */
export function pagePictureSized(pictures: PiecePictures, identifier: string): SizedPicture | null {
  const picture = pictures.pageOf(identifier);
  return picture ? { url: picture.url, width: picture.widthPx, height: picture.heightPx } : null;
}
