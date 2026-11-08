import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { lyingPicture, PagePicture, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The aliases a map mask and a range are known by. */
export const MASK_KIND = 'game-table-mask';
export const RANGE_KIND = 'range';

/** How far the page lifts a mask and a range off the face they lie on. */
const MASK_LIFT_PX = 0.1;
const RANGE_LIFT_PX = 0.25;

/** A piece the page draws flat over its place, on the table: a map mask, or a range. */
export interface FlatPieceLayout {
  readonly id: string;
  readonly frame: SurfaceFrame;
  /** Where its corner lies on the face, and how far off the face, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How high it floats off its place, in table pixels. */
  readonly altitudePx: number;
  /** The picture the page takes of it, or null while there is none. */
  readonly picture: PagePicture | null;
}

function flatSprites(piece: FlatPieceLayout, kind: string, lift: number): TableWorldSprite[] {
  const picture = piece.picture;
  if (!picture || !(picture.widthPx > 0) || !(picture.heightPx > 0)) return [];
  return [lyingPicture({ ...piece, kind }, piece.z + lift + piece.altitudePx, picture)];
}

/** The sprite a mask is drawn with: the picture of it, cut to its open cells, flat at its altitude over its place. */
export function maskSprites(mask: FlatPieceLayout): TableWorldSprite[] {
  return flatSprites(mask, MASK_KIND, MASK_LIFT_PX);
}

/** The sprite a range is drawn with: the picture of its cells, flat at its altitude round its place. */
export function rangeSprites(range: FlatPieceLayout): TableWorldSprite[] {
  return flatSprites(range, RANGE_KIND, RANGE_LIFT_PX);
}
