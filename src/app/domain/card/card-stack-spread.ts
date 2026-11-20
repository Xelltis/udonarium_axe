/** The cell, in px, that the offsets here were laid out for; they grow and shrink with the table's grid. */
const LAID_OUT_FOR_CELL_PX = 50;

/**
 * Where a drawn card lands from its stack, in px of the laid-out cell: each card of one draw a step
 * further along than the one before, and anywhere within the jitter past that.
 */
const DRAW_OFFSET_PX = { x: 100, y: 25 };
const DRAW_STEP_PX = { x: 18, y: 8 };
const DRAW_JITTER_PX = 50;

/** How far to either side a card of a stack broken up lands from where the stack lay, in px. */
const BREAK_SCATTER_PX = 25;

/** How far to either side a pile of a stack split up lands from where the stack lay, in px. */
const SPLIT_SCATTER_PX = 50;

/** How far a card or a pile is moved from where its stack lay, in px. */
export interface SpreadOffset {
  readonly x: number;
  readonly y: number;
}

/** A random offset of up to `reach` to either side. */
function scatter(reach: number, random: () => number): number {
  return reach - random() * reach * 2;
}

/**
 * Where the `index`th card of one draw lands from the stack it was drawn from, on a table whose grid
 * is `gridSize` px: down and to the right, a step further along for each card drawn before it in the
 * same draw. `random` stands in for `Math.random`.
 */
export function drawnCardOffset(index: number, gridSize: number, random: () => number = Math.random): SpreadOffset {
  const scale = gridSize / LAID_OUT_FOR_CELL_PX;
  const x = (DRAW_OFFSET_PX.x + index * DRAW_STEP_PX.x + random() * DRAW_JITTER_PX) * scale;
  const y = (DRAW_OFFSET_PX.y + index * DRAW_STEP_PX.y + random() * DRAW_JITTER_PX) * scale;
  return { x, y };
}

/**
 * Where a card of a stack broken up lands from where the stack lay, anywhere a little to either side,
 * on a table whose grid is `gridSize` px.
 */
export function brokenCardOffset(gridSize: number, random: () => number = Math.random): SpreadOffset {
  const scale = gridSize / LAID_OUT_FOR_CELL_PX;
  const x = scatter(BREAK_SCATTER_PX, random) * scale;
  const y = scatter(BREAK_SCATTER_PX, random) * scale;
  return { x, y };
}

/**
 * Where a pile of a stack split up lands from where the stack lay, anywhere a little to either side,
 * on a table whose grid is `gridSize` px.
 */
export function splitPileOffset(gridSize: number, random: () => number = Math.random): SpreadOffset {
  const scale = gridSize / LAID_OUT_FOR_CELL_PX;
  const x = scatter(SPLIT_SCATTER_PX, random) * scale;
  const y = scatter(SPLIT_SCATTER_PX, random) * scale;
  return { x, y };
}

/**
 * Which pile each card of a stack split into `piles` goes to, top card first: the first share of the
 * cards to the first pile, the next share to the next, and so on, as near even as the count allows.
 */
export function splitPileIndexes(cardCount: number, piles: number): number[] {
  const indexes: number[] = [];
  let pile = 0;
  let splitIndex = (cardCount / piles) * (pile + 1);
  for (let i = 0; i < cardCount; i++) {
    indexes.push(pile);
    if (splitIndex <= i + 1) {
      pile++;
      splitIndex = (cardCount / piles) * (pile + 1);
    }
  }
  return indexes;
}
