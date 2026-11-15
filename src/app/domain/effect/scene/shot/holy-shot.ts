import { sign } from '@axe/domain/effect/scene/ailment/ailment-parts';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { glow, hueOf, type Point, wayBetween } from '@axe/domain/effect/scene/parts';
import { floorMark } from '@axe/domain/effect/scene/parts';
import {
  detailOf,
  type FiredShot,
  offsetBy,
  powerOf,
  runOf,
  type ShotLook,
} from '@axe/domain/effect/scene/shot/shot-flight';
import { floorUnder, layHitFlash, layVapourRing, vapourRingOf } from '@axe/domain/effect/scene/shot/shot-parts';

/*
 * A shot of holy light. It is the point of a spear: long, drawn to a tip before and to a thread
 * behind, white at its heart in gold, with a rim of deep gold that keeps it on a bright floor. A halo
 * rides on it, a ring about the shaft behind its point, and a smaller one behind that; a cross of
 * light burns at its tip; and feathers are shed along its way, which hang, turn and drift down after
 * it has passed. Where it strikes a ring of gold opens about the way it came and feathers are thrown
 * up, the light it lands with being drawn by the look it lands in.
 */

/** How long the spear is, and how wide at its widest, in cells. */
const LONG = 2.6;
const WIDE = 0.62;
/** How many feathers it sheds along its way, how long each hangs, and how many it throws up where it strikes. */
const SHED = 5;
const FEATHER_S = 1.1;
const THROWN = 6;
const DEEP_GOLD = '#7a4c00';
const FEATHER = '#fffdf2';

/** A feather at a moment: let go at a point, it drifts down and aside, turning, and thins away. */
function layFeather(
  drawn: Staged,
  from: Point,
  age: number,
  cell: number,
  seed: number,
  forward: number,
  thrown: Point | null
): void {
  if (age < 0 || age >= 1) return;
  const sways = Math.sin(age * 5 + seed) * cell * 0.3;
  const out = thrown ? 1 - (1 - age) ** 2 : 0;
  const at = {
    x: from.x + sways + (thrown?.x ?? 0) * out,
    y: from.y + Math.cos(age * 4 + seed * 1.7) * cell * 0.15 + (thrown?.y ?? 0) * out,
    z: from.z + (thrown?.z ?? 0) * out - cell * 0.9 * age * age,
  };
  drawn.motes.push(
    sign('feather', at, cell * 0.55, FEATHER, Math.min(1, age / 0.08) * (1 - age) ** 0.8, forward + 1, {
      spin: seed + age * 4,
    })
  );
}

/** Draws a shot of holy light at a moment: see the header. */
export const drawHolyShot: ShotLook = (drawn, shot: FiredShot, ramp) => {
  const { cell, seconds: t } = shot;
  const since = t - shot.launch;
  if (since < 0) return;
  const power = powerOf(shot.grade);
  const detail = detailOf(shot.shots);
  const forward = cell * 0.4;
  const hue = hueOf(ramp);
  const flies = Math.max(shot.lands - shot.launch, 0.02);
  const share = since / flies;
  const shed = Math.max(2, Math.round(SHED * detail));

  for (let feather = 0; feather < shed; feather++) {
    const letGo = (feather + 0.5) / shed;
    const age = (since - letGo * flies) / FEATHER_S;
    const from = shot.pathAt(letGo);
    layFeather(
      drawn,
      { ...from, z: from.z + cell * 0.2 },
      age,
      cell,
      shot.seed + feather * 2.3 + shot.index,
      forward,
      null
    );
  }

  if (share < 1) {
    const at = shot.pathAt(share);
    const { way } = wayBetween(shot.pathAt(Math.max(0, share - 0.03)), shot.pathAt(Math.min(1, share + 0.03)));
    const long = Math.min(cell * LONG * power, wayBetween(shot.from, at).length + cell * 0.6);
    const wide = cell * WIDE * power;
    const points = [1, 0.5, 0.2, -0.12].map((behind) => offsetBy(at, way, -long * behind));
    const widths = [0, 0.3, 1, 0].map((part) => part * wide);
    const tail = [1.9, 1].map((behind) => offsetBy(at, way, -long * behind));
    drawn.ribbons.push({ points: tail, widths: [0, wide * 0.3], color: ramp[4], alpha: 0.8, blend: 'light' });
    const rings = [
      vapourRingOf(offsetBy(at, way, -long * 0.3), way, wide * 1.05, wide * 0.17, '#fff3c4', 1, shot.floorZ),
      vapourRingOf(offsetBy(at, way, -long * 0.58), way, wide * 0.7, wide * 0.13, '#fff3c4', 0.9, shot.floorZ),
    ];
    for (const ring of rings) drawn.ribbons.push({ ...ring.far, color: DEEP_GOLD, alpha: 0.8 });
    drawn.ribbons.push(
      { points, widths: widths.map((width) => width * 1.4), color: DEEP_GOLD, alpha: 0.75, blend: 'color', soft: 0.3 },
      { points, widths, color: hue, core: ramp[5], alpha: 1, blend: 'color' },
      { points, widths: widths.map((width) => width * 0.42), color: '#ffffff', alpha: 1, blend: 'color' }
    );
    for (const ring of rings) {
      drawn.ribbons.push(
        { ...ring.near, widths: (ring.near.widths as number) * 1.9, color: DEEP_GOLD, alpha: 0.7 },
        ring.near
      );
    }
    const tip = offsetBy(at, way, long * 0.1);
    for (const [spin, trail] of [
      [0, 6.5],
      [Math.PI / 2, 4],
    ] as const) {
      drawn.motes.push({ ...glow(tip, wide * 0.42, '#ffffff', 1, forward + 2), shape: 'flare', trail, spin });
      drawn.motes.push({
        ...glow(tip, wide * 0.8, ramp[4], 0.8, forward + 1),
        shape: 'flare',
        trail: trail * 0.7,
        spin,
      });
    }
    drawn.motes.push(glow(at, wide * 2.2, ramp[4], 0.35, forward));
    drawn.floor.push(floorMark('disc', floorUnder(at, shot.floorZ), cell * 1.3, 1, ramp[4], 0.3, 'light', 0));
    drawn.lights.push({ ...at, color: ramp[4], strength: 1.2, reachPx: cell * 3 });
  }

  const struck = t - shot.lands;
  if (struck < 0) return;
  const { way } = wayBetween(shot.pathAt(0.94), shot.pathAt(1));
  layHitFlash(drawn, shot.to, shot.floorZ, cell, struck, 0.18, 2.2 * power, ramp, shot.seed + shot.index, forward, 8);
  for (const [lag, color] of [
    [0, '#fff3c4'],
    [0.05, hue],
  ] as const) {
    const open = (struck - lag) / 0.4;
    if (open < 0 || open >= 1) continue;
    layVapourRing(
      drawn,
      shot.to,
      way,
      cell * power * (0.3 + 1.6 * (1 - (1 - open) ** 2)),
      cell * 0.15 * (1 - open * 0.6),
      color,
      1 - open,
      shot.floorZ
    );
  }
  const next = runOf(shot, 7);
  const thrown = Math.max(3, Math.round(THROWN * detail));
  for (let feather = 0; feather < thrown; feather++) {
    const turn = next() * Math.PI * 2;
    const out = cell * (0.6 + next() * 0.9);
    layFeather(drawn, shot.to, struck / (FEATHER_S * 1.2), cell, shot.seed + feather * 1.9, forward, {
      x: Math.cos(turn) * out,
      y: Math.sin(turn) * out,
      z: cell * (0.8 + next() * 1.1),
    });
  }
};
