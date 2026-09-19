import {
  layoutReplayText,
  REPLAY_PAGE_MAX_MS,
  REPLAY_PAGE_MIN_MS,
  replayPageDurationMs,
} from '@axe/domain/replay/video/replay-text-layout';

/** Every character is one unit wide, so widths read as character counts. */
const byChars = (text: string) => [...text].length;

describe('laying a subtitle out', () => {
  it('breaks Japanese between any two characters to fill the lines', () => {
    const [page] = layoutReplayText('あいうえおかきくけこ', byChars, 4, 3);

    expect(page.lines).toEqual(['あいうえ', 'おかきく', 'けこ']);
  });

  it('keeps a stop or a closing bracket from starting a line', () => {
    const [page] = layoutReplayText('あいう。えお', byChars, 3, 3);

    expect(page.lines).toEqual(['あいう。', 'えお']);
  });

  it('keeps an opening bracket from ending a line', () => {
    const [page] = layoutReplayText('あい「うえ」', byChars, 3, 3);

    expect(page.lines).toEqual(['あい', '「うえ」']);
  });

  it('keeps English words whole, breaking at the spaces', () => {
    const [page] = layoutReplayText('the quick brown fox', byChars, 10, 3);

    expect(page.lines).toEqual(['the quick', 'brown fox']);
  });

  it('keeps a Korean word whole', () => {
    const [page] = layoutReplayText('안녕하세요 여러분 반갑습니다', byChars, 8, 3);

    expect(page.lines).toEqual(['안녕하세요', '여러분', '반갑습니다']);
  });

  it('breaks a word wider than a line where it must', () => {
    const [page] = layoutReplayText('abcdefghij', byChars, 4, 3);

    expect(page.lines).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('breaks a word wider than a line where it must, even after other words', () => {
    const [page] = layoutReplayText('see abcdefghijkl', byChars, 5, 5);

    expect(page.lines).toEqual(['see', 'abcde', 'fghij', 'kl']);
  });

  it('keeps the line breaks of the text', () => {
    const [page] = layoutReplayText('あい\nうえ', byChars, 10, 3);

    expect(page.lines).toEqual(['あい', 'うえ']);
  });

  it('goes on to another page rather than cutting the text off', () => {
    const pages = layoutReplayText('あいうえおかきくけこさしすせそ', byChars, 5, 2);

    expect(pages.map((page) => page.lines)).toEqual([['あいうえお', 'かきくけこ'], ['さしすせそ']]);
    expect(pages[0].charCount).toBe(10);
  });

  it('gives an empty text one empty page', () => {
    expect(layoutReplayText('', byChars, 10, 3)).toEqual([{ lines: [''], charCount: 0 }]);
  });
});

describe('how long a page stays', () => {
  const page = (charCount: number) => ({ lines: [], charCount });

  it('gives Japanese time to read at seven characters a second', () => {
    expect(replayPageDurationMs(page(35), 'ja')).toBe(5_800);
  });

  it('reads English faster by the character', () => {
    expect(replayPageDurationMs(page(35), 'en')).toBeLessThan(replayPageDurationMs(page(35), 'ja'));
  });

  it('never goes below a glance nor above a long look', () => {
    expect(replayPageDurationMs(page(1), 'ja')).toBe(REPLAY_PAGE_MIN_MS);
    expect(replayPageDurationMs(page(500), 'ja')).toBe(REPLAY_PAGE_MAX_MS);
  });

  it('reads faster when asked', () => {
    expect(replayPageDurationMs(page(35), 'ja', 2)).toBeLessThan(replayPageDurationMs(page(35), 'ja'));
  });
});
