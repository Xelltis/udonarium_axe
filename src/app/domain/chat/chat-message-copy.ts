import { ChatMessage, ChatMessageContext } from '@axe/domain/chat/chat-message';

/**
 * A line as it would read had it been said in another tab.
 *
 * Everything that makes the line what it is comes over - who said it, under what name and
 * picture, in what colour, the stamp it was sent with, and whether it was meant for one person.
 * What ties it to where it was said does not: a reply or a quotation points at a line in the tab
 * it was copied from, and would jump nowhere from the new one.
 */
export function copiedMessageContext(message: ChatMessage, timestamp: number): ChatMessageContext {
  return {
    originFrom: message.originFrom,
    from: message.from,
    to: message.to,
    name: message.name,
    text: message.text,
    timestamp,
    tag: message.tag,
    dicebot: message.dicebot,
    imageIdentifier: message.imageIdentifier,
    attachmentImageIdentifiers: message.attachmentImageIdentifiers,
    imagePos: message.imagePos,
    vnEmote: message.vnEmote,
    messColor: message.messColor,
    messBubbleLight: message.messBubbleLight,
    messBubbleDark: message.messBubbleDark,
    sendFrom: message.sendFrom,
    diceLook: message.diceLook,
    diceImageIdentifier: message.diceImageIdentifier,
    ...(message.stamp ? { stamp: message.stamp } : {}),
  };
}
