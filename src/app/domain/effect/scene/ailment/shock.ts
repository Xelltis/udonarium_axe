import { clamp } from '@axe/core/util/clamp';
import { afflictedOf, onBody, overHead, scatter, sign } from '@axe/domain/effect/scene/ailment/ailment-parts';
import { nothingStaged, type Stage, type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/storm/lightning';

/*
 * A paralysis: the body caught in a current, small bolts crawling over it and leaping from one part
 * of it to another, reshaping every few hundredths of a second, and at every beat a harder jolt that
 * lights it up, throws the bolts down into the floor, sparks off it and knocks stars out of its
 * head; three more stars wheel round the head all the while, passing behind it, and a faint ring of
 * its colour lies under it.
 */

/** How long each jolt lasts, in seconds. */
const JOLT_S = 0.09;
/** How long the stars a jolt knocks out fly before they are gone, in seconds. */
const STARS_FLY_S = 0.36;

/** A paralysis: see the header. */
export function drawShock(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'shock');
  if (a.shown <= 0) return drawn;
  const { cell, t, ramp } = a;
  const shown = a.shown;
  const forward = cell * 0.35;
  const flicker = Math.floor(t / 0.05);
  const sinceJolt = a.since >= 0 ? a.phase * a.every : t % a.every;
  const jolting = sinceJolt < JOLT_S;
  const bodyAt = (turn: number, share: number): Point => onBody(a, turn, 0.07 + share * 0.93, 0.3);
  const next = seededRun(stage.seed * 131 + flicker * 17);
  const bolts = jolting ? 9 : 5;
  for (let bolt = 0; bolt < bolts; bolt++) {
    const turn = next() * Math.PI * 2;
    const share = next();
    const from = bodyAt(turn, share);
    const to = bodyAt(turn + (next() - 0.5) * 2.6, clamp(share + (next() - 0.5) * 0.9, 0, 1));
    drawn.ribbons.push(
      ...lightningRibbons(
        from,
        to,
        stage.seed + bolt,
        flicker,
        cell,
        ramp,
        (jolting ? 1 : 0.85) * shown,
        a.floor.z,
        0.36
      )
    );
  }
  if (jolting) {
    for (let bolt = 0; bolt < 3; bolt++) {
      const turn = next() * Math.PI * 2;
      const from = bodyAt(turn, next() * 0.3);
      const out = cell * (0.5 + next() * 0.5);
      const to = { x: a.floor.x + Math.cos(turn) * out, y: a.floor.y + Math.sin(turn) * out, z: a.floor.z };
      drawn.ribbons.push(
        ...lightningRibbons(from, to, stage.seed + 9 + bolt, flicker, cell, ramp, shown, a.floor.z, 0.22)
      );
    }
    for (let spark = 0; spark < 8; spark++) {
      const turn = next() * Math.PI * 2;
      const at = bodyAt(turn, next());
      const fast = cell * (3 + next() * 4);
      drawn.motes.push({
        ...glow(at, cell * 0.05, '#ffffff', shown, forward),
        shape: 'spark',
        velocity: { x: Math.cos(turn) * fast, y: Math.sin(turn) * fast, z: cell * (1 + next() * 3) },
        trail: 0.04,
      });
    }
  }
  const lit = (jolting ? 0.55 : 0.28) * shown;
  const chest = onBody(a, 0, 0.55, 0);
  drawn.motes.push(haze(chest, cell * 1.8, a.hue, lit, forward - 2));
  drawn.motes.push(glow(chest, cell * 1.3, ramp[4], lit, forward));
  drawn.floor.push(floorMark('ring', a.floor, cell * 0.6, 0.12, ramp[4], 0.6 * shown, 'light', 0));
  drawn.floor.push(floorMark('disc', a.floor, cell * 1, 1, a.hue, (jolting ? 0.35 : 0.15) * shown, 'light', 0));

  const gold = mixColor(ramp[4], '#ffe14a', 0.5);
  for (let index = 0; index < 3; index++) {
    const turn = t * 5.2 + (index / 3) * Math.PI * 2;
    const at = overHead(a, 0.06 + 0.07 * Math.sin(turn + 0.8), turn, 0.44);
    drawn.motes.push({
      ...sign('pentagram', at, cell * 0.32, gold, shown, 2, { spin: t * 3 + index }),
      exactDepth: true,
    });
  }
  if (sinceJolt < STARS_FLY_S && (a.since >= 0 || t >= a.every)) {
    const flown = sinceJolt / STARS_FLY_S;
    const round = a.beat * 5 + (stage.seed % 43);
    for (let index = 0; index < 5; index++) {
      const way = scatter(index, round) * Math.PI * 2;
      const fast = cell * (1.6 + 1.2 * scatter(index, round + 1));
      const up = cell * (1.6 + 1.4 * scatter(index, round + 2));
      const at = {
        x: a.head.x + Math.cos(way) * fast * sinceJolt,
        y: a.head.y + Math.sin(way) * fast * sinceJolt,
        z: a.head.z + up * sinceJolt - 4.5 * cell * sinceJolt * sinceJolt,
      };
      drawn.motes.push(
        sign('pentagram', at, cell * 0.3 * (1 - 0.4 * flown), gold, (1 - flown * flown) * shown, cell * 0.6, {
          spin: flown * 7 + index,
        })
      );
    }
  }
  drawn.lights.push({
    ...a.floor,
    z: a.foot.z + cell * 0.8,
    color: ramp[4],
    strength: (jolting ? 1.3 : 0.5) * shown,
    reachPx: cell * 2,
  });
  return drawn;
}
