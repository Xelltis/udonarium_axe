import type { StageMouth } from '@axe/domain/effect/scene/choreography';

/** How far before the middle of its caster a breath leaves it, as a share of half the caster's width. */
const BEFORE_BODY = 0.8;
/** How far towards the nearest thing it is aimed at a mouth may be set at the most, as a share of the way to it. */
const MOST_OF_THE_WAY = 0.45;
/** How high over its caster's foot a breath leaves it, as a share of the caster's width. */
const MOUTH_HEIGHT = 0.6;

/** A caster as a breath leaves it: the middle of its foot and how wide it is, in table pixels. */
export interface BreathingBody {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly widthPx: number;
}

/**
 * Where a breath leaves its caster: before the caster's body on the side of what it is aimed at, so
 * the stream starts at its face rather than inside it, and as high as the caster is large, so a
 * dragon three cells across breathes from three times as high as a piece of one. Aimed at nothing, or
 * at what stands where the caster does, it leaves from over the caster's middle.
 */
export function mouthBefore(
  body: BreathingBody,
  aims: readonly { readonly x: number; readonly y: number }[]
): StageMouth {
  const z = body.z + body.widthPx * MOUTH_HEIGHT;
  return { ...aheadOf(body, aims, (body.widthPx / 2) * BEFORE_BODY, z), widthPx: body.widthPx };
}

/** How high the floor under a caster is, from where its breath leaves it, in table pixels. */
export function footUnder(mouth: StageMouth): number {
  return mouth.z - mouth.widthPx * MOUTH_HEIGHT;
}

/**
 * Where what a caster looses at its targets leaves it, a shot, a beam, a current: from its hands, as
 * high over its foot as the caster is large and before its body on the side of what it is aimed at by
 * as much as it is wider than a cell, so a dragon three cells across shoots from before its chest
 * rather than out of its belly, and a piece of one cell, or smaller, from over its middle, a cell's
 * hands high.
 */
export function handsBefore(
  body: BreathingBody,
  aims: readonly { readonly x: number; readonly y: number }[],
  cellPx: number
): { readonly x: number; readonly y: number; readonly z: number } {
  const wide = Math.max(body.widthPx, cellPx);
  return aheadOf(body, aims, (wide - cellPx) / 2, body.z + wide * MOUTH_HEIGHT);
}

/**
 * A point at a height, set some way before a body towards the middle of what it is aimed at, never
 * past most of the way to the nearest of them; over the body's middle where it is aimed at nothing,
 * or at what stands where the body does.
 */
function aheadOf(
  body: BreathingBody,
  aims: readonly { readonly x: number; readonly y: number }[],
  before: number,
  z: number
): { readonly x: number; readonly y: number; readonly z: number } {
  if (aims.length < 1 || before <= 0) return { x: body.x, y: body.y, z };
  const middle = {
    x: aims.reduce((sum, aim) => sum + aim.x, 0) / aims.length,
    y: aims.reduce((sum, aim) => sum + aim.y, 0) / aims.length,
  };
  const far = Math.hypot(middle.x - body.x, middle.y - body.y);
  if (far < 1) return { x: body.x, y: body.y, z };
  const nearest = Math.min(...aims.map((aim) => Math.hypot(aim.x - body.x, aim.y - body.y)));
  const by = Math.min(before, nearest * MOST_OF_THE_WAY);
  return { x: body.x + ((middle.x - body.x) / far) * by, y: body.y + ((middle.y - body.y) / far) * by, z };
}
