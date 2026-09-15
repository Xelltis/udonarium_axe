/**
 * The tag that marks a kept-back notice as a roll of the table die with that identifier, so the
 * latest such roll can be found and shown to the table later.
 */
export function dieRollTag(dieIdentifier: string): string {
  return `die:${dieIdentifier.trim()}`;
}
