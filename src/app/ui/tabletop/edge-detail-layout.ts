import { MULTI_ANGLE_SEATS, MultiAngleSeatKey } from '@axe/domain/tabletop/multi-angle';

/** A screen this much longer than it is wide seats two along each of its long edges. */
export const EDGE_DETAIL_SPLIT_ASPECT_RATIO = 1.5;

/**
 * How far a detail sits from the edge it belongs to.
 *
 * The edge ticker reaches about 43px in at its largest font (a 29px margin, half of a
 * 23.4px glyph, and half of its outline), so this keeps the two clear of each other
 * whatever the ticker is set to, and reads as a plain margin when the ticker is off.
 */
export const EDGE_DETAIL_INSET_PX = 48;

export type EdgeDetailEdge = 'bottom' | 'left' | 'top' | 'right';
export type EdgeDetailRotation = 0 | 90 | 180 | 270;

export interface EdgeDetailSeat {
  readonly edge: EdgeDetailEdge;
  readonly rotationDegrees: EdgeDetailRotation;
  /** Where along its edge the detail sits: the middle, or the middle of each half. */
  readonly alongEdgeRatio: number;
}

export interface EdgeDetailAnchor {
  readonly left: number;
  readonly top: number;
}

const EDGES: readonly EdgeDetailEdge[] = ['bottom', 'left', 'top', 'right'];

/** The edges carry the same headings the ticker and the four-way menus already use. */
const EDGE_SEAT_KEYS: Record<EdgeDetailEdge, MultiAngleSeatKey> = {
  bottom: 'down',
  left: 'left',
  top: 'up',
  right: 'right',
};

function edgeRotation(edge: EdgeDetailEdge): EdgeDetailRotation {
  const seat = MULTI_ANGLE_SEATS.find((candidate) => candidate.key === EDGE_SEAT_KEYS[edge]);
  return (seat?.degrees ?? 0) as EdgeDetailRotation;
}

function isHorizontalEdge(edge: EdgeDetailEdge): boolean {
  return edge === 'bottom' || edge === 'top';
}

/** Whether the edge runs away from the origin, so that its inset is measured from the far side. */
function isFarEdge(edge: EdgeDetailEdge): boolean {
  return edge === 'bottom' || edge === 'right';
}

/**
 * Decides where a hovered piece shows its detail: one per edge on a screen close to square,
 * and two along each long edge once the screen is half as long again as it is wide.
 */
export function makeEdgeDetailSeats(viewportWidth: number, viewportHeight: number): EdgeDetailSeat[] {
  const width = Math.max(0, viewportWidth);
  const height = Math.max(0, viewportHeight);
  const shortest = Math.min(width, height);
  const elongated = shortest > 0 && Math.max(width, height) / shortest >= EDGE_DETAIL_SPLIT_ASPECT_RATIO;
  const splitsHorizontalEdges = elongated && width >= height;
  const splitsVerticalEdges = elongated && height > width;

  const seats: EdgeDetailSeat[] = [];
  for (const edge of EDGES) {
    const splits = isHorizontalEdge(edge) ? splitsHorizontalEdges : splitsVerticalEdges;
    for (const alongEdgeRatio of splits ? [0.25, 0.75] : [0.5]) {
      seats.push({ edge, rotationDegrees: edgeRotation(edge), alongEdgeRatio });
    }
  }
  return seats;
}

export function sameEdgeDetailSeats(left: readonly EdgeDetailSeat[], right: readonly EdgeDetailSeat[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (seat, index) =>
        seat.edge === right[index].edge &&
        seat.rotationDegrees === right[index].rotationDegrees &&
        seat.alongEdgeRatio === right[index].alongEdgeRatio
    )
  );
}

function centerAlongAxis(extent: number, length: number, ratio: number): number {
  // A detail too long for its edge is centred instead, so it hangs over both ends evenly.
  if (extent > length) return length / 2;
  return Math.max(extent / 2, Math.min(ratio * length, length - extent / 2));
}

function centerAcrossAxis(extent: number, length: number, inset: number, farEdge: boolean): number {
  // Likewise, a detail too deep to keep its inset is centred rather than pinned to one side.
  if (extent > length - inset * 2) return length / 2;
  return farEdge ? length - inset - extent / 2 : inset + extent / 2;
}

/**
 * Where to place a panel that is rotated about its top left corner, so that the box it
 * ends up covering sits centred on its edge and clear of the screen edge by {@link EDGE_DETAIL_INSET_PX}.
 */
export function edgeDetailAnchor(
  seat: EdgeDetailSeat,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  inset: number = EDGE_DETAIL_INSET_PX
): EdgeDetailAnchor {
  const width = Math.max(0, panelWidth);
  const height = Math.max(0, panelHeight);
  const sideways = seat.rotationDegrees === 90 || seat.rotationDegrees === 270;
  const visualWidth = sideways ? height : width;
  const visualHeight = sideways ? width : height;
  const horizontal = isHorizontalEdge(seat.edge);

  const alongCenter = centerAlongAxis(
    horizontal ? visualWidth : visualHeight,
    horizontal ? viewportWidth : viewportHeight,
    seat.alongEdgeRatio
  );
  const acrossCenter = centerAcrossAxis(
    horizontal ? visualHeight : visualWidth,
    horizontal ? viewportHeight : viewportWidth,
    Math.max(0, inset),
    isFarEdge(seat.edge)
  );

  const visualLeft = (horizontal ? alongCenter : acrossCenter) - visualWidth / 2;
  const visualTop = (horizontal ? acrossCenter : alongCenter) - visualHeight / 2;

  // Rotating about the top left corner moves the box away from its anchor, so put that back.
  switch (seat.rotationDegrees) {
    case 90:
      return { left: visualLeft + visualWidth, top: visualTop };
    case 180:
      return { left: visualLeft + visualWidth, top: visualTop + visualHeight };
    case 270:
      return { left: visualLeft, top: visualTop + visualHeight };
    default:
      return { left: visualLeft, top: visualTop };
  }
}
