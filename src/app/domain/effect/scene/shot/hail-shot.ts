import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, lightBall, type Point, smokePuff, wayBetween } from '@axe/domain/effect/scene/parts';
import { layCasing } from '@axe/domain/effect/scene/shot/gun-parts';
import { aboutWay, leftAt, levelWay, offsetBy, runOf, type ShotLook } from '@axe/domain/effect/scene/shot/shot-flight';
import {
  DIRT,
  floorUnder,
  layChips,
  layCurl,
  layDirtJet,
  layDustKick,
  layFlashStar,
  layHitFlash,
  layHungLine,
  layPock,
  laySpray,
  layStreak,
  streakTonesOf,
} from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A burst of light rounds, a hail of fire. The muzzle strobes: each round flashes for an instant, now
 * large and now small, its star turned from the last, and the muzzle jumps about as it rattles; smoke
 * gathers over it and the casings stream out to one side. Every round is a tracer, a bright streak
 * of its colour that leaves a glowing line behind it for a moment. The hits walk across the body of
 * the target from one side to the other, each a flash, a spray of sparks and chips, a puff of smoke,
 * and the dust they knock off it gathers about its feet; every fourth round goes into the ground beside
 * it, standing up a jet of dirt and leaving a pock.
 */

/** How long the flash at the muzzle lasts for each round, in seconds: shorter than the gap between rounds, so it strobes. */
const STROBE_S = 0.06;
/** How far each round leaves the muzzle off the last, in cells. */
const RATTLES = 0.18;
/** How far either side of the middle of the target the hits walk, and how far up and down they wander, in cells. */
const WALKS_CELLS = 0.4;
const WANDERS_CELLS = 0.26;
/** Every how many rounds one goes into the ground beside the target. */
const MISSES_EVERY = 4;
/** How long the line a tracer leaves glows after it has struck, in seconds. */
const LINE_GLOWS_S = 0.1;
/** How long a puff of smoke from the muzzle hangs, in seconds. */
const SMOKE_S = 0.9;
const GUNSMOKE = '#c9c3bd';
/** The flame of the muzzle and of a tracer, and its pale heart, taken towards the colour of the cast. */
const FLASH = '#ffb21e';
const FLASH_CORE = '#fff2b0';
const STONE_CHIPS = ['#8a7f76', '#5d544d', '#b3a79b'] as const;
const DIRT_CHIPS = [DIRT, '#4a3a2c', '#8a6f55'] as const;

/** Where a round leaves the muzzle: a little off it, to another side for each. */
function muzzleOf(from: Point, cell: number, next: () => number): Point {
  const off = cell * RATTLES;
  return {
    x: from.x + (next() - 0.5) * 2 * off,
    y: from.y + (next() - 0.5) * 2 * off,
    z: from.z + (next() - 0.5) * 2 * off,
  };
}

/** Where a round strikes, and whether that is the ground beside the target rather than its body: see the header. */
function hitOf(
  from: Point,
  aim: Point,
  cell: number,
  floorZ: number,
  index: number,
  shots: number,
  next: () => number
): { readonly at: Point; readonly ground: boolean } {
  const way = levelWay(wayBetween(from, aim).way);
  const walked = shots > 1 ? index / (shots - 1) : 0.5;
  const across = ((walked * 2 - 1) * WALKS_CELLS + (next() - 0.5) * 0.2) * cell;
  if (index % MISSES_EVERY === MISSES_EVERY - 1) {
    const aside = across * 1.8 + Math.sign(across || 1) * cell * 0.35;
    const past = (next() - 0.3) * cell;
    return {
      at: { x: aim.x - way.y * aside + way.x * past, y: aim.y + way.x * aside + way.y * past, z: floorZ },
      ground: true,
    };
  }
  const front = cell * 0.15;
  return {
    at: {
      x: aim.x - way.y * across - way.x * front,
      y: aim.y + way.x * across - way.y * front,
      z: Math.max(floorZ + cell * 0.15, aim.z + (next() - 0.5) * 2 * WANDERS_CELLS * cell),
    },
    ground: false,
  };
}

