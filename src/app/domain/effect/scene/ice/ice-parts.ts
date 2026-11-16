import { clamp } from '@axe/core/util/clamp';
import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import type { Cloud } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, lightBall, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The parts the looks of ice are built of, but for what it breaks into, which is beside this:
 * crystals standing out of the floor; rime spread over the floor, which creeps out and draws back; frost
 * run across it in ferns; cold mist lying low; and the glints, the snow and the dust of ice that
 * hang in the air. Ice is colour, pale on the faces the light falls on and a deep blue on the rest,
 * so it keeps its shape on a bright table; only its glints are light.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** The colours a look of ice is drawn in, from its preset's ramp. */
export interface IceTones {
  /** The face of a crystal the light falls on, and the powder ice breaks into. */
  readonly pale: string;
  /** The body of a crystal. */
  readonly body: string;
  /** The faces of a crystal in shadow, and its outline. */
  readonly deep: string;
  /** The blue laid under rime and over what is frozen. */
  readonly shade: string;
  readonly rime: string;
  readonly mist: string;
  /** The colour its light is thrown in. */
  readonly light: string;
}

/** The colours of ice for a preset's ramp. */
export function iceTonesOf(ramp: readonly string[]): IceTones {
  return {
    pale: mixColor(ramp[4], '#ffffff', 0.45),
    body: mixColor(ramp[3], '#ffffff', 0.25),
    deep: mixColor(ramp[1], ramp[2], 0.2),
    shade: mixColor(ramp[1], ramp[2], 0.6),
    rime: mixColor(ramp[4], '#ffffff', 0.55),
    mist: mixColor(ramp[4], '#ffffff', 0.35),
    light: mixColor(ramp[2], ramp[3], 0.4),
  };
}

/**
 * How much further out than it would what stands about a target stands for the target's width, in
 * table pixels: nothing about a target no wider than the look's cell, and about a wider one as far
 * as clears its body.
 */
export function clearOf(stage: Pick<Stage, 'cell' | 'index' | 'targets'>): number {
  const wide = stage.targets.find((target) => target.index === stage.index)?.widthPx ?? stage.cell;
  return Math.max(0, wide * 0.5 - stage.cell * 0.5);
}

/** How fast a crystal is told to fly, in table pixels a second, for it to be drawn out along its way: it goes nowhere. */
const CRYSTAL_PACE = 100;

/** How a crystal is drawn. */
export interface CrystalLook {
  readonly variant: number;
  /** The share of its length gone from its top. */
  readonly broken?: number;
  /** How far up it cracks have run, from 0 for none towards 1 for its tip. */
  readonly cracks?: number;
  /** How far it is taken towards its shadow, as one standing behind others is, from 0 to 1. */
  readonly dim?: number;
  /**
   * How far towards the eye it is drawn, in table pixels, for one laid over the piece it closes in;
   * without it, it is held to its own depth, so a piece standing before it hides it.
   */
  readonly over?: number;
}

/**
 * A crystal of ice standing out of a root along a way of length one, as tall and as wide as given,
 * in table pixels.
 */
export function crystal(
  root: Point,
  way: Point,
  tall: number,
  wide: number,
  tones: IceTones,
  alpha: number,
  look: CrystalLook
): EffectMote {
  const reach = Math.max(tall, wide * 1.01);
  const dim = look.dim ?? 0;
  return {
    x: root.x + way.x * reach,
    y: root.y + way.y * reach,
    z: root.z + way.z * reach,
    size: wide,
    color: dim > 0 ? mixColor(tones.body, tones.deep, dim * 0.6) : tones.body,
    core: dim > 0 ? mixColor(tones.deep, '#0a1c3c', dim * 0.35) : tones.deep,
    alpha: clamp(alpha, 0, 1),
    blend: 'color',
    shape: 'crystal',
    velocity: { x: way.x * CRYSTAL_PACE, y: way.y * CRYSTAL_PACE, z: way.z * CRYSTAL_PACE },
    trail: (reach - wide) / CRYSTAL_PACE,
    spin: Math.round(clamp(look.broken ?? 0, 0, 0.99) * 100) + clamp(look.cracks ?? 0, 0, 0.995),
    variant: look.variant,
    forward: look.over ?? 2,
    exactDepth: look.over === undefined,
  };
}

