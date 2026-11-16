/**
 * Choosing targets in order.
 *
 * That order is the order the effect fires in, so the truth is the list of what was chosen
 * in order, and the mark on each piece is only a copy of it.
 */

/** Choosing again: what is chosen comes off, and what is not goes on the end. */
export function toggleEffectPick(picks: readonly string[], identifier: string, limit: number): string[] {
  if (identifier.length < 1) return [...picks];

  const index = picks.indexOf(identifier);
  if (index >= 0) return [...picks.slice(0, index), ...picks.slice(index + 1)];

  const capacity = Math.max(limit, 1);
  // Once full the oldest is pushed out, which for a single target is a change of choice
  // rather than a full selection nothing can be added to.
  const kept = picks.length < capacity ? [...picks] : picks.slice(picks.length - capacity + 1);
  return [...kept, identifier];
}

/** Where in the order it was chosen, counting from one. Nothing for the unchosen. */
export function effectPickOrder(picks: readonly string[], identifier: string): number {
  return picks.indexOf(identifier) + 1;
}
