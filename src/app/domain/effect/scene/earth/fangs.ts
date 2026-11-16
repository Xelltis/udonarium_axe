import type { UpheavalTiming } from '@axe/domain/effect/earth-looks';
import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { crag, type EarthTones } from '@axe/domain/effect/scene/earth/earth-parts';
import { type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import type { Cloud } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The fangs of rock an upheaval breaks the ground with. Each bursts up out of its root past its
 * height and settles, throwing dust and stones aside; stands, its foot glowing and pebbles spilling
 * down it; then light climbs its cracks, it breaks off from its top down, each piece falling from
 * where it stood in the fang, and its root sinks away in dust, leaving broken ground.
 */

/** One fang: where its root is, in table pixels, the way it stands, of length one, and how tall and wide it is, in cells. */
export interface Fang {
  readonly root: Point;
  readonly way: Point;
  readonly tall: number;
  readonly wide: number;
  /** When it breaks the ground, in seconds of the playback, and how long after the first it starts to break. */
  readonly risesAt: number;
  readonly breaksAfter: number;
  readonly tone: number;
  readonly variant: number;
}

/** How long a fang takes to burst up, in seconds. */
const RISES_S = 0.1;
/** How much of a fang is broken off before its root sinks, and how much once it has sunk. */
const BROKEN_STUMP = 0.82;
const BROKEN_SUNK = 0.97;
/** How long light takes to climb a fang's cracks, how long it takes to break, and to sink, in seconds. */
const CLIMBS_S = 0.3;
const BREAKS_S = 0.35;
const SINKS_S = 0.45;
/** How far up a standing fang its foot glows, as a share of its height. */
const FOOT_GLOWS = 0.13;

/** A way of length one leaning from straight up towards a bearing over the floor by an angle, in radians. */
export function leaning(bearing: number, lean: number): Point {
  return { x: Math.cos(bearing) * Math.sin(lean), y: Math.sin(bearing) * Math.sin(lean), z: Math.cos(lean) };
}

/** When a fang starts to break, in seconds of the playback. */
export function fangBreaksAt(fang: Fang, timing: UpheavalTiming): number {
  return timing.breaksAt + fang.breaksAfter;
}

/** A fang at a moment: see the header. Its root leaves a patch of broken ground that stays as long as `clearing` lets. */
export function drawFang(
  drawn: Staged,
  fang: Fang,
  t: number,
  timing: UpheavalTiming,
  cell: number,
  tones: EarthTones,
  clearing: number
): void {
  const rising = within(t, fang.risesAt, fang.risesAt + RISES_S);
  if (rising <= 0) return;
  drawn.floor.push(
    floorMark('scorch', fang.root, cell * fang.wide * 1.25, 1, tones.earth, 0.8 * clearing, 'color', fang.variant)
  );
  const breaksAt = fangBreaksAt(fang, timing);
  const sinking = within(t, breaksAt + BREAKS_S, breaksAt + BREAKS_S + SINKS_S);
  if (sinking >= 1) return;
  const grown = Math.min(1.12, outCubic(rising) + 0.12 * Math.sin(Math.PI * rising));
  const climbing = within(t, breaksAt - CLIMBS_S, breaksAt);
  const breaking = within(t, breaksAt, breaksAt + BREAKS_S);
  const standing = within(t, fang.risesAt + RISES_S, fang.risesAt + RISES_S + 0.3);
  const footGlow = FOOT_GLOWS * standing * (0.8 + 0.2 * Math.sin(t * 6 + fang.variant * 3));
  const root = { ...fang.root, z: fang.root.z - cell * 0.3 * sinking };
  if (standing > 0 && breaking < 1)
    drawn.floor.push(
      floorMark('disc', fang.root, cell * fang.wide * 1.5, 1, tones.glow, (0.3 + 0.5 * climbing) * standing, 'light', 0)
    );
  drawn.motes.push(
    crag(
      root,
      fang.way,
      cell * fang.tall * grown,
      cell * fang.wide,
      tones.rock[fang.tone] ?? tones.rock[1],
      1 - sinking,
      {
        variant: fang.variant,
        broken: breaking * BROKEN_STUMP + sinking * (BROKEN_SUNK - BROKEN_STUMP),
        veins: Math.max(footGlow, climbing),
        glow: climbing > 0.5 || breaking > 0 ? tones.hot : tones.glow,
      }
    )
  );
}

/** What a fang throws over its life. */
export interface FangThrow {
  readonly rocks: Rock[];
  /** The dust it raises as it bursts up, which it stands before. */
  readonly dust: Cloud[];
  /** The dust pushed up round its root as it sinks, which hides it. */
  readonly settling: Cloud[];
}

/**
 * Throws what a fang throws: dust and stones aside as it bursts up, pebbles spilling down it while
 * it stands, pieces of it falling from where they stood in it as it breaks from its top, and dust
 * pushed up round its root as that sinks.
 */
export function throwFromFang(
  th: Thrower,
  fang: Fang,
  timing: UpheavalTiming,
  tones: EarthTones,
  into: FangThrow
): void {
  const foot = { x: fang.root.x, y: fang.root.y, z: th.floorZ };
  const breaksAt = fangBreaksAt(fang, timing);
  const big = fang.tall >= 1.2;
  into.rocks.push(
    ...throwRocks(th, foot, big ? 5 : 3, {
      size: [0.05, big ? 0.16 : 0.1],
      up: [3, 6 + fang.tall],
      out: [0.5, 2.4],
      bornAt: [fang.risesAt, fang.risesAt + 0.05],
      from: fang.wide * 0.5,
    })
  );
  if (big && breaksAt - fang.risesAt > 0.6) {
    into.rocks.push(
      ...throwRocks(th, foot, 3, {
        size: [0.04, 0.07],
        up: [0, 0.6],
        out: [0.2, 0.7],
        bornAt: [fang.risesAt + 0.3, breaksAt - 0.3],
        from: fang.wide * 0.4,
        high: [fang.tall * 0.3, fang.tall * 0.8],
        bounce: 0.2,
      })
    );
  }
  const pieces = Math.max(2, Math.round(fang.tall * 3.2));
  for (let piece = 0; piece < pieces; piece++) {
    const high = (piece + 0.5) / pieces;
    const stood = {
      x: fang.root.x + fang.way.x * fang.tall * high * th.cell,
      y: fang.root.y + fang.way.y * fang.tall * high * th.cell,
      z: th.floorZ,
    };
    const falls = breaksAt + (1 - high) * BREAKS_S * 0.9;
    const up = fang.way.z * fang.tall * high;
    into.rocks.push(
      ...throwRocks(th, stood, 1, {
        size: [0.12, 0.18 + 0.1 * fang.tall * (1 - high * 0.6)],
        up: [-0.5, 1.6],
        out: [0.3, 1.7],
        bornAt: [falls, falls + 0.04],
        from: fang.wide * 0.3,
        high: [up, up],
        bounce: 0.3,
      })
    );
  }
  into.dust.push(
    ...kickedDust(th, foot, big ? 3 : 2, tones.dust, {
      speed: [0.8, 2.4],
      size: [0.4, 0.5 + fang.wide * 0.6],
      bornAt: [fang.risesAt, fang.risesAt + 0.06],
      from: fang.wide * 0.5,
      alpha: 0.55,
      life: [0.4, 0.8],
    })
  );
  into.settling.push(
    ...earthPlumes(th, foot, big ? 3 : 1, tones.dust, {
      rise: [2, 4.5],
      bornAt: [breaksAt + BREAKS_S * 0.5, breaksAt + BREAKS_S + SINKS_S * 0.6],
      long: 1.5,
    }),
    ...kickedDust(th, foot, 2, tones.dust, {
      speed: [0.6, 1.8],
      size: [0.5, 0.8],
      bornAt: [breaksAt + BREAKS_S * 0.6, breaksAt + BREAKS_S + SINKS_S * 0.5],
      from: fang.wide * 0.5,
      alpha: 0.5,
    })
  );
}
