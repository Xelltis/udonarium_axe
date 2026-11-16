import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, haze, lightBall, type Point, smokePuff, starBurst } from '@axe/domain/effect/scene/parts';
import {
  alongWay,
  curlRibbon,
  debrisKindOf,
  debrisRibbon,
  layRibbons,
  scatter,
  smooth,
  streakRibbon,
  type WindPaint,
  windPaintOf,
} from '@axe/domain/effect/scene/wind/wind-parts';
import { gustTimingOf } from '@axe/domain/effect/wind-looks';

/*
 * A gust: one blast of wind thrown from its caster onto the target. Dust is drawn in to the caster's
 * feet for an instant; then a wall of wind crosses to the target, white crescents at its front one
 * behind another, streaks of speed all through it and a band of dust torn off the floor under it. It
 * breaks on the target, parting round it in two arcs and a burst of dust at its feet, and runs on a
 * little way; curls of wind are left turning where it passed, and the leaves and grit it swept up
 * whirl downwind, sink and lie. Cast from no one, it blows in from a fixed bearing.
 */

/** How far before its caster a gust starts, how far past its target it runs on, and how wide its wall is to each side, in cells. */
const STARTS_CELLS = 0.35;
const RUNS_ON_CELLS = 1.7;
const HALF_WIDE_CELLS = 1.45;
/** How long the wall takes to run on past the target and to fade, in seconds. */
const RUNS_ON_S = 0.24;
/** How far behind one another the crescents of the wall come, in cells, how large and how strong each is, and how far it is tipped up from level, in radians. */
const FRONTS = [
  { behind: 0, size: 1, alpha: 1, tipped: -0.45 },
  { behind: 0.7, size: 0.85, alpha: 0.85, tipped: 1.2 },
  { behind: 1.35, size: 0.66, alpha: 0.65, tipped: 0.3 },
] as const;
/** How many streaks of speed run in the wall, and how many things it sweeps up at the middle grade. */
const STREAKS = 24;
const SWEPT = 44;
/** How long what is swept up lies where it comes down before it is gone, in seconds. */
const LIES_S = 0.25;
/** How long after its playback the last of what a gust swept up has come down and gone, in seconds. */
const SETTLED_BY_S = 0.8;
/** How long a shred of dust torn off the floor lasts, in seconds. */
const DUST_S = 0.55;
/** The dark the shadow of a gust is taken towards, so that its white holds over a bright table. */
const SHEATHED = '#141b22';
/** How long the white of the wall striking the target lasts, in seconds. */
const STRIKE_FLASH_S = 0.1;

/** Where a gust blows and how far along it is. */
interface Blast {
  readonly cell: number;
  readonly seconds: number;
  /** Where it starts, on the floor before its caster, the way it blows and the way across it, both level. */
  readonly start: Point;
  readonly way: Point;
  readonly side: Point;
  /** How far it is to the target from where it starts, in table pixels. */
  readonly toTarget: number;
  readonly thrownAt: number;
  readonly strikesAt: number;
  /** How far its front has got from where it starts, in table pixels. */
  readonly front: number;
  /** How much of the wall is left: whole until it strikes, and gone as it runs on. */
  readonly blowing: number;
  /** When its front passes a point so far along, in seconds. */
  passesAt(along: number): number;
  /** A point so far along it, so far to the side and so high over the floor. */
  at(along: number, aside: number, high: number): Point;
}

