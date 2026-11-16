import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawLens, layDish, type Pebble, pebbleAt, pebblesOf } from '@axe/domain/effect/scene/space/crush-parts';
import {
  type CrushDetail,
  crushDetailOf,
  drawFallingRings,
  drawSmoulder,
  drawSqueezed,
  drawWell,
  layWarpedGround,
} from '@axe/domain/effect/scene/space/crush-well';
import { type BoldTones, boldTonesOf, layBoldBand, layBoldFloorRing } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf, tippedCircle } from '@axe/domain/effect/scene/space/space-parts';
import { crushLetsGoAt, spaceBeatAt } from '@axe/domain/effect/space-looks';

/*
 * A crush. A lens of black opens over the target's head, its rim burning and heavy rings wound round
 * it, and the air bends in towards it: the floor under the piece darkens and bends down into a well,
 * heavy rings close on the piece and climb to the lens, a cone of pressure gathers between them, and
 * grit, dust and pebbles streak in off the floor and up into it. Then it comes down: a white beat, the
 * cone slammed down on the piece, the floor driven down into a black crater with a lip of torn earth,
 * dust and stones squeezed out flat from under it in a heavy ring, and the piece pressed down hard and
 * held, heavy rings falling on it again and again while the cracks burn. The lens lets go and falls in
 * on itself; the pebbles it held drop and bounce, the crater smoulders and the dust settles over it.
 */

const LINGER_S = SCENE_LINGER_S.gravity ?? 1.5;
const DUST = '#7a6a5c';

interface CrushThrow {
  readonly pebbles: readonly Pebble[];
  readonly dropped: readonly ThrownMote[];
}
const crushByStage = new Map<string, CrushThrow>();

/** The air bending in on the piece: heavy rings closing on it and climbing to the lens, and rings closing over the floor. */
function drawBending(
  drawn: Staged,
  floor: Point,
  lens: Point,
  tones: BoldTones,
  cell: number,
  t: number,
  bent: number,
  detail: CrushDetail
): void {
  if (bent <= 0.01) return;
  for (let ring = 0; ring < detail.rings; ring++) {
    const closing = (t * 1.25 + ring / detail.rings) % 1;
    const middle = { x: floor.x, y: floor.y, z: floor.z + (lens.z - floor.z) * (0.15 + 0.85 * closing * closing) };
    const alpha = bent * Math.min(1, closing * 4) * (1 - closing);
    layBoldBand(
      drawn,
      tippedCircle(middle, cell * (0.4 + 1.2 * (1 - closing)), detail.steps, 0, 0),
      {
        rim: tones.rim,
        body: tones.body,
        core: tones.hot,
        glow: tones.hot,
        lit: 0.4 * alpha,
        wide: cell * 0.12,
        alpha,
      },
      middle,
      0.6
    );
    layBoldFloorRing(drawn, floor, cell * (0.3 + 2 * (1 - closing)), 0.08, tones, alpha);
  }
}

/** Grit and dust streaking in off the floor and up into the lens, faster as they close on it. */
function drawStreaking(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  lens: Point,
  tones: BoldTones,
  pull: number,
  forward: number
): void {
  if (pull <= 0.01) return;
  const { cell } = stage;
  const t = stage.seconds;
  for (let streak = 0; streak < 26; streak++) {
    const turn = scatterOf(streak, 3) * Math.PI * 2;
    const out = cell * (0.5 + 1.5 * scatterOf(streak, 5));
    const closing = (t * (1.1 + scatterOf(streak, 7)) + scatterOf(streak, 11)) % 1;
    const eased = closing * closing;
    const from = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.03 };
    const at = {
      x: from.x + (lens.x - from.x) * eased,
      y: from.y + (lens.y - from.y) * eased,
      z: from.z + (lens.z - from.z) * eased,
    };
    const speed = cell * (2 + 10 * closing);
    const far = Math.hypot(lens.x - from.x, lens.y - from.y, lens.z - from.z) || 1;
    const velocity = {
      x: ((lens.x - from.x) / far) * speed,
      y: ((lens.y - from.y) / far) * speed,
      z: ((lens.z - from.z) / far) * speed,
    };
    const fade = Math.min(1, closing * 5, (1 - closing) * 6) * pull;
    const spark = { ...at, shape: 'spark' as const, velocity, trail: 0.07 };
    drawn.motes.push({ ...spark, size: cell * 0.13, color: tones.rim, alpha: 0.9 * fade, blend: 'color', forward });
    drawn.motes.push({
      ...spark,
      size: cell * 0.1,
      color: streak % 2 ? DUST : tones.body,
      alpha: fade,
      blend: 'color',
      forward: forward + 0.5,
    });
    if (streak % 3 === 0) {
      drawn.motes.push({
        ...spark,
        size: cell * 0.04,
        color: tones.core,
        alpha: fade,
        blend: 'color',
        forward: forward + 1,
      });
    }
  }
}

