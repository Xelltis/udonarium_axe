import { type Choreography, nothingStaged } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { ringRibbon, swell } from '@axe/domain/effect/scene/holy/blessing-parts';
import { floorMark, glow, haze, hueOf } from '@axe/domain/effect/scene/parts';

/**
 * A healing light: a circle of light turning on the floor, rings of light rising up through the piece
 * and motes of light drifting up and twinkling.
 */
export const heal: Choreography = {
  lingerS: 0.6,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const shown = swell(t, duration);
    const forward = cell * 0.3;
    if (shown <= 0) return drawn;
    // The circle on the floor, turning, and its glow.
    drawn.floor.push(
      floorMark('sigil', floor, cell * 1.15, 0.07, hueOf(ramp), 0.9 * shown, 'light', stage.seed % 13, t * 0.6)
    );
    drawn.floor.push(floorMark('ring', floor, cell * 0.75, 0.05, hueOf(ramp), 0.8 * shown, 'light', 0, -t * 0.9));
    drawn.floor.push(floorMark('disc', floor, cell * 1.4, 1, ramp[3], 0.35 * shown, 'light', 0));
    // Rings of light rising up through the piece, one after another.
    for (let ring = 0; ring < 4; ring++) {
      const rise = (t * 0.7 + ring / 4) % 1;
      const height = floor.z + rise * cell * 2;
      const fade = Math.min(1, rise * 4, (1 - rise) * 3) * shown;
      drawn.ribbons.push(
        ringRibbon({ ...floor, z: height }, cell * (0.6 - rise * 0.2), cell * 0.08, hueOf(ramp), ramp[4], fade)
      );
    }
    // Motes of light drifting up round the piece and twinkling.
    for (let index = 0; index < 18; index++) {
      const rise = (t * 0.45 + index / 18) % 1;
      const turn = index * 2.4 + t * 1.5;
      const out = cell * (0.25 + ((index * 7) % 5) * 0.08);
      const at = {
        x: floor.x + Math.cos(turn) * out,
        y: floor.y + Math.sin(turn) * out,
        z: floor.z + rise * cell * 2.2,
      };
      const fade = Math.min(1, rise * 5, (1 - rise) * 3) * shown;
      drawn.motes.push(glow(at, cell * 0.14, ramp[5], fade, forward));
      if (index % 3 === 0)
        drawn.motes.push({
          ...glow(at, cell * 0.28, '#ffffff', fade * Math.abs(Math.sin(t * 8 + index)), forward),
          shape: 'star',
          spin: index,
        });
    }
    // A column of its colour over the piece, and a soft light in it.
    drawn.motes.push(haze({ ...floor, z: floor.z + cell * 0.6 }, cell * 1.8, hueOf(ramp), 0.4 * shown, forward));
    drawn.motes.push({
      ...haze({ ...floor, z: floor.z + cell }, cell * 1.1, hueOf(ramp), 0.3 * shown, forward),
      shape: 'plume',
      velocity: { x: 0, y: 0, z: cell },
      trail: 2,
    });
    // A soft column of light over it.
    drawn.motes.push({
      ...glow({ ...floor, z: floor.z + cell }, cell * 0.9, ramp[3], 0.35 * shown, forward),
      shape: 'plume',
      velocity: { x: 0, y: 0, z: cell },
      trail: 2,
    });
    drawn.lights.push({ ...floor, z: floor.z + cell, color: ramp[4], strength: 0.9 * shown, reachPx: cell * 2.5 });
    return drawn;
  },
};
