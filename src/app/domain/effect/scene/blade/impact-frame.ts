import type { Impact } from '@axe/domain/effect/scene/blade/cut-impact';
import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { floorMark, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import { drawStar, starSpikes } from '@axe/domain/effect/scene/strike/strike-parts';

/*
 * The impact frame of a cut struck hard: for the instant it crosses, a star of thick spikes, each a
 * near black rim about the blade's colour about a white heart, bursts out of where it crossed, leant
 * along the way the blade went; the floor under it flashes white, and rays of light stand out from
 * it a moment longer.
 */

/** How long the star stands open, and how long the rays last, in seconds. */
const STAR_S = 0.09;
const RAYS_S = 0.22;
/** How many spikes the star has, and how far they lean along the way the blade went. */
const SPIKES = 10;
const LEAN = 0.6;

/**
 * A way kept between a little over level and a rise, as the sine of its tilt: turned up off the floor
 * where it would point down into it, so nothing of the star goes below, and down where it rises more.
 */
function between(way: Point, rise: number): Point {
  const z = Math.min(Math.max(way.z, 0.05), rise);
  if (z === way.z) return way;
  const flat = Math.hypot(way.x, way.y) || 1;
  const level = Math.sqrt(1 - z * z);
  return { x: (way.x / flat) * level, y: (way.y / flat) * level, z };
}

/**
 * The impact frame of a cut, as large as `size` in table pixels, `since` seconds after it crosses;
 * see the head of this file. Its spikes rise no steeper than `rise`, as the sine of their tilt: a star
 * that splashes out over the ground is held near level.
 */
export function drawImpactFrame(drawn: Staged, impact: Impact, size: number, since: number, rise = 1): void {
  if (since < 0 || since >= RAYS_S) return;
  const { at, way, tones, forward, seed } = impact;
  const open = outCubic(within(since, 0, 0.025)) * (1 - within(since, STAR_S * 0.55, STAR_S));
  if (open > 0) {
    const spikes = starSpikes(SPIKES, way, LEAN, seed).map((spike) => ({ ...spike, way: between(spike.way, rise) }));
    drawStar(drawn, at, size, spikes, tones, open, forward + 4);
    if (impact.floor) {
      drawn.floor.push(floorMark('disc', impact.floor, size * 1.2, 1, '#ffffff', 0.4 * open, 'light', 0));
    }
  }
  drawn.motes.push(...starBurst(at, size * 2.3, tones.glow, since / RAYS_S, forward + 5, 8, seed));
}
