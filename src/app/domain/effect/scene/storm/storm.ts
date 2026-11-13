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
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  drawSpark,
  layScorch,
  layShockRing,
  rollingDust,
  thrownSparks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/shot/streams';

/*
 * Weather made to strike: lightning falling out of the sky onto the target in a white flash, striking
 * again and again as it flickers, scorching the floor and throwing sparks; ice bursting up out of the
 * floor round the target in shards, frost spreading under it and mist rolling off, glinting, until
 * the shards crack and fall; and a whirlwind standing over the target, dust and leaves wheeling up it
 * in a widening spiral with streaks of wind wound round it.
 */

/** A bolt from the sky: see the header. */
export const bolt: Choreography = {
  lingerS: 0.8,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell } = stage;
    const strikes = stage.blowsAt[0] ?? stage.duration * 0.05;
    const t = stage.seconds - strikes;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const sky = { x: stage.x - cell * 0.8, y: stage.y - cell * 1.2, z: stage.groundZ + cell * 9 };
    const ends = stage.duration + 0.8 - strikes;
    const forward = cell * 0.5;
    const sparks = keptFor(boltSparks, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return thrownSparks(th, { ...floor, z: floor.z + cell * 0.3 }, th.count(36), [3, 9], [0, 0.3]);
    });
    if (t < 0) {
      // The leader feeling its way down before it strikes.
      const feeling = within(stage.seconds, 0, strikes);
      if (Math.floor(stage.seconds / 0.03) % 2 === 0) {
        drawn.ribbons.push(
          ...lightningRibbons(
            sky,
            { ...floor, z: floor.z + cell * 9 * (1 - feeling) },
            stage.seed,
            Math.floor(stage.seconds / 0.03),
            cell,
            ramp,
            0.4,
            stage.groundZ,
            0.4
          )
        );
      }
      return drawn;
    }
    // It strikes, and strikes again as it flickers, each fainter.
    for (const [after, strength] of [
      [0, 1],
      [0.12, 0.7],
      [0.24, 0.45],
    ] as const) {
      const since = t - after;
      if (since < 0 || since > 0.09) continue;
      const left = 1 - since / 0.09;
      drawn.ribbons.push(
        ...lightningRibbons(
          sky,
          { ...floor, z: floor.z + cell * 0.05 },
          stage.seed,
          Math.round(after * 100),
          cell,
          ramp,
          strength * left,
          stage.groundZ,
          1.6 * strength
        )
      );
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 1.5,
        color: '#ffffff',
        strength: 2 * strength * left,
        reachPx: cell * 4,
      });
      drawn.motes.push({
        ...glow({ ...floor, z: floor.z + cell * 0.3 }, cell * 0.9, '#ffffff', left * strength, forward),
        shape: 'flare',
        trail: 8,
      });
    }
    const struck = { ...floor, z: floor.z + cell * 0.4 };
    drawn.motes.push(haze(struck, cell * 2.4, hueOf(ramp), 0.55 * Math.max(0, 1 - t / 0.6), forward));
    drawn.motes.push(glow(struck, cell * 1.6, ramp[4], Math.max(0, 1 - t / 0.4), forward));
    drawn.motes.push(...starBurst(struck, cell * 2.2, hueOf(ramp), t / 0.3, forward * 1.5, 6, stage.seed));
    layScorch(drawn, floor, cell * 0.7, ramp, t, 1.2, 1 - within(t, ends - 0.4, ends), (stage.seed % 89) + 1);
    drawn.floor.push(
      floorMark(
        'cracks',
        floor,
        cell * 1.1 * Math.min(1, t / 0.05),
        0.12,
        ramp[4],
        Math.max(0, 1 - t / 0.5),
        'light',
        stage.seed % 89,
        stage.seed
      )
    );
    layShockRing(drawn, floor, cell * 0.3, cell * 2.6, cell * 0.16, hueOf(ramp), t, 0.35);
    for (const [index, spark] of sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
    // A wisp of smoke off the scorch.
    if (t > 0.15 && t < ends)
      drawn.motes.push(
        smokePuff(
          { ...floor, z: floor.z + cell * (0.3 + t * 0.5) },
          cell * (0.5 + t * 0.6),
          '#4b4650',
          0.35 * (1 - within(t, 0.15, ends)),
          forward
        )
      );
    return drawn;
  },
};
const boltSparks = new Map<string, ThrownMote[]>();

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

