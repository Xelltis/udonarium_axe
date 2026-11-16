import { rubbleHeavesOf } from '@axe/domain/effect/earth-looks';
import { type Choreography, nothingStaged, outCubic, type Stage, within } from '@axe/domain/effect/scene/choreography';
import { driftingDust, earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import {
  drawSlab,
  type EarthTones,
  earthTonesOf,
  layDent,
  layFissure,
  type Slab,
  throwSlabs,
} from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, lightBall, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * Rubble: the ground under the target heaves three times. Before the first, pebbles hop and cracks
 * run in under it. At each heave a vent bursts open, at the target and then to either side of it: slabs
 * of the floor are levered up about it, boulders as large as a piece are thrown up out of it with
 * stones and gravel, and earth stands up in a column; the fissures between the vents glow red at each
 * and cool between. The boulders fall, strike in dust, bounce, roll over and lie. From then to the end
 * of its long playback the rubble lies where it fell, the fissures cool to a dark scar, and thin dust
 * rises off the broken ground.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.rubble ?? 1.2;
/** Where each vent opens from the target, in cells. */
const VENTS = [
  { x: 0, y: 0 },
  { x: 0.75, y: -0.4 },
  { x: -0.7, y: 0.5 },
] as const;
/** How many of each one heave of rubble of the middle grade throws. */
export const HEAVE_THROWS = { boulders: 2, stones: 10, gravel: 30, slabs: 4, plumes: 8, skirt: 7, jets: 12 } as const;
/** How wide a boulder is, in cells. */
export const BOULDER_CELLS = [0.5, 0.8] as const;
/** How long a fissure takes to cool after the last heave, and how long before it clears everything left starts to fade, in seconds. */
const COOLS_S = 2.6;
const CLEARS_S = 0.6;
/** How long the flash of a heave lasts, in seconds. */
const HEAVE_FLASH_S = 0.25;

/** One vent: where it opens, in table pixels, and when, in seconds of the playback. */
interface Vent {
  readonly at: Point;
  readonly opensAt: number;
}

interface RubbleThrow {
  readonly vents: readonly Vent[];
  readonly rocks: readonly Rock[];
  readonly slabs: readonly Slab[];
  readonly dust: readonly Cloud[];
  readonly fissures: readonly {
    readonly from: Point;
    readonly to: Point;
    readonly seed: number;
    readonly opensAt: number;
  }[];
}

const rubbleByStage = new Map<string, RubbleThrow>();

/** When the heaves of a stage come: the first where its blow lands, the rest after it as a playback of its length has them. */
function heavesOf(stage: Stage): number[] {
  return rubbleHeavesOf(stage.duration, stage.blowsAt[0]);
}

function throwRubble(stage: Stage, floor: Point, tones: EarthTones, ends: number): RubbleThrow {
  const th = throwerFor(stage, ends);
  const { cell } = stage;
  const heaves = heavesOf(stage);
  const first = heaves[0];
  const vents: Vent[] = heaves.map((opensAt, index) => {
    const spot = VENTS[index % VENTS.length];
    return { at: { x: floor.x + spot.x * cell, y: floor.y + spot.y * cell, z: floor.z }, opensAt };
  });
  const rocks: Rock[] = throwRocks(th, floor, th.count(20), {
    size: [0.04, 0.09],
    up: [1.2, 3.2],
    out: [0, 0.5],
    from: 1.3,
    bornAt: [0, Math.max(0.02, first - 0.05)],
    bounce: 0.2,
  });
  const slabs: Slab[] = [];
  const dust: Cloud[] = [];
  for (const [index, vent] of vents.entries()) {
    const at = vent.opensAt;
    const outward = index === 0 ? undefined : Math.atan2(vent.at.y - floor.y, vent.at.x - floor.x);
    const fan = outward === undefined ? undefined : { toward: outward, spread: 1.5, share: 0.7 };
    rocks.push(
      ...throwRocks(th, vent.at, th.count(HEAVE_THROWS.boulders), {
        size: BOULDER_CELLS,
        up: [7, 9.5],
        out: [0.35, 1.15],
        bornAt: [at, at + 0.05],
        from: 0.15,
        fan,
        bounce: 0.36,
      }),
      ...throwRocks(th, vent.at, th.count(HEAVE_THROWS.stones), {
        size: [0.14, 0.3],
        up: [6, 11],
        out: [0.4, 2.6],
        bornAt: [at, at + 0.07],
        fan,
      }),
      ...throwRocks(th, vent.at, th.count(HEAVE_THROWS.gravel), {
        size: [0.04, 0.09],
        up: [5, 12],
        out: [0.3, 3.4],
        bornAt: [at, at + 0.08],
        fan,
        bounce: 0.25,
      })
    );
    slabs.push(...throwSlabs(th, vent.at, th.count(HEAVE_THROWS.slabs), [0.5, 0.95], at, 9));
    dust.push(
      ...earthPlumes(th, vent.at, th.count(HEAVE_THROWS.plumes), tones.dust, {
        rise: [8, 14],
        bornAt: [at, at + 0.12],
        long: 2.6,
      }),
      ...kickedDust(th, vent.at, th.count(HEAVE_THROWS.jets), tones.sand, {
        speed: [5, 11],
        size: [0.32, 0.55],
        bornAt: [at, at + 0.03],
        rise: [1, 6],
        from: 0.2,
        alpha: 0.75,
        life: [0.3, 0.6],
        jet: 1.6,
      }),
      ...kickedDust(th, vent.at, th.count(HEAVE_THROWS.skirt), tones.dust, {
        speed: [1.6, 4.4],
        size: [0.6, 0.95],
        bornAt: [at, at + 0.08],
        alpha: 0.5,
      })
    );
  }
  const last = heaves.at(-1) ?? first;
  dust.push(...driftingDust(th, floor, th.count(9), tones.dust, 1.4, [last + 1.2, Math.max(last + 1.3, ends - 2)]));
  const fissures = [
    ...vents.slice(1).map((vent, index) => ({
      from: floor,
      to: vent.at,
      seed: stage.seed + index * 17,
      opensAt: vent.opensAt - 0.12,
    })),
    ...Array.from({ length: 5 }, (_unused, index) => {
      const turn = ((index + th.range(0.15, 0.85)) / 5) * Math.PI * 2;
      const far = th.range(1.5, 2.2) * cell;
      return {
        from: { x: floor.x + Math.cos(turn) * far, y: floor.y + Math.sin(turn) * far, z: floor.z },
        to: floor,
        seed: stage.seed + 71 + index * 13,
        opensAt: 0,
      };
    }),
  ];
  return { vents, rocks, slabs, dust, fissures };
}

/** Rubble: see the header. */
export const rubble: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell } = stage;
    const t = stage.seconds;
    const ends = stage.duration + LINGER_S;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const tones = earthTonesOf(ramp);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const thrown = keptFor(rubbleByStage, stageKey(stage, ends), () => throwRubble(stage, floor, tones, ends));
    const first = thrown.vents[0].opensAt;
    const last = thrown.vents.at(-1)!.opensAt;
    const clearing = 1 - within(t, ends - CLEARS_S, ends);
    const lit = thrown.vents.reduce(
      (most, vent) => (t >= vent.opensAt ? Math.max(most, Math.exp(-(t - vent.opensAt) / 0.45)) : most),
      0
    );
    const cooling = t > last ? Math.pow(Math.max(0, 1 - (t - last) / COOLS_S), 1.6) * 0.6 : 0;
    const heat = t < first ? 0.3 * within(t, 0, first) : Math.max(lit, cooling);

    for (const fissure of thrown.fissures) {
      const run =
        fissure.opensAt > 0 ? outCubic(within(t, fissure.opensAt, fissure.opensAt + 0.12)) : within(t, 0, first);
      if (run <= 0) continue;
      const head = {
        x: fissure.from.x + (fissure.to.x - fissure.from.x) * run,
        y: fissure.from.y + (fissure.to.y - fissure.from.y) * run,
        z: fissure.from.z,
      };
      layFissure(drawn, fissure.from, head, cell * 0.16, tones, heat, clearing, fissure.seed);
    }
    for (const vent of thrown.vents) {
      const opened = t - vent.opensAt;
      if (opened < 0) continue;
      layDent(
        drawn,
        vent.at,
        cell * 0.6 * Math.min(1, opened / 0.06 + 0.3),
        tones,
        clearing,
        stage.seed + vent.opensAt * 10
      );
      const glowing = Math.max(Math.exp(-opened / 0.5), cooling);
      if (glowing > 0.03)
        drawn.floor.push(floorMark('disc', vent.at, cell * 0.85, 1, tones.glow, 0.7 * glowing, 'light', 0));
    }
    for (const slab of thrown.slabs) drawSlab(drawn, slab, t, cell, tones, clearing);
    for (const vent of thrown.vents) {
      const opened = t - vent.opensAt;
      if (opened < 0 || opened >= HEAVE_FLASH_S) continue;
      const left = 1 - opened / HEAVE_FLASH_S;
      const mouth = { ...vent.at, z: vent.at.z + cell * 0.2 };
      drawn.motes.push(glow(mouth, cell * 2.2, tones.glow, 0.8 * left, cell * 0.3));
      if (opened < 0.07) {
        drawn.motes.push(lightBall(mouth, cell * 0.5 * left, tones.hot, 1, cell * 0.4));
        drawn.motes.push({
          ...glow({ ...mouth, z: mouth.z + cell * 0.5 }, cell * 0.34, '#fff4dc', left, cell * 0.4),
          shape: 'flare',
          trail: 6,
          spin: Math.PI / 2,
        });
      }
      drawn.floor.push(
        floorMark(
          'ring',
          vent.at,
          cell * (0.4 + 2.2 * outCubic(1 - left)),
          0.12 * left + 0.03,
          tones.sand,
          left,
          'color',
          0
        )
      );
      drawn.lights.push({
        ...mouth,
        z: mouth.z + cell * 0.6,
        color: tones.glow,
        strength: 1.5 * left,
        reachPx: cell * 3,
      });
    }
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
    for (const rock of thrown.rocks) drawRock(drawn, rock, t, cell, tones);
    return drawn;
  },
};
