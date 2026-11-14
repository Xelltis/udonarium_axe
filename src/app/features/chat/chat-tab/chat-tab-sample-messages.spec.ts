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

  it('gives seven lines from the system, each named and stamped with the time', () => {
    const before = Date.now();
    const lines = buildSampleChatMessages();

    expect(lines).toHaveLength(7);
    for (const line of lines) {
      expect(line.from).toBe('System');
      expect(line.name).not.toBe('');
      expect(line.text).not.toBe('');
      expect(line.timestamp).toBeGreaterThanOrEqual(before);
    }
  });

  it('addresses only the two lines that show what a whisper looks like', () => {
    const lines = buildSampleChatMessages();

    expect(lines.map((line) => line.to ?? '')).toEqual(['', '', '???', '???', '', '', '']);
    expect(lines[2].name).toBe(encodeI18nMessage('feature.chat.sample.tutorialToPlayer'));
    expect(lines[2].isDirect).toBe(true);
  });

  it('leaves out the attributes a line has nothing to say for, and keeps the lines out of the store', () => {
    const [line] = buildSampleChatMessages();

    expect(line.getAttribute('imageIdentifier')).toBeFalsy();
    expect(line.getAttribute('tag')).toBeFalsy();
    expect(line.getAttribute('identifier')).toBeFalsy();
  });
});
