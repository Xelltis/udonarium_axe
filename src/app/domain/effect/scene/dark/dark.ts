import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import {
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  layShockRing,
  SMOKE,
  thrownGrit,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  ball,
  circlePoints,
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  smokePuff,
  stageKey,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * What darkens and sickens: a curse, a dark circle turning on the floor under the piece and tendrils
 * of shadow rising round it, motes of its colour drawn in and swallowed; a miasma, clouds of poison
 * rolling low over the target and its round, bubbles rising out of them and bursting; and a
 * singularity, a dark sphere opening over the target, dust and grit dragged in spiralling, rings
 * closing on it, until it collapses in a flash and lets them go.
 */

function swell(t: number, duration: number, rises = 0.25, falls = 0.5): number {
  return Math.min(outCubic(within(t, 0, rises)), 1 - within(t, duration - falls, duration));
}

/** A curse: see the header. */
export const curse: Choreography = {
  lingerS: 0.6,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const shown = swell(t, duration);
    const forward = cell * 0.2;
    if (shown <= 0) return drawn;
    const shadow = mixColor(hueOf(ramp), '#120a18', 0.45);
    // The dark circle on the floor, turning, ringed in its colour.
    drawn.floor.push(floorMark('disc', floor, cell * 1.8, 1, hueOf(ramp), 0.55 * shown, 'color', 0));
    drawn.floor.push(floorMark('disc', floor, cell * 1.1, 1, shadow, 0.6 * shown, 'color', 0));
    drawn.floor.push(
      floorMark('sigil', floor, cell * 1.2, 0.09, ramp[3], 0.85 * shown, 'light', stage.seed % 13, -t * 0.5)
    );
    // A cloud of its colour crawling low round the piece, turning slowly.
    for (let index = 0; index < 9; index++) {
      const turn = (index / 9) * Math.PI * 2 + t * 0.6;
      const out = cell * (0.55 + 0.25 * Math.sin(index * 2.1 + t));
      const at = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.25 };
      drawn.motes.push(smokePuff(at, cell * 1.1, index % 2 === 0 ? hueOf(ramp) : shadow, 0.6 * shown, forward));
    }
    // Tendrils of shadow rising round the piece, swaying.
    for (let index = 0; index < 7; index++) {
      const rise = (t * 0.5 + index / 7) % 1;
      const turn = (index / 7) * Math.PI * 2 + Math.sin(t * 2 + index) * 0.4;
      const out = cell * 0.45;
      const at = {
        x: floor.x + Math.cos(turn) * out,
        y: floor.y + Math.sin(turn) * out,
        z: floor.z + rise * cell * 1.6,
      };
      const fade = Math.min(1, rise * 4, (1 - rise) * 2.5) * shown;
      drawn.motes.push({
        ...smokePuff(at, cell * 0.7, shadow, 0.8 * fade, forward),
        shape: 'plume',
        velocity: { x: -Math.cos(turn) * cell * 0.3, y: -Math.sin(turn) * cell * 0.3, z: cell },
        trail: 0.8,
      });
    }
    // Motes of its colour drawn in to the piece and swallowed.
    for (let index = 0; index < 14; index++) {
      const closing = (t * 0.8 + index / 14) % 1;
      const turn = index * 2.4 + t;
      const out = cell * 1.6 * (1 - closing);
      const at = {
        x: floor.x + Math.cos(turn) * out,
        y: floor.y + Math.sin(turn) * out,
        z: floor.z + cell * (0.3 + ((index * 5) % 7) * 0.12),
      };
      drawn.motes.push({
        ...glow(at, cell * 0.06, ramp[4], closing * shown, forward),
        shape: 'spark',
        velocity: { x: -Math.cos(turn) * cell * 2, y: -Math.sin(turn) * cell * 2, z: 0 },
        trail: 0.08,
      });
    }
    // A cloud of its colour wrapping the piece, darker within.
    drawn.motes.push(haze({ ...floor, z: floor.z + cell * 0.5 }, cell * 3.2, hueOf(ramp), 0.75 * shown, forward));
    drawn.motes.push(haze({ ...floor, z: floor.z + cell * 0.4 }, cell * 2, shadow, 0.6 * shown, forward + 1));
    drawn.motes.push(glow({ ...floor, z: floor.z + cell * 0.6 }, cell * 1.2, ramp[2], 0.3 * shown, forward));
    drawn.lights.push({ ...floor, z: floor.z + cell * 0.6, color: ramp[3], strength: 0.6 * shown, reachPx: cell * 2 });
    return drawn;
  },
};

