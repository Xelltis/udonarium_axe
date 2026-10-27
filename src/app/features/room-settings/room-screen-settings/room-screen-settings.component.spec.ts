import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopDisplayPreferenceService } from '@axe/application/ui/tabletop-display-preference.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { RoomScreenSettingsComponent } from '@axe/features/room-settings/room-screen-settings/room-screen-settings.component';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomScreenSettingsComponent', () => {
  let fixture: ComponentFixture<RoomScreenSettingsComponent>;
  let component: RoomScreenSettingsComponent;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomScreenSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    fixture = TestBed.createComponent(RoomScreenSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('does not throw when it is drawn', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('writes each feature to this screen alone, so nobody else is told', () => {
    component.orthographicProjection.value = true;
    component.multiAngleEnabled.value = true;
    component.multiAngleFontScale.value = 'large';
    component.tabletopMenuStyle.value = 'radial';
    component.radialMenuRotationSpeed.value = 9;
    component.hoverDetailPlacement.value = 'screen-edges';
    component.cellMm.value = 30;

    const own = TestBed.inject(TabletopDisplayPreferenceService).own();
    expect(own).toEqual({
      orthographicProjection: true,
      multiAngleEnabled: true,
      multiAngleFontScale: 'large',
      tabletopMenuStyle: 'radial',
      radialMenuRotationSpeed: 9,
      hoverDetailPlacement: 'screen-edges',
      cellMm: 30,
    });
    expect(Config.instance.getAttribute('_displayMultiAngleEnabled')).toBe('');
  });

  it('shows what the table has until this screen is told otherwise', () => {
    table.multiAngleEnabled = true;
    TableSelecter.instance.viewTableIdentifier = table.identifier;

    expect(component.multiAngleEnabled.value).toBe(true);

    component.multiAngleEnabled.value = false;

    expect(component.multiAngleEnabled.value).toBe(false);
    expect(table.multiAngleEnabled).toBe(true);
  });

  it('hands everything back to the table when the screen is emptied', () => {
    table.multiAngleEnabled = true;
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    component.multiAngleEnabled.value = false;

    component.forgetOwnDisplay();

    expect(component.multiAngleEnabled.value).toBe(true);
    expect(TestBed.inject(TabletopDisplayPreferenceService).own()).toEqual({});
  });

  it('asks for the turn button on windows, which the panels read from this screen', () => {
    component.panelRotationEnabled.value = true;

    expect(TestBed.inject(TabletopDisplayPreferenceService).own().panelRotationEnabled).toBe(true);
    expect(component.panelRotationEnabled.value).toBe(true);
  });

  it('starts a piece turning by the second the moment it is asked to turn in quarters', () => {
    component.multiAngleMotionMode.value = 'quarter-turn';

    expect(component.multiAngleMotionMode.value).toBe('quarter-turn');
    expect(component.multiAnglePieceRevolutionSeconds.value).toBe(5);
  });

  it('lets a reader who may not edit the room set their own screen anyway', () => {
    // Whether it is read-only is a computed, so the role has to be settled before it is asked.
    PeerCursor.myCursor.role = PeerRole.Guest;

    component.multiAngleEnabled.value = true;

    expect(TestBed.inject(RoomSettingsAccessService).isReadOnly()).toBe(true);
    expect(component.multiAngleEnabled.value).toBe(true);
  });

  it('puts in what a tabletop display wants, and takes it back out again', () => {
    expect(component.tabletopRecommended.value).toBe(false);

    component.tabletopRecommended.value = true;

    expect(component.tabletopRecommended.value).toBe(true);
    expect(TestBed.inject(ViewModePreferenceService).mode()).toBe('flat');
    expect(component.tabletopMenuStyle.value).toBe('radial');
    expect(component.multiAngleEnabled.value).toBe(true);
    expect(component.panelRotationEnabled.value).toBe(true);

    component.tabletopRecommended.value = false;

    expect(component.tabletopRecommended.value).toBe(false);
    expect(component.tabletopMenuStyle.value).toBe('standard');
    expect(component.multiAngleEnabled.value).toBe(false);
    expect(component.panelRotationEnabled.value).toBe(false);
  });

  it('leaves the real size alone, which is measured rather than recommended', () => {
    component.cellMm.value = 30;

    component.tabletopRecommended.value = true;

    expect(component.cellMm.value).toBe(30);
  });

  it('opens the measuring rather than drawing at real size on a screen never measured', () => {
    const measure = vi.spyOn(TestBed.inject(RoomSettingsAccessService), 'openCalibration').mockImplementation(() => {});

    component.realSizeEnabled.value = true;

    expect(measure).toHaveBeenCalledOnce();
    expect(component.realSizeEnabled.value).toBe(false);
  });
});
