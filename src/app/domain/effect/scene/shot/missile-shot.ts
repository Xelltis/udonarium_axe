import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { ball, floorMark, glow, hueOf, type Point, smokePuff, wayBetween } from '@axe/domain/effect/scene/parts';
import { missileBody } from '@axe/domain/effect/scene/shot/bodies';
import {
  aboutWay,
  detailOf,
  type FiredShot,
  leftAt,
  offsetBy,
  powerOf,
  reachOver,
  type ShotLook,
} from '@axe/domain/effect/scene/shot/shot-flight';
import { floorUnder, layDustKick, layHitFlash } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A missile. It lights with a flash and kicks smoke back off the floor where it is launched; it
 * leaves slowly and gathers speed, its body with its fins, a flame streaming from its motor; and what
 * it is seen by is its trail, a thick rope of smoke left along the whole of the way it has come, lit
 * by the motor where it is new, swelling, curling and drifting up as it thins, and hanging there
 * after the missile has struck. The missiles of a swarm wind about their courses, each its own way,
 * and their trails braid.
 *
 * A cruise missile is one, and larger: it closes slowly, weaving, a red ring on the floor closing on
 * what it has found, and comes in fast at the last with its flame drawn out long behind it.
 */

/** How long the smoke of a trail hangs, of a single missile, of one of a swarm and of a cruise missile, in seconds. */
const TRAIL_S = { single: 1.6, swarm: 1.4, cruise: 2 } as const;
/** How many puffs the trail of a missile flying alone is laid in. */
const PUFFS = 26;
/** How far the missiles of a swarm wind off their courses, in cells, and how many turns they make. */
const WINDS_CELLS = 0.5;
const WINDS_TURNS = 1.4;
const SMOKE_NEW = '#f4f0ea';
const SMOKE_OLD = '#a39d97';
const SMOKE_UNDER = '#77716d';
const TARGETED = '#ff4a3a';

/** How far along its course a missile is at a share of the time it flies: slow as it leaves, fast as it comes in. */
function alongAt(share: number, cruise: boolean): number {
  return cruise ? 0.55 * share + 0.45 * share ** 3 : 0.35 * share + 0.65 * share * share;
}

/** Where a missile is at a share of its course: on it, or wound about it where it is one of a swarm. */
function courseOf(shot: FiredShot, cruise: boolean): (along: number) => Point {
  if (cruise || shot.shots <= 1) return shot.pathAt;
  const { way } = wayBetween(shot.from, shot.to);
  const hand = shot.index % 2 === 0 ? 1 : -1;
  return (along) => {
    const on = shot.pathAt(along);
    const out = shot.cell * WINDS_CELLS * Math.sin(Math.PI * along);
    const across = aboutWay(way, hand * along * Math.PI * 2 * WINDS_TURNS + shot.index * 2.4 + (shot.seed % 5));
    return { x: on.x + across.x * out, y: on.y + across.y * out, z: Math.max(shot.floorZ + 1, on.z + across.z * out) };
  };
}

