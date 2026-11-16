import type { ReplayTimedPage } from '@axe/domain/replay/video/replay-video-timeline';

/** The longest a character takes to come on; a page whose time is short types faster than that. */
export const REPLAY_TYPE_MS_PER_CHAR = 30;

/** How much of a page's time the typing may take up, so it is done well before the page is read. */
const TYPING_SHARE = 0.4;

/** The page of a line on screen at a moment of it, the last page staying once its time is up. */
export function replayPageAt(pages: readonly ReplayTimedPage[], localMs: number): ReplayTimedPage | null {
  let found: ReplayTimedPage | null = null;
  for (const page of pages) {
    if (page.startMs <= localMs) found = page;
    else break;
  }
  return found;
}

/**
 * How many characters of a page have been typed out `intoMs` into it: one at once, then one every
 * {@link REPLAY_TYPE_MS_PER_CHAR}, or faster where the page's time would not fit them all in its
 * first part.
 */
export function replayRevealCount(page: ReplayTimedPage, intoMs: number): number {
  if (page.charCount < 1) return 0;
  const perChar = Math.min(REPLAY_TYPE_MS_PER_CHAR, (page.durationMs * TYPING_SHARE) / page.charCount);
  return Math.min(page.charCount, Math.floor(intoMs / Math.max(1, perChar)) + 1);
}
