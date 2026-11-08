export interface CoinLeaf {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const round = (value: number) => Math.round(value * 100) / 100;

/** The outline of a struck star, alternating between the outer and the inner radius. */
export function starPoints(center: number, outerRadius: number, innerRadius: number, pointCount = 5): string {
  const step = 180 / pointCount;
  return Array.from({ length: pointCount * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = toRadians(-90 + step * index);
    return `${round(center + radius * Math.cos(angle))},${round(center + radius * Math.sin(angle))}`;
  }).join(' ');
}

/**
 * The leaves of a laurel wreath, as many on one branch as the other and smaller towards the top.
 * Each leaf follows the tangent of its branch.
 */
export function laurelLeaves(center: number, radius: number, leafCount = 6): CoinLeaf[] {
  const fromDegrees = 20;
  const toDegrees = 130;
  const leaves: CoinLeaf[] = [];

  for (const side of [-1, 1]) {
    for (let index = 0; index < leafCount; index++) {
      const progress = leafCount === 1 ? 0 : index / (leafCount - 1);
      const degrees = fromDegrees + (toDegrees - fromDegrees) * progress;
      const angle = toRadians(90 - side * degrees);
      const scale = 1 - 0.42 * progress;
      leaves.push({
        cx: round(center + radius * Math.cos(angle)),
        cy: round(center + radius * Math.sin(angle)),
        rx: round(7.2 * scale),
        ry: round(3.4 * scale),
        rotate: round(side * (degrees - 62)),
      });
    }
  }
  return leaves;
}

/** The middle of the 100-unit square a coin's emblem is struck in. */
export const COIN_EMBLEM_CENTRE = 50;
/** The star struck on a coin's front, and the rays behind it. */
export const coinStar = starPoints(COIN_EMBLEM_CENTRE, 25, 10.5);
export const coinStarRays = starPoints(COIN_EMBLEM_CENTRE, 33, 4, 12);
/** The laurel struck on a coin's back. */
export const coinLaurel = laurelLeaves(COIN_EMBLEM_CENTRE, 28);
