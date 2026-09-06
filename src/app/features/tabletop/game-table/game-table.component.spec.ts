import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContextMenuAction, ContextMenuService, ContextMenuType } from '@axe/application/ui/context-menu.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import {
  TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY,
  TabletopDisplaySettingsService,
} from '@axe/application/ui/tabletop-display-settings.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GridType } from '@axe/domain/tabletop/game-table';
import { TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableComponent', () => {
  let component: GameTableComponent;
  let fixture: ComponentFixture<GameTableComponent>;

  beforeEach(async () => {
    localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({
      imports: [GameTableComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GameTableComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('2D camera', () => {
    const syncMode2d = (target: GameTableComponent): void => {
      (target as unknown as { syncMode2d(): void }).syncMode2d();
    };
    const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

    beforeEach(() => {
      (component.gestureService as unknown as { gameTableEl: HTMLElement }).gameTableEl = document.createElement('div');
    });

    it('straightens the table when entering 2D mode without locking later rotation', () => {
      component.gestureService.viewRotateX = 35;
      component.gestureService.viewRotateY = 12;
      component.gestureService.viewRotateZ = 27;
      component.currentTable.mode2d = true;

      syncMode2d(component);

      expect(component.gestureService.viewRotateX).toBe(0);
      expect(component.gestureService.viewRotateY).toBe(0);
      expect(component.gestureService.viewRotateZ).toBe(0);

      component.gestureService.setTransform(0, 0, 0, 0, 0, 15);
      syncMode2d(component);
      expect(component.gestureService.viewRotateZ).toBe(15);
    });

    it('enters flat mode from this browser local tabletop-display setting', () => {
      component.currentTable.mode2d = false;
      component.gestureService.viewRotateX = 35;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });

      syncMode2d(component);

      expect(component.gestureService.tiltLocked).toBe(true);
      expect(component.gestureService.viewRotateX).toBe(0);
    });

    it('uses scale-based zoom only while orthographic projection is enabled in 2D mode', async () => {
      component.gestureService.viewPositionZ = -3000;
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });

      syncMode2d(component);
      await nextFrame();
      expect(component.gestureService.orthographicProjection).toBe(true);
      expect(
        (component.gestureService as unknown as { gameTableEl: HTMLElement }).gameTableEl.style.transform
      ).toContain('scale(0.500000)');

      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: false });
      syncMode2d(component);
      await nextFrame();
      expect(component.gestureService.orthographicProjection).toBe(false);
      expect(
        (component.gestureService as unknown as { gameTableEl: HTMLElement }).gameTableEl.style.transform
      ).not.toContain('scale(');
    });

    it('removes the perspective from the tabletop viewport', async () => {
      component.currentTable.gridType = GridType.NONE;
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });

      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.rootElementRef().nativeElement.style.perspective).toBe('none');
    });
  });

  describe('characters', () => {
    const MINE = ['いち', 'に'];

    function makeCharacter(name: string): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.location.name = 'table';
      return character;
    }

    const laidOut = () =>
      component
        .characters()
        .map((c) => c.name)
        .filter((name) => MINE.includes(name));

    it('lays the pieces out in the order they are stacked', () => {
      const under = makeCharacter('いち');
      const over = makeCharacter('に');
      under.zindex = 5;
      over.zindex = 1;

      expect(laidOut()).toEqual(['に', 'いち']);
    });

    it('lays them out again once one of them moves up the pile', async () => {
      const first = makeCharacter('いち');
      const second = makeCharacter('に');
      first.zindex = 0;
      second.zindex = 1;
      // Settle the arrivals first: a piece's own change bumps its version and not the
      // collection's, and that is the only thing left to notice the order has moved.
      await Promise.resolve();
      expect(laidOut()).toEqual(['いち', 'に']);

      first.toTopmost();
      await Promise.resolve();

      expect(laidOut()).toEqual(['に', 'いち']);
    });
  });

  describe('buildContextMenuActions', () => {
    const position = { x: 0, y: 0, z: 0 };
    const names = () => component.buildContextMenuActions(position).map((action) => action.name);

    it('leaves out the piece-making item on a desktop', () => {
      TestBed.inject(MobileLayoutService).prefersDesktop.set(true);

      expect(names()).not.toContain('コマを作る…');
      expect(names()).toContain('キャラクターを作成');
      expect(names()).toContain('画像タグから山札を作成');
    });

    it('offers it on a mobile layout', () => {
      const mobileLayout = TestBed.inject(MobileLayoutService);
      mobileLayout.prefersDesktop.set(false);
      Object.defineProperty(mobileLayout, 'isActive', { value: () => true, configurable: true });

      expect(names()).toContain('コマを作る…');
    });

    it('groups table actions for the rotating menu without dropping legacy actions', () => {
      const model = component.buildContextMenuModel(position);
      const groupedActions = model.rotatingGroups.flatMap((group) => group.actions);
      const legacyActions = model.actions.filter((action) => action.name.length > 0);

      expect(model.rotatingGroups.map((group) => group.name)).toEqual([
        'オブジェクト作成1',
        'オブジェクト作成2',
        'テーブル設定',
      ]);
      expect(groupedActions).toEqual(expect.arrayContaining(legacyActions));
      expect(groupedActions).toHaveLength(legacyActions.length);
    });

    it('splits the create items with a separator between the dice and the coin', () => {
      const model = component.buildContextMenuModel(position);
      const separatorIndexes = model.actions
        .map((action, index) => (action.type === ContextMenuType.SEPARATOR ? index : -1))
        .filter((index) => 0 <= index);

      expect(separatorIndexes).toHaveLength(2);
      expect(model.actions[separatorIndexes[0] - 1].name).toBe('ダイスを作成');
      expect(model.actions[separatorIndexes[0] + 1].name).toBe('コインを作成');
      expect(model.rotatingGroups[0].actions).toHaveLength(separatorIndexes[0]);
    });
  });

  describe('holding the view still', () => {
    const position = { x: 0, y: 0, z: 0 };
    const LOCK_OFF = '☐ ビューを固定';
    const LOCK_ON = '☑ ビューを固定';

    /** The table settings group, which is where the entry lives in the rotating menu. */
    const rotatingSettingNames = (): string[] => {
      const model = component.buildContextMenuModel(position);
      const group = model.rotatingGroups.find((entry) => entry.name === 'テーブル設定');
      return (group?.actions ?? []).map((action) => action.name);
    };
    const flatNames = (): string[] => component.buildContextMenuActions(position).map((action) => action.name);

    beforeEach(() => {
      (component.gestureService as unknown as { gameTableEl: HTMLElement }).gameTableEl = document.createElement('div');
    });

    it('offers the lock from both menus in 2D, since either one may be the one in use', () => {
      component.currentTable.mode2d = true;

      expect(rotatingSettingNames()).toContain(LOCK_OFF);
      expect(flatNames()).toContain(LOCK_OFF);
    });

    it('leaves it out in 3D, where nothing is standing on the screen', () => {
      component.currentTable.mode2d = false;

      expect(rotatingSettingNames()).not.toContain(LOCK_OFF);
      expect(flatNames()).not.toContain(LOCK_OFF);
    });

    it('flips the lock when the entry is chosen, and says so the next time it is read', () => {
      component.currentTable.mode2d = true;
      const lock = TestBed.inject(ViewLockService);
      const toggle = component
        .buildContextMenuActions(position)
        .find((action) => action.name === LOCK_OFF) as ContextMenuAction;

      toggle.action?.();

      expect(lock.locked()).toBe(true);
      expect(component.gestureService.viewLocked).toBe(true);
      expect(flatNames()).toContain(LOCK_ON);
    });

    it('withholds the way back to real size until the screen has been measured', () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });

      expect(flatNames()).not.toContain('実寸に合わせ直す');

      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);

      expect(flatNames()).toContain('実寸に合わせ直す');
      expect(rotatingSettingNames()).toContain('実寸に合わせ直す');
    });

    it('reaches the camera once for a run of resizes, not once per event', async () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });
      component.gestureService.orthographicProjection = true;
      component.currentTable.gridSize = 50;
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);
      TestBed.inject(ViewLockService).set(true);
      const internals = component as unknown as { _initialized: boolean; setGameTableGrid(): void };
      vi.spyOn(internals, 'setGameTableGrid').mockImplementation(() => undefined);
      internals._initialized = true;
      const snap = vi.spyOn(component.gestureService, 'snapToViewPositionZ');
      // Let the setting up settle first, so only the resizes are counted.
      await fixture.whenStable();
      snap.mockClear();

      // A drag of the window edge reports a resize on every pixel it passes.
      for (let i = 0; i < 20; i++) component.onWindowResize();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(snap).toHaveBeenCalledTimes(1);
    });

    it('leaves the camera alone on a resize while nothing is locked to real size', async () => {
      component.currentTable.mode2d = true;
      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);
      const snap = vi.spyOn(component.gestureService, 'snapToViewPositionZ');

      component.onWindowResize();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(snap).not.toHaveBeenCalled();
    });

    it('moves the board the moment the screen is measured, with nothing else to prompt it', async () => {
      component.currentTable.mode2d = true;
      component.currentTable.gridSize = 50;
      const internals = component as unknown as { _initialized: boolean; setGameTableGrid(): void };
      vi.spyOn(internals, 'setGameTableGrid').mockImplementation(() => undefined);
      internals._initialized = true;
      // syncMode2d writes this from the table, so setting it on the service alone would be undone.
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });
      const calibration = TestBed.inject(DisplayCalibrationService);
      // Let the table settle first, so nothing but the calibration is left to move the board.
      await fixture.whenStable();
      expect(component.gestureService.viewPositionZ).toBe(0);

      // What confirming the calibration modal does, and nothing besides.
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);
      await fixture.whenStable();

      expect(component.gestureService.viewPositionZ).toBeCloseTo(1155.1, 1);
    });

    it('follows a nudge of the scale, which is how the last of it is settled by eye', async () => {
      component.currentTable.mode2d = true;
      component.currentTable.gridSize = 50;
      const internals = component as unknown as { _initialized: boolean; setGameTableGrid(): void };
      vi.spyOn(internals, 'setGameTableGrid').mockImplementation(() => undefined);
      internals._initialized = true;
      // syncMode2d writes this from the table, so setting it on the service alone would be undone.
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);
      await fixture.whenStable();
      const before = component.gestureService.viewPositionZ;
      expect(before).toBeGreaterThan(0);

      calibration.nudge(1);
      await fixture.whenStable();

      expect(component.gestureService.viewPositionZ).toBeGreaterThan(before);
    });

    it('hears the lock being set from the settings panel, not only from the menus', async () => {
      component.currentTable.mode2d = true;
      // Settle the table first: otherwise its own pending event would carry the lock across,
      // and this would pass without the board ever having listened to the setting.
      await fixture.whenStable();
      expect(component.gestureService.viewLocked).toBe(false);

      TestBed.inject(ViewLockService).set(true);
      await fixture.whenStable();

      expect(component.gestureService.viewLocked).toBe(true);
    });

    it('takes the lock with it when the view is put back on real size', () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });
      component.gestureService.orthographicProjection = true;
      component.currentTable.gridSize = 50;
      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);
      // Marking it ready wakes the grid redraw, which has no canvas to draw on here.
      const internals = component as unknown as { _initialized: boolean; setGameTableGrid(): void };
      vi.spyOn(internals, 'setGameTableGrid').mockImplementation(() => undefined);
      internals._initialized = true;
      const snap = component
        .buildContextMenuActions(position)
        .find((action) => action.name === '実寸に合わせ直す') as ContextMenuAction;

      snap.action?.();

      expect(TestBed.inject(ViewLockService).locked()).toBe(true);
      // 3000 * (1 - 1/1.626): the depth at which one square measures an inch.
      expect(component.gestureService.viewPositionZ).toBeCloseTo(1155.1, 1);
    });

    it('offers no way back to real size under perspective, where there is no one scale', () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: false });
      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);

      expect(flatNames()).not.toContain('実寸に合わせ直す');

      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });

      expect(flatNames()).toContain('実寸に合わせ直す');
    });

    it('holds the camera still under perspective, however the snap is reached', async () => {
      component.currentTable.mode2d = true;
      component.currentTable.gridSize = 50;
      const internals = component as unknown as { _initialized: boolean; setGameTableGrid(): void };
      vi.spyOn(internals, 'setGameTableGrid').mockImplementation(() => undefined);
      internals._initialized = true;
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);
      await fixture.whenStable();
      // syncMode2d leaves the service flat only when the table asks for it, which it has not.
      expect(component.gestureService.orthographicProjection).toBe(false);

      component.onWindowResize();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(component.gestureService.viewPositionZ).toBe(0);
    });
  });

  describe('table context menu display', () => {
    const menuPosition = { x: 320, y: 240, z: 0 };
    const objectPosition = { x: 10, y: 20, z: 0 };

    it('opens the rotating interface directly on an empty 2D table when enabled', () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({
        enabled: true,
        radialMenuEnabled: true,
        radialMenuRotationSpeed: 8,
      });
      const menus = TestBed.inject(ContextMenuService);
      const openRotating = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openLegacy = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      component.openTableContextMenu(menuPosition, objectPosition);

      expect(openRotating).toHaveBeenCalledWith(
        expect.objectContaining({ x: 320, y: 240 }),
        expect.any(Array),
        expect.any(Array),
        component.currentTable.name,
        true,
        8,
        1
      );
      expect(openLegacy).not.toHaveBeenCalled();
    });

    it('opens the four-direction launcher on an empty 2D table when rotating display is disabled', () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({
        enabled: true,
        radialMenuEnabled: false,
        radialMenuRotationSpeed: 6,
      });
      const menus = TestBed.inject(ContextMenuService);
      const openRotating = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openLegacy = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      component.openTableContextMenu(menuPosition, objectPosition);

      expect(openRotating).toHaveBeenCalledWith(
        expect.objectContaining({ x: 320, y: 240 }),
        expect.any(Array),
        expect.any(Array),
        component.currentTable.name,
        false,
        6,
        1
      );
      expect(openLegacy).not.toHaveBeenCalled();
    });

    it('keeps the existing vertical table menu outside 2D mode', () => {
      component.currentTable.mode2d = false;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: false, radialMenuEnabled: false });
      const menus = TestBed.inject(ContextMenuService);
      const openRotating = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openLegacy = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      component.openTableContextMenu(menuPosition, objectPosition);

      expect(openLegacy).toHaveBeenCalledWith(
        expect.objectContaining({ x: 320, y: 240 }),
        expect.any(Array),
        component.currentTable.name
      );
      expect(openRotating).not.toHaveBeenCalled();
    });

    it('keeps the ordinary menu in shared 2D when local tabletop display mode is off', () => {
      component.currentTable.mode2d = true;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: false, radialMenuEnabled: true });
      const menus = TestBed.inject(ContextMenuService);
      const openRotating = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openLegacy = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      component.openTableContextMenu(menuPosition, objectPosition);

      expect(openLegacy).toHaveBeenCalled();
      expect(openRotating).not.toHaveBeenCalled();
    });
  });

  describe('tableSurfaceStyle', () => {
    it('leaves a square table on its default rectangle', () => {
      const table = component.currentTable;
      table.gridType = GridType.SQUARE;

      expect(component.tableSurfaceStyle()).toMatchObject({
        width: '100%',
        height: '100%',
        left: '0px',
        top: '0px',
        mask: 'none',
      });
      expect(component.tableSurfaceBorderStyle()).toEqual({ background: 'none' });
    });

    it('widens a hex table to the outline of the hexes and masks it', () => {
      const table = component.currentTable;
      table.width = 3;
      table.height = 2;
      table.gridSize = 50;
      table.gridType = GridType.HEX_VERTICAL;

      const style = component.tableSurfaceStyle();
      const borderStyle = component.tableSurfaceBorderStyle();

      expect(Number.parseFloat(style?.width ?? '')).toBeCloseTo((50 / Math.sqrt(3)) * 2 + (50 / Math.sqrt(3)) * 3);
      expect(Number.parseFloat(style?.height ?? '')).toBeCloseTo(125);
      expect(Number.parseFloat(style?.left ?? '')).toBeCloseTo(-50 / Math.sqrt(3));
      expect(Number.parseFloat(style?.top ?? '')).toBeCloseTo(-25);
      expect(style?.mask).toContain('data:image/svg+xml');
      expect(style?.['-webkit-mask']).toBe(style?.mask);
      expect(borderStyle?.background).toContain('data:image/svg+xml');
    });
  });

  describe('the pools on its walls', () => {
    it('measures a pool from the end each wall is drawn from', () => {
      const pool = { localX: 100, localY: 40, radiusX: 80, radiusY: 80, color: '#ffffff', intensity: 1 };
      const at = (surface: TableSurface) => component['wallPoolStyleFor'](pool, surface, 1000)['mask-image'];

      expect(at('north-wall')).toContain('at 100px');
      expect(at('east-wall')).toContain('at 100px');
      expect(at('south-wall')).toContain('at 900px');
      expect(at('west-wall')).toContain('at 900px');
    });
  });

  describe('wallBackground', () => {
    it('backs a wall with the picture alone when no grid is asked for', () => {
      const bg = component.wallBackground('blob:wall', '');
      expect(bg.surfaceBackground).toBe('url(blob:wall)');
      expect(bg.surfaceBackgroundSize).toBe('100% 100%');
      expect(bg.surfaceBackgroundRepeat).toBe('no-repeat');
    });

    it('lays the grid over the picture when one is', () => {
      const bg = component.wallBackground('blob:wall', 'data:image/png;base64,AAA');
      expect(bg.surfaceBackground).toBe('url(data:image/png;base64,AAA), url(blob:wall)');
      expect(bg.surfaceBackgroundSize).toBe('100% 100%, 100% 100%');
      expect(bg.surfaceBackgroundRepeat).toBe('no-repeat, no-repeat');
    });
  });

  describe('walls', () => {
    function picture(url: string): string {
      return TestBed.inject(ImageStorage).add(url).identifier;
    }

    it('raises only the walls that are switched on and have a picture', async () => {
      const table = component.currentTable;
      table.showNorthWall = true;
      table.northWallImageIdentifier = picture('blob:north');
      table.showSouthWall = true;
      table.showEastWall = false;
      table.eastWallImageIdentifier = picture('blob:east');
      table.showWestWall = true;
      table.westWallImageIdentifier = picture('blob:west');
      await Promise.resolve();

      const walls = component.activeWalls();

      expect(walls.map((wall) => wall.surface)).toEqual(['north-wall', 'west-wall']);
      expect(walls[0]).toMatchObject({
        containerClass: 'top-0 left-0',
        containerTransform: 'translateY(-100%) rotateX(90deg) rotateZ(180deg) scaleX(-1)',
        containerOrigin: '50% 100%',
        widthPx: table.width * table.gridSize,
        heightPx: table.wallHeight * table.gridSize,
        surfaceBackground: 'url(blob:north)',
      });
      expect(walls[1]).toMatchObject({
        containerClass: 'top-0 left-0',
        containerOrigin: '0% 0%',
        widthPx: table.height * table.gridSize,
        heightPx: table.wallHeight * table.gridSize,
        surfaceBackground: 'url(blob:west)',
      });
    });

    it('lays a rasterised grid over each wall while the table shows its grid', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        () => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as RenderingContext
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,GRID');
      const table = component.currentTable;
      table.gridShow = true;
      table.showSouthWall = true;
      table.southWallImageIdentifier = picture('blob:south');
      await Promise.resolve();

      const [south] = component.activeWalls();

      expect(south.surface).toBe('south-wall');
      expect(south.surfaceBackground).toBe('url(data:image/png;base64,GRID), url(blob:south)');
      expect(south.surfaceBackgroundSize).toBe('100% 100%, 100% 100%');
    });

    it('describes each face by the edge it runs along and the way it looks', () => {
      const table = component.currentTable;
      table.width = 20;
      table.height = 10;
      table.gridSize = 50;
      table.wallHeight = 4;

      expect(component['wallFaceFor']('north-wall')).toEqual({
        ax: 0,
        ay: 0,
        bx: 1000,
        by: 0,
        nx: 0,
        ny: 1,
        heightPx: 200,
      });
      expect(component['wallFaceFor']('south-wall')).toEqual({
        ax: 0,
        ay: 500,
        bx: 1000,
        by: 500,
        nx: 0,
        ny: -1,
        heightPx: 200,
      });
      expect(component['wallFaceFor']('west-wall')).toEqual({
        ax: 0,
        ay: 0,
        bx: 0,
        by: 500,
        nx: 1,
        ny: 0,
        heightPx: 200,
      });
      expect(component['wallFaceFor']('east-wall')).toEqual({
        ax: 1000,
        ay: 0,
        bx: 1000,
        by: 500,
        nx: -1,
        ny: 0,
        heightPx: 200,
      });
      expect(component['wallFaceFor']('floor')).toBeNull();
    });

    it('hands the same wall views back while nothing changes', async () => {
      const table = component.currentTable;
      table.showNorthWall = true;
      table.northWallImageIdentifier = picture('blob:north');
      await Promise.resolve();

      const views = component['wallViews']();

      expect(views.map((view) => view.wall.surface)).toEqual(['north-wall']);
      expect(views[0].pools).toEqual([]);
      expect(views[0].silhouettes).toEqual([]);
      expect(component['wallViews']()).toBe(views);
    });

    it('has no pools or silhouettes on a wall while nothing is lit', () => {
      expect(component['wallPoolsFor']('north-wall')).toEqual([]);
      expect(component['wallSilhouettesFor']('east-wall')).toEqual([]);
      expect(component['wallBaseFilter']()).toBeNull();
    });
  });

  describe('grid faces', () => {
    it('rasterises a face once and hands the same picture back for the same geometry', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        () => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as RenderingContext
      );
      const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,GRID');
      const table = component.currentTable;

      const first = component['gridFaces'].dataUrl(table, 500, 200, 0, 0, 'N', null);
      const again = component['gridFaces'].dataUrl(table, 500, 200, 0, 0, 'N', null);
      const other = component['gridFaces'].dataUrl(table, 500, 200, 0, 0, 'S', [-1, 0, 0, 1]);
      const face = component['gridFaces'].dataUrl(table, 100, 150, 0, 50, 'N', null);
      const faceAgain = component['gridFaces'].dataUrl(table, 100, 150, 0, 50, 'N', null);

      expect(first).toBe('data:image/png;base64,GRID');
      expect(again).toBe(first);
      expect(other).toBe('data:image/png;base64,GRID');
      expect(faceAgain).toBe(face);
      expect(encode).toHaveBeenCalledTimes(3);
    });

    it('rasterises again once the grid colour changes', () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
        () => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as RenderingContext
      );
      const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,GRID');
      const table = component.currentTable;

      component['gridFaces'].dataUrl(table, 500, 200, 0, 0, 'N', null);
      table.gridColor = '#ff0000ff';
      component['gridFaces'].dataUrl(table, 500, 200, 0, 0, 'N', null);

      expect(encode).toHaveBeenCalledTimes(2);
    });
  });

  describe('beam grids', () => {
    function terrainOn(surface: string, isGrid: boolean): Terrain {
      const terrain = Terrain.create('梁', 2, 3, 1, '', '');
      terrain.location.surface = surface;
      terrain.isGrid = isGrid;
      component.currentTable.appendChild(terrain);
      return terrain;
    }

    it('lists a grid for each gridded terrain that hangs on a wall', async () => {
      const table = component.currentTable;
      table.gridShow = true;
      terrainOn('floor', true);
      const hung = terrainOn('north-wall', true);
      terrainOn('east-wall', false);
      await Promise.resolve();

      const tops = component.beamTopGrids();
      const faces = component.beamWallGrids();

      expect(tops.map((grid) => grid.identifier)).toEqual([hung.identifier]);
      expect(faces.map((grid) => grid.identifier)).toEqual([hung.identifier]);
      expect(faces[0]).toMatchObject({ width: 2 * table.gridSize, height: 3 * table.gridSize });
      expect(faces[0].matrix3d).toMatch(/^matrix3d\(/);
    });

    it('lists none while the table hides its grid', async () => {
      const table = component.currentTable;
      table.gridShow = false;
      terrainOn('north-wall', true);
      await Promise.resolve();

      expect(component.beamTopGrids()).toEqual([]);
      expect(component.beamWallGrids()).toEqual([]);
    });
  });

  describe('camera glide', () => {
    it('eases the table to the focus and takes the easing off again', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      const tableEl = component.gameTable().nativeElement;

      TestBed.inject(SelectionSignalService).focusCoordinate.set({ x: 100, y: 100, timestamp: 1 });
      fixture.detectChanges();
      vi.advanceTimersByTime(50);
      expect(tableEl.style.transition).toBe('0.2s ease-out');

      vi.advanceTimersByTime(100);
      expect(tableEl.style.transition).toBe('');
      vi.useRealTimers();
    });

    it('drops the glide when the table goes before it lands', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      const tableEl = component.gameTable().nativeElement;

      TestBed.inject(SelectionSignalService).focusCoordinate.set({ x: 100, y: 100, timestamp: 2 });
      fixture.detectChanges();
      fixture.destroy();
      vi.advanceTimersByTime(200);

      expect(tableEl.style.transition).toBe('');
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });
  });
});
