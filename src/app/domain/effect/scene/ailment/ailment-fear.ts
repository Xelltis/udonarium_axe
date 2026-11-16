import {
  afflictedOf,
  type Aside,
  bodyVeil,
  byHead,
  countOf,
  INK,
  onBody,
  roundOf,
  scatter,
  takeHold,
} from '@axe/domain/effect/scene/ailment/ailment-parts';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { ball, floorMark, haze, smokePuff } from '@axe/domain/effect/scene/parts';

/*
 * A fear: a shadow with narrow eyes risen at the piece's shoulder, trailing down behind it, which
 * leans closer at every beat; gloom hung in strokes over the piece's face, cold sweat flung off its
 * head, and the dark closing in over the floor.
 */

/** How far the shadow stands off the head, in cells across the screen: to the right of it and over it. */
const SHADOW_RIGHT = 0.8;
const SHADOW_UP = 0.02;
/** How long a drop of sweat flies, in seconds. */
const SWEAT_S = 0.55;

/** A fear: see the header. */
export function drawFear(stage: Stage): Staged {
  const drawn = nothingStaged();
  const a = afflictedOf(stage, 'fear');
  if (a.shown <= 0) return drawn;
  const { cell, t } = a;
  const cold = mixColor(a.light, '#ffffff', 0.3);
  const gloom = mixColor(a.dark, INK, 0.45);
  const salt = stage.seed % 67;
  const risen = outCubic(within(a.since, -0.2, 0.25));
  const looms = 1 + 0.2 * a.pulse;
  drawn.floor.push(floorMark('disc', a.floor, cell * 1.5, 1, INK, 0.55 * a.shown, 'color', 0));
  if (a.since >= 0) {
    drawn.floor.push(
      floorMark('ring', a.floor, cell * (1.9 - 1.3 * a.phase), 0.12, gloom, 0.75 * a.phase * a.shown, 'color', 0)
    );
  }
  bodyVeil(drawn, a, mixColor(a.dark, a.light, 0.2), 0.26 + 0.12 * a.pulse);

  if (risen > 0) {
    const hung = byHead(a, SHADOW_RIGHT, SHADOW_UP * risen + 0.04 * Math.sin(t * 1.7));
    const wide = cell * 1.15 * risen * looms;
    const far = cell * 0.2;
    const off = (right: number, up: number): Aside => ({ right: hung.aside.right + right, up: hung.aside.up + up });
    for (let index = 0; index < 6; index++) {
      const turn = (index / 6) * Math.PI * 2 + t * 0.4;
      const reach = wide * (0.22 + 0.08 * Math.sin(t * 2.3 + index * 1.9));
      drawn.motes.push({
        ...smokePuff(hung.at, wide * 0.72, index % 2 ? gloom : INK, 0.95 * risen * a.shown, far),
        aside: off(Math.cos(turn) * reach, Math.sin(turn) * reach * 0.8),
      });
    }
    drawn.motes.push({ ...haze(hung.at, wide * 1.6, INK, 0.85 * risen * a.shown, far), aside: hung.aside });
    const trails = a.tall * 0.8;
    drawn.motes.push({
      ...smokePuff({ ...hung.at, z: hung.at.z - trails }, wide * 0.8, INK, 0.65 * risen * a.shown, far),
      shape: 'plume',
      velocity: { x: 0, y: 0, z: -cell },
      trail: trails / cell,
      aside: off(0, wide * 0.1),
    });
    const stare = (0.65 + 0.35 * a.pulse) * (0.85 + 0.15 * Math.sin(t * 23)) * risen * a.shown;
    const eyes = off(0, wide * 0.08);
    const front = far + cell * 0.5;
    drawn.motes.push({ ...ball(hung.at, wide * 0.72, INK, 0.92 * risen * a.shown, front, 3), aside: hung.aside });
    drawn.motes.push({
      ...ball(hung.at, wide * 0.6 * looms, '#ffffff', stare, front + 1, 0),
      shape: 'eyes',
      aside: eyes,
    });
    drawn.motes.push({
      ...ball(hung.at, wide * 0.52 * looms, cold, stare, front + 2, 0),
      shape: 'eyes',
      aside: eyes,
    });
  }

  for (let index = 0; index < 6; index++) {
    const top = onBody(a, (index / 6) * Math.PI * 2 + salt, 1.02, 0.24);
    const long = a.tall * (0.25 + 0.2 * scatter(index, salt)) * risen;
    const shake = Math.sin(t * 31 + index * 2) * cell * 0.012;
    drawn.ribbons.push({
      points: [
        { x: top.x + shake, y: top.y, z: top.z },
        { x: top.x - shake, y: top.y, z: top.z - long * 0.5 },
        { x: top.x + shake, y: top.y, z: top.z - long },
      ],
      widths: [cell * 0.05, cell * 0.04, 0],
      color: gloom,
      alpha: 0.85 * a.shown,
      blend: 'color',
    });
  }

  for (let index = 0; index < countOf(a, 5); index++) {
    const { life, round } = roundOf(t, SWEAT_S, index / 5);
    const age = life * SWEAT_S;
    const way = scatter(index + round * 7, salt + 3) * Math.PI * 2;
    const fast = cell * (0.9 + 0.6 * scatter(index, round + salt));
    const up = cell * 1.6;
    const from = onBody(a, way, 0.88, 0.22);
    const at = {
      x: from.x + Math.cos(way) * fast * age,
      y: from.y + Math.sin(way) * fast * age,
      z: from.z + up * age - 4.5 * cell * age * age,
    };
    drawn.motes.push({
      ...ball(at, cell * 0.11, cold, Math.min(1, (1 - life) * 2) * risen * a.shown, a.over + 2, index),
      shape: 'comet',
      velocity: { x: Math.cos(way) * fast, y: Math.sin(way) * fast, z: up - 9 * cell * age },
      trail: 0.04,
    });
  }

  takeHold(drawn, a, cold, 0.5, 0.7);
  drawn.lights.push({ ...a.head, color: a.light, strength: 0.3 * a.pulse * a.shown, reachPx: cell * 1.6 });
  return drawn;
}
