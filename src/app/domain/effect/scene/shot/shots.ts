import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { drawCloud, dustColumn, rollingDust } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  acrossOf,
  ball,
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  lerpPoint,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
  wayBetween,
} from '@axe/domain/effect/scene/parts';
import { arrowBody, missileBody, stuckArrow } from '@axe/domain/effect/scene/shot/bodies';
import { ARROW_RAIN_FALL, arrowRainShots, projectileTiming } from '@axe/domain/effect/timeline/flight-timing';

/*
 * What is shot from the caster at a target: a magic bolt glowing with a tail of light, an arrow with
 * its shaft and a pale streak, a bullet's tracer, a crescent of a blade flying, a blaster's bolt, a
 * sniper's line drawn at once, a missile trailing smoke on its arc and a cruise missile weaving; guns
 * flash at the muzzle. Each lands with the look its preset gives for landing. A lobbed shot climbs
 * high and falls trailing smoke; a rain of arrows is loosed up into the sky and falls over the target.
 */

/** How long a shot lingers after its playback, for the look it lands with to clear, in seconds. */
const LINGER_S = 1.8;
/** How high a shot leaves its caster, in cells of the table, and how high it strikes the target. */
const STRIKES_AT = 0.55;
/** The looks that flash at the muzzle as they are fired. */
const GUNS = new Set(['bullet', 'blaster', 'tracer']);

/** How the look a shot lands with is drawn. */
export type LandingLook = (stage: Stage) => Staged;

/** A shot from the caster, landing with the look `landWith` draws for its preset. */
export function projectileWith(landWith: LandingLook): Choreography {
  return { lingerS: LINGER_S, draw: (stage) => drawProjectile(stage, landWith) };
}

/** A lobbed shot from the caster, landing with the look `landWith` draws for its preset. */
export function ballisticWith(landWith: LandingLook): Choreography {
  return { lingerS: LINGER_S, draw: (stage) => drawBallistic(stage, landWith) };
}

/** Where a shot leaves its caster, or above and behind the target for one cast from nowhere. */
function originOf(stage: Stage): Point {
  return stage.origin ?? { x: stage.x - stage.cell * 3, y: stage.y + stage.cell * 3, z: stage.z + stage.cell * 2 };
}

/** Adds what a landing look draws into what is drawn. */
function addInto(drawn: Staged, landed: Staged): void {
  drawn.motes.push(...landed.motes);
  drawn.ribbons.push(...landed.ribbons);
  drawn.floor.push(...landed.floor);
  drawn.lights.push(...landed.lights);
}

/** The landing of one shot, on its own clock from the moment it lands, as large as a shot of a burst is. */
function landing(
  stage: Stage,
  landWith: LandingLook,
  landsAt: number,
  shot: number,
  shots: number,
  spot: { readonly x: number; readonly y: number } = stage
): Staged {
  return landWith({
    ...stage,
    x: spot.x,
    y: spot.y,
    seconds: stage.seconds - landsAt,
    duration: Math.max(0.6, stage.duration - landsAt),
    blowsAt: [0],
    seed: stage.seed + shot * 101,
    cell: stage.cell * (shots > 1 ? 0.85 : 1.1),
  });
}

function drawProjectile(stage: Stage, landWith: LandingLook): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const style = stage.preset.projectileLook;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const from = originOf(stage);
  const to = { x: stage.x, y: stage.y, z: stage.z + cell * STRIKES_AT };
  const { length } = wayBetween(from, to);
  const timing = projectileTiming(stage.preset);
  const forward = cell * 0.4;
  const weave = (stage.seed % 2 === 0 ? 1 : -1) * length;

  timing.shots.forEach((shot, index) => {
    const launch = shot.launch * duration;
    const lands = shot.land * duration;
    const flies = Math.max(lands - launch, 0.02);
    const share = (t - launch) / flies;
    const course = courseOf(style, from, to, cell, length, index, timing.shots.length, weave);
    const pathAt = course.at;
    if (GUNS.has(style) && t >= launch && t < launch + 0.09)
      drawMuzzle(drawn, from, cell, ramp, (t - launch) / 0.09, forward);
    if (share >= 0 && share < 1) {
      const at = pathAt(share);
      const ahead = pathAt(Math.min(1, share + 0.02));
      const { way } = wayBetween(at, ahead);
      const speed = length / flies;
      drawFlying(drawn, style, at, way, speed, cell, ramp, share, pathAt, forward, stage.seed + index);
    }
    if (style === 'tracer' && t >= launch && t < launch + 0.3)
      drawTracerLine(drawn, from, to, cell, ramp, (t - launch) / 0.3);
    if (t >= lands) addInto(drawn, landing(stage, landWith, lands, index, timing.shots.length, course.lands));
  });
  return drawn;
}

