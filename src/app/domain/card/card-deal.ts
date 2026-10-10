export interface DealPlan {
  /** How many each player is dealt, in the order the players come. */
  counts: number[];
  /** Which cards each player is dealt, by their place in the deck. */
  indexes: number[][];
}

/**
 * Splits a deck round-robin across the players, the way cards are dealt one at a time around a table.
 *
 * Players earlier in the order get the leftover cards when the deck does not divide evenly. With no
 * players or no cards, nobody is dealt anything.
 */
export function planDeal(cardCount: number, participantCount: number): DealPlan {
  if (participantCount < 1 || cardCount < 1) {
    return { counts: new Array(Math.max(0, participantCount)).fill(0), indexes: [] };
  }

  const counts = new Array(participantCount).fill(0);
  const indexes: number[][] = Array.from({ length: participantCount }, () => []);
  for (let index = 0; index < cardCount; index++) {
    const seat = index % participantCount;
    counts[seat] += 1;
    indexes[seat].push(index);
  }
  return { counts, indexes };
}
