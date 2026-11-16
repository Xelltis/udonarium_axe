import { clamp } from '@axe/core/util/clamp';
import type { UpheavalTiming } from '@axe/domain/effect/earth-looks';
import type { Stage } from '@axe/domain/effect/scene/choreography';
import { type Fang, leaning } from '@axe/domain/effect/scene/earth/fangs';
import type { Point, Thrower } from '@axe/domain/effect/scene/parts';

/*
 * Where the fangs of an upheaval break the ground, and when: the run from before its caster to short
 * of its target, the great pillar under the target with the fangs about it, and the ring that spreads
 * out from it.
 */

/** A stretch of the fissure that runs under the fangs of the run: from where to where, and when it opens. */
export interface RunFissure {
  readonly from: Point;
  readonly to: Point;
  readonly opensAt: number;
  readonly seed: number;
}

/** How tall and how wide the great pillar is, in cells, and the fangs flanking it. */
export const PILLAR = { tall: 2.6, wide: 0.9 } as const;
const FLANK = { tall: [1.45, 1.85], wide: 0.56, aside: 0.62 } as const;
/** How tall the fangs of the run are, from the first to the last, in cells, and how far apart they break the ground at the most. */
export const RUN_FANGS = { from: 0.6, to: 1.6, apart: 0.85, fewest: 3, most: 9 } as const;
/** How far from the caster the run starts and how far short of the target it ends, in cells. */
const RUN_STARTS = 0.9;
const RUN_ENDS = 0.8;
/** How many fangs the ring has at the middle grade, how far from the target it starts, in cells, and how long it takes to spread, in seconds. */
export const RING = { fangs: 7, from: 1.1, reach: 1.9, afterS: 0.05, spreadsS: 0.25 } as const;
/** How near a piece a fang of the ring may break the ground, in table pixels a cell of its width. */
const CLEAR_OF_PIECES = 0.75;

/** A fang at a root, standing a way, that breaks the ground at a moment; when it breaks itself is set once all are laid. */
export function fangAt(th: Thrower, root: Point, way: Point, tall: number, wide: number, risesAt: number): Fang {
  return {
    root,
    way,
    tall,
    wide,
    risesAt,
    breaksAfter: 0,
    tone: Math.floor(th.range(0, 2.99)),
    variant: th.range(0, 6),
  };
}

/** The great pillar under a target and the fangs about it: behind it as its caster sees it, so it stands against them. */
export function pillarFangs(th: Thrower, floor: Point, toward: number, cell: number, at: number): Fang[] {
  const ahead = { x: Math.cos(toward), y: Math.sin(toward) };
  const aside = { x: -ahead.y, y: ahead.x };
  const spot = (along: number, across: number): Point => ({
    x: floor.x + (ahead.x * along + aside.x * across) * cell,
    y: floor.y + (ahead.y * along + aside.y * across) * cell,
    z: floor.z,
  });
  return [
    fangAt(th, spot(0.34, 0), leaning(toward, 0.06), PILLAR.tall, PILLAR.wide, at),
    fangAt(
      th,
      spot(0.2, FLANK.aside),
      leaning(toward + 1.3, 0.3),
      th.range(FLANK.tall[0], FLANK.tall[1]),
      FLANK.wide,
      at + 0.02
    ),
    fangAt(
      th,
      spot(0.2, -FLANK.aside),
      leaning(toward - 1.3, 0.3),
      th.range(FLANK.tall[0], FLANK.tall[1]),
      FLANK.wide,
      at + 0.03
    ),
    fangAt(th, spot(-0.42, 0.4), leaning(toward + 2.5, 0.5), th.range(0.5, 0.7), 0.3, at + 0.03),
    fangAt(th, spot(-0.42, -0.42), leaning(toward - 2.5, 0.5), th.range(0.5, 0.7), 0.3, at + 0.04),
  ];
}

