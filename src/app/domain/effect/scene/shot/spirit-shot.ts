import { ballBand } from '@axe/domain/effect/scene/beam/beam-body';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { drawFlashDisc, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, haze, hueOf, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { aboutWay, detailOf, offsetBy, powerOf, runOf, type ShotLook } from '@axe/domain/effect/scene/shot/shot-flight';
import { floorUnder, layHitFlash, layVapourRing, vapourRingOf } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A shot of spirit. It is gathered at the hands first: light runs in from all about, rings close on
 * it, and a ball swells there. Thrown, it is a ball pressed hard, white at its heart in its colour and
 * a dark rim, a shell of thin rings turning about it every way, and behind it a wake wound like a
 * corkscrew. Where it strikes it bursts with a clap: a white disc for an instant, a ring thrown open
 * about the way it came and another along the floor, and what is left of it hangs about the one struck
 * in a ring on the floor and a haze, and rises off it as threads of light.
 */

/** How wide the ball is, in cells. */
const BALL = 0.9;
/** How many rings turn about it, and how many strands its wake is wound of. */
const SHELL = 3;
const STRANDS = 2;
/** How long the wake is, in cells, and how many points each strand is drawn through. */
const WAKE_CELLS = 3.4;
const WAKE_POINTS = 11;
/** How long its motes rise after it bursts, in seconds. */
const RISES_S = 1.5;
const SHADOW = '#06122b';

/** Lays the ball at a point, as large as given, flying the way given, its shell turned as far as the moment says. */
function layBall(
  drawn: Staged,
  at: Point,
  way: Point,
  ball: number,
  t: number,
  ramp: readonly string[],
  floorZ: number,
  shell: number
): void {
  const hue = hueOf(ramp);
  const dark = mixColor(ramp[0], SHADOW, 0.65);
  const axes = Array.from({ length: shell }, (_unused, ring) => {
    const across = aboutWay(way, t * 7 + ring * 2.1);
    const tilt = 0.7 * Math.sin(t * 5 + ring * 1.7);
    const length = Math.hypot(1, tilt);
    return {
      x: (across.x + way.x * tilt) / length,
      y: (across.y + way.y * tilt) / length,
      z: (across.z + way.z * tilt) / length,
    };
  });
  const rings = axes.map((axis) => vapourRingOf(at, axis, ball * 0.68, ball * 0.1, '#ffffff', 0.95, floorZ));
  drawn.ribbons.push(...rings.map((ring) => ({ ...ring.far, color: ramp[3], alpha: 0.7 })));
  drawn.ribbons.push(
    ballBand(at, way, ball * 0.64, dark, 0.9, { torn: 0.2, flowed: t * 6 }),
    ballBand(at, way, ball * 0.5, hue, 1, { core: ramp[4], torn: 0.25, flowed: t * 9 }),
    ballBand(at, way, ball * 0.24, '#ffffff', 1)
  );
  drawn.ribbons.push(...rings.map((ring) => ring.near));
}

/** Draws a shot of spirit at a moment: see the header. */
export const drawSpiritShot: ShotLook = (drawn, shot, ramp) => {
  const { cell, seconds: t } = shot;
  const power = powerOf(shot.grade);
  const detail = detailOf(shot.shots);
  const ball = cell * BALL * power;
  const forward = cell * 0.4;
  const hue = hueOf(ramp);
  const shell = Math.max(2, Math.round(SHELL * detail));
  const gathers = shot.index === 0 ? Math.min(shot.launch, 0.3) : 0;
  const gathered = t - (shot.launch - gathers);
  if (gathered < 0) return;
  const aimed = wayBetween(shot.from, shot.to).way;

  if (t < shot.launch) {
    const full = gathered / gathers;
    const next = runOf(shot, 3);
    layBall(drawn, shot.from, aimed, ball * (0.25 + 0.75 * full), t, ramp, shot.floorZ, shell);
    for (let mote = 0; mote < 10; mote++) {
      const turn = next() * Math.PI * 2;
      const rise = (next() - 0.3) * 1.2;
      const lag = next() * 0.4;
      const closed = Math.min(1, full / (1 - lag));
      const out = cell * 1.8 * (1 - closed);
      if (out <= cell * 0.05) continue;
      const at = {
        x: shot.from.x + Math.cos(turn) * out,
        y: shot.from.y + Math.sin(turn) * out,
        z: shot.from.z + rise * out,
      };
      drawn.motes.push({
        ...glow(at, cell * 0.09, closed < 0.5 ? ramp[4] : '#ffffff', 0.4 + 0.6 * closed, forward),
        shape: 'spark',
        velocity: { x: -Math.cos(turn) * cell * 7, y: -Math.sin(turn) * cell * 7, z: -rise * cell * 7 },
        trail: 0.05,
      });
    }
    for (const lag of [0, 0.45]) {
      const closing = (full - lag) / (1 - lag);
      if (closing <= 0) continue;
      layVapourRing(
        drawn,
        shot.from,
        { x: 0, y: 0, z: 1 },
        cell * (1.7 - 1.3 * closing),
        cell * 0.08,
        ramp[4],
        0.8 * closing,
        shot.floorZ
      );
    }
    drawn.motes.push(glow(shot.from, ball * (1.5 + 1.5 * full), ramp[4], 0.5 * full, forward));
    drawn.floor.push(
      floorMark('disc', floorUnder(shot.from, shot.floorZ), cell * 1.6, 1, hue, 0.35 * full, 'light', 0)
    );
    drawn.lights.push({ ...shot.from, color: ramp[4], strength: 1.2 * full, reachPx: cell * 3 });
    return;
  }

  const since = t - shot.launch;
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const share = since / flies;
  if (share < 1) {
    const at = shot.pathAt(share);
    const { way } = wayBetween(shot.pathAt(Math.max(0, share - 0.03)), shot.pathAt(Math.min(1, share + 0.03)));
    const long = Math.min(cell * WAKE_CELLS * power, wayBetween(shot.from, at).length);
    for (let strand = 0; strand < STRANDS; strand++) {
      const points: Point[] = [];
      const widths: number[] = [];
      const alphas: number[] = [];
      for (let point = 0; point < WAKE_POINTS; point++) {
        const behind = point / (WAKE_POINTS - 1);
        const across = aboutWay(way, t * 26 + strand * Math.PI - behind * 6.5);
        const out = ball * (0.3 + 0.35 * behind);
        points.push(offsetBy(offsetBy(at, way, -long * behind - ball * 0.2), across, out));
        widths.push(ball * 0.3 * (1 - behind) ** 0.7);
        alphas.push((1 - behind) ** 1.2);
      }
      drawn.ribbons.push(
        {
          points,
          widths: widths.map((width) => width * 1.7),
          alphas,
          color: mixColor(ramp[0], SHADOW, 0.5),
          alpha: 0.6,
          blend: 'color',
          soft: 0.4,
        },
        { points, widths, alphas, color: hue, core: '#ffffff', alpha: 1, blend: 'color', torn: 0.2, flowed: t * 8 }
      );
    }
    drawn.motes.push(
      flowingMote(
        'wisp',
        offsetBy(at, way, -ball * 0.2),
        { x: -way.x, y: -way.y, z: -way.z },
        ball * 1.1,
        long * 0.8,
        t * 14,
        {
          color: hue,
          core: ramp[5],
          alpha: 0.6,
          forward,
          variant: shot.seed % 6,
        }
      ),
      glow(at, ball * 2.8, ramp[4], 0.6, forward)
    );
    layBall(drawn, at, way, ball, t, ramp, shot.floorZ, shell);
    drawn.floor.push(floorMark('disc', floorUnder(at, shot.floorZ), cell * 1.2, 1, hue, 0.3, 'light', 0));
    drawn.lights.push({ ...at, color: ramp[4], strength: 1.2, reachPx: cell * 3 });
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const { way } = wayBetween(shot.pathAt(0.94), shot.pathAt(1));
  layHitFlash(drawn, shot.to, shot.floorZ, cell, struck, 0.2, 3.6 * power, ramp, shot.seed + shot.index, forward, 8);
  drawFlashDisc(drawn, shot.to, ball * 1.8, ramp, struck, 0.07);
  for (const [lag, color, reach] of [
    [0, '#ffffff', 1.25],
    [0.06, ramp[3], 0.85],
  ] as const) {
    const open = (struck - lag) / 0.34;
    if (open < 0 || open >= 1) continue;
    layVapourRing(
      drawn,
      shot.to,
      way,
      cell * power * (0.3 + reach * (1 - (1 - open) ** 2)),
      cell * 0.12 * (1 - open * 0.5),
      color,
      (1 - open) ** 0.7,
      shot.floorZ
    );
  }
  layShockRing(drawn, floorUnder(shot.to, shot.floorZ), cell * 0.3, cell * 2.2 * power, cell * 0.16, hue, struck, 0.42);
  if (struck >= RISES_S) return;
  const age = struck / RISES_S;
  const fades = (1 - age) ** 1.1;
  drawn.floor.push(
    floorMark(
      'ring',
      floorUnder(shot.to, shot.floorZ),
      cell * power * (0.7 + 0.3 * age),
      0.12,
      hue,
      0.7 * fades,
      'color',
      0
    )
  );
  drawn.motes.push(haze(shot.aim, cell * 1.6 * power, hue, 0.35 * fades, forward - 1));
  const next = runOf(shot, 5);
  const count = Math.max(6, Math.round(16 * detail));
  for (let mote = 0; mote < count; mote++) {
    const turn = next() * Math.PI * 2;
    const out = cell * (0.25 + next() * 0.55) * power;
    const lag = next() * 0.5;
    const up = Math.max(0, (age - lag) / (1 - lag));
    if (up <= 0 || up >= 1) continue;
    const speed = cell * (1.6 + next() * 1.4);
    const at = {
      x: shot.aim.x + Math.cos(turn + up * 2) * out,
      y: shot.aim.y + Math.sin(turn + up * 2) * out,
      z: shot.floorZ + cell * 0.1 + speed * up * RISES_S * (1 - lag) * 0.6,
    };
    const shown = Math.sin(Math.PI * Math.min(1, up * 1.4)) ** 0.6;
    const rising = { x: 0, y: 0, z: speed };
    drawn.motes.push(
      { ...glow(at, cell * 0.16, hue, shown, forward), blend: 'color', shape: 'spark', velocity: rising, trail: 0.12 },
      {
        ...glow(at, cell * 0.08, mote % 3 === 0 ? '#ffffff' : ramp[5], shown, forward + 1),
        shape: 'spark',
        velocity: rising,
        trail: 0.1,
      }
    );
  }
};
