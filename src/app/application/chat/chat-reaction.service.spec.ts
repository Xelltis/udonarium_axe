import { TestBed } from '@angular/core/testing';
import { ChatReactionService } from '@axe/application/chat/chat-reaction.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { OPEN_STAMP_RULES, withStampsAllowed, withStampUseOn } from '@axe/domain/chat/stamp-rules';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatReactionService', () => {
  let service: ChatReactionService;
  const made: { destroy(): void }[] = [];

  function line(fields: Partial<ChatMessage> = {}): ChatMessage {
    const message = new ChatMessage();
    message.initialize();
    message.from = 'someone';
    message.to = '';
    message.tag = '';
    message.text = '扉を開ける';
    Object.assign(message, fields);
    made.push(message);
    return message;
  }

  function records(): ChatReaction[] {
    return ObjectStore.instance.getObjects<ChatReaction>(ChatReaction);
  }

  function answer(message: ChatMessage, userId: string, name: string, stamps: string): void {
    const reaction = ChatReaction.create(message.identifier, userId, name);
    reaction.stamps = stamps;
    made.push(reaction);
  }

  beforeEach(() => {
    for (const reaction of records()) reaction.destroy();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatReactionService);
    beMyself('me');
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.name = 'わたし';
  });

  afterEach(() => {
    for (const object of made.splice(0)) object.destroy();
    for (const reaction of records()) reaction.destroy();
    PeerCursor.myCursor = null!;
  });

  it("puts a stamp on a line in a record of the reader's own, and takes the record away with the last one off", () => {
    const message = line();

    expect(service.toggle(message, 'sfx:creepy')).toBe(true);
    expect(service.toggle(message, 'seal:ok')).toBe(true);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toEqual(
      expect.objectContaining({ messageIdentifier: message.identifier, userId: 'me', userName: 'わたし' })
    );

    expect(service.toggle(message, 'sfx:creepy')).toBe(false);
    expect(service.toggle(message, 'seal:ok')).toBe(false);
    expect(records()).toHaveLength(0);
  });

  it("never writes to anybody else's record", () => {
    const message = line();
    answer(message, 'other', 'あいて', 'sfx:creepy');

    service.toggle(message, 'sfx:creepy');

    expect(records().map((each) => [each.userId, each.stamps])).toEqual([
      ['other', 'sfx:creepy'],
      ['me', 'sfx:creepy'],
    ]);
  });

  it('counts each stamp on a line with who put it on, in the order they are offered', () => {
    const message = line();
    answer(message, 'other', 'あいて', 'seal:ok sfx:creepy');
    answer(message, 'me', 'わたし', 'sfx:creepy');
    answer(line(), 'other', 'あいて', 'seal:god');

    expect(service.talliesOf(message.identifier)).toEqual([
      { stampId: 'sfx:creepy', count: 2, names: ['あいて', 'わたし'], mine: true },
      { stampId: 'seal:ok', count: 1, names: ['あいて'], mine: false },
    ]);
  });

  it('leaves out a stamp this version does not know', () => {
    const message = line();
    answer(message, 'other', 'あいて', 'sfx:from-a-newer-version seal:ok');

    expect(service.talliesOf(message.identifier).map((tally) => tally.stampId)).toEqual(['seal:ok']);
  });

  it('puts on no stamp the room does not let be put on, but takes one back that went on before', () => {
    const message = line();
    service.toggle(message, 'seal:ok');
    Config.instance.stampRules = withStampsAllowed(OPEN_STAMP_RULES, 'reaction', ['seal:ok', 'seal:god'], false);
    try {
      expect(service.toggle(message, 'seal:god')).toBe(false);
      expect(records()[0].stamps).toBe('seal:ok');

      expect(service.toggle(message, 'seal:ok')).toBe(false);
      expect(records()).toHaveLength(0);

      Config.instance.stampRules = withStampUseOn(OPEN_STAMP_RULES, 'reaction', false);
      expect(service.toggle(message, 'sfx:creepy')).toBe(false);
      expect(records()).toHaveLength(0);
    } finally {
      Config.instance.stampRules = OPEN_STAMP_RULES;
    }
  });

  it('puts nothing on a line the reader is not shown, a stamp it does not know, or before a room is joined', () => {
    const whisper = line({ to: 'third' });
    expect(service.toggle(whisper, 'sfx:creepy')).toBe(false);

    const message = line();
    expect(service.toggle(message, 'sfx:from-a-newer-version')).toBe(false);

    PeerCursor.myCursor.userId = '';
    beMyself('');
    expect(service.toggle(message, 'sfx:creepy')).toBe(false);

    expect(records()).toHaveLength(0);
  });
});
