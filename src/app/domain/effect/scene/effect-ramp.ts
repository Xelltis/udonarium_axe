import { hexChannels } from '@axe/core/util/hex-color';

/**
 * The steps of colour an effect is drawn in, from its deepest shadow to white: the dark colour taken
 * deeper, the dark colour, the steps between the two, the light colour, the light colour taken
 * lighter, and white. Hard steps rather than a smooth blend: the hottest heart is white, the middles
 * are tinted, and the deep colour is kept for shadow.
 */
export function rampOf(light: string, dark: string, steps = 7): string[] {
  const top = channelsOf(light, [255, 210, 127]);
  const bottom = channelsOf(dark, [255, 90, 51]);
  const deepest = bottom.map((channel) => channel * 0.35);
  const lighter = top.map((channel) => channel + (255 - channel) * 0.55);
  const stops = [deepest, bottom, top, lighter, [255, 255, 255]];
  const at = [0, 0.22, 0.6, 0.82, 1];
  return Array.from({ length: steps }, (_unused, index) => {
    const share = steps < 2 ? 1 : index / (steps - 1);
    let upper = 1;
    while (upper < at.length - 1 && at[upper] < share) upper++;
    const lower = upper - 1;
    const along = (share - at[lower]) / (at[upper] - at[lower]);
    return hexOf(stops[lower].map((channel, which) => channel + (stops[upper][which] - channel) * along));
  });
}

/** The step of a ramp at a share of the way up it, from its deepest at 0 to white at 1. */
export function stepOf(ramp: readonly string[], share: number): string {
  const index = Math.round(Math.min(1, Math.max(0, share)) * (ramp.length - 1));
  return ramp[index];
}

/** A colour taken towards another by a share. */
export function mixColor(from: string, to: string, share: number): string {
  const a = channelsOf(from, [0, 0, 0]);
  const b = channelsOf(to, [0, 0, 0]);
  return hexOf(a.map((channel, which) => channel + (b[which] - channel) * Math.min(1, Math.max(0, share))));
}

function channelsOf(color: string, fallback: number[]): number[] {
  return hexChannels(color) ?? fallback;
}

function hexOf(channels: readonly number[]): string {
  return `#${channels
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
