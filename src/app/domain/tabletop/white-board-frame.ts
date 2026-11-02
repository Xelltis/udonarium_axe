import { SurfaceFrame, Vec3 } from '@axe/domain/tabletop/surface-space';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';

/**
 * The face of a white board in the board's space: its top-left corner, the way across and the way
 * down it, and the side what is put on it stands out from.
 *
 * A board lies flat at a pitch of nothing and is raised about its foot, the edge nearest the
 * bottom of it, up to standing at ninety; it turns about the middle of that foot. What stands on it
 * is laid out across and down the face from the top-left corner, as on the table itself.
 */
export function whiteBoardFrame(
  board: Pick<WhiteBoard, 'width' | 'height' | 'pitch' | 'rotate' | 'posZ'> & { location: { x: number; y: number } },
  gridSize: number
): SurfaceFrame {
  const width = board.width * gridSize;
  const height = board.height * gridSize;
  const pitch = (board.pitch * Math.PI) / 180;
  const turn = (board.rotate * Math.PI) / 180;
  const footX = board.location.x + width / 2;
  const footY = board.location.y + height;
  const footZ = board.posZ;
  const place = (x: number, y: number): Vec3 => {
    const across = x - width / 2;
    const down = y - height;
    const raisedY = down * Math.cos(pitch);
    const raisedZ = -down * Math.sin(pitch);
    return {
      x: footX + across * Math.cos(turn) - raisedY * Math.sin(turn),
      y: footY + across * Math.sin(turn) + raisedY * Math.cos(turn),
      z: footZ + raisedZ,
    };
  };
  const origin = place(0, 0);
  const acrossEnd = place(1, 0);
  const downEnd = place(0, 1);
  const u = { x: acrossEnd.x - origin.x, y: acrossEnd.y - origin.y, z: acrossEnd.z - origin.z };
  const v = { x: downEnd.x - origin.x, y: downEnd.y - origin.y, z: downEnd.z - origin.z };
  return {
    origin,
    u,
    v,
    normal: { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x },
  };
}
