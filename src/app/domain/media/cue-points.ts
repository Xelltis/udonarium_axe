/** The number of places a track can be marked to jump to. */
export const CUE_SLOTS = 4;

/** A track's marked places in seconds, one for each slot, null where a slot is empty. */
export type CuePoints = readonly (number | null)[];

/** Every slot empty. */
export const NO_CUE_POINTS: CuePoints = Array.from({ length: CUE_SLOTS }, () => null);

/**
 * Reads a track's marked places as they were sent or saved.
 *
 * Text that is empty or broken reads as every slot empty, and a slot holding anything but a point
 * at or after the start reads as empty, as does any slot past the last there is. Missing slots are
 * filled with empty ones.
 */
export function readCuePoints(raw: unknown): CuePoints {
  if (typeof raw !== 'string' || raw === '') return NO_CUE_POINTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NO_CUE_POINTS;
    return Array.from({ length: CUE_SLOTS }, (_, slot) => {
      const value: unknown = parsed[slot];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    });
  } catch {
    return NO_CUE_POINTS;
  }
}

/** Writes a track's marked places down as the text `readCuePoints` reads back; empty when every slot is. */
export function writeCuePoints(points: CuePoints): string {
  const slots = Array.from({ length: CUE_SLOTS }, (_, slot) => {
    const value = points[slot];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) / 1000 : null;
  });
  return slots.every((value) => value === null) ? '' : JSON.stringify(slots);
}

/** The marked places with one slot set to a point, or emptied with null. */
export function withCuePoint(points: CuePoints, slot: number, seconds: number | null): CuePoints {
  return Array.from({ length: CUE_SLOTS }, (_, index) => (index === slot ? seconds : (points[index] ?? null)));
}
