import { toHalfWidth } from '@axe/core/util/string-util';

/**
 * A `{name}` reference, or a `t{name}` one to the piece a line is aimed at. Global, so it is only for
 * `replace` and `matchAll`, which start from the beginning whatever an earlier search left behind.
 */
export const CHARACTER_REFERENCE = /[tTｔＴ]?[{｛]\s*([^{}｛｝]+)\s*[}｝]/g;

/** One reference in a line, where it stands, and the name it reads in half-width. */
export interface ReferenceSite {
  from: number;
  to: number;
  name: string;
  /** Whether it reads from the piece the line is aimed at, `t{name}`. */
  targeted: boolean;
  /** Whether it asks for a resource's maximum, `{name^}`. */
  useMax: boolean;
}

/** The name a reference reads, in half-width with a trailing `^` taken off, and whether one was there. */
export function readReferenceName(raw: string): { name: string; useMax: boolean } {
  const name = toHalfWidth(raw);
  const withMax = name.match(/(.+)([\^＾]$)/);
  return withMax ? { name: withMax[1], useMax: true } : { name, useMax: false };
}

/** Every reference in a line as typed, before any is filled in. */
export function referenceSites(text: string): ReferenceSite[] {
  return [...text.matchAll(CHARACTER_REFERENCE)].map((matched) => ({
    from: matched.index,
    to: matched.index + matched[0].length,
    ...readReferenceName(matched[1]),
    targeted: /^[tTｔＴ]/.test(matched[0]),
  }));
}
