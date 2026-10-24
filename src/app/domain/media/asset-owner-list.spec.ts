import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetOwnerList } from '@axe/domain/media/asset-owner-list';

describe('AssetOwnerList', () => {
  const picture = 'a'.repeat(64);
  const sound = 'b'.repeat(64);
  const unowned = 'c'.repeat(64);

  afterEach(() => {
    for (const record of AssetOwner.all()) ObjectStore.instance.remove(record);
  });

  /** Writes who added the listed assets, then forgets every record, as a room read into another session would. */
  function savedAndForgotten(identifiers: string[]): string {
    const xml = ObjectSerializer.instance.toXml(AssetOwnerList.create(identifiers));
    for (const record of AssetOwner.all()) ObjectStore.instance.remove(record);
    return xml;
  }

  it('writes who added each listed asset and sets them again as it is read back', () => {
    AssetOwner.claim(picture, 'image', 'owner_alice');
    AssetOwner.claim(sound, 'audio', 'acct_bob');

    ObjectSerializer.instance.parseXml(savedAndForgotten([picture, sound, picture]));

    expect(AssetOwner.get(picture)?.owner).toBe('owner_alice');
    expect([AssetOwner.get(sound)?.owner, AssetOwner.get(sound)?.kind]).toEqual(['acct_bob', 'audio']);
  });

  it('sets the saved adder over the seat that named itself while the room was being read in', () => {
    AssetOwner.claim(picture, 'image', 'owner_alice');
    const xml = savedAndForgotten([picture]);
    AssetOwner.claim(picture, 'image', 'owner_reader');

    ObjectSerializer.instance.parseXml(xml);

    expect(AssetOwner.get(picture)?.owner).toBe('owner_alice');
  });

  it('writes nothing for an asset the room knows no adder of', () => {
    AssetOwner.restore(unowned, 'image', '');

    const xml = savedAndForgotten([unowned, 'd'.repeat(64)]);

    expect(xml).not.toContain('entry');
  });

  it('keeps a key with characters markup would take, as it was', () => {
    AssetOwner.claim(picture, 'image', 'owner_<"&\'>');

    ObjectSerializer.instance.parseXml(savedAndForgotten([picture]));

    expect(AssetOwner.get(picture)?.owner).toBe('owner_<"&\'>');
  });

  it('makes no record of its own kind as it is read, and keeps itself out of the room', () => {
    AssetOwner.claim(picture, 'image', 'owner_alice');
    const xml = savedAndForgotten([picture]);
    const made = vi.spyOn(ObjectSerializer.instance, 'parseXml');

    ObjectSerializer.instance.parseXml(xml);

    expect(made).toHaveBeenCalledTimes(1);
    expect(ObjectStore.instance.getObjects(AssetOwnerList)).toEqual([]);
    expect(AssetOwner.all().map((record) => record.identifier)).toEqual([`asset-owner_${picture}`]);
  });
});
