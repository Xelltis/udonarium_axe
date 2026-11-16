import { type CurseLook, curseLookOf } from '@axe/domain/effect/ailment-looks';
import { drawBind } from '@axe/domain/effect/scene/ailment/ailment-bind';
import { drawBleed, drawPoison } from '@axe/domain/effect/scene/ailment/ailment-body';
import { drawBurn } from '@axe/domain/effect/scene/ailment/ailment-burn';
import { drawFear } from '@axe/domain/effect/scene/ailment/ailment-fear';
import { drawCharm, drawConfuse, drawSleep } from '@axe/domain/effect/scene/ailment/ailment-mind';
import {
  afflictedOf,
  byHead,
  litSign,
  onBody,
  popIn,
  scatter,
  SIGN_RIGHT,
  SIGN_SIZE,
  SIGN_UP,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { drawBlind, drawSilence, drawSlow } from '@axe/domain/effect/scene/ailment/ailment-senses';
import { drawPetrify } from '@axe/domain/effect/scene/ailment/ailment-stone';
import { drawShock } from '@axe/domain/effect/scene/ailment/shock';
import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, glow, haze, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * A curse, and the states that are drawn in its place. The curse itself: a dark circle turning on
 * the floor under the piece and tendrils of shadow rising round it, motes of its colour drawn in and
 * swallowed, a stain creeping up the body from the feet, and a skull risen over the head as it takes
 * hold, its sockets lit, swelling at every beat. A curse whose particles name a state is that state
 * instead; see the looks of each.
 */

/** A curse itself: see the header. */
function drawCurse(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'curse');
  const { cell, t, ramp } = a;
  const shown = a.shown;
  const floor = a.floor;
  const forward = cell * 0.2;
  if (shown <= 0) return drawn;
  const shadow = mixColor(a.hue, '#120a18', 0.45);
  drawn.floor.push(floorMark('disc', floor, cell * 1.8, 1, a.hue, 0.55 * shown, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 1.1, 1, shadow, 0.6 * shown, 'color', 0));
  drawn.floor.push(
    floorMark('sigil', floor, cell * 1.2, 0.09, ramp[3], 0.85 * shown, 'light', stage.seed % 13, -t * 0.5)
  );
  for (let index = 0; index < 9; index++) {
    const turn = (index / 9) * Math.PI * 2 + t * 0.6;
    const out = cell * (0.55 + 0.25 * Math.sin(index * 2.1 + t));
    const at = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.25 };
    drawn.motes.push(smokePuff(at, cell * 1.1, index % 2 === 0 ? a.hue : shadow, 0.6 * shown, forward));
  }
  for (let index = 0; index < 7; index++) {
    const rise = (t * 0.5 + index / 7) % 1;
    const turn = (index / 7) * Math.PI * 2 + Math.sin(t * 2 + index) * 0.4;
    const out = cell * 0.45;
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + rise * cell * 1.6,
    };
    const fade = Math.min(1, rise * 4, (1 - rise) * 2.5) * shown;
    drawn.motes.push({
      ...smokePuff(at, cell * 0.7, shadow, 0.8 * fade, forward),
      shape: 'plume',
      velocity: { x: -Math.cos(turn) * cell * 0.3, y: -Math.sin(turn) * cell * 0.3, z: cell },
      trail: 0.8,
    });
  }
  for (let index = 0; index < 14; index++) {
    const closing = (t * 0.8 + index / 14) % 1;
    const turn = index * 2.4 + t;
    const out = cell * 1.6 * (1 - closing);
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.3 + ((index * 5) % 7) * 0.12),
    };
    drawn.motes.push({
      ...glow(at, cell * 0.06, ramp[4], closing * shown, forward),
      shape: 'spark',
      velocity: { x: -Math.cos(turn) * cell * 2, y: -Math.sin(turn) * cell * 2, z: 0 },
      trail: 0.08,
    });
  }
  drawn.motes.push(haze({ ...floor, z: floor.z + cell * 0.5 }, cell * 3.2, a.hue, 0.75 * shown, forward));
  drawn.motes.push(haze({ ...floor, z: floor.z + cell * 0.4 }, cell * 2, shadow, 0.6 * shown, forward + 1));
  drawn.motes.push(glow({ ...floor, z: floor.z + cell * 0.6 }, cell * 1.2, ramp[2], 0.3 * shown, forward));

  const salt = stage.seed % 41;
  const crept = within(t, 0.1, Math.max(0.5, a.duration * 0.6));
  for (let index = 0; index < 12; index++) {
    const share = (index + 0.5) / 12;
    const reached = within(crept * 0.72, share * 0.72, share * 0.72 + 0.08);
    if (reached <= 0) continue;
    const at = onBody(a, scatter(index, salt) * Math.PI * 2, 0.04 + share * 0.7, 0.12 + 0.2 * scatter(index, salt + 1));
    const size = cell * (0.3 + 0.16 * scatter(index, salt + 2)) * reached * (1 + 0.08 * Math.sin(t * 3 + index));
    drawn.motes.push({
      ...smokePuff(at, size, index % 3 ? '#2a1638' : shadow, 0.6 * shown, a.over),
      exactDepth: true,
    });
  }
  const risen = popIn(a.since, 0.3) * (1 + 0.1 * a.pulse);
  if (risen > 0) {
    const hung = byHead(a, SIGN_RIGHT, SIGN_UP + 0.03 * Math.sin(t * 2.1));
    const pale = mixColor(ramp[4], '#ffffff', 0.5);
    litSign(drawn, 'skull', hung.at, cell * SIGN_SIZE * 1.1 * risen, pale, a.hue, shown, cell * 0.6, {
      spin: Math.sin(t * 1.6) * 0.12,
      core: a.pulse > 0.4 ? '#ffffff' : ramp[3],
      aside: hung.aside,
    });
  }
  takeHold(drawn, a, ramp[3], 0.7);
  drawn.lights.push({ ...floor, z: floor.z + cell * 0.6, color: ramp[3], strength: 0.6 * shown, reachPx: cell * 2 });
  return drawn;
}

/** How each look of a curse is drawn. */
const DRAWN_AS: Record<CurseLook, (stage: Stage) => Staged> = {
  poison: drawPoison,
  bleed: drawBleed,
  burn: drawBurn,
  sleep: drawSleep,
  petrify: drawPetrify,
  confuse: drawConfuse,
  charm: drawCharm,
  fear: drawFear,
  blind: drawBlind,
  silence: drawSilence,
  slow: drawSlow,
  bind: drawBind,
  shock: drawShock,
  curse: drawCurse,
};

/** A curse: see the header. */
export const curse: Choreography = {
  lingerS: 0.6,
  draw: (stage) => DRAWN_AS[curseLookOf(stage.preset)](stage),
};
