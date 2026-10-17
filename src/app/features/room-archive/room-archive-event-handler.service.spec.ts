import { TestBed } from '@angular/core/testing';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

type StoreEvent = { identifier: string; aliasName: string };

describe('RoomArchiveEventHandlerService', () => {
  let objectChanged$: EventChannel<StoreEvent>;
  let objectAdded$: EventChannel<StoreEvent>;
  let objectRemoved$: EventChannel<StoreEvent>;

  let capture: ReturnType<typeof vi.fn>;
  let canEditTabletop: boolean;
  let isRestoring: boolean;
  let isKeeping: boolean;
  let isDragging: boolean;
  let lastCaptureMs: number;
  let snapshotRunning: Promise<unknown> | null;

  function setup(): RoomArchiveEventHandlerService {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: ObjectChangeService, useValue: { objectChanged$, objectAdded$, objectRemoved$ } },
        {
          provide: RolePermissionService,
          useValue: {
            get canEditTabletop() {
              return canEditTabletop;
            },
          },
        },
        {
          provide: RoomSnapshotService,
          useValue: {
            isSupported: true,
            isKeeping: () => isKeeping,
            isRestoring: () => isRestoring,
            lastCaptureMs: () => lastCaptureMs,
            capture: (...args: unknown[]) => {
              const running = Promise.resolve((capture as (...params: unknown[]) => unknown)(...args));
              snapshotRunning = running;
              void running.finally(() => {
                if (snapshotRunning === running) snapshotRunning = null;
              });
              return running;
            },
            whenCaptured: async () => {
              await snapshotRunning;
            },
          },
        },
        {
          provide: PointerDeviceService,
          useValue: {
            get isDragging() {
              return isDragging;
            },
          },
        },
        RoomArchiveEventHandlerService,
      ],
    });
    return TestBed.inject(RoomArchiveEventHandlerService);
  }

  function emitChange(): void {
    objectChanged$.emit({ identifier: 'obj', aliasName: 'character' });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    objectChanged$ = new EventChannel<StoreEvent>();
    objectAdded$ = new EventChannel<StoreEvent>();
    objectRemoved$ = new EventChannel<StoreEvent>();
    capture = vi.fn().mockResolvedValue(null);
    snapshotRunning = null;
    canEditTabletop = true;
    isRestoring = false;
    isKeeping = true;
    isDragging = false;
    lastCaptureMs = 0;
    ObjectStore.instance.add(new GameObject('obj'), false);
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
    const obj = ObjectStore.instance.get('obj');
    if (obj) ObjectStore.instance.remove(obj);
  });

  it('takes no change to what is not in the room, as what a save is written with, for one', async () => {
    setup();
    objectChanged$.emit({ identifier: 'image-tag-list', aliasName: 'image-tag-list' });

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(capture).not.toHaveBeenCalled();
  });

  it('saves once the changes stop', async () => {
    setup();
    emitChange();

    await vi.advanceTimersByTimeAsync(19_000);
    expect(capture).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(capture).toHaveBeenCalledExactlyOnceWith({ background: true });
  });

  it('gathers a run of changes into one save', async () => {
    setup();
    for (let i = 0; i < 5; i++) {
      emitChange();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(capture).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(capture).toHaveBeenCalledOnce();
  });

  it('saves anyway once it has waited long enough', async () => {
    setup();
    for (let i = 0; i < 30; i++) {
      emitChange();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(capture).toHaveBeenCalled();
  });

  it('saves nothing without permission to edit', async () => {
    canEditTabletop = false;
    setup();
    emitChange();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(capture).not.toHaveBeenCalled();
  });

  it('saves nothing at all once the keeping is stopped', async () => {
    isKeeping = false;
    setup();
    emitChange();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(capture).not.toHaveBeenCalled();
  });

  it('leaves a save that was already due where the keeping stops before it lands', async () => {
    setup();
    emitChange();
    isKeeping = false;

    await vi.advanceTimersByTimeAsync(600_000);
    expect(capture).not.toHaveBeenCalled();
  });

  it('waits for a fresh change rather than saving what happened while it was stopped', async () => {
    isKeeping = false;
    setup();
    emitChange();
    isKeeping = true;

    await vi.advanceTimersByTimeAsync(600_000);
    expect(capture).not.toHaveBeenCalled();

    emitChange();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('holds the save off while it is restoring', async () => {
    setup();
    isRestoring = true;
    emitChange();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(capture).not.toHaveBeenCalled();

    isRestoring = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(capture).toHaveBeenCalledOnce();
  });

  it('waits for the drag to end before it saves', async () => {
    setup();
    isDragging = true;
    emitChange();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(capture).not.toHaveBeenCalled();

    isDragging = false;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(capture).toHaveBeenCalledOnce();
  });

  it('waits longer between saves in a room that is slow to save', async () => {
    lastCaptureMs = 3_500;
    setup();
    emitChange();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(capture).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(61_000);
    expect(capture).toHaveBeenCalledOnce();
  });

  it('saves nothing when nothing changed', async () => {
    const service = setup();

    await service.flush();
    expect(capture).not.toHaveBeenCalled();
  });

  it('waits for a save already under way, and saves again only for a change since', async () => {
    const service = setup();
    let finishSaving!: () => void;
    capture.mockReturnValueOnce(new Promise<null>((resolve) => (finishSaving = () => resolve(null))));
    emitChange();
    await vi.advanceTimersByTimeAsync(21_000);
    expect(capture).toHaveBeenCalledOnce();

    let flushed = false;
    void service.flush().then(() => (flushed = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);

    finishSaving();
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(true);
    expect(capture).toHaveBeenCalledOnce();
  });

  it('waits for a save begun while it waited for a quiet moment, and takes none of its own after', async () => {
    const service = setup();
    const quiet: (() => void)[] = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => quiet.push(callback));
    try {
      let finishSaving!: () => void;
      capture.mockReturnValueOnce(new Promise<null>((resolve) => (finishSaving = () => resolve(null))));
      emitChange();
      const byTimer = service.flush();
      const leaving = service.flush();
      await vi.advanceTimersByTimeAsync(0);
      expect(quiet).toHaveLength(2);

      quiet[0]();
      await vi.advanceTimersByTimeAsync(0);
      expect(capture).toHaveBeenCalledOnce();
      quiet[1]();
      let left = false;
      void leaving.then(() => (left = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(left).toBe(false);

      finishSaving();
      await Promise.all([byTimer, leaving]);
      expect(capture).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('takes nothing of a replay’s board on the table, and takes a save still due once the table is back', async () => {
    const service = setup();
    emitChange();
    setNetworkIsolated(true);
    try {
      emitChange();
      await vi.advanceTimersByTimeAsync(21_000);
      await service.flush();
      expect(capture).not.toHaveBeenCalled();
    } finally {
      setNetworkIsolated(false);
    }

    await vi.advanceTimersByTimeAsync(6_000);

    expect(capture).toHaveBeenCalledOnce();
  });

  it('saves for an object added or deleted as well', async () => {
    setup();
    objectAdded$.emit({ identifier: 'obj', aliasName: 'character' });
    await vi.advanceTimersByTimeAsync(21_000);
    expect(capture).toHaveBeenCalledOnce();

    objectRemoved$.emit({ identifier: 'obj', aliasName: 'character' });
    await vi.advanceTimersByTimeAsync(21_000);
    expect(capture).toHaveBeenCalledTimes(2);
  });
});
