import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { bearingOf, type EarthTones, earthTonesOf, layDent } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { type Cloud, drawCloud } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  acrossOf,
  floorMark,
  glow,
  keptFor,
  lightBall,
  type Point,
  smokePuff,
  stageKey,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A shot of rock. In flight it is a boulder, dark and outlined with one face lit, tumbling end over
 * end on a low arc, its shadow under it on the floor, dust torn off behind it and pebbles shed that
 * fall away along its way. Where it lands it breaks: a pale flash, its pieces thrown on the way it
 * was flying to bounce and lie, gravel sprayed, dust kicked up and on, and a dent left in the floor.
 */

/** How wide the boulder is, in cells. */
export const SHOT_ROCK_CELLS = 0.78;
/** How high its arc lifts it at the most, in cells, and as a share of how far it flies. */
const ARC_CELLS = 0.7;
const ARC_SHARE = 0.07;
/** How fast it tumbles, in radians a second. */
const TUMBLES = 11;
/** How many puffs of dust trail it, how far apart along its way, as shares of it, and how many pebbles it sheds. */
const TRAIL_PUFFS = 9;
const TRAIL_APART = 0.035;
export const SHED_PEBBLES = 6;

/** How many of each one rock of the middle grade breaks into. */
export const BREAK_THROWS = { pieces: 10, gravel: 38, dust: 9, skirt: 4, plumes: 3, jets: 16, burst: 12 } as const;
/** The share of what it breaks into that is thrown on the way it was flying. */
export const BROKEN_ONWARD = 0.75;
const CLEARS_S = 0.5;
/** The dark rim a boulder is drawn over, which holds it over a bright table. */
const RIM = '#1d140d';
/** How long the white of its break lasts, in seconds. */
const FLASH_S = 0.1;

/** A rock in flight at a moment. */
export interface RockFlight {
  /** Where its course has it, in table pixels, and the way it flies, of length one. */
  readonly at: Point;
  readonly way: Point;
  readonly cell: number;
  /** How far through its flight it is, from 0 to 1, and where its course has it at any share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  /** How long its flight takes, in seconds, and how far into the playback it is. */
  readonly fliesS: number;
  readonly seconds: number;
  readonly seed: number;
  /** How high the floor under it is, in table pixels. */
  readonly floorZ: number;
}

/** Where a rock is a share of the way through its flight: on its course, lifted on a low arc. */
export function rockAt(flight: Pick<RockFlight, 'pathAt' | 'cell'>, along: number): Point {
  const from = flight.pathAt(0);
  const to = flight.pathAt(1);
  const far = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const lift = Math.min(flight.cell * ARC_CELLS, far * ARC_SHARE) * Math.sin(Math.PI * along);
  const on = flight.pathAt(along);
  return { x: on.x, y: on.y, z: on.z + lift };
}

