export const MULTI_ANGLE_FONT_SCALES = ['small', 'medium', 'large'] as const;

/** How large the 2D menus and the edge ticker draw their text. */
export type MultiAngleFontScale = (typeof MULTI_ANGLE_FONT_SCALES)[number];

export const DEFAULT_MULTI_ANGLE_FONT_SCALE: MultiAngleFontScale = 'small';

/** Small keeps the original sizes, so an existing room looks unchanged. */
const MULTI_ANGLE_FONT_SCALE_FACTORS: Record<MultiAngleFontScale, number> = {
  small: 1,
  medium: 1.15,
  large: 1.3,
};

/** Reads a stored font scale, falling back to small for anything unknown. */
export function asMultiAngleFontScale(value: unknown): MultiAngleFontScale {
  return typeof value === 'string' && (MULTI_ANGLE_FONT_SCALES as readonly string[]).includes(value)
    ? (value as MultiAngleFontScale)
    : DEFAULT_MULTI_ANGLE_FONT_SCALE;
}

/** The multiplier a font scale applies to text sizes, with an unknown value read as small. */
export function multiAngleFontScaleFactor(value: unknown): number {
  return MULTI_ANGLE_FONT_SCALE_FACTORS[asMultiAngleFontScale(value)];
}
