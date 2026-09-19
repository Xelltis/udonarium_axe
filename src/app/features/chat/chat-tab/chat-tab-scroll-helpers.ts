import { ChatMessage } from '@axe/domain/chat/chat-message';

export type ScrollPosition = { top: number; bottom: number; clientHeight: number; scrollHeight: number };

/**
 * The index to start rendering from so that the last `dispLength` displayable messages are
 * included.
 *
 * Messages that are not displayable are passed over without being counted. When there are fewer
 * displayable messages than that, the result is -1 and the caller clamps it.
 */
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

/**
 * Reads a panel's scroll position with the top clamped to the scrollable range, so an overscroll
 * bounce never reports a place past either end.
 */
export function getBoundedScrollPosition(panel: HTMLDivElement): ScrollPosition {
  let top = panel.scrollTop;
  const clientHeight = panel.clientHeight;
  const scrollHeight = panel.scrollHeight;
  if (top < 0) top = 0;
  if (scrollHeight - clientHeight < top) top = scrollHeight - clientHeight;
  const bottom = top + clientHeight;
  return { top, bottom, clientHeight, scrollHeight };
}

/** The height of the tallest rendered message, and never less than the minimum message height. */
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

/**
 * Works out which messages to render for the current scroll position.
 *
 * When the rendered block lies wholly outside the widened viewport, as after a long jump, the range
 * is rebuilt from the scroll position at the minimum message height. Otherwise each end is grown or
 * shrunk by whole steps of the tallest message. On iOS the range only grows, since narrowing it
 * under a momentum scroll makes the view jump. The result is clamped to the message list.
 */
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

/** Whether a reader this far from the bottom of the log, in pixels, is resting at it. */
export function restsAtBottom(distanceFromBottom: number): boolean {
  return distanceFromBottom <= 2;
}

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
  if (!restsAtBottom(range.distanceFromBottom)) return false;
  return range.bottomIndex - range.topIndex + 1 > maxRows;
}