function blastOf(stage: Stage): Blast {
  const { cell } = stage;
  const t = stage.seconds;
  const { thrownAt, strikesAt } = gustTimingOf(stage.duration);
  const blownFrom = stage.origin ?? { x: stage.x - cell * 4, y: stage.y + cell * 1.2 };
  const dx = stage.x - blownFrom.x;
  const dy = stage.y - blownFrom.y;
  const far = Math.hypot(dx, dy);
  const way = far > cell * 0.5 ? { x: dx / far, y: dy / far, z: 0 } : { x: 0.96, y: -0.28, z: 0 };
  const from = far > cell * 0.5 ? blownFrom : { x: stage.x - way.x * cell * 4, y: stage.y - way.y * cell * 4 };
  const toTarget = Math.max(cell, Math.hypot(stage.x - from.x, stage.y - from.y) - cell * STARTS_CELLS);
  const start = { x: stage.x - way.x * toTarget, y: stage.y - way.y * toTarget, z: stage.groundZ };
  const side = { x: -way.y, y: way.x, z: 0 };
  const crossing = Math.max(strikesAt - thrownAt, 0.01);
  const front =
    t < strikesAt
      ? toTarget * within(t, thrownAt, strikesAt)
      : toTarget + cell * RUNS_ON_CELLS * outCubic(within(t, strikesAt, strikesAt + RUNS_ON_S));
  return {
    cell,
    seconds: t,
    start,
    way,
    side,
    toTarget,
    thrownAt,
    strikesAt,
    front,
    blowing: t < thrownAt ? 0 : 1 - within(t, strikesAt + 0.06, strikesAt + RUNS_ON_S + 0.08),
    passesAt: (along) =>
      along <= toTarget
        ? thrownAt + (along / toTarget) * crossing
        : strikesAt + RUNS_ON_S * 0.5 * Math.min(1, (along - toTarget) / (cell * RUNS_ON_CELLS)),
    at: (along, aside, high) => ({
      x: start.x + way.x * along + side.x * aside,
      y: start.y + way.y * along + side.y * aside,
      z: stage.groundZ + high,
    }),
  };
}

/** A gust on one target: see the header. */
export function drawGust(stage: Stage): Staged {
  const drawn = nothingStaged();
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const paint = windPaintOf(ramp);
  const blast = blastOf(stage);
  const salt = (stage.seed % 997) / 97;
  const ends = stage.duration + SETTLED_BY_S;
  gathering(drawn, blast, paint, salt);
  tornDust(drawn, blast, paint, salt);
  if (blast.blowing > 0) {
    wallBody(drawn, blast, paint, stage.seed);
    crescents(drawn, blast, paint);
    speedStreaks(drawn, blast, paint, salt);
  }
  breaking(drawn, blast, paint, salt);
  swept(drawn, blast, Math.round(SWEPT * stage.preset.gradeDensity), salt, ends);
  return drawn;
}

/** The instant before it is thrown: dust drawn in along the floor to the caster's feet, and a ring closing on them. */
function gathering(drawn: Staged, blast: Blast, paint: WindPaint, salt: number): void {
  const { cell, seconds: t } = blast;
  const gathered = within(t, 0, blast.thrownAt);
  const shown = Math.min(1, gathered * 3) * (1 - within(t, blast.thrownAt, blast.thrownAt + 0.08));
  if (shown <= 0) return;
  const feet = blast.at(-cell * STARTS_CELLS, 0, 0);
  drawn.floor.push(floorMark('ring', feet, cell * (1.5 - 1.05 * gathered), 0.22, paint.dust, 0.55 * shown, 'color', 0));
  for (let wisp = 0; wisp < 10; wisp++) {
    const turn = (wisp / 10) * Math.PI * 2 + salt;
    const out = cell * (1.5 - 0.9 * gathered) * (0.75 + 0.5 * scatter(wisp, salt + 1));
    const root = {
      x: feet.x + Math.cos(turn) * out,
      y: feet.y + Math.sin(turn) * out,
      z: feet.z + cell * 0.12,
    };
    const heading = { x: -Math.cos(turn) - Math.sin(turn) * 0.5, y: -Math.sin(turn) + Math.cos(turn) * 0.5, z: 0.15 };
    drawn.motes.push(
      flowingMote('wisp', root, heading, cell * 0.3, cell * 0.85, t * 9 + wisp, {
        color: wisp % 2 ? paint.dust : paint.dustDeep,
        core: wisp % 2 ? '#ffffff' : undefined,
        alpha: 0.6 * shown,
        forward: cell * 0.2,
        variant: wisp * 1.1,
      })
    );
  }
}

