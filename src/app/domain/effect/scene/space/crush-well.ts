import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { flowMote } from '@axe/domain/effect/scene/dark/dark-parts';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { STONE } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, haze, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { type BoldTones, layBoldBand, layBoldFloorRing } from '@axe/domain/effect/scene/space/space-bold';
import { scatterOf, tippedCircle } from '@axe/domain/effect/scene/space/space-parts';

/*
 * The weight of a crush: the well of pressure that bears down from the lens onto the floor about the
 * piece, the floor bent down into it and darkened, heavy rings falling down it and striking the floor,
 * and the dust and stones squeezed out from under it as it comes down, all in heavy bodies of colour.
 */

const DUST = '#6f5d4c';
const DUST_LIT = '#b9a585';

/** How much a crush draws about each piece: less where it is cast on many, to keep within a frame. */
export interface CrushDetail {
  readonly lines: number;
  readonly steps: number;
  readonly rings: number;
}

/** How much a crush draws about each piece, by how many it is cast on. */
export function crushDetailOf(targets: number): CrushDetail {
  if (targets > 3) return { lines: 7, steps: 18, rings: 2 };
  if (targets > 1) return { lines: 9, steps: 24, rings: 3 };
  return { lines: 12, steps: 30, rings: 3 };
}

/**
 * The well of pressure bearing down from the lens onto the floor: a cone of heavy lines about the
 * piece, drawn by halves, its pattern running down them, or up them for a `down` below nothing, bowed
 * in by the weight, and a haze of its colour within, as heavy as `weight`.
 */
export function drawWell(
  drawn: Staged,
  floor: Point,
  lens: Point,
  top: number,
  tones: BoldTones,
  cell: number,
  t: number,
  weight: number,
  detail: CrushDetail,
  forward: number,
  down = 1
): void {
  if (weight <= 0.01) return;
  const foot = cell * 1.05;
  const column = lens.z + cell * 0.6 - floor.z;
  drawn.motes.push({
    ...floor,
    z: floor.z + cell * 0.05,
    size: cell * 1.5,
    color: tones.rim,
    core: tones.body,
    alpha: 0.4 * weight,
    blend: 'color',
    shape: 'gust',
    velocity: { x: 0, y: 0, z: -100 },
    trail: Math.max(0, column - cell * 1.5) / 100,
    spin: t * 3 * down,
    variant: 3,
    forward: forward * 0.6,
  });
  for (let line = 0; line < detail.lines; line++) {
    const turn = (line / detail.lines) * Math.PI * 2 + t * 0.7 + scatterOf(line, 3) * 0.4;
    const from = 0.25 * scatterOf(line, 7);
    const points = [0, 0.35, 0.7, 1].map((share) => {
      const along = from + (1 - from) * share;
      const out = top + (foot - top) * along - cell * 0.18 * Math.sin(Math.PI * along) * weight;
      return {
        x: floor.x + Math.cos(turn) * out,
        y: floor.y + Math.sin(turn) * out,
        z: lens.z + (floor.z + cell * 0.04 - lens.z) * along,
      };
    });
    layBoldBand(
      drawn,
      points,
      {
        rim: tones.rim,
        body: tones.body,
        core: tones.hot,
        wide: cell * (0.09 + 0.06 * Math.sin(t * 9 + line * 1.7) ** 2),
        alpha: 0.8 * weight,
        alphas: [0, 0.8, 1, 0.85],
        torn: 0.6,
        flowed: -t * 7 * down - line,
      },
      points.map((point) => ({ x: floor.x, y: floor.y, z: point.z })),
      0.4
    );
  }
  for (let step = 0; step < 3; step++) {
    const at = { x: floor.x, y: floor.y, z: floor.z + (lens.z - floor.z) * (0.18 + 0.32 * step) };
    drawn.motes.push(haze(at, cell * (2.4 - 0.4 * step), tones.body, 0.16 * weight, forward * 0.4));
  }
  drawn.motes.push(haze({ ...floor, z: floor.z + cell * 0.2 }, cell * 2.6, tones.rim, 0.3 * weight, forward * 0.3));
}

