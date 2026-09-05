import { TestBed } from '@angular/core/testing';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EventChannel } from '@axe/core/event/event-channel';
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
            capture,
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
    canEditTabletop = true;
    isRestoring = false;
    isKeeping = true;
    isDragging = false;
    lastCaptureMs = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('saves once the changes stop', async () => {
    setup();
    emitChange();

    await vi.advanceTimersByTimeAsync(19_000);
    expect(capture).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(capture).toHaveBeenCalledOnce();
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