/** A piece caught round a whirlwind: dust swirling at its feet while the wind blows. */
function buffeted(stage: Stage, ramp: readonly string[]): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const blowing = Math.min(within(t, 0, 0.3), 1 - within(t, duration * 0.8, duration + 0.3));
  if (blowing <= 0) return drawn;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  for (let index = 0; index < 10; index++) {
    const turn = t * 6 + index * 0.63;
    const out = cell * (0.35 + (index % 3) * 0.12);
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.1 + (index % 4) * 0.12),
    };
    drawn.motes.push(smokePuff(at, cell * 0.3, mixColor('#a89a88', ramp[3], 0.3), 0.35 * blowing, cell * 0.2));
  }
  return drawn;
}

interface VortexThrow {
  readonly specks: readonly {
    readonly phase: number;
    readonly rise: number;
    readonly speed: number;
    readonly size: number;
    readonly kind: 'dust' | 'stone' | 'leaf';
    readonly out: number;
  }[];
  readonly dust: readonly Cloud[];
}
const vortexByStage = new Map<string, VortexThrow>();

/** How tall a whirlwind stands, in cells. */
const VORTEX_TALL_CELLS = 5;

/**
 * A whirlwind: a tall funnel of dust and wind, narrow where it grinds at the floor and wide where it
 * opens into the sky, its body thick and dark at the middle and turning fast, swaying as it stands;
 * thick streaks of wind wound round it; stones, dust and leaves wheeling up it and flung out off its
 * rim; and a skirt of dust churning round its foot over a scoured ring of ground.
 */
