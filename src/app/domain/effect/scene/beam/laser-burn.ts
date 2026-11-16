import { type LaserTiming } from '@axe/domain/effect/beam-looks';
import { CUT_EASE, type LaserCourse, ON_FLOOR, touchAt } from '@axe/domain/effect/scene/beam/laser-course';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  lerpPoint,
  lightBall,
  type Point,
  smokePuff,
  starBurst,
  wayBetween,
} from '@axe/domain/effect/scene/parts';

/*
 * What a laser burns: the cut it leaves along the floor, what boils where it touches, the slam as it
 * lights and the pop as it is cut off.
 */

/** How long the cut goes on glowing behind the beam, and how long a spark or a wisp of smoke off it lasts, in seconds. */
const CUT_GLOWS_S = 2.1;
const SPARK_S = 0.42;
const WISP_S = 0.9;
/** How many glowing spots the beam leaves behind it as it wanders over what it has hold of. */
const BURN_TRAIL = 8;
/** The colours of what it burns. */
const SOOT = '#0e0b10';
export const EMBER = '#ff7a2c';
const EMBER_DEEP = '#c2330f';
const MOLTEN = '#ffd23a';
const CHAR = '#3a0c05';
/** How many smudges the cut is laid in on one target, and on each of several: what the floor shows in a frame is shared between them. */
const CUT_MARKS = 20;
const CUT_MARKS_EACH = 9;

/**
 * The cut the beam leaves along the floor up to a moment: soot, a line of molten heat that is white
 * under the beam and cools behind it through yellow and orange to a red glow, a glow of light over it
 * while it is hot, and little tongues of flame licking up off it where it is hottest.
 */
export function layCut(drawn: Staged, course: LaserCourse, timing: LaserTiming, stage: Stage, clearing: number): void {
  const { cell } = stage;
  const t = stage.seconds;
  const done = Math.min(1, Math.pow(within(t, timing.lightsAt, timing.holdsAt), CUT_EASE) / ON_FLOOR);
  if (done <= 0 || clearing <= 0) return;
  const marks = stage.targets.length > 1 ? CUT_MARKS_EACH : CUT_MARKS;
  const places = Array.from({ length: marks }, (_unused, index) => (index + 0.5) / marks).filter(
    (share) => share <= done
  );
  for (const share of places) {
    drawn.floor.push(
      floorMark(
        'disc',
        lerpPoint(course.touches, course.foot, share),
        cell * 0.58,
        1,
        SOOT,
        0.62 * clearing,
        'color',
        0
      )
    );
  }
  const heatAt = (share: number) => {
    const passed = timing.lightsAt + (timing.holdsAt - timing.lightsAt) * Math.pow(share * ON_FLOOR, 1 / CUT_EASE);
    return Math.max(0, 1 - (t - passed) / CUT_GLOWS_S);
  };
  const hotPlaces = places
    .map((share) => ({ share, heat: heatAt(share), at: lerpPoint(course.touches, course.foot, share) }))
    .filter((place) => place.heat > 0);
  for (const { at, heat } of hotPlaces) {
    drawn.floor.push(
      floorMark(
        'disc',
        at,
        cell * (0.34 + 0.2 * heat),
        1,
        EMBER_DEEP,
        0.9 * Math.min(1, heat * 2.5) * clearing,
        'color',
        0
      )
    );
  }
  for (const { at, heat } of hotPlaces) {
    const hot = mixColor(heat > 0.55 ? MOLTEN : EMBER, '#ffffff', Math.max(0, heat * 2.4 - 1.4));
    drawn.floor.push(
      floorMark('disc', at, cell * (0.16 + 0.24 * heat), 1, hot, Math.min(1, heat * 2.5) * clearing, 'color', 0)
    );
  }
  const turn = Math.atan2(course.touches.y - course.foot.y, course.foot.x - course.touches.x);
  const step = Math.hypot(course.foot.x - course.touches.x, course.foot.y - course.touches.y) / marks;
  const reach = step * 1.6;
  hotPlaces.forEach(({ at, heat }, index) => {
    if (heat < 0.15 || index % 2 === 1) return;
    const crack = mixColor(EMBER, '#ffffff', Math.max(0, heat * 2 - 1));
    const wide = (share: number) => Math.min(0.8, (cell * share) / reach);
    drawn.floor.push(floorMark('fissure', at, reach, wide(0.18), CHAR, 0.9 * clearing, 'color', index, turn));
    drawn.floor.push(
      floorMark('fissure', at, reach, wide(0.09), crack, Math.min(1, heat * 2) * clearing, 'color', index, turn)
    );
  });
  for (const { at, heat } of hotPlaces) {
    if (heat < 0.3) continue;
    drawn.floor.push(floorMark('disc', at, cell * (0.4 + 0.5 * heat), 1, EMBER, 0.45 * heat * clearing, 'light', 0));
  }
  hotPlaces.forEach(({ at, heat }, index) => {
    if (heat < 0.4 || index % 2 === 1) return;
    const flicker = 0.75 + 0.25 * Math.sin(t * 23 + index * 1.7);
    const paint = { alpha: Math.min(1, (heat - 0.4) * 3) * clearing, forward: cell * 0.2, variant: index * 1.3 };
    const rooted = { ...at, z: at.z + cell * 0.02 };
    const up = { x: Math.sin(t * 5 + index) * 0.15, y: 0, z: 1 };
    const tall = cell * (0.3 + 0.45 * heat) * flicker;
    drawn.motes.push(
      flowingMote('lick', rooted, up, cell * 0.3 * heat, tall * 1.1, t * 6 + index, { ...paint, color: CHAR }),
      flowingMote('lick', rooted, up, cell * 0.22 * heat, tall, t * 6 + index, { ...paint, color: EMBER, core: MOLTEN })
    );
  });
}

