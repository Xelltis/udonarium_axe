import {
  afflictedOf,
  bodyVeil,
  countOf,
  onBody,
  roundOf,
  scatter,
  shaded,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow } from '@axe/domain/effect/scene/parts';

/*
 * A burning: small flames clinging to the body and one on the head, which catch all at once, flare
 * up at every beat and throw sparks, a thread of smoke rising off the head and the floor under the
 * piece lit by them.
 */

/** Where on a burning body its flames cling: a turn round it, a share of the way up it, and how large each is; the last is the one on its head. */
const FLAME_SEATS: readonly (readonly [number, number, number])[] = [
  [0.4, 0.28, 1],
  [2.3, 0.5, 0.9],
  [4.1, 0.38, 0.8],
  [5.6, 0.7, 0.85],
  [0, 1, 1.25],
];
/** How long a spark thrown off a flame flies, in seconds. */
const SPARK_S = 0.5;

/** A burning: see the header. */
export function drawBurn(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'burn');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const salt = stage.seed % 83;
  const hot = a.ramp[5];
  const body = a.light;
  const deep = mixColor(a.dark, a.light, 0.25);
  const caught = within(a.since, -0.12, 0.08);
  const flare = 1 + 0.55 * a.pulse + 0.9 * Math.max(0, 1 - Math.abs(a.since) / 0.14);
  drawn.floor.push(floorMark('disc', a.floor, cell * 0.8, 1, shaded(SMOKE, 0.2), 0.5 * a.shown * caught, 'color', 0));
  drawn.floor.push(
    floorMark('disc', a.floor, cell * 1.1, 1, body, (0.25 + 0.2 * a.pulse) * a.shown * caught, 'light', 0)
  );
  bodyVeil(drawn, a, deep, (0.14 + 0.2 * a.pulse) * caught);

  for (const [index, [turn, share, weight]] of FLAME_SEATS.entries()) {
    const onHead = index === FLAME_SEATS.length - 1;
    const root = onHead ? { ...a.head, z: a.head.z - cell * 0.08 } : onBody(a, turn + salt, share, 0.27);
    const waver = 0.82 + 0.18 * Math.sin(t * 13 + index * 2.3) + 0.1 * Math.sin(t * 29 + index);
    const wide = cell * 0.34 * weight * caught * (0.85 + 0.15 * flare);
    const long = cell * 0.7 * weight * waver * flare * caught;
    if (wide <= 0) continue;
    const lean = { x: Math.sin(t * 3.1 + index) * 0.16, y: Math.cos(t * 2.3 + index * 2) * 0.16, z: 1 };
    const flowed = t * 3.4 + index * 1.7;
    const forward = a.over + index;
    drawn.motes.push(glow({ ...root, z: root.z + long * 0.35 }, wide * 2.6, body, 0.4 * a.shown, forward));
    drawn.motes.push(
      flowingMote('lick', root, lean, wide * 1.25, long * 1.12, flowed, {
        color: deep,
        alpha: 0.95 * a.shown,
        forward,
        variant: index,
      })
    );
    drawn.motes.push(
      flowingMote('lick', root, lean, wide, long, flowed + 0.4, {
        color: body,
        core: hot,
        alpha: a.shown,
        forward: forward + 1,
        variant: index + 5,
      })
    );
    drawn.motes.push(
      flowingMote('lick', { ...root, z: root.z + wide * 0.1 }, lean, wide * 0.5, long * 0.55, flowed + 0.9, {
        color: '#fff6d8',
        alpha: 0.95 * a.shown,
        blend: 'light',
        forward: forward + 2,
        variant: index + 9,
      })
    );
    for (let spark = 0; spark < countOf(a, 3); spark++) {
      const age = a.phase * a.every - spark * 0.05;
      if (a.since < 0 || age < 0 || age > SPARK_S) continue;
      const way = scatter(spark + a.beat * 7, index + salt) * Math.PI * 2;
      const fast = cell * (0.5 + 0.9 * scatter(spark, index + a.beat));
      const rise = cell * (1.8 + 1.4 * scatter(spark + 3, index + a.beat));
      const at = {
        x: root.x + Math.cos(way) * fast * age,
        y: root.y + Math.sin(way) * fast * age,
        z: root.z + long * 0.5 + rise * age - 2.2 * cell * age * age,
      };
      drawn.motes.push({
        ...glow(at, cell * 0.08, hot, (1 - age / SPARK_S) * a.shown, forward + 3),
        shape: 'spark',
        velocity: { x: Math.cos(way) * fast, y: Math.sin(way) * fast, z: rise - 4.4 * cell * age },
        trail: 0.05,
      });
    }
  }

  for (let puff = 0; puff < countOf(a, 4); puff++) {
    const { life } = roundOf(t, 1.1, puff / 4);
    const from = {
      x: a.head.x + Math.sin(life * 4 + puff * 1.7) * cell * 0.1,
      y: a.head.y,
      z: a.head.z + cell * (0.35 + life * 0.9),
    };
    drawn.motes.push(
      flowingMote('wisp', from, { x: 0, y: 0, z: 1 }, cell * (0.16 + 0.2 * life), cell * 0.5, t + puff, {
        color: mixColor(SMOKE, deep, 0.15),
        alpha: 0.55 * Math.min(1, life * 5) * (1 - life) * a.shown * caught,
        forward: cell * 0.3,
        variant: puff,
      })
    );
  }
  takeHold(drawn, a, body, 1.1, 0.8);
  drawn.lights.push({
    ...onBody(a, 0, 0.6, 0),
    color: body,
    strength: (0.55 + 0.5 * a.pulse + 0.15 * Math.sin(t * 17)) * a.shown * caught,
    reachPx: cell * 2.4,
  });
  return drawn;
}