/** The flash at the muzzle as a round leaves it: a tongue of flame thrown forward with two short ones to its sides, a star over them and a white heart. */
function layStrobe(
  drawn: Staged,
  at: Point,
  way: Point,
  cell: number,
  floorZ: number,
  since: number,
  index: number,
  tones: ReturnType<typeof streakTonesOf>,
  forward: number
): void {
  if (since < 0 || since >= STROBE_S) return;
  const share = since / STROBE_S;
  const left = 1 - share;
  const big = index % 2 === 0 ? 1.2 : 0.8;
  const flame = mixColor(tones.hue, FLASH, 0.6);
  const tongue = (heading: Point, long: number, wide: number): void => {
    const points = [0, 0.3, 0.65, 1].map((along) => {
      const point = offsetBy(at, heading, long * along);
      return { ...point, z: Math.max(floorZ + 1, point.z) };
    });
    const widths = [0.55, 1, 0.55, 0].map((part) => part * wide);
    drawn.ribbons.push(
      { points, widths: widths.map((width) => width * 1.3), color: tones.dark, alpha: 0.7, blend: 'color', soft: 0.4 },
      { points, widths, color: flame, core: FLASH_CORE, alpha: 1, blend: 'color' },
      { points, widths: widths.map((width) => width * 0.4), color: '#ffffff', alpha: 1, blend: 'color' }
    );
  };
  tongue(way, cell * 1.1 * big * (0.6 + 0.4 * left), cell * 0.42 * big);
  for (let side = 0; side < 4; side++) {
    const across = aboutWay(way, index * 0.9 + (side * Math.PI) / 2);
    const heading = { x: way.x * 0.3 + across.x, y: way.y * 0.3 + across.y, z: way.z * 0.3 + across.z };
    const length = Math.hypot(heading.x, heading.y, heading.z);
    tongue(
      { x: heading.x / length, y: heading.y / length, z: heading.z / length },
      cell * 0.55 * big,
      cell * 0.22 * big
    );
  }
  layFlashStar(drawn, at, cell * 2.8 * big, flame, share, forward, index % 2 === 0 ? 6 : 4, index * 0.7);
  drawn.motes.push(glow(at, cell * 1.8 * big, flame, 0.7 * left, forward + 1));
  drawn.motes.push(lightBall(at, cell * 0.75 * big * left, '#ffffff', left, forward + 2));
  drawn.floor.push(floorMark('disc', floorUnder(at, floorZ), cell * 2 * big, 1, FLASH, 0.45 * left, 'light', 0));
  drawn.lights.push({ ...at, color: FLASH_CORE, strength: 1.3 * big * left, reachPx: cell * 3.2 });
}