/**
 * What boils where the beam touches: a white heart in a glare of its colour, a star flickering over
 * it, sparks fountaining back towards the caster and up, each from where the beam touched as it was
 * thrown, and wisps of smoke rising from where it has been.
 */
export function layBoil(
  drawn: Staged,
  stage: Stage,
  course: LaserCourse,
  timing: LaserTiming,
  ramp: readonly string[],
  power: number
): void {
  const { cell } = stage;
  const t = stage.seconds;
  const forward = cell * 0.5;
  const at = touchAt(course, timing, cell, t);
  const flicker = 0.75 + 0.25 * Math.sin(t * 61 + stage.seed);
  const held = t >= timing.holdsAt ? 1.35 : 1;
  drawn.motes.push(haze(at, cell * 1.5 * held, hueOf(ramp), 0.55 * power, forward));
  drawn.motes.push(glow(at, cell * 1.5 * held * flicker, ramp[4], 0.7 * power, forward));
  drawn.motes.push(glow(at, cell * 1.1 * held, MOLTEN, 0.7 * power, forward + 0.5));
  drawn.motes.push(lightBall(at, cell * 0.75 * held * flicker, '#ffffff', power, forward + 1));
  drawn.motes.push(...starBurst(at, cell * 3.2 * held, ramp[4], ((t * 9) % 1) * 0.7, forward + 2, 4, t * 3));
  drawn.floor.push(
    floorMark('disc', { ...at, z: stage.groundZ }, cell * 1.3 * held, 1, ramp[4], 0.4 * power * flicker, 'light', 0)
  );
  if (t < timing.holdsAt)
    drawn.floor.push(floorMark('disc', { ...at, z: stage.groundZ }, cell * 0.75, 1, MOLTEN, 0.8 * power, 'light', 0));
  else
    for (let back = 1; back <= BURN_TRAIL; back++) {
      const was = t - back * 0.05;
      if (was < timing.holdsAt) break;
      const fade = 1 - back / (BURN_TRAIL + 1);
      drawn.motes.push(
        glow(
          touchAt(course, timing, cell, was),
          cell * (0.42 - 0.025 * back),
          back < 3 ? MOLTEN : EMBER,
          fade * power,
          forward + 0.5
        )
      );
    }
  drawn.lights.push({
    ...at,
    z: at.z + cell * 0.3,
    color: mixColor(ramp[4], hueOf(ramp), 0.6),
    strength: 0.7 * power * held,
    reachPx: cell * 2.8,
  });

  const back = wayBetween(at, course.from).way;
  const next = seededRun(stage.seed * 67 + 11);
  const sparks = Math.round(60 * held);
  for (let index = 0; index < sparks; index++) {
    const turn = next() * Math.PI * 2;
    const rise = 3 + next() * 6;
    const out = 1.5 + next() * 4;
    const phase = next();
    const age = ((t / SPARK_S + phase) % 1) * SPARK_S;
    if (t - age < timing.lightsAt) continue;
    const thrownFrom = touchAt(course, timing, cell, t - age);
    const vx = (Math.cos(turn) * out + back.x * 2.2) * cell;
    const vy = (Math.sin(turn) * out + back.y * 2.2) * cell;
    const vz = rise * cell - 13 * cell * age;
    const point = {
      x: thrownFrom.x + vx * age,
      y: thrownFrom.y + vy * age,
      z: Math.max(stage.groundZ + 1, thrownFrom.z + rise * cell * age - 6.5 * cell * age * age),
    };
    const left = 1 - age / SPARK_S;
    drawn.motes.push({
      ...glow(
        point,
        cell * (index % 3 === 0 ? 0.3 : 0.19),
        left > 0.6 ? '#ffffff' : index % 2 === 0 ? MOLTEN : left > 0.3 ? ramp[4] : EMBER,
        Math.min(1, left * 2) * power,
        forward
      ),
      shape: 'spark',
      velocity: { x: vx, y: vy, z: vz },
      trail: 0.06,
    });
  }
  const wisps = 9;
  for (let index = 0; index < wisps; index++) {
    const age = ((t / WISP_S + index / wisps) % 1) * WISP_S;
    if (t - age < timing.lightsAt) continue;
    const rose = touchAt(course, timing, cell, t - age);
    const share = age / WISP_S;
    const sway = Math.sin(index * 2.9 + age * 4) * cell * 0.15;
    drawn.motes.push(
      smokePuff(
        { x: rose.x + sway, y: rose.y, z: rose.z + cell * (0.2 + 1.5 * share) },
        cell * (0.5 + 1 * share),
        '#4b4650',
        0.6 * Math.min(1, share * 6) * (1 - share) * power,
        cell * 0.3
      )
    );
  }
}

