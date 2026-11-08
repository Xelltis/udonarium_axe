import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { PagePicture, pointOnFace, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The alias a white board is known by. */
export const WHITE_BOARD_KIND = 'white-board';

/** How near upright a board's face may point and still be a board lying on the table, drawn in the order of lying things. */
const LYING_NORMAL = 0.999;

/** A white board, as much of it as is drawn: its face, and the picture the page takes of what it wears. */
export interface WhiteBoardLayout {
  readonly id: string;
  /** The board's face, from its top left corner across and down it (`whiteBoardFrame`). */
  readonly frame: SurfaceFrame;
  readonly picture: PagePicture | null;
}

/**
 * The sprite a white board is drawn with: the picture of its face, its colour and what it wears,
 * over the whole face, seen from either side. A board lying flat is drawn in the order of things
 * lying on the table; one raised off it stands in front of and behind what it does.
 */
export function whiteBoardSprites(board: WhiteBoardLayout): TableWorldSprite[] {
  const picture = board.picture;
  if (!picture || !(picture.widthPx > 0) || !(picture.heightPx > 0)) return [];
  const centre = pointOnFace(board.frame, picture.widthPx / 2, picture.heightPx / 2);
  const lying = Math.abs(board.frame.normal.z) >= LYING_NORMAL;
  return [
    {
      id: `${board.id}#face`,
      owner: board.id,
      kind: WHITE_BOARD_KIND,
      centre,
      widthPx: picture.widthPx,
      heightPx: picture.heightPx,
      facing: { across: board.frame.u, down: board.frame.v },
      look: { kind: 'picture', url: picture.url },
      brightness: 1,
      twoSided: true,
      ...(lying ? { order: centre.z } : {}),
    },
  ];
}
