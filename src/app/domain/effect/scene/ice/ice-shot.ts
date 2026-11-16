import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { bearingOf } from '@axe/domain/effect/scene/earth/earth-parts';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud } from '@axe/domain/effect/scene/fire/fire-parts';
import { crystal, glint, iceTonesOf } from '@axe/domain/effect/scene/ice/ice-parts';
import {
  drawGrain,
  drawShard,
  type Grain,
  icePowder,
  type Shard,
  throwGrains,
  throwShards,
} from '@axe/domain/effect/scene/ice/ice-shards';
import { glow, haze, keptFor, type Point, smokePuff, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A shot of ice: an icicle as long as a piece is wide, flying point first with a trail of cold mist
 * behind it and glints shed along its way; where it lands it breaks, in a flash, into shards and
 * powder thrown on the way it flew, over the ice its preset lands with.
 */

/** How long the icicle is and how wide, in cells. */
const LONG_CELLS = 1.5;
const WIDE_CELLS = 0.3;
/** How long what the icicle breaks into lingers, in seconds: as long as a shot does. */
const LINGER_S = 1.8;

/** An icicle in flight: where its point is, the way it flies, of length one, and how far along its course it is. */
export interface IcicleFlight {
  readonly at: Point;
  readonly way: Point;
  readonly cell: number;
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  readonly seconds: number;
  readonly seed: number;
}

/** Adds an icicle in flight to what is drawn: see the header. */
export function drawIcicle(drawn: Staged, flight: IcicleFlight, ramp: readonly string[]): void {
  const { at, way, cell, share, pathAt, seconds, seed } = flight;
  const tones = iceTonesOf(ramp);
  const long = cell * LONG_CELLS * Math.min(1, share * 6 + 0.35);
  const root = { x: at.x - way.x * long, y: at.y - way.y * long, z: at.z - way.z * long };
  const trail = Array.from({ length: 9 }, (_unused, index) => pathAt(Math.max(0, share - (8 - index) * 0.035)));
  const shares = trail.map((_point, index) => index / 8);
  drawn.ribbons.push({
    points: trail,
    widths: shares.map((part) => cell * (0.5 - 0.3 * part)),
    color: tones.mist,
    core: '#ffffff',
    alpha: 0.6,
    alphas: shares.map((part) => Math.sin(Math.PI * Math.min(1, part * 0.9 + 0.05))),
    blend: 'color',
    torn: 0.5,
    soft: 0.6,
    flowed: seconds * 3 + seed,
  });
  for (let back = 1; back <= 5; back++) {
    const was = share - back * 0.06;
    if (was < 0) break;
    const age = back / 5;
    drawn.motes.push(smokePuff(pathAt(was), cell * (0.22 + age * 0.4), tones.mist, 0.42 * (1 - age), cell * 0.2));
  }
  drawn.motes.push(haze(root, cell * 0.9, tones.shade, 0.3, cell * 0.2));
  drawn.motes.push(
    crystal(root, way, long, cell * WIDE_CELLS, tones, 1, { variant: (seed % 60) / 10, over: cell * 0.4 })
  );
  drawn.motes.push(glint(at, cell * 0.5, 0.6 + 0.4 * Math.sin(seconds * 40 + seed), cell * 0.5, seconds * 6));
  for (let shed = 1; shed <= 3; shed++) {
    const where = pathAt(Math.max(0, share - shed * 0.09));
    const off = Math.sin(seed * 3 + shed * 2.1) * cell * 0.16;
    drawn.motes.push(
      glint({ x: where.x, y: where.y, z: where.z + off }, cell * 0.24, 1 - shed / 4, cell * 0.3, shed + share * 6)
    );
  }
}

interface BreakThrow {
  readonly shards: readonly Shard[];
  readonly grains: readonly Grain[];
  readonly powder: readonly Cloud[];
}

const breakByStage = new Map<string, BreakThrow>();

/** How high over the foot of its target a shot strikes, in cells. */
const STRIKES_AT = 0.55;

/** What an icicle breaks into where it lands, on the clock of its landing. */
function drawIcicleBreak(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const t = stage.seconds;
  const ends = stage.duration + LINGER_S;
  if (t < 0 || t >= ends) return drawn;
  const tones = iceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const struck = { x: stage.x, y: stage.y, z: stage.z + cell * STRIKES_AT };
  const thrown = keptFor(breakByStage, stageKey(stage, ends) + '|icicle', () => {
    const th = throwerFor(stage, ends);
    const fan = { toward: bearingOf(stage.origin, floor, cell * 0.3) ?? 0, spread: 1.3 };
    const high: [number, number] = [STRIKES_AT - 0.12, STRIKES_AT + 0.12];
    return {
      shards: throwShards(th, floor, th.count(7), {
        long: [0.2, 0.45],
        up: [0.5, 5],
        out: [1, 5],
        bornAt: [0, 0.03],
        from: 0.1,
        high,
        fan,
      }),
      grains: throwGrains(th, floor, th.count(12), {
        size: [0.045, 0.1],
        up: [1, 6],
        out: [1, 6.5],
        bornAt: [0, 0.03],
        from: 0.1,
        high,
        fan: { ...fan, spread: 2 },
      }),
      powder: icePowder(th, struck, th.count(8), tones.pale, [0, 0.04], [0.35, 0.6]),
    };
  });
  const clearing = 1 - within(t, ends - 0.5, ends);
  const forward = cell * 0.3;
  for (const cloud of thrown.powder) drawCloud(drawn, cloud, t, cell, forward);
  for (const shard of thrown.shards) drawShard(drawn, shard, t, cell, tones, clearing);
  for (const grain of thrown.grains) drawGrain(drawn, grain, t, cell, tones, clearing, forward);
  if (t < 0.1) {
    const left = 1 - t / 0.1;
    drawn.motes.push({ ...glow(struck, cell * 0.6, '#ffffff', left, cell * 0.6), shape: 'flare', trail: 6, spin: 0.4 });
    drawn.motes.push({ ...glow(struck, cell * 0.5, tones.pale, left, cell * 0.6), shape: 'flare', trail: 5, spin: 2 });
  }
  return drawn;
}

/**
 * The look an icicle lands with: what it breaks into, over the look its preset lands with, both on
 * the clock of its landing.
 */
export function landsAsIcicle(landWith: (stage: Stage) => Staged): (stage: Stage) => Staged {
  return (stage) => {
    const drawn = drawIcicleBreak(stage);
    const landed = landWith(stage);
    drawn.motes.push(...landed.motes);
    drawn.ribbons.push(...landed.ribbons);
    drawn.floor.push(...landed.floor);
    drawn.lights.push(...landed.lights);
    return drawn;
  };
}
