import { TestBed } from '@angular/core/testing';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StampPackService', () => {
  let service: StampPackService;
  let canEdit: boolean;

  beforeEach(() => {
    for (const pack of ObjectStore.instance.getObjects<StampPack>(StampPack)) pack.destroy();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    canEdit = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockImplementation(() => canEdit);
    service = TestBed.inject(StampPackService);
  });

  afterEach(() => {
    for (const pack of ObjectStore.instance.getObjects<StampPack>(StampPack)) pack.destroy();
    vi.restoreAllMocks();
  });

  it('makes a set and fills it with pictures under the names of their files, leaving out any in it already', () => {
    const pack = service.create(' ねこ ')!;

    const added = service.addImages(pack, [
      { identifier: 'picture-a', name: 'にゃー.png' },
      { identifier: 'picture-b', name: 'しゃー.webp' },
      { identifier: 'picture-a', name: 'にゃー.png' },
    ]);

    expect(added).toBe(2);
    expect(service.packs()).toEqual([
      {
        identifier: pack.identifier,
        name: 'ねこ',
        stamps: [
          { stampId: 'image:picture-a', imageIdentifier: 'picture-a', name: 'にゃー' },
          { stampId: 'image:picture-b', imageIdentifier: 'picture-b', name: 'しゃー' },
        ],
      },
    ]);
  });

  it('names a picture as a stamp by the name it has in a set', () => {
    const pack = service.create('ねこ')!;
    service.addImages(pack, [{ identifier: 'picture-a', name: 'にゃー.png' }]);
    service.renameStamp(pack.stamps[0].element, ' ごろにゃん ');

    expect(service.nameOf('picture-a')).toBe('ごろにゃん');
    expect(service.nameOf('not-in-a-set')).toBe('');
  });

  it('takes a stamp out of its set, and the set out of the room', () => {
    const pack = service.create('ねこ')!;
    service.addImages(pack, [{ identifier: 'picture-a', name: 'a.png' }]);

    service.removeStamp(pack.stamps[0].element);
    expect(service.packs()[0].stamps).toEqual([]);

    service.remove(pack);
    expect(service.packs()).toEqual([]);
  });

  it('lets nobody who may not change the table make or change a set', () => {
    const pack = service.create('ねこ')!;
    canEdit = false;

    expect(service.canManage).toBe(false);
    expect(service.create('いぬ')).toBeNull();
    expect(service.addImages(pack, [{ identifier: 'picture-a', name: 'a.png' }])).toBe(0);
    service.rename(pack, 'いぬ');
    service.remove(pack);

    expect(service.packs()).toEqual([{ identifier: pack.identifier, name: 'ねこ', stamps: [] }]);
  });
});
