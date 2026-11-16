import { clamp } from '@axe/core/util/clamp';
import { AILMENT_BEAT_S } from '@axe/domain/effect/ailment-beats';
import { type CurseLook, takesHoldAt } from '@axe/domain/effect/ailment-looks';
import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote, EffectMoteShape } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, haze, hueOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * What the looks of the states share: the body they are drawn on, from its foot to over its head, the
 * moment a state takes hold and the beat it keeps after, and the small parts they are built of, a
 * sign over the head, a drop that falls, a thing that pops in.
 */

/** How dark the ink of a state is, for its shadows and the things laid over a body. */
export const INK = '#140d1c';

/** A piece a state is put on, at a moment of the state's playback. */
export interface Afflicted {
  readonly stage: Stage;
  /** How wide a cell is drawn for it, in table pixels. */
  readonly cell: number;
  /** How far into the playback it is, and how long the playback is, in seconds. */
  readonly t: number;
  readonly duration: number;
  /** The floor under the piece, its foot, and the top of its head. */
  readonly floor: Point;
  readonly foot: Point;
  readonly head: Point;
  /** How tall it stands over its foot, in table pixels. */
  readonly tall: number;
  /** The effect's two colours, the light and the dark, and the steps between them. */
  readonly light: string;
  readonly dark: string;
  readonly ramp: readonly string[];
  /** Its saturated colour, for bodies and halos. */
  readonly hue: string;
  /** How much of it shows: rising as it comes on and falling away over the end of its playback. */
  readonly shown: number;
  /** When it takes hold of the piece, in seconds, and how long ago that was; below nothing before it. */
  readonly holdAt: number;
  readonly since: number;
  /** How long one beat of it is, in seconds, how far through the one under way it is, from 0 to 1, and which beat that is. */
  readonly every: number;
  readonly phase: number;
  readonly beat: number;
  /** How hard the beat under way still rings: 1 as it strikes, falling away to nothing; nothing before it takes hold. */
  readonly pulse: number;
  /** How far towards the eye what is laid over the body is drawn, so that it lies on the piece rather than in it. */
  readonly over: number;
}

/** How fast a look comes on and how long it takes to go, in seconds. */
const COMES_ON_S = 0.22;
const GOES_OVER_S = 0.45;

/** The piece a state is put on, as its look is drawn at this moment of the stage. */
export function afflictedOf(stage: Stage, look: CurseLook): Afflicted {
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const holdAt = takesHoldAt(look, duration);
  const since = t - holdAt;
  const every = AILMENT_BEAT_S[look];
  const beats = since >= 0 ? since / every : 0;
  const phase = beats - Math.floor(beats);
  const tall = Math.max(stage.tall, cell * 0.4);
  return {
    stage,
    cell,
    t,
    duration,
    floor: { x: stage.x, y: stage.y, z: stage.groundZ },
    foot: { x: stage.x, y: stage.y, z: stage.z },
    head: { x: stage.x, y: stage.y, z: stage.z + tall },
    tall,
    light: ramp[4],
    dark: ramp[1],
    ramp,
    hue: hueOf(ramp),
    shown: Math.min(outCubic(within(t, 0, COMES_ON_S)), 1 - within(t, duration - GOES_OVER_S, duration)),
    holdAt,
    since,
    every,
    phase,
    beat: Math.floor(beats),
    pulse: since >= 0 ? Math.exp(-phase * 5) : 0,
    over: cell * 0.42,
  };
}

/** How many of a part a state shows for the effect's grade, from how many at the middle grade. */
export function countOf(a: Afflicted, base: number): number {
  return Math.max(1, Math.round(base * a.stage.preset.gradeDensity));
}

/** A part that comes round again and again: how far through the round under way it is, and which round that is. */
export function roundOf(t: number, period: number, offset: number): { readonly life: number; readonly round: number } {
  const turns = t / period + offset;
  const round = Math.floor(turns);
  return { life: turns - round, round };
}

/** A number from 0 to 1 for a whole number and a salt, the same on every seat: what one of many parts is told apart by. */
export function scatter(index: number, salt: number): number {
  const mixed = Math.sin(index * 127.1 + salt * 311.7 + 0.37) * 43758.5453;
  return mixed - Math.floor(mixed);
}

/** A point on the body of the piece: a turn round it, a share of the way up it, and how far out from its middle, in cells. */
export function onBody(a: Afflicted, turn: number, share: number, out = 0.3): Point {
  return {
    x: a.foot.x + Math.cos(turn) * a.cell * out,
    y: a.foot.y + Math.sin(turn) * a.cell * out,
    z: a.foot.z + a.tall * share,
  };
}

/** A point over the head of the piece, as many cells up from its top, and off to a side by a turn and a reach, in cells. */
export function overHead(a: Afflicted, lift: number, turn = 0, out = 0): Point {
  return {
    x: a.head.x + Math.cos(turn) * a.cell * out,
    y: a.head.y + Math.sin(turn) * a.cell * out,
    z: a.head.z + a.cell * lift,
  };
}

/** How far a thing is set off across the screen from where it is, in table pixels: to the right and up as the eye sees them. */
export interface Aside {
  readonly right: number;
  readonly up: number;
}

/**
 * Where a sign hangs by the head of the piece: off the top of its head, and set off across the screen
 * by as many cells to the right and up, so that it hangs at the piece's shoulder from wherever it is
 * seen, clear of what is written over its head.
 */
