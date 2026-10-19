import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { LOCAL_MODE_STORAGE_KEY } from '@axe/application/ui/local-mode-preference.service';
import { WidgetLayoutService } from '@axe/application/ui/widget-layout.service';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { RoomSnapshotMeta } from '@axe/core/storage/room-snapshot-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomRestoreBannerComponent } from '@axe/features/room-archive/room-restore-banner/room-restore-banner.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';

describe('RoomRestoreBannerComponent', () => {
  const snapshot: RoomSnapshotMeta = {
    id: 1,
    roomName: '',
    savedAt: new Date(2026, 6, 3, 9, 5).getTime(),
    byteSize: 2048,
  };

  let fixture: ComponentFixture<RoomRestoreBannerComponent>;
  let snapshots: ReturnType<typeof signal<readonly RoomSnapshotMeta[]>>;
  let restore: ReturnType<typeof vi.fn>;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RoomRestoreBannerComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RoomSnapshotService,
          useValue: {
            snapshots: snapshots.asReadonly(),
            isSupported: true,
            isRestoring: signal(false),
            refresh: vi.fn().mockResolvedValue([]),
            restore,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RoomRestoreBannerComponent);
    fixture.detectChanges();
  }

  function banner(): HTMLElement | null {
    return fixture.nativeElement.querySelector('button');
  }

  function box(): HTMLElement | null {
    return fixture.nativeElement.querySelector('div');
  }

  beforeEach(() => {
    localStorage.removeItem('ui-widget-layout');
    snapshots = signal<readonly RoomSnapshotMeta[]>([snapshot]);
    restore = vi.fn().mockResolvedValue(true);
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '' } as IPeerContext);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('shows the banner offline when there is something to restore', async () => {
    await setup();
    expect(banner()).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('2026/07/03 09:05');
  });

  it('shows none while an invitation takes the page into a room, but does offline, where none can', async () => {
    history.replaceState(null, '', '/#join?r=a1b&n=room');
    try {
      await setup();
      expect(banner()).toBeNull();
      TestBed.resetTestingModule();

      localStorage.setItem(LOCAL_MODE_STORAGE_KEY, '1');
      await setup();
      expect(banner()).not.toBeNull();
    } finally {
      localStorage.removeItem(LOCAL_MODE_STORAGE_KEY);
      history.replaceState(null, '', '/');
    }
  });

  it('shows none when there is nothing', async () => {
    snapshots.set([]);
    await setup();
    expect(banner()).toBeNull();
  });

  it('shows none while it is in a room', async () => {
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: 'room' } as IPeerContext);
    await setup();
    expect(banner()).toBeNull();
  });

  it('shows none without permission to edit', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    await setup();
    expect(banner()).toBeNull();
  });

  it('restores the latest snapshot and closes the banner', async () => {
    await setup();
    banner()!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(restore).toHaveBeenCalledWith(snapshot.id);
    expect(banner()).toBeNull();
  });

  it('writes down where it was dragged to as soon as the drag ends', async () => {
    await setup();
    const layout = TestBed.inject(WidgetLayoutService);
    const element = box()!;
    element.style.left = '412px';
    element.style.top = '64px';

    fixture.debugElement
      .query(By.directive(DraggableDirective))
      .injector.get(DraggableDirective)
      .onend.emit(new MouseEvent('mouseup'));
    await fixture.whenStable();

    expect(layout.spotOf('roomRestore')).toEqual({ left: 412, top: 64 });
  });

  it('comes back where it was dragged to', async () => {
    localStorage.setItem('ui-widget-layout', JSON.stringify({ roomRestore: { left: 240, top: 96 } }));
    await setup();

    expect(box()!.style.left).toBe('240px');
    expect(box()!.style.top).toBe('96px');
  });

  it('closes it on a later', async () => {
    await setup();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    buttons[1].click();
    fixture.detectChanges();

    expect(restore).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });
});
