import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ChatMessage, ChatMessageContext } from '@axe/domain/chat/chat-message';

/**
 * The tutorial lines a chat tab shows before it has any messages, so a newcomer sees what a
 * conversation looks like. The opening two say where the table is kept, which differs `onRoomServer`.
 *
 * Names and texts are encoded i18n messages, translated when they are shown, and every line is
 * stamped with the current time. The lines are kept out of the object store, so nobody else gets them.
 */
export function buildSampleChatMessages(onRoomServer = false): ChatMessage[] {
  return sampleContexts(onRoomServer).map(messageOf);
}

function messageOf(context: ChatMessageContext): ChatMessage {
  const message = new ChatMessage();
  const { text, identifier: _identifier, tabIdentifier: _tabIdentifier, ...attributes } = context;
  message.value = text ?? '';
  for (const [name, value] of Object.entries(attributes)) {
    if (value == null || value === '') continue;
    message.setAttribute(name, value as string | number);
  }
  return message;
}

function sampleContexts(onRoomServer: boolean): ChatMessageContext[] {
  const NOW = Date.now();
  const intro = onRoomServer ? ['intro1Server', 'intro2Server'] : ['intro1', 'intro2'];
  return [
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage(`feature.chat.sample.${intro[0]}`),
    },
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage(`feature.chat.sample.${intro[1]}`),
    },
    {
      from: 'System',
      to: '???',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialToPlayer'),
      text: encodeI18nMessage('feature.chat.sample.dm1'),
    },
    {
      from: 'System',
      to: '???',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialToPlayer'),
      text: encodeI18nMessage('feature.chat.sample.dm2'),
    },
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage('feature.chat.sample.env'),
    },
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage('feature.chat.sample.simple'),
    },
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage('feature.chat.sample.end'),
    },
  ];
}
