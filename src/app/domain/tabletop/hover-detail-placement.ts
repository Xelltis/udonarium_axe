export const HOVER_DETAIL_PLACEMENTS = ['piece', 'screen-edges'] as const;

/** Where the hover detail of a piece appears while the 2D table is shown. */
export type HoverDetailPlacement = (typeof HOVER_DETAIL_PLACEMENTS)[number];

/** Beside the piece, the way every table has always shown it. */
export const DEFAULT_HOVER_DETAIL_PLACEMENT: HoverDetailPlacement = 'piece';

export function asHoverDetailPlacement(value: unknown): HoverDetailPlacement {
  return typeof value === 'string' && (HOVER_DETAIL_PLACEMENTS as readonly string[]).includes(value)
    ? (value as HoverDetailPlacement)
    : DEFAULT_HOVER_DETAIL_PLACEMENT;
}
