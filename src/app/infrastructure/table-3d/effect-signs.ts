import type { EffectMoteShape } from '@axe/domain/effect/scene/effect-scene';
import {
  abs,
  atan,
  clamp,
  dot,
  float,
  fract,
  fwidth,
  length,
  max,
  min,
  pow,
  select,
  sin,
  smoothstep,
  vec2,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

/*
 * The signs among the particles of an effect, as the shader draws them: flat figures worked out from
 * where a point of the particle's board lies, each of its colour within a dark outline, so that it
 * reads over a bright table and a dark one alike.
 */

/** The signs, in the order the shader picks among them. */
export const SIGN_NAMES = [
  'heart',
  'zed',
  'query',
  'cross',
  'skull',
  'pentagram',
  'swirl',
  'dial',
  'eyes',
  'bubble',
  'hoop',
  'bar',
  'feather',
] as const satisfies readonly EffectMoteShape[];

/**
 * One sign as the shader draws it: how much of it is there at a point, how much of that is its own
 * colour rather than its outline, and how much is taken to another colour, its core's or white.
 */
export interface SignShape {
  readonly alpha: Node<'float'>;
  readonly fill: Node<'float'>;
  readonly cored: Node<'float'>;
}

/** How much of a figure is at a point, from how far inside its edge the point is: a hard edge, a pixel soft. */
function inked(inside: Node<'float'>): Node<'float'> {
  return clamp(inside.div(max(fwidth(inside), 0.0005)).add(0.5), 0, 1);
}

/** How far a point is from the stroke between two points. */
function strokeAway(
  point: Node<'vec2'>,
  from: readonly [number, number],
  to: readonly [number, number]
): Node<'float'> {
  const along = [to[0] - from[0], to[1] - from[1]] as const;
  const off = point.sub(vec2(from[0], from[1]));
  const share = clamp(dot(off, vec2(along[0], along[1])).div(along[0] ** 2 + along[1] ** 2), 0, 1);
  return length(off.sub(vec2(along[0], along[1]).mul(share)));
}

/** A figure of strokes, outlined: its colour within `body` of a stroke, and its outline out to `edge`. */
function stroked(away: Node<'float'>, edge: number, body: number): SignShape {
  return { alpha: inked(float(edge).sub(away)), fill: inked(float(body).sub(away)), cored: float(0) };
}

/**
 * The signs at a point of a particle's board, from -1 to 1 each way and y up, `away` from its middle
 * at `angle` round it: see {@link EffectMoteShape}.
 */
export function signShapes(
  point: Node<'vec2'>,
  away: Node<'float'>,
  angle: Node<'float'>,
  variant: Node<'float'>
): Record<(typeof SIGN_NAMES)[number], SignShape> {
  const none = float(0);
  const heartField = (scale: number) => {
    const x = point.x.mul(1.2 * scale);
    const y = point.y.mul(1.2 * scale).add(0.2 * scale);
    const round = x.mul(x).add(y.mul(y)).sub(1);
    return x.mul(x).mul(y).mul(y).mul(y).sub(round.mul(round).mul(round));
  };
  const heart = { alpha: inked(heartField(1)), fill: inked(heartField(1.3)), cored: none };

  const zed = stroked(
    min(
      strokeAway(point, [-0.5, 0.58], [0.5, 0.58]),
      min(strokeAway(point, [0.5, 0.58], [-0.5, -0.58]), strokeAway(point, [-0.5, -0.58], [0.5, -0.58]))
    ),
    0.28,
    0.15
  );

  const hook = point.sub(vec2(0, 0.36));
  const hookAway = select(
    atan(hook.y, hook.x).greaterThan(-0.9),
    abs(length(hook).sub(0.34)),
    min(length(point.sub(vec2(-0.34, 0.36))), length(point.sub(vec2(0.211, 0.094))))
  );
  const query = stroked(
    min(
      min(hookAway, strokeAway(point, [0.211, 0.094], [0, -0.14])),
      min(strokeAway(point, [0, -0.14], [0, -0.24]), length(point.sub(vec2(0, -0.68))))
    ),
    0.26,
    0.13
  );

  const cross = stroked(
    min(strokeAway(point, [-0.55, -0.55], [0.55, 0.55]), strokeAway(point, [-0.55, 0.55], [0.55, -0.55])),
    0.3,
    0.17
  );

  const jaw = abs(point.sub(vec2(0, -0.42))).sub(vec2(0.3, 0.26));
  const jawAway = length(max(jaw, 0))
    .add(min(max(jaw.x, jaw.y), 0))
    .sub(0.06);
  const skullInside = min(length(point.sub(vec2(0, 0.22))).sub(0.6), jawAway).negate();
  const socket = inked(float(0.19).sub(length(vec2(abs(point.x).sub(0.26), point.y.sub(0.14).mul(0.85)))));
  const nose = inked(float(0.08).sub(length(point.sub(vec2(0, -0.17)))));
  const teeth = inked(float(0.03).sub(min(abs(point.x), abs(abs(point.x).sub(0.17))))).mul(
    select(point.y.lessThan(-0.44), float(1), float(0))
  );
  const bone = inked(skullInside.sub(0.11));
  const skull = {
    alpha: inked(skullInside),
    fill: bone.mul(float(1).sub(max(socket, max(nose, teeth)))),
    cored: bone.mul(socket),
  };

  const fifth = Math.PI / 5;
  const fromTip = abs(
    fract(
      atan(point.x, point.y)
        .mul(5 / (Math.PI * 2))
        .add(0.5)
    ).sub(0.5)
  ).mul(fifth * 2);
  const tip = 0.96;
  const notch = 0.44;
  const starEdge = float(tip * notch * Math.sin(fifth)).div(
    sin(float(fifth).sub(fromTip)).mul(notch).add(sin(fromTip).mul(tip))
  );
  const pentagram = { alpha: inked(starEdge.sub(away)), fill: inked(starEdge.mul(0.66).sub(away)), cored: none };

  const wound = abs(fract(away.mul(1.7).sub(angle.div(Math.PI * 2))).sub(0.5));
  const swirl = {
    alpha: inked(float(0.3).sub(wound)).mul(smoothstep(0.98, 0.8, away)),
    fill: inked(float(0.15).sub(wound)).mul(smoothstep(0.92, 0.8, away)),
    cored: none,
  };

  const shortHand = variant.greaterThan(0.5);
  const tick = inked(float(0.13).sub(abs(fract(angle.mul(12 / (Math.PI * 2)).add(0.5)).sub(0.5)))).mul(
    inked(float(0.08).sub(abs(away.sub(0.68))))
  );
  const rim = inked(float(0.11).sub(abs(away.sub(0.86))));
  const hand = inked(float(0.075).sub(strokeAway(point, [0, 0], [0, 0.62])));
  const hub = inked(float(0.13).sub(away));
  const dial = {
    alpha: select(shortHand, inked(float(0.1).sub(strokeAway(point, [0, 0], [0, 0.4]))), inked(float(0.97).sub(away))),
    fill: select(shortHand, none, float(1).sub(max(max(rim, tick), max(hand, hub)))),
    cored: none,
  };

  const eyeAcross = abs(point.x).sub(0.46);
  const eyeUp = point.y.sub(eyeAcross.mul(0.5));
  const almond = float(1).sub(length(vec2(eyeAcross.div(0.42), eyeUp.div(0.24))));
  const eyes = { alpha: inked(almond).mul(inked(float(0.07).sub(eyeUp))), fill: float(1), cored: none };

  const skin = inked(float(0.09).sub(abs(away.sub(0.86))));
  const glint = inked(float(0.17).sub(length(point.sub(vec2(-0.36, 0.4)))));
  const bubble = {
    alpha: max(max(skin.mul(0.9), glint.mul(0.95)), inked(float(0.86).sub(away)).mul(0.2)),
    fill: float(1),
    cored: glint,
  };

  const hoop = { alpha: inked(float(0.1).sub(abs(away.sub(0.88)))), fill: float(1), cored: none };

  const bar = stroked(strokeAway(point, [-0.74, 0], [0.74, 0]), 0.22, 0.14);

  const vaneUp = clamp(point.y.add(0.8).div(1.72), 0, 1);
  const vaneOff = abs(point.x.sub(sin(point.y.mul(1.5)).mul(0.14)));
  const vaneWide = pow(sin(vaneUp.mul(Math.PI)), 0.6)
    .mul(float(0.38).sub(vaneUp.mul(0.12)))
    .sub(fract(vaneUp.mul(6)).mul(0.07));
  const quill = inked(float(0.055).sub(strokeAway(point, [-0.14, -0.98], [-0.125, -0.7])));
  const feather = {
    alpha: max(inked(vaneWide.sub(vaneOff)), quill),
    fill: inked(vaneWide.sub(0.1).sub(vaneOff)).mul(float(1).sub(inked(float(0.03).sub(vaneOff)))),
    cored: none,
  };

  return { heart, zed, query, cross, skull, pentagram, swirl, dial, eyes, bubble, hoop, bar, feather };
}