/** A crystal that stands out of the floor: where, which way it leans, how large it is, in cells, and when it bursts up. */
export interface Spire {
  readonly root: Point;
  readonly way: Point;
  readonly tall: number;
  readonly wide: number;
  readonly risesAt: number;
  /** How long after the others start to it starts to break, in seconds. */
  readonly breaksAfter: number;
  readonly variant: number;
  readonly dim: number;
}

/** A way of length one leaning out from upright towards a bearing over the floor by a share. */
export function leaningWay(bearing: number, lean: number): Point {
  const length = Math.hypot(lean, 1);
  return { x: (Math.cos(bearing) * lean) / length, y: (Math.sin(bearing) * lean) / length, z: 1 / length };
}

/** How long a spire takes to burst up, to be cracked through, and to break from its top down, in seconds. */
const SPIRE_RISES_S = 0.11;
const SPIRE_CRACKS_S = 0.3;
const SPIRE_BREAKS_S = 0.28;

/**
 * A spire at a moment: bursting up fast and overshooting a little, standing, cracked through from
 * `cracksAt`, and from `breaksAt` broken from its top down to a stump, which is left and fades with
 * `alpha`.
 */
export function drawSpire(
  drawn: Staged,
  spire: Spire,
  t: number,
  cracksAt: number,
  breaksAt: number,
  cell: number,
  tones: IceTones,
  alpha: number
): void {
  const since = t - spire.risesAt;
  if (since < 0 || alpha <= 0) return;
  const risen = outCubic(since / SPIRE_RISES_S);
  const settles = 1 + 0.12 * Math.sin(Math.PI * clamp(since / (SPIRE_RISES_S * 2.4), 0, 1));
  const breaking = within(t, breaksAt + spire.breaksAfter, breaksAt + spire.breaksAfter + SPIRE_BREAKS_S);
  drawn.motes.push(
    crystal(spire.root, spire.way, cell * spire.tall * risen * settles, cell * spire.wide, tones, alpha, {
      variant: spire.variant,
      dim: spire.dim,
      cracks: within(t, cracksAt + spire.breaksAfter, cracksAt + spire.breaksAfter + SPIRE_CRACKS_S) * 0.95,
      broken: breaking * 0.86,
    })
  );
}

/**
 * Rime over the floor about a point, as far out as `radius`, in table pixels, and as thick as
 * `thick`, from 1 for a whole sheet to 0 for none: a blue shade under it, so it shows on a pale
 * floor, the frost over that and a little of its light.
 */
export function layRime(
  drawn: Staged,
  floor: Point,
  radius: number,
  thick: number,
  tones: IceTones,
  alpha: number,
  seed: number
): void {
  if (radius < 1 || alpha <= 0 || thick <= 0.02) return;
  const look = Math.abs(seed) % 53;
  const shown = alpha * Math.min(1, thick * 3);
  drawn.floor.push(floorMark('disc', floor, radius * 0.95, 1, tones.shade, 0.34 * alpha * thick, 'color', 0));
  drawn.floor.push(floorMark('rime', floor, radius, thick, tones.rime, 0.8 * shown, 'color', look));
  drawn.floor.push(floorMark('rime', floor, radius * 0.8, thick * 0.6, tones.light, 0.18 * shown, 'light', look + 7));
}

/**
 * How far rime has crept and how thick it lies at a moment: out fast from `growsAt` over `growsS`
 * seconds, whole until `recedesAt`, and thinning from its edge to nothing by `goneAt`.
 */
export function rimeAt(
  t: number,
  growsAt: number,
  growsS: number,
  recedesAt: number,
  goneAt: number
): { readonly spread: number; readonly thick: number } {
  const spread = outCubic(within(t, growsAt, growsAt + growsS));
  const left = 1 - within(t, recedesAt, goneAt);
  return { spread: spread * (0.86 + 0.14 * left), thick: spread > 0 ? Math.pow(left, 0.8) : 0 };
}

/** A fern of frost run across the floor from one point to another, as wide as given, in table pixels. */
export function layFrostRun(
  drawn: Staged,
  from: Point,
  to: Point,
  wide: number,
  tones: IceTones,
  alpha: number,
  seed: number
): void {
  const reach = Math.hypot(to.x - from.x, to.y - from.y) / 2;
  if (reach < 1 || alpha <= 0) return;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
  const turn = Math.atan2(from.y - to.y, to.x - from.x);
  const look = (Math.abs(seed) % 97) / 9.7;
  drawn.floor.push(
    floorMark('fissure', middle, reach, (wide * 2.2) / reach, tones.shade, 0.3 * alpha, 'color', look, turn)
  );
  drawn.floor.push(floorMark('fissure', middle, reach, wide / reach, tones.rime, 0.9 * alpha, 'color', look, turn));
}

