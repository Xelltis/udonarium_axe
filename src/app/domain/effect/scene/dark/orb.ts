import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { ORB_CLAMPS_AT } from '@axe/domain/effect/dark-reaction';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { drawBlackSmoke, drawInkMotes } from '@axe/domain/effect/scene/dark/dark-drift';
import {
  type BlackFlame,
  type DarkTones,
  darkTonesOf,
  drawDarkBeat,
  drawDim,
  drawShards,
  layBlackFlames,
  layDarkRing,
  layDarkScorch,
  roundDisc,
} from '@axe/domain/effect/scene/dark/dark-parts';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { circlePoints, floorMark, glow, haze, lightBall, type Point } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * A black sphere. Streaks of darkness run in from all about the target and a seed of black swells
 * over it, two bands of violet closing on it as it clamps shut: a sphere of black with a thin pale rim
 * and a corona of violet, in which the target stands swallowed. It drinks the light about it: the
 * floor darkens far out, and threads of pale light are drawn in from the dark and wound onto it. Then
 * it falls in on itself, faster and faster, to a point; and bursts in a black beat, a ring of violet
 * thrown wide about it at its height and another racing over the floor, black fire rolling out of it
 * and up. The black fire burns down on the floor, and smoke and embers are left over a scorch.
 */

const LINGER_S = SCENE_LINGER_S.darkorb ?? 1.6;
/** How long the sphere takes to fall in on itself, in seconds. */
const FALLS_IN_S = 0.34;
/** How long its black fire burns after it bursts, in seconds. */
const BURNS_S = 1.25;

/** The sphere: black, a pale rim just outside it and a corona of violet about that. */
function drawSphere(drawn: Staged, at: Point, radius: number, tones: DarkTones, hot: number, forward: number) {
  if (radius < 0.5) return;
  const wide = radius * 2;
  drawn.motes.push(glow(at, wide * (2 + 0.6 * hot), tones.glow, 0.75 + 0.25 * hot, forward));
  drawn.motes.push(haze(at, wide * 1.5, tones.edge, 0.75, forward));
  drawn.motes.push(lightBall(at, wide * 1.2, hot > 0.5 ? '#ffffff' : tones.pale, 1, forward + 1));
  drawn.motes.push(...roundDisc(at, wide * 1.24, tones.edge, 1, forward + 1));
  drawn.motes.push(...roundDisc(at, wide * 1.12, '#000000', 1, forward + 2));
  drawn.motes.push({
    ...haze({ x: at.x, y: at.y, z: at.z + radius * 0.3 }, wide * 0.5, tones.deep, 0.55, forward + 3),
    aside: { right: -radius * 0.3, up: 0 },
  });
}

/** Threads of light drawn in out of the dark and onto the sphere: each a streak running in along a curving way. */
function drawDrunk(
  drawn: Staged,
  seed: number,
  at: Point,
  radius: number,
  cell: number,
  t: number,
  tones: DarkTones,
  hard: number,
  forward: number,
  floorZ: number
): void {
  if (hard <= 0.01) return;
  const next = seededRun(seed * 41 + 17);
  for (let index = 0; index < 22; index++) {
    const turn = next() * Math.PI * 2;
    const tilt = (next() - 0.35) * 1.3;
    const pace = 0.9 + next() * 1.1;
    const from = cell * (1.8 + next() * 1.6);
    const along = (t * pace * (1 + hard) + next()) % 1;
    const far = radius + (from - radius) * (1 - along) * (1 - along);
    const swirl = turn + (1 - along) * 1.6;
    const way = { x: Math.cos(swirl) * Math.cos(tilt), y: Math.sin(swirl) * Math.cos(tilt), z: Math.sin(tilt) };
    const point = {
      x: at.x + way.x * far,
      y: at.y + way.y * far,
      z: Math.max(floorZ, at.z + way.z * far),
    };
    const speed = cell * (4 + 9 * along) * (1 + hard);
    const fade = Math.min(1, along * 5, (1 - along) * 4) * hard;
    const velocity = { x: -way.x * speed, y: -way.y * speed, z: -way.z * speed };
    drawn.motes.push({
      ...haze(point, cell * 0.12, tones.edge, fade, forward),
      shape: 'spark',
      velocity,
      trail: 0.07,
    });
    drawn.motes.push({
      ...glow(point, cell * 0.07, index % 2 === 0 ? '#ffffff' : tones.pale, fade, forward + 1),
      shape: 'spark',
      velocity,
      trail: 0.06,
    });
  }
}

