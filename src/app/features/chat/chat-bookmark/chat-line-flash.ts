/** The class that lights a chat line up for a moment, drawn by the global styles. */
export const CHAT_LINE_FLASH_CLASS = 'chat-message-highlight';

/** How long a line stays lit before it fades back. */
export const CHAT_LINE_FLASH_MS = 1800;

/**
 * Lights one drawn chat line up for a moment, as following a reply to its original does.
 *
 * It is put on the element itself, so only the line in the window that went to it is lit, and not
 * the same line drawn in another window.
 */
export function flashChatLine(line: HTMLElement): void {
  line.classList.add(CHAT_LINE_FLASH_CLASS);
  setTimeout(() => line.classList.remove(CHAT_LINE_FLASH_CLASS), CHAT_LINE_FLASH_MS);
}
