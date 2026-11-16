import { hexChannels } from '@axe/core/util/hex-color';
import { lightnessOf } from '@axe/domain/replay/replay-text-color';

/** The plate a speaker gets whose own colour would not tell them apart. */
export const REPLAY_NAME_PLATE_DEFAULT = '#3b4a7a';
/** The ring a speaker gets on the board whose own colour would not show there. */
export const REPLAY_RING_DEFAULT = '#ffd166';

/** Under this lightness, out of 255, a colour is too dark to tell anyone apart by; black is what most rooms leave it at. */
const PLATE_LIGHTNESS_MIN = 40;
/** Over this lightness, out of 255, a colour is too pale. */
const PLATE_LIGHTNESS_MAX = 235;
/** How much the speaker's colour is deepened on the plate, so white reads on it. */
const PLATE_DEEPENING = 0.62;

/**
 * The colour of a speaker's name plate: their own, deepened so white reads on it. A colour too dark
 * or too pale to tell anyone apart by, or not written in hex, gives the usual one.
 */
export function replayPlateColor(color: string): string {
  const rgb = hexChannels(color);
  if (!rgb) return REPLAY_NAME_PLATE_DEFAULT;
  const light = lightnessOf(rgb);
  if (light < PLATE_LIGHTNESS_MIN || light > PLATE_LIGHTNESS_MAX) return REPLAY_NAME_PLATE_DEFAULT;
  const deepen = (channel: number) => Math.round(channel * PLATE_DEEPENING);
  return `rgb(${deepen(rgb[0])}, ${deepen(rgb[1])}, ${deepen(rgb[2])})`;
}

/** The colour a speaker is ringed in on the board: their own, or gold where theirs would not show. */
export function replayRingColor(color: string): string {
  return replayPlateColor(color) === REPLAY_NAME_PLATE_DEFAULT ? REPLAY_RING_DEFAULT : color;
}
