import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  billowingSmoke,
  type Cloud,
  drawFire,
  drawFireThrow,
  drawFlashDisc,
  type FireBall,
  type FireThrow,
  layDustBand,
  layScorch,
  layShockRing,
  risingEmbers,
  risingPlumes,
  rollingDust,
  SMOKE,
  thrownBrands,
  thrownGrit,
  thrownRocks,
  thrownSparks,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { drawCaughtBlast } from '@axe/domain/effect/scene/fire/nova';
import {
  ball,
  floorMark,
  glow,
  keptFor,
  type Point,
  smokePuff,
  stageKey,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * The greatest blast: the ground under it glows and cracks as the heat gathers; it goes off in a white
 * flash with a streak of light across it; a column of fire rises, white-hot at its root and darkening
 * as it climbs, and at its top a cap rolls up and out as a ring, fire at first and then black smoke.
 * Three shock rings race out over the area and a skirt of dust crawls out along the ground; brands,
 * rocks and grit rain about it, sparks fly and embers rise. The column thins and breaks, the cap
 * spreads and thins, and the smoke hangs long over the scorched and cracked ground.
 */

/** How long it lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 2.5;
/** How long after it goes off the shock reaches the pieces caught round it, in seconds. */
const REACHES_ROUND_S = 0.18;
/** How long the column rises, in seconds from the moment it goes off. */
const COLUMN_S = 2.6;
/** When the cap begins to roll out, and how long it rolls before it has cleared, in seconds. */
const CAP_FROM_S = 0.45;
const CAP_S = 4;
/** How high the cap rolls, in cells over the floor. */
const CAP_HEIGHT = 3;

const thrownByStage = new Map<string, MushroomThrow>();

export const mushroom: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => (stage.index === 0 ? drawMushroom(stage) : drawCaughtBlast(stage, LINGER_S, REACHES_ROUND_S)),
};

/** One ball of the cap: where round the ring it sits, where round the roll it starts, and how large it is. */
interface CapBall {
  readonly around: number;
  readonly roll: number;
  readonly size: number;
  readonly variant: number;
}

interface MushroomThrow extends FireThrow {
  readonly column: readonly FireBall[];
  readonly cap: readonly CapBall[];
}

function drawMushroom(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const heart = { x: stage.x, y: stage.y, z: stage.groundZ + cell * 0.6 };
  const forward = cell * 0.6;
  const area = Math.max(stage.areaPx, cell * 3);
  const seed = (stage.seed % 89) + 1;
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () =>
    throwMushroom(throwerFor(stage, ends), heart, floor)
  );

  if (t < 0) {
    // The ground under it glows and cracks as the heat gathers, and a ring of light closes in.
    const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
    drawn.floor.push(floorMark('disc', floor, cell * 1.6, 1, ramp[4], 0.5 * gather, 'light', 0));
    drawn.floor.push(floorMark('cracks', floor, cell * 1.8 * gather, 0.16, ramp[5], gather, 'light', seed, seed));
    const ring = area * (1 - gather) + cell * 0.5 * gather;
    drawn.floor.push(floorMark('ring', floor, ring, (cell * 0.07) / ring, ramp[4], 0.3 + 0.6 * gather, 'light', 0));
    drawn.motes.push(glow(heart, cell * (0.4 + gather), ramp[5], 0.3 + 0.5 * gather, forward));
    return drawn;
  }
  const clearing = 1 - within(t, ends - 1, ends);

  drawn.floor.push(floorMark('cracks', floor, cell * 1.9, 0.4, SMOKE, 0.7 * clearing, 'color', seed, seed));
  const glowing = Math.max(0, 1 - t / 3.5);
  if (glowing > 0) drawn.floor.push(floorMark('cracks', floor, cell * 1.9, 0.2, ramp[4], glowing, 'light', seed, seed));
  layScorch(drawn, floor, cell * 1.3, ramp, t, 4, clearing, seed);
  layShockRing(drawn, floor, cell * 0.5, area + cell * 0.6, cell * 0.22, ramp[5], t, 0.6);
  layShockRing(drawn, floor, cell * 0.4, area * 0.8, cell * 0.14, ramp[4], t - 0.1, 0.55);
  layShockRing(drawn, floor, cell * 0.3, area * 0.55, cell * 0.1, ramp[2], t - 0.2, 0.5);
  layDustBand(drawn, floor, area * 1.15, cell * 0.35, ramp, t, 1.1);

  drawFireThrow(drawn, thrown, t, cell, ramp, forward);
  for (const fire of thrown.column) drawFire(drawn, fire, t, cell, ramp, forward);
  drawColumn(drawn, floor, t, cell, ramp, forward, stage.seed);
  drawCap(drawn, thrown.cap, floor, t, cell, ramp, forward);

  // The root of the column gives light while it rises.
  const rising = within(t, 0, COLUMN_S);
  if (rising < 1) {
    drawn.motes.push(glow(heart, cell * 1.6, ramp[4], 0.35 * (1 - rising), forward * 1.3));
  }
  drawFlashDisc(drawn, heart, cell * 1.6, ramp, t, 0.08);
  const streak = within(t, 0, 0.35);
  if (streak < 1) {
    drawn.motes.push({
      ...glow(heart, cell * 0.55 * (1 - streak * 0.7), '#ffffff', 1 - streak, forward * 1.6),
      shape: 'flare',
      trail: 8 + streak * 10,
    });
  }

  if (t < 0.12) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.8 * (1 - t / 0.12), reachPx: cell * 3.5 });
  }
  const warm = Math.pow(Math.max(0, 1 - t / 3.2), 1.3);
  if (warm > 0.02) {
    const high = { x: heart.x, y: heart.y, z: floor.z + cell * 1.6 };
    drawn.lights.push({
      ...high,
      color: mixColor(ramp[4], WARM, 0.5),
      strength: 1.2 * warm,
      reachPx: area * 0.8 + cell,
    });
  }
  return drawn;
}

