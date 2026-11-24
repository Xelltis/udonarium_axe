import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

/**
 * Who a chat line is said to, for what it sets off on the table, a motion, an effect, a battle stage
 * or a cut-in, to be shown to nobody else: `everyone` for a line every seat may read, `addressed` for
 * one said to some alone, as a whisper, and `sender` for one in a tab players or guests may not read,
 * as a tab for the game master alone.
 */
export type LineAudience = 'everyone' | 'addressed' | 'sender';

/** Who a chat line is said to, as {@link LineAudience} tells. */
export function lineAudienceOf(message: ChatMessage): LineAudience {
  if (message.isDirect) return 'addressed';
  const tab = message.parent;
  if (tab instanceof ChatTab && !(tab.plCanView && tab.guestCanView)) return 'sender';
  return 'everyone';
}
