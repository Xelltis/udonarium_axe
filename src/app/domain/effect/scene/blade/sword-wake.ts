import type { GreatSwordTiming } from '@axe/domain/effect/great-sword-looks';
import type { SwordPaint } from '@axe/domain/effect/scene/blade/sword-paint';
import { type SwordPose, underTorrent } from '@axe/domain/effect/scene/blade/sword-pose';
import { outCubic, type Staged, type StageTarget, within } from '@axe/domain/effect/scene/choreography';
import { crag, earthTonesOf } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { DUST, SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, lightningPaths, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { drawWindWake } from '@axe/domain/effect/scene/wind/wind-sword';

/*
 * What the torrent of a great sword leaves along the whole of its path once it has passed: streaks
 * of its light thrown up off the whole length of it as it thins, motes of its light drifting up, and what its element leaves: smoke and small flames along the score of a
 * torrent of fire; frost on the floor and flakes sifting down after one of ice; lightning still
 * crawling along the score of one of thunder; a line of crags torn up out of the ground by one of
 * earth, heaved up one after another as the torrent ran, with dust hanging over them; a black smoke
 * lying low after one of shadow; stars twinkling out after one of light; and curls of wind turning
 * along the path of one of wind, with leaves coming down.
 */

/** How many motes drift up along the path. */
const DRIFTING = 42;
/** How many streaks of light are thrown up off the path as the torrent thins, how high they go, in cells, and how long each takes, in seconds. */
const ASCENDING = 46;
const ASCENDS_CELLS = 4.5;
const ASCENDS_S = 0.7;
/** How long the torrent took to run its length, in seconds: the crags heave as it reaches each. */
const RAN_S = 0.15;
/** How far apart the crags of a torrent of earth stand, in cells, and how long each takes to rise, in seconds. */
const CRAG_APART_CELLS = 0.7;
const CRAG_RISES_S = 0.1;

/** What is told of a wake at a moment. */
export interface WakeLook {
  readonly timing: GreatSwordTiming;
  readonly seconds: number;
  /** How far gone everything it left is, from whole at 1 to cleared at 0. */
  readonly clearing: number;
  readonly seed: number;
  /** The pieces standing in the torrent's path, which nothing is heaved up under. */
  readonly pieces: readonly StageTarget[];
}

/** A place on the torrent's path a distance along it and aside from its middle, a height over the floor. */
function onPath(pose: SwordPose, by: number, aside: number, high: number): Point {
  const floor = underTorrent(pose, by, aside);
  return { ...floor, z: floor.z + high };
}

/** Draws what the torrent left at a moment; see the head of this file. */
export function drawWake(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: WakeLook): void {
  const U = pose.cell;
  const { timing, seconds: t, seed, clearing } = look;
  const since = t - timing.releasesAt;
  if (since <= 0) return;
  const forward = U * 0.3;
  const flows = timing.spentAt - timing.releasesAt;
  for (let index = 0; index < DRIFTING; index++) {
    const born = 0.12 + scatter(index, seed + 41) * (flows + 0.5);
    const life = 1.1 + scatter(index, seed + 42) * 1.2;
    const age = (since - born) / life;
    if (age <= 0 || age >= 1) continue;
    const by = pose.runs * (0.04 + 0.92 * scatter(index, seed + 43));
    const aside = (scatter(index, seed + 44) * 2 - 1) * pose.thick * 0.55 + Math.sin(since * 2.7 + index) * U * 0.08;
    const at = onPath(pose, by, aside, U * (0.1 + (0.5 + 0.9 * scatter(index, seed + 45)) * (since - born)));
    const seen = Math.min(1, age * 6, (1 - age) * 2) * clearing;
    const flicker = 0.65 + 0.35 * Math.sin(t * 19 + index * 2.3);
    drawn.motes.push(
      glow(at, U * (0.1 + 0.07 * (index % 3)), index % 2 === 0 ? paint.spark : paint.sheath, seen * flicker, forward)
    );
    if (paint.element === 'light' && index % 3 === 0) {
      drawn.motes.push({
        ...glow(at, U * 0.4, '#ffffff', seen * Math.abs(Math.sin(t * 8 + index)), forward + 1),
        shape: 'star',
        spin: index,
      });
    }
  }
  const thins = timing.thinsAt - timing.releasesAt;
  for (let index = 0; index < ASCENDING; index++) {
    const by = pose.runs * (0.03 + 0.95 * scatter(index, seed + 46));
    const born = thins * (0.55 + 0.45 * (by / pose.runs)) + scatter(index, seed + 47) * (flows - thins + 0.25);
    const age = (since - born) / (ASCENDS_S * (0.7 + 0.6 * scatter(index, seed + 48)));
    if (age <= 0 || age >= 1) continue;
    const aside = (scatter(index, seed + 49) * 2 - 1) * pose.thick * 0.5;
    const high = U * ASCENDS_CELLS * (0.5 + 0.5 * scatter(index, seed + 50));
    const at = onPath(pose, by, aside, U * 0.1 + high * outCubic(age));
    drawn.motes.push({
      ...glow(
        at,
        U * (0.07 + 0.05 * (index % 3)),
        paint.element === 'dark' ? paint.rim : index % 3 === 0 ? '#ffffff' : paint.spark,
        Math.min(1, age * 8, (1 - age) * 2) * clearing,
        forward
      ),
      shape: 'spark',
      velocity: { x: 0, y: 0, z: (high / ASCENDS_S) * 3 * (1 - age) * (1 - age) },
      trail: 0.09,
    });
  }
  const each = (count: number, lasts: number, draw: (index: number, age: number, by: number, born: number) => void) => {
    for (let index = 0; index < count; index++) {
      const by = pose.runs * (0.06 + 0.88 * scatter(index, seed + 51));
      const born = RAN_S * (by / pose.runs) + scatter(index, seed + 52) * flows;
      const age = (since - born) / lasts;
      if (age > 0 && age < 1) draw(index, age, by, born);
    }
  };
  switch (paint.element) {
    case 'fire':
      each(14, 1.5, (index, age, by) => {
        const at = onPath(pose, by, (scatter(index, 53) - 0.5) * pose.thick * 0.6, U * (0.3 + 1.6 * age));
        drawn.motes.push(
          smokePuff(at, U * (0.5 + 0.9 * age), SMOKE, 0.42 * Math.min(1, age * 5, (1 - age) * 1.6) * clearing, forward)
        );
      });
      each(16, 1.1, (index, age, by) => {
        const at = onPath(pose, by, (scatter(index, 54) - 0.5) * pose.thick * 0.5, U * 0.05);
        const flick = 0.7 + 0.3 * Math.sin(t * 23 + index * 1.9);
        drawn.motes.push({
          ...glow(
            at,
            U * (0.34 + 0.2 * scatter(index, 55)) * (1 - 0.6 * age) * flick,
            index % 2 === 0 ? paint.body : paint.sheath,
            Math.min(1, (1 - age) * 3) * clearing,
            forward
          ),
          blend: 'color',
          shape: 'tongue',
          velocity: { x: 0, y: 0, z: U * 1.6 },
          trail: 0.3,
          variant: index + Math.floor(t * 12),
        });
      });
      return;
    case 'ice':
      for (let patch = 0; patch < 9; patch++) {
        const by = pose.runs * ((patch + 0.5) / 9);
        const laid = outCubic(within(since, RAN_S * (by / pose.runs), RAN_S * (by / pose.runs) + 0.3));
        const floor = underTorrent(pose, by, (scatter(patch, seed + 56) - 0.5) * pose.thick * 0.5);
        drawn.floor.push(
          floorMark(
            'scorch',
            floor,
            U * (0.7 + 0.5 * scatter(patch, seed + 57)) * laid,
            1,
            '#e9f8ff',
            0.55 * clearing,
            'color',
            patch + (seed % 23)
          )
        );
        drawn.floor.push(
          floorMark('cracks', floor, U * 0.6 * laid, 0.25, '#ffffff', 0.5 * clearing, 'color', patch, patch)
        );
      }
      each(18, 1.7, (index, age, by) => {
        const at = onPath(pose, by, (scatter(index, 53) - 0.5) * pose.thick, U * (1.5 - 1.4 * age));
        drawn.motes.push({
          ...glow(
            at,
            U * (0.12 + 0.06 * (index % 3)),
            index % 2 === 0 ? '#ffffff' : paint.body,
            Math.min(1, age * 5, (1 - age) * 3) * clearing,
            forward
          ),
          blend: 'color',
          shape: 'flake',
          spin: t * (1.5 + (index % 3)) + index,
          variant: index,
        });
      });
      return;
    case 'thunder': {
      const crawling = 1 - within(t, timing.spentAt, timing.spentAt + 0.8);
      if (crawling <= 0) return;
      const flicker = Math.floor(t * 16);
      for (let crackle = 0; crackle < 4; crackle++) {
        if ((flicker + crackle) % 3 === 0) continue;
        const by = pose.runs * scatter(flicker * 3 + crackle, seed + 58);
        const from = onPath(pose, by, (scatter(flicker + crackle, 59) - 0.5) * U * 0.5, U * 0.06);
        const to = onPath(
          pose,
          by + U * (0.5 + scatter(crackle, flicker)),
          (scatter(flicker, crackle + 60) - 0.5) * U,
          U * (0.06 + 0.5 * scatter(crackle, 61))
        );
        const { main } = lightningPaths(from, to, seed + crackle, flicker, {
          bends: 6,
          jag: 0.25,
          forks: 0,
          floorZ: pose.floorZ,
        });
        drawn.ribbons.push(
          {
            points: main,
            widths: U * 0.16,
            color: paint.sheath,
            alpha: 0.45 * crawling * clearing,
            blend: 'light',
            soft: 1,
          },
          {
            points: main,
            widths: U * 0.05,
            color: paint.body,
            core: '#ffffff',
            alpha: crawling * clearing,
            blend: 'color',
          }
        );
      }
      return;
    }
    case 'earth':
      drawCragLine(drawn, pose, paint, look);
      each(12, 1.8, (index, age, by) => {
        const at = onPath(pose, by, (scatter(index, 53) - 0.5) * pose.thick * 0.9, U * (0.3 + 0.9 * age));
        drawn.motes.push(
          smokePuff(
            at,
            U * (0.6 + 0.9 * age),
            mixColor(DUST, paint.ramp[2], 0.2),
            0.45 * Math.min(1, age * 5, (1 - age) * 1.5) * clearing,
            forward
          )
        );
      });
      return;
    case 'wind':
      drawWindWake(drawn, pose, paint, look);
      return;
    case 'dark':
      each(16, 1.9, (index, age, by) => {
        const out = (scatter(index, 53) - 0.5) * pose.thick * (0.6 + 1.2 * age);
        const at = onPath(pose, by, out, U * (0.25 + 0.3 * age));
        drawn.motes.push(
          smokePuff(
            at,
            U * (0.6 + 0.8 * age),
            paint.inner,
            0.6 * Math.min(1, age * 5, (1 - age) * 1.5) * clearing,
            forward
          )
        );
      });
      return;
    default:
  }
}

/**
 * The line of crags a torrent of earth tears up out of the ground: one after another as the torrent
 * reaches each, to either side of its path by turns and leaning out from it, the nearer the taller,
 * none under a piece that stands in the path; veins of heat in them cool, and they sink back as
 * everything clears.
 */
function drawCragLine(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: WakeLook): void {
  const U = pose.cell;
  const since = look.seconds - look.timing.releasesAt;
  const tones = earthTonesOf(paint.ramp);
  const apart = U * CRAG_APART_CELLS;
  const count = Math.min(22, Math.floor((pose.runs - U * 0.8) / apart));
  const heat = 1 - within(since, 0.3, 1.6);
  for (let index = 0; index < count; index++) {
    const by = U * 0.8 + index * apart;
    const side = index % 2 === 0 ? 1 : -1;
    const aside = side * Math.min(pose.thick, U * 1.6) * (0.16 + 0.2 * scatter(index, look.seed + 61));
    const root = underTorrent(pose, by, aside);
    if (look.pieces.some((piece) => Math.hypot(piece.x - root.x, piece.y - root.y) < piece.widthPx * 0.55 + U * 0.2))
      continue;
    const heaves = RAN_S * (by / pose.runs);
    const risen = outCubic(within(since, heaves, heaves + CRAG_RISES_S));
    if (risen <= 0) continue;
    const lean = {
      x: -pose.way.y * side * 0.36 + pose.way.x * 0.3,
      y: pose.way.x * side * 0.36 + pose.way.y * 0.3,
      z: 1,
    };
    const size = Math.hypot(lean.x, lean.y, lean.z);
    const tall =
      U *
      (0.75 + 0.6 * scatter(index, look.seed + 62)) *
      (1 - 0.35 * (by / pose.runs)) *
      risen *
      (0.3 + 0.7 * look.clearing);
    drawn.motes.push(
      crag(
        root,
        { x: lean.x / size, y: lean.y / size, z: lean.z / size },
        tall,
        U * (0.3 + 0.1 * scatter(index, look.seed + 63)),
        tones.rock[index % 3],
        Math.min(1, look.clearing * 3),
        {
          variant: look.seed + index * 1.7,
          veins: 0.7 * heat,
          glow: paint.ember,
        }
      )
    );
  }
}
