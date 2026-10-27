import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RoomSettingsPanelComponent } from '@axe/features/room-settings/room-settings-panel/room-settings-panel.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomSettingsPanelComponent', () => {
  let fixture: ComponentFixture<RoomSettingsPanelComponent>;
  let component: RoomSettingsPanelComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomSettingsPanelComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    fixture = TestBed.createComponent(RoomSettingsPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  async function open(tab: ReturnType<RoomSettingsPanelComponent['tab']>): Promise<HTMLElement> {
    component.tab.set(tab);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  async function openUi(part: 'shared' | 'skin' | 'tabletop'): Promise<HTMLElement> {
    component.uiTab.set(part);
    return open('ui');
  }

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('asks for no change detector', () => {
    expect((component as unknown as { changeDetector?: unknown }).changeDetector).toBeUndefined();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(RoomSettingsPanelComponent);
  });

  it('does not throw when it is drawn', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('opens on the general part and shows only that part', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.tab()).toBe('general');
    expect(fixture.nativeElement.querySelector('[data-testid="room-settings-dice"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[name="turnOrderMode"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[name="zocMode"]')).toBeNull();
  });

  it('shows the round only under the part it belongs to', async () => {
    const root = await open('battle');

    expect(root.querySelector('[name="turnOrderMode"]')).not.toBeNull();
  });

  it('draws the move range, the ground enemies hold, zones and riding under the move part', async () => {
    const root = await open('move');

    expect(root.querySelector('[name="moveRangeEnabled"]')).not.toBeNull();
    expect(root.querySelector('[name="zocMode"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="room-settings-zone"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="room-settings-ride"]')).not.toBeNull();
  });

  it('holds the move part still for a reader who may not edit the table', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    const root = await open('move');

    expect(root.querySelector('[name="zocMode"]')!.closest('[inert]')).not.toBeNull();
  });

  it('leaves a reader who may not edit free to look through the parts', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isReadOnly()).toBe(true);
    expect(fixture.nativeElement.hasAttribute('inert')).toBe(false);
    const strip = fixture.nativeElement.querySelector('[data-testid="room-settings-tab-move"]');
    expect(strip.closest('[inert]')).toBeNull();
  });

  it('reaches where the notices go from the round section of the battle part', async () => {
    ChatTabList.instance.addChatTab('メイン');
    const root = await open('battle');

    (root.querySelector('[data-testid="room-settings-open-notices"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.tab()).toBe('notice');
    expect(root.querySelector('[data-testid="room-settings-notices"]')).not.toBeNull();
  });

  it('opens the UI settings on what the room shows everyone', () => {
    expect(component.uiTab()).toBe('shared');
  });

  it('keeps what the room shows everyone under its own part', async () => {
    const root = await openUi('shared');
    const shared = root.querySelector('[data-testid="room-settings-shared"]');

    expect(shared).toBeTruthy();
    expect(shared!.querySelector('[data-testid="facing-mark"]')).toBeTruthy();
    expect(shared!.querySelector('[data-testid="image-billboard"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="room-settings-own"]')).toBeNull();
    expect(root.querySelector('[data-testid="room-settings-skin"]')).toBeNull();
  });

  it('keeps the colours this screen is dressed in under their own part', async () => {
    const root = await openUi('skin');

    expect(root.querySelector('[data-testid="room-settings-skin"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="room-settings-shared"]')).toBeNull();
    expect(root.querySelector('[data-testid="room-settings-own"]')).toBeNull();
  });

  it('keeps what a screen laid on a table wants under its own part', async () => {
    const root = await openUi('tabletop');
    const own = root.querySelector('[data-testid="room-settings-own"]');

    expect(own).toBeTruthy();
    for (const control of [
      'tabletop-recommended',
      'tabletop-menu-style',
      'orthographic-projection',
      'multi-angle-enabled',
      'ticker-enabled',
      'cell-mm',
      'real-size-enabled',
      'panel-rotation-enabled',
      'forget-own-display',
    ]) {
      expect(own!.querySelector(`[data-testid="${control}"]`)).toBeTruthy();
    }
    expect(root.querySelector('[data-testid="reset-calibration"]')).toBeNull();
    expect(root.querySelector('[data-testid="room-settings-shared"]')).toBeNull();
  });

  it('keeps the measuring tool under the utility part', async () => {
    const root = await open('utility');

    expect(root.querySelector('[data-testid="reset-calibration"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="real-size-enabled"]')).toBeNull();
  });
});
