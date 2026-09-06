// Z-fighting avoidance lifts; larger = drawn in front.

/** The whole run of background layers sits below the board. Used as a negative lift. */
export const Z_OFFSET_BACKGROUND_LAYERS_PX = 0.05;
/** Over the board's own picture and its grid lines, and under everything standing on it. */
export const Z_OFFSET_FOREGROUND_LAYERS_PX = 0.02;
export const Z_OFFSET_MASK_PX = 0.1;
export const Z_OFFSET_AMBIENCE_PX = 0.12;
export const Z_OFFSET_TABLETOP_OBJECT_PX = 0.15;
export const Z_OFFSET_RANGE_PX = 0.25;
export const Z_OFFSET_DARKNESS_PX = 0.9;
export const Z_OFFSET_VISION_VOLUME_PX = 0.95;
export const Z_OFFSET_TALL_OBJECT_PX = 1.0;

export function translateZCss(zOffsetPx: number): string {
  return `translateZ(${zOffsetPx}px)`;
}
