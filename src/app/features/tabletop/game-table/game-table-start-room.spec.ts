import { TestBed } from '@angular/core/testing';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableComponent in a browser that keeps a room to start on', () => {
  let sample: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameTableComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    sample = vi.spyOn(TestBed.inject(TabletopActionService), 'makeDefaultTabletopObjects');
    vi.spyOn(StartRoomStore.instance, 'isAvailable').mockReturnValue(true);
    vi.spyOn(StartRoomStore.instance, 'has').mockResolvedValue(true);
    vi.spyOn(StartRoomStore.instance, 'get').mockResolvedValue(new Blob(['room']));
    const startRoom = TestBed.inject(StartRoomService);
    await startRoom.prepare('');
    load = vi.spyOn(startRoom, 'loadPending');
  });

  afterEach(() => vi.restoreAllMocks());

  async function setOut(): Promise<void> {
    const fixture = TestBed.createComponent(GameTableComponent);
    expect(sample).not.toHaveBeenCalled();
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
  }

  it('sets out the kept room in place of the sample pieces', async () => {
    load.mockResolvedValue(true);

    await setOut();

    expect(load).toHaveBeenCalledTimes(1);
    expect(sample).not.toHaveBeenCalled();
  });

  it('sets out the sample where the kept room cannot be read', async () => {
    load.mockResolvedValue(false);

    await setOut();

    expect(sample).toHaveBeenCalledTimes(1);
  });
});
