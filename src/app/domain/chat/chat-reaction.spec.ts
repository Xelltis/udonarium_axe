import { ChatReaction } from '@axe/domain/chat/chat-reaction';

describe('ChatReaction', () => {
  const made: ChatReaction[] = [];

  function record(stamps = ''): ChatReaction {
    const reaction = ChatReaction.create('line', 'user', 'なまえ');
    reaction.stamps = stamps;
    made.push(reaction);
    return reaction;
  }

  afterEach(() => {
    for (const reaction of made.splice(0)) reaction.destroy();
  });

  it('reads the stamps put on, once each, and none from an empty record', () => {
    expect(record('').stampIds).toEqual([]);
    expect(record('  sfx:laugh  seal:ok sfx:laugh ').stampIds).toEqual(['sfx:laugh', 'seal:ok']);
  });

  it('puts a stamp on, and takes it off again, keeping the others in the order they went on', () => {
    const reaction = record('sfx:laugh');

    expect(reaction.toggle('seal:ok')).toBe(true);
    expect(reaction.stampIds).toEqual(['sfx:laugh', 'seal:ok']);

    expect(reaction.toggle('sfx:laugh')).toBe(false);
    expect(reaction.stampIds).toEqual(['seal:ok']);
    expect(reaction.has('seal:ok')).toBe(true);
  });
});
