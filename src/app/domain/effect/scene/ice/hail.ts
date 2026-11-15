import { HAIL_SHARDS, hailStrikesOf } from '@axe/domain/effect/ice-looks';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { bearingOf } from '@axe/domain/effect/scene/earth/earth-parts';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  coldMist,
  crystal,
  glint,
  type IceTones,
  iceTonesOf,
  layIceBeat,
  layRime,
} from '@axe/domain/effect/scene/ice/ice-parts';
import {
  drawGrain,
  drawShard,
  type Grain,
  icePowder,
  type Shard,
  throwGrains,
  throwShards,
} from '@axe/domain/effect/scene/ice/ice-shards';
import { glow, keptFor, lerpPoint, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * Hail. Three great shards of ice are driven down onto the target one after another, from over its
 * caster's shoulder, each trailing a streak of cold and breaking on it in a flash, a puff of powder
 * and a spray of chips; lesser stones rattle down about its feet between them and after, skipping
 * off the floor, and the stumps of the shards are left standing in it. The chips bounce, skid and lie; a little rime spreads under them at each blow, and
 * cold mist creeps off it before it draws back.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.frost ?? 1.2;
/** How steeply the hail comes down, in radians from level, and how far off it is first seen, in cells. */
const FALLS_AT = 0.95;
const FALLS_FROM_CELLS = 3.4;
/** How long a great shard and a lesser stone are in the air, in seconds. */
const GREAT_FLIES_S = 0.2;
const STONE_FLIES_S = 0.15;
/** How long the lesser stones go on falling after the first great shard strikes, in seconds, at the most. */
const RATTLES_S = 0.8;
/** How long the white beat lasts as a stone strikes, in seconds. */
const BEAT_S = 0.09;
/** The share of a stone broken off as it strikes: the rest of it is left standing in the floor. */
const STUCK_BROKEN = 0.4;
/** How long before it clears everything left starts to fade, in seconds. */
const CLEARS_S = 0.5;

/** One stone of hail: where it is first seen and where it strikes, when, and how large it is, in cells. */
interface Hailstone {
  readonly from: Point;
  readonly to: Point;
  readonly strikesAt: number;
  readonly fliesS: number;
  readonly long: number;
  readonly wide: number;
  readonly variant: number;
  readonly great: boolean;
}

interface HailThrow {
  readonly stones: readonly Hailstone[];
  readonly shards: readonly Shard[];
  readonly grains: readonly Grain[];
  readonly clouds: readonly Cloud[];
  /** The way the hail comes down, of length one. */
  readonly way: Point;
}

const hailByStage = new Map<string, HailThrow>();

function throwHail(stage: Stage, floor: Point, tones: IceTones, strikes: readonly number[], ends: number): HailThrow {
  const th = throwerFor(stage, ends);
  const { cell } = stage;
  const toward = bearingOf(stage.origin, floor, cell * 0.3) ?? 0.6;
  const way = {
    x: Math.cos(toward) * Math.cos(FALLS_AT),
    y: Math.sin(toward) * Math.cos(FALLS_AT),
    z: -Math.sin(FALLS_AT),
  };
  const across = { x: -Math.sin(toward), y: Math.cos(toward) };
  const fromOf = (to: Point): Point => ({
    x: to.x - way.x * cell * FALLS_FROM_CELLS,
    y: to.y - way.y * cell * FALLS_FROM_CELLS,
    z: to.z - way.z * cell * FALLS_FROM_CELLS,
  });
  const stones: Hailstone[] = [];
  const shards: Shard[] = [];
  const grains: Grain[] = [];
  const clouds: Cloud[] = [];
  const fan = { toward, spread: 1.5 };
  strikes.forEach((strikesAt, index) => {
    const aside = [0, -0.22, 0.2][index % HAIL_SHARDS] * cell;
    const to = {
      x: floor.x + across.x * aside,
      y: floor.y + across.y * aside,
      z: floor.z + stage.tall * [0.55, 0.3, 0.42][index % HAIL_SHARDS],
    };
    stones.push({
      from: fromOf(to),
      to,
      strikesAt,
      fliesS: GREAT_FLIES_S,
      long: th.range(1.5, 1.8),
      wide: th.range(0.46, 0.56),
      variant: th.range(0, 6),
      great: true,
    });
    const struck = { ...to, z: floor.z };
    const high: [number, number] = [(to.z - floor.z) / cell - 0.1, (to.z - floor.z) / cell + 0.1];
    shards.push(
      ...throwShards(th, struck, th.count(5), {
        long: [0.32, 0.62],
        up: [1, 4.5],
        out: [0.6, 2.6],
        bornAt: [strikesAt, strikesAt + 0.02],
        from: 0.08,
        high,
        fan,
      })
    );
    grains.push(
      ...throwGrains(th, struck, th.count(9), {
        size: [0.08, 0.16],
        up: [1, 5],
        out: [0.6, 3.2],
        bornAt: [strikesAt, strikesAt + 0.02],
        from: 0.08,
        high,
        fan: { toward, spread: 2.2 },
      })
    );
    clouds.push(...icePowder(th, to, th.count(7), tones.pale, [strikesAt, strikesAt + 0.03]));
  });
  const first = strikes[0] ?? 0;
  const rattles = Math.min(RATTLES_S, Math.max(0.1, ends - LINGER_S - first) * 0.6);
  const lesser = th.count(28);
  for (let stone = 0; stone < lesser; stone++) {
    const out = th.outward();
    const far = Math.sqrt(th.range(0.05, 1)) * cell * 1.05;
    const to = { x: floor.x + out.cos * far, y: floor.y + out.sin * far, z: floor.z };
    const strikesAt = first + 0.04 + (rattles * (stone + th.range(0, 0.9))) / lesser;
    stones.push({
      from: fromOf(to),
      to,
      strikesAt,
      fliesS: STONE_FLIES_S,
      long: th.range(0.5, 0.8),
      wide: th.range(0.16, 0.24),
      variant: th.range(0, 6),
      great: false,
    });
    if (stone % 2 === 0)
      shards.push(
        ...throwShards(th, to, 1, {
          long: [0.2, 0.38],
          up: [1.5, 4],
          out: [0.4, 1.8],
          bornAt: [strikesAt, strikesAt],
          from: 0.02,
          high: [0.03, 0.06],
          fan,
        })
      );
    grains.push(
      ...throwGrains(th, to, 2, {
        size: [0.06, 0.11],
        up: [1.5, 4.5],
        out: [0.4, 2],
        bornAt: [strikesAt, strikesAt],
        from: 0.02,
        high: [0.03, 0.06],
        fan: { toward, spread: 2.4 },
      })
    );
    if (stone % 3 === 0)
      clouds.push(...icePowder(th, { ...to, z: floor.z + cell * 0.08 }, 1, tones.pale, [strikesAt, strikesAt]));
  }
  clouds.push(
    ...coldMist(th, floor, th.count(9), tones.mist, {
      speed: [0.4, 1.5],
      size: [0.5, 0.8],
      bornAt: [first + 0.1, first + rattles + 0.5],
      from: 0.8,
      life: [1, 1.8],
      alpha: 0.36,
      fan,
    })
  );
  return { stones, shards, grains, clouds, way };
}

/** A stone of hail in the air: a shard flying point first, a streak of cold drawn out behind it. */
function drawStone(drawn: Staged, stone: Hailstone, t: number, cell: number, tones: IceTones, way: Point): void {
  const share = (t - (stone.strikesAt - stone.fliesS)) / stone.fliesS;
  if (share < 0 || share >= 1) return;
  const tip = lerpPoint(stone.from, stone.to, share);
  const long = cell * stone.long;
  const root = { x: tip.x - way.x * long, y: tip.y - way.y * long, z: tip.z - way.z * long };
  const tail = cell * (stone.great ? 2 : 1);
  const far = { x: root.x - way.x * tail, y: root.y - way.y * tail, z: root.z - way.z * tail };
  const wide = cell * stone.wide;
  drawn.ribbons.push({
    points: [far, lerpPoint(far, root, 0.6), root],
    widths: [0, wide * 0.8, wide * 1.1],
    color: tones.deep,
    core: tones.pale,
    alpha: 0.75,
    alphas: [0, 0.6, 1],
    blend: 'color',
    soft: 0.5,
  });
  drawn.motes.push(crystal(root, way, long, wide, tones, 1, { variant: stone.variant, over: cell * 0.3 }));
  if (stone.great) drawn.motes.push(glint(tip, cell * 0.4, 0.9, cell * 0.4, share * 5));
}

/** Hail driven onto the target: see the header. */
export function drawHail(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const strikes = stage.blowsAt.length >= HAIL_SHARDS ? stage.blowsAt : hailStrikesOf(duration, stage.blowsAt[0]);
  const tones = iceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const thrown = keptFor(hailByStage, stageKey(stage, ends), () => throwHail(stage, floor, tones, strikes, ends));
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const forward = cell * 0.3;
  const first = strikes[0] ?? 0;

  const struck = strikes.filter((at) => t >= at).length / Math.max(1, strikes.length);
  const settles = within(t, first, first + RATTLES_S);
  const recedes = 1 - within(t, Math.max(first + RATTLES_S + 0.4, duration * 0.75), ends);
  if (struck > 0)
    layRime(
      drawn,
      floor,
      cell * (0.8 + 0.5 * struck + 0.4 * settles),
      Math.min(0.5 + 0.4 * settles, 1) * Math.pow(recedes, 0.8),
      tones,
      1,
      stage.seed
    );
  for (const at of strikes) layShockRing(drawn, floor, cell * 0.3, cell * 2.2, cell * 0.24, tones.light, t - at, 0.3);
  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
  for (const shard of thrown.shards) drawShard(drawn, shard, t, cell, tones, clearing);
  for (const grain of thrown.grains) drawGrain(drawn, grain, t, cell, tones, clearing, forward);
  thrown.stones.forEach((stone, index) => {
    drawStone(drawn, stone, t, cell, tones, thrown.way);
    const since = t - stone.strikesAt;
    if (since < 0) return;
    if (stone.great || index % 3 === 0) {
      const back = stone.great ? cell * 0.4 : 0;
      const root = { x: stone.to.x - thrown.way.x * back, y: stone.to.y - thrown.way.y * back, z: floor.z };
      const stands = { x: -thrown.way.x, y: -thrown.way.y, z: -thrown.way.z };
      const left = cell * stone.long * (stone.great ? 0.5 : 0.6);
      drawn.motes.push(
        crystal(root, stands, left / (1 - STUCK_BROKEN), cell * stone.wide, tones, clearing, {
          variant: stone.variant,
          broken: STUCK_BROKEN,
        })
      );
    }
    if (since >= BEAT_S) return;
    const beat = 1 - since / BEAT_S;
    if (stone.great) {
      layIceBeat(drawn, floor, stone.to, cell * 1.5, cell * 0.9, tones, beat);
      drawn.lights.push({ ...stone.to, color: tones.light, strength: 1.4 * beat, reachPx: cell * 2.6 });
      return;
    }
    drawn.motes.push({
      ...glow(stone.to, cell * 0.3, '#ffffff', beat, cell * 0.5),
      shape: 'flare',
      trail: 5,
      spin: 0.5 + index,
    });
  });
  return drawn;
}