/**
 * Heavy rings falling from the lens onto the floor, `rate` of them a second, faster as they fall, each
 * striking the floor in a ring of its colour as it lands.
 */
export function drawFallingRings(
  drawn: Staged,
  floor: Point,
  lens: Point,
  tones: BoldTones,
  cell: number,
  t: number,
  rate: number,
  weight: number,
  detail: CrushDetail
): void {
  if (weight <= 0.01) return;
  for (let ring = 0; ring < detail.rings; ring++) {
    const phase = (t * rate + ring / detail.rings) % 1;
    const fall = phase * phase;
    const middle = { x: floor.x, y: floor.y, z: lens.z - (lens.z - floor.z - cell * 0.06) * fall };
    const shown = weight * Math.min(1, phase * 3);
    layBoldBand(
      drawn,
      tippedCircle(middle, cell * (0.55 + 0.55 * fall), detail.steps, 0, 0),
      {
        rim: tones.rim,
        body: tones.body,
        core: tones.hot,
        glow: tones.hot,
        lit: 0.5 * shown,
        wide: cell * (0.12 + 0.12 * fall),
        alpha: shown,
      },
      middle,
      0.75
    );
    const landed = (phase - 0.82) / 0.18;
    if (landed > 0) {
      layBoldFloorRing(
        drawn,
        floor,
        cell * (1.1 + 0.5 * landed),
        0.12 * (1 - landed) + 0.03,
        tones,
        weight * (1 - landed)
      );
    }
  }
}

/**
 * The floor bent down into a well under the piece, as deep as `depth`: darkened more and more towards
 * its middle, rings of shadow drawn in closer and closer together towards it as they are pulled down
 * it, and spokes of shadow winding in.
 */
export function layWarpedGround(
  drawn: Staged,
  floor: Point,
  cell: number,
  tones: BoldTones,
  t: number,
  depth: number,
  seed: number
): void {
  if (depth <= 0.01) return;
  drawn.floor.push(floorMark('disc', floor, cell * 2.5, 1, tones.rim, 0.4 * depth, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 1.6, 1, tones.ink, 0.4 * depth, 'color', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 0.85, 1, tones.ink, 0.45 * depth, 'color', 0));
  const drift = (t * 0.9) % 1;
  for (let ring = 0; ring < 5; ring++) {
    const u = (ring + 1 - drift) / 5;
    const radius = cell * 2.4 * Math.pow(u, 1.5);
    const fade = depth * Math.min(1, (1 - u) * 6) * Math.min(1, u * 4);
    drawn.floor.push(floorMark('ring', floor, radius, 0.09 / Math.max(0.3, u), tones.rim, 0.85 * fade, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, 0.03 / Math.max(0.3, u), tones.body, 0.9 * fade, 'color', 0));
  }
  drawn.floor.push(
    floorMark('cracks', floor, cell * 2.3, 0.35, tones.rim, 0.55 * depth, 'color', (seed % 13) + 3, -t * 0.8)
  );
}

/**
 * Dust and stones squeezed out from under the lens along the floor as it comes down: a heavy ring of
 * dust racing out, low gusts and rolling clouds blown flat along the floor, and stones skidding out to
 * lie where they stop, gone over `lasts` seconds from the moment it comes down.
 */