/**
 * The cap at a moment: balls on a ring rolling up and out over the top of the column, the ring
 * widening as it rolls; fire while it is young, cooling to black smoke that thins away.
 */
/**
 * The column standing at a moment: four tongues of flame a step apart in colour, from a red edge to a
 * white heart, shooting up to the cap and flickering, narrowing and dying as the column breaks.
 */
function drawColumn(
  drawn: Staged,
  floor: Point,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number,
  seed: number
): void {
  const standing = Math.min(outCubic(within(t, 0, 0.6)), 1 - within(t, COLUMN_S * 0.6, COLUMN_S + 0.4));
  if (standing <= 0.02) return;
  const breaking = within(t, COLUMN_S * 0.6, COLUMN_S + 0.4);
  const flicker = 0.92 + 0.06 * Math.sin(t * 19 + seed) + 0.04 * Math.sin(t * 41 + seed * 1.3);
  const lean = 0.05 * Math.sin(t * 3 + seed);
  for (const [step, wide, tall] of [
    [1, 1, 1],
    [2, 0.86, 0.94],
    [4, 0.56, 0.78],
    [5, 0.28, 0.55],
  ] as const) {
    const height = cell * CAP_HEIGHT * tall * flicker * (0.4 + 0.6 * standing);
    const width = cell * 0.95 * wide * (1 - 0.6 * breaking);
    const reach = Math.max(height - width, 2);
    drawn.motes.push({
      x: floor.x + lean * height,
      y: floor.y,
      z: floor.z + height,
      size: width,
      color: ramp[step],
      alpha: Math.min(1, standing * 1.5),
      blend: 'color',
      shape: 'tongue',
      velocity: { x: lean * reach, y: 0, z: reach },
      trail: 1,
      variant: seed + t * 2.3,
      forward,
    });
  }
}

