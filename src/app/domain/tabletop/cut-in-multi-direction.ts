export const CUT_IN_MULTI_DIRECTION_MODES = [
  'none',
  'vertical',
  'vertical-right',
  'vertical-left',
  'four-directions',
] as const;

export type CutInMultiDirectionMode = (typeof CUT_IN_MULTI_DIRECTION_MODES)[number];

export const DEFAULT_CUT_IN_MULTI_DIRECTION_MODE: CutInMultiDirectionMode = 'none';

/**
 * Reads a value as a multi-direction mode, falling back to `none` for anything unknown.
 *
 * The mode says which sides of a table seen from above a cut-in is laid out again for, each copy
 * turned to read from its side. The display settings pass through this as they are read and as
 * their pickers change, and the cut-in handler reads the mode through it before showing a cut-in.
 */
export function asCutInMultiDirectionMode(value: unknown): CutInMultiDirectionMode {
  return typeof value === 'string' && (CUT_IN_MULTI_DIRECTION_MODES as readonly string[]).includes(value)
    ? (value as CutInMultiDirectionMode)
    : DEFAULT_CUT_IN_MULTI_DIRECTION_MODE;
}
