import type { BladeTones } from '@axe/domain/effect/scene/blade/blade-tones';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { glow, type Point } from '@axe/domain/effect/scene/parts';

/*
 * A blade of light held ready before a great stroke, and the light drawn in to it as it is gathered.
 *
 * A ramp runs from the deepest shadow at 0 to white at 6.
 */

/** How wide a blade held ready is along it, from its hilt to its point. */
const HELD_BLADE = [0.7, 0.85, 0.95, 1, 0.92, 0.66, 0];

/**
 * A blade of light held ready, from its hilt to its point: a glow about it, and a white-hot heart
 * within a body of its colour within a dark outline.
 */
export function heldBlade(hilt: Point, tip: Point, wide: number, tones: BladeTones, alpha: number): EffectRibbon[] {
  if (alpha <= 0.01 || wide <= 0) return [];
  const last = HELD_BLADE.length - 1;
  const points = HELD_BLADE.map((_width, index) => ({
    x: hilt.x + ((tip.x - hilt.x) * index) / last,
    y: hilt.y + ((tip.y - hilt.y) * index) / last,
    z: hilt.z + ((tip.z - hilt.z) * index) / last,
  }));
  const widths = HELD_BLADE.map((share) => wide * share);
  return [
    {
      points,
      widths: widths.map((width) => width * 3.4),
      color: tones.glow,
      alpha: 0.4 * alpha,
      blend: 'light',
      soft: 1,
    },
    { points, widths: widths.map((width) => width * 1.75), color: tones.rim, alpha: 0.8 * alpha, blend: 'color' },
    { points, widths: widths.map((width) => width * 1.45), color: tones.body, core: tones.pale, alpha, blend: 'color' },
    { points, widths: widths.map((width) => width * 0.6), color: tones.hot, core: '#ffffff', alpha, blend: 'color' },
  ];
}

/** Light drawn in to a blade as it is gathered: sparks closing on a point from all about and above it, faster as it fills. */
export function drawGathering(
  drawn: Staged,
  at: Point,
  cell: number,
  ramp: readonly string[],
  charge: number,
  seed: number,
  forward: number
): void {
  if (charge <= 0 || charge >= 1) return;
  for (let index = 0; index < 10; index++) {
    const turn = (Math.PI * 2 * index) / 10 + (seed % 7);
    const lift = Math.abs(Math.sin(index * 2.4)) * 0.5;
    const cycle = (charge * 3 + index / 10) % 1;
    const out = cell * (1.9 - cycle * 1.7);
    const speed = cell * (2 + 5 * charge);
    drawn.motes.push({
      ...glow(
        { x: at.x + Math.cos(turn) * out, y: at.y + Math.sin(turn) * out, z: at.z + lift * out },
        cell * 0.055,
        ramp[4],
        Math.min(1, cycle * 3) * charge,
        forward
      ),
      shape: 'spark',
      velocity: { x: -Math.cos(turn) * speed, y: -Math.sin(turn) * speed, z: -lift * speed },
      trail: 0.06,
    });
  }
}