export function byHead(a: Afflicted, right: number, up: number): { readonly at: Point; readonly aside: Aside } {
  return { at: a.head, aside: { right: a.cell * right, up: a.cell * up } };
}

/** Where the sign of a state hangs by the head and how large it is, in cells: at the piece's shoulder, as the eye sees it. */
export const SIGN_RIGHT = 0.68;
export const SIGN_UP = -0.06;
export const SIGN_SIZE = 0.64;

/** How large a thing that pops in is, some time after it does, against its full size: past it and back, as a thing on a spring. */
export function popIn(age: number, over = 0.22): number {
  if (age <= 0) return 0;
  const share = Math.min(1, age / over);
  const back = 2.2;
  const left = share - 1;
  return 1 + (back + 1) * left * left * left + back * left * left;
}

/** How large a thing stamped down is, some time after it lands, against its full size: from far too large, hard down to it. */
export function stampIn(age: number, over = 0.12): number {
  if (age <= 0) return 0;
  const share = Math.min(1, age / over);
  return 1 + 1.6 * (1 - share) * (1 - share);
}

/** How a sign is turned, which of its looks it takes, the colour of what it holds, and how far across the screen it is set off. */
export interface SignLook {
  readonly spin?: number;
  readonly variant?: number;
  readonly core?: string;
  readonly aside?: Aside;
}

/** A sign: a flat figure of a colour, outlined, drawn before the piece and turned by its spin. */
export function sign(
  shape: EffectMoteShape,
  at: Point,
  size: number,
  color: string,
  alpha: number,
  forward: number,
  look: SignLook = {}
): EffectMote {
  return {
    x: at.x,
    y: at.y,
    z: at.z,
    size,
    color,
    alpha: clamp(alpha, 0, 1),
    blend: 'color',
    shape,
    spin: look.spin,
    variant: look.variant,
    core: look.core,
    forward,
    aside: look.aside,
  };
}

/** A sign with a soft light of its colour behind it, so that it stands off whatever is behind it. */
export function litSign(
  drawn: Staged,
  shape: EffectMoteShape,
  at: Point,
  size: number,
  color: string,
  halo: string,
  alpha: number,
  forward: number,
  look: SignLook = {}
): void {
  if (alpha <= 0.01 || size <= 0) return;
  drawn.motes.push({ ...glow(at, size * 1.9, halo, 0.45 * alpha, forward), aside: look.aside });
  drawn.motes.push(sign(shape, at, size, color, alpha, forward + 2, look));
}

/**
 * A drop at a moment of its fall: let go at a point some time ago, it falls faster and faster until
 * it meets the floor, where it is gone; null once it has landed. It is drawn out along its fall,
 * round below and pointed above.
 */
export function fallingDrop(
  from: Point,
  age: number,
  floorZ: number,
  cell: number,
  size: number,
  color: string,
  alpha: number,
  forward: number,
  fall = 9
): EffectMote | null {
  if (age < 0) return null;
  const fallen = 0.5 * fall * cell * age * age;
  const z = from.z - fallen;
  if (z <= floorZ) return null;
  const speed = Math.max(cell * 0.4, fall * cell * age);
  return {
    x: from.x,
    y: from.y,
    z,
    size,
    color,
    alpha: clamp(alpha, 0, 1),
    blend: 'color',
    shape: 'comet',
    velocity: { x: 0, y: 0, z: -speed },
    trail: Math.min(0.09, (size * 1.8) / speed),
    forward,
  };
}

/** How long a drop let go at a height takes to meet the floor, in seconds. */
export function fallTimeOf(height: number, cell: number, fall = 9): number {
  return Math.sqrt(Math.max(0, (2 * height) / (fall * cell)));
}

/**
 * The instant a state takes hold: a hard flash of its colour over the body and a ring thrown out on
 * the floor, gone in a quarter of a second.
 */
export function takeHold(drawn: Staged, a: Afflicted, color: string, strength = 1, reach = 1): void {
  const age = a.since;
  if (age < 0 || age >= 0.3) return;
  const left = 1 - age / 0.3;
  const chest = onBody(a, 0, 0.55, 0);
  drawn.motes.push(glow(chest, a.cell * (1.5 + 1.2 * (1 - left)), color, 0.75 * left * strength * a.shown, a.over));
  drawn.motes.push(glow(chest, a.cell * 0.8, '#ffffff', 0.5 * left * left * strength * a.shown, a.over + 1));
  drawn.floor.push(
    floorMark(
      'ring',
      a.floor,
      a.cell * (0.4 + 0.9 * reach * outCubic(1 - left)),
      0.14 * left + 0.03,
      color,
      left * a.shown,
      'light',
      0
    )
  );
  drawn.lights.push({ ...chest, color, strength: 1.2 * left * strength * a.shown, reachPx: a.cell * 2.2 });
}

/** A veil of a colour laid over the body, as the piece is tinted by the state it is in, heavier on each beat. */
export function bodyVeil(drawn: Staged, a: Afflicted, color: string, alpha: number): void {
  if (alpha <= 0.01) return;
  const wide = Math.max(a.cell * 1.15, a.tall * 0.9);
  drawn.motes.push(haze(onBody(a, 0, 0.5, 0), wide * 1.5, color, alpha * a.shown, a.over));
}

/** A colour taken towards the ink by a share, for the shadowed side of a thing. */
export function shaded(color: string, share: number): string {
  return mixColor(color, INK, share);
}
