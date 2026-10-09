import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { copiedMessageContext } from '@axe/domain/chat/chat-message-copy';

describe('copiedMessageContext()', () => {
  const made: ChatMessage[] = [];

  function line(): ChatMessage {
    const message = new ChatMessage();
    message.initialize();
    made.push(message);
    return message;
  }

  afterEach(() => {
    for (const message of made.splice(0)) ObjectStore.instance.delete(message, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('carries over everything that makes the line what it is', () => {
    const message = line();
    message.from = 'user-1';
    message.originFrom = 'user-1';
    message.to = 'user-2';
    message.name = 'アリス';
    message.value = 'こんばんは';
    message.tag = 'secret';
    message.dicebot = '2d6 > 7';
    message.imageIdentifier = 'portrait-1';
    message.attachmentImageIdentifiers = 'shot-1 shot-2';
    message.imagePos = 3;
    message.messColor = '#ff0000';
    message.messBubbleLight = '#fff';
    message.messBubbleDark = '#000';
    message.sendFrom = 'character-1';
    message.vnEmote = 'shape:shout bubble:shake';
    message.diceLook = '{"material":"metal"}';
    message.diceImageIdentifier = 'ab'.repeat(32);

    expect(copiedMessageContext(message, 4200)).toEqual({
      originFrom: 'user-1',
      from: 'user-1',
      to: 'user-2',
      name: 'アリス',
      text: 'こんばんは',
      timestamp: 4200,
      tag: 'secret',
      dicebot: '2d6 > 7',
      imageIdentifier: 'portrait-1',
      attachmentImageIdentifiers: 'shot-1 shot-2',
      imagePos: 3,
      vnEmote: 'shape:shout bubble:shake',
      messColor: '#ff0000',
      messBubbleLight: '#fff',
      messBubbleDark: '#000',
      sendFrom: 'character-1',
      diceLook: '{"material":"metal"}',
      diceImageIdentifier: 'ab'.repeat(32),
    });
  });

  it('carries over the stamp a line was sent with, and writes none for a line without one', () => {
    const stamped = line();
    stamped.value = 'いくぞ！\n［クリティカル!］';
    stamped.stamp = 'roll:critical';

    expect(copiedMessageContext(stamped, 4200).stamp).toBe('roll:critical');
    expect('stamp' in copiedMessageContext(line(), 4200)).toBe(false);
  });

  it('leaves behind what points at the tab it came from', () => {
    const message = line();
    message.value = 'それで？';
    message.replyTo = 'message-1';
    message.quoteOf = 'message-2';

    const copied = copiedMessageContext(message, 1) as Record<string, unknown>;

    expect(copied['replyTo']).toBeUndefined();
    expect(copied['quoteOf']).toBeUndefined();
    expect(copied['identifier']).toBeUndefined();
    expect(copied['tabIdentifier']).toBeUndefined();
  });
});
