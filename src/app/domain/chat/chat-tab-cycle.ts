import type { ChatTab } from '@axe/domain/chat/chat-tab';

/**
 * The tab beside the current one, a step either way along the tabs as listed, wrapping round at
 * either end, as Ctrl and an arrow move between them. Null where the current tab is not among them.
 */
export function tabBeside(tabs: readonly ChatTab[], current: string, direction: number): ChatTab | null {
  const index = tabs.findIndex((tab) => tab.identifier === current);
  if (index < 0) return null;
  const step = Math.sign(direction) || 1;
  return tabs[(index + step + tabs.length) % tabs.length];
}