/** The two bands of violet that close on the sphere as it clamps shut, and stay wound about it. */
function drawBands(
  drawn: Staged,
  at: Point,
  radius: number,
  tones: DarkTones,
  closed: number,
  t: number,
  seed: number,
  floorZ: number
) {
  const wide = radius * (1.25 + 1.9 * (1 - closed));
  for (const [tilt, way] of [
    [0.6, 1],
    [-0.6, -1.3],
  ] as const) {
    const heading = (seed % 7) + t * 1.7 * way;
    const along = { x: Math.cos(heading), y: Math.sin(heading) };
    const across = { x: -Math.sin(heading) * Math.cos(tilt), y: Math.cos(heading) * Math.cos(tilt), z: Math.sin(tilt) };
    const points = Array.from({ length: 33 }, (_unused, index) => {
      const turn = (index / 32) * Math.PI * 2;
      return {
        x: at.x + wide * (Math.cos(turn) * along.x + Math.sin(turn) * across.x),
        y: at.y + wide * (Math.cos(turn) * along.y + Math.sin(turn) * across.y),
        z: Math.max(floorZ, at.z + wide * Math.sin(turn) * across.z),
      };
    });
    const about = points.map(() => at);
    const thick = radius * 0.16;
    for (const half of ['far', 'near'] as const) {
      drawn.ribbons.push({
        points,
        widths: thick * 1.7,
        color: tones.edge,
        core: '#000000',
        alpha: 0.95 * closed,
        blend: 'color',
        about,
        half,
      });
      drawn.ribbons.push({
        points,
        widths: thick * 0.7,
        color: tones.glow,
        core: tones.pale,
        alpha: closed,
        blend: 'light',
        about,
        half,
      });
    }
  }
}

/** The black fire the sphere bursts in: tongues thrown out all round and up, falling back to burn low on the floor. */
function burstFlames(stage: Stage, heart: Point, floorZ: number, since: number): BlackFlame[] {
  const { cell } = stage;
  const next = seededRun(stage.seed * 23 + 1);
  const flames: BlackFlame[] = [];
  const thrown = outCubic(within(since, 0, 0.22));
  const dying = 1 - within(since, BURNS_S * 0.5, BURNS_S);
  const tongues = Math.round(14 * stage.preset.gradeDensity);
  for (let index = 0; index < tongues; index++) {
    const turn = (index / tongues) * Math.PI * 2 + next() * 0.4;
    const lift = 0.15 + next() * 1.1;
    const long = cell * (1.3 + next() * 1.2);
    const settles = within(since, 0.2 + next() * 0.2, 0.75);
    const out = cell * (0.25 + 0.6 * thrown) * (1 + 0.5 * settles);
    const root = {
      x: heart.x + Math.cos(turn) * out,
      y: heart.y + Math.sin(turn) * out,
      z: heart.z + (floorZ - heart.z) * settles,
    };
    const up = lift + (1.6 - lift) * settles;
    flames.push({
      root,
      heading: { x: Math.cos(turn) * (1 - 0.8 * settles), y: Math.sin(turn) * (1 - 0.8 * settles), z: up },
      wide: cell * (0.34 + next() * 0.2) * (0.5 + 0.5 * thrown) * (0.45 + 0.55 * dying),
      long: long * thrown * (1 - 0.55 * settles) * (0.3 + 0.7 * dying) * (0.85 + 0.15 * Math.sin(since * 15 + index)),
      flowed: since * 3.2 + index,
      variant: index,
      alpha: Math.min(1, dying * 3),
    });
  }
  return flames;
}

