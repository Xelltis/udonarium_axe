import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { StampPack } from '@axe/domain/chat/stamp-pack';

describe('StampPack', () => {
  const made: StampPack[] = [];

  function pack(): StampPack {
    const created = StampPack.create('ねこ');
    made.push(created);
    return created;
  }

  afterEach(() => {
    for (const each of made.splice(0)) each.destroy();
  });

  it('holds its stamps once each, in the order they were added, each known by its picture', () => {
    const set = pack();

    expect(set.addStamp('picture-a', 'にゃー')).not.toBeNull();
    expect(set.addStamp('picture-b', 'しゃー')).not.toBeNull();
    expect(set.addStamp('picture-a', 'もう一度')).toBeNull();
    expect(set.addStamp('  ', 'からっぽ')).toBeNull();

    expect(set.stamps.map(({ stampId, name }) => [stampId, name])).toEqual([
      ['image:picture-a', 'にゃー'],
      ['image:picture-b', 'しゃー'],
    ]);
  });

  it('writes each stamp as a picture element, which a saved room picks its pictures out of', () => {
    const set = pack();
    set.addStamp('picture-a', 'にゃー');

    const xml = ObjectSerializer.instance.toXml(set);

    expect(xml).toMatch(/<stamp-pack name="ねこ"/);
    expect(xml).toMatch(/<data [^>]*type="image"[^>]*>picture-a<\/data>/);
  });
});
