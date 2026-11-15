import { within } from '@axe/domain/effect/scene/choreography';
import { drawFlashDisc } from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, lightBall, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { layCasing, layMuzzleFlash } from '@axe/domain/effect/scene/shot/gun-parts';
import { leftAt, offsetBy, powerOf, type ShotLook } from '@axe/domain/effect/scene/shot/shot-flight';
import {
  alongFloor,
  DIRT,
  layChips,
  layCurl,
  layDirtJet,
  layDustKick,
  layHitFlash,
  layPock,
  laySpray,
  layVapourRing,
  streakTonesOf,
} from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A sniper's shot. Before it is fired it is aimed: a thread of red light runs from the muzzle to the
 * target and a red dot trembles on it, and as the aim settles the sight glints. Then one shot: the
 * muzzle flashes, and the whole of the line stands white at once, from the muzzle through the target
 * and past it, rings of vapour opening along it. The round goes through, light spraying on behind the
 * target, and buries itself in the ground beyond in a jet of dirt, smoke curling up off the target.
 * The line it flew is left as a trail of vapour, which swells, wavers and drifts up as it thins.
 */

/** The red of the sight. */
const SIGHT = '#ff2a22';
/** How long the line stands white, and how long the trail of vapour it leaves hangs, in seconds. */
const STANDS_S = 0.09;
const VAPOUR_S = 1.3;
/** How long a curl of smoke rises off where it struck, in seconds. */
const CURL_S = 1.7;
/** How far behind the target the round goes into the ground, and how far past it the line stands, in cells. */
const THROUGH_CELLS = 2.2;
const PAST_CELLS = 1.4;
/** How many rings of vapour open along the line, and how long each takes, in seconds. */
const RINGS = 3;
const RING_S = 0.38;
const VAPOUR = '#f2f4f7';

