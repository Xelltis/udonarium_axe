/** The faces a compass can be drawn with, which is a matter of taste rather than of the table. */
export const COMPASS_FACES = ['modern', 'fantasy', 'sf'] as const;

export type CompassFace = (typeof COMPASS_FACES)[number];

/** The plain one, which is what a compass looks like until somebody says otherwise. */
export const DEFAULT_COMPASS_FACE: CompassFace = 'modern';

/** A stored value read as a face, or null where it is not one. */
export function asCompassFace(value: unknown): CompassFace | null {
  return typeof value === 'string' && (COMPASS_FACES as readonly string[]).includes(value)
    ? (value as CompassFace)
    : null;
}

/** The next face round, for a control that carries all of them. */
export function nextCompassFace(face: CompassFace): CompassFace {
  return COMPASS_FACES[(COMPASS_FACES.indexOf(face) + 1) % COMPASS_FACES.length];
}
