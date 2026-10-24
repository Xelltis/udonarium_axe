import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { Room } from '@axe/domain/peer/room';

describe('AssetOwner', () => {
  const pictureId = 'a'.repeat(64);

  afterEach(() => {
    for (const record of AssetOwner.all()) ObjectStore.instance.remove(record);
  });

  it('names the first to add an asset, under an identifier made from it, and keeps them', () => {
    AssetOwner.claim(pictureId, 'image', 'owner_alice');
    AssetOwner.claim(pictureId, 'image', 'owner_bob');

    const record = AssetOwner.get(pictureId)!;
    expect(record.identifier).toBe(`asset-owner_${pictureId}`);
    expect([record.assetIdentifier, record.kind, record.owner]).toEqual([pictureId, 'image', 'owner_alice']);
    expect(AssetOwner.all()).toEqual([record]);
  });

  it('names nobody for an empty key, and lets a record naming nobody be taken', () => {
    AssetOwner.claim(pictureId, 'audio', '');
    expect(AssetOwner.get(pictureId)).toBeNull();

    AssetOwner.restore(pictureId, 'audio', '');
    AssetOwner.claim(pictureId, 'audio', 'owner_bob');

    expect(AssetOwner.get(pictureId)?.owner).toBe('owner_bob');
  });

  it('takes the adder a saved room names over whoever named themselves while it was read in', () => {
    AssetOwner.claim(pictureId, 'image', 'owner_reader');

    AssetOwner.restore(pictureId, 'image', 'owner_alice');

    expect(AssetOwner.get(pictureId)?.owner).toBe('owner_alice');
  });

  it('is held by the key it names, and a record naming nobody by no key, an empty one least of all', () => {
    AssetOwner.restore(pictureId, 'image', '');
    const unnamed = AssetOwner.get(pictureId)!;

    expect(unnamed.isHeldBy('')).toBe(false);
    unnamed.owner = 'owner_alice';
    expect(unnamed.isHeldBy('owner_alice')).toBe(true);
    expect(unnamed.isHeldBy('owner_bob')).toBe(false);
  });

  it('stays out of the room’s own data, which is saved apart', () => {
    AssetOwner.claim(pictureId, 'image', 'owner_alice');

    expect(new Room().toXml()).not.toContain('asset-owner');
  });
});
