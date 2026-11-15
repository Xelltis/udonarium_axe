import { type Choreography, nothingStaged, outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { drawSpark, layShockRing, laySoot, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  acrossOf,
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  lerpPoint,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
  wayBetween,
} from '@axe/domain/effect/scene/parts';
import { chestOf, originOf } from '@axe/domain/effect/scene/shot/stream-ends';

/*
 * A beam poured from the caster onto the target: gathered at the caster and loosed, its light
 * pulsing along it with motes streaming down it, splashing light and sparks where it strikes; and a
 * great beam, thicker, gathered longer and shaking the light out of the scene.
 */

const LINGER_S = 0.6;

/** Light gathering at a point: a glow growing and streaks drawn in to it. */
function drawGathering(
  drawn: Staged,
  at: Point,
  cell: number,
  ramp: readonly string[],
  gather: number,
  size: number,
  seed: number
): void {
  if (gather <= 0 || gather >= 1) return;
  drawn.motes.push(glow(at, cell * size * (0.3 + gather * 0.7), ramp[5], 0.4 + gather * 0.6, cell * 0.3));
  for (let index = 0; index < 10; index++) {
    const turn = (index / 10) * Math.PI * 2 + seed;
    const tilt = Math.abs(Math.sin(index * 2.3 + seed)) * 0.8;
    const out = cell * size * 1.6 * (1 - gather);
    const way = { x: Math.cos(turn) * Math.cos(tilt), y: Math.sin(turn) * Math.cos(tilt), z: Math.sin(tilt) };
    const point = { x: at.x + way.x * out, y: at.y + way.y * out, z: at.z + way.z * out };
    const speed = cell * size * 4 * gather;
    drawn.motes.push({
      ...glow(point, cell * 0.05, ramp[5], gather, cell * 0.3),
      shape: 'spark',
      velocity: { x: -way.x * speed, y: -way.y * speed, z: -way.z * speed },
      trail: 0.1,
    });
  }
}

/** A beam's bands from one point to another: a wide soft light, its body, and a white core, all as wide as `width` says. */
function beamRibbons(from: Point, to: Point, width: number, ramp: readonly string[], alpha: number): EffectRibbon[] {
  const points = [from, lerpPoint(from, to, 0.08), lerpPoint(from, to, 0.5), to];
  const swell = [0.6, 1, 1, 1];
  const hue = hueOf(ramp);
  return [
    // A body of its colour laid over the table, which keeps its colour where light would wash out.
    { points, widths: swell.map((share) => width * 2.2 * share), color: hue, alpha: 0.4 * alpha, blend: 'color' },
    { points, widths: swell.map((share) => width * 1.5 * share), color: hue, alpha: 0.45 * alpha, blend: 'light' },
    {
      points,
      widths: swell.map((share) => width * share),
      color: ramp[3],
      core: ramp[5],
      alpha: 0.8 * alpha,
      blend: 'light',
    },
    {
      points,
      widths: swell.map((share) => width * 0.38 * share),
      color: ramp[5],
      core: '#ffffff',
      alpha: alpha,
      blend: 'color',
    },
  ];
}

/** A beam, as thick as `thick` cells and gathered for `gathers` of its playback: see the header. */
function beamOf(thick: number, gathers: number, great: boolean): Choreography {
  const sparksByStage = new Map<string, ReturnType<typeof thrownSparks>>();
  return {
    lingerS: LINGER_S,
    draw: (stage) => {
      const drawn = nothingStaged();
      const { cell, duration } = stage;
      const t = stage.seconds;
      const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
      const from = originOf(stage);
      const to = chestOf(stage);
      const fires = Math.max(stage.blowsAt[0] ?? 0, duration * gathers);
      const stops = Math.max(fires + 0.3, duration * 0.85);
      const { way, length } = wayBetween(from, to);
      const forward = cell * 0.4;
      const sparks = keptFor(sparksByStage, stageKey(stage, duration + LINGER_S), () => {
        const th = throwerFor(stage, duration + LINGER_S);
        return thrownSparks(th, to, th.count(great ? 60 : 30), [3, 8], [fires, stops]);
      });

      drawGathering(drawn, from, cell, ramp, within(t, 0, fires), great ? 1.4 : 0.8, stage.seed);
      const firing = t >= fires && t < stops + 0.18;
      if (firing) {
        const reached = outCubic(within(t, fires, fires + 0.08));
        const ending = within(t, stops, stops + 0.18);
        const head = lerpPoint(from, to, reached);
        const pulse = 1 + 0.12 * Math.sin(t * 38) + 0.06 * Math.sin(t * 91);
        const width =
          cell * thick * pulse * (1 - ending) * (great ? 1 + 0.4 * (1 - within(t, fires, fires + 0.25)) : 1);
        drawn.ribbons.push(...beamRibbons(from, head, width, ramp, 1 - ending * 0.5));
        // Motes streaming down the beam.
        for (let index = 0; index < (great ? 18 : 10); index++) {
          const along = (t * (great ? 1.6 : 2.4) + index / (great ? 18 : 10)) % 1;
          if (along > reached) continue;
          const { side, lift } = acrossOf(way);
          const turn = index * 2.4 + t * 9;
          const off = width * 0.7;
          const at = lerpPoint(from, to, along);
          const point = {
            x: at.x + (side.x * Math.cos(turn) + lift.x * Math.sin(turn)) * off,
            y: at.y + (side.y * Math.cos(turn) + lift.y * Math.sin(turn)) * off,
            z: Math.max(stage.groundZ + cell * 0.05, at.z + (side.z * Math.cos(turn) + lift.z * Math.sin(turn)) * off),
          };
          const speed = length * 2;
          drawn.motes.push({
            ...glow(point, cell * 0.06, ramp[5], 1 - ending, forward),
            shape: 'spark',
            velocity: { x: way.x * speed, y: way.y * speed, z: way.z * speed },
            trail: 0.05,
          });
        }
        // Light at both ends and splashing where it strikes.
        drawn.motes.push(haze(from, cell * (great ? 1.8 : 0.9), hueOf(ramp), 0.5 * (1 - ending), forward));
        drawn.motes.push(glow(from, cell * (great ? 1.2 : 0.6), ramp[4], 0.5 * (1 - ending), forward));
        if (reached >= 1) {
          // A sphere of its colour where it strikes, a glare over it and a star of light.
          drawn.motes.push(haze(to, cell * (great ? 4 : 1.6), hueOf(ramp), 0.8 * (1 - ending), forward * 1.4));
          drawn.motes.push(glow(to, cell * (great ? 2 : 1), ramp[3], 0.7 * (1 - ending), forward * 1.5));
          const flicker = (t * 12) % 1;
          drawn.motes.push(
            ...starBurst(to, cell * (great ? 2.2 : 1.1), hueOf(ramp), flicker * 0.6, forward * 1.6, 4, t * 2)
          );
          drawn.motes.push({
            ...glow(to, cell * (great ? 1 : 0.5), '#ffffff', 0.7 * (1 - ending), forward * 1.6),
            shape: 'star',
            spin: t * 3,
          });
          const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
          drawn.floor.push(
            floorMark('disc', floor, cell * (great ? 1.6 : 1), 1, ramp[4], 0.2 * (1 - ending), 'light', 0)
          );
        }
        if (great && t < fires + 0.3) {
          const flash = 1 - within(t, fires, fires + 0.3);
          drawn.motes.push({ ...glow(from, cell * 0.8, '#ffffff', flash, forward * 2), shape: 'flare', trail: 10 });
          layShockRing(
            drawn,
            { x: stage.x, y: stage.y, z: stage.groundZ },
            cell * 0.4,
            cell * 3,
            cell * 0.15,
            ramp[5],
            t - fires - 0.08,
            0.4
          );
        }
        drawn.lights.push({
          ...to,
          color: ramp[4],
          strength: (great ? 1 : 0.8) * (1 - ending),
          reachPx: cell * (great ? 2.5 : 2),
        });
      }
      // What it burns into the floor under what it strikes, which stays once it has stopped.
      const strikes = fires + 0.08;
      const ends = duration + LINGER_S;
      laySoot(
        drawn,
        { x: stage.x, y: stage.y, z: stage.groundZ },
        cell * (great ? 0.9 : 0.5),
        t - strikes,
        stops - strikes + 0.5,
        1 - within(t, ends - 0.4, ends)
      );
      for (const [index, spark] of sparks.entries()) drawSpark(drawn, spark, t, cell * 0.7, ramp, index, forward);
      return drawn;
    },
  };
}

/** A great beam, thick and gathered long, shaking the light out of the scene: 極太ビーム. */
export const beam = beamOf(0.5, 0.3, true);
/** A laser, thin and quick to fire: レーザー照射. */
export const raybeam = beamOf(0.22, 0.28, false);
