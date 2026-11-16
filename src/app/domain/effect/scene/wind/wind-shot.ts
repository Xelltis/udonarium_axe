import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { acrossOf, floorMark, haze, lightBall, type Point, smokePuff, starBurst } from '@axe/domain/effect/scene/parts';
import {
  alongWay,
  curlRibbon,
  debrisKindOf,
  debrisRibbon,
  halvesOf,
  layRibbons,
  scatter,
  smooth,
  streakRibbon,
  windPaintOf,
} from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A shot of wind: a knot of air that flies spinning and bursts. In flight it is a pale heart over its
 * own shadow with white coils wound round it, turning fast, the half of each behind the heart dark
 * and the half before it bright, a shred of air and thin streaks drawn out behind it and a leaf or
 * two caught in its wake. Where it lands it stands up no whirlwind: it bursts, a ring of wind racing
 * out level from the target, streaks thrown out round it on a turn, dust rolling out over the floor
 * under a ring of it, curls left turning, and leaves thrown up to fall and lie.
 */

/** How high over the foot of the target a shot of wind bursts, in cells. */
const BURSTS_AT_CELLS = 0.55;
/** How many coils are wound round the knot, and how many points each is drawn through. */
const COILS = 4;
const COIL_POINTS = 11;
/** How many streaks its burst throws out, and how many things it throws up, at the middle grade. */
const BURST_STREAKS = 14;
const BURST_DEBRIS = 9;
/** How many shreds of dust its burst tears off the floor. */
const BURST_SHREDS = 10;
/** How long its ring of wind takes to race out, and how far, in cells. */
const RING_S = 0.42;
const RING_CELLS = 2.5;
/** The dark the shadow of a shot of wind is taken towards, so that its white holds over a bright table. */
const SHEATHED = '#141b22';
/** How long the white of its burst lasts, in seconds. */
const FLASH_S = 0.09;
/** How long what the burst throws up lies where it comes down before it is gone, in seconds. */
const LIES_S = 0.25;

