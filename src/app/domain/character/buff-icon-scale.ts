/** How large the buff icons over a piece are drawn, in percent of their usual size. */
export const BUFF_ICON_SCALES = [75, 100, 125, 150, 200] as const;

export type BuffIconScale = (typeof BUFF_ICON_SCALES)[number];

export const DEFAULT_BUFF_ICON_SCALE: BuffIconScale = 100;

export const BUFF_ICON_SCALE_LABEL_KEYS: Record<BuffIconScale, string> = {
  75: 'feature.character.buff.iconSize75',
  100: 'feature.character.buff.iconSize100',
  125: 'feature.character.buff.iconSize125',
  150: 'feature.character.buff.iconSize150',
  200: 'feature.character.buff.iconSize200',
};

/** The size after this one, wrapping back to the smallest, for the button that steps through them. */
export function nextBuffIconScale(scale: BuffIconScale): BuffIconScale {
  const at = BUFF_ICON_SCALES.indexOf(scale);
  return BUFF_ICON_SCALES[(at + 1) % BUFF_ICON_SCALES.length];
}

/**
 * Reads a size back from where it was kept. Anything that is not one of the sizes, an empty value
 * among them, reads as the usual size rather than as nothing.
 */
export function readBuffIconScale(value: unknown): BuffIconScale {
  const scale = typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;
  return (BUFF_ICON_SCALES as readonly unknown[]).includes(scale) ? (scale as BuffIconScale) : DEFAULT_BUFF_ICON_SCALE;
}
