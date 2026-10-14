/**
 * The most a stretch of ground may charge over the one step it is already worth.
 *
 * Kept apart from the synchronised object that carries a charge on the table, so the brushes that
 * only reason about charges, which the replay video worker also loads, need none of the sync.
 */
export const MOST_MOVE_COST_EXTRA = 9;