/** A knot of wind in flight: where it is, the way it flies and where it was, a share of its flight ago. */
export interface WindKnot {
  readonly at: Point;
  readonly way: Point;
  readonly cell: number;
  /** How far through its flight it is, and where it is at any share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  readonly seconds: number;
  readonly seed: number;
}

/** A knot of wind in flight: see the header. */
export function drawWindKnot(drawn: Staged, knot: WindKnot, ramp: readonly string[]): void {
  const { at, way, cell, seconds: t } = knot;
  const paint = windPaintOf(ramp);
  const forward = cell * 0.4;
  const { side, lift } = acrossOf(way);
  const salt = (knot.seed % 997) / 97;
  const tailRoot = alongWay(at, way, -cell * 1.7);
  const sheath = mixColor(paint.shadow, SHEATHED, 0.5);
  drawn.motes.push(
    flowingMote('wisp', tailRoot, way, cell * 1.15, cell * 2.1, t * 12, {
      color: sheath,
      alpha: 0.62,
      forward,
      variant: salt,
    }),
    flowingMote('wisp', tailRoot, way, cell * 0.78, cell * 1.9, t * 16 + 3, {
      color: mixColor(paint.edge, paint.pale, 0.6),
      core: '#ffffff',
      alpha: 0.82,
      forward,
      variant: salt + 2,
    }),
    haze(at, cell * 2, sheath, 0.72, forward),
    haze(at, cell * 1.2, paint.pale, 0.95, forward + 1),
    haze(at, cell * 0.58, '#ffffff', 1, forward + 2)
  );
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  for (let coil = 0; coil < COILS; coil++) {
    const points: Point[] = [];
    const about: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let point = 0; point < COIL_POINTS; point++) {
      const along = point / (COIL_POINTS - 1);
      const middle = alongWay(at, way, cell * (0.22 - 1.05 * (1 - along)));
      const turn = t * 24 + (coil / COILS) * Math.PI * 2 - (1 - along) * 4.4;
      const out = cell * (0.18 + 0.42 * Math.sin(Math.PI * (0.12 + 0.6 * along)) ** 0.8);
      about.push(middle);
      points.push({
        x: middle.x + (side.x * Math.cos(turn) + lift.x * Math.sin(turn)) * out,
        y: middle.y + (side.y * Math.cos(turn) + lift.y * Math.sin(turn)) * out,
        z: middle.z + (side.z * Math.cos(turn) + lift.z * Math.sin(turn)) * out,
      });
      widths.push(cell * 0.36 * along ** 0.6 * (1 - 0.6 * smooth(0.84, 1, along)));
      alphas.push(along ** 1.2);
    }
    const halves = halvesOf(
      { points, widths, alphas, color: paint.edge, core: '#ffffff', alpha: 1, blend: 'color', torn: 0.25 },
      about,
      paint.shadow,
      0.5
    );
    far.push(halves.far);
    near.push(halves.near);
  }
  layRibbons(drawn, far);
  for (let streak = 0; streak < 3; streak++) {
    const turn = streak * 2.1 + salt;
    const off = cell * 0.2;
    const aside = {
      x: (side.x * Math.cos(turn) + lift.x * Math.sin(turn)) * off,
      y: (side.y * Math.cos(turn) + lift.y * Math.sin(turn)) * off,
      z: (side.z * Math.cos(turn) + lift.z * Math.sin(turn)) * off,
    };
    const head = knot.pathAt(Math.max(0, knot.share - 0.03));
    const tail = knot.pathAt(Math.max(0, knot.share - 0.2 - 0.06 * streak));
    layRibbons(drawn, [
      streakRibbon(
        { x: tail.x + aside.x * 1.6, y: tail.y + aside.y * 1.6, z: tail.z + aside.z * 1.6 },
        { x: head.x + aside.x, y: head.y + aside.y, z: head.z + aside.z },
        cell * 0.06,
        0.8,
        paint,
        { side: lift, by: cell * 0.05, phase: t * 30 + streak }
      ),
    ]);
  }
  layRibbons(drawn, near);
  for (let leaf = 0; leaf < 2; leaf++) {
    const was = knot.pathAt(Math.max(0, knot.share - 0.1 - 0.09 * leaf));
    const turn = t * 17 + leaf * 3;
    layRibbons(drawn, [
      debrisRibbon({
        kind: 'leaf',
        at: {
          x: was.x + (side.x * Math.cos(turn) + lift.x * Math.sin(turn)) * cell * 0.3,
          y: was.y + (side.y * Math.cos(turn) + lift.y * Math.sin(turn)) * cell * 0.3,
          z: was.z + (side.z * Math.cos(turn) + lift.z * Math.sin(turn)) * cell * 0.3,
        },
        size: cell * 0.2,
        turn: turn * 0.8,
        tip: Math.sin(turn) * 0.8,
        alpha: Math.min(1, knot.share * 8),
        variant: leaf + knot.seed,
      }),
    ]);
  }
}

