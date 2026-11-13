import { REPLAY_TYPE_MS_PER_CHAR, replayPageAt, replayRevealCount } from '@axe/domain/replay/video/replay-page-typing';
import type { ReplayTimedPage } from '@axe/domain/replay/video/replay-video-timeline';

function page(startMs: number, durationMs: number, text = 'あいうえお'): ReplayTimedPage {
  return { lines: [text], charCount: [...text].length, startMs, durationMs };
}

describe('replayPageAt()', () => {
  const pages = [page(0, 1000), page(1000, 1000), page(2000, 1000)];

  it('gives the page whose time the moment falls in', () => {
    expect(replayPageAt(pages, 0)).toBe(pages[0]);
    expect(replayPageAt(pages, 999)).toBe(pages[0]);
    expect(replayPageAt(pages, 1000)).toBe(pages[1]);
    expect(replayPageAt(pages, 2500)).toBe(pages[2]);
  });

  it('keeps the last page once its time is up', () => {
    expect(replayPageAt(pages, 10_000)).toBe(pages[2]);
  });

  it('gives nothing before the first page, and for no pages at all', () => {
    expect(replayPageAt([page(500, 1000)], 100)).toBeNull();
    expect(replayPageAt([], 100)).toBeNull();
  });
});

describe('replayRevealCount()', () => {
  it('shows the first character at once and one more every so many milliseconds', () => {
    const long = page(0, 10_000);

    expect(replayRevealCount(long, 0)).toBe(1);
    expect(replayRevealCount(long, REPLAY_TYPE_MS_PER_CHAR - 1)).toBe(1);
    expect(replayRevealCount(long, REPLAY_TYPE_MS_PER_CHAR)).toBe(2);
    expect(replayRevealCount(long, REPLAY_TYPE_MS_PER_CHAR * 3)).toBe(4);
  });

  it('never shows more than the page holds', () => {
    expect(replayRevealCount(page(0, 10_000), 60_000)).toBe(5);
  });

  it('types a page faster when its time would not fit the characters into its first part', () => {
    // Five characters in 100ms: 8ms each, so all five are on by 32ms.
    const brief = page(0, 100);

    expect(replayRevealCount(brief, 0)).toBe(1);
    expect(replayRevealCount(brief, 8)).toBe(2);
    expect(replayRevealCount(brief, 32)).toBe(5);
  });

  it('shows nothing of an empty page', () => {
    expect(replayRevealCount(page(0, 1000, ''), 500)).toBe(0);
  });
});