/** The rock of a shot in flight: see the header. */
export function drawRockFlying(drawn: Staged, flight: RockFlight, ramp: readonly string[]): void {
  const { cell, share, seconds, seed, floorZ, way } = flight;
  const tones = earthTonesOf(ramp);
  const at = rockAt(flight, share);
  const size = cell * SHOT_ROCK_CELLS;
  const spin = seconds * TUMBLES + (seed % 6);
  const high = Math.max(0, at.z - floorZ);
  drawn.floor.push(
    floorMark('disc', { x: at.x, y: at.y, z: floorZ }, size * (0.7 + high / (cell * 4)), 1, '#1a120c', 0.4, 'color', 0)
  );
  for (let back = TRAIL_PUFFS; back >= 1; back--) {
    const was = share - back * TRAIL_APART;
    if (was < 0) continue;
    const age = back / TRAIL_PUFFS;
    const where = rockAt(flight, was);
    const sway = Math.sin(seed * 1.3 + back * 2.1) * cell * 0.08 * age;
    drawn.motes.push(
      smokePuff(
        { x: where.x, y: where.y, z: where.z + sway },
        size * (0.6 + age * 0.95),
        tones.dust,
        (1 - age) * 0.68,
        0
      )
    );
  }
  const fall = 13 * cell;
  const speed =
    Math.hypot(...(['x', 'y', 'z'] as const).map((axis) => flight.pathAt(1)[axis] - flight.pathAt(0)[axis])) /
    Math.max(flight.fliesS, 0.02);
  for (let pebble = 0; pebble < SHED_PEBBLES; pebble++) {
    const shedAt = 0.1 + (pebble / SHED_PEBBLES) * 0.8;
    const since = (share - shedAt) * flight.fliesS;
    if (since < 0) continue;
    const from = rockAt(flight, shedAt);
    const aside = Math.sin(seed * 2.7 + pebble * 1.9) * cell * 0.5;
    const { side } = acrossOf(way);
    const carried = speed * 0.45 * since;
    const z = from.z - cell * 0.1 + cell * 1.2 * since - 0.5 * fall * since * since;
    if (z <= floorZ) continue;
    drawn.motes.push(
      chunkAt(
        {
          x: from.x + way.x * carried + side.x * aside * since,
          y: from.y + way.y * carried + side.y * aside * since,
          z,
        },
        cell * (pebble % 2 === 0 ? 0.1 : 0.07),
        tones.rock[pebble % 3],
        since * 14 + pebble,
        pebble
      )
    );
  }
  for (const [lump, round] of [
    [0, 0.7],
    [1, 3.5],
  ] as const) {
    const about = spin + round;
    const where = { x: at.x + Math.cos(about) * size * 0.26, y: at.y, z: at.z + Math.sin(about) * size * 0.24 };
    drawn.motes.push(chunkAt(where, size * 0.62, tones.rock[1], spin + lump * 2.7, (seed + lump * 2.7) % 6));
  }
  drawn.motes.push({ ...chunkAt(at, size * 1.16, RIM, spin, seed % 6), forward: size * 0.42 });
  drawn.motes.push(chunkAt(at, size, tones.rock[1], spin, seed % 6));
  const face = { x: at.x + way.x * size * 0.12, y: at.y + way.y * size * 0.12, z: at.z + size * 0.14 };
  drawn.motes.push(chunkAt(face, size * 0.42, tones.rock[0], spin * 0.5, (seed + 1.9) % 6));
}

/** A chunk of rock at a place, turned, drawn before whatever it flies past. */
function chunkAt(at: Point, size: number, color: string, spin: number, variant: number): EffectMote {
  return {
    x: at.x,
    y: at.y,
    z: at.z,
    size,
    color,
    alpha: 1,
    blend: 'color',
    shape: 'chunk',
    spin,
    variant,
    forward: size * 0.6,
  };
}

interface RockBreak {
  readonly rocks: readonly Rock[];
  readonly dust: readonly Cloud[];
}

const breakByStage = new Map<string, RockBreak>();

function throwBreak(stage: Stage, floor: Point, onward: number, tones: EarthTones, ends: number): RockBreak {
  const th = throwerFor(stage, ends);
  const fan = { toward: onward, spread: 0.75, share: BROKEN_ONWARD };
  const struckHigh = (stage.z - stage.groundZ) / stage.cell + 0.5;
  return {
    rocks: [
      ...throwRocks(th, floor, th.count(BREAK_THROWS.pieces), {
        size: [0.24, 0.48],
        up: [2.5, 6],
        out: [1.4, 4],
        bornAt: [0, 0.03],
        high: [struckHigh * 0.7, struckHigh * 1.1],
        from: 0.15,
        fan,
      }),
      ...throwRocks(th, floor, th.count(BREAK_THROWS.gravel), {
        size: [0.04, 0.09],
        up: [1.5, 7],
        out: [1, 5],
        bornAt: [0, 0.04],
        high: [struckHigh * 0.5, struckHigh * 1.2],
        from: 0.2,
        fan,
        bounce: 0.25,
      }),
    ],
    dust: [
      ...kickedDust(th, floor, th.count(BREAK_THROWS.jets), tones.sand, {
        speed: [5, 10],
        size: [0.3, 0.5],
        bornAt: [0, 0.02],
        rise: [0.5, 5],
        from: 0.15,
        alpha: 0.8,
        life: [0.28, 0.5],
        jet: 1.4,
      }),
      ...kickedDust(th, floor, th.count(BREAK_THROWS.burst), tones.dust, {
        speed: [1.5, 4.5],
        size: [0.8, 1.2],
        bornAt: [0, 0.03],
        rise: [0.6, 2.2],
        alpha: 0.7,
        life: [0.45, 0.8],
      }),
      ...kickedDust(th, floor, th.count(BREAK_THROWS.dust), tones.dust, {
        speed: [2, 5.5],
        size: [0.5, 0.8],
        bornAt: [0, 0.06],
        fan: { toward: onward, spread: 1.1 },
        rise: [0.3, 1.6],
        alpha: 0.5,
      }),
      ...kickedDust(th, floor, th.count(BREAK_THROWS.skirt), tones.dust, {
        speed: [0.8, 2.4],
        size: [0.5, 0.8],
        bornAt: [0, 0.08],
      }),
      ...earthPlumes(th, floor, th.count(BREAK_THROWS.plumes), tones.dust, {
        rise: [3, 6],
        bornAt: [0, 0.1],
        long: 1.5,
      }),
    ],
  };
}

