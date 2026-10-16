import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { buildSampleChatMessages } from '@axe/features/chat/chat-tab/chat-tab-sample-messages';

describe('buildSampleChatMessages', () => {
  const opening = (onRoomServer: boolean) =>
    buildSampleChatMessages(onRoomServer)
      .slice(0, 2)
      .map((line) => line.text);

  it('says among peers that every browser holds the table, and on a room server that the server keeps it', () => {
    expect(opening(false)).toEqual([
      encodeI18nMessage('feature.chat.sample.intro1'),
      encodeI18nMessage('feature.chat.sample.intro2'),
    ]);
    expect(opening(true)).toEqual([
      encodeI18nMessage('feature.chat.sample.intro1Server'),
      encodeI18nMessage('feature.chat.sample.intro2Server'),
    ]);
  });
});
