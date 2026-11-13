import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { circlePoints, floorMark, glow, haze, hueOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * What blesses, guards or carries a piece: a circle of healing light turning on the floor, rings of
 * light rising up through the piece and motes of light drifting up and twinkling; an aura flaring up
 * round it in tongues of light; a shield standing round it as a dome of rings and ribs of light,
 * shimmering, a ripple running over it; and a warp, light gathering in a column, rings racing up it,
 * a flash, and sparks scattering.
 */

/** How far into its run something that comes and goes is, shown as how strong it is: up fast, held, and gone slowly. */
function swell(t: number, duration: number, rises = 0.25, falls = 0.5): number {
  return Math.min(outCubic(within(t, 0, rises)), 1 - within(t, duration - falls, duration));
}

/** A level ring of light as a band, at a height. */
function ringRibbon(
  middle: Point,
  radius: number,
  width: number,
  color: string,
  core: string | undefined,
  alpha: number
): EffectRibbon {
  return { points: circlePoints(middle, radius, 40), widths: width, color, core, alpha, blend: 'light' };
}

/** A healing light: see the header. */
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

/** A shield: see the header. */
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

/** A warp: see the header. */
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
