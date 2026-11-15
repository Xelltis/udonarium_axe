import { type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { drawRisingLights } from '@axe/domain/effect/scene/holy/holy-parts';
import { layRipple, lightOf, type MendTones, twinkle } from '@axe/domain/effect/scene/holy/mend-parts';
import { ball, circlePoints, glow, haze, type Point, starBurst } from '@axe/domain/effect/scene/parts';

/*
 * The parts of the cleansings: the murk of what ails a piece, clinging to it in shreds of dark fog
 * and gathered into clots; a level ring of water drawn by halves; a crown of drops thrown up; and the
 * glints and light a clean piece is left with.
 *
 * Every length here is in table pixels.
 */

/** The colours of what ails: its shadow, its body and its paler heart. */
export const MURK_DEEP = '#1c0a2e';
export const MURK = '#55207c';
export const MURK_PALE = '#9a58c8';

/** A level ring of water at a height, drawn by halves: a dark sheath, a body of colour and a line of light. */
export function layWaterRing(
  drawn: Staged,
  middle: Point,
  radius: number,
  thick: number,
  tones: MendTones,
  alpha: number
): void {
  if (alpha <= 0.01 || radius < 1) return;
  const points = circlePoints(middle, radius, 36);
  const about = points.map(() => middle);
  for (const [half, seen] of [
    ['far', 1],
    ['near', 0.75],
  ] as const) {
    drawn.ribbons.push(
      {
        points,
        about,
        half,
        widths: thick * 1.8,
        color: tones.shade,
        alpha: 0.7 * alpha * seen,
        blend: 'color',
        soft: 0.4,
      },
      { points, about, half, widths: thick, color: tones.body, core: tones.pale, alpha: alpha * seen, blend: 'color' },
      {
        points,
        about,
        half,
        widths: thick * 0.55,
        color: tones.pale,
        core: '#ffffff',
        alpha: 0.9 * alpha * seen,
        blend: 'light',
        soft: 0.5,
      }
    );
  }
}

/** A clot of murk: a ragged dark ball with a paler one in it. */
export function drawClot(
  drawn: Staged,
  at: Point,
  size: number,
  alpha: number,
  variant: number,
  forward: number
): void {
  if (alpha <= 0.01 || size < 0.5) return;
  drawn.motes.push(ball(at, size * 1.25, MURK_DEEP, alpha, forward, variant));
  drawn.motes.push(ball(at, size * 0.85, MURK, alpha, forward + 0.3, variant + 1));
  drawn.motes.push(
    ball({ ...at, z: at.z + size * 0.12 }, size * 0.35, MURK_PALE, 0.8 * alpha, forward + 0.6, variant + 2)
  );
}

/** The murk clinging to a body between two heights: shreds of dark fog standing up off it, writhing. */
export function drawClinging(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  from: number,
  below: number,
  shown: number,
  forward: number
): void {
  if (shown <= 0.01) return;
  const { cell } = stage;
  const t = stage.seconds;
  const next = seededRun(stage.seed * 23 + 13);
  for (let index = 0; index < 9; index++) {
    const turn = next() * Math.PI * 2;
    const high = stage.tall * (0.08 + 0.8 * next());
    const size = cell * (0.42 + 0.2 * next());
    if (high > below || high < from) continue;
    const writhe = Math.sin(t * 5.3 + index * 2.1);
    const root = {
      x: floor.x + Math.cos(turn) * cell * 0.3,
      y: floor.y + Math.sin(turn) * cell * 0.3,
      z: floor.z + high,
    };
    const way = { x: Math.cos(turn) * 0.5 + writhe * 0.2, y: Math.sin(turn) * 0.5, z: 0.8 };
    const length = Math.hypot(way.x, way.y, way.z);
    const reach = size * 1.7;
    drawn.motes.push({
      x: root.x + (way.x / length) * reach,
      y: root.y + (way.y / length) * reach,
      z: root.z + (way.z / length) * reach,
      size,
      color: MURK_DEEP,
      core: MURK,
      alpha: 0.85 * shown,
      blend: 'color',
      shape: 'wisp',
      velocity: { x: (way.x / length) * 100, y: (way.y / length) * 100, z: (way.z / length) * 100 },
      trail: (reach - size) / 100,
      spin: t * 1.6 + index * 3.1,
      variant: index * 1.7,
      forward,
    });
  }
}

/** Drops thrown out from a point in a crown, arcing and falling, for half a second after `since` is 0. */
export function drawCrown(
  drawn: Staged,
  at: Point,
  cell: number,
  tones: MendTones,
  since: number,
  count: number,
  forward: number
): void {
  if (since < 0 || since >= 0.5) return;
  const left = 1 - since / 0.5;
  for (let drop = 0; drop < count; drop++) {
    const turn = (drop / count) * Math.PI * 2 + 0.3;
    const out = cell * (1.6 + (drop % 3) * 0.5) * since * (1 - since * 0.6);
    const up = cell * 2.6 * since - cell * 6.5 * since * since;
    const where = { x: at.x + Math.cos(turn) * out, y: at.y + Math.sin(turn) * out, z: at.z + up };
    drawn.motes.push(haze(where, cell * 0.24, tones.shade, 0.8 * left, forward));
    drawn.motes.push(haze(where, cell * 0.17, tones.bright, left, forward + 0.3));
    drawn.motes.push(glow(where, cell * 0.26, tones.pale, left, forward + 0.5));
  }
}

/**
 * What is left once a piece is clean, from a moment on: glints running over it, a light in it, motes
 * of light rising from the floor about it, and a last shine over its head before the end.
 */
export function drawClean(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  tones: MendTones,
  from: number,
  ends: number
): void {
  const { cell, duration } = stage;
  const t = stage.seconds;
  const forward = cell * 0.3;
  const clean = within(t, from, from + 0.3) * (1 - within(t, duration - 0.1, ends));
  if (clean <= 0.01) return;
  for (let glint = 0; glint < 6; glint++) {
    const phase = (t * 1.5 + glint / 6) % 1;
    const turn = glint * 2.4 + stage.seed;
    const at = {
      x: floor.x + Math.cos(turn) * cell * 0.42,
      y: floor.y + Math.sin(turn) * cell * 0.42,
      z: floor.z + stage.tall * (0.15 + 0.15 * glint) + cell * 0.1,
    };
    twinkle(drawn, at, cell * 0.55, tones, clean * Math.sin(phase * Math.PI), glint + t, forward + 1);
  }
  const body = { ...floor, z: floor.z + stage.tall * 0.5 };
  drawn.motes.push(haze(body, cell * 1.7, tones.bright, 0.3 * clean, forward));
  drawn.motes.push(glow(body, cell * 1.9, tones.pale, 0.35 * clean, forward));
  drawRisingLights(
    drawn,
    stage.seed + 3,
    floor,
    cell,
    t,
    lightOf(tones),
    { count: 14, out: [cell * 0.2, cell * 1.1], born: [from, Math.max(from + 0.1, duration - 0.3)], rise: cell * 1.5 },
    forward
  );
  const shines = duration * 0.86;
  const since = t - shines;
  if (since >= 0 && since < 0.4) {
    const left = 1 - since / 0.4;
    const head = { ...floor, z: floor.z + stage.tall + cell * 0.35 };
    drawn.motes.push(...starBurst(head, cell * 1.8, tones.bright, since / 0.4, forward + 1, 4, 0.4));
    twinkle(drawn, head, cell * 1.1 * left, tones, left, since * 3, forward + 1);
    layRipple(drawn, floor, cell * 0.5, cell * 2.2, tones, since / 0.4);
  }
}