/** The beat as the lens comes down: a heavy ring slammed down from it onto the floor, the floor struck white for an instant and the air lit. */
function drawStrike(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  lens: Point,
  tones: BoldTones,
  since: number,
  forward: number
): void {
  const { cell } = stage;
  if (since < 0.11) {
    const fell = since / 0.11;
    const middle = { x: floor.x, y: floor.y, z: lens.z - (lens.z - floor.z - cell * 0.04) * Math.sqrt(fell) };
    layBoldBand(
      drawn,
      tippedCircle(middle, cell * (0.5 + 1.3 * fell), 36, 0, 0),
      {
        rim: tones.rim,
        body: tones.hot,
        core: '#ffffff',
        glow: tones.hot,
        lit: 1,
        wide: cell * (0.34 - 0.12 * fell),
        alpha: 1,
      },
      middle,
      0.85
    );
  }
  if (since < 0.12) {
    const left = 1 - since / 0.12;
    drawn.floor.push(floorMark('disc', floor, cell * 2.6, 1, tones.hot, 0.35 * left, 'light', 0));
    drawn.motes.push(glow(lens, cell * 2.6, tones.hot, 0.8 * left, forward + 2));
    drawn.motes.push({ ...glow(lens, cell * 0.5, '#ffffff', left, forward + 3), shape: 'flare', trail: 10, spin: 0 });
    drawn.motes.push({
      ...glow(floor, cell * 0.7, '#ffffff', left, forward + 3),
      velocity: { x: 0, y: 0, z: -1000 },
      shape: 'spark',
      trail: (lens.z - floor.z) / 1000,
    });
    drawn.lights.push({
      ...floor,
      z: floor.z + cell * 0.3,
      color: tones.hot,
      strength: 1.8 * left,
      reachPx: cell * 3.4,
    });
  }
}