/** Each shot of a volley strays to its own side and lands a little apart, so they read as many, not one. */
const SWERVE_SIDE = [1, -1, 0.55, -0.55, 1.4, -1.4, 0.8, -0.8];

/**
 * The way one shot of a volley flies, and where it lands. A shot of light or a bullet flies straight,
 * a burst of them a little apart where they strike. A missile is kicked up and out to its own side
 * as it leaves, then curves in to strike, each of a volley on its own course and landing apart; a
 * cruise missile climbs higher, swings wider and weaves as it closes.
 */
function courseOf(
  style: string,
  from: Point,
  to: Point,
  cell: number,
  length: number,
  index: number,
  shots: number,
  weave: number
): { at: (along: number) => Point; lands: Point } {
  const { way, side } = (() => {
    const between = wayBetween(from, to);
    return { way: between.way, side: acrossOf(between.way).side };
  })();
  const sideOf = SWERVE_SIDE[index % SWERVE_SIDE.length];
  // Every shot after the first of a burst lands a little apart from the others.
  const apart = shots > 1 ? cell * 0.35 : 0;
  const spread = {
    x: side.x * sideOf * apart + way.x * (((index * 37) % 7) / 7 - 0.5) * apart,
    y: side.y * sideOf * apart + way.y * (((index * 37) % 7) / 7 - 0.5) * apart,
  };
  const lands = { x: to.x + spread.x, y: to.y + spread.y, z: to.z };
  if (style !== 'missile' && style !== 'cruise') {
    return { at: (along) => lerpPoint(from, lands, along), lands };
  }
  const cruise = style === 'cruise';
  const swerve = sideOf * Math.max(cell * (cruise ? 2.4 : 1.2), length * (cruise ? 0.35 : 0.22));
  const climb =
    Math.max(cell * (cruise ? 3 : 1.6), length * (cruise ? 0.45 : 0.28)) * (0.75 + 0.5 * (((index * 53) % 11) / 11));
  // Kicked up and out to its side as it leaves, then curving in on the target from above.
  const kick = {
    x: from.x + side.x * swerve + way.x * length * 0.15,
    y: from.y + side.y * swerve + way.y * length * 0.15,
    z: from.z + climb,
  };
  const dive = {
    x: lands.x + side.x * swerve * 0.35 - way.x * length * 0.2,
    y: lands.y + side.y * swerve * 0.35 - way.y * length * 0.2,
    z: lands.z + climb * 0.8,
  };
  return {
    at: (along) => {
      const u = 1 - along;
      const a = u * u * u;
      const b = 3 * u * u * along;
      const c = 3 * u * along * along;
      const d = along * along * along;
      const point = {
        x: a * from.x + b * kick.x + c * dive.x + d * lands.x,
        y: a * from.y + b * kick.y + c * dive.y + d * lands.y,
        z: a * from.z + b * kick.z + c * dive.z + d * lands.z,
      };
      if (!cruise) return point;
      const sway = Math.sin(Math.PI * 3 * along) * Math.sin(Math.PI * along) * weave * 0.12;
      return { x: point.x + side.x * sway, y: point.y + side.y * sway, z: point.z };
    },
    lands,
  };
}

