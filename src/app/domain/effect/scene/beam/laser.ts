import { LASER_HOLDS_AT, laserTimingOf } from '@axe/domain/effect/beam-looks';
import { beamLineOf, beamRingOf } from '@axe/domain/effect/scene/beam/beam-body';
import { EMBER, layBoil, layCut, layLighting, laySnap } from '@axe/domain/effect/scene/beam/laser-burn';
import { courseOf, touchAt } from '@axe/domain/effect/scene/beam/laser-course';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
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

/*
 * A laser. A hairline is aimed at the floor short of the target and brightens; then the beam lights
 * with a slam: a white flash at the muzzle and where it first touches the floor, a star across each
 * and a ring racing out over the floor. It is a searing white heart, thin and hot, in a sheath of its
 * colour, a dark rim and a shimmering glow torn at its edges, swells running down it, the rings of a
 * lens standing about it at the muzzle. It cuts its way along the floor to the target: where it
 * touches, the floor boils into a molten pool, sparks of molten white and gold fountain back off it
 * and smoke rises, and the cut it leaves is a molten line that cools behind it through gold and orange
 * to a red glow, little flames licking up off it where it is hottest. It climbs the target and takes
 * hold of it in a flash, and burns there, wandering over it and leaving glowing spots where it has
 * been, the piece lit by it and shaking, until it is cut off: what it burnt pops in a flash with a
 * ring and a puff of smoke, its line hangs in the air for a moment, and what it burnt goes on glowing
 * and smoking.
 */

/** How long what a laser leaves stays after its playback, in seconds. */
export const LASER_LINGER_S = 1.2;
/** How wide the sheath of the beam is, in cells. */
const WIDE = 0.44;
/** How long the line of the beam hangs in the air once it is cut off, and how long what it burnt on the target glows, in seconds. */
const HANGS_S = 0.32;
const SPOT_GLOWS_S = 0.9;
/** The dark of the beam's rim. */
const SHADOW = '#12060c';

/** How many points the beam is laid through, how far apart the swells running down it are, in cells, and how fast they run, a second. */
const LINE_POINTS = 12;
const SWELL_CELLS = 0.9;
const SWELLS_RUN = 7;

/**
 * The beam itself between two points: a halo of light, a shimmering glow of its colour torn at its
 * edges, a dark rim, the sheath of its colour, and a searing white heart, thin and hot, with a blaze of
 * white over it; swells run down all but its heart from the muzzle to where it touches, `thick` of
 * its width.
 */
function layLine(
  drawn: Staged,
  from: Point,
  to: Point,
  wide: number,
  ramp: readonly string[],
  thick: number,
  alpha: number,
  seconds: number
): void {
  if (thick <= 0 || alpha <= 0) return;
  const { length } = wayBetween(from, to);
  const shares = Array.from({ length: LINE_POINTS }, (_unused, index) => index / (LINE_POINTS - 1));
  const points = shares.map((share) => lerpPoint(from, to, share));
  const cell = wide / WIDE;
  const swells = shares.map(
    (share) =>
      1 +
      0.16 *
        Math.sin(Math.PI * 2 * ((share * length) / (cell * SWELL_CELLS) - seconds * SWELLS_RUN)) *
        Math.min(1, share * 6)
  );
  const hue = hueOf(ramp);
  const U = wide * thick;
  const flicker = 0.85 + 0.15 * Math.sin(seconds * 83);
  const sheet = (share: number) => swells.map((swell) => U * share * swell);
  drawn.ribbons.push(
    { points, widths: sheet(6.4), color: hue, alpha: 0.55 * alpha, blend: 'light', soft: 1 },
    {
      points,
      widths: sheet(3.9),
      color: hue,
      alpha: 0.62 * alpha,
      blend: 'color',
      soft: 0.75,
      torn: 0.45,
      flowed: -seconds * 16,
    },
    {
      points,
      widths: sheet(2.2),
      color: mixColor(ramp[0], SHADOW, 0.6),
      alpha: 0.85 * alpha,
      blend: 'color',
      soft: 0.4,
    },
    { points, widths: sheet(1.35), color: hue, core: ramp[4], alpha, blend: 'color', torn: 0.12, flowed: -seconds * 9 },
    { points, widths: U * 0.36, color: '#ffffff', alpha, blend: 'color' },
    { points, widths: sheet(0.95), color: '#ffffff', alpha: 0.8 * alpha * flicker, blend: 'light', soft: 0.6 }
  );
}

/**
 * The rings of a lens standing about the beam at its muzzle while it burns, the one nearer the muzzle
 * white and the other of its colour, each pulsing, drawn by halves either side of the beam.
 */
function focusRingsOf(
  from: Point,
  to: Point,
  cell: number,
  ramp: readonly string[],
  t: number,
  alpha: number,
  floorZ: number
): { readonly far: EffectRibbon; readonly near: EffectRibbon }[] {
  if (alpha <= 0.01) return [];
  const line = beamLineOf(from, to);
  return [0, 1].map((ring) =>
    beamRingOf(
      line,
      {
        along: cell * (0.22 + 0.24 * ring),
        radius: cell * (0.26 + 0.14 * ring) * (1 + 0.12 * Math.sin(t * 31 + ring * 2)),
        thick: cell * (0.07 - 0.02 * ring),
        color: ring === 0 ? '#ffffff' : hueOf(ramp),
        alpha,
      },
      floorZ + 1
    )
  );
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
    const rings = focusRingsOf(course.from, touch, cell, ramp, t, (1 - cutting) * lit, stage.groundZ);
    drawn.ribbons.push(...rings.map((ring) => ring.far));
    layLine(drawn, course.from, touch, wide, ramp, thick, 1, t);
    drawn.ribbons.push(...rings.map((ring) => ring.near));
    const { length } = wayBetween(course.from, touch);
    for (let bead = 0; bead < 4; bead++) {
      const run = (t * 3.4 + bead / 4) % 1;
      drawn.motes.push(glow(lerpPoint(course.from, touch, run), wide * 3.2, ramp[5], 0.7 * (1 - cutting), forward));
    }
    drawn.motes.push(glow(course.from, cell * 1.5, ramp[4], 0.75 * (1 - cutting), forward));
    drawn.motes.push(lightBall(course.from, cell * 0.42, '#ffffff', 1 - cutting, forward + 1));
    layLighting(drawn, course, timing, cell, ramp, t, forward, stage.groundZ);
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
    laySnap(drawn, course.chest, cell, ramp, t - timing.cutAt, forward, stage.groundZ);
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
    return [
      ...thrownSparks(th, course.chest, th.count(40), [4, 13], [timing.holdsAt, timing.holdsAt + 0.04]),
      ...thrownSparks(th, course.chest, th.count(30), [4, 12], [timing.cutAt, timing.cutAt + 0.03]),
    ];
  });
  for (const [index, spark] of sparks.entries()) drawSpark(drawn, spark, t, cell * 1.3, ramp, index, forward);
  return drawn;
}
