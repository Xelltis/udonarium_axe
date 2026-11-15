import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud, SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, floorMark, glow, hueOf, keptFor, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

function swell(t: number, duration: number, rises = 0.25, falls = 0.5): number {
  return Math.min(outCubic(within(t, 0, rises)), 1 - within(t, duration - falls, duration));
}

interface MiasmaThrow {
  readonly clouds: readonly Cloud[];
}
const miasmaByStage = new Map<string, MiasmaThrow>();

/**
 * A miasma: clouds of poison rolling low over the target and its round, bubbles rising out of them
 * and bursting.
 */
export const miasma: Choreography = {
  lingerS: 1,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const ends = duration + 1;
    const reach = Math.max(stage.areaPx, cell * 1.2);
    const shown = swell(t, duration, 0.4, 0.8);
    const forward = cell * 0.2;
    const thrown = keptFor(miasmaByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      const clouds: Cloud[] = [];
      for (let born = 0; born < duration; born += 1 / th.count(15)) {
        const way = th.outward();
        const out = Math.sqrt(th.range(0, 1)) * reach * 0.8;
        clouds.push({
          mote: th.mote({
            x: floor.x + way.cos * out,
            y: floor.y + way.sin * out,
            z: floor.z + th.range(0.1, 0.4) * cell,
            vx: way.cos * th.range(0.2, 0.6) * cell,
            vy: way.sin * th.range(0.2, 0.6) * cell,
            vz: th.range(0.05, 0.25) * cell,
            bornAt: born,
            life: th.lifeOf(born, 1.4, 2.2),
            gravity: -0.05 * cell,
            drag: 0.8,
            bounce: 0,
          }),
          size: th.range(0.9, 1.4),
          color: th.chance(0.5) ? hueOf(ramp) : mixColor(ramp[1], SMOKE, 0.25),
          alpha: 0.7,
        });
      }
      return { clouds };
    });
    for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
    if (shown > 0) {
      drawn.floor.push(floorMark('disc', floor, reach + cell * 0.6, 1, hueOf(ramp), 0.5 * shown, 'color', 0));
      // Bubbles rising out of it and bursting.
      for (let index = 0; index < 12; index++) {
        const rise = (t * 0.7 + index / 12) % 1;
        const turn = index * 2.4;
        const out = reach * 0.7 * (((index * 7) % 10) / 10);
        const at = {
          x: floor.x + Math.cos(turn) * out,
          y: floor.y + Math.sin(turn) * out,
          z: floor.z + rise * cell * 1.2,
        };
        const bursting = rise > 0.85;
        drawn.motes.push(
          bursting
            ? { ...glow(at, cell * 0.3, ramp[4], (1 - rise) * 6 * shown, forward), shape: 'star', spin: index }
            : { ...ball(at, cell * (0.08 + rise * 0.1), ramp[3], 0.85 * shown, forward, index), blend: 'color' }
        );
      }
    }
    return drawn;
  },
};
