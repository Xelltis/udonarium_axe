import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { layCasing, layMuzzleFlash, MUZZLE_FLASH_S } from '@axe/domain/effect/scene/shot/gun-parts';
import { drawHailShot } from '@axe/domain/effect/scene/shot/hail-shot';
import {
  detailOf,
  type FiredShot,
  leftAt,
  levelWay,
  offsetBy,
  powerOf,
  runOf,
  type ShotLook,
} from '@axe/domain/effect/scene/shot/shot-flight';
import {
  alongFloor,
  DIRT,
  floorUnder,
  KICKED,
  layChips,
  layCurl,
  layDirtJet,
  layDustKick,
  layHitFlash,
  layHungLine,
  layPock,
  laySpray,
  layStreak,
  layVapourRing,
  streakTonesOf,
} from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A round fired from a gun. The muzzle flashes and smokes and throws its casing; the round is a streak
 * too fast to follow, and the line it flew hangs in the air behind it. Where it strikes a body sparks
 * spray back the way it came and chips fly, a curl of smoke rises off it, and the ground behind is
 * pocked. A round that lands in rubble is a heavy one: it goes through, a ring of vapour opening about
 * it as it does, and buries itself in the ground behind in a jet of dirt.
 *
 * A burst of light rounds is a hail of fire, as `hail-shot` has it. A burst of heavy rounds rattles:
 * each leaves the muzzle a little off the last, its flash now larger and now smaller, and a long one
 * is walked up the ground onto the target, jets of dirt standing up short of it one after another,
 * and every third round is a tracer that burns its colour.
 */

/** How far each round of a burst leaves the muzzle off the last, in cells. */
const RATTLES = 0.16;
/** From how many rounds a burst of heavy ones is walked up the ground onto its target, and how far short of it the first lands, in cells. */
const WALKED_FROM = 8;
const WALKED_CELLS = 2.6;
/** The share of a walked burst that lands short of the target, in the ground. */
const WALKED_SHORT = 0.58;
/** How far behind what it went through a heavy round goes into the ground, in cells. */
const THROUGH_CELLS = 1.5;
/** How long the curl of smoke off where a round struck a body rises, for a single round and for every third of a burst, in seconds. */
const CURL_S = { single: 1.6, burst: 0.9 } as const;
/** The most a round's grade widens its streak and the line it leaves. */
const LINE_POWER = 1.3;
/** How long the line of a single round hangs, and that of a round of a burst, in seconds. */
const HANGS_S = 0.5;
const BURST_HANGS_S = 0.2;
const STONE_CHIPS = ['#8a7f76', '#5d544d', '#b3a79b'] as const;
const DIRT_CHIPS = [DIRT, '#4a3a2c', '#8a6f55'] as const;

/** Where a round goes: what it strikes, and whether that is the ground rather than the body it was aimed at. */
interface Strike {
  readonly at: Point;
  readonly ground: boolean;
}

/** Whether a round is a heavy one, which goes through what it strikes. */
function isHeavy(shot: FiredShot): boolean {
  return shot.landsIn === 'rubble';
}

/** Where a round of a burst leaves the muzzle: a little off it, to another side for each. */
function muzzleOf(shot: FiredShot): Point {
  if (shot.shots <= 1) return shot.from;
  const next = runOf(shot, 1);
  const off = shot.cell * RATTLES;
  return {
    x: shot.from.x + (next() - 0.5) * 2 * off,
    y: shot.from.y + (next() - 0.5) * 2 * off,
    z: shot.from.z + (next() - 0.5) * 2 * off,
  };
}

/** Where a round strikes: see the header. */
function strikeOf(shot: FiredShot): Strike {
  const { cell } = shot;
  if (shot.shots <= 1) return { at: shot.to, ground: false };
  const next = runOf(shot, 2);
  const way = levelWay(wayBetween(shot.from, shot.aim).way);
  const aside = (next() - 0.5) * cell;
  if (isHeavy(shot) && shot.shots >= WALKED_FROM) {
    const walked = shot.index / (shot.shots - 1) / WALKED_SHORT;
    if (walked >= 1) return { at: shot.to, ground: false };
    const short = cell * (0.75 + (WALKED_CELLS - 0.75) * (1 - walked));
    return {
      at: {
        x: shot.aim.x - way.x * short - way.y * aside,
        y: shot.aim.y - way.y * short + way.x * aside,
        z: shot.floorZ,
      },
      ground: true,
    };
  }
  if (shot.index % 3 !== 2) return { at: shot.to, ground: false };
  const past = cell * (0.7 + next() * 0.7);
  return {
    at: {
      x: shot.aim.x + way.x * past - way.y * aside * 1.6,
      y: shot.aim.y + way.y * past + way.x * aside * 1.6,
      z: shot.floorZ,
    },
    ground: true,
  };
}