/**
 * What a shot of rock lands with: see the header. Drawn on the clock of its landing, as the look a
 * shot lands with is, and cleared within `clearsIn` seconds of it, which is as long as the shot goes
 * on being drawn.
 */
export function drawRockBreak(stage: Stage, clearsIn: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const t = stage.seconds;
  if (t < 0) return drawn;
  const ends = Math.max(0.3, clearsIn);
  const tones = earthTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const struck = { x: stage.x, y: stage.y, z: stage.z + cell * 0.5 };
  const onward = bearingOf(stage.origin, stage, cell * 0.2) ?? ((stage.seed % 360) * Math.PI) / 180;
  const thrown = keptFor(breakByStage, stageKey(stage, ends), () => throwBreak(stage, floor, onward, tones, ends));
  const clearing = 1 - within(t, ends - CLEARS_S, ends);

  drawn.floor.push(
    floorMark(
      'cracks',
      floor,
      cell * 1.1 * Math.min(1, t / 0.06 + 0.2),
      0.28,
      tones.earth,
      0.75 * clearing,
      'color',
      stage.seed % 89,
      stage.seed
    )
  );
  layDent(drawn, floor, cell * 0.5 * Math.min(1, t / 0.05 + 0.3), tones, clearing, stage.seed);
  if (t < 0.4)
    drawn.floor.push(
      floorMark(
        'ring',
        floor,
        cell * (0.35 + 2 * outCubic(t / 0.4)),
        0.2 * (1 - t / 0.4) + 0.04,
        tones.earth,
        0.8 * (1 - t / 0.4),
        'color',
        0
      ),
      floorMark(
        'ring',
        floor,
        cell * (0.3 + 1.9 * outCubic(t / 0.4)),
        0.14 * (1 - t / 0.4) + 0.03,
        tones.sand,
        1 - t / 0.4,
        'color',
        0
      )
    );
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
  for (const rock of thrown.rocks) drawRock(drawn, rock, t, cell, tones);
  if (t < FLASH_S) {
    const left = 1 - t / FLASH_S;
    drawn.motes.push(glow(struck, cell * 2, tones.hot, 0.7 * left, cell * 0.5));
    drawn.motes.push(lightBall(struck, cell * 0.8 * (0.7 + 0.3 * left), '#fff3dc', left, cell * 0.5));
    for (const [flare, spin] of [0.5, 2.2, 1.35, 2.9].entries()) {
      drawn.motes.push({
        ...glow(struck, cell * (flare < 2 ? 0.42 : 0.3), '#ffffff', left, cell * 0.5),
        shape: 'flare',
        trail: flare < 2 ? 6 : 4.5,
        spin,
      });
    }
    drawn.floor.push(floorMark('disc', floor, cell * 1.5, 1, '#fff3dc', 0.5 * left, 'light', 0));
  }
  if (t < 0.2) drawn.lights.push({ ...struck, color: tones.hot, strength: 1.5 * (1 - t / 0.2), reachPx: cell * 2.6 });
  return drawn;
}