function drawCap(
  drawn: Staged,
  cap: readonly CapBall[],
  floor: Point,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  const rolled = within(t, CAP_FROM_S, CAP_FROM_S + CAP_S);
  if (rolled <= 0 || rolled >= 1) return;
  const spread = outCubic(within(rolled, 0, 0.7));
  const ring = cell * (0.4 + spread * 1.4);
  const tube = cell * (0.35 + rolled * 0.4);
  const height = floor.z + cell * (CAP_HEIGHT * Math.min(1, rolled * 3) + rolled * 0.5);
  const hot = rolled < 0.15;
  const fading = 1 - within(rolled, 0.55, 1);
  for (const piece of cap) {
    const roll = piece.roll + rolled * Math.PI * 2.4;
    const out = ring + Math.cos(roll) * tube;
    const at = {
      x: floor.x + Math.cos(piece.around) * out,
      y: floor.y + Math.sin(piece.around) * out,
      z: height + Math.sin(roll) * tube * 0.7,
    };
    const size = cell * piece.size * (0.7 + rolled * 0.8);
    if (hot) {
      const step = rolled < 0.05 ? 4 : rolled < 0.1 ? 3 : 2;
      drawn.motes.push(ball(at, size, ramp[step - 1], 1, forward, piece.variant));
      const body = { x: at.x, y: at.y, z: at.z + size * 0.09 };
      drawn.motes.push(ball(body, size * 0.75, ramp[step], 1, forward + size * 0.05, piece.variant + 1.3));
    } else {
      const cooling = within(rolled, 0.15, 0.3);
      const colour = mixColor(mixColor(ramp[1], SMOKE, 0.5), SMOKE, cooling);
      drawn.motes.push(smokePuff(at, size * 1.2, colour, 0.6 * fading, forward));
    }
  }
}

/** Throws every part of the blast, on its own clock from the moment it goes off. */
function throwMushroom(th: Thrower, heart: Point, floor: Point): MushroomThrow {
  const U = th.cell;
  // The column: balls of fire rising fast out of the ground, slowing as they near the cap, white-hot at
  // the root and darkening as they climb, most of them turning to smoke at the top.
  const column: FireBall[] = [];
  const rate = th.count(26);
  for (let born = 0; born < COLUMN_S; born += 1 / rate) {
    const bornAt = born + th.range(0, 0.5 / rate);
    const thinning = 1 - within(bornAt, COLUMN_S * 0.6, COLUMN_S);
    const out = Math.sqrt(th.range(0, 1)) * 0.38 * U * (0.7 + 0.3 * thinning);
    const angle = th.range(0, Math.PI * 2);
    const smokes = th.chance(0.7);
    column.push({
      mote: th.mote({
        x: floor.x + Math.cos(angle) * out,
        y: floor.y + Math.sin(angle) * out,
        z: floor.z + 0.2 * U,
        vx: Math.cos(angle) * th.range(0, 0.3) * U,
        vy: Math.sin(angle) * th.range(0, 0.3) * U,
        vz: th.range(4.2, 5) * U,
        bornAt,
        life: th.lifeOf(bornAt, 0.9, 1.3),
        gravity: 0,
        drag: 1.25,
        bounce: 0,
      }),
      size: th.range(0.45, 0.7) * (0.5 + 0.5 * thinning),
      burns: smokes ? th.range(0.55, 0.7) : 1,
      variant: th.range(0, 6),
      taper: 0.3,
    });
  }
  const cap: CapBall[] = Array.from({ length: th.count(20) }, () => ({
    around: th.range(0, Math.PI * 2),
    roll: th.range(0, Math.PI * 2),
    size: th.range(0.5, 0.8),
    variant: th.range(0, 6),
  }));
  const clouds: Cloud[] = [
    ...risingPlumes(th, { ...heart, z: floor.z + U * 2.6 }, th.count(6), [1, 3], [0.4, 0.8], 1.3, [1, 1.4]),
    ...billowingSmoke(th, { ...heart, z: floor.z + U * 3 }, th.count(10), {
      spread: 1.6,
      size: [1, 1.6],
      rise: [0.2, 0.5],
      bornAt: [1.4, 2.8],
      life: [2.6, 3.6],
    }),
    // The skirt: smoke and dust crawling out along the ground from the foot of the column.
    ...rollingDust(th, floor, th.count(20), [3, 7], [0.8, 1.2]),
  ];
  const sparks: ThrownMote[] = thrownSparks(th, heart, th.count(80), [7, 18]);
  const embers = risingEmbers(th, heart, th.count(50), [0, 1.2], 0.5);
  const brands = thrownBrands(th, heart, th.count(6), [3.5, 7.5]);
  const bits = [...thrownRocks(th, floor, th.count(10), [4.5, 8]), ...thrownGrit(th, floor, th.count(40), [3, 9])];
  return { fire: [], clouds, sparks, embers, brands, bits, column, cap };
}
