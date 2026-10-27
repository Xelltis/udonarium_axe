import { TestBed } from '@angular/core/testing';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ImageTagLockService', () => {
  let isGameMaster: boolean;
  let isPlaying: boolean;
  let service: ImageTagLockService;
  let mine: string;

  beforeEach(() => {
    isGameMaster = false;
    isPlaying = true;
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RolePermissionService,
          useValue: {
            canSeeHidden() {
              return isGameMaster;
            },
            canEditShared() {
              return isGameMaster;
            },
            canEditTabletop() {
              return isPlaying;
            },
          },
        },
      ],
    });
    service = TestBed.inject(ImageTagLockService);
    mine = TestBed.inject(AssetOwnershipService).myOwnerKey();
  });

  afterEach(() => {
    for (const record of ImageTagLock.all()) ObjectStore.instance.remove(record);
  });

  it('keeps from a player the tags someone else locked, and from the GM none', () => {
    ImageTagLock.lock('ボス', 'owner_someone-else');
    ImageTagLock.lock('手札', mine);
    ImageTagLock.lock('解いた', 'owner_someone-else');
    ImageTagLock.unlock('解いた');

    expect(['ボス', '手札', '解いた', '', 'だれも'].map(service.hides)).toEqual([true, false, false, false, false]);
    isGameMaster = true;
    expect(service.hides('ボス')).toBe(false);
  });

  it('lets anyone who plays lock a tag nobody holds, and only its holder and the GM one somebody does', () => {
    ImageTagLock.lock('ボス', 'owner_someone-else');

    expect(service.mayToggle('手札')).toBe(true);
    expect(service.mayToggle('ボス')).toBe(false);
    isGameMaster = true;
    expect(service.mayToggle('ボス')).toBe(true);
  });

  it('lets nobody lock the untagged pictures or the tool’s own, and a seat that only watches no tag', () => {
    expect(service.mayToggle('')).toBe(false);
    expect(service.mayToggle(SYSTEM_RESERVED_TAG)).toBe(false);
    isPlaying = false;
    expect(service.mayToggle('手札')).toBe(false);
  });

  it('locks a tag to this seat and unlocks it again, and leaves one it may not alone', () => {
    service.toggle('手札');
    expect(service.isMine('手札')).toBe(true);
    service.toggle('手札');
    expect(service.isLocked('手札')).toBe(false);

    ImageTagLock.lock('ボス', 'owner_someone-else');
    service.toggle('ボス');
    expect(ImageTagLock.get('ボス')?.isHeldBy('owner_someone-else')).toBe(true);
  });

  it('lets a picture be filed under any tag but one kept from this seat', () => {
    ImageTagLock.lock('ボス', 'owner_someone-else');
    ImageTagLock.lock('手札', mine);

    expect(service.mayFileUnder('ボス')).toBe(false);
    expect(service.mayFileUnder('手札')).toBe(true);
    expect(service.mayFileUnder('新しい')).toBe(true);
  });
});
