import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { ringRibbon, swell } from '@axe/domain/effect/scene/holy/blessing-parts';
import { floorMark, glow, hueOf } from '@axe/domain/effect/scene/parts';

/**
 * An aura of fighting spirit: a circle of power drawn on the floor under the piece, a double ring of
 * its colour about a white triangle, turning slowly; thin blades of light fanning up round the piece,
 * leaning out, white at their hearts and its colour at their edges, flickering; a white ring thrown
 * out as it rises and again as it fades, and the piece lit in its colour.
 */
export const aura: Choreography = {
  lingerS: 0.5,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const shown = swell(t, duration, 0.2, 0.4);
    const forward = cell * 0.15;
    if (shown <= 0) return drawn;
    const drawnIn = outCubic(within(t, 0, duration * 0.18));
    const lift = { ...floor, z: floor.z + 1.5 };
    // The circle of power: a double ring of its colour about a white triangle, turning slowly.
    drawn.ribbons.push(ringRibbon(lift, cell * 1.2 * drawnIn, cell * 0.09, hueOf(ramp), ramp[4], 0.95 * shown));
    drawn.ribbons.push(ringRibbon(lift, cell * 0.98 * drawnIn, cell * 0.035, ramp[4], '#ffffff', 0.9 * shown));
    const turn = t * 0.5 + stage.seed;
    const corners = [0, 1, 2, 0].map((index) => {
      const at = turn + (index / 3) * Math.PI * 2;
      return {
        x: lift.x + Math.cos(at) * cell * 0.95 * drawnIn,
        y: lift.y + Math.sin(at) * cell * 0.95 * drawnIn,
        z: lift.z,
      };
    });
    drawn.ribbons.push({
      points: corners,
      widths: cell * 0.04,
      color: '#ffffff',
      core: '#ffffff',
      alpha: 0.9 * shown,
      blend: 'light',
    });
    drawn.floor.push(floorMark('disc', floor, cell * 1.3, 1, hueOf(ramp), 0.3 * shown, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, cell * 1.1, 1, ramp[4], 0.35 * shown, 'light', 0));
    // White rings thrown out as it rises and as it fades.
    for (const starts of [0, duration - 0.5]) {
      const out = within(t, starts, starts + 0.5);
      if (out <= 0 || out >= 1) continue;
      drawn.ribbons.push(
        ringRibbon(lift, cell * (0.8 + 1.4 * outCubic(out)), cell * 0.05, '#ffffff', '#ffffff', 0.85 * (1 - out))
      );
    }
    // Thin blades of light fanning up round the piece, leaning out, flickering.
    const blades = 11;
    for (const [colour, wide, high, alpha] of [
      [hueOf(ramp), 1, 1, 0.85],
      ['#ffffff', 0.4, 0.85, 0.95],
    ] as const) {
      for (let index = 0; index < blades; index++) {
        const at = (index / blades) * Math.PI * 2 + stage.seed * 0.7;
        const springs = outCubic(within(t, (index % 4) * 0.05, (index % 4) * 0.05 + 0.2));
        const flicker = 0.72 + 0.2 * Math.sin(t * 12 + index * 2.3) + 0.08 * Math.sin(t * 29 + index);
        const tall = cell * 1.45 * flicker * high * springs * shown;
        if (tall < 2) continue;
        const width = cell * 0.13 * wide;
        const reach = Math.max(tall - width, 2);
        const lean = { x: Math.cos(at) * 0.42, y: Math.sin(at) * 0.42 };
        const out = cell * 0.55;
        drawn.motes.push({
          x: floor.x + Math.cos(at) * out + lean.x * tall,
          y: floor.y + Math.sin(at) * out + lean.y * tall,
          z: floor.z + tall,
          size: width,
          color: colour,
          alpha: alpha * shown,
          blend: 'light',
          shape: 'tongue',
          velocity: { x: lean.x * reach, y: lean.y * reach, z: reach },
          trail: 1,
          variant: index + t * 2,
          forward,
        });
      }
    }
    drawn.motes.push(glow({ ...floor, z: floor.z + cell * 0.6 }, cell * 1.4, ramp[3], 0.45 * shown, forward));
    for (let index = 0; index < 12; index++) {
      const rise = (t * 0.8 + index / 12) % 1;
      const at = (index / 12) * Math.PI * 2 + t * 0.4;
      drawn.motes.push({
        ...glow(
          {
            x: floor.x + Math.cos(at) * cell * (0.6 + rise * 0.4),
            y: floor.y + Math.sin(at) * cell * (0.6 + rise * 0.4),
            z: floor.z + cell * 0.2 + rise * cell * 2,
          },
          cell * 0.06,
          '#ffffff',
          (1 - rise) * shown,
          forward
        ),
        shape: 'spark',
        velocity: { x: 0, y: 0, z: cell * 3 },
        trail: 0.06,
      });
    }
    drawn.lights.push({ ...floor, z: floor.z + cell, color: ramp[4], strength: 1.1 * shown, reachPx: cell * 3 });
    return drawn;
  },
};