export const vortex: Choreography = {
  lingerS: 0.8,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    // Over an area one whirlwind stands at its centre, as wide as the area; a piece caught round it
    // is only buffeted, dust swirling at its feet.
    if (stage.index > 0) return buffeted(stage, ramp);
    const ends = duration + 0.8;
    const standing = Math.min(outCubic(within(t, 0, 0.35)), 1 - within(t, duration * 0.8, duration + 0.3));
    const forward = cell * 0.2;
    const thrown = keptFor(vortexByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return {
        specks: Array.from({ length: th.count(90) }, (_unused, index) => ({
          phase: th.range(0, 1),
          rise: th.range(0.5, 1.15),
          speed: th.range(0.7, 1.4),
          size: th.range(0.05, 0.12),
          kind: (index % 4 === 0 ? 'stone' : index % 7 === 0 ? 'leaf' : 'dust') as 'dust' | 'stone' | 'leaf',
          out: th.range(0.8, 1.35),
        })),
        dust: rollingDust(th, floor, th.count(14), [2, 4.5], [0.7, 1]),
      };
    });
    if (standing <= 0) return drawn;
    const tall = cell * VORTEX_TALL_CELLS * standing;
    const spin = t * 9;
    const sway = (height: number) => ({
      x: Math.sin(t * 1.7) * cell * 0.5 * (height / tall) ** 1.5,
      y: Math.cos(t * 1.3) * cell * 0.3 * (height / tall) ** 1.5,
    });
    const radiusAt = (height: number) => cell * (0.3 + 1.2 * (height / Math.max(tall, 1)) ** 1.4);
    const axis = (height: number): Point => {
      const bend = sway(height);
      return { x: floor.x + bend.x, y: floor.y + bend.y, z: floor.z + height };
    };
    const body = mixColor('#8a7e70', hueOf(ramp), 0.22);
    const heart = mixColor('#4f473f', hueOf(ramp), 0.15);
    // The body of the funnel: rings of dust round its axis, turning, thick and dark at its middle.
    const levels = 12;
    for (let level = 0; level < levels; level++) {
      const height = ((level + 0.5) / levels) * tall;
      const middle = axis(height);
      const radius = radiusAt(height);
      drawn.motes.push(haze(middle, radius * 1.6, heart, 0.5 * standing, forward));
      for (let puff = 0; puff < 6; puff++) {
        const turn = spin * (1.4 - height / (tall * 1.5)) + (puff / 6) * Math.PI * 2 + level * 0.7;
        drawn.motes.push(
          smokePuff(
            { x: middle.x + Math.cos(turn) * radius * 0.8, y: middle.y + Math.sin(turn) * radius * 0.8, z: middle.z },
            radius * 0.95,
            body,
            0.58 * standing,
            forward
          )
        );
      }
    }
    // Thick streaks of wind wound round it, each a spiral band climbing and turning.
    for (let streak = 0; streak < 8; streak++) {
      const points: Point[] = [];
      const widths: number[] = [];
      const offset = (streak / 8) * Math.PI * 2 + spin * 1.3;
      const steps = 30;
      for (let step = 0; step <= steps; step++) {
        const height = (step / steps) * tall;
        const turn = offset + step * 0.38;
        const radius = radiusAt(height) * 1.05;
        const middle = axis(height);
        points.push({ x: middle.x + Math.cos(turn) * radius, y: middle.y + Math.sin(turn) * radius, z: middle.z });
        widths.push(cell * 0.2 * Math.sin((Math.PI * step) / steps));
      }
      drawn.ribbons.push({
        points,
        widths,
        color: mixColor('#cfc6b8', hueOf(ramp), 0.3),
        core: mixColor('#f4efe6', hueOf(ramp), 0.15),
        alpha: 0.5 * standing,
        alphas: points.map((_point, index) => Math.sin((Math.PI * index) / steps) ** 0.7),
        blend: 'light',
      });
    }
    // Stones, dust and leaves wheeling up it, flung out wider as they climb.
    for (const speck of thrown.specks) {
      const climb = (t * 0.5 * speck.speed + speck.phase) % 1;
      const height = Math.min(climb * tall * speck.rise, tall);
      const turn = spin * speck.speed * 1.5 + speck.phase * 40;
      const middle = axis(height);
      const radius = radiusAt(height) * speck.out;
      const at = { x: middle.x + Math.cos(turn) * radius, y: middle.y + Math.sin(turn) * radius, z: middle.z };
      const fade = Math.min(1, climb * 5, (1 - climb) * 4) * standing;
      if (speck.kind === 'stone') {
        drawn.motes.push({
          ...glow(at, cell * speck.size * 1.4, mixColor('#6f665c', ramp[1], 0.15), fade, forward),
          blend: 'color',
          shape: 'chunk',
          spin: turn * 2,
          variant: speck.phase * 6,
        });
      } else if (speck.kind === 'leaf') {
        drawn.motes.push({
          ...glow(at, cell * speck.size * 1.6, mixColor('#7a8f3a', ramp[2], 0.3), fade, forward),
          blend: 'color',
          shape: 'chunk',
          spin: turn * 3,
          variant: speck.phase * 6,
        });
      } else {
        drawn.motes.push(smokePuff(at, cell * speck.size * 6, body, 0.45 * fade, forward));
      }
    }
    // The skirt of dust churning round its foot.
    for (let puff = 0; puff < 14; puff++) {
      const turn = spin * 1.2 + (puff / 14) * Math.PI * 2;
      const out = cell * (0.7 + (0.5 * ((puff * 7) % 5)) / 5);
      drawn.motes.push(
        smokePuff(
          { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.25 },
          cell * 0.75,
          body,
          0.5 * standing,
          forward
        )
      );
    }
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
    drawn.floor.push(
      floorMark('ring', floor, cell * 1.3, 0.3, mixColor('#5c5248', ramp[2], 0.2), 0.55 * standing, 'color', 0)
    );
    drawn.floor.push(floorMark('disc', floor, cell * 1.6, 1, '#3f3831', 0.25 * standing, 'color', 0));
    return drawn;
  },
};
