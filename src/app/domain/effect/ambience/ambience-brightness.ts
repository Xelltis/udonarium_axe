/**
 * How bright the air over one patch of the board is, whatever the rest of the table is lit by.
 *
 * A table is lit by what stands on it: lamps, torches, the daylight the room set. That covers
 * a lit room and a dark one, but not a patch of either inside the other - the pool of magical
 * darkness a wizard drops over a doorway, or the shaft of daylight down a stairwell. Those are
 * held here, as a floor or a ceiling on the light of the ground they cover.
 */
export const AMBIENCE_BRIGHTNESS = ['none', 'dark', 'dim', 'bright'] as const;

export type AmbienceBrightness = (typeof AMBIENCE_BRIGHTNESS)[number];

export const DEFAULT_AMBIENCE_BRIGHTNESS: AmbienceBrightness = 'none';

/** How much light each one comes to, from nothing to full daylight. */
const BRIGHTNESS_LEVEL: Record<AmbienceBrightness, number> = { none: 0, dark: 0, dim: 0.5, bright: 1 };

/** Reads a stored brightness, with anything unknown - an empty one included - leaving the light alone. */
export function ambienceBrightnessOf(value: unknown): AmbienceBrightness {
  return typeof value === 'string' && (AMBIENCE_BRIGHTNESS as readonly string[]).includes(value)
    ? (value as AmbienceBrightness)
    : DEFAULT_AMBIENCE_BRIGHTNESS;
}

/** What the ground under it is lit to, or nothing where it leaves the light as it found it. */
export function ambienceLightLevelOf(brightness: AmbienceBrightness): number | null {
  return brightness === 'none' ? null : BRIGHTNESS_LEVEL[brightness];
}

/**
 * Whether it puts the light out rather than adding to it.
 *
 * Darkness is a ceiling and not a floor: a pool of it over a lit floor is dark, which is the
 * whole of what makes it worth dropping.
 */
export function ambienceSnuffsLight(brightness: AmbienceBrightness): boolean {
  return brightness === 'dark';
}