/** Lays the trail a missile has left along its course by a moment: see the header. */
export function laySmokeTrail(
  drawn: Staged,
  trail: {
    readonly at: (share: number) => Point;
    /** How long ago the missile set out, how long it flies, and how long its smoke hangs, in seconds. */
    readonly since: number;
    readonly flies: number;
    readonly hangs: number;
    readonly cell: number;
    readonly floorZ: number;
    readonly puffs: number;
    /** How wide the trail is at its widest, in cells. */
    readonly wide: number;
    readonly seed: number;
    readonly left: number;
    readonly lit: string;
    /** Whether each puff is laid with its shade beneath it: all but those of a swarm, which are too many. */
    readonly full: boolean;
  },
  forward: number
): void {
  const { cell, since } = trail;
  const points: Point[] = [];
  const widths: number[] = [];
  const alphas: number[] = [];
  for (let puff = 0; puff <= trail.puffs; puff++) {
    const share = puff / trail.puffs;
    const age = (since - share * trail.flies) / trail.hangs;
    if (age < 0) break;
    if (age >= 1) continue;
    const on = trail.at(share);
    const curl = cell * trail.wide * (0.15 + 0.75 * age);
    const turn = puff * 1.9 + trail.seed + age * 2.5;
    const at = {
      x: on.x + Math.cos(turn) * curl * 0.6 + cell * 0.35 * age,
      y: on.y + Math.sin(turn * 1.3) * curl * 0.4,
      z: Math.max(trail.floorZ + cell * 0.2, on.z + Math.sin(turn) * curl * 0.5 + cell * 0.7 * age * age),
    };
    const size = cell * trail.wide * (0.45 + 0.95 * age ** 0.7);
    const alpha = (1 - age) ** 0.9 * trail.left;
    const fresh = Math.max(0, 1 - age / 0.12);
    const color = mixColor(mixColor(SMOKE_NEW, SMOKE_OLD, age), trail.lit, 0.6 * fresh);
    if (trail.full) {
      const under = { ...at, z: Math.max(trail.floorZ, at.z - size * 0.22) };
      drawn.motes.push(smokePuff(under, size * 0.95, SMOKE_UNDER, alpha * 0.55, forward - 1));
    }
    drawn.motes.push(smokePuff(at, size, color, alpha, forward));
    if (age < 0.6) drawn.motes.push(ball(at, size * 0.62, color, alpha * (1 - age / 0.6), forward, puff % 6));
    points.push(at);
    widths.push(size * 0.3);
    alphas.push(alpha * 0.6);
  }
  if (points.length >= 2) {
    drawn.ribbons.push({
      points,
      widths,
      alphas,
      color: SMOKE_NEW,
      alpha: 1,
      blend: 'color',
      soft: 0.7,
      torn: 0.45,
      flowed: since * 0.6,
    });
  }
}

/**
 * Lays the flame of a missile's motor, streaming from its tail the way given, `long` times as long as
 * the missile is large, a dark flame under a bright one with a glow about them; none of it under the floor.
 */
export function layMotorFlame(
  drawn: Staged,
  tail: Point,
  back: Point,
  size: number,
  long: number,
  t: number,
  salt: number,
  ramp: readonly string[],
  forward: number,
  floorZ: number
): void {
  const hue = hueOf(ramp);
  const reach = reachOver(tail, back, size * long * 1.1, floorZ) / 1.1;
  drawn.motes.push(glow(tail, size * 1.8, ramp[4], 0.55, forward));
  if (reach < size * 0.62) return;
  drawn.motes.push(
    flowingMote('lick', tail, back, size * 0.62, reach * 1.1, t * 14 + salt, {
      color: mixColor(hue, '#190608', 0.35),
      alpha: 0.85,
      forward: forward - 1,
      variant: salt % 6,
    }),
    flowingMote('lick', tail, back, size * 0.46, reach, t * 18 + salt + 2, {
      color: hue,
      core: '#ffffff',
      alpha: 1,
      forward,
      variant: (salt + 2) % 6,
    })
  );
}

