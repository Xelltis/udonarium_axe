import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';

/** The layer the looks laid over the ground are picked on, as their alias names them. */
export const AMBIENCE_PICK_LAYER = 'table-ambience';

/**
 * A look laid over the ground, as the rectangle of the board it covers lying on the floor, from its
 * top left corner across and down. A piece lying on the floor as far off is in front of it, so a
 * mask or a card laid in it is what a press there lands on.
 */
export function ambiencePickTarget(id: string, x: number, y: number, width: number, height: number): PickTarget {
  return {
    id,
    layer: AMBIENCE_PICK_LAYER,
    order: -1,
    surface: 'floor',
    shapes: [
      {
        kind: 'quad',
        corners: [
          { x, y, z: 0 },
          { x: x + width, y, z: 0 },
          { x: x + width, y: y + height, z: 0 },
          { x, y: y + height, z: 0 },
        ],
      },
    ],
  };
}
