import { type Choreography, nothingStaged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, haze, hueOf, lerpPoint } from '@axe/domain/effect/scene/parts';
import { chestOf, originOf } from '@axe/domain/effect/scene/shot/stream-ends';
import { lightningRibbons } from '@axe/domain/effect/scene/storm/lightning';

/**
 * A current of lightning between the caster and the target, dancing as it crackles: it leaps a
 * shape at a time, a hot white line in a pale light with forks off it, on and off as a current
 * flickers, with sparks thrown off where it strikes.
 */
export const arc: Choreography = {
  lingerS: 0.4,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const from = originOf(stage);
    const to = chestOf(stage);
    const starts = duration * 0.1;
    const stops = duration * 0.78;
    const forward = cell * 0.4;
    if (t >= starts && t < stops) {
      const flicker = Math.floor(t / 0.045);
      // A current is never steady: now and then it drops out for a beat.
      const on = (Math.sin(flicker * 12.9898 + stage.seed) * 43758.5453) % 1;
      if (Math.abs(on) > 0.18) {
        drawn.ribbons.push(...lightningRibbons(from, to, stage.seed, flicker, cell, ramp, 1, stage.groundZ));
        drawn.motes.push(haze(to, cell * 1.6, hueOf(ramp), 0.45, forward * 1.4));
        drawn.motes.push(glow(to, cell * 1.1, ramp[4], 0.7, forward * 1.5));
        drawn.motes.push({ ...glow(to, cell * 0.6, '#ffffff', 0.9, forward * 1.6), shape: 'star', spin: flicker });
        drawn.motes.push(glow(from, cell * 0.6, ramp[4], 0.6, forward));
        drawn.lights.push({ ...lerpPoint(from, to, 0.5), color: ramp[4], strength: 1.3, reachPx: cell * 3 });
        drawn.floor.push(
          floorMark('disc', { x: stage.x, y: stage.y, z: stage.groundZ }, cell * 1.2, 1, ramp[4], 0.3, 'light', 0)
        );
        // Sparks thrown off where it strikes, a few for each shape it leaps.
        for (let spark = 0; spark < 4; spark++) {
          const turn = flicker * 1.7 + spark * 1.57;
          const reach = cell * (0.3 + ((flicker * 7 + spark * 3) % 5) * 0.12);
          const at = {
            x: to.x + Math.cos(turn) * reach,
            y: to.y + Math.sin(turn) * reach,
            z: to.z + Math.sin(turn * 1.3) * reach * 0.5,
          };
          drawn.motes.push({
            ...glow(at, cell * 0.05, '#ffffff', 1, forward),
            shape: 'spark',
            velocity: { x: Math.cos(turn) * cell * 8, y: Math.sin(turn) * cell * 8, z: cell * 2 },
            trail: 0.03,
          });
        }
      }
    }
    return drawn;
  },
};