/** Draws one round of a gun at a moment: see the header. */
export const drawGunShot: ShotLook = (drawn, shot, ramp) => {
  const heavy = isHeavy(shot);
  const burst = shot.shots > 1;
  if (burst && !heavy) {
    drawHailShot(drawn, shot, ramp);
    return;
  }
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const detail = detailOf(shot.shots);
  const power = powerOf(shot.grade) * (heavy ? 1.25 : 1);
  const forward = cell * 0.5;
  const tones = streakTonesOf(ramp);
  const tracer = burst && heavy && shot.index % 3 === 0;
  const pale = { ...tones, hue: mixColor(tones.hue, '#fff6dc', 0.55), dark: mixColor(tones.dark, '#5a4a3a', 0.4) };
  const paint = !burst || tracer ? tones : pale;
  const muzzle = muzzleOf(shot);
  const strike = strikeOf(shot);
  const { way, length } = wayBetween(muzzle, strike.at);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const head = offsetBy(muzzle, way, Math.min(1, since / flies) * length);
  const left = leftAt(shot);

  layMuzzleFlash(
    drawn,
    {
      at: muzzle,
      way,
      cell,
      floorZ: shot.floorZ,
      since,
      seed: shot.seed + shot.index,
      power: burst ? Math.min(1.25, power) * (0.6 + 0.25 * (shot.index % 2)) : Math.min(1.7, power),
      smokes: !burst || shot.index % 3 === 0,
    },
    tones,
    forward
  );
  layCasing(drawn, muzzle, way, cell, shot.floorZ, since - 0.02, left, shot.seed * 7 + shot.index, forward);

  if (since < flies) {
    const long = Math.min(length, cell * 4.5 * power);
    const run = Math.min(1, since / flies) * length;
    layStreak(
      drawn,
      offsetBy(muzzle, way, Math.max(0, run - long)),
      head,
      cell * (tracer ? 0.32 : burst ? 0.24 : 0.4) * Math.min(power, LINE_POWER),
      paint
    );
  }
  const hangs = burst ? BURST_HANGS_S * (tracer ? 1.6 : 1) : HANGS_S * (heavy ? 1.3 : 1);
  if (since < hangs && since > MUZZLE_FLASH_S * 0.3) {
    const fresh = 1 - since / hangs;
    const wide = cell * (tracer ? 0.3 : burst ? 0.18 : 0.34) * Math.min(power, LINE_POWER);
    layHungLine(drawn, [muzzle, head], wide, fresh, paint);
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const back = { x: -way.x, y: -way.y, z: -way.z };
  if (strike.ground) {
    const tall = heavy ? 1.7 : 0.9;
    layDirtJet(drawn, strike.at, cell, struck, shot.seed + shot.index * 3, tall * power, forward, back);
    layChips(
      drawn,
      {
        at: strike.at,
        way: { x: back.x * 0.3, y: back.y * 0.3, z: 1 },
        spread: 0.6,
        cell,
        floorZ: shot.floorZ,
        since: struck,
        lastsS: Math.min(1.2, shot.ends - shot.lands),
        seed: shot.seed + shot.index * 5,
        count: heavy ? 3 : 2,
        fast: [1.5, 3.5],
        up: [2.5, 5],
        size: heavy ? [0.08, 0.16] : [0.05, 0.1],
        colors: DIRT_CHIPS,
      },
      forward
    );
    laySpray(
      drawn,
      {
        at: strike.at,
        way: { x: back.x * 0.4, y: back.y * 0.4, z: 0.9 },
        spread: 0.7,
        cell,
        floorZ: shot.floorZ,
        since: struck,
        lastsS: 0.18,
        seed: shot.seed + shot.index,
        count: 4,
        fast: [4, 9],
      },
      ramp[4],
      forward
    );
    layPock(drawn, strike.at, cell, struck, left, shot.seed + shot.index, (heavy ? 0.42 : 0.3) * power, ramp[3]);
    return;
  }

  const size = (burst ? 2.2 : 3) * power;
  layHitFlash(
    drawn,
    strike.at,
    shot.floorZ,
    cell,
    struck,
    burst ? 0.09 : 0.14,
    size,
    ramp,
    shot.seed + shot.index,
    forward,
    burst ? 4 : 6
  );
  laySpray(
    drawn,
    {
      at: strike.at,
      way: back,
      spread: 0.9,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: burst ? 0.22 : 0.34,
      seed: shot.seed + shot.index * 3,
      count: Math.max(5, Math.round(18 * detail * power)),
      fast: [5, 13],
      size: 0.09,
    },
    ramp[4],
    forward + 1
  );
  layChips(
    drawn,
    {
      at: strike.at,
      way: back,
      spread: 0.9,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: Math.min(1.1, shot.ends - shot.lands),
      seed: shot.seed + shot.index * 11,
      count: Math.max(2, Math.round(7 * detail * power)),
      fast: [2, 5],
      up: [1.5, 4],
      size: [0.06, 0.13],
      colors: STONE_CHIPS,
    },
    forward
  );
  if (!burst || shot.index % 3 === 0) {
    const curls = Math.min(burst ? CURL_S.burst : CURL_S.single, shot.ends - shot.lands - 0.2);
    layCurl(drawn, strike.at, cell, struck, curls, shot.seed + shot.index, (burst ? 0.7 : 1.1) * power, forward);
  }
  const under = floorUnder(strike.at, shot.floorZ);
  if (!heavy) {
    layDustKick(drawn, under, cell, struck, shot.seed + shot.index, 0.9 * power, forward, { count: burst ? 2 : 4 });
    layPock(
      drawn,
      alongFloor(strike.at, way, cell * 0.45, shot.floorZ),
      cell,
      struck,
      left,
      shot.seed + shot.index,
      0.3 * power,
      ramp[3]
    );
    return;
  }

  const ringed = struck / 0.3;
  if (ringed < 1 && !burst) {
    for (const [at, lag] of [
      [0, 0],
      [-0.5, 0.25],
    ] as const) {
      const open = Math.max(0, ringed - lag) / (1 - lag);
      if (open <= 0) continue;
      layVapourRing(
        drawn,
        offsetBy(strike.at, way, cell * at),
        way,
        cell * power * (0.2 + 0.6 * (1 - (1 - open) ** 2)) * (1 - lag),
        cell * 0.11 * (1 - open * 0.5),
        '#ffffff',
        0.85 * (1 - open) ** 0.7,
        shot.floorZ
      );
    }
  }
  const buries = alongFloor(strike.at, way, cell * THROUGH_CELLS * (burst ? 0.7 : 1), shot.floorZ);
  const exit = wayBetween(strike.at, buries);
  const went = struck / 0.05;
  if (went < 1)
    layStreak(drawn, strike.at, offsetBy(strike.at, exit.way, exit.length * went), cell * 0.3 * power, tones);
  if (struck < 0.3)
    layHungLine(
      drawn,
      [strike.at, offsetBy(strike.at, exit.way, exit.length * Math.min(1, went))],
      cell * 0.22 * power,
      1 - struck / 0.3,
      tones
    );
  laySpray(
    drawn,
    {
      at: strike.at,
      way: exit.way,
      spread: 0.45,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: 0.3,
      seed: shot.seed + shot.index * 7,
      count: Math.max(4, Math.round(12 * detail)),
      fast: [7, 15],
      size: 0.09,
    },
    ramp[4],
    forward + 1
  );
  const dug = struck - 0.05;
  layDirtJet(drawn, buries, cell, dug, shot.seed + shot.index * 3, (burst ? 1.1 : 1.9) * power, forward, back);
  layDirtJet(
    drawn,
    buries,
    cell,
    dug - 0.04,
    shot.seed + shot.index * 3 + 1,
    (burst ? 0.7 : 1.3) * power,
    forward,
    way
  );
  layChips(
    drawn,
    {
      at: buries,
      way: { x: way.x * 0.5, y: way.y * 0.5, z: 1 },
      spread: 0.7,
      cell,
      floorZ: shot.floorZ,
      since: dug,
      lastsS: Math.min(1.3, shot.ends - shot.lands - 0.05),
      seed: shot.seed + shot.index * 13,
      count: Math.max(3, Math.round(9 * detail)),
      fast: [1.5, 4],
      up: [3, 7],
      size: [0.08, 0.2],
      colors: DIRT_CHIPS,
    },
    forward
  );
  layDustKick(drawn, buries, cell, dug, shot.seed + shot.index, 1.5 * power, forward, {
    color: KICKED,
    count: burst ? 2 : 5,
    lastsS: 0.8,
  });
  layPock(drawn, buries, cell, dug, left, shot.seed + shot.index, 0.5 * power, ramp[3]);
};
