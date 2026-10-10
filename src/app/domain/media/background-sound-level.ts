/**
 * A background sound's room volume as it was sent, read as a number from 0 to 1.
 *
 * Anything that is not a number, an empty value included, reads as full volume rather than as
 * silence: an older version or an empty attribute sends nothing there, and a sound that has gone
 * quiet without anybody turning it down would look like a fault.
 */
export function backgroundSoundLevel(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 1;
  const level = Number(raw);
  return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 1;
}
