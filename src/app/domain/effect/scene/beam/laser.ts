import { LASER_HOLDS_AT, type LaserTiming, laserTimingOf } from '@axe/domain/effect/beam-looks';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, laySoot, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  lerpPoint,
  lightBall,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
  wayBetween,
} from '@axe/domain/effect/scene/parts';
import { chestOf, originOf } from '@axe/domain/effect/scene/shot/stream-ends';

/*
 * A laser. A hairline is aimed at the floor short of the target and brightens; then the beam lights,
 * thin, white at its heart in a sheath of its colour and a dark rim, with a halo about it, and cuts
 * its way along the floor to the target: where it touches, the floor boils white, sparks fountain
 * back off it and smoke rises, and the cut it leaves glows and cools behind it. It climbs the target
 * and takes hold of it in a flash, and burns there, wandering a little, the piece lit by it, until
 * it is cut off: it thins away, its line hangs in the air for a moment, and what it burnt goes on
 * glowing and smoking.
 */

/** How long what a laser leaves stays after its playback, in seconds. */
export const LASER_LINGER_S = 1.2;
/** How wide the sheath of the beam is, in cells. */
const WIDE = 0.44;
/** How far short of the target the beam first touches the floor, in cells, and at the most as a share of the way to it. */
const CUTS_FROM = 3.2;
const CUTS_AT_MOST = 0.6;
/** The share of its cutting the beam spends on the floor before it climbs the target. */
const ON_FLOOR = 0.82;
/** How the beam gathers pace as it cuts: the power its cutting is eased by. */
const CUT_EASE = 1.15;
/** How long the cut goes on glowing behind the beam, and how long a spark or a wisp of smoke off it lasts, in seconds. */
const CUT_GLOWS_S = 2.1;
const SPARK_S = 0.42;
const WISP_S = 0.9;
/** How long the line of the beam hangs in the air once it is cut off, and how long what it burnt on the target glows, in seconds. */
const HANGS_S = 0.32;
const SPOT_GLOWS_S = 0.9;
/** The dark of the beam's rim and the colours of what it burns. */
const SHADOW = '#12060c';
const SOOT = '#0e0b10';
const EMBER = '#ff7a2c';
const EMBER_DEEP = '#c2330f';
/** How many smudges the cut is laid in. */
const CUT_MARKS = 16;

/** Where a laser runs: from the caster's hands, along the floor from where it first touches it to the target's foot, and up to its chest. */
interface LaserCourse {
  readonly from: Point;
  readonly touches: Point;
  readonly foot: Point;
  readonly chest: Point;
}

function courseOf(stage: Stage): LaserCourse {
  const from = originOf(stage);
  const chest = chestOf(stage);
  const dx = stage.x - from.x;
  const dy = stage.y - from.y;
  const far = Math.hypot(dx, dy) || 1;
  const short = Math.min(stage.cell * CUTS_FROM, far * CUTS_AT_MOST);
  const near = Math.min(stage.cell * 0.3, far * 0.2);
  const lies = stage.groundZ + stage.cell * 0.04;
  return {
    from,
    touches: { x: stage.x - (dx / far) * short, y: stage.y - (dy / far) * short, z: lies },
    foot: { x: stage.x - (dx / far) * near, y: stage.y - (dy / far) * near, z: lies },
    chest,
  };
}

/**
 * Where the beam touches at a moment: along the floor towards the target while it cuts, up the
 * target as it takes hold, and wandering a little over its chest while it burns there.
 */
function touchAt(course: LaserCourse, timing: LaserTiming, cell: number, t: number): Point {
  if (t >= timing.holdsAt) {
    const { way } = wayBetween(course.from, course.chest);
    const wander = Math.min(1, (t - timing.holdsAt) / 0.15);
    const aside = Math.sin(t * 7.3) * cell * 0.13 * wander;
    return {
      x: course.chest.x - way.y * aside,
      y: course.chest.y + way.x * aside,
      z: course.chest.z + Math.sin(t * 11.1) * cell * 0.1 * wander,
    };
  }
  const cut = Math.pow(within(t, timing.lightsAt, timing.holdsAt), CUT_EASE);
  if (cut < ON_FLOOR) return lerpPoint(course.touches, course.foot, cut / ON_FLOOR);
  return lerpPoint(course.foot, course.chest, (cut - ON_FLOOR) / (1 - ON_FLOOR));
}

/** The beam itself between two points: a halo, a dark rim, the sheath of its colour and a white heart, `thick` of its width. */
function layLine(
  drawn: Staged,
  from: Point,
  to: Point,
  wide: number,
  ramp: readonly string[],
  thick: number,
  alpha: number
): void {
  if (thick <= 0 || alpha <= 0) return;
  const points = [from, lerpPoint(from, to, 0.5), to];
  const hue = hueOf(ramp);
  const U = wide * thick;
  drawn.ribbons.push(
    { points, widths: U * 6, color: hue, alpha: 0.5 * alpha, blend: 'light', soft: 1 },
    { points, widths: U * 3.8, color: hue, alpha: 0.42 * alpha, blend: 'color', soft: 1 },
    { points, widths: U * 2.3, color: mixColor(ramp[0], SHADOW, 0.6), alpha: 0.8 * alpha, blend: 'color', soft: 0.5 },
    { points, widths: U * 1.3, color: hue, core: ramp[4], alpha, blend: 'color' },
    { points, widths: U * 0.52, color: '#ffffff', alpha, blend: 'color' }
  );
}

