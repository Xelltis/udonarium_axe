import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { BrowserDataWipeService } from '@axe/features/room-settings/browser-data-wipe.service';
import { RoomUtilitySettingsComponent } from '@axe/features/room-settings/room-utility-settings/room-utility-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomUtilitySettingsComponent', () => {
  let fixture: ComponentFixture<RoomUtilitySettingsComponent>;
  let opened: string[];

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomUtilitySettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    opened = [];
    vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(((name: string) => {
      opened.push(name);
    }) as never);
    fixture = TestBed.createComponent(RoomUtilitySettingsComponent);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  async function drawn(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('reaches the character import', async () => {
    (await drawn()).querySelector<HTMLButtonElement>('[data-testid="room-settings-character-import"]')!.click();

    expect(opened).toEqual(['characterImport']);
  });

  it('opens the replay, for someone watching as well', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    const button = (await drawn()).querySelector('[data-testid="room-settings-replay"]') as HTMLButtonElement;
    expect(button.closest('[inert]')).toBeNull();
    button.click();

    expect(opened).toEqual(['replay']);
  });

  it('offers anyone, someone watching as well, to wipe this browser’s data', async () => {
    const wipe = vi.spyOn(TestBed.inject(BrowserDataWipeService), 'wipe').mockResolvedValue(false);
    PeerCursor.myCursor.role = PeerRole.Guest;

    const button = (await drawn()).querySelector(
      '[data-testid="room-settings-wipe-browser-data"]'
    ) as HTMLButtonElement;
    expect(button.closest('[inert]')).toBeNull();
    button.click();

    expect(wipe).toHaveBeenCalledOnce();
  });
});
