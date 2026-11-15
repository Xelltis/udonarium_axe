import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { ringRibbon, swell } from '@axe/domain/effect/scene/holy/blessing-parts';
import { floorMark, glow, haze, hueOf } from '@axe/domain/effect/scene/parts';

/**
 * A shield standing round a piece as a dome of rings and ribs of light, shimmering, a ripple running
 * over it.
 */
export const barrier: Choreography = {
  lingerS: 0.5,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const shown = swell(t, duration, 0.3, 0.4);
    if (shown <= 0) return drawn;
    const radius = cell * 0.95 * (0.85 + 0.15 * outCubic(within(t, 0, 0.3)));
    const shimmer = 0.75 + 0.25 * Math.sin(t * 6);
    // Rings of the dome, from its foot to its crown.
    for (let ring = 0; ring < 5; ring++) {
      const lat = (ring / 5) * (Math.PI / 2);
      const at = { ...floor, z: floor.z + Math.sin(lat) * radius * 1.1 };
      drawn.ribbons.push(
        ringRibbon(
          at,
          Math.cos(lat) * radius,
          cell * (ring === 0 ? 0.1 : 0.05),
          hueOf(ramp),
          ring === 0 ? ramp[4] : undefined,
          0.6 * shown * shimmer
        )
      );
    }
    // Its ribs, from the foot over the crown.
    for (let rib = 0; rib < 6; rib++) {
      const turn = (rib / 6) * Math.PI + t * 0.4;
      const points = Array.from({ length: 21 }, (_unused, index) => {
        const lat = (index / 20) * Math.PI;
        return {
          x: floor.x + Math.cos(turn) * Math.cos(lat) * radius,
          y: floor.y + Math.sin(turn) * Math.cos(lat) * radius,
          z: floor.z + Math.sin(lat) * radius * 1.1,
        };
      });
      drawn.ribbons.push({
        points,
        widths: cell * 0.045,
        color: hueOf(ramp),
        alpha: 0.55 * shown * shimmer,
        blend: 'light',
      });
    }
    // A ripple running up over it now and then.
    const ripple = (t * 0.8) % 1;
    const lat = ripple * (Math.PI / 2);
    drawn.ribbons.push(
      ringRibbon(
        { ...floor, z: floor.z + Math.sin(lat) * radius * 1.1 },
        Math.cos(lat) * radius,
        cell * 0.1,
        hueOf(ramp),
        ramp[5],
        (1 - ripple) * shown
      )
    );
    // The dome filled with a veil of its colour.
    drawn.motes.push(haze({ ...floor, z: floor.z + radius * 0.6 }, radius * 2.3, hueOf(ramp), 0.3 * shown, cell * 0.2));
    drawn.motes.push(glow({ ...floor, z: floor.z + radius * 0.6 }, radius * 2.4, ramp[2], 0.18 * shown, cell * 0.2));
    drawn.floor.push(
      floorMark('sigil', floor, radius * 1.05, 0.06, hueOf(ramp), 0.7 * shown, 'light', stage.seed % 13, -t * 0.4)
    );
    drawn.lights.push({
      ...floor,
      z: floor.z + radius * 0.6,
      color: ramp[4],
      strength: 0.7 * shown,
      reachPx: cell * 2.2,
    });
    return drawn;
  },
};
