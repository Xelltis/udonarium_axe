import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopDisplayPreferenceService } from '@axe/application/ui/tabletop-display-preference.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  DEFAULT_TABLETOP_DISPLAY_SETTINGS,
  TABLETOP_MODE_SETTINGS,
  TabletopDisplayKey,
} from '@axe/domain/tabletop/tabletop-display';
import { TabletopDisplaySettingComponent } from '@axe/features/tabletop/tabletop-display-setting/tabletop-display-setting.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** What the panel calls each of the settings a flat table has. */
const CONTROLS: Record<TabletopDisplayKey, string> = {
  orthographicProjection: 'orthographicProjection',
  cellMm: 'cellMm',
  tabletopMenuStyle: 'tabletopMenuStyle',
  radialMenuRotationSpeed: 'radialMenuRotationSpeed',
  hoverDetailPlacement: 'hoverDetailPlacement',
  multiAngleEnabled: 'multiAngleEnabled',
  multiAngleResourceBuffEnabled: 'multiAngleResourceBuffEnabled',
  multiAngleMotionMode: 'multiAngleMotionMode',
  multiAngleRevolutionSeconds: 'multiAngleRevolutionSeconds',
  multiAnglePauseSeconds: 'multiAnglePauseSeconds',
  multiAnglePieceRevolutionSeconds: 'multiAnglePieceRevolutionSeconds',
  multiAngleFontScale: 'multiAngleFontScale',
  multiAngleTickerEnabled: 'tickerEnabled',
  multiAngleTickerPixelsPerSecond: 'tickerPixelsPerSecond',
  cutInMultiDirectionMode: 'cutInMultiDirectionMode',
  panelRotationEnabled: 'panelRotationEnabled',
  pieceImageInCell: 'pieceImageInCell',
};

describe('TabletopDisplaySettingComponent', () => {
  let fixture: ComponentFixture<TabletopDisplaySettingComponent>;
  let component: TabletopDisplaySettingComponent;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TabletopDisplaySettingComponent, PanelDragTestHostComponent],
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
    fixture = TestBed.createComponent(TabletopDisplaySettingComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    TestBed.inject(TabletopDisplayPreferenceService).forget();
    TestBed.inject(ViewModePreferenceService).choose('auto');
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('asks for no change detector', () => {
    expect((component as unknown as { changeDetector?: unknown }).changeDetector).toBeUndefined();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(TabletopDisplaySettingComponent);
  });

  it('gathers the three ways a table is looked at into one panel', () => {
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement;

    expect(panel.querySelector('[data-testid="view-mode-flat"]')).not.toBeNull();
    expect(panel.querySelector('[data-testid="table-recommends-flat"]')).not.toBeNull();
    expect(panel.querySelector('[data-testid="orthographic-projection"]')).not.toBeNull();
  });

  it('carries every setting a table seen from above has, so none is left in another menu', () => {
    expect(Object.keys(CONTROLS).sort()).toEqual(Object.keys(DEFAULT_TABLETOP_DISPLAY_SETTINGS).sort());

    // A fresh table holds the defaults, so every control here has to read one back.
    const held = component as unknown as Record<string, unknown>;
    for (const [key, name] of Object.entries(CONTROLS)) {
      expect(held[name]).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS[key as TabletopDisplayKey]);
    }
  });

  it('sets which way a cut-in faces, which is this screen to answer for', () => {
    component.cutInMultiDirectionMode = 'four-directions';

    expect(TestBed.inject(TabletopDisplayPreferenceService).own()).toEqual({
      cutInMultiDirectionMode: 'four-directions',
    });
  });

  it('hands the mark a piece faces by to the room, and the billboard to the table', () => {
    component.facingMark = 'arrow';
    component.imageBillboard = true;

    expect(component.facingMark).toBe('arrow');
    expect(table.imageBillboard).toBe(true);
  });

  it('leaves both alone where the reader may not speak for the room', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    component.facingMark = 'arrow';
    component.imageBillboard = true;

    expect(component.facingMark).not.toBe('arrow');
    expect(table.imageBillboard).toBe(false);
  });

  it('is not in tabletop mode until the table is looked straight down on', () => {
    expect(component.tabletopMode).toBe(false);

    component.chooseViewMode('flat');

    expect(component.tabletopMode).toBe(true);
  });

  it('lays the screen flat and puts in what a screen sat around wants', () => {
    component.tabletopMode = true;

    expect(component.seatViewMode()).toBe('flat');
    expect(TestBed.inject(TabletopDisplayPreferenceService).own()).toEqual(TABLETOP_MODE_SETTINGS);
  });

  it('stands the view back up when the mode is turned off, and keeps what it put in', () => {
    component.tabletopMode = true;

    component.tabletopMode = false;

    expect(component.seatViewMode()).toBe('perspective');
    expect(component.orthographicProjection).toBe(true);
  });

  it('turns off against a table that recommends looking down, rather than snapping back on', () => {
    table.mode2d = true;
    component.chooseViewMode('auto');
    expect(component.tabletopMode).toBe(true);

    component.tabletopMode = false;

    expect(component.tabletopMode).toBe(false);
  });

  it('asks for nothing a flat screen does not want', () => {
    const wanted = Object.keys(TABLETOP_MODE_SETTINGS) as TabletopDisplayKey[];

    for (const key of wanted) expect(CONTROLS[key]).toBeDefined();
  });

  it('takes the view this seat is looking from, and leaves the table alone', () => {
    component.chooseViewMode('flat');

    expect(component.seatViewMode()).toBe('flat');
    expect(table.mode2d).toBe(false);
  });

  it('follows the table while the seat has asked for nothing of its own', () => {
    expect(component.seatViewMode()).toBe('auto');

    component.tableRecommendsFlat = true;

    expect(component.tableRecommendsFlat).toBe(true);
    expect(table.mode2d).toBe(true);
  });

  it('leaves the table its recommendation where the reader may not speak for it', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    component.tableRecommendsFlat = true;

    expect(table.mode2d).toBe(false);
  });

  it('writes what it is told to this screen alone', () => {
    component.orthographicProjection = true;
    component.multiAngleEnabled = true;
    component.cellMm = 30;

    expect(TestBed.inject(TabletopDisplayPreferenceService).own()).toEqual({
      orthographicProjection: true,
      multiAngleEnabled: true,
      cellMm: 30,
    });
    expect(table.orthographicProjection).toBe(false);
  });

  it('reads the table for whatever this screen has never been told', () => {
    table.multiAngleEnabled = true;

    expect(component.multiAngleEnabled).toBe(true);

    component.multiAngleEnabled = false;

    expect(component.multiAngleEnabled).toBe(false);
    expect(table.multiAngleEnabled).toBe(true);
  });

  it('gives the whole screen back to the table when it is told to forget', () => {
    component.orthographicProjection = true;

    component.forgetOwnDisplay();

    expect(TestBed.inject(TabletopDisplayPreferenceService).own()).toEqual({});
  });

  it('holds a square to a width a screen can be asked for', () => {
    component.cellMm = 5000;

    expect(component.cellMm).toBeLessThanOrEqual(200);
  });

  it('sets a piece turning by quarters to a pace a quarter turn can be read at', () => {
    component.multiAngleMotionMode = 'quarter-turn';

    expect(component.multiAnglePieceRevolutionSeconds).toBe(5);
  });
});