/** How cold mist is thrown. */
export interface MistThrow {
  /** How fast it drifts out over the floor, and how wide each cloud is. */
  readonly speed: readonly [number, number];
  readonly size: readonly [number, number];
  readonly bornAt: readonly [number, number];
  /** How far from the foot it starts at the most. */
  readonly from?: number;
  readonly life?: readonly [number, number];
  readonly alpha?: number;
  readonly fan?: { readonly toward: number; readonly spread: number };
}

/** Cold mist about a foot: clouds that lie low, heavier than the air, and creep out over the floor as they thin. */
export function coldMist(th: Thrower, foot: Point, count: number, color: string, how: MistThrow): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const turn = how.fan ? how.fan.toward + th.range(-how.fan.spread, how.fan.spread) : th.range(0, Math.PI * 2);
    const from = th.range(0, how.from ?? 0.5) * U;
    const fast = th.range(how.speed[0], how.speed[1]) * U;
    const bornAt = th.range(how.bornAt[0], how.bornAt[1]);
    return {
      mote: th.mote({
        x: foot.x + Math.cos(turn) * from,
        y: foot.y + Math.sin(turn) * from,
        z: th.floorZ + th.range(0.1, 0.24) * U,
        vx: Math.cos(turn) * fast,
        vy: Math.sin(turn) * fast,
        vz: 0,
        bornAt,
        life: th.lifeOf(bornAt, how.life?.[0] ?? 1.2, how.life?.[1] ?? 2.2),
        gravity: 0,
        drag: 1.6,
        bounce: 0,
      }),
      size: th.range(how.size[0], how.size[1]),
      color,
      alpha: how.alpha ?? 0.4,
    };
  });
}

/**
 * The white beat as ice bursts: the floor about a foot lit white as far as `reach`, a hard white
 * heart at a point over it and a star of streaks shot out of that, all as strong as `left`, from 1
 * as it bursts to 0.
 */
export function layIceBeat(
  drawn: Staged,
  floor: Point,
  heart: Point,
  reach: number,
  size: number,
  tones: IceTones,
  left: number
): void {
  if (left <= 0) return;
  const forward = size * 0.8;
  drawn.floor.push(floorMark('disc', floor, reach, 1, '#ffffff', 0.7 * left, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, reach * 1.3, 1, tones.light, 0.45 * left, 'light', 0));
  drawn.motes.push(lightBall(heart, size * (0.7 + 0.3 * left), '#ffffff', left, forward));
  for (const [turn, long, color] of [
    [0, 10, '#ffffff'],
    [Math.PI / 2, 8, '#ffffff'],
    [Math.PI / 4, 5, tones.pale],
    [-Math.PI / 4, 5, tones.pale],
  ] as const) {
    drawn.motes.push({ ...glow(heart, size * 0.6, color, left, forward), shape: 'flare', trail: long, spin: turn });
  }
}

/** A glint of light on ice at a point, as wide as given, in table pixels: a small cross that twinkles. */
export function glint(at: Point, size: number, alpha: number, forward: number, turned = 0): EffectMote {
  return { ...glow(at, size, '#ffffff', alpha, forward), shape: 'star', spin: turned };
}

/** How brightly one of many glints shows at a moment, each on its own beat: dark most of the time, and flashing. */
export function twinkleAt(t: number, index: number, rate = 5): number {
  const beat = Math.sin(t * rate + index * 2.399);
  return beat > 0.55 ? (beat - 0.55) / 0.45 : 0;
}

/** A flake of snow or a mote of ice dust hanging in the air at a point: white laid as colour, with a faint light over it. */
export function layFlake(drawn: Staged, at: Point, size: number, alpha: number, forward: number, turned: number): void {
  if (alpha <= 0.02) return;
  drawn.motes.push({
    x: at.x,
    y: at.y,
    z: at.z,
    size,
    color: '#ffffff',
    alpha,
    blend: 'color',
    shape: 'flake',
    spin: turned,
    forward,
  });
}