export function drawSqueezed(
  drawn: Staged,
  floor: Point,
  tones: BoldTones,
  cell: number,
  since: number,
  lasts: number,
  seed: number,
  forward: number
): void {
  if (since < 0 || since >= lasts) return;
  const share = since / 0.6;
  if (share < 1) {
    const left = 1 - share;
    const radius = cell * (0.6 + 2 * outCubic(share));
    const width = (cell * (0.18 + 0.4 * left)) / radius;
    drawn.floor.push(floorMark('ring', floor, radius, Math.min(1, width * 1.6), tones.rim, 0.8 * left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, width, DUST, 0.95 * left, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius * 1.02, width * 0.3, DUST_LIT, 0.6 * left, 'color', 0));
    for (let gust = 0; gust < 14; gust++) {
      const turn = (gust / 14) * Math.PI * 2 + (seed % 7) * 0.4;
      const root = {
        x: floor.x + Math.cos(turn) * radius * 0.8,
        y: floor.y + Math.sin(turn) * radius * 0.8,
        z: floor.z + cell * 0.05,
      };
      drawn.motes.push({
        ...root,
        size: cell * 0.55 * (0.45 + 0.55 * left),
        color: DUST,
        core: DUST_LIT,
        alpha: 0.85 * left,
        blend: 'color',
        shape: 'gust',
        velocity: { x: Math.cos(turn) * 100, y: Math.sin(turn) * 100, z: 6 },
        trail: (cell * 1.1 * (0.4 + left)) / 100,
        spin: since * 5 + gust,
        variant: gust,
        forward,
      });
    }
  }
  for (let cloud = 0; cloud < 14; cloud++) {
    const age = (since - 0.03 * (cloud % 3)) / 1.6;
    if (age < 0 || age >= 1) continue;
    const turn = (cloud / 14) * Math.PI * 2 + (seed % 5) * 0.6 + 0.3;
    const out = cell * (0.8 + 2.2 * outCubic(Math.min(1, age * 2)));
    drawn.motes.push({
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.15 + 0.35 * age),
      size: cell * (0.7 + 0.8 * age),
      color: mixColor(DUST, tones.rim, 0.25),
      core: DUST_LIT,
      alpha: 0.75 * Math.min(1, age * 10) * (1 - age),
      blend: 'color',
      shape: 'billow',
      velocity: { x: Math.cos(turn) * 100, y: Math.sin(turn) * 100, z: 20 },
      trail: (cell * 0.3) / 100,
      spin: age * 2 + cloud,
      variant: cloud,
      forward,
    });
  }
  const fading = 1 - within(since, lasts * 0.7, lasts);
  for (let stone = 0; stone < 9; stone++) {
    const turn = scatterOf(stone, (seed % 41) + 3) * Math.PI * 2;
    const reach = cell * (1 + 1.4 * scatterOf(stone, 7));
    const slid = 1 - Math.exp(-5 * since);
    drawn.motes.push({
      x: floor.x + Math.cos(turn) * (cell * 0.5 + reach * slid),
      y: floor.y + Math.sin(turn) * (cell * 0.5 + reach * slid),
      z: floor.z + cell * 0.06,
      size: cell * (0.12 + 0.08 * scatterOf(stone, 11)),
      color: STONE,
      alpha: fading,
      blend: 'color',
      shape: 'chunk',
      spin: stone + slid * 6,
      variant: stone + 3,
      forward,
    });
  }
}

/** Wisps of dark smoke curling up off the cracks of a crater as it smoulders, gone over `lasts` seconds. */
export function drawSmoulder(
  drawn: Staged,
  floor: Point,
  tones: BoldTones,
  cell: number,
  since: number,
  lasts: number,
  forward: number
): void {
  for (let wisp = 0; wisp < 9; wisp++) {
    const born = 0.15 + 0.11 * wisp;
    const age = (since - born) / 1.3;
    if (age < 0 || age >= 1 || since >= lasts) continue;
    const turn = wisp * 2.39;
    const out = cell * (0.55 + 0.9 * scatterOf(wisp, 5));
    const root = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.1 };
    drawn.motes.push(
      flowMote(
        'wisp',
        { ...root, z: root.z + cell * 0.5 * age },
        { x: Math.cos(turn) * 0.2, y: Math.sin(turn) * 0.2, z: 1 },
        cell * (0.16 + 0.14 * age),
        cell * (0.4 + 0.6 * age),
        age * 3 + wisp,
        {
          color: mixColor(tones.rim, '#3a3440', 0.3),
          core: tones.body,
          alpha: 0.6 * Math.min(1, age * 6) * (1 - age),
          variant: wisp,
          forward,
        }
      )
    );
  }
  if (since < lasts * 0.6) {
    drawn.motes.push(
      smokePuff({ ...floor, z: floor.z + cell * 0.25 }, cell * 1.1, mixColor(DUST, tones.rim, 0.3), 0.16, forward)
    );
  }
}
