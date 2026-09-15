/**
 * Turns full-width ASCII letters, digits and symbols into their half-width forms, leaving
 * everything else, the ideographic space included, as it is.
 */
export function toHalfWidth(str: string): string {
  return str.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}
