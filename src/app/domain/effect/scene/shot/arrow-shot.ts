import { acrossOf, glow, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { arrowBody, stuckArrow } from '@axe/domain/effect/scene/shot/bodies';
import {
  aboutWay,
  detailOf,
  type FiredShot,
  leftAt,
  offsetBy,
  powerOf,
  runOf,
  type ShotLook,
} from '@axe/domain/effect/scene/shot/shot-flight';
import {
  alongFloor,
  floorUnder,
  layChips,
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
 * An arrow shot from a bow. The string snaps as it is loosed; the arrow flies on a low arc, its shaft,
 * head and feathers large enough to be seen, a glint on its head and pale lines of speed drawn out
 * behind it. It strikes with a thunk: a star of light for an instant, splinters and a kick of dust, and
 * the arrow is left standing in what it struck, quivering until it is still, and stays there until
 * the look clears. The arrows of a volley stand side by side where each struck.
 *
 * An arrow of the highest grade goes through. It is held drawn for a breath first, light running in
 * to its head, and loosed it flies flat in a sheath of light, a cone of vapour
 * rings opens about it as it passes through the target, light sprays on behind, and it flies on to
 * bury itself in the ground beyond, the line it flew hanging white in the air behind it.
 */

/** How large the arrow is drawn, against the cell. */
const BODY = 1.7;
/** How high the arc of an arrow is, as a share of how far it flies, and at the most, in cells. */
const ARC = 0.07;
const ARC_MOST_CELLS = 1.1;
/** How wide the sheath of light an arrow that goes through flies in is, in cells. */
const SHEATH = 0.3;
/** How far an arrow that goes through flies on beyond its target, in cells. */
const THROUGH_CELLS = 2.8;
/** How long an arrow that goes through is held drawn before it is loosed, at the most, in seconds. */
const DRAWS_S = 0.1;
/** How long the string of the bow is seen snapping, and how long a line of flight hangs, in seconds. */
const SNAP_S = 0.16;
const HANGS_S = 0.5;
/** How far a stuck arrow quivers at first, in radians, how fast, and how soon it is still. */
const QUIVER = 0.34;
const QUIVER_RATE = 58;
const QUIVER_DIES = 7;
const WOOD = ['#d9b98a', '#8a6a3c', '#f2e2c0'] as const;
const STRING = '#f4f0e6';

/** A point kept over the floor. */
function overFloor(point: Point, floorZ: number): Point {
  return { ...point, z: Math.max(point.z, floorZ + 1) };
}

/** Whether an arrow goes through what it strikes: one of the highest grade. */
function goesThrough(shot: FiredShot): boolean {
  return shot.grade === 3;
}

/** Where an arrow is at a share of its flight: along its course, lifted on a low arc unless it flies flat. */
function arcOf(shot: FiredShot, flat: boolean): (along: number) => Point {
  const { length } = wayBetween(shot.from, shot.to);
  const high = flat ? 0 : Math.min(length * ARC, shot.cell * ARC_MOST_CELLS);
  return (along) => {
    const on = shot.pathAt(along);
    return { x: on.x, y: on.y, z: on.z + Math.sin(Math.PI * along) * high };
  };
}

/** An arrow standing where it struck, its head at `tip`, quivering as it was `since` seconds ago that it struck. */
function layStuck(
  drawn: Parameters<ShotLook>[0],
  tip: Point,
  way: Point,
  size: number,
  since: number,
  left: number,
  ramp: readonly string[]
): void {
  const { lift } = acrossOf(way);
  const swung = QUIVER * Math.exp(-since * QUIVER_DIES) * Math.sin(since * QUIVER_RATE);
  const leaning = {
    x: way.x * Math.cos(swung) + lift.x * Math.sin(swung),
    y: way.y * Math.cos(swung) + lift.y * Math.sin(swung),
    z: way.z * Math.cos(swung) + lift.z * Math.sin(swung),
  };
  drawn.ribbons.push(...stuckArrow(tip, leaning, size, ramp, left));
}

/**
 * An arrow that goes through as it is drawn, `drawn` of the way to being loosed: nocked on a string
 * pulled back into a V, light running in to its head, which kindles brighter as it is held.
 */
function layDrawn(
  drawn: Parameters<ShotLook>[0],
  shot: FiredShot,
  pathAt: (along: number) => Point,
  size: number,
  pulled: number,
  ramp: readonly string[]
): void {
  const { cell } = shot;
  const forward = cell * 0.5;
  const { way } = wayBetween(pathAt(0), pathAt(0.04));
  const { lift } = acrossOf(way);
  const head = offsetBy(shot.from, way, size * (0.45 - 0.2 * pulled));
  const nock = offsetBy(head, way, -size * 1.1);
  const tips = [-1, 1].map((aside) =>
    overFloor(offsetBy(offsetBy(shot.from, lift, aside * cell * 0.9), way, cell * 0.15), shot.floorZ)
  );
  const string = [tips[0], nock, tips[1]];
  drawn.ribbons.push(
    { points: string, widths: cell * 0.14, color: '#190608', alpha: 0.6, blend: 'color', soft: 0.5 },
    { points: string, widths: cell * 0.06, color: STRING, alpha: 1, blend: 'color' }
  );
  drawn.ribbons.push(...arrowBody(head, way, size, ramp, shot.floorZ + 1, false));
  const next = runOf(shot, 9);
  for (let mote = 0; mote < 9; mote++) {
    const turn = next() * Math.PI * 2;
    const lag = next() * 0.5;
    const closed = Math.min(1, Math.max(0, (pulled - lag) / (1 - lag)));
    const out = cell * 1.5 * (1 - closed);
    if (closed <= 0 || out < cell * 0.05) continue;
    const across = aboutWay(way, turn);
    drawn.motes.push({
      ...glow(
        overFloor(offsetBy(head, across, out), shot.floorZ),
        cell * 0.1,
        closed < 0.6 ? ramp[4] : '#ffffff',
        0.5 + 0.5 * closed,
        forward
      ),
      shape: 'spark',
      velocity: { x: -across.x * cell * 8, y: -across.y * cell * 8, z: -across.z * cell * 8 },
      trail: 0.05,
    });
  }
  drawn.motes.push(glow(head, cell * (0.6 + 1.2 * pulled), ramp[4], 0.35 + 0.45 * pulled, forward));
  for (const [spin, trail] of [
    [0, 5.5],
    [Math.PI / 2, 3],
  ] as const) {
    drawn.motes.push({
      ...glow(head, cell * (0.12 + 0.3 * pulled), '#ffffff', 0.5 + 0.5 * pulled, forward + 1),
      shape: 'flare',
      trail,
      spin: spin + pulled * 0.6,
    });
  }
}

/** Draws one arrow at a moment: see the header. */
export const drawArrowShot: ShotLook = (drawn, shot, ramp) => {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const through = goesThrough(shot);
  const power = powerOf(shot.grade);
  const detail = detailOf(shot.shots);
  const size = cell * BODY * (through ? 1.1 : 1);
  const forward = cell * 0.5;
  const tones = streakTonesOf(ramp);
  const pathAt = arcOf(shot, through);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const draws = through ? Math.min(DRAWS_S, flies * 0.45) : 0;
  const loosed = since - draws;
  const share = Math.max(0, loosed) / (flies - draws);
  const left = leftAt(shot);
  const arrives = wayBetween(pathAt(0.96), pathAt(1)).way;

  if (loosed < 0) layDrawn(drawn, shot, pathAt, size, since / draws, ramp);
  if (loosed >= 0 && loosed < SNAP_S) {
    const snapped = loosed / SNAP_S;
    const { way } = wayBetween(pathAt(0), pathAt(0.04));
    const { lift } = acrossOf(way);
    const bowed = cell * 0.4 * Math.cos(snapped * Math.PI * 3) * (1 - snapped);
    const points = [-1, -0.5, 0, 0.5, 1].map((along) =>
      overFloor(
        offsetBy(offsetBy(shot.from, lift, along * cell * 0.9), way, bowed * (1 - along * along) - cell * 0.15),
        shot.floorZ
      )
    );
    drawn.ribbons.push(
      { points, widths: cell * 0.14, color: tones.dark, alpha: 0.6 * (1 - snapped), blend: 'color', soft: 0.5 },
      { points, widths: cell * 0.06, color: STRING, alpha: 1 - snapped, blend: 'color' }
    );
    drawn.motes.push({
      ...glow(shot.from, cell * 0.5 * (1 - snapped), '#ffffff', 1 - snapped, forward),
      shape: 'star',
      spin: 0.4,
    });
  }

  if (loosed >= 0 && share < 1) {
    const at = pathAt(share);
    const { way } = wayBetween(pathAt(Math.max(0, share - 0.03)), pathAt(Math.min(1, share + 0.03)));
    if (through) {
      layStreak(drawn, offsetBy(at, way, -size * 2.4), offsetBy(at, way, size * 0.1), cell * SHEATH * power, tones);
      drawn.motes.push(glow(at, cell, tones.core, 0.45, forward));
    }
    for (const aside of [-1, 1]) {
      const { lift } = acrossOf(way);
      const from = offsetBy(offsetBy(at, way, -size * (2.6 + 0.5 * aside)), lift, aside * cell * 0.1);
      const to = offsetBy(offsetBy(at, way, -size * 0.9), lift, aside * cell * 0.06);
      drawn.ribbons.push({
        points: [{ ...from, z: Math.max(shot.floorZ + 1, from.z) }, to],
        widths: [0, cell * 0.07],
        color: '#ffffff',
        alpha: 0.85,
        blend: 'color',
        soft: 0.3,
      });
    }
    drawn.ribbons.push(...arrowBody(at, way, size, ramp, shot.floorZ + 1));
    drawn.motes.push({
      ...glow(offsetBy(at, way, -size * 0.1), cell * 0.42, '#ffffff', 0.95, forward + 1),
      shape: 'star',
      spin: since * 31,
    });
  }
  if (through && loosed >= 0 && since < flies + HANGS_S) {
    const fresh = 1 - Math.max(0, since - flies) / HANGS_S;
    layHungLine(drawn, [shot.from, pathAt(Math.min(1, share))], cell * 0.28 * power, fresh, tones);
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const under = floorUnder(shot.to, shot.floorZ);
  if (!through) {
    layHitFlash(
      drawn,
      shot.to,
      shot.floorZ,
      cell,
      struck,
      0.12,
      2.6 * power * (shot.shots > 1 ? 0.8 : 1),
      ramp,
      shot.seed + shot.index,
      forward,
      4
    );
    laySpray(
      drawn,
      {
        at: shot.to,
        way: { x: -arrives.x, y: -arrives.y, z: -arrives.z },
        spread: 1,
        cell,
        floorZ: shot.floorZ,
        since: struck,
        lastsS: 0.24,
        seed: shot.seed + shot.index * 3,
        count: Math.max(4, Math.round(10 * detail)),
        fast: [4, 10],
      },
      ramp[4],
      forward + 1
    );
    layChips(
      drawn,
      {
        at: shot.to,
        way: { x: -arrives.x, y: -arrives.y, z: -arrives.z },
        spread: 1,
        cell,
        floorZ: shot.floorZ,
        since: struck,
        lastsS: Math.min(1, shot.ends - shot.lands),
        seed: shot.seed + shot.index * 11,
        count: Math.max(3, Math.round(7 * detail)),
        fast: [1.5, 4.5],
        up: [1.5, 4.5],
        size: [0.07, 0.14],
        colors: WOOD,
        shape: 'flake',
      },
      forward
    );
    layDustKick(drawn, under, cell, struck, shot.seed + shot.index, 1.1 * power, forward, {
      count: shot.shots > 1 ? 2 : 4,
    });
    layStuck(drawn, offsetBy(shot.to, arrives, size * 0.16), arrives, size, struck, left, ramp);
    return;
  }

  layHitFlash(drawn, shot.to, shot.floorZ, cell, struck, 0.16, 2.2 * power, ramp, shot.seed + shot.index, forward, 8);
  for (let ring = 0; ring < 3; ring++) {
    const open = (struck - ring * 0.03) / 0.36;
    if (open < 0 || open >= 1) continue;
    layVapourRing(
      drawn,
      offsetBy(shot.to, arrives, -cell * 0.55 * ring),
      arrives,
      cell * power * (0.2 + (0.35 + 0.22 * ring) * (1 - (1 - open) ** 2)),
      cell * 0.1 * (1 - open * 0.5),
      '#ffffff',
      0.85 * (1 - open) ** 0.7,
      shot.floorZ
    );
  }
  const buries = alongFloor(shot.to, arrives, cell * THROUGH_CELLS, shot.floorZ);
  const exit = wayBetween(shot.to, buries);
  const speed = wayBetween(shot.from, shot.to).length / (flies - draws);
  const beyond = Math.max(0.03, exit.length / speed);
  const gone = struck / beyond;
  laySpray(
    drawn,
    {
      at: shot.to,
      way: exit.way,
      spread: 0.4,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: 0.35,
      seed: shot.seed + shot.index * 7,
      count: Math.max(6, Math.round(16 * detail)),
      fast: [7, 16],
      size: 0.1,
    },
    ramp[4],
    forward + 1
  );
  if (struck < beyond + HANGS_S) {
    const fresh = 1 - Math.max(0, struck - beyond) / HANGS_S;
    layHungLine(
      drawn,
      [shot.to, offsetBy(shot.to, exit.way, exit.length * Math.min(1, gone))],
      cell * 0.28 * power,
      fresh,
      tones
    );
  }
  if (gone < 1) {
    const at = offsetBy(shot.to, exit.way, exit.length * gone);
    layStreak(
      drawn,
      offsetBy(at, exit.way, -size * 2.4),
      offsetBy(at, exit.way, size * 0.1),
      cell * SHEATH * power,
      tones
    );
    drawn.ribbons.push(...arrowBody(at, exit.way, size, ramp, shot.floorZ + 1));
    return;
  }
  const dug = struck - beyond;
  layHitFlash(
    drawn,
    { ...buries, z: buries.z + cell * 0.2 },
    shot.floorZ,
    cell,
    dug,
    0.1,
    1.6 * power,
    ramp,
    shot.seed + 5,
    forward,
    4
  );
  layDirtJet(drawn, buries, cell, dug, shot.seed + shot.index, 1.5 * power, forward, exit.way);
  layChips(
    drawn,
    {
      at: buries,
      way: { x: exit.way.x * 0.5, y: exit.way.y * 0.5, z: 1 },
      spread: 0.8,
      cell,
      floorZ: shot.floorZ,
      since: dug,
      lastsS: Math.min(1.2, shot.ends - shot.lands - beyond),
      seed: shot.seed + shot.index * 13,
      count: Math.max(3, Math.round(8 * detail)),
      fast: [1.5, 4],
      up: [3, 6.5],
      size: [0.07, 0.18],
      colors: ['#6b5440', '#4a3a2c', '#8a6f55'],
    },
    forward
  );
  layDustKick(drawn, buries, cell, dug, shot.seed + shot.index, 1.6 * power, forward, { count: 5, lastsS: 0.8 });
  layPock(drawn, buries, cell, dug, left, shot.seed + shot.index, 0.45 * power, ramp[3]);
  layStuck(drawn, offsetBy(buries, exit.way, size * 0.22), exit.way, size, dug, left, ramp);
};
