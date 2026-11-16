import { clamp01 } from '@axe/core/util/clamp';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { PagePicture, pointOnFace, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The alias a white board is known by. */
export const WHITE_BOARD_KIND = 'white-board';

/** How near upright a board's face may point and still be a board lying on the table, drawn in the order of lying things. */
const LYING_NORMAL = 0.999;

/**
 * A white board, as much of it as is drawn: its face, the picture the page takes of what it wears,
 * and the colour its face is, with how opaque, from clear at 0 to solid at 1.
 */
export interface WhiteBoardLayout {
  readonly id: string;
  /** The board's face, from its top left corner across and down it (`whiteBoardFrame`). */
  readonly frame: SurfaceFrame;
  readonly picture: PagePicture | null;
  readonly colour: string;
  readonly opacity: number;
}

/**
 * The sprites a white board is drawn with: the picture of its face, its colour and what it wears,
 * over the whole face, seen from in front; and its back, the same face looking the other way, which
 * is its colour alone, as opaque as the face is, with nothing of what is drawn or written on it. A
 * board whose face is clear has no back to draw, and one not pictured yet is not drawn at all, so it
 * never shows from behind before it does from in front. A board lying flat is drawn in the order of
 * things lying on the table; one raised off it stands in front of and behind what it does.
 */
export function whiteBoardSprites(board: WhiteBoardLayout): TableWorldSprite[] {
  const picture = board.picture;
  if (!picture || !(picture.widthPx > 0) || !(picture.heightPx > 0)) return [];
  const centre = pointOnFace(board.frame, picture.widthPx / 2, picture.heightPx / 2);
  const lying = Math.abs(board.frame.normal.z) >= LYING_NORMAL;
  const side = {
    owner: board.id,
    kind: WHITE_BOARD_KIND,
    centre,
    widthPx: picture.widthPx,
    heightPx: picture.heightPx,
    brightness: 1,
    twoSided: false,
    ...(lying ? { order: centre.z } : {}),
  };
  const face: TableWorldSprite = {
    ...side,
    id: `${board.id}#face`,
    facing: { across: board.frame.u, down: board.frame.v },
    look: { kind: 'picture', url: picture.url },
  };
  const opacity = clamp01(board.opacity);
  if (!(opacity > 0)) return [face];
  const u = board.frame.u;
  return [
    face,
    {
      ...side,
      id: `${board.id}#back`,
      facing: { across: { x: -u.x, y: -u.y, z: -u.z }, down: board.frame.v },
      look: { kind: 'colour', colour: board.colour },
      opacity,
    },
  ];
}
