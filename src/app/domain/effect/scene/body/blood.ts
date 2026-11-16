import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { ball, floorMark, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * Blood, as what strikes a piece down draws it: drops flung from a wound, flying as streaks of red,
 * splashing where they land and leaving a splat; held to the reds of blood whatever colours they are
 * drawn in, and kept stylised, as drops and splats rather than anything more.
 */

/** A drop of blood: where it is flung, how large it is, and how dark. */
export interface Drop {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly dark: number;
}

/**
 * Drops of blood flung from about a wound, as far round it as `spread` along a level way, between two
 * moments: out every way and up, slowed by the air, falling to splash; leant on to `away` as far as
 * `lean` says, from 0 for every way alike.
 */
export function flungDrops(
  th: Thrower,
  wound: Point,
  count: number,
  from: number,
  until: number,
  reach: number,
  aim: {
    readonly away?: { readonly x: number; readonly y: number };
    readonly lean?: number;
    readonly spread?: Point;
  } = {}
): Drop[] {
  const U = th.cell;
  const lean = aim.lean ?? 0;
  return Array.from({ length: count }, () => {
    const out = th.outward();
    const x = out.cos + (aim.away?.x ?? 0) * lean;
    const y = out.sin + (aim.away?.y ?? 0) * lean;
    const size = Math.hypot(x, y) || 1;
    const way = { cos: x / size, sin: y / size };
    const speed = th.range(1, 3.4) * U * reach;
    const bornAt = th.range(from, until);
    const along = th.range(-1, 1);
    const spread = aim.spread ?? { x: 0, y: 0, z: 0 };
    return {
      mote: th.mote({
        x: wound.x + way.cos * th.range(0, 0.15) * U + spread.x * along,
        y: wound.y + way.sin * th.range(0, 0.15) * U + spread.y * along,
        z: wound.z + spread.z * along,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(0.3, 1.2) * speed + U,
        bornAt,
        life: th.lifeOf(bornAt, 1.6, 2.4),
        gravity: th.fall,
        drag: 1.2,
        bounce: 0,
      }),
      size: th.range(0.06, 0.16),
      dark: th.range(0, 1),
    };
  });
}

/**
 * How many of the drops that land on one target leave a splat of their own on the floor: past that,
 * splats lie over one another and are not told apart, and only every so many is laid.
 */
const SPLATS_AT_MOST = 32;

/** Drops of blood at a moment: flying as streaks of red drawn out behind them, and once landed, splats on the floor fading slowly. */
export function drawDrops(
  drawn: Staged,
  drops: readonly Drop[],
  t: number,
  cell: number,
  blood: readonly string[],
  fade: number,
  forward: number
): void {
  const splatEvery = Math.ceil(drops.length / SPLATS_AT_MOST);
  for (const [index, drop] of drops.entries()) {
    const at = moteAt(drop.mote, t);
    if (!at) continue;
    const colour = drop.dark > 0.5 ? blood[0] : blood[1];
    if (at.landed) {
      if (index % splatEvery !== 0) continue;
      const splat = Math.min(1, (t - drop.mote.bornAt) * 4);
      drawn.floor.push(
        floorMark(
          'scorch',
          { x: at.x, y: at.y, z: drop.mote.floorZ },
          cell * drop.size * (1 + 0.6 * splat),
          1,
          colour,
          0.85 * fade,
          'color',
          (index % 13) + 1
        )
      );
      continue;
    }
    const speed = Math.hypot(at.vx, at.vy, at.vz);
    drawn.motes.push({
      ...ball(at, cell * drop.size, colour, 1, forward, index),
      shape: speed > cell ? 'comet' : 'puff',
      velocity: { x: at.vx, y: at.vy, z: at.vz },
      trail: 0.06,
    });
  }
}

/** The colours of blood for a look, from its darkest to its lightest, held to the reds of blood whatever they are. */
export function bloodOf(ramp: readonly string[]): readonly [string, string, string] {
  return [mixColor(ramp[1], '#7a0a12', 0.5), mixColor(ramp[2], '#b3121c', 0.5), mixColor(ramp[3], '#e0303a', 0.4)];
}