/** A shot in flight, drawn as its look is. */
function drawFlying(
  drawn: Staged,
  style: string,
  at: Point,
  way: Point,
  speed: number,
  cell: number,
  ramp: readonly string[],
  share: number,
  pathAt: (along: number) => Point,
  forward: number,
  seed: number
): void {
  const behind = (reach: number): Point => ({
    x: at.x - way.x * reach,
    y: at.y - way.y * reach,
    z: at.z - way.z * reach,
  });
  const velocity = { x: way.x * speed, y: way.y * speed, z: way.z * speed };
  switch (style) {
    case 'arrow':
      drawn.ribbons.push(...arrowBody(at, way, cell, ramp));
      return;
    case 'bullet':
      drawn.motes.push(glow(at, cell * 0.5, hueOf(ramp), 0.6, forward));
      drawn.motes.push({
        ...glow(at, cell * 0.12, ramp[5], 1, forward),
        shape: 'spark',
        velocity,
        trail: (cell * 1.6) / speed,
      });
      return;
    case 'crescent':
      drawn.motes.push(haze(at, cell * 1.6, hueOf(ramp), 0.35, forward));
      drawn.ribbons.push(...flyingCrescent(at, way, cell * 1.4, ramp));
      drawn.motes.push(glow(at, cell * 1.4, ramp[3], 0.5, forward));
      return;
    case 'blaster':
      drawn.ribbons.push({
        points: [behind(cell * 0.9), behind(cell * 0.45), at],
        widths: [0, cell * 0.36, cell * 0.2],
        color: hueOf(ramp),
        core: '#ffffff',
        alpha: 1,
        blend: 'light',
      });
      drawn.motes.push(glow(at, cell * 0.9, hueOf(ramp), 0.7, forward));
      return;
    case 'tracer':
      drawn.motes.push(glow(at, cell * 0.6, hueOf(ramp), 0.6, forward));
      drawn.motes.push({
        ...glow(at, cell * 0.14, '#ffffff', 1, forward),
        shape: 'spark',
        velocity,
        trail: (cell * 1.4) / speed,
      });
      return;
    case 'missile':
    case 'cruise': {
      // A streak of its colour along the way it has come, and its trail of smoke, left where it was
      // and swelling as it thins.
      const streak = Array.from({ length: 8 }, (_unused, index) => pathAt(Math.max(0, share - (7 - index) * 0.025)));
      const shares = streak.map((_point, index) => index / 7);
      drawn.ribbons.push({
        points: streak,
        widths: shares.map((part) => cell * 0.22 * part),
        color: hueOf(ramp),
        core: ramp[4],
        alpha: 0.85,
        alphas: shares,
        blend: 'light',
      });
      for (let back = 14; back >= 1; back--) {
        const was = share - back * 0.03;
        if (was < 0) continue;
        const age = back / 14;
        drawn.motes.push(smokePuff(pathAt(was), cell * (0.24 + age * 0.45), '#cfc8c2', (1 - age) * 0.6, forward));
      }
      // The missile itself: body, nose, fins and the flame of its motor.
      const missile = missileBody(at, way, cell, ramp, velocity, speed, forward, share * 90 + seed);
      drawn.ribbons.push(...missile.ribbons);
      drawn.motes.push(...missile.motes);
      return;
    }
    default: {
      // A magic bolt: a glowing heart with a tail of light behind it and glints shed along its way.
      const tail = Array.from({ length: 9 }, (_unused, index) => pathAt(Math.max(0, share - (8 - index) * 0.03)));
      const shares = tail.map((_point, index) => index / 8);
      drawn.ribbons.push({
        points: tail,
        widths: shares.map((s) => cell * 0.32 * s),
        color: ramp[3],
        core: ramp[5],
        alpha: 0.9,
        alphas: shares,
        blend: 'light',
      });
      drawn.motes.push(glow(at, cell * 0.75, ramp[4], 0.7, forward));
      drawn.motes.push({ ...glow(at, cell * 0.26, '#ffffff', 1, forward + 1), shape: 'puff', variant: seed });
      for (let glint = 1; glint <= 4; glint++) {
        const where = pathAt(Math.max(0, share - glint * 0.07));
        const { side } = acrossOf(way);
        const off = Math.sin(seed * 3 + glint * 2.1) * cell * 0.2;
        drawn.motes.push({
          ...glow(
            { x: where.x + side.x * off, y: where.y + side.y * off, z: where.z + Math.cos(glint * 1.7) * cell * 0.15 },
            cell * 0.22,
            ramp[5],
            1 - glint / 5,
            forward
          ),
          shape: 'star',
          spin: glint + share * 6,
        });
      }
    }
  }
}

