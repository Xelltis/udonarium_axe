/** A count of cells written into a box, taken as none where it is not a whole one above zero. */
export function wholeCells(value: number): number {
  const cells = Math.floor(Number(value));
  return Number.isFinite(cells) && cells > 0 ? cells : 0;
}