/** A black sphere: see the header. */
export function drawOrb(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const bursts = stage.blowsAt[0] ?? darkStrikesAt('darkorb', stage.preset.gradeLevel, duration)?.[0] ?? duration * 0.5;
  const since = t - bursts;
  const tones = darkTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const heart = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.5 };
  const forward = cell * 0.5;
  const full = Math.max(stage.tall * 0.66, cell * 0.8);
  const clamps = bursts * ORB_CLAMPS_AT;
  const fallsAt = bursts - Math.min(FALLS_IN_S, bursts * 0.3);

  if (since < 0) {
    const swelling = outCubic(within(t, clamps * 0.25, clamps));
    const falling = within(t, fallsAt, bursts);
    const fallen = falling * falling * falling;
    const throb = 1 + 0.035 * Math.sin(t * 11) * (1 - falling);
    const shake = cell * 0.03 * Math.sin(t * 97) * falling;
    const radius = full * swelling * (1 - 0.9 * fallen) * throb;
    const at = { x: heart.x + shake, y: heart.y, z: heart.z };
    const drinking = within(t, clamps * 0.6, clamps + 0.25);
    const dark = drinking * (1 - 0.6 * fallen);
    drawn.floor.push(floorMark('disc', floor, cell * (2 + 2.2 * drinking), 1, '#000000', 0.62 * dark, 'color', 0));
    drawn.floor.push(
      floorMark('ring', floor, radius * (1.5 + 0.2 * Math.sin(t * 5)), 0.1, tones.edge, 0.7 * swelling, 'color', 0)
    );
    drawn.floor.push(
      floorMark('ring', floor, radius * (1.5 + 0.2 * Math.sin(t * 5)), 0.05, tones.glow, 0.8 * swelling, 'light', 0)
    );
    drawDim(drawn, at, cell * 5, 0.3 * dark, forward * 0.5);
    drawDrunk(
      drawn,
      stage.seed,
      at,
      radius,
      cell,
      t,
      tones,
      Math.min(1, within(t, clamps * 0.2, clamps) + falling),
      forward + 4,
      floor.z
    );
    drawSphere(drawn, at, radius, tones, fallen, forward);
    drawBands(
      drawn,
      at,
      radius,
      tones,
      outCubic(within(t, clamps * 0.5, clamps)) * (1 - fallen),
      t,
      stage.seed,
      floor.z
    );
    if (falling > 0.6) {
      const point = (falling - 0.6) / 0.4;
      drawn.motes.push({ ...glow(at, cell * 1.6 * point, '#ffffff', point, forward + 5), shape: 'star', spin: 0.4 });
      drawn.motes.push({
        ...glow(at, cell * 0.5, tones.pale, point, forward + 5),
        shape: 'flare',
        trail: 9 * point,
        spin: 0,
      });
    }
    const clampedFor = t - clamps;
    if (clampedFor >= 0 && clampedFor < 0.3) {
      const left = 1 - clampedFor / 0.3;
      drawn.motes.push(glow(at, full * 4 * (1.2 - 0.2 * left), tones.glow, 0.7 * left, forward));
      layDarkRing(drawn, floor, full, full * 2.4, cell * 0.16, tones, clampedFor, 0.3);
    }
    if (fallen > 0.05) drawn.lights.push({ ...at, color: tones.edge, strength: 1.4 * fallen, reachPx: cell * 3 });
    return drawn;
  }

  drawDarkBeat(drawn, heart, floor, cell * 1.05, tones, since, 0.1);
  if (since < 0.42) {
    const thrown = outCubic(since / 0.42);
    const left = 1 - thrown;
    const points = circlePoints(heart, full * 0.5 + cell * 2.9 * thrown, 40);
    const thick = cell * (0.1 + 0.34 * left);
    drawn.ribbons.push(
      { points, widths: thick * 1.7, color: tones.edge, core: '#000000', alpha: Math.min(1, left * 2), blend: 'color' },
      { points, widths: thick * 0.55, color: tones.glow, core: '#ffffff', alpha: left, blend: 'light' }
    );
    const blast = cell * (1 + 1.9 * thrown);
    drawn.motes.push(glow(heart, blast * 2.4, tones.glow, 0.6 * left, forward));
    drawn.motes.push(haze(heart, blast * 1.5, tones.edge, 0.8 * left, forward));
    drawn.motes.push({
      ...heart,
      size: blast * 1.05,
      color: '#000000',
      alpha: Math.min(1, left * 1.6),
      blend: 'color',
      shape: 'puff',
      variant: (stage.seed % 5) + 1,
      forward: forward + 1,
    });
    drawn.lights.push({ ...heart, color: tones.edge, strength: 1.5 * left, reachPx: cell * 4.2 });
  }
  layDarkRing(drawn, floor, cell * 0.4, cell * 3.6, cell * 0.3, tones, since, 0.5);
  if (since < BURNS_S) layBlackFlames(drawn, burstFlames(stage, heart, floor.z, since), tones, forward);
  drawShards(
    drawn,
    stage.seed,
    heart,
    floor.z,
    Math.round(26 * stage.preset.gradeDensity),
    cell,
    since,
    tones,
    forward
  );
  layDarkScorch(drawn, floor, cell * 1.15, tones, since, ends - bursts, stage.seed);
  drawBlackSmoke(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    { count: 14, out: [0, cell * 0.9], born: [0.25, Math.max(0.4, ends - bursts - 1.5)], tall: cell * 1.9 },
    forward
  );
  drawInkMotes(
    drawn,
    stage.seed,
    floor,
    cell,
    since,
    tones,
    { count: 24, out: [0, cell * 1.3], born: [0.1, Math.max(0.3, ends - bursts - 1.5)], rise: cell * 1.4 },
    forward
  );
  return drawn;
}
