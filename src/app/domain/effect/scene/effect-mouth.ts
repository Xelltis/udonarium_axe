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
  if (aims.length < 1) return { x: body.x, y: body.y, z, widthPx: body.widthPx };
  const middle = {
    x: aims.reduce((sum, aim) => sum + aim.x, 0) / aims.length,
    y: aims.reduce((sum, aim) => sum + aim.y, 0) / aims.length,
  };
  const far = Math.hypot(middle.x - body.x, middle.y - body.y);
  if (far < 1) return { x: body.x, y: body.y, z, widthPx: body.widthPx };
  const nearest = Math.min(...aims.map((aim) => Math.hypot(aim.x - body.x, aim.y - body.y)));
  const before = Math.min((body.widthPx / 2) * BEFORE_BODY, nearest * MOST_OF_THE_WAY);
  return {
    x: body.x + ((middle.x - body.x) / far) * before,
    y: body.y + ((middle.y - body.y) / far) * before,
    z,
    widthPx: body.widthPx,
  };
}