/**
 * The instant the beam lights: a white flash at the muzzle with a star across it, and where it first
 * touches the floor a slam of light, a star, a ring racing out over the floor and the floor lit.
 */
export function layLighting(
  drawn: Staged,
  course: LaserCourse,
  timing: LaserTiming,
  cell: number,
  ramp: readonly string[],
  t: number,
  forward: number,
  floorZ: number
): void {
  const since = t - timing.lightsAt;
  if (since < 0 || since >= 0.4) return;
  const flash = 1 - within(since, 0.02, 0.2);
  drawn.motes.push(...starBurst(course.from, cell * 3.2, ramp[4], within(since, 0, 0.22), forward, 6, 0.4));
  drawn.motes.push(lightBall(course.from, cell * 1.1 * flash, '#ffffff', flash, forward + 2));
  drawn.motes.push(lightBall(course.touches, cell * 1.3 * flash, '#ffffff', flash, forward + 2));
  drawn.motes.push(haze(course.touches, cell * 2.6, hueOf(ramp), 0.6 * flash, forward));
  drawn.motes.push(...starBurst(course.touches, cell * 3.8, ramp[4], within(since, 0, 0.3), forward + 3, 8, 1.1));
  const under = { ...course.touches, z: floorZ };
  drawn.floor.push(floorMark('disc', under, cell * 2.6, 1, ramp[4], 0.6 * flash, 'light', 0));
  layShockRing(drawn, under, cell * 0.3, cell * 2.6, cell * 0.3, hueOf(ramp), since, 0.38);
}

/**
 * The instant the beam is cut off what it had hold of: what it burnt pops in a white flash with a
 * star across it, a ring racing out over the floor under it and a puff of smoke thrown off it.
 */
export function laySnap(
  drawn: Staged,
  at: Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  forward: number,
  floorZ: number
): void {
  if (since < 0 || since >= 0.6) return;
  const flash = 1 - within(since, 0.01, 0.16);
  drawn.motes.push(lightBall(at, cell * 1.2 * flash, '#ffffff', flash, forward + 3));
  drawn.motes.push(glow(at, cell * 2.4 * flash, MOLTEN, 0.8 * flash, forward + 2));
  drawn.motes.push(...starBurst(at, cell * 3.6, EMBER, within(since, 0, 0.28), forward + 4, 6, 0.7));
  layShockRing(drawn, { ...at, z: floorZ }, cell * 0.3, cell * 2.2, cell * 0.24, ramp[4], since, 0.4);
  const puff = within(since, 0, 0.6);
  for (let index = 0; index < 4; index++) {
    const turn = index * 1.7 + 0.4;
    drawn.motes.push(
      smokePuff(
        {
          x: at.x + Math.cos(turn) * cell * 0.5 * puff,
          y: at.y + Math.sin(turn) * cell * 0.5 * puff,
          z: at.z + cell * (0.1 + 0.6 * puff),
        },
        cell * (0.5 + 0.7 * puff),
        index % 2 === 0 ? '#4b4650' : '#2c2830',
        0.7 * (1 - puff),
        forward
      )
    );
  }
}
