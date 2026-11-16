import { type BreathCone, coneWidthAt } from '@axe/domain/effect/scene/breath/breath-cone';
import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, type Point } from '@axe/domain/effect/scene/parts';

/*
 * What a breath of sand lays on the floor: a band of sand along the floor down the cone wherever the
 * stream has passed, drifted into ripples of a deeper ochre, and about each piece it scoured a drift
 * of sand piled against its feet, with heaps of it blown about.
 */

/** The pale of sand laid on the floor. */
const SAND = '#d8c08e';
/** Where along the cone the band of sand is laid, as shares of the cone's length. */
const SAND_UNDER = [0.14, 0.27, 0.4, 0.53, 0.66, 0.79, 0.92, 1.02] as const;

/** The band of sand along the floor under the cone, laid as far as the stream has got and thickening as it blows. */
export function laySandBand(
  drawn: Staged,
  ramp: readonly string[],
  cone: BreathCone,
  axisAt: (along: number) => Point,
  front: number,
  U: number,
  laid: number,
  alpha: number
): void {
  if (laid <= 0 || alpha <= 0) return;
  SAND_UNDER.forEach((share, index) => {
    const along = Math.min(cone.ends, cone.ends * share);
    if (along > front) return;
    const at = axisAt(along);
    const under = { x: at.x, y: at.y, z: cone.floorZ };
    const reach = Math.max(U * 0.55, coneWidthAt(cone, along) * 0.48) * (0.45 + 0.55 * laid);
    drawn.floor.push(
      floorMark('scorch', under, reach, 1, mixColor(ramp[2], SAND, 0.4), 0.66 * laid * alpha, 'color', index * 3 + 1)
    );
    drawn.floor.push(floorMark('scorch', under, reach * 0.6, 1, ramp[1], 0.42 * laid * alpha, 'color', index * 5 + 2));
  });
}

/** One heap of sand blown about a piece: where, how large in cells, and when it is laid. */
interface Heap extends Point {
  readonly size: number;
  readonly at: number;
}

/** The drift of sand a breath of sand piles against a piece's feet, growing as it blows, and the heaps it leaves about it. */
export function drawSandDrift(
  drawn: Staged,
  floor: Point,
  heaps: readonly Heap[],
  t: number,
  blows: readonly [from: number, to: number],
  cell: number,
  ramp: readonly string[],
  alpha: number,
  mark: number
): void {
  const piled = within(t, blows[0], blows[1]);
  const shown = within(t, blows[0], blows[0] + 0.3) * alpha;
  drawn.floor.push(
    floorMark('scorch', floor, cell * (0.7 + 0.6 * piled), 1, mixColor(ramp[2], SAND, 0.4), 0.72 * shown, 'color', mark)
  );
  drawn.floor.push(floorMark('scorch', floor, cell * (0.4 + 0.35 * piled), 1, ramp[1], 0.5 * shown, 'color', mark + 7));
  for (const [index, heap] of heaps.entries()) {
    if (t < heap.at) continue;
    const spreads = within(t, heap.at, heap.at + 0.3);
    drawn.floor.push(
      floorMark(
        'scorch',
        heap,
        cell * heap.size * (0.5 + 0.5 * spreads),
        1,
        ramp[index % 2 === 0 ? 1 : 2],
        0.6 * alpha,
        'color',
        index + mark
      )
    );
  }
}
