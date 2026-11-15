import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import {
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  layShockRing,
  rollingDust,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * Cold made to strike: ice bursting up out of the floor round the target in shards, frost spreading
 * under it and mist rolling off, glinting, until the shards crack and fall.
 */

/** One shard of ice: which way it bursts out of the floor, how tall and wide, and when. */
interface Shard {
  readonly at: Point;
  readonly lean: Point;
  readonly tall: number;
  readonly wide: number;
  readonly bornAt: number;
}

interface FrostThrow {
  readonly shards: readonly Shard[];
  readonly mist: readonly Cloud[];
  readonly chips: readonly Bit[];
}
const frostByStage = new Map<string, FrostThrow>();

/** Ice: see the header. */
export const frost: Choreography = {
  lingerS: 0.8,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const bursts = stage.blowsAt[0] ?? duration * 0.1;
    const t = stage.seconds - bursts;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const ends = duration + 0.8 - bursts;
    const breaks = Math.max(0.6, duration * 0.7 - bursts);
    const forward = cell * 0.3;
    const thrown = keptFor(frostByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      const count = th.count(9);
      const shards = Array.from({ length: count }, (_unused, index) => {
        const turn = ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2;
        const out = th.range(0.15, 0.6) * cell;
        const tilt = th.range(0.15, 0.55);
        return {
          at: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
          lean: { x: Math.cos(turn) * tilt, y: Math.sin(turn) * tilt, z: 1 },
          tall: th.range(0.8, 1.6),
          wide: th.range(0.22, 0.36),
          bornAt: th.range(0, 0.12),
        };
      });
      const mist = rollingDust(th, floor, th.count(10), [0.8, 2], [0.6, 1]).map((cloud) => ({
        ...cloud,
        color: mixColor(ramp[4], '#ffffff', 0.4),
        alpha: 0.4,
      }));
      const chips: Bit[] = Array.from({ length: th.count(24) }, () => {
        const way = th.outward();
        const speed = th.range(1, 3) * cell;
        return {
          mote: th.mote({
            x: floor.x + way.cos * th.range(0, 0.5) * cell,
            y: floor.y + way.sin * th.range(0, 0.5) * cell,
            z: floor.z + th.range(0.2, 0.9) * cell,
            vx: way.cos * speed,
            vy: way.sin * speed,
            vz: th.range(1, 3) * cell,
            bornAt: breaks,
            life: th.lifeOf(breaks, 0.6, 1.1),
            gravity: th.fall,
            drag: 0.6,
            bounce: 0.3,
          }),
          size: th.range(0.05, 0.11),
          color: mixColor(ramp[4], '#ffffff', 0.3),
          turnRate: th.range(-14, 14),
          variant: th.range(0, 6),
        };
      });
      return { shards, mist, chips };
    });
    if (t < 0) {
      // The cold gathering: frost creeping over the floor before the ice bursts up.
      const creeping = within(stage.seconds, 0, bursts);
      drawn.floor.push(floorMark('disc', floor, cell * 1.2 * creeping, 1, ramp[4], 0.5 * creeping, 'light', 0));
      return drawn;
    }
    const clearing = 1 - within(t, ends - 0.5, ends);
    // Frost spread over the floor, a ring of rime and its glint.
    drawn.floor.push(
      floorMark(
        'scorch',
        floor,
        cell * 1.1 * outCubic(within(t, 0, 0.2)),
        1,
        mixColor(ramp[5], '#ffffff', 0.4),
        0.55 * clearing,
        'color',
        (stage.seed % 89) + 1
      )
    );
    drawn.floor.push(
      floorMark('sigil', floor, cell * 1.25, 0.08, hueOf(ramp), 0.7 * clearing, 'light', stage.seed % 13, t * 0.3)
    );
    layShockRing(drawn, floor, cell * 0.3, cell * 2.2, cell * 0.14, hueOf(ramp), t, 0.35);
    // A cold haze of its colour over the ice while it stands, and a star of light as it bursts up.
    drawn.motes.push(
      haze(
        { ...floor, z: floor.z + cell * 0.5 },
        cell * 2.4,
        hueOf(ramp),
        0.4 * clearing * (1 - within(t, breaks, breaks + 0.3)),
        forward
      )
    );
    drawn.motes.push(
      ...starBurst(
        { ...floor, z: floor.z + cell * 0.5 },
        cell * 1.8,
        hueOf(ramp),
        t / 0.25,
        forward * 1.5,
        6,
        stage.seed
      )
    );
    for (const cloud of thrown.mist) drawCloud(drawn, cloud, t, cell, forward);
    // The shards: bursting up fast, standing, then cracking and falling away.
    const breaking = within(t, breaks, breaks + 0.15);
    if (breaking < 1) {
      for (const [colour, wide, high] of [
        [ramp[1], 1.15, 1.04],
        [ramp[3], 1, 1],
        [ramp[5], 0.55, 0.85],
        ['#ffffff', 0.22, 0.6],
      ] as const) {
        for (const shard of thrown.shards) {
          const grown = outCubic(within(t, shard.bornAt, shard.bornAt + 0.12));
          if (grown <= 0) continue;
          const tall = cell * shard.tall * grown * high * (1 - breaking * 0.4);
          const width = cell * shard.wide * wide;
          const reach = Math.max(tall - width, 2);
          const length = Math.hypot(shard.lean.x, shard.lean.y, 1);
          const way = { x: shard.lean.x / length, y: shard.lean.y / length, z: 1 / length };
          drawn.motes.push({
            x: shard.at.x + way.x * tall,
            y: shard.at.y + way.y * tall,
            z: shard.at.z + way.z * tall,
            size: width,
            color: colour,
            alpha: 1 - breaking,
            blend: 'color',
            shape: 'tongue',
            velocity: { x: way.x * reach, y: way.y * reach, z: way.z * reach },
            trail: 1,
            variant: shard.tall * 10,
            forward,
          });
        }
      }
    }
    for (const chip of thrown.chips) drawBit(drawn, chip, t, cell, ramp, forward);
    // Glints twinkling over the ice.
    for (let index = 0; index < 6; index++) {
      const shard = thrown.shards[index % thrown.shards.length];
      const twinkle = Math.max(0, Math.sin(t * 9 + index * 2.1));
      drawn.motes.push({
        ...glow(
          { ...shard.at, z: shard.at.z + cell * shard.tall * 0.7 },
          cell * 0.3,
          '#ffffff',
          twinkle * (1 - breaking) * 0.9,
          forward * 1.5
        ),
        shape: 'star',
        spin: index,
      });
    }
    if (t < 0.3)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell,
        color: ramp[4],
        strength: 1.2 * (1 - t / 0.3),
        reachPx: cell * 2.5,
      });
    return drawn;
  },
};
