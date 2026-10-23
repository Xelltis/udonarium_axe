import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { Room } from '@axe/domain/peer/room';

describe('ImageTagLock', () => {
  afterEach(() => {
    for (const record of ImageTagLock.all()) ObjectStore.instance.remove(record);
  });

  it('keeps a tag to a key, under an identifier the tag cannot break up', () => {
    ImageTagLock.lock('ボス/第1話 & 予備', 'owner_alice');

    const record = ImageTagLock.get('ボス/第1話 & 予備')!;
    expect(record.identifier).toBe(`image-tag-lock_${encodeURIComponent('ボス/第1話 & 予備')}`);
    expect([record.tag, record.owner, record.isLocked]).toEqual(['ボス/第1話 & 予備', 'owner_alice', true]);
  });

  it('keeps the record of a tag unlocked, with nothing locked, and locks it again to whoever locks it next', () => {
    ImageTagLock.lock('ボス', 'owner_alice');
    const record = ImageTagLock.get('ボス')!;

    ImageTagLock.unlock('ボス');
    expect(ImageTagLock.get('ボス')).toBe(record);
    expect(record.isLocked).toBe(false);
    expect(record.isHeldBy('owner_alice')).toBe(false);

    ImageTagLock.lock('ボス', 'owner_bob');
    expect([record.isLocked, record.owner]).toEqual([true, 'owner_bob']);
  });

  it('locks nothing for an empty tag or key, and is held by no empty key', () => {
    ImageTagLock.lock('', 'owner_alice');
    ImageTagLock.lock('ボス', '');
    expect(ImageTagLock.all()).toEqual([]);

    ImageTagLock.lock('ボス', 'owner_alice');
    ImageTagLock.get('ボス')!.owner = '';
    expect(ImageTagLock.get('ボス')!.isHeldBy('')).toBe(false);
  });

  it('stays out of the room’s own data, which is saved apart', () => {
    ImageTagLock.lock('ボス', 'owner_alice');

    expect(new Room().toXml()).not.toContain('image-tag-lock');
  });
});
