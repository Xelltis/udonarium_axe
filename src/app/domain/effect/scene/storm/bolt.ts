import { type Choreography, nothingStaged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, layScorch, layShockRing, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/storm/lightning';

/*
 * Lightning made to strike: a bolt falling out of the sky onto the target in a white flash, striking
 * again and again as it flickers, scorching the floor and throwing sparks.
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
