import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { ringRibbon } from '@axe/domain/effect/scene/holy/blessing-parts';
import { floorMark, glow, haze, hueOf } from '@axe/domain/effect/scene/parts';

/** A warp: light gathering in a column, rings racing up it, a flash, and sparks scattering. */
export const warp: Choreography = {
  lingerS: 0.6,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const flashes = duration * 0.55;
    const gathering = within(t, 0, flashes);
    const after = t - flashes;
    const forward = cell * 0.3;
    // A column of its colour while it gathers.
    if (after < 0.3) {
      const filling = gathering * (after < 0 ? 1 : 1 - after / 0.3);
      drawn.motes.push({
        ...haze({ ...floor, z: floor.z + cell * 0.2 }, cell * 1.2, hueOf(ramp), 0.5 * filling, forward),
        shape: 'plume',
        velocity: { x: 0, y: 0, z: cell },
        trail: 2.4,
      });
    }
    // Light gathering in a column, rings racing up it, sparks drawn in.
    if (after < 0.3) {
      const column = gathering * (after < 0 ? 1 : 1 - after / 0.3);
      drawn.motes.push({
        ...glow({ ...floor, z: floor.z + cell * 0.2 }, cell * (0.4 + 0.5 * column), ramp[4], 0.7 * column, forward),
        shape: 'plume',
        velocity: { x: 0, y: 0, z: cell },
        trail: 2.6,
      });
      for (let ring = 0; ring < 3; ring++) {
        const rise = (t * 1.6 + ring / 3) % 1;
        drawn.ribbons.push(
          ringRibbon(
            { ...floor, z: floor.z + rise * cell * 2.4 },
            cell * (0.7 - rise * 0.3) * (1.2 - gathering * 0.4),
            cell * 0.08,
            hueOf(ramp),
            ramp[4],
            Math.min(1, (1 - rise) * 2) * column
          )
        );
      }
      for (let index = 0; index < 14; index++) {
        const turn = index * 2.4 + t * 2;
        const out = cell * 1.6 * (1 - gathering) + cell * 0.2;
        const at = {
          x: floor.x + Math.cos(turn) * out,
          y: floor.y + Math.sin(turn) * out,
          z: floor.z + ((index * 13) % 7) * cell * 0.25,
        };
        drawn.motes.push({
          ...glow(at, cell * 0.05, ramp[5], gathering, forward),
          shape: 'spark',
          velocity: { x: -Math.cos(turn) * cell * 3, y: -Math.sin(turn) * cell * 3, z: 0 },
          trail: 0.08,
        });
      }
      drawn.floor.push(
        floorMark('sigil', floor, cell * 1.1, 0.07, hueOf(ramp), 0.8 * column, 'light', stage.seed % 13, t * 2)
      );
    }
    // A flash, and sparks scattering from it.
    if (after >= 0 && after < 0.6) {
      const left = 1 - after / 0.6;
      if (after < 0.12) {
        drawn.motes.push({
          ...glow({ ...floor, z: floor.z + cell * 0.7 }, cell * 1.2, '#ffffff', 1 - after / 0.12, forward * 2),
          shape: 'flare',
          trail: 6,
        });
        drawn.lights.push({
          ...floor,
          z: floor.z + cell,
          color: '#ffffff',
          strength: 1.6 * (1 - after / 0.12),
          reachPx: cell * 3,
        });
      }
      for (let index = 0; index < 20; index++) {
        const turn = index * 2.4;
        const up = Math.sin(index * 1.7) * 0.6 + 0.4;
        const out = cell * (0.3 + outCubic(after / 0.6) * 1.6);
        const at = {
          x: floor.x + Math.cos(turn) * out,
          y: floor.y + Math.sin(turn) * out,
          z: floor.z + cell * 0.7 + up * out * 0.6,
        };
        drawn.motes.push({ ...glow(at, cell * 0.16, ramp[5], left, forward), shape: 'star', spin: index + after * 8 });
      }
      drawn.floor.push(
        floorMark('ring', floor, cell * (0.4 + outCubic(after / 0.6) * 1.6), 0.08, hueOf(ramp), left, 'light', 0)
      );
    }
    return drawn;
  },
};
