import { isRockShot } from '@axe/domain/effect/earth-looks';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { isFireShot } from '@axe/domain/effect/fire-looks';
import { isIceShot } from '@axe/domain/effect/ice-looks';
import { drawFlyingSlash, drawSlashLanding } from '@axe/domain/effect/scene/blade/flying-slash';
import { type Choreography, nothingStaged, type Stage, type Staged } from '@axe/domain/effect/scene/choreography';
import { drawRockBreak, drawRockFlying } from '@axe/domain/effect/scene/earth/rock-shot';
import { flameRampOf, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { drawIcicle, landsAsIcicle } from '@axe/domain/effect/scene/ice/ice-shot';
import { drawMeteor } from '@axe/domain/effect/scene/meteor/meteor';
import { acrossOf, glow, lerpPoint, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { drawBlasterShot } from '@axe/domain/effect/scene/shot/blaster-shot';
import { drawFireShot } from '@axe/domain/effect/scene/shot/fire-shot';
import { layBallisticFlight } from '@axe/domain/effect/scene/shot/missile-ballistic';
import { shotLookOf, strikesByItself } from '@axe/domain/effect/scene/shot/shot-looks';
import { drawThunderShot, isThunderShot } from '@axe/domain/effect/scene/shot/thunder-shot';
import { drawVacuumBurst, drawVacuumFlight } from '@axe/domain/effect/scene/wind/vacuum-wave';
import { drawWindBurst, drawWindKnot } from '@axe/domain/effect/scene/wind/wind-shot';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';
import { fliesAsVacuum, isWindShot } from '@axe/domain/effect/wind-looks';

/*
 * What is shot from the caster at a target: an arrow, a round of a gun, a sniper's shot, a missile and
 * a bolt of no element, each drawn whole by a look of its own (see shot-looks), a crescent of a blade
 * flying, and a blaster's bolt. A meteor is shot from no one: it falls burning out of the sky. Each
 * lands with the look its preset gives for landing, but a bolt of wind, which flies as a knot of air
 * and bursts, a bolt of rock, which flies as a boulder and breaks, a cut thrown off a blade, which
 * lands as crossed cuts, a crescent that lands in a whirlwind, which flies as pressed air and bursts
 * in a ring of wind, and an arrow or a round that lands in an impact or in rubble, which strikes
 * as its own look draws; a bolt of fire flies as a ball of flame, a bolt of lightning as a ball
 * wound with it, and a bolt of ice as an icicle that breaks over the ice it lands in. A lobbed shot
 * is a ballistic missile, launched straight up and brought down from the sky.
 */

/** How long a shot lingers after its playback, for the look it lands with to clear, in seconds. */
const LINGER_S = 1.8;
/** How high a shot leaves its caster, in cells of the table, and how high it strikes the target. */
const STRIKES_AT = 0.55;

/** How the look a shot lands with is drawn. */
export type LandingLook = (stage: Stage) => Staged;

/**
 * A shot from the caster, landing with the look `landWith` draws for its preset; with none, a shot
 * that only flies, what comes after it being its landing.
 */
export function projectileWith(landWith: LandingLook | null): Choreography {
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

/**
 * Where an arrow strikes a target: in its middle, or for a target whose body stands out past what the
 * shot is grown to, as a dragon three cells across does, on the side of its body it was shot from, so
 * the arrow is left standing out of its chest rather than buried to the feathers in its middle.
 */
function onNearSide(stage: Stage, from: Point, middle: Point): Point {
  const target = stage.targets.find((standing) => standing.index === stage.index);
  const out = target ? (target.widthPx - stage.cell / stage.preset.sizeScale) / 2 : 0;
  const far = Math.hypot(from.x - middle.x, from.y - middle.y);
  if (!(out > 1) || far < 1) return middle;
  const by = Math.min(out, far * 0.5);
  return {
    x: middle.x + ((from.x - middle.x) / far) * by,
    y: middle.y + ((from.y - middle.y) / far) * by,
    z: middle.z,
  };
}

/** Adds what a landing look draws into what is drawn. */
function addInto(drawn: Staged, landed: Staged): void {
  drawn.motes.push(...landed.motes);
  drawn.ribbons.push(...landed.ribbons);
  drawn.floor.push(...landed.floor);
  drawn.lights.push(...landed.lights);
}

/**
 * The preset a landing of one shot of a volley is drawn with: a volley's landings are laid close
 * together, so each is the thinner for it, and the shots of a burst together are not drawn as thick
 * as that many single shots.
 */
function volleyLandingPreset(preset: EffectPreset, shots: number): EffectPreset {
  if (shots <= 1) return preset;
  const thinner = Object.create(preset) as EffectPreset;
  Object.defineProperty(thinner, 'gradeDensity', { value: preset.gradeDensity / Math.sqrt(shots) });
  return thinner;
}

/** Where and when the landing of one shot plays: on its own clock from the moment it lands, as large as a shot of a burst is. */
function landingStage(
  stage: Stage,
  landsAt: number,
  shot: number,
  shots: number,
  spot: { readonly x: number; readonly y: number } = stage,
  grown = shots > 1 ? 0.85 : 1.1
): Stage {
  return {
    ...stage,
    x: spot.x,
    y: spot.y,
    seconds: stage.seconds - landsAt,
    duration: Math.max(0.6, stage.duration - landsAt),
    blowsAt: [0],
    seed: stage.seed + shot * 101,
    cell: stage.cell * grown,
    preset: volleyLandingPreset(stage.preset, shots),
  };
}

/** The landing of one shot, drawn with the look it lands with; see {@link landingStage}. */
function landing(
  stage: Stage,
  landWith: LandingLook,
  landsAt: number,
  shot: number,
  shots: number,
  spot?: { readonly x: number; readonly y: number },
  grown?: number
): Staged {
  return landWith(landingStage(stage, landsAt, shot, shots, spot, grown));
}

/**
 * The meteors of a cast on one target: each falls out of the sky on its own line and lands with the
 * look `landWith` draws, over what it leaves of its own; with none, each only falls. Those of a volley
 * fall together, each leaving its own wreck, so the look each lands with is thinned once more than a
 * volley of shots is.
 */
function drawMeteors(stage: Stage, landWith: LandingLook | null, ramp: readonly string[]): Staged {
  const drawn = nothingStaged();
  const { shots } = projectileTiming(stage.preset);
  const struck = { ...stage, preset: volleyLandingPreset(stage.preset, shots.length) };
  shots.forEach((shot, index) => {
    const lands = shot.land * stage.duration;
    drawMeteor(
      drawn,
      stage,
      { index, count: shots.length, launch: shot.launch * stage.duration, lands },
      ramp,
      stage.duration + LINGER_S,
      landWith && ((spot) => landing(struck, landWith, lands, index, shots.length, spot))
    );
  });
  return drawn;
}

function drawProjectile(stage: Stage, lands: LandingLook | null): Staged {
  const style = stage.preset.projectileLook;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  if (style === 'meteor') return drawMeteors(stage, lands, ramp);
  const windy = isWindShot(stage.preset);
  const vacuum = fliesAsVacuum(stage.preset);
  const rocky = isRockShot(stage.preset);
  const burning = isFireShot(stage.preset);
  const charged = isThunderShot(stage.preset);
  const icy = isIceShot(stage.preset);
  const breaks: LandingLook = (landed) =>
    drawRockBreak(landed, Math.round((stage.duration + LINGER_S - (stage.seconds - landed.seconds)) * 1000) / 1000);
  const whole = windy || rocky || burning || charged || icy || style === 'crescent' ? null : shotLookOf(stage.preset);
  const strikes = whole !== null && strikesByItself(stage.preset);
  const landWith =
    lands === null || strikes
      ? nothingStaged
      : windy
        ? drawWindBurst
        : vacuum
          ? drawVacuumBurst
          : rocky
            ? breaks
            : icy
              ? landsAsIcicle(lands)
              : lands;
  const cuts = style === 'crescent' && lands !== null && stage.preset.impactEffectKind === 'slash';
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const from = originOf(stage);
  const middle = { x: stage.x, y: stage.y, z: stage.z + cell * STRIKES_AT };
  const to = style === 'arrow' ? onNearSide(stage, from, middle) : middle;
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
    if (style === 'blaster') {
      const shots = timing.shots.length;
      const fired = { from, to: course.lands, cell, floorZ: stage.groundZ, seconds: t, launch, lands, index, shots };
      drawBlasterShot(drawn, { ...fired, seed: stage.seed }, ramp);
      if (t >= lands) addInto(drawn, landing(stage, landWith, lands, index, shots, course.lands));
      return;
    }
    if (whole) {
      const shots = timing.shots.length;
      const grade = stage.preset.gradeLevel;
      const fired = {
        from,
        to: course.lands,
        aim: to,
        cell,
        floorZ: stage.groundZ,
        seconds: t,
        launch,
        lands,
        index,
        shots,
      };
      whole(
        drawn,
        {
          ...fired,
          ends: duration + LINGER_S,
          seed: stage.seed,
          grade,
          landsIn: stage.preset.impactEffectKind,
          pathAt,
        },
        ramp
      );
      if (t >= lands) addInto(drawn, landing(stage, landWith, lands, index, shots, course.lands));
      return;
    }
    if (share >= 0 && share < 1) {
      const at = pathAt(share);
      const ahead = pathAt(Math.min(1, share + 0.02));
      const { way } = wayBetween(at, ahead);
      if (windy) drawWindKnot(drawn, { at, way, cell, share, pathAt, seconds: t, seed: stage.seed + index }, ramp);
      else if (rocky) {
        const flight = { at, way, cell, share, pathAt, fliesS: flies, seconds: t, seed: stage.seed + index };
        drawRockFlying(drawn, { ...flight, floorZ: stage.groundZ }, ramp);
      } else if (burning) {
        const grade = stage.preset.gradeLevel;
        drawFireShot(
          drawn,
          { at, way, cell, share, pathAt, seconds: t, seed: stage.seed + index, grade, forward },
          flameRampOf(stage.preset.colorPrimary, stage.preset.colorSecondary)
        );
      } else if (charged) {
        const flight = { at, way, cell, share, pathAt, seconds: t, seed: stage.seed + index, forward };
        drawThunderShot(drawn, { ...flight, floorZ: stage.groundZ, shots: timing.shots.length }, ramp);
      } else if (icy) {
        drawIcicle(drawn, { at, way, cell, share, pathAt, seconds: t, seed: stage.seed + index }, ramp);
      } else if (vacuum) {
        drawVacuumFlight(
          drawn,
          {
            at,
            way,
            cell,
            share,
            pathAt,
            seconds: t,
            floorZ: stage.groundZ,
            seed: stage.seed + index,
            crowd: timing.shots.length * Math.max(1, stage.targets.length),
          },
          ramp
        );
      } else if (style === 'crescent') {
        const volley = { index, count: timing.shots.length, floorZ: stage.groundZ };
        drawFlyingSlash(drawn, { at, way, cell, share, pathAt, fliesS: flies, seconds: t, ...volley }, ramp);
      } else drawFlying(drawn, at, way, cell, ramp, share, pathAt, forward, stage.seed + index);
    }
    const cut: LandingLook = (landed) => drawSlashLanding(landed, index, timing.shots.length, flies);
    if (t >= lands)
      addInto(drawn, landing(stage, cuts ? cut : landWith, lands, index, timing.shots.length, course.lands));
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

/**
 * A shot in flight that no look draws whole: a bolt of light, a glowing heart with a tail of light
 * behind it and glints shed along its way.
 */
function drawFlying(
  drawn: Staged,
  at: Point,
  way: Point,
  cell: number,
  ramp: readonly string[],
  share: number,
  pathAt: (along: number) => Point,
  forward: number,
  seed: number
): void {
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

/**
 * A ballistic missile: launched straight up off its pad, it climbs out of sight and falls nose first
 * out of the sky onto the target, and goes off in a blast larger than a shot's.
 */
function drawBallistic(stage: Stage, landWith: LandingLook): Staged {
  const drawn = nothingStaged();
  const lands = stage.blowsAt[0] ?? stage.duration * 0.86;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  layBallisticFlight(drawn, stage, originOf(stage), lands, ramp);
  if (stage.seconds >= lands) addInto(drawn, landing(stage, landWith, lands, 0, 1, stage, 1.5));
  return drawn;
}