/** Draws one missile at a moment, a cruise missile or one that may be of a swarm. */
function drawMissile(drawn: Staged, shot: FiredShot, ramp: readonly string[], cruise: boolean): void {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const swarm = !cruise && shot.shots > 1;
  const power = powerOf(shot.grade);
  const detail = detailOf(shot.shots);
  const forward = cell * 0.4;
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const share = Math.min(1, since / flies);
  const course = courseOf(shot, cruise);
  const at = (time: number): Point => course(alongAt(time, cruise));
  const left = leftAt(shot);

  if (!swarm || shot.index % 3 === 0) {
    layHitFlash(
      drawn,
      shot.from,
      shot.floorZ,
      cell,
      since,
      0.14,
      (cruise ? 3 : 2) * power,
      ramp,
      shot.seed,
      forward,
      6
    );
    const back = wayBetween(shot.to, shot.from).way;
    const blown = offsetBy(floorUnder(shot.from, shot.floorZ), { x: back.x, y: back.y, z: 0 }, cell * 0.5);
    layDustKick(drawn, blown, cell, since, shot.seed + shot.index, (cruise ? 2.6 : 1.7) * power, forward, {
      color: '#d9d4cc',
      count: cruise ? 6 : 4,
      lastsS: cruise ? 1.2 : 0.8,
    });
  }

  laySmokeTrail(
    drawn,
    {
      at,
      since,
      flies,
      hangs: cruise ? TRAIL_S.cruise : swarm ? TRAIL_S.swarm : TRAIL_S.single,
      cell,
      floorZ: shot.floorZ,
      puffs: Math.max(9, Math.round(PUFFS * (swarm ? detail * 1.5 : 1))),
      wide: (cruise ? 0.95 : swarm ? 0.7 : 0.8) * power,
      seed: shot.seed + shot.index * 3,
      left,
      lit: ramp[4],
      full: !swarm,
    },
    forward
  );

  if (cruise && share > 0.3 && share < 1) {
    const closing = (share - 0.3) / 0.7;
    const pulse = 0.6 + 0.4 * Math.sin(t * 24);
    const floor = floorUnder(shot.aim, shot.floorZ);
    drawn.floor.push(
      floorMark('sigil', floor, cell * (1.6 - closing * 0.9), 0.12, TARGETED, 0.8 * pulse, 'light', t * 0.9),
      floorMark('ring', floor, cell * (1.6 - closing * 0.9), 0.1, '#3a0a06', 0.5, 'color', 0),
      floorMark('ring', floor, cell * 0.28, 0.4, TARGETED, 0.9 * pulse, 'light', 0)
    );
  }

  if (share < 1) {
    const ahead = at(Math.min(1, share + 0.02));
    const behind = at(Math.max(0, share - 0.02));
    const { way, length } = wayBetween(behind, ahead);
    const speed = length / (flies * (Math.min(1, share + 0.02) - Math.max(0, share - 0.02)));
    const size = cell * (cruise ? 0.95 : swarm ? 1.05 : 1.2) * power;
    const flown = at(share);
    const sunk = shot.floorZ + cell * 0.05 - (flown.z - Math.max(0, way.z) * size * 1.15);
    const tip = sunk > 0 ? { ...flown, z: flown.z + sunk } : flown;
    const tail = offsetBy(tip, way, -size * 0.95);
    const burns = 0.85 + 0.15 * Math.sin(t * 70 + shot.index);
    const drawnOut = Math.min(2.6, 0.9 + speed / (cell * 9)) * burns;
    const back = { x: -way.x, y: -way.y, z: -way.z };
    layMotorFlame(drawn, tail, back, size, 1.05 * drawnOut, t, shot.index, ramp, forward, shot.floorZ);
    const body = missileBody(
      tip,
      way,
      size,
      ramp,
      { x: way.x * speed, y: way.y * speed, z: way.z * speed },
      speed,
      forward,
      t * 60
    );
    drawn.ribbons.push(...body.ribbons);
    drawn.motes.push(...body.motes);
    drawn.lights.push({ ...tail, color: ramp[4], strength: cruise ? 1.2 : 0.7, reachPx: cell * (cruise ? 3.4 : 2.2) });
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  layHitFlash(
    drawn,
    shot.to,
    shot.floorZ,
    cell,
    struck,
    0.12,
    (cruise ? 1.6 : swarm ? 1.4 : 2) * power,
    ramp,
    shot.seed + shot.index,
    forward,
    cruise ? 8 : 6
  );
}

/** Draws a missile at a moment, alone or one of a swarm: see the header. */
export const drawMissileShot: ShotLook = (drawn, shot, ramp) => drawMissile(drawn, shot, ramp, false);

/** Draws a cruise missile at a moment: see the header. */
export const drawCruiseShot: ShotLook = (drawn, shot, ramp) => drawMissile(drawn, shot, ramp, true);
