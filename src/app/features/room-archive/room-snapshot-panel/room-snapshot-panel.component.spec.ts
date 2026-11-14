import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { RoomSnapshotMeta } from '@axe/core/storage/room-snapshot-store';
import { formatSnapshotByteSize, formatSnapshotSavedAt } from '@axe/core/util/snapshot-format';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomSnapshotPanelComponent } from '@axe/features/room-archive/room-snapshot-panel/room-snapshot-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomSnapshotPanelComponent', () => {
  const older: RoomSnapshotMeta = {
    id: 1,
    roomName: '',
    savedAt: new Date(2026, 6, 3, 9, 5).getTime(),
    byteSize: 2048,
  };
  const newer: RoomSnapshotMeta = {
    id: 2,
    roomName: '卓',
    savedAt: new Date(2026, 6, 4, 21, 30).getTime(),
    byteSize: 4096,
  };

  let fixture: ComponentFixture<RoomSnapshotPanelComponent>;
  let snapshots: ReturnType<typeof signal<readonly RoomSnapshotMeta[]>>;
  let isCapturing: ReturnType<typeof signal<boolean>>;
  let isRestoring: ReturnType<typeof signal<boolean>>;
  let supported: boolean;
  let ask: ReturnType<typeof vi.fn>;
  let service: {
    refresh: ReturnType<typeof vi.fn>;
    capture: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RoomSnapshotPanelComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RoomSnapshotService,
          useValue: {
            snapshots: snapshots.asReadonly(),
            isCapturing: isCapturing.asReadonly(),
            isRestoring: isRestoring.asReadonly(),
            isSupported: supported,
            ...service,
          },
        },
        { provide: ConfirmService, useValue: { ask } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RoomSnapshotPanelComponent);
    fixture.detectChanges();
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  }

  function rows(): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li'));
  }

  function rowButtons(row: number): HTMLButtonElement[] {
    return Array.from(rows()[row].querySelectorAll('button'));
  }

  beforeEach(() => {
    snapshots = signal<readonly RoomSnapshotMeta[]>([newer, older]);
    isCapturing = signal(false);
    isRestoring = signal(false);
    supported = true;
    ask = vi.fn().mockResolvedValue(true);
    service = {
      refresh: vi.fn().mockResolvedValue([]),
      capture: vi.fn().mockResolvedValue(null),
      restore: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
  });

  afterEach(() => {
    PeerCursor.forget();
    TestBed.resetTestingModule();
  });

  it('reads the list again as it opens', async () => {
    await setup();

    expect(service.refresh).toHaveBeenCalledOnce();
  });

  it('says so and lists nothing where this browser keeps no tables', async () => {
    supported = false;
    await setup();

    expect(buttons()).toEqual([]);
    expect(rows()).toEqual([]);
  });

  it('lists each table kept with when it was kept and how large it is, and the size of them all', async () => {
    await setup();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain(formatSnapshotSavedAt(newer.savedAt));
    expect(rows()[0].textContent).toContain('卓');
    expect(rows()[0].textContent).toContain(formatSnapshotByteSize(newer.byteSize));
    expect(rows()[1].textContent).toContain(formatSnapshotSavedAt(older.savedAt));
    expect(text).toContain(formatSnapshotByteSize(newer.byteSize + older.byteSize));
  });

  it('follows the list as tables are kept and removed, with nothing left to clear once it is empty', async () => {
    await setup();

    snapshots.set([]);
    await fixture.whenStable();

    expect(rows()).toEqual([]);
    expect(buttons().length).toBe(2);
    expect(buttons()[1].disabled).toBe(true);
  });

  it('keeps the table now, and waits while one is being kept', async () => {
    await setup();

    buttons()[0].click();
    await fixture.whenStable();
    expect(service.capture).toHaveBeenCalledOnce();

    isCapturing.set(true);
    await fixture.whenStable();
    expect(buttons()[0].disabled).toBe(true);
  });

  it('restores a table only once the reader agrees', async () => {
    await setup();
    ask.mockResolvedValueOnce(false);

    rowButtons(1)[0].click();
    await fixture.whenStable();
    expect(service.restore).not.toHaveBeenCalled();

    rowButtons(1)[0].click();
    await fixture.whenStable();
    expect(service.restore).toHaveBeenCalledWith(older.id);
  });

  it('holds the restore buttons while a table is being restored', async () => {
    await setup();

    isRestoring.set(true);
    await fixture.whenStable();

    expect(rowButtons(0)[0].disabled).toBe(true);
    expect(rowButtons(0)[1].disabled).toBe(false);
  });

  it('removes one table, or all of them, only once the reader agrees to a dangerous question', async () => {
    await setup();
    ask.mockResolvedValueOnce(false);

    rowButtons(0)[1].click();
    await fixture.whenStable();
    expect(service.remove).not.toHaveBeenCalled();

    rowButtons(0)[1].click();
    await fixture.whenStable();
    expect(service.remove).toHaveBeenCalledWith(newer.id);
    expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({ danger: true }));

    buttons()[1].click();
    await fixture.whenStable();
    expect(service.clear).toHaveBeenCalledOnce();
  });

  it('leaves every button dead for a seat that may not change the table', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    await setup();

    expect(buttons().every((button) => button.disabled)).toBe(true);
    const panel = fixture.componentInstance as unknown as {
      captureNow(): Promise<void>;
      restore(meta: RoomSnapshotMeta): Promise<void>;
      remove(meta: RoomSnapshotMeta): Promise<void>;
      clearAll(): Promise<void>;
    };
    await panel.captureNow();
    await panel.restore(older);
    await panel.remove(older);
    await panel.clearAll();

    expect(ask).not.toHaveBeenCalled();
    expect(service.capture).not.toHaveBeenCalled();
    expect(service.restore).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
    expect(service.clear).not.toHaveBeenCalled();
  });
});
