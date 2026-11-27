let readyingAhead = true;

/**
 * Whether the graphics card is readied for a new kind of thing before the frame that first draws it,
 * on every scene that readies: the table's and the small stages of the previews alike. On unless asked
 * otherwise, as the end-to-end pictures ask, whose clock is held and would hold the readying up with it.
 */
export function readiesAhead(): boolean {
  return readyingAhead;
}

/** Turns readying ahead on or off for every scene; see {@link readiesAhead}. */
export function readyAhead(on: boolean): void {
  readyingAhead = on;
}