/** Draws one round of a burst of light rounds at a moment: see the header. */
export const drawHailShot: ShotLook = (drawn, shot, ramp) => {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const forward = cell * 0.5;
  const next = runOf(shot, 3);
  const tones = streakTonesOf(ramp);
  const tracer = { ...tones, hue: mixColor(tones.hue, FLASH, 0.6), core: FLASH_CORE };
  const muzzle = muzzleOf(shot.from, cell, next);
  const hit = hitOf(shot.from, shot.aim, cell, shot.floorZ, shot.index, shot.shots, next);
  const { way, length } = wayBetween(muzzle, hit.at);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const head = offsetBy(muzzle, way, Math.min(1, since / flies) * length);
  const left = leftAt(shot);

  layStrobe(drawn, muzzle, way, cell, shot.floorZ, since, shot.index, tones, forward);
  layCasing(drawn, muzzle, way, cell, shot.floorZ, since - 0.02, left, shot.seed * 7 + shot.index, forward);
  if (shot.index % 3 === 0 && since > 0.02 && since < SMOKE_S) {
    const age = since / SMOKE_S;
    const rolled = offsetBy(muzzle, way, cell * (0.4 + 0.9 * (1 - (1 - age) ** 2)));
    drawn.motes.push(
      smokePuff(
        { ...rolled, z: rolled.z + cell * 0.5 * age },
        cell * (0.45 + 0.8 * age),
        GUNSMOKE,
        0.6 * (1 - age) ** 1.3,
        forward
      )
    );
  }

  if (since < flies) {
    const long = Math.min(length, cell * 3.2);
    const run = Math.min(1, since / flies) * length;
    const tail = offsetBy(muzzle, way, Math.max(0, run - long));
    drawn.ribbons.push({
      points: [tail, head],
      widths: [0, cell * 0.8],
      color: tracer.hue,
      alpha: 0.6,
      blend: 'light',
      soft: 1,
    });
    layStreak(drawn, tail, head, cell * 0.3, tracer);
  } else if (since < flies + LINE_GLOWS_S) {
    layHungLine(drawn, [muzzle, hit.at], cell * 0.24, 1 - (since - flies) / LINE_GLOWS_S, tracer);
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const back = { x: -way.x, y: -way.y, z: -way.z };
  const seed = shot.seed + shot.index * 7;
  if (hit.ground) {
    layDirtJet(drawn, hit.at, cell, struck, seed, 1.1, forward, back);
    layChips(
      drawn,
      {
        at: hit.at,
        way: { x: back.x * 0.3, y: back.y * 0.3, z: 1 },
        spread: 0.7,
        cell,
        floorZ: shot.floorZ,
        since: struck,
        lastsS: Math.min(1.2, shot.ends - shot.lands),
        seed,
        count: 4,
        fast: [1.5, 3.5],
        up: [2.5, 5],
        size: [0.06, 0.12],
        colors: DIRT_CHIPS,
      },
      forward
    );
    laySpray(
      drawn,
      {
        at: hit.at,
        way: { x: back.x * 0.4, y: back.y * 0.4, z: 0.9 },
        spread: 0.7,
        cell,
        floorZ: shot.floorZ,
        since: struck,
        lastsS: 0.2,
        seed,
        count: 6,
        fast: [4, 9],
      },
      ramp[4],
      forward
    );
    layPock(drawn, hit.at, cell, struck, left, seed, 0.38, ramp[3]);
    return;
  }

  layHitFlash(drawn, hit.at, shot.floorZ, cell, struck, 0.12, 3.2, ramp, seed, forward, 5);
  if (struck < 0.07) drawn.motes.push(lightBall(hit.at, cell * 0.5, '#ffffff', 1 - struck / 0.07, forward + 4));
  laySpray(
    drawn,
    {
      at: hit.at,
      way: back,
      spread: 1,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: 0.3,
      seed,
      count: 18,
      fast: [5, 13],
      size: 0.12,
    },
    ramp[4],
    forward + 1
  );
  layChips(
    drawn,
    {
      at: hit.at,
      way: back,
      spread: 0.9,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: Math.min(1.1, shot.ends - shot.lands),
      seed: seed + 3,
      count: 4,
      fast: [2, 5],
      up: [1.5, 4],
      size: [0.06, 0.12],
      colors: STONE_CHIPS,
    },
    forward
  );
  if (struck < 0.35)
    drawn.motes.push(
      smokePuff(
        offsetBy(hit.at, back, cell * 0.3 * (struck / 0.35)),
        cell * (0.3 + 0.5 * (struck / 0.35)),
        '#9d958d',
        0.65 * (1 - struck / 0.35),
        forward
      )
    );
  if (shot.index % 3 === 1)
    layCurl(drawn, hit.at, cell, struck, Math.min(1, shot.ends - shot.lands - 0.2), seed, 0.6, forward);
  layDustKick(drawn, floorUnder(shot.aim, shot.floorZ), cell, struck, seed, 1.4, forward, { count: 3, lastsS: 1.1 });
  drawn.motes.push(glow(hit.at, cell * 0.5, ramp[4], 0.5 * Math.max(0, 1 - struck / 0.15), forward));
};
