import { type BeatGrid, BEATS_PER_BAR, beatsAt } from '@axe/domain/media/beat-grid';

/** The most times a second the screen may glow, kept under what can set off a seizure. */
export const MAX_GLOWS_PER_SECOND = 3;

/** How strongly a glow on a beat that does not start a bar shines, against one that does. */
const OFFBEAT_GLOW = 0.6;
/** How quickly a glow dies away, as a rate per share of the gap to the next glow. */
const GLOW_DECAY = 5;

/**
 * How brightly the screen glows at a point in the track, from 0 to 1: brightest the moment a beat
 * falls, fading quickly until the next, and brighter on the first beat of a bar than on the others.
 *
 * A tempo faster than `MAX_GLOWS_PER_SECOND` beats a second glows on every other beat instead, or
 * fewer still, so the screen never flashes faster than that.
 */
export function beatGlow(grid: BeatGrid, seconds: number): number {
  const every = Math.max(1, Math.ceil(grid.bpm / 60 / MAX_GLOWS_PER_SECOND));
  const glows = beatsAt(grid, seconds) / every;
  const glow = Math.floor(glows + 1e-9);
  const beatOfBar = (((glow * every) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR;
  const accent = beatOfBar === 0 ? 1 : OFFBEAT_GLOW;
  return accent * Math.exp(-GLOW_DECAY * (glows - glow));
}