interface MiasmaThrow {
  readonly clouds: readonly Cloud[];
}
const miasmaByStage = new Map<string, MiasmaThrow>();

/** A miasma: see the header. */
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

interface GravityThrow {
  readonly bits: readonly Bit[];
}
const gravityByStage = new Map<string, GravityThrow>();

/** A singularity: see the header. */
export const gravity: Choreography = {
  lingerS: 0.8,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 1 };
    const collapses = stage.blowsAt[0] ?? duration * 0.5;
    // Over an area the singularity opens at its centre alone; a piece caught round it is dragged,
    // dust drawn off it towards the centre, and struck as it collapses.
    const forward = cell * 0.4;
    if (stage.index > 0) {
      const dragged = within(t, 0, collapses);
      if (t < collapses) {
        for (let index = 0; index < 6; index++) {
          const rise = (t * 1.3 + index / 6) % 1;
          const at = { x: floor.x, y: floor.y, z: floor.z + cell * (0.1 + rise * 0.8) };
          drawn.motes.push(smokePuff(at, cell * 0.3, '#7a6f66', 0.4 * dragged * (1 - rise), forward));
        }
      } else {
        layShockRing(drawn, floor, cell * 0.2, cell * 1.2, cell * 0.1, ramp[5], t - collapses, 0.3);
      }
      return drawn;
    }
    const ends = duration + 0.8;
    const thrown = keptFor(gravityByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return {
        bits: thrownGrit(th, floor, th.count(30), [2, 5]).map((bit) => ({
          ...bit,
          mote: { ...bit.mote, bornAt: collapses },
        })),
      };
    });
    const opening = within(t, 0, collapses);
    if (t < collapses) {
      // The sphere opening, dark with a rim of its colour, and the rings and dust it drags in.
      const size = cell * (0.4 + 0.6 * outCubic(opening));
      drawn.motes.push(haze(heart, size * 3.2, hueOf(ramp), 0.5 * opening, forward));
      drawn.motes.push(glow(heart, size * 2.4, ramp[3], 0.5 * opening, forward));
      drawn.motes.push(ball(heart, size * 1.08, ramp[4], 1, forward + 2, 0));
      drawn.motes.push(ball(heart, size, '#0a0610', 1, forward + 3, 0));
      drawn.motes.push(
        ball({ ...heart, z: heart.z + size * 0.12 }, size * 0.55, mixColor('#0a0610', ramp[1], 0.3), 1, forward + 4, 1)
      );
      for (let ring = 0; ring < 3; ring++) {
        const closing = (t * 1.2 + ring / 3) % 1;
        drawn.floor.push(
          floorMark('ring', floor, cell * (2.2 * (1 - closing) + 0.3), 0.06, ramp[3], closing * opening, 'light', 0)
        );
      }
      for (let index = 0; index < 24; index++) {
        const closing = (t * 0.9 + index / 24) % 1;
        const turn = index * 2.4 + closing * 4;
        const out = cell * 2.2 * (1 - closing);
        const at = {
          x: heart.x + Math.cos(turn) * out,
          y: heart.y + Math.sin(turn) * out,
          z: floor.z + (heart.z - floor.z) * closing,
        };
        drawn.motes.push(smokePuff(at, cell * 0.25, '#7a6f66', 0.5 * opening * (1 - closing), forward));
        drawn.motes.push({
          ...glow(at, cell * 0.04, ramp[5], opening, forward),
          shape: 'spark',
          velocity: { x: -Math.cos(turn) * cell * 3, y: -Math.sin(turn) * cell * 3, z: cell },
          trail: 0.06,
        });
      }
      drawn.ribbons.push({
        points: circlePoints(heart, cell * (0.9 + 0.3 * Math.sin(t * 7)), 30),
        widths: cell * 0.04,
        color: ramp[4],
        alpha: 0.6 * opening,
        blend: 'light',
      });
      drawn.lights.push({ ...heart, color: ramp[3], strength: 0.6 * opening, reachPx: cell * 2 });
    } else {
      // It collapses in a flash and lets go.
      const after = t - collapses;
      if (after < 0.15) {
        drawn.motes.push({
          ...glow(heart, cell * 1.2, '#ffffff', 1 - after / 0.15, forward * 2),
          shape: 'flare',
          trail: 7,
        });
        drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.6 * (1 - after / 0.15), reachPx: cell * 3 });
      }
      drawn.motes.push(glow(heart, cell * 1.6, ramp[4], Math.max(0, 1 - after / 0.4), forward));
      layShockRing(drawn, floor, cell * 0.3, cell * 2.6, cell * 0.14, ramp[5], after, 0.4);
      for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
    }
    return drawn;
  },
};
