import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { RoomSnapshotMeta } from '@axe/core/storage/room-snapshot-store';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomRestoreOfferService } from '@axe/features/room-archive/room-restore-banner/room-restore-offer.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomRestoreOfferService', () => {
  const before: RoomSnapshotMeta = { id: 1, roomName: '', savedAt: Date.now() - 60_000, byteSize: 2048 };

  let snapshots: ReturnType<typeof signal<readonly RoomSnapshotMeta[]>>;
  let supported: boolean;

  function offer(): RoomRestoreOfferService {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RoomSnapshotService,
          useValue: {
            snapshots: snapshots.asReadonly(),
            get isSupported() {
              return supported;
            },
          },
        },
      ],
    });
    return TestBed.inject(RoomRestoreOfferService);
  }

  beforeEach(() => {
    snapshots = signal<readonly RoomSnapshotMeta[]>([before]);
    supported = true;
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '' } as IPeerContext);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
  });

  afterEach(() => {
    PeerCursor.forget();
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEYS.localMode);
    history.replaceState(null, '', '/');
    TestBed.resetTestingModule();
  });

  it('offers the last table kept before the page was opened', () => {
    const service = offer();

    expect(service.latest()).toEqual(before);
    expect(service.visible()).toBe(true);
  });

  it('passes over a table kept since the page was opened for the one kept before', () => {
    const service = offer();
    const since = { ...before, id: 2, savedAt: Date.now() + 60_000 };

    snapshots.set([since, before]);
    expect(service.latest()).toEqual(before);

    snapshots.set([since]);
    expect(service.latest()).toBeNull();
    expect(service.visible()).toBe(false);
  });

  it('offers nothing where this browser keeps no tables', () => {
    supported = false;

    expect(offer().visible()).toBe(false);
  });

  it('offers nothing to a seat in a room', () => {
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: 'room' } as IPeerContext);

    expect(offer().visible()).toBe(false);
  });

  it('offers nothing to a seat that may not change the table', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    expect(offer().visible()).toBe(false);
  });

  it('offers nothing while an invitation takes the page into a room', () => {
    history.replaceState(null, '', '/#join?r=a1b&n=room');

    expect(offer().visible()).toBe(false);
  });

  it('keeps the offer up offline, where an invitation takes the page nowhere', () => {
    history.replaceState(null, '', '/#join?r=a1b&n=room');
    localStorage.setItem(STORAGE_KEYS.localMode, '1');

    expect(offer().visible()).toBe(true);
  });

  it('takes the offer down for good once dismissed', () => {
    const service = offer();

    service.dismiss();
    snapshots.set([before, { ...before, id: 3 }]);

    expect(service.visible()).toBe(false);
    expect(service.latest()).toEqual(before);
  });
});
