import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { ImageTagLockList } from '@axe/domain/media/image-tag-lock-list';

describe('ImageTagLockList', () => {
  afterEach(() => {
    for (const record of ImageTagLock.all()) ObjectStore.instance.remove(record);
  });

  /** Writes the room's locks, then forgets every record, as a room read into another session would. */
  function savedAndForgotten(): string {
    const xml = ObjectSerializer.instance.toXml(ImageTagLockList.create());
    for (const record of ImageTagLock.all()) ObjectStore.instance.remove(record);
    return xml;
  }

  it('writes each tag locked now and locks it again to its holder as it is read back', () => {
    ImageTagLock.lock('ボス <裏>', 'owner_alice');
    ImageTagLock.lock('手札', 'acct_bob');

    ObjectSerializer.instance.parseXml(savedAndForgotten());

    expect(ImageTagLock.get('ボス <裏>')?.isHeldBy('owner_alice')).toBe(true);
    expect(ImageTagLock.get('手札')?.isHeldBy('acct_bob')).toBe(true);
  });

  it('writes nothing for a tag unlocked since', () => {
    ImageTagLock.lock('ボス', 'owner_alice');
    ImageTagLock.unlock('ボス');

    expect(savedAndForgotten()).not.toContain('entry');
  });

  it('makes no record of its own kind as it is read, and keeps itself out of the room', () => {
    ImageTagLock.lock('ボス', 'owner_alice');
    const xml = savedAndForgotten();
    const made = vi.spyOn(ObjectSerializer.instance, 'parseXml');

    ObjectSerializer.instance.parseXml(xml);

    expect(made).toHaveBeenCalledTimes(1);
    expect(ObjectStore.instance.getObjects(ImageTagLockList)).toEqual([]);
    expect(ImageTagLock.all().map((record) => record.tag)).toEqual(['ボス']);
  });
});