/** The fangs that run from before the caster to short of the target, each taller than the last, and the fissure that runs under them. */
export function runFangs(
  th: Thrower,
  stage: Stage,
  floor: Point,
  toward: number,
  timing: UpheavalTiming,
  fissures: RunFissure[]
): { fangs: Fang[]; gathers: Point | null } {
  const { cell, origin } = stage;
  if (!origin || timing.burstsAt - timing.runsAt < 0.06) return { fangs: [], gathers: null };
  const ahead = { x: Math.cos(toward), y: Math.sin(toward) };
  const span = Math.hypot(floor.x - origin.x, floor.y - origin.y) - (RUN_STARTS + RUN_ENDS) * cell;
  if (span < cell * 0.4) return { fangs: [], gathers: null };
  const start = { x: origin.x + ahead.x * RUN_STARTS * cell, y: origin.y + ahead.y * RUN_STARTS * cell, z: floor.z };
  const count = clamp(Math.round(span / (cell * RUN_FANGS.apart)) + 1, RUN_FANGS.fewest, RUN_FANGS.most);
  const fangs: Fang[] = [];
  let before: Point = { x: start.x - ahead.x * cell * 0.5, y: start.y - ahead.y * cell * 0.5, z: floor.z };
  for (let index = 0; index < count; index++) {
    const share = count > 1 ? index / (count - 1) : 1;
    const side = (index % 2 === 0 ? 1 : -1) * th.range(0.08, 0.2) * cell;
    const root = {
      x: start.x + ahead.x * span * share - ahead.y * side,
      y: start.y + ahead.y * span * share + ahead.x * side,
      z: floor.z,
    };
    const risesAt = timing.runsAt + (timing.burstsAt - 0.04 - timing.runsAt) * share;
    const tall = RUN_FANGS.from + (RUN_FANGS.to - RUN_FANGS.from) * share;
    const way = leaning(toward + (index % 2 === 0 ? 0.5 : -0.5), 0.3 + th.range(0, 0.12));
    fangs.push(fangAt(th, root, way, tall, 0.3 + 0.26 * share, risesAt));
    fissures.push({ from: before, to: root, opensAt: risesAt - 0.04, seed: stage.seed + index * 19 });
    before = root;
  }
  fissures.push({ from: before, to: floor, opensAt: timing.burstsAt - 0.04, seed: stage.seed + 7 });
  return { fangs, gathers: { x: start.x - ahead.x * cell * 0.3, y: start.y - ahead.y * cell * 0.3, z: floor.z } };
}

/** The ring of fangs spreading out from the target, the nearer the sooner and the taller, clear of every piece that stands in it. */
export function ringFangs(
  th: Thrower,
  stage: Stage,
  floor: Point,
  timing: UpheavalTiming,
  count: number,
  reach: number
): Fang[] {
  const { cell } = stage;
  const from = RING.from * cell;
  const keepClear = [...stage.targets, ...(stage.origin ? [{ ...stage.origin, widthPx: cell }] : [])];
  const turned = th.range(0, Math.PI * 2);
  const fangs: Fang[] = [];
  for (let index = 0; index < count; index++) {
    const share = (index + 0.5) / count;
    const far = from + (Math.max(reach, from) - from) * Math.sqrt(share);
    const turn = turned + index * 2.399963;
    const root = { x: floor.x + Math.cos(turn) * far, y: floor.y + Math.sin(turn) * far, z: floor.z };
    const tall = th.range(1.25, 1.55) - 0.5 * share;
    const lean = th.range(0.22, 0.48);
    const near = keepClear.some(
      (piece) => Math.hypot(piece.x - root.x, piece.y - root.y) < Math.max(piece.widthPx, cell * 0.5) * CLEAR_OF_PIECES
    );
    if (near) continue;
    fangs.push(
      fangAt(
        th,
        root,
        leaning(turn + th.range(-0.4, 0.4), lean),
        tall,
        th.range(0.36, 0.5),
        timing.burstsAt + RING.afterS + RING.spreadsS * share
      )
    );
  }
  return fangs;
}

/** When the ring reaches a point a way from the target, in seconds after the pillar bursts. */
export function ringReaches(far: number, cell: number, reach: number): number {
  const from = RING.from * cell;
  const share = clamp((far - from) / Math.max(reach - from, 1), 0, 1);
  return RING.afterS + RING.spreadsS * share * share;
}