/** The body of the wall: a slug of pale air behind its front, widening from the caster, over its own shadow. */
function wallBody(drawn: Staged, blast: Blast, paint: WindPaint, seed: number): void {
  const { cell, seconds: t } = blast;
  const tail = Math.max(-cell * 0.2, blast.front - cell * 3.4);
  const long = blast.front - tail + cell * 0.35;
  if (long < cell * 0.4) return;
  const wide = Math.min(cell * HALF_WIDE_CELLS * 2.1, long / 1.2);
  const root = blast.at(tail, 0, cell * 0.6);
  const flowed = t * 14;
  const sheet = (color: string, core: string | undefined, alpha: number, grown: number, index: number) =>
    drawn.motes.push({
      ...flowingMote('gust', root, blast.way, wide * grown, long, flowed + index * 3.7, {
        color,
        core,
        alpha: alpha * blast.blowing,
        forward: cell * 0.2,
        variant: (seed % 13) + index * 1.9,
      }),
      exactDepth: true,
    });
  sheet(mixColor(paint.shadow, SHEATHED, 0.45), undefined, 0.55, 1.25, 0);
  sheet(mixColor(paint.edge, paint.pale, 0.5), '#ffffff', 0.62, 1, 1);
}

/**
 * The crescents at the front of the wall, one behind another: each a bow of white across the way it
 * blows, thick in its middle and drawn to a point at both ends, bowed back at them and torn at its
 * edges, over a wider shadow. Each is tipped its own way, so they cut across one another.
 */
function crescents(drawn: Staged, blast: Blast, paint: WindPaint): void {
  const { cell } = blast;
  const steps = 12;
  for (const front of FRONTS) {
    const along = blast.front - front.behind * cell;
    if (along < cell * 0.15) continue;
    const grown = smooth(0, cell * 1.6, along) * front.size;
    const reach = cell * HALF_WIDE_CELLS * grown;
    const level = Math.cos(front.tipped);
    const upright = Math.sin(front.tipped);
    const middle = cell * 0.3 + reach * Math.abs(upright);
    const points: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let step = 0; step <= steps; step++) {
      const across = (step / steps) * 2 - 1;
      const bowed = (1 - Math.cos(across * 1.35)) * cell * 1.15 * grown;
      const thick = Math.cos((across * Math.PI) / 2);
      points.push(
        blast.at(along - bowed, across * reach * level, Math.max(cell * 0.06, middle + across * reach * upright))
      );
      widths.push(cell * 1.0 * grown * thick ** 1.1);
      alphas.push(Math.min(1, thick * 3));
    }
    const shown = front.alpha * blast.blowing;
    layRibbons(drawn, [
      {
        points: points.map((point) => alongWay(point, blast.way, -cell * 0.12)),
        widths: widths.map((width) => width * 1.55),
        alphas,
        color: mixColor(paint.shadow, SHEATHED, 0.55),
        alpha: 0.92 * shown,
        blend: 'color',
        soft: 0.16,
        torn: 0.3,
        flowed: blast.seconds * 6,
      },
      {
        points,
        widths,
        alphas,
        color: mixColor(paint.edge, paint.pale, 0.5),
        core: '#ffffff',
        alpha: shown,
        blend: 'color',
        soft: 0.18,
        torn: 0.45,
        flowed: blast.seconds * 9 + front.behind * 7,
      },
    ]);
  }
}

/** The streaks of speed all through the wall: each runs with it at its own height, a little ahead of the front or behind it. */
function speedStreaks(drawn: Staged, blast: Blast, paint: WindPaint, salt: number): void {
  const { cell } = blast;
  const ribbons: EffectRibbon[] = [];
  for (let streak = 0; streak < STREAKS; streak++) {
    const head = blast.front - cell * (-0.35 + 2.7 * scatter(streak, salt + 11));
    if (head < cell * 0.2) continue;
    const long = cell * (0.9 + 1.8 * scatter(streak, salt + 12));
    const tail = Math.max(0, head - long);
    const aside = (scatter(streak, salt + 13) * 2 - 1) * cell * HALF_WIDE_CELLS * 1.1 * smooth(0, cell * 1.6, head);
    const high = cell * (0.08 + 1.45 * scatter(streak, salt + 14) ** 1.3);
    const lifts = scatter(streak, salt + 15) > 0.5;
    ribbons.push(
      streakRibbon(
        blast.at(tail, aside * 0.92, high),
        blast.at(head, aside, high),
        cell * (0.08 + 0.11 * scatter(streak, salt + 16)),
        blast.blowing * (0.6 + 0.4 * scatter(streak, salt + 17)),
        paint,
        { side: lifts ? { x: 0, y: 0, z: 1 } : blast.side, by: cell * 0.09, phase: streak * 1.7 + blast.seconds * 20 }
      )
    );
  }
  layRibbons(drawn, ribbons);
}

