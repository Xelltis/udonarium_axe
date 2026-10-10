export const VN_PORTRAIT_POS_UNSET = -1;
export const VN_PORTRAIT_SLOT_COUNT = 12;

/**
 * Older saved data keeps positions as attribute strings, and a missing attribute reads as '',
 * so a number has to be coaxed out rather than compared: '' passes both ends of the range.
 */
export function toPortraitSlot(value: unknown): number | null {
  if (value == null || value === '') return null;
  const pos = Number(value);
  if (!Number.isFinite(pos)) return null;
  const slot = Math.round(pos);
  return slot >= 0 && slot < VN_PORTRAIT_SLOT_COUNT ? slot : null;
}

/** Whether a stored portrait position names one of the stage's slots rather than being unset or out of range. */
export function isVnPortraitPosSet(value: unknown): boolean {
  return toPortraitSlot(value) !== null;
}

/**
 * When the portraits of a tab were last cleared, as a number.
 *
 * Read back from a saved room an attribute is a string, and one never written reads as '',
 * which is not a moment in time. Anything that is not one means the stage was never cleared.
 */
export function toStageResetAt(value: unknown): number {
  if (value == null || value === '') return 0;
  const at = Number(value);
  return Number.isFinite(at) && at > 0 ? at : 0;
}
