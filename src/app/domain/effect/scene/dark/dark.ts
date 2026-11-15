import { clamp } from '@axe/core/util/clamp';
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
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * What darkens and sickens: a miasma, clouds of poison rolling low over the target and its round,
 * bubbles rising out of them and bursting; and a
 * singularity, a dark sphere swelling over the target in a haze that bends the light round it, a
 * bright ring wound flat round it, dust and sparks spiralling into it and grit dragged up off the
 * floor, until it falls in on itself to a point in a flash and lets everything go.
 */

function swell(t: number, duration: number, rises = 0.25, falls = 0.5): number {
  return Math.min(outCubic(within(t, 0, rises)), 1 - within(t, duration - falls, duration));
}

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
    // How large the sphere stands: swelling as it opens, then falling in on itself to a point.
    const implodes = clamp(collapses * 0.2, 0.12, 0.2);
    const falling = within(t, collapses - implodes, collapses);
    const radius = cell * (0.35 + 0.55 * outCubic(opening)) * (1 - falling * falling);
    if (t < collapses) {
      // The sphere: dark, soft at its edge, sunk in a haze of its colour that bends the light round it.
      drawn.motes.push(haze(heart, radius * 5, hueOf(ramp), 0.4 * opening, forward));
      drawn.motes.push(glow(heart, radius * 3.4, ramp[3], 0.35 * opening, forward));
      drawn.motes.push(haze(heart, radius * 2.6, '#07040b', 0.8, forward + 2));
      drawn.motes.push(ball(heart, radius * 1.9, mixColor('#050308', hueOf(ramp), 0.25), 1, forward + 3, 0));
      drawn.motes.push(ball(heart, radius * 1.72, '#020103', 1, forward + 4, 0));
      // The bright ring of what it is swallowing, wound flat round it and turning.
      for (const [width, colour, alpha] of [
        [0.12, hueOf(ramp), 0.6],
        [0.045, ramp[4], 0.8],
      ] as const) {
        drawn.ribbons.push({
          points: circlePoints(heart, radius * 1.3, 40, t * 3, t * 3 + Math.PI * 2),
          widths: cell * width * (1 - falling),
          color: colour,
          core: '#ffffff',
          alpha: alpha * opening,
          blend: 'light',
        });
      }
      // Dust and sparks wound in towards it, spiralling flat round it, faster as they close.
      for (let index = 0; index < 16; index++) {
        const closing = (t * 0.7 + index / 16) % 1;
        const turn = index * 2.4 + closing * closing * 9 + t;
        const out = radius * 1.4 + cell * 1.6 * (1 - closing);
        const at = {
          x: heart.x + Math.cos(turn) * out,
          y: heart.y + Math.sin(turn) * out,
          z: heart.z + Math.sin(index * 1.7) * cell * 0.25 * (1 - closing),
        };
        const along = { x: -Math.sin(turn), y: Math.cos(turn), z: 0 };
        const fast = cell * (2 + closing * 6);
        if (index % 2 === 0) {
          drawn.motes.push(smokePuff(at, cell * 0.22, '#6e6370', 0.45 * opening * (1 - closing), forward));
        }
        drawn.motes.push({
          ...glow(at, cell * 0.05, ramp[4], 0.55 * opening * Math.min(1, closing * 3), forward + 1),
          shape: 'spark',
          velocity: { x: along.x * fast, y: along.y * fast, z: 0 },
          trail: 0.05,
        });
      }
      // Rings closing on the ground under it, and grit dragged up off the floor.
      for (let ring = 0; ring < 3; ring++) {
        const closing = (t * 1.2 + ring / 3) % 1;
        drawn.floor.push(
          floorMark('ring', floor, cell * (2.2 * (1 - closing) + 0.3), 0.06, ramp[3], closing * opening, 'light', 0)
        );
      }
      drawn.floor.push(floorMark('disc', floor, cell * 1.4, 1, '#120a18', 0.45 * opening, 'color', 0));
      for (let index = 0; index < 12; index++) {
        const rise = (t * 0.9 + index / 12) % 1;
        const turn = index * 1.9 + rise * 5;
        const out = cell * 1.2 * (1 - rise);
        drawn.motes.push({
          ...glow(
            {
              x: floor.x + Math.cos(turn) * out,
              y: floor.y + Math.sin(turn) * out,
              z: floor.z + (heart.z - floor.z) * rise * rise,
            },
            cell * 0.08,
            '#5d5459',
            0.9 * opening * (1 - rise),
            forward
          ),
          blend: 'color',
          shape: 'chunk',
          spin: turn * 3,
          variant: index,
        });
      }
      drawn.lights.push({ ...heart, color: ramp[3], strength: 0.7 * opening, reachPx: cell * 2.4 });
    } else {
      // It falls in on itself to a point in a flash, and lets everything go.
      const after = t - collapses;
      if (after < 0.18) {
        drawn.motes.push(...starBurst(heart, cell * 3.2, hueOf(ramp), after / 0.18, forward * 2, 8, stage.seed));
        drawn.motes.push(glow(heart, cell * 1.4, '#ffffff', 1 - after / 0.18, forward * 2));
        drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.8 * (1 - after / 0.18), reachPx: cell * 3.2 });
      }
      drawn.motes.push(haze(heart, cell * 2.6 * (1 + after), hueOf(ramp), 0.5 * Math.max(0, 1 - after / 0.5), forward));
      layShockRing(drawn, floor, cell * 0.3, cell * 2.8, cell * 0.16, ramp[5], after, 0.4);
      for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
    }
    return drawn;
  },
};