/** The burst of a shot of wind where it lands, on its own clock from the moment it lands: see the header. */
export function drawWindBurst(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const t = stage.seconds;
  if (t < 0) return drawn;
  const paint = windPaintOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * BURSTS_AT_CELLS };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.3;
  const salt = (stage.seed % 997) / 97;
  const density = stage.preset.gradeDensity;
  const sheath = mixColor(paint.shadow, SHEATHED, 0.55);
  if (t < 0.26) {
    const left = 1 - t / 0.26;
    drawn.motes.push(haze(heart, cell * 2.7, sheath, 0.55 * left, forward));
    drawn.motes.push(haze(heart, cell * (1.1 + 3.4 * t), paint.pale, 0.85 * left * left, forward + 1));
    if (t < 0.12) drawn.motes.push(haze(heart, cell * (0.6 + 3 * t), '#ffffff', 1 - t / 0.12, forward + 2));
  }
  if (t < FLASH_S) {
    const left = 1 - t / FLASH_S;
    const white = [
      lightBall(heart, cell * 1 * (0.7 + 0.3 * left), '#ffffff', left, forward + 3),
      ...starBurst(heart, cell * 3, paint.pale, t / FLASH_S, forward + 2, 8, salt),
    ];
    drawn.motes.push(...white.map((mote) => ({ ...mote, blend: 'color' as const })));
    drawn.floor.push(floorMark('disc', floor, cell * 1.5, 1, '#ffffff', 0.45 * left, 'light', 0));
  }
  if (t < RING_S) {
    const run = outCubic(t / RING_S);
    const left = 1 - (t / RING_S) ** 2;
    const radius = cell * (0.3 + RING_CELLS * run);
    const steps = 28;
    const points: Point[] = [];
    for (let step = 0; step <= steps; step++) {
      const turn = (step / steps) * Math.PI * 2 + t * 5;
      points.push({
        x: heart.x + Math.cos(turn) * radius,
        y: heart.y + Math.sin(turn) * radius,
        z: heart.z + Math.sin(turn * 3 + salt) * cell * 0.05,
      });
    }
    const wide = cell * (0.62 * (1 - t / RING_S) + 0.12);
    const widths = points.map(
      (_point, step) => wide * (0.55 + 0.45 * Math.sin((step / steps) * Math.PI * 6 + salt * 3 + t * 9))
    );
    layRibbons(drawn, [
      {
        points,
        widths: widths.map((width) => width * 1.7),
        color: sheath,
        alpha: 0.88 * left,
        blend: 'color',
        soft: 0.18,
        torn: 0.35,
        flowed: t * 6,
      },
      {
        points,
        widths,
        color: mixColor(paint.edge, paint.pale, 0.4),
        core: '#ffffff',
        alpha: left,
        blend: 'color',
        soft: 0.15,
        torn: 0.5,
        flowed: t * 10 + 4,
      },
    ]);
    drawn.floor.push(
      floorMark('ring', floor, radius * 0.9, 0.22 * (1 - run) + 0.04, paint.dust, 0.7 * left, 'color', 0),
      floorMark('ring', floor, radius * 0.84, 0.08 * (1 - run) + 0.02, '#ffffff', 0.5 * left, 'light', 0),
      floorMark('disc', floor, cell * 1.6, 1, paint.shadow, 0.3 * left, 'color', 0)
    );
  }
  const streaks = Math.round(BURST_STREAKS * Math.sqrt(density));
  const thrown = outCubic(within(t, 0, 0.36));
  const fading = 1 - within(t, 0.14, 0.36);
  if (fading > 0) {
    for (let streak = 0; streak < streaks; streak++) {
      const turn = ((streak + 0.6 * scatter(streak, salt + 1)) / streaks) * Math.PI * 2;
      const head = cell * (0.45 + (1.2 + 0.9 * scatter(streak, salt + 2)) * thrown);
      const tail = Math.max(cell * 0.15, head - cell * (0.5 + 0.7 * scatter(streak, salt + 3)));
      const high = cell * ((scatter(streak, salt + 4) - 0.4) * 0.8 + 0.5 * thrown * scatter(streak, salt + 5));
      const steps = 5;
      const points: Point[] = [];
      const widths: number[] = [];
      const alphas: number[] = [];
      for (let step = 0; step <= steps; step++) {
        const along = step / steps;
        const out = tail + (head - tail) * along;
        const round = turn + 0.9 * (along - 1) + 0.7 * thrown;
        points.push({
          x: heart.x + Math.cos(round) * out,
          y: heart.y + Math.sin(round) * out,
          z: Math.max(floor.z + cell * 0.05, heart.z + high * along),
        });
        widths.push(
          cell * (0.12 + 0.12 * scatter(streak, salt + 6)) * along ** 0.6 * (1 - 0.6 * smooth(0.8, 1, along))
        );
        alphas.push(along ** 1.3);
      }
      layRibbons(drawn, [
        { points, widths, alphas, color: paint.edge, core: '#ffffff', alpha: fading, blend: 'color' },
      ]);
    }
  }
  for (const pass of [0, 1] as const) {
    for (let shred = 0; shred < BURST_SHREDS; shred++) {
      const life = 0.4 + 0.2 * scatter(shred, salt + 41);
      if (t >= life) continue;
      const aged = t / life;
      const turn = ((shred + scatter(shred, salt + 42)) / BURST_SHREDS) * Math.PI * 2;
      const gone = cell * (0.25 + (1.1 + 0.6 * scatter(shred, salt + 43)) * (1 - Math.exp(-6 * t)));
      const root = {
        x: floor.x + Math.cos(turn) * gone,
        y: floor.y + Math.sin(turn) * gone,
        z: floor.z + cell * (0.08 + 0.3 * aged),
      };
      const heading = { x: Math.cos(turn) - Math.sin(turn) * 0.45, y: Math.sin(turn) + Math.cos(turn) * 0.45, z: 0.2 };
      const wide = cell * (0.34 + 0.4 * aged) * (pass === 0 ? 1.2 : 0.85);
      drawn.motes.push(
        flowingMote('wisp', root, heading, wide, wide * (2.6 - aged), t * 8 + shred * 1.7, {
          color: pass === 0 ? paint.dustDeep : paint.dust,
          core: pass === 0 ? undefined : mixColor(paint.dust, '#ffffff', 0.55),
          alpha: (pass === 0 ? 0.6 : 0.7) * Math.sin(Math.PI * Math.min(1, aged * 1.1 + 0.1)) ** 0.6,
          forward,
          variant: shred * 0.9,
        })
      );
    }
  }
  for (const pass of [0, 1] as const) {
    for (let puff = 0; puff < 10; puff++) {
      const life = 0.55 + 0.35 * scatter(puff, salt + 11);
      if (t >= life) continue;
      const aged = t / life;
      const turn = ((puff + scatter(puff, salt + 12)) / 10) * Math.PI * 2;
      const gone = cell * (0.4 + (1 + 0.9 * scatter(puff, salt + 13)) * (1 - Math.exp(-5 * t)));
      drawn.motes.push(
        smokePuff(
          {
            x: floor.x + Math.cos(turn) * gone,
            y: floor.y + Math.sin(turn) * gone,
            z: floor.z + cell * (0.16 + 0.35 * aged + (pass === 0 ? 0 : 0.1)),
          },
          cell * (0.45 + 0.6 * aged) * (pass === 0 ? 1 : 0.7),
          pass === 0 ? paint.dustDeep : paint.dust,
          0.7 * Math.min(1, aged * 8) * (1 - aged),
          forward
        )
      );
    }
  }
  for (let curl = 0; curl < 3; curl++) {
    const bornAt = 0.08 + 0.16 * scatter(curl, salt + 21);
    const life = 0.5 + 0.2 * scatter(curl, salt + 22);
    const age = t - bornAt;
    if (age < 0 || age >= life) continue;
    const aged = age / life;
    const hand = curl % 2 === 0 ? 1 : -1;
    const turn = ((curl + scatter(curl, salt + 23)) / 3) * Math.PI * 2;
    const out = cell * (1 + 0.6 * scatter(curl, salt + 24) + 0.5 * aged);
    const middle = {
      x: heart.x + Math.cos(turn) * out,
      y: heart.y + Math.sin(turn) * out,
      z: heart.z + cell * (scatter(curl, salt + 25) - 0.4) * 0.6,
    };
    const shown = Math.sin(Math.PI * aged) ** 0.7;
    const curled = curlRibbon(
      middle,
      cell * (0.22 + 0.26 * aged),
      hand * (9 * age - 5 * age * age) + curl * 2.3,
      cell * 0.1,
      shown,
      paint,
      hand
    );
    layRibbons(drawn, [
      {
        ...curled,
        widths: (curled.widths as number[]).map((width) => width * 2),
        color: paint.shadow,
        core: undefined,
        alpha: 0.38 * shown,
        soft: 0.5,
      },
      curled,
    ]);
  }
  const things = Math.round(BURST_DEBRIS * density);
  for (let thing = 0; thing < things; thing++) {
    const life = 0.55 + 0.35 * scatter(thing, salt + 31);
    if (t >= life + LIES_S) continue;
    const flying = Math.min(t, life);
    const flown = flying / life;
    const turn = ((thing + scatter(thing, salt + 32)) / things) * Math.PI * 2;
    const gone = cell * 0.4 + (cell * (3 + 4 * scatter(thing, salt + 33)) * (1 - Math.exp(-3 * flying))) / 3;
    const high = cell * (0.08 + (0.6 + 0.9 * scatter(thing, salt + 34)) * 4 * flown ** 0.6 * (1 - flown ** 0.6));
    const kind = debrisKindOf(thing);
    const lying = t >= life;
    layRibbons(drawn, [
      debrisRibbon({
        kind,
        at: { x: floor.x + Math.cos(turn) * gone, y: floor.y + Math.sin(turn) * gone, z: floor.z + high },
        size: cell * (kind === 'stone' ? 0.1 : 0.17 + 0.1 * scatter(thing, salt + 35)),
        turn: lying ? thing * 1.3 : flying * (9 + 8 * scatter(thing, salt + 36)) + thing,
        tip: lying ? 0 : Math.sin(flying * 13 + thing) * 0.9,
        alpha: Math.min(1, t * 14) * (1 - within(t, life + LIES_S * 0.3, life + LIES_S)),
        variant: scatter(thing, salt + 37) * 8,
      }),
    ]);
  }
  return drawn;
}
