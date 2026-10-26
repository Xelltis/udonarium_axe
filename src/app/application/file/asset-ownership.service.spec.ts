import { TestBed } from '@angular/core/testing';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AssetOwnershipService', () => {
  const picture = 'a'.repeat(64);
  let service: AssetOwnershipService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(AssetOwnershipService);
  });

  afterEach(() => {
    for (const record of AssetOwner.all()) ObjectStore.instance.remove(record);
    localStorage.removeItem('udonarium-axe.owner-key');
    vi.restoreAllMocks();
  });

  it('goes by a key this browser keeps between peers, the same whichever tab asks', () => {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');

    const key = service.myOwnerKey();

    expect(key).toMatch(/^owner_/);
    expect(TestBed.inject(AssetOwnershipService).myOwnerKey()).toBe(key);
    expect(localStorage.getItem('udonarium-axe.owner-key')).toBe(key);
  });

  it('goes by the account the seat is in with on a room server, which the server checks', () => {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
    vi.spyOn(PeerCursor, 'myUserId', 'get').mockReturnValue('acct_alice');

    expect(service.myOwnerKey()).toBe('acct_alice');
  });

  it('tells the room this seat added an asset, and knows it as its own', () => {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');

    service.claim(picture, 'image');

    expect(AssetOwner.get(picture)?.owner).toBe(service.myOwnerKey());
    expect(service.isMine(picture)).toBe(true);
  });

  it('knows an asset another added, or one the room knows no adder of, as not its own', () => {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');
    AssetOwner.claim(picture, 'image', 'owner_someone-else');

    expect(service.isMine(picture)).toBe(false);
    expect(service.isMine('b'.repeat(64))).toBe(false);
  });

  it('claims nothing for a sound only linked to, which names no bytes', () => {
    service.claim('https://example.com/linked.ogg', 'audio');

    expect(AssetOwner.all()).toEqual([]);
  });

  it('claims nothing for a seat that may only watch', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);

    service.claim(picture, 'image');

    expect(AssetOwner.get(picture)).toBeNull();
  });
});
