import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { lineAudienceOf } from '@axe/domain/chat/line-audience';

describe('lineAudienceOf', () => {
  const made: { destroy(): void }[] = [];

  afterEach(() => {
    for (const object of made.splice(0)) object.destroy();
  });

  function lineIn(tab: ChatTab, to = ''): ChatMessage {
    const message = new ChatMessage();
    message.to = to;
    message.initialize();
    tab.appendChild(message);
    return message;
  }

  function tab(fields: Partial<Pick<ChatTab, 'plCanView' | 'guestCanView'>> = {}): ChatTab {
    const made_ = new ChatTab();
    made_.initialize();
    Object.assign(made_, fields);
    made.push(made_);
    return made_;
  }

  it('says a line in a tab every seat reads to everyone, and a whisper to those addressed', () => {
    expect(lineAudienceOf(lineIn(tab()))).toBe('everyone');
    expect(lineAudienceOf(lineIn(tab(), 'gm-user'))).toBe('addressed');
  });

  it('says a line in a tab players or guests may not read to its sender alone, a whisper there to those addressed', () => {
    expect(lineAudienceOf(lineIn(tab({ plCanView: false })))).toBe('sender');
    expect(lineAudienceOf(lineIn(tab({ guestCanView: false })))).toBe('sender');
    expect(lineAudienceOf(lineIn(tab({ plCanView: false }), 'gm-user'))).toBe('addressed');
  });
});
