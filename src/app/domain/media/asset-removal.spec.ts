import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetRemoval } from '@axe/domain/media/asset-removal';
import { Room } from '@axe/domain/peer/room';

describe('AssetRemoval', () => {
  const pictureId = 'a'.repeat(64);

  afterEach(() => {
    for (const record of AssetRemoval.all()) ObjectStore.instance.remove(record);
  });

  it('records an asset removed for the room, once, under an identifier made from it', () => {
    const record = AssetRemoval.remove(pictureId, 'image');

    expect(record.identifier).toBe(`asset-removal_${pictureId}`);
    expect(record.assetIdentifier).toBe(pictureId);
    expect(record.kind).toBe('image');
    expect(record.isRemoved).toBe(true);
    expect(AssetRemoval.remove(pictureId, 'image')).toBe(record);
    expect(AssetRemoval.all()).toEqual([record]);
  });

  it('keeps the record of an asset put back, with nothing removed, and marks it again on a second removal', () => {
    const record = AssetRemoval.remove(pictureId, 'audio');

    AssetRemoval.restore(pictureId);

    expect(AssetRemoval.get(pictureId)).toBe(record);
    expect(record.isRemoved).toBe(false);
    AssetRemoval.remove(pictureId, 'audio');
    expect(record.isRemoved).toBe(true);
  });

  it('stays out of the room’s save, which holds nothing of what was removed', () => {
    AssetRemoval.remove(pictureId, 'image');

    expect(new Room().toXml()).not.toContain('asset-removal');
  });

  it('puts back nothing for an asset never removed', () => {
    AssetRemoval.restore(pictureId);

    expect(AssetRemoval.get(pictureId)).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['0', '0'],
    ['true', 'true'],
  ])('reads a record whose removal is %s, as an older or emptied one comes, as not removed', (_label, value) => {
    const record = new AssetRemoval(`asset-removal_${pictureId}`);
    const context = record.toContext();
    if (value === undefined) delete context.syncData['removed'];
    else context.syncData['removed'] = value;

    record.apply(context);

    expect(record.isRemoved).toBe(false);
  });
});