/** Draws a sniper's shot at a moment: see the header. */
export const drawSniperShot: ShotLook = (drawn, shot, ramp) => {
  const { cell, seconds: t, from, to } = shot;
  const tones = streakTonesOf(ramp);
  const power = powerOf(shot.grade);
  const forward = cell * 0.5;
  const { way, length } = wayBetween(from, to);
  const aims = shot.index === 0 ? Math.min(shot.launch, 0.45) : 0;
  const aimed = t - (shot.launch - aims);
  if (aimed < 0) return;

  if (t < shot.launch) {
    const settled = aimed / aims;
    const trembles = cell * 0.12 * (1 - settled);
    const dot: Point = {
      x: to.x + Math.sin(t * 61) * trembles,
      y: to.y + Math.cos(t * 47) * trembles,
      z: to.z + Math.sin(t * 53 + 1) * trembles,
    };
    drawn.ribbons.push({
      points: [from, dot],
      widths: cell * 0.07,
      color: SIGHT,
      alpha: 0.55 + 0.4 * settled,
      blend: 'color',
    });
    drawn.ribbons.push({ points: [from, dot], widths: cell * 0.2, color: SIGHT, alpha: 0.35, blend: 'light' });
    drawn.motes.push(glow(dot, cell * 0.8, SIGHT, 0.8, forward + 1));
    drawn.motes.push(lightBall(dot, cell * (0.3 - 0.1 * settled), SIGHT, 1, forward + 2));
    drawn.motes.push(lightBall(dot, cell * 0.1, '#ffffff', 1, forward + 3));
    const glints = within(settled, 0.5, 1);
    if (glints > 0) {
      for (const [spin, trail] of [
        [0, 7],
        [Math.PI / 2, 3.5],
      ] as const) {
        drawn.motes.push({
          ...glow(from, cell * 0.22 * glints * power, '#ffffff', glints, forward + 2),
          shape: 'flare',
          trail,
          spin,
        });
      }
      drawn.motes.push(glow(from, cell * 1.1 * glints, '#ffffff', 0.7 * glints, forward + 1));
    }
    return;
  }

  const since = t - shot.launch;
  const left = leftAt(shot);
  const buries = alongFloor(to, way, cell * THROUGH_CELLS, shot.floorZ);
  const exit = wayBetween(to, buries);
  layMuzzleFlash(
    drawn,
    { at: from, way, cell, floorZ: shot.floorZ, since, seed: shot.seed + shot.index, power: power * 1.5, smokes: true },
    tones,
    forward
  );
  layCasing(drawn, from, way, cell, shot.floorZ, since - 0.25, left, shot.seed * 7 + shot.index, forward);

  const line = [from, to, offsetBy(to, way, cell * PAST_CELLS)];
  if (since < STANDS_S) {
    const stands = 1 - since / STANDS_S;
    const wide = cell * power * (0.2 + 0.22 * stands);
    drawn.ribbons.push(
      { points: line, widths: wide * 1.7, color: tones.dark, alpha: 0.8, blend: 'color', soft: 0.4 },
      { points: line, widths: wide, color: tones.hue, core: tones.core, alpha: 1, blend: 'color' },
      { points: line, widths: wide * 0.5, color: '#ffffff', alpha: 1, blend: 'color' }
    );
  }
  if (since < VAPOUR_S) {
    const age = since / VAPOUR_S;
    const steps = 14;
    const points: Point[] = [];
    for (let step = 0; step <= steps; step++) {
      const along = step / steps;
      const on = offsetBy(from, way, length * along);
      const wavers = Math.sin(along * 19 + shot.seed) * cell * 0.22 * age;
      points.push({
        x: on.x + wavers * way.y,
        y: on.y - wavers * way.x,
        z: on.z + cell * (0.5 * age + 0.2 * age * Math.sin(along * 11)),
      });
    }
    drawn.ribbons.push({
      points,
      widths: cell * power * (0.2 + 0.6 * age),
      color: VAPOUR,
      alpha: 0.8 * (1 - age) ** 1.5,
      blend: 'color',
      soft: 0.75,
      torn: 0.5,
      flowed: since * 1.5,
    });
    if (since < 0.4) {
      drawn.ribbons.push({
        points: line,
        widths: cell * 0.09 * power,
        color: tones.core,
        alpha: 1 - since / 0.4,
        blend: 'color',
      });
    }
  }
  for (let ring = 0; ring < RINGS; ring++) {
    const along = (ring + 0.6) / (RINGS + 0.4);
    const open = (since - ring * 0.012) / RING_S;
    if (open < 0 || open >= 1) continue;
    layVapourRing(
      drawn,
      offsetBy(from, way, length * along),
      way,
      cell * power * (0.15 + (0.35 + 0.15 * ring) * (1 - (1 - open) ** 2)),
      cell * 0.08 * (1 - open * 0.5),
      VAPOUR,
      0.85 * (1 - open),
      shot.floorZ
    );
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  layHitFlash(drawn, to, shot.floorZ, cell, struck, 0.2, 4.2 * power, ramp, shot.seed, forward, 8);
  drawFlashDisc(drawn, to, cell * 0.9 * power, ramp, struck, 0.06);
  layCurl(drawn, to, cell, struck, Math.min(CURL_S, shot.ends - shot.lands - 0.2), shot.seed, 1.1 * power, forward);
  const open = struck / 0.34;
  if (open < 1) {
    layVapourRing(
      drawn,
      to,
      way,
      cell * power * (0.25 + 0.75 * (1 - (1 - open) ** 2)),
      cell * 0.1 * (1 - open * 0.5),
      '#ffffff',
      (1 - open) ** 0.7,
      shot.floorZ
    );
  }
  laySpray(
    drawn,
    {
      at: to,
      way: { x: -way.x, y: -way.y, z: -way.z },
      spread: 1,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: 0.4,
      seed: shot.seed + 3,
      count: 20,
      fast: [5, 14],
      size: 0.1,
    },
    ramp[4],
    forward + 1
  );
  laySpray(
    drawn,
    {
      at: to,
      way: exit.way,
      spread: 0.35,
      cell,
      floorZ: shot.floorZ,
      since: struck,
      lastsS: 0.45,
      seed: shot.seed + 9,
      count: 22,
      fast: [8, 20],
      size: 0.11,
    },
    ramp[4],
    forward + 1
  );
  const dug = struck - 0.03;
  layDirtJet(drawn, buries, cell, dug, shot.seed, 2.4 * power, forward, way);
  layDirtJet(drawn, buries, cell, dug - 0.05, shot.seed + 1, 1.6 * power, forward, { x: -way.x, y: -way.y, z: 0 });
  layChips(
    drawn,
    {
      at: buries,
      way: { x: way.x * 0.5, y: way.y * 0.5, z: 1 },
      spread: 0.8,
      cell,
      floorZ: shot.floorZ,
      since: dug,
      lastsS: Math.min(1.5, shot.ends - shot.lands - 0.03),
      seed: shot.seed + 13,
      count: 12,
      fast: [1.5, 5],
      up: [3, 8],
      size: [0.08, 0.22],
      colors: [DIRT, '#4a3a2c', '#8a6f55'],
    },
    forward
  );
  layDustKick(drawn, buries, cell, dug, shot.seed, 2 * power, forward, { count: 6, lastsS: 1 });
  layPock(drawn, buries, cell, dug, left, shot.seed, 0.65 * power, ramp[3]);
};
