// Z-fighting avoidance lifts; larger = drawn in front.

export const Z_OFFSET_MASK_PX = 0.1;
export const Z_OFFSET_RANGE_PX = 0.25;
export const Z_OFFSET_DARKNESS_PX = 0.9;
export const Z_OFFSET_VISION_VOLUME_PX = 0.95;

/** The CSS transform that lifts a layer by one of the offsets above, to keep it from z-fighting. */
export function translateZCss(zOffsetPx: number): string {
  return `translateZ(${zOffsetPx}px)`;
}