/** The cut the beam leaves along the floor up to a moment: soot, and a line of heat that is white under the beam and cools behind it. */
function layCut(drawn: Staged, course: LaserCourse, timing: LaserTiming, stage: Stage, clearing: number): void {
  const { cell } = stage;
  const t = stage.seconds;
  const done = Math.min(1, Math.pow(within(t, timing.lightsAt, timing.holdsAt), CUT_EASE) / ON_FLOOR);
  if (done <= 0 || clearing <= 0) return;
  const places = Array.from({ length: CUT_MARKS }, (_unused, index) => (index + 0.5) / CUT_MARKS).filter(
    (share) => share <= done
  );
  for (const share of places) {
    drawn.floor.push(
      floorMark('disc', lerpPoint(course.touches, course.foot, share), cell * 0.44, 1, SOOT, 0.6 * clearing, 'color', 0)
    );
  }
  const heatAt = (share: number) => {
    const passed = timing.lightsAt + (timing.holdsAt - timing.lightsAt) * Math.pow(share * ON_FLOOR, 1 / CUT_EASE);
    return Math.max(0, 1 - (t - passed) / CUT_GLOWS_S);
  };
  for (const share of places) {
    const heat = heatAt(share);
    if (heat <= 0) continue;
    const at = lerpPoint(course.touches, course.foot, share);
    drawn.floor.push(
      floorMark(
        'disc',
        at,
        cell * (0.3 + 0.14 * heat),
        1,
        EMBER_DEEP,
        0.85 * Math.min(1, heat * 2.5) * clearing,
        'color',
        0
      )
    );
  }
  for (const share of places) {
    const heat = heatAt(share);
    if (heat <= 0) continue;
    const at = lerpPoint(course.touches, course.foot, share);
    const hot = mixColor(EMBER, '#ffffff', Math.max(0, heat * 2.4 - 1.4));
    drawn.floor.push(
      floorMark('disc', at, cell * (0.14 + 0.16 * heat), 1, hot, Math.min(1, heat * 2.5) * clearing, 'color', 0)
    );
  }
}

/**
 * What boils where the beam touches: a white heart in a glare of its colour, a star flickering over
 * it, sparks fountaining back towards the caster and up, each from where the beam touched as it was
 * thrown, and wisps of smoke rising from where it has been.
 */
