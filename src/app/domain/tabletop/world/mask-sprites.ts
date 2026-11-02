import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { pointOnFace, TableWorldSprite, turnedOnFace } from '@axe/domain/tabletop/world/table-sprites';

/** The alias a map mask is known by. */
export const MASK_KIND = 'game-table-mask';

/** How far the page lifts a mask off the face it lies on. */
const LIFT_PX = 0.1;

/** A map mask on the table, as much of it as is drawn. */
export interface MaskLayout {
  readonly id: string;
  readonly frame: SurfaceFrame;
  /** Where its corner lies on the face, and how far off the face, in table pixels. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How high it floats off its place, in table pixels. */
  readonly altitudePx: number;
  /** The picture of the mask as the page draws it, cut to its open cells, and how big the page lays it out. */
  readonly picture: { readonly url: string; readonly widthPx: number; readonly heightPx: number } | null;
}

/** The sprite a mask is drawn with: the picture of it, lying flat at its altitude over its place. */
export function maskSprites(mask: MaskLayout): TableWorldSprite[] {
  const picture = mask.picture;
  if (!picture || !(picture.widthPx > 0) || !(picture.heightPx > 0)) return [];
  const out = mask.z + LIFT_PX + mask.altitudePx;
  return [
    {
      id: `${mask.id}#cover`,
      owner: mask.id,
      kind: MASK_KIND,
      centre: pointOnFace(mask.frame, mask.x + picture.widthPx / 2, mask.y + picture.heightPx / 2, out),
      widthPx: picture.widthPx,
      heightPx: picture.heightPx,
      facing: turnedOnFace(mask.frame, 0),
      look: { kind: 'picture', url: picture.url },
      brightness: 1,
      twoSided: false,
      order: out,
    },
  ];
}