/**
 * The band of dust the wall tears off the floor: a shred at each place along its way as its front
 * passes, dragged on downwind as it swells and thins, laid dark and then pale; grit skipping on with
 * it; and the wall's shadow running over the floor under it.
 */
function tornDust(drawn: Staged, blast: Blast, paint: WindPaint, salt: number): void {
  const { cell, seconds: t } = blast;
  const reach = blast.toTarget + cell * RUNS_ON_CELLS * 0.8;
  const count = Math.max(10, Math.min(30, Math.round((reach / cell) * 2.2)));
  const forward = cell * 0.2;
  if (blast.blowing > 0)
    drawn.floor.push(
      floorMark(
        'disc',
        blast.at(blast.front - cell * 0.6, 0, 0),
        cell * 1.5,
        1,
        paint.shadow,
        0.3 * blast.blowing * smooth(0, cell, blast.front),
        'color',
        0
      )
    );
  for (const pass of [0, 1] as const) {
    for (let place = 0; place < count; place++) {
      const along = ((place + scatter(place, salt + 21)) / count) * reach;
      const age = t - blast.passesAt(along);
      if (age < 0 || age >= DUST_S) continue;
      const aged = age / DUST_S;
      const aside = (scatter(place, salt + 22) * 2 - 1) * cell * HALF_WIDE_CELLS * 0.85 * smooth(0, cell * 1.6, along);
      const dragged = (cell * 1.5 * (1 - Math.exp(-5 * age))) / 1;
      const root = blast.at(along + dragged - cell * 0.5, aside, cell * (0.06 + 0.35 * aged));
      const wide = cell * (0.4 + 0.55 * aged) * (pass === 0 ? 1.2 : 0.85);
      drawn.motes.push(
        flowingMote('wisp', root, { ...blast.way, z: 0.22 }, wide, wide * (2.9 - 1.3 * aged), t * 7 + place * 1.9, {
          color: pass === 0 ? paint.dustDeep : paint.dust,
          core: pass === 0 ? undefined : mixColor(paint.dust, '#ffffff', 0.55),
          alpha: (pass === 0 ? 0.65 : 0.75) * Math.sin(Math.PI * Math.min(1, aged * 1.1 + 0.08)) ** 0.6,
          forward,
          variant: place * 0.8,
        })
      );
      if (pass === 1 && place % 2 === 0) {
        const skipped = cell * (2.2 + 2 * scatter(place, salt + 23)) * age;
        const hop = Math.abs(Math.sin(age * (9 + 6 * scatter(place, salt + 24))));
        drawn.motes.push({
          ...blast.at(along + skipped, aside * 1.1, cell * (0.05 + 0.3 * hop * (1 - aged))),
          size: cell * (0.06 + 0.04 * scatter(place, salt + 25)),
          color: place % 3 === 0 ? '#4b423d' : paint.dustDeep,
          alpha: 1 - aged ** 2,
          blend: 'color',
          shape: 'chunk',
          spin: age * 20 + place,
          variant: place,
          forward,
        });
      }
    }
  }
}

/**
 * The wall breaking on the target: a pale flash of air over its shadow, two arcs of wind parting
 * round it, dust bursting from its feet downwind and to its sides, a ring of it running out over the
 * floor, and curls of wind left turning behind it.
 */
