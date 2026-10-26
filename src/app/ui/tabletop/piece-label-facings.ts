import { BillboardFacing } from '@axe/application/ui/billboard-frame.service';
import { makeLabelOrbitTransform } from '@axe/ui/tabletop/billboard-transform';

/** What the labels hung round a piece read of it. */
export interface PieceLabelFrame {
  /** Whether the table is seen flat from above, where a label is moved across the table rather than lifted. */
  mode2d(): boolean;
  /** How wide the piece's ground is, in pixels. */
  widthPx(): number;
}

/** How the labels hung round a piece are turned, worked out from the piece as it stands. */
export interface PieceLabelFacings {
  /**
   * A label moved away from the piece: lifted `distance3d` in the 3D view, and moved `distance2d`
   * up the screen in the flat view.
   */
  orbit(distance3d: number, distance2d: number): BillboardFacing;
  /**
   * Where a label hangs from, counted from the middle of the piece's ground.
   *
   * The part that moves the label out from the piece is bound to the element itself rather than
   * added in the template, so the whole of its transform is written by the frame.
   */
  stand(orbit: BillboardFacing): BillboardFacing;
}

/**
 * The facings of the labels hung round a piece, shared by every kind of piece that hangs them.
 *
 * Each reads the piece as it is asked for, so one asked for inside a computed follows the piece.
 */
export function pieceLabelFacings(frame: PieceLabelFrame): PieceLabelFacings {
  return {
    orbit: (distance3d, distance2d) => {
      const mode2d = frame.mode2d();
      return (rotation) => makeLabelOrbitTransform({ rotation, distance3d, distance2d, mode2d });
    },
    stand: (orbit) => {
      const stand = `translateX(-50%) translateX(${frame.widthPx() / 2}px) `;
      return (rotation) => stand + orbit(rotation);
    },
  };
}
