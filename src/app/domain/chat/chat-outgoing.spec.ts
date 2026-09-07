import { composeChatOutgoing } from '@axe/domain/chat/chat-outgoing';
import GameSystemClass from 'bcdice/lib/game_system';

describe('composeChatOutgoing', () => {
  const system = {} as unknown as GameSystemClass;

  const draft = {
    text: 'こんばんは',
    gameSystem: system,
    sendFrom: 'character-1',
    sendTo: 'peer-2',
    portraitIndex: 3,
    color: '#ff0000',
    bubbles: { light: '#fee', dark: '#300' },
    replyTo: 'message-9',
    quoteOf: 'message-4',
    toTicker: false,
  };

  it('lays the draft out as the line that goes on the wire', () => {
    expect(composeChatOutgoing(draft)).toEqual({
      text: 'こんばんは',
      gameSystem: system,
      sendFrom: 'character-1',
      sendTo: 'peer-2',
      portraitIndex: 3,
      messColor: '#ff0000',
      messBubbleLight: '#fee',
      messBubbleDark: '#300',
      replyTo: 'message-9',
      quoteOf: 'message-4',
      toTicker: false,
    });
  });

  it('carries an unchosen bubble as nothing rather than leaving it out', () => {
    const plain = composeChatOutgoing({ ...draft, bubbles: { light: '', dark: '' } });
    expect(plain.messBubbleLight).toBe('');
    expect(plain.messBubbleDark).toBe('');
  });

  it('takes nothing from the draft it was not given', () => {
    const composed = composeChatOutgoing({ ...draft, replyTo: '', quoteOf: '' });
    expect(composed.replyTo).toBe('');
    expect(composed.quoteOf).toBe('');
  });
});
