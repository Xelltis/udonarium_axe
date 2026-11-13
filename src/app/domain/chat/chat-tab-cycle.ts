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

/**
 * The tab a view of the chat shows as the tabs in view change: the one it was showing when that went
 * away, `lost`, once it is back, as a tab set aside for a join comes back once the room hands it
 * over; else the one it shows, where it is still in view, unless that is the system tab it fell back
 * on and a tab to talk in has come since; else the first tab to talk in, the system tab being kept
 * for when there is no other; else none.
 */
export function tabToShow(visible: readonly ChatTab[], current: string, lost: string): string {
  if (lost && visible.some((tab) => tab.identifier === lost)) return lost;
  const talk = visible.find((tab) => !tab.isSystemTab);
  const shown = visible.find((tab) => tab.identifier === current);
  if (shown && !(lost && shown.isSystemTab && talk)) return current;
  return (talk ?? visible[0])?.identifier ?? '';
}