/** A crescent of a blade flying, across the way it flies and bowed back from it. */
function flyingCrescent(at: Point, way: Point, cell: number, ramp: readonly string[]): EffectRibbon[] {
  const { side } = acrossOf(way);
  const steps = 12;
  const points = Array.from({ length: steps + 1 }, (_unused, index) => {
    const u = (index / steps) * 2 - 1;
    const back = (1 - Math.cos(u * 1.2)) * cell * 0.5;
    return {
      x: at.x + side.x * u * cell * 0.6 - way.x * back,
      y: at.y + side.y * u * cell * 0.6 - way.y * back,
      z: at.z - way.z * back,
    };
  });
  const widths = points.map((_point, index) => cell * 0.16 * Math.pow(Math.sin((Math.PI * index) / steps), 0.8));
  return [
    { points, widths: widths.map((width) => width * 2.4), color: ramp[2], alpha: 0.5, blend: 'light' },
    { points, widths: widths.map((width) => width * 1.3), color: ramp[1], alpha: 1, blend: 'color' },
    { points, widths, color: ramp[4], core: '#ffffff', alpha: 1, blend: 'color' },
  ];
}

/** The flash at a gun's muzzle as it fires. */
function drawMuzzle(
  drawn: Staged,
  at: Point,
  cell: number,
  ramp: readonly string[],
  share: number,
  forward: number
): void {
  const left = 1 - share;
  drawn.motes.push(...starBurst(at, cell * 1.2, hueOf(ramp), share, forward, 4, 0.3));
  drawn.lights.push({ ...at, color: ramp[4], strength: 1.2 * left, reachPx: cell * 2.2 });
}

/** A sniper's line, drawn at once from the muzzle to the target and fading. */
function drawTracerLine(
  drawn: Staged,
  from: Point,
  to: Point,
  cell: number,
  ramp: readonly string[],
  share: number
): void {
  const left = Math.pow(1 - share, 1.5);
  drawn.ribbons.push({
    points: [from, to],
    widths: cell * 0.5 * left,
    color: hueOf(ramp),
    alpha: 0.4 * left,
    blend: 'light',
  });
  drawn.ribbons.push({
    points: [from, to],
    widths: cell * 0.09 * left,
    color: ramp[4],
    core: '#ffffff',
    alpha: left,
    blend: 'light',
  });
  drawn.ribbons.push({
    points: [from, to],
    widths: cell * 0.2 * left,
    color: ramp[2],
    alpha: 0.35 * left,
    blend: 'light',
  });
}

/**
 * A lobbed shot: fired with a flash and a puff of smoke, it climbs high and falls on the target in a
 * steep arc, trailing smoke, its fuse sparking, and lands with its preset's look.
 */
function drawBallistic(stage: Stage, landWith: LandingLook): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const from = originOf(stage);
  const to = { x: stage.x, y: stage.y, z: stage.groundZ + cell * 0.2 };
  const { length } = wayBetween(from, to);
  const lands = stage.blowsAt[0] ?? stage.duration * 0.86;
  const height = Math.max(cell * 2.5, length * 0.7);
  const pathAt = (along: number): Point => {
    const straight = lerpPoint(from, to, along);
    return { ...straight, z: straight.z + Math.sin(Math.PI * along) * height };
  };
  const forward = cell * 0.4;
  if (t < 0.12) {
    drawMuzzle(drawn, from, cell, ramp, t / 0.12, forward);
    drawn.motes.push(smokePuff(from, cell * (0.4 + t * 4), '#cfc9c2', 0.6 * (1 - t / 0.12), forward));
  }
  const share = t / lands;
  if (share >= 0 && share < 1) {
    for (let back = 14; back >= 1; back--) {
      const was = share - back * 0.03;
      if (was < 0) continue;
      const age = back / 14;
      drawn.motes.push(smokePuff(pathAt(was), cell * (0.15 + age * 0.4), '#bdb6ae', (1 - age) * 0.5, forward));
    }
    const at = pathAt(share);
    drawn.motes.push(ball(at, cell * 0.28, '#2b2a2e', 1, forward, stage.seed));
    drawn.motes.push(
      glow({ ...at, z: at.z + cell * 0.18 }, cell * 0.25, ramp[5], 0.6 + 0.4 * Math.sin(t * 40), forward + 2)
    );
  }
  if (t >= lands) addInto(drawn, landing(stage, landWith, lands, 0, 1));
  return drawn;
}

