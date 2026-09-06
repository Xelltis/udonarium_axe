import {
  formatChatTickerMessage,
  makeChatTickerPath,
  makeChatTickerRepeatOffsets,
  MAX_CHAT_TICKER_REPETITIONS,
  normalizeTickerDistance,
  pointAtChatTickerDistance,
} from '@axe/features/chat/chat-ticker/chat-ticker-layout';

describe('chat ticker layout', () => {
  it('builds the four inward-facing edges in bottom, right, top, left order', () => {
    const path = makeChatTickerPath(800, 600, 20)!;

    expect(path.margin).toBe(26);
    expect(path.segments.map((segment) => segment.degrees)).toEqual([0, 270, 180, 90]);
    expect(path.segments.map((segment) => segment.length)).toEqual([748, 548, 748, 548]);
    expect(path.perimeter).toBe(2592);
  });

  it('moves backwards along the bottom edge from right to left', () => {
    const path = makeChatTickerPath(800, 600, 20)!;
    const bottomLength = path.segments[0].length;
    const start = pointAtChatTickerDistance(path, bottomLength - 10);
    const later = pointAtChatTickerDistance(path, bottomLength - 10 - 40);

    expect(start.degrees).toBe(0);
    expect(later.degrees).toBe(0);
    expect(later.x).toBe(start.x - 40);
  });

  it('keeps negative positions on the closed perimeter', () => {
    expect(normalizeTickerDistance(-10, 100)).toBe(90);
    expect(normalizeTickerDistance(110, 100)).toBe(10);
  });

  it('refuses a viewport too small for the selected text', () => {
    expect(makeChatTickerPath(40, 40, 30)).toBeNull();
  });

  it('fills the perimeter with up to eight evenly-spaced copies of a short message', () => {
    const offsets = makeChatTickerRepeatOffsets(2400, 100, 50);

    expect(offsets).toHaveLength(MAX_CHAT_TICKER_REPETITIONS);
    expect(offsets).toEqual([0, 300, 600, 900, 1200, 1500, 1800, 2100]);
  });

  it('reduces the copy count for longer messages so the separator gaps remain readable', () => {
    expect(makeChatTickerRepeatOffsets(2400, 500, 50)).toEqual([0, 600, 1200, 1800]);
    expect(makeChatTickerRepeatOffsets(2400, 3000, 50)).toEqual([0]);
    expect(makeChatTickerRepeatOffsets(0, 100, 50)).toEqual([]);
  });

  it('formats only ordinary public ticker messages', () => {
    expect(formatChatTickerMessage({ name: '案内役', text: '扉が開く\n音がした' })).toBe(
      '案内役：扉が開く 音がした　◆'
    );
    expect(formatChatTickerMessage({ text: '秘密', isDirect: true })).toBeNull();
    expect(formatChatTickerMessage({ text: '秘匿', isSecret: true })).toBeNull();
    expect(formatChatTickerMessage({ text: 'システム', isSystem: true })).toBeNull();
  });
});
