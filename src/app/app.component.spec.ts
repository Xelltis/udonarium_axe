import { TestBed } from '@angular/core/testing';
import { AppComponent } from '@axe/app.component';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { version } from '@pkg';

describe('AppComponent', () => {
  // Booting the screen brings the room's own objects into being — the chat tabs, the config,
  // the table selecter — which the next spec file in this worker would otherwise inherit.
  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('should be defined', () => {
    expect(AppComponent).toBeTruthy();
  });

  it('resolves the version string from package.json through the @pkg alias', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+(-.+)?$/);
  });

  /**
   * Boots the screen with the panels it opens at start caught before their code is fetched: a fetch
   * left running past the end of the file is still loading as the next file in the worker begins,
   * and fails it once this file's environment is torn down.
   */
  async function boot() {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    const openInTurn = vi.spyOn(TestBed.inject(RoomPanelService), 'openInTurn').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, openInTurn };
  }

  it('draws the menu drawer on a wide screen', async () => {
    const { fixture } = await boot();

    expect(fixture.nativeElement.querySelector('fab-drawer [data-testid="fab-toggle"]')).toBeTruthy();
  });

  it('opens the connection panel at start, and the chat window over it on a wide screen', async () => {
    const { openInTurn } = await boot();

    expect(openInTurn.mock.calls.map(([panels]) => panels.map(([name]) => name))).toEqual([['peerMenu', 'chatWindow']]);
  });
});
