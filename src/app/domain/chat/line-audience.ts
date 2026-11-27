import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';

/**
 * Who a chat line is said to, for what it sets off on the table, a motion, an effect, a battle stage
 * or a cut-in, to be shown to nobody else: `everyone` for a line the players may read, `addressed`
 * for one said to some alone, as a whisper, and `sender` for one in a tab players may not read, as a
 * tab for the game master alone. A tab kept from guests alone is the players' still, and what its
 * lines set off is shown to everyone, as what is shown to some seats alone cannot be held back from
 * guests while the players see it.
 */
export type LineAudience = 'everyone' | 'addressed' | 'sender';

/** Who a chat line is said to, as {@link LineAudience} tells. */
export function lineAudienceOf(message: ChatMessage): LineAudience {
  if (message.isDirect) return 'addressed';
  const tab = message.parent;
  if (tab instanceof ChatTab && !tab.plCanView) return 'sender';
  return 'everyone';
}
