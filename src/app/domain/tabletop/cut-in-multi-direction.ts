export const CUT_IN_MULTI_DIRECTION_MODES = [
  'none',
  'vertical',
  'vertical-right',
  'vertical-left',
  'four-directions',
] as const;

export type CutInMultiDirectionMode = (typeof CUT_IN_MULTI_DIRECTION_MODES)[number];

export const DEFAULT_CUT_IN_MULTI_DIRECTION_MODE: CutInMultiDirectionMode = 'none';

export function asCutInMultiDirectionMode(value: unknown): CutInMultiDirectionMode {
  return typeof value === 'string' && (CUT_IN_MULTI_DIRECTION_MODES as readonly string[]).includes(value)
    ? (value as CutInMultiDirectionMode)
    : DEFAULT_CUT_IN_MULTI_DIRECTION_MODE;
}
