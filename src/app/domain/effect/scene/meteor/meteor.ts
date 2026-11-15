import { type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { isFiery, mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { drawEmber, drawSpark, WARM } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  fallPointAt,
  fallShareAt,
  fallSpeedAt,
  type MeteorFall,
  meteorFallOf,
  rockSizeAt,
} from '@axe/domain/effect/scene/meteor/meteor-fall';
import { drawMeteorFlames, drawRock, type RockPose } from '@axe/domain/effect/scene/meteor/meteor-rock';
import { drawShedFire, type MeteorShed, shedAlong } from '@axe/domain/effect/scene/meteor/meteor-shed';
import {
  craterHeatAt,
  drawFireball,
  drawWreck,
  layCrater,
  type MeteorWreck,
  throwWreck,
} from '@axe/domain/effect/scene/meteor/meteor-wreck';
import {
  ball,
  floorMark,
  glow,
  hueOf,
  keptFor,
  lightBall,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A meteor: the floor under its target begins to glow red and a point of light shows high in the
 * sky; a burning rock falls from it on a slant, a little faster all the way down and larger as it
 * nears, flames streaming back from its white-hot face, shedding gouts of flame that turn to smoke,
 * sparks and embers, and trailing a band of fire that hangs where it passed, while the glow on the
 * floor widens and a light falls with it; it strikes in a white beat held through the blow's stop,
 * and leaves a crater cooling from molten to soot, what is left of the rock sunk in it and cooling,
 * rock and grit thrown on the way it was flying, and dust running out to either side.
 *
 * The rock, its fire and what it sheds are held to their own depth, so a piece standing before them
 * hides them, the floor takes the rock as it sinks in, and they thin away close to the eye.
 */

/** How long the trail of fire hangs where the rock passed, in seconds. */
export const METEOR_TRAIL_S = 0.4;
/** How many points the trail is drawn through, and how long behind the rock it begins, in seconds: the rock's own fire is before it. */
const TRAIL_POINTS = 10;
const TRAIL_BEHIND_S = 0.07;
/** How long the white beat of the landing is, in seconds, two frames of it; and how long its rays last. */
export const METEOR_WHITE_S = 0.034;
const RAYS_S = 0.24;
/** How near the moment it lands a meteor counts as landed, in seconds: the clock is stopped on that moment to the millisecond. */
const LANDS_WITHIN_S = 0.0006;
/** How wide what is left of the rock is, sunk in its crater, in cells, and how long it takes to cool at the most, in seconds. */
const SUNK_ROCK_CELLS = 0.62;
const SUNK_ROCK_COOLS_S = 2.8;
/** How far under the floor any part of the rock or its fire is set at the most, in cells: the floor hides what is under it. */
const SINKS_UNDER_CELLS = 0.2;
/** How much thinner each meteor of a volley sheds and throws out, by how many fall together. */
const SHEDS_THINNER = 1.1;
const THROWS_THINNER = 1;
/** How many falls' worth of what was thrown is kept: a volley on every target of a cast at once. */
const KEPT_FALLS = 256;

/** One meteor of a cast: which of how many fall on the target, when it is sent and when it lands, in seconds of the effect. */
export interface MeteorShot {
  readonly index: number;
  readonly count: number;
  readonly launch: number;
  readonly lands: number;
}

/**
 * How the look a meteor lands with is drawn where it strikes, on its own clock from the moment it
 * lands; null for a meteor that only falls, its landing being drawn by what comes after it.
 */
export type MeteorLanding = ((spot: { readonly x: number; readonly y: number }) => Staged) | null;

/** The colours a fire burns in between its deep red and its white: orange, amber and a pale yellow. */
const BURNS = ['#ff7a1a', '#ffb52e', '#ffe27a'] as const;

/**
 * The steps of colour a meteor of fire's colour burns in: its own deepest and lightest, and between
 * them taken towards the orange and the yellows of a fire, which the steps between a red and a pale
 * colour would not pass through.
 */
function burningRamp(ramp: readonly string[]): readonly string[] {
  return [
    ramp[0],
    ramp[1],
    mixColor(ramp[2], BURNS[0], 0.7),
    mixColor(ramp[3], BURNS[1], 0.7),
    mixColor(ramp[4], BURNS[2], 0.6),
    ramp[5],
    ramp[6],
  ];
}

const shedByStage = new Map<string, MeteorShed>();
const wreckByStage = new Map<string, MeteorWreck>();

/** Adds what one meteor draws on a stage's target at a moment into what is drawn, gone `ends` seconds into the effect. */
export function drawMeteor(
  drawn: Staged,
  stage: Stage,
  shot: MeteorShot,
  told: readonly string[],
  ends: number,
  land: MeteorLanding
): void {
  const t = stage.seconds;
  const ramp = isFiery(stage.preset.colorSecondary) ? burningRamp(told) : told;
  if (t < shot.launch) return;
  const fall = meteorFallOf(stage, shot.index, shot.count, shot.launch, shot.lands);
  const U = fall.unit;
  const key = `${stageKey(stage, ends)}|${stage.preset.sizeScale}|${shot.index}|${shot.count}|${fall.from.x}|${fall.from.y}|${fall.fallsAt}|${fall.landsAt}`;
  const landed = t >= fall.landsAt - LANDS_WITHIN_S;
  const since = Math.max(0, t - fall.landsAt);

  if (!landed) layOmen(drawn, fall, ramp, t, stage.seed);
  const held = drawn.motes.length;
  drawTrail(drawn, fall, ramp, t);
  const shed = keptFor(
    shedByStage,
    key,
    () => shedAlong(throwerFor(stage, ends), fall, Math.pow(shot.count, -SHEDS_THINNER)),
    KEPT_FALLS
  );
  drawShedFire(drawn, shed.gouts, t, U, ramp, U * 0.2, { x: -fall.way.x, y: -fall.way.y, z: -fall.way.z });
  for (const [index, ember] of shed.embers.entries()) drawEmber(drawn, ember, t, U, ramp, index, U * 0.2);
  for (const [index, spark] of shed.sparks.entries()) drawSpark(drawn, spark, t, U, ramp, index, U * 0.2);
  if (!landed) {
    drawSkyPoint(drawn, fall, ramp, t);
    if (t >= fall.fallsAt) drawFalling(drawn, fall, ramp, t, stage.seed + shot.index);
  }
  const grounded = stage.z - stage.groundZ < U * 0.5;
  const leavesAll = land !== null && landed;
  const clearsIn = ends - fall.landsAt;
  if (leavesAll && grounded && since >= METEOR_WHITE_S) {
    drawSunkRock(drawn, fall, ramp, since, clearsIn, stage.seed + shot.index);
  }
  for (let index = held; index < drawn.motes.length; index++) {
    if (!drawn.motes[index].exactDepth) drawn.motes[index] = { ...drawn.motes[index], exactDepth: true };
  }
  if (!leavesAll) return;

  const whole = shot.count < 2;
  layCrater(drawn, fall, ramp, since, clearsIn, whole, (stage.seed % 89) + 1 + shot.index);
  const struck = land(fall.floor);
  drawn.floor.push(...struck.floor);
  drawn.motes.push(...struck.motes);
  drawn.ribbons.push(...struck.ribbons);
  drawn.lights.push(...struck.lights);
  const wreck = keptFor(
    wreckByStage,
    key,
    () =>
      throwWreck(
        throwerFor({ ...stage, seed: stage.seed + 977 + shot.index * 131 }, clearsIn),
        fall,
        Math.pow(shot.count, -THROWS_THINNER),
        whole
      ),
    KEPT_FALLS
  );
  drawFireball(drawn, fall, ramp, since, whole, stage.seed + shot.index, U * 0.4);
  drawWreck(drawn, wreck, fall, ramp, since, clearsIn, U * 0.4);
  drawStrike(drawn, fall, ramp, since, clearsIn, stage.seed + shot.index);
}

/**
 * The omen on the floor: a red glow where the meteor will strike, lit as it shows in the sky and
 * widening and brightening as the square of how near it is, flickering, with a hot spot at its heart.
 */
function layOmen(drawn: Staged, fall: MeteorFall, ramp: readonly string[], t: number, seed: number): void {
  const U = fall.unit;
  const nears = within(t, fall.showsAt, fall.landsAt);
  const lit = within(t, fall.showsAt, fall.showsAt + (fall.fallsAt - fall.showsAt) * 0.6);
  const near = nears * nears;
  const flickers = 0.9 + 0.1 * Math.sin(t * 23 + seed);
  const reach = U * (0.6 + 1.2 * near);
  drawn.floor.push(floorMark('disc', fall.floor, reach, 1, ramp[1], (0.12 + 0.3 * near) * lit, 'color', 0));
  drawn.floor.push(
    floorMark('disc', fall.floor, reach, 1, hueOf(ramp), (0.25 + 0.6 * near) * lit * flickers, 'light', 0)
  );
  drawn.floor.push(floorMark('disc', fall.floor, reach * 0.4, 1, ramp[4], 0.6 * near * flickers, 'light', 0));
}

/** The point of light the meteor shows as in the sky before it falls: it swells and twinkles, and is gone as the rock leaves it. */
function drawSkyPoint(drawn: Staged, fall: MeteorFall, ramp: readonly string[], t: number): void {
  const U = fall.unit;
  const shows = within(t, fall.showsAt, fall.fallsAt);
  const leaves = 1 - within(t, fall.fallsAt, fall.fallsAt + 0.12);
  if (leaves <= 0) return;
  const forward = U * 0.3;
  drawn.motes.push(glow(fall.from, U * (0.5 + 0.9 * shows), ramp[3], 0.6 * shows * leaves, forward));
  drawn.motes.push(lightBall(fall.from, U * 0.14 * (0.4 + 0.6 * shows), '#ffffff', leaves, forward));
  for (const [spin, long] of [
    [0, 5],
    [Math.PI / 2, 3.2],
  ] as const) {
    drawn.motes.push({
      ...glow(fall.from, U * 0.22 * shows, ramp[5], shows * leaves, forward),
      shape: 'flare',
      trail: long,
      spin: spin + t * 1.5,
    });
  }
}

/**
 * The trail where the rock passed: a white-hot band of light drawn through where the rock was over
 * the last moments, from a little behind the rock, whose own fire is before it, thinning and fading
 * to where it was longest ago. Once the rock has struck it hangs there and fades out.
 */
function drawTrail(drawn: Staged, fall: MeteorFall, ramp: readonly string[], t: number): void {
  if (t <= fall.fallsAt || t >= fall.landsAt + METEOR_TRAIL_S) return;
  const points: Point[] = [];
  const shares: number[] = [];
  const widths: number[] = [];
  const head = Math.min(t, fall.landsAt) - TRAIL_BEHIND_S;
  for (let index = 0; index < TRAIL_POINTS; index++) {
    const share = index / (TRAIL_POINTS - 1);
    const moment = head - METEOR_TRAIL_S * (1 - share);
    if (moment < fall.fallsAt) continue;
    const along = fallShareAt(fall, moment);
    points.push(fallPointAt(fall, along));
    shares.push(share * (1 - within(t, fall.landsAt, fall.landsAt + METEOR_TRAIL_S)));
    widths.push(rockSizeAt(fall, along) * (0.25 + 0.75 * share));
  }
  if (points.length < 2) return;
  drawn.ribbons.push({
    points,
    widths: widths.map((width) => width * 0.3),
    color: ramp[4],
    core: '#ffffff',
    alpha: 0.7,
    alphas: shares,
    blend: 'light',
  });
}

/** The rock as it falls, in its fire, and the light that falls with it, stronger as it nears. */
function drawFalling(drawn: Staged, fall: MeteorFall, ramp: readonly string[], t: number, seed: number): void {
  const U = fall.unit;
  const along = fallShareAt(fall, t);
  const at = fallPointAt(fall, along);
  const size = rockSizeAt(fall, along);
  const shows = within(t, fall.fallsAt, fall.fallsAt + 0.06);
  const pose: RockPose = {
    at,
    way: fall.way,
    size,
    heat: 1,
    turn: seed + (t - fall.fallsAt) * 2.4,
    seed,
    forward: U * 0.3,
    alpha: shows,
    lowest: fall.floor.z - U * SINKS_UNDER_CELLS,
  };
  drawMeteorFlames(drawn, pose, fallSpeedAt(fall, t), ramp, t);
  drawRock(drawn, pose, ramp);
  drawn.lights.push({
    ...at,
    color: mixColor(ramp[3], WARM, 0.5),
    strength: 0.4 + 1.4 * along * along,
    reachPx: Math.max(U * 3.5, (at.z - fall.floor.z) * 1.4 + U * 2),
  });
}

/**
 * What is left of the rock, sunk in its crater a little on from where it struck, tipped the way it
 * was flying and held to its own depth so the floor hides what of it is under it: it glows as its
 * cracks do and cools to dark stone, and is gone as what the meteor left clears.
 */
function drawSunkRock(
  drawn: Staged,
  fall: MeteorFall,
  ramp: readonly string[],
  since: number,
  clearsIn: number,
  seed: number
): void {
  const U = fall.unit;
  const size = U * SUNK_ROCK_CELLS;
  const cools = Math.max(0.2, Math.min(SUNK_ROCK_COOLS_S, clearsIn - 0.4));
  const heat = Math.pow(Math.max(0, 1 - since / cools), 1.2);
  const clearing = 1 - within(since, clearsIn - 0.5, clearsIn);
  const at = {
    x: fall.floor.x + fall.across.x * U * 0.2,
    y: fall.floor.y + fall.across.y * U * 0.2,
    z: fall.floor.z + size * 0.12,
  };
  const tipped = Math.hypot(0.5, 0.85);
  const way = { x: (fall.across.x * 0.5) / tipped, y: (fall.across.y * 0.5) / tipped, z: -0.85 / tipped };
  if (heat > 0.02) drawn.motes.push(glow(at, size * 2, ramp[2], 0.5 * heat * clearing, U * 0.1));
  const lowest = fall.floor.z - U * SINKS_UNDER_CELLS;
  drawRock(drawn, { at, way, size, heat, turn: seed, seed, forward: 2, alpha: clearing, lowest }, ramp);
}

/**
 * The strike itself: a white beat over where it lands for its first two frames, which the blow's
 * stop holds; rays shooting from it for a moment after; a white light for an instant, and the light
 * of the molten crater for as long as it is hot.
 */
function drawStrike(
  drawn: Staged,
  fall: MeteorFall,
  ramp: readonly string[],
  since: number,
  clearsIn: number,
  seed: number
): void {
  const U = fall.unit;
  const heart = { x: fall.floor.x, y: fall.floor.y, z: fall.to.z + U * 0.15 };
  if (since < RAYS_S) drawn.motes.push(...starBurst(heart, U * 5.4, hueOf(ramp), since / RAYS_S, U, 10, seed));
  if (since < METEOR_WHITE_S) {
    drawn.floor.push(floorMark('disc', fall.floor, U * 1.5, 1, ramp[5], 0.6, 'light', 0));
    drawn.motes.push(lightBall(heart, U * 1.8, ramp[5], 0.8, U));
    drawn.motes.push(ball(heart, U * 0.9, '#ffffff', 1, U + 1, 0));
  }
  if (since < 0.08) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 2.2 * (1 - since / 0.08), reachPx: U * 3 });
  }
  const heat = craterHeatAt(since, clearsIn);
  if (heat > 0.02) {
    drawn.lights.push({
      x: fall.floor.x,
      y: fall.floor.y,
      z: fall.floor.z + U * 0.5,
      color: mixColor(ramp[2], WARM, 0.5),
      strength: 0.9 * heat,
      reachPx: U * 2.6,
    });
  }
}
