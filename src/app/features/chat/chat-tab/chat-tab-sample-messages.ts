import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ChatMessageContext } from '@axe/domain/chat/chat-message';

/**
 * The tutorial lines a chat tab shows before it has any messages, so a newcomer sees what a
 * conversation looks like.
 *
 * Names and texts are encoded i18n messages, translated when they are shown, and every line is
 * stamped with the current time.
 */
export function buildSampleChatMessages(): ChatMessageContext[] {
  const NOW = Date.now();
  return [
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage('feature.chat.sample.intro1'),
    },
    {
      from: 'System',
      timestamp: NOW,
      imageIdentifier: '',
      tag: '',
      name: encodeI18nMessage('feature.chat.sample.tutorialName'),
      text: encodeI18nMessage('feature.chat.sample.intro2'),
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