/** A rain of arrows: loosed up into the sky from the caster, falling steeply over the target and its round, sticking where they land. */
export const arrowrain: Choreography = {
  lingerS: 0.8,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const from = originOf(stage);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const reach = Math.max(stage.areaPx, cell * 1.2);
    const ends = duration + 0.8;
    const thrown = keptFor(arrowsByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return {
        lands: arrowRainShots().map(() => {
          const way = th.outward();
          const out = Math.sqrt(th.range(0, 1)) * reach;
          return {
            x: floor.x + way.cos * out,
            y: floor.y + way.sin * out,
            lean: th.range(-0.25, 0.25),
            spin: th.range(0, 6),
          };
        }),
        dust: [...rollingDust(th, floor, th.count(8), [1, 2.5], [0.4, 0.6]), ...dustColumn(th, floor, th.count(3))],
      };
    });
    const forward = cell * 0.3;
    const sky = cell * 9;
    arrowRainShots().forEach((shot, index) => {
      const loose = shot.loose * duration;
      const falls = shot.fall * duration;
      const lands = shot.land * duration;
      const spot = thrown.lands[index];
      // Loosed up out of sight, each an arrow pointing up as it climbs.
      const up = (t - loose) / 0.35;
      if (up >= 0 && up < 1) {
        const rising = { x: from.x + spot.lean * cell * up * 2, y: from.y, z: from.z + cell * 0.8 + up * sky };
        const upward = { x: spot.lean * 0.2, y: 0, z: 1 };
        drawn.ribbons.push(
          ...arrowBody(rising, upward, cell * 0.8, ramp).map((ribbon) => ({
            ...ribbon,
            alpha: ribbon.alpha * (1 - up),
          }))
        );
      }
      // Falling steeply on the target, head first.
      const down = (t - falls) / Math.max(lands - falls, ARROW_RAIN_FALL * duration * 0.5);
      const ground = { x: spot.x, y: spot.y, z: floor.z };
      const top = { x: spot.x + spot.lean * cell * 3, y: spot.y - cell * 2, z: floor.z + sky };
      const { way } = wayBetween(top, ground);
      if (down >= 0 && down < 1) drawn.ribbons.push(...arrowBody(lerpPoint(top, ground, down), way, cell * 0.75, ramp));
      // Stuck where it landed, a puff of dust at its foot.
      if (t >= lands) {
        const since = t - lands;
        const fade = 1 - within(t, ends - 0.4, ends);
        const tip = { x: ground.x, y: ground.y, z: ground.z + cell * 0.05 };
        const buried = {
          x: tip.x + way.x * cell * 0.25,
          y: tip.y + way.y * cell * 0.25,
          z: tip.z + way.z * cell * 0.25,
        };
        drawn.ribbons.push(...stuckArrow(buried, way, cell * 0.7, ramp, fade));
        if (since < 0.12) drawn.motes.push(...starBurst(tip, cell * 0.7, hueOf(ramp), since / 0.12, forward, 3, index));
        if (since < 0.3)
          drawn.motes.push(
            smokePuff(
              { ...tip, z: tip.z + cell * 0.1 },
              cell * (0.2 + since * 1.5),
              '#9a8c80',
              0.5 * (1 - since / 0.3),
              forward
            )
          );
      }
    });
    const firstLands = arrowRainShots()[0].land * duration;
    const lastLands = arrowRainShots().at(-1)!.land * duration;
    // A glow over the ground the volley falls on while it falls.
    const raining = Math.min(within(t, firstLands - 0.2, firstLands), 1 - within(t, lastLands, lastLands + 0.4));
    if (raining > 0)
      drawn.floor.push(floorMark('disc', floor, reach + cell * 0.5, 1, hueOf(ramp), 0.3 * raining, 'light', 0));
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t - firstLands, cell, forward);
    return drawn;
  },
};

const arrowsByStage = new Map<
  string,
  { lands: { x: number; y: number; lean: number; spin: number }[]; dust: ReturnType<typeof rollingDust> }
>();
