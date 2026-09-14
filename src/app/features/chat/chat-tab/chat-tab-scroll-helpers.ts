import { ChatMessage } from '@axe/domain/chat/chat-message';

export type ScrollPosition = { top: number; bottom: number; clientHeight: number; scrollHeight: number };

export function findDisplayableTopIndex(chatMessages: readonly ChatMessage[], dispLength: number): number {
  const len = chatMessages.length;
  let count = 0;
  let i = len - 1;
  for (; i >= 0; i--) {
    if (chatMessages[i].isDisplayable) count++;
    if (count >= dispLength) return i;
  }
  return i;
}

export function getBoundedScrollPosition(panel: HTMLDivElement): ScrollPosition {
  let top = panel.scrollTop;
  const clientHeight = panel.clientHeight;
  const scrollHeight = panel.scrollHeight;
  if (top < 0) top = 0;
  if (scrollHeight - clientHeight < top) top = scrollHeight - clientHeight;
  const bottom = top + clientHeight;
  return { top, bottom, clientHeight, scrollHeight };
}

export function calcMaxElementHeight(elements: ArrayLike<{ clientHeight: number }>, minMessageHeight: number): number {
  let maxHeight = minMessageHeight;
  for (let i = elements.length - 1; 0 <= i; i--) {
    const height = elements[i].clientHeight;
    if (maxHeight < height) maxHeight = height;
  }
  return maxHeight;
}

type CalcIndexRangeParams = {
  topIndex: number;
  bottomIndex: number;
  chatMessagesLength: number;
  minMessageHeight: number;
  maxHeight: number;
  messageBoxTop: number;
  messageBoxBottom: number;
  scrollWideTop: number;
  scrollWideBottom: number;
  scrollPosition: ScrollPosition;
  isIOS: boolean;
};

export function calcIndexRange(params: CalcIndexRangeParams): { topIndex: number; bottomIndex: number } {
  const {
    topIndex,
    bottomIndex,
    chatMessagesLength,
    minMessageHeight,
    maxHeight,
    messageBoxTop,
    messageBoxBottom,
    scrollWideTop,
    scrollWideBottom,
    scrollPosition,
    isIOS,
  } = params;

  let nextTopIndex = topIndex;
  let nextBottomIndex = bottomIndex;

  if (scrollWideTop >= messageBoxBottom || messageBoxTop >= scrollWideBottom) {
    const lastIndex = chatMessagesLength - 1;
    const scrollBottomHeight = scrollPosition.scrollHeight - scrollPosition.top - scrollPosition.clientHeight;

    nextBottomIndex = lastIndex - Math.floor(scrollBottomHeight / minMessageHeight);
    nextTopIndex = nextBottomIndex - Math.floor(scrollPosition.clientHeight / minMessageHeight);

    nextBottomIndex += 1;
    nextTopIndex -= 1;
  } else {
    if (scrollWideTop < messageBoxTop) {
      nextTopIndex -= Math.floor((messageBoxTop - scrollWideTop) / maxHeight) + 1;
    } else if (scrollWideTop > messageBoxTop) {
      if (!isIOS) nextTopIndex += Math.floor((scrollWideTop - messageBoxTop) / maxHeight);
    }

    if (messageBoxBottom > scrollWideBottom) {
      if (!isIOS) nextBottomIndex -= Math.floor((messageBoxBottom - scrollWideBottom) / maxHeight);
    } else if (messageBoxBottom < scrollWideBottom) {
      nextBottomIndex += Math.floor((scrollWideBottom - messageBoxBottom) / maxHeight) + 1;
    }
  }

  const lastIndex = 0 < chatMessagesLength ? chatMessagesLength - 1 : 0;

  if (nextTopIndex < 0) {
    nextTopIndex = 0;
  }
  if (lastIndex < nextBottomIndex) {
    nextBottomIndex = lastIndex;
  }

  if (nextTopIndex < 0) nextTopIndex = 0;
  if (nextBottomIndex < 0) nextBottomIndex = 0;
  if (lastIndex < nextTopIndex) nextTopIndex = lastIndex;
  if (lastIndex < nextBottomIndex) nextBottomIndex = lastIndex;

  return {
    topIndex: nextTopIndex,
    bottomIndex: nextBottomIndex,
  };
}

/** How many lines stay rendered for a reader resting at the bottom before the rest are let go. */
export const MAX_RESTING_RENDERED_ROWS = 150;

/**
 * Whether the rendered lines have grown past what a reader resting at the bottom needs.
 *
 * Only a reader at the very bottom qualifies: there the lines far above can be dropped without
 * anything on the screen moving.
 */
export function shouldTrimRenderedRange(
  range: { topIndex: number; bottomIndex: number; lastIndex: number; distanceFromBottom: number },
  maxRows: number = MAX_RESTING_RENDERED_ROWS
): boolean {
  if (range.bottomIndex < range.lastIndex) return false;
  if (range.distanceFromBottom > 2) return false;
  return range.bottomIndex - range.topIndex + 1 > maxRows;
}