/** A crush: see the header. */
export function drawCrush(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration, tall } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const strikes = stage.blowsAt[0] ?? spaceBeatAt('crush', duration);
  const letsGo = Math.max(strikes + 0.2, crushLetsGoAt(duration));
  const since = t - strikes;
  const tones = boldTonesOf(stage.preset.colorSecondary, stage.preset.colorPrimary);
  const detail = crushDetailOf(stage.targets.length);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const lens = { x: stage.x, y: stage.y, z: stage.z + tall + cell * 0.85 };
  const under = { ...lens, z: lens.z - cell * 0.7 };
  const forward = cell * 0.5;
  const thrown = keptFor(crushByStage, stageKey(stage, ends), () => {
    const pebbles = pebblesOf(stage.seed, 9, cell);
    const th = throwerFor(stage, ends);
    const dropped = pebbles.map((pebble) => {
      const at = pebbleAt(pebble, floor, lens, letsGo, strikes, cell);
      return th.mote({
        ...at,
        vx: th.range(-0.6, 0.6) * cell,
        vy: th.range(-0.6, 0.6) * cell,
        vz: th.range(0, 0.8) * cell,
        bornAt: letsGo,
        life: th.lifeOf(letsGo, 1.6, 2.4),
        gravity: th.fall,
        drag: 0.3,
        bounce: 0.3,
      });
    });
    return { pebbles, dropped };
  });
  const opened = outCubic(within(t, 0.02, strikes * 0.7));
  const freed = within(t, letsGo, letsGo + 0.14);
  const lensOf =
    since < 0 ? opened * (1 - 0.2 * within(t, strikes * 0.6, strikes)) : (1 - freed) * (1 + 0.08 * Math.sin(t * 22));
  const lensRadius = cell * 0.44 * lensOf;
  const hot = since >= 0 ? Math.max(0, 1 - since / 0.2) : within(t, strikes * 0.6, strikes);

  if (since < 0) {
    layWarpedGround(drawn, floor, cell, tones, t, 0.75 * opened, stage.seed);
    drawWell(
      drawn,
      floor,
      under,
      cell * 0.55,
      tones,
      cell,
      t,
      0.6 * within(t, strikes * 0.2, strikes),
      detail,
      forward,
      -1
    );
    drawBending(drawn, floor, under, tones, cell, t, opened, detail);
    drawStreaking(drawn, stage, floor, lens, tones, opened, forward);
  } else {
    const held = 1 - within(t, letsGo - 0.05, letsGo + 0.1);
    const lasts = ends - strikes;
    layWarpedGround(
      drawn,
      floor,
      cell,
      tones,
      t,
      Math.max(held, 0.6 * (1 - within(t, letsGo, letsGo + 0.6))),
      stage.seed
    );
    layDish(drawn, floor, cell, tones, since, lasts, held, stage.seed);
    drawSqueezed(drawn, floor, tones, cell, since, lasts, stage.seed, forward);
    drawWell(drawn, floor, under, cell * 0.55, tones, cell, t, held, detail, forward);
    drawFallingRings(drawn, floor, under, tones, cell, t, 3, held, detail);
    drawStrike(drawn, stage, floor, lens, tones, since, forward);
    drawSmoulder(drawn, floor, tones, cell, t - letsGo, ends - letsGo, forward);
  }
  if (t < letsGo) {
    for (const pebble of thrown.pebbles) {
      const at = pebbleAt(pebble, floor, lens, t, strikes, cell);
      drawn.motes.push({
        ...at,
        size: cell * pebble.size,
        color: STONE,
        alpha: Math.min(1, t * 8),
        blend: 'color',
        shape: 'chunk',
        spin: t * pebble.spin,
        variant: pebble.variant,
        forward,
      });
    }
  } else {
    for (const [index, mote] of thrown.dropped.entries()) {
      const at = moteAt(mote, t);
      if (!at) continue;
      drawn.motes.push({
        ...at,
        size: cell * thrown.pebbles[index].size,
        color: STONE,
        alpha: Math.min(1, (1 - at.age) * 3),
        blend: 'color',
        shape: 'chunk',
        spin: at.landed ? index : t * thrown.pebbles[index].spin,
        variant: thrown.pebbles[index].variant,
        forward,
      });
    }
  }
  drawLens(drawn, lens, lensRadius, tones, hot, t, stage.seed, forward, detail.steps + 6);
  if (t >= letsGo && t < letsGo + 0.3) {
    const left = 1 - (t - letsGo) / 0.3;
    drawn.motes.push({ ...glow(lens, cell * 1.1 * left, '#ffffff', left, forward + 5), shape: 'star', spin: 0.4 });
    drawn.motes.push(glow(lens, cell * 1.8, tones.hot, 0.6 * left, forward + 4));
  }
  if (since < 0) {
    drawn.lights.push({ ...lens, color: tones.hot, strength: 0.4 + 0.8 * opened, reachPx: cell * 2.4 });
  } else if (t < letsGo) {
    drawn.lights.push({ ...lens, color: tones.hot, strength: 0.9, reachPx: cell * 2.6 });
  }
  return drawn;
}