function layBoil(
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
  drawn.motes.push(haze(at, cell * 1.5 * held, hueOf(ramp), 0.45 * power, forward));
  drawn.motes.push(glow(at, cell * 1.9 * held * flicker, ramp[4], 0.8 * power, forward));
  drawn.motes.push(lightBall(at, cell * 0.6 * held * flicker, '#ffffff', power, forward + 1));
  drawn.motes.push(...starBurst(at, cell * 2.8 * held, ramp[4], ((t * 9) % 1) * 0.7, forward + 2, 4, t * 3));
  drawn.floor.push(
    floorMark('disc', { ...at, z: stage.groundZ }, cell * 1.6 * held, 1, ramp[4], 0.45 * power * flicker, 'light', 0)
  );
  drawn.lights.push({
    ...at,
    z: at.z + cell * 0.3,
    color: mixColor(ramp[4], hueOf(ramp), 0.6),
    strength: 0.9 * power * held,
    reachPx: cell * 3.6,
  });

  const back = wayBetween(at, course.from).way;
  const next = seededRun(stage.seed * 67 + 11);
  const sparks = Math.round(44 * held);
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
        cell * (index % 3 === 0 ? 0.26 : 0.16),
        left > 0.5 ? '#ffffff' : ramp[4],
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

const sparksByStage = new Map<string, ThrownMote[]>();

/** Draws a laser on one target at a moment: see the header. */
export function drawLaser(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const hue = hueOf(ramp);
  const timing = laserTimingOf(duration, stage.blowsAt[0] ?? duration * LASER_HOLDS_AT);
  const course = courseOf(stage);
  const wide = cell * WIDE;
  const forward = cell * 0.5;
  const ends = duration + LASER_LINGER_S;
  const clearing = 1 - within(t, ends - 0.4, ends);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };

  layCut(drawn, course, timing, stage, clearing);
  laySoot(drawn, floor, cell * 0.55, t - timing.holdsAt, timing.breaksAt - timing.holdsAt + 0.7, clearing);

  if (t < timing.lightsAt) {
    const aimed = within(t, 0, timing.lightsAt);
    const flicker = 0.7 + 0.3 * Math.sin(t * 90);
    const points = [course.from, course.touches];
    drawn.ribbons.push({
      points,
      widths: cell * 0.14,
      color: hue,
      alpha: 0.5 * aimed * flicker,
      blend: 'color',
      soft: 0.8,
    });
    drawn.ribbons.push({
      points,
      widths: cell * 0.04,
      color: ramp[5],
      alpha: (0.5 + 0.5 * aimed) * flicker,
      blend: 'color',
    });
    drawn.floor.push(floorMark('ring', course.touches, cell * (1.3 - 0.9 * aimed), 0.12, hue, aimed, 'color', 0));
    drawn.floor.push(floorMark('ring', course.touches, cell * (1.3 - 0.9 * aimed), 0.06, '#ffffff', aimed, 'light', 0));
    drawn.motes.push({
      ...glow(course.from, cell * (0.5 + 0.7 * aimed), '#ffffff', aimed, forward),
      shape: 'star',
      spin: t * 5,
    });
    drawn.motes.push(glow(course.from, cell * 1.2, ramp[4], 0.6 * aimed, forward));
    return drawn;
  }

  if (t < timing.cutAt) {
    const cutting = within(t, timing.breaksAt, timing.cutAt);
    const lit = Math.min(1, (t - timing.lightsAt) / 0.05);
    const thick = (0.45 + 0.55 * lit) * (1 - cutting) * (1 + 0.12 * Math.sin(t * 67) + 0.06 * Math.sin(t * 151));
    const touch = touchAt(course, timing, cell, t);
    layLine(drawn, course.from, touch, wide, ramp, thick, 1);
    const { length } = wayBetween(course.from, touch);
    for (let bead = 0; bead < 4; bead++) {
      const run = (t * 3.4 + bead / 4) % 1;
      drawn.motes.push(glow(lerpPoint(course.from, touch, run), wide * 3.2, ramp[5], 0.7 * (1 - cutting), forward));
    }
    drawn.motes.push(glow(course.from, cell * 1.3, ramp[4], 0.7 * (1 - cutting), forward));
    drawn.motes.push(lightBall(course.from, cell * 0.36, '#ffffff', 1 - cutting, forward + 1));
    drawn.motes.push(
      ...starBurst(
        course.from,
        cell * 1.6,
        ramp[4],
        within(t, timing.lightsAt, timing.lightsAt + 0.14),
        forward,
        6,
        0.4
      )
    );
    layBoil(drawn, stage, course, timing, ramp, 1 - cutting);
    if (length > 0 && t >= timing.holdsAt) {
      const flash = 1 - within(t, timing.holdsAt + 0.01, timing.holdsAt + 0.22);
      drawn.motes.push(lightBall(course.chest, cell * 1.5 * flash, '#ffffff', flash, forward + 3));
      drawn.motes.push(
        ...starBurst(
          course.chest,
          cell * 4.2,
          ramp[4],
          within(t, timing.holdsAt, timing.holdsAt + 0.3),
          forward + 4,
          8,
          stage.seed
        )
      );
      drawn.floor.push(floorMark('disc', floor, cell * 3, 1, ramp[4], 0.6 * flash, 'light', 0));
      drawn.motes.push(haze(course.chest, cell * 2.3, hue, 0.3 * (1 - cutting), forward));
    }
  } else {
    const hung = (t - timing.cutAt) / HANGS_S;
    if (hung < 1) {
      const points = [course.from, course.chest];
      drawn.ribbons.push({
        points,
        widths: wide * 1.6 * (1 - hung * 0.5),
        color: hue,
        alpha: 0.6 * (1 - hung),
        blend: 'color',
        soft: 0.7,
      });
      drawn.ribbons.push({ points, widths: wide * 0.4, color: ramp[4], alpha: 0.8 * (1 - hung), blend: 'color' });
    }
    const since = t - timing.cutAt;
    const heat = Math.pow(Math.max(0, 1 - since / SPOT_GLOWS_S), 1.5);
    if (heat > 0) {
      drawn.motes.push(
        glow(course.chest, cell * (0.5 + 0.5 * heat), mixColor(EMBER, '#ffffff', heat * 0.5), heat, forward)
      );
      drawn.lights.push({ ...course.chest, color: EMBER, strength: 0.8 * heat, reachPx: cell * 2.5 });
    }
    for (let index = 0; index < 5; index++) {
      const share = (since / 1.1 + index / 5) % 1;
      if (since - share * 1.1 < 0 || since > 1.6) continue;
      drawn.motes.push(
        smokePuff(
          {
            x: course.chest.x + Math.sin(index * 2.9 + share * 3) * cell * 0.18,
            y: course.chest.y,
            z: course.chest.z + cell * (0.1 + 1.6 * share),
          },
          cell * (0.4 + 0.8 * share),
          '#4b4650',
          0.45 * Math.min(1, share * 6) * (1 - share) * (1 - within(since, 1, 1.6)),
          cell * 0.3
        )
      );
    }
  }

  const sparks = keptFor(sparksByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return thrownSparks(th, course.chest, th.count(40), [4, 13], [timing.holdsAt, timing.holdsAt + 0.04]);
  });
  for (const [index, spark] of sparks.entries()) drawSpark(drawn, spark, t, cell * 1.3, ramp, index, forward);
  return drawn;
}