function breaking(drawn: Staged, blast: Blast, paint: WindPaint, salt: number): void {
  const { cell } = blast;
  const since = blast.seconds - blast.strikesAt;
  if (since < 0) return;
  const forward = cell * 0.25;
  const struck = blast.at(blast.toTarget, 0, cell * 0.55);
  const feet = blast.at(blast.toTarget, 0, 0);
  if (since < 0.22) {
    const left = 1 - since / 0.22;
    drawn.motes.push(haze(struck, cell * 2.8, mixColor(paint.shadow, SHEATHED, 0.5), 0.6 * left, forward));
    drawn.motes.push(haze(struck, cell * (1.3 + since * 4), '#ffffff', 0.9 * left * left, forward + 1));
  }
  if (since < STRIKE_FLASH_S) {
    const left = 1 - since / STRIKE_FLASH_S;
    const white = [
      lightBall(struck, cell * 1.05 * (0.7 + 0.3 * left), '#ffffff', left, forward + 2),
      ...starBurst(struck, cell * 3.2, paint.pale, since / STRIKE_FLASH_S, forward + 1, 8, salt),
    ];
    drawn.motes.push(...white.map((mote) => ({ ...mote, blend: 'color' as const })));
    drawn.floor.push(floorMark('disc', feet, cell * 1.6, 1, '#ffffff', 0.45 * left, 'light', 0));
  }
  if (since < 0.4) {
    const run = outCubic(since / 0.4);
    const radius = cell * (0.4 + 1.7 * run);
    drawn.floor.push(
      floorMark('ring', feet, radius * 1.04, 0.3 * (1 - run) + 0.05, paint.dustDeep, 0.55 * (1 - run), 'color', 0),
      floorMark('ring', feet, radius, 0.24 * (1 - run) + 0.04, paint.dust, 0.7 * (1 - run), 'color', 0)
    );
    drawn.floor.push(
      floorMark('ring', feet, radius * 0.94, 0.1 * (1 - run) + 0.02, '#ffffff', 0.5 * (1 - run), 'light', 0)
    );
  }
  if (since < 0.34) {
    const upwind = Math.atan2(-blast.way.y, -blast.way.x);
    const head = Math.min(2.7, 0.5 + 9 * since);
    const tail = Math.max(0.15, head - 1.7);
    const radius = cell * (0.75 + 1.6 * since);
    const left = 1 - within(since, 0.14, 0.34);
    for (const hand of [1, -1] as const) {
      const steps = 9;
      const points: Point[] = [];
      const widths: number[] = [];
      const alphas: number[] = [];
      for (let step = 0; step <= steps; step++) {
        const along = step / steps;
        const turn = upwind + hand * (tail + (head - tail) * along);
        points.push({
          x: feet.x + Math.cos(turn) * radius,
          y: feet.y + Math.sin(turn) * radius,
          z: feet.z + cell * (0.5 + 0.25 * along),
        });
        widths.push(cell * 0.42 * along ** 0.6 * (1 - 0.6 * smooth(0.8, 1, along)));
        alphas.push(along ** 1.2);
      }
      layRibbons(drawn, [
        {
          points,
          widths: widths.map((width) => width * 1.7),
          alphas,
          color: mixColor(paint.shadow, SHEATHED, 0.5),
          alpha: 0.85 * left,
          blend: 'color',
          soft: 0.2,
        },
        {
          points,
          widths,
          alphas,
          color: paint.edge,
          core: '#ffffff',
          alpha: left,
          blend: 'color',
          torn: 0.45,
          flowed: since * 8,
        },
      ]);
    }
  }
  for (const pass of [0, 1] as const) {
    for (let puff = 0; puff < 9; puff++) {
      const life = 0.6 + 0.3 * scatter(puff, salt + 31);
      if (since >= life) continue;
      const aged = since / life;
      const spread = (scatter(puff, salt + 32) * 2 - 1) * 1.35;
      const gone = cell * (0.5 + 1.7 * scatter(puff, salt + 33)) * (1 - Math.exp(-5 * since));
      const at = {
        x: feet.x + (blast.way.x * Math.cos(spread) + blast.side.x * Math.sin(spread)) * gone,
        y: feet.y + (blast.way.y * Math.cos(spread) + blast.side.y * Math.sin(spread)) * gone,
        z: feet.z + cell * (0.18 + 0.5 * aged),
      };
      drawn.motes.push(
        smokePuff(
          pass === 0 ? at : { ...at, z: at.z + cell * 0.12 },
          cell * (0.5 + 0.7 * aged) * (pass === 0 ? 1 : 0.7),
          pass === 0 ? paint.dustDeep : paint.dust,
          0.68 * Math.min(1, aged * 8) * (1 - aged),
          forward
        )
      );
    }
  }
  for (let curl = 0; curl < 4; curl++) {
    const bornAt = 0.04 + 0.2 * scatter(curl, salt + 34);
    const life = 0.55 + 0.2 * scatter(curl, salt + 35);
    const age = since - bornAt;
    if (age < 0 || age >= life) continue;
    const aged = age / life;
    const hand = curl % 2 === 0 ? 1 : -1;
    const middle = blast.at(
      blast.toTarget + cell * (0.7 + 1.5 * scatter(curl, salt + 36) + 0.8 * aged),
      hand * cell * (0.45 + 0.7 * scatter(curl, salt + 37)),
      cell * (0.3 + 0.7 * scatter(curl, salt + 38))
    );
    const radius = cell * (0.32 + 0.34 * aged);
    const turned = hand * (9 * age - 5 * age * age) + curl * 1.9;
    const shown = Math.sin(Math.PI * aged) ** 0.7;
    const curled = curlRibbon(middle, radius, turned, cell * 0.15, shown, paint, hand);
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
}

/**
 * What the gust sweeps up: leaves, twigs and grit, most of them from about the target as the wall
 * strikes and the rest picked up along its way. Each is thrown downwind, whirls as it is slowed,
 * sinks, and lies a moment where it comes down.
 */
function swept(drawn: Staged, blast: Blast, count: number, salt: number, ends: number): void {
  const { cell, seconds: t } = blast;
  const ribbons: EffectRibbon[] = [];
  for (let thing = 0; thing < count; thing++) {
    const along = scatter(thing, salt + 41) < 0.7 ? blast.toTarget : blast.toTarget * scatter(thing, salt + 42);
    const bornAt = blast.passesAt(along) + 0.07 * scatter(thing, salt + 43);
    const life = Math.max(0.2, Math.min(0.7 + 0.35 * scatter(thing, salt + 44), ends - bornAt - LIES_S - 0.02));
    const age = t - bornAt;
    if (age < 0 || age >= life + LIES_S) continue;
    const flying = Math.min(age, life);
    const flown = flying / life;
    const hand = thing % 2 === 0 ? 1 : -1;
    const gone = (cell * (4 + 5 * scatter(thing, salt + 45)) * (1 - Math.exp(-3.2 * flying))) / 3.2;
    const spread = (scatter(thing, salt + 46) * 2 - 1) * cell * 1.3 * (1 - Math.exp(-3 * flying));
    const whirl = cell * (0.18 + 0.3 * scatter(thing, salt + 47)) * Math.sin(Math.PI * Math.min(1, flown * 1.25));
    const turned = hand * (11 * flying * Math.exp(-1.1 * flying) + 2 * flying) + thing * 2.4;
    const climbed = flown ** 0.6;
    const high = cell * (0.1 + (0.5 + 1.1 * scatter(thing, salt + 48)) * 4 * climbed * (1 - climbed));
    const from = (scatter(thing, salt + 49) * 2 - 1) * cell * 0.6;
    const at = blast.at(along + gone + Math.cos(turned) * whirl, from + spread + Math.sin(turned) * whirl, high);
    const kind = debrisKindOf(thing);
    const lying = age >= life;
    ribbons.push(
      debrisRibbon({
        kind,
        at,
        size:
          cell * (kind === 'stone' ? 0.1 + 0.05 * scatter(thing, salt + 50) : 0.26 + 0.16 * scatter(thing, salt + 50)),
        turn: lying ? thing * 1.3 : flying * (9 + 8 * scatter(thing, salt + 51)) + thing,
        tip: lying ? 0 : Math.sin(flying * 13 + thing) * 0.9,
        alpha: Math.min(1, age * 14) * (1 - within(age, life + LIES_S * 0.3, life + LIES_S)),
        variant: scatter(thing, salt + 52) * 8,
      })
    );
  }
  layRibbons(drawn, ribbons);
}
