import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';

/** The layer the faces things are put on (the floor, the walls and the white boards) are picked on. */
export const FACE_PICK_LAYER = 'face';

/**
 * A face things are put on, as a rectangle running across and down its frame from the origin corner.
 * `order` puts one face in front of another lying in the same place, as a board laid flat lies over
 * the floor.
 */
export function faceTarget(id: string, frame: SurfaceFrame, width: number, height: number, order = 0): PickTarget {
  const corner = (across: number, down: number) => ({
    x: frame.origin.x + frame.u.x * across + frame.v.x * down,
    y: frame.origin.y + frame.u.y * across + frame.v.y * down,
    z: frame.origin.z + frame.u.z * across + frame.v.z * down,
  });
  return {
    id,
    layer: FACE_PICK_LAYER,
    order,
    surface: id,
    shapes: [{ kind: 'quad', corners: [corner(0, 0), corner(width, 0), corner(width, height), corner(0, height)] }],
  };
}
