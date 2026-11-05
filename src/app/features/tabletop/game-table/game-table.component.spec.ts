import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { BackdropFrameService } from '@axe/application/ui/backdrop-frame.service';
import { ContextMenuAction, ContextMenuService, ContextMenuType } from '@axe/application/ui/context-menu.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { PERF_HEX_MASK_SVG, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GridType } from '@axe/domain/tabletop/game-table';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { GridFaceCache } from '@axe/features/tabletop/game-table/grid-face-cache';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableComponent', () => {
  let component: GameTableComponent;
  let fixture: ComponentFixture<GameTableComponent>;

  beforeEach(async () => {
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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('holds its camera still while the first-person view is up, and lets it go after', () => {
    fixture.detectChanges();
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: 250, y: 250 };
    const firstPerson = TestBed.inject(FirstPersonService);

    firstPerson.enterSeat(piece.identifier);
    TestBed.tick();
    expect(component.gestureService.suspended).toBe(true);

    firstPerson.exitSeat();
    TestBed.tick();
    expect(component.gestureService.suspended).toBe(false);
  });

  describe('what stands behind the table as a backdrop', () => {
    const root = () => fixture.nativeElement as HTMLElement;
    const follows = (): HTMLElement[] =>
      Array.from(root().querySelectorAll<HTMLElement>('[data-testid="backdrop-layer-follow"]'));

    const lay = (options: Partial<{ follow: number; height: number; speedX: number; speedY: number }> = {}) => {
      const layer = new TableBackgroundLayer();
      layer.initialize();
      layer.imageIdentifier = ImageStorage.instance.add('hills.png').identifier;
      layer.placement = 'backdrop';
      if (options.follow !== undefined) layer.cameraFollow = options.follow;
      if (options.height !== undefined) layer.backdropHeight = options.height;
      layer.speedX = options.speedX ?? 0;
      layer.speedY = options.speedY ?? 0;
      component.currentTable.appendChild(layer);
      (
        component as unknown as { onBackgroundLayerImageLoad(id: string, event: Event): void }
      ).onBackgroundLayerImageLoad(layer.imageIdentifier, {
        target: { naturalWidth: 200, naturalHeight: 100 },
      } as unknown as Event);
      return layer;
    };

    it('draws a backdrop outside the table’s own space', () => {
      lay();
      fixture.detectChanges();

      const backdrop = root().querySelector('[data-testid="backdrop-layer"]');
      expect(backdrop).not.toBeNull();
      expect(backdrop!.closest('#app-game-table')).toBeNull();
    });

    it('lays the picture across only, its foot standing at the height it was given', () => {
      lay({ height: 0.25 });
      fixture.detectChanges();

      const view = component.backdropLayerViews()[0];
      expect(view.frameStyle['bottom']).toBe('25%');
      expect(view.frameStyle['height']).toBe('100px');
      expect(view.style['background-repeat']).toBe('repeat-x');
      expect(view.followStyle['width']).toBe('calc(100% + 400px)');
    });

    it('moves each backdrop for the camera by how much it follows, further ones less', () => {
      lay({ follow: 0.1 });
      lay({ follow: 0.6 });
      fixture.detectChanges();

      TestBed.inject(BackdropFrameService).apply({ rotateX: 50, rotateZ: 90, positionX: 0, positionY: 0 });

      expect(follows().map((element) => element.style.transform)).toEqual([
        'translate3d(-5px, 0px, 0px)',
        'translate3d(-30px, 0px, 0px)',
      ]);
    });

    it('fades the picture out at its top and its foot, on the part that moves with it', () => {
      lay();
      fixture.detectChanges();

      const view = component.backdropLayerViews()[0];
      expect(view.followStyle['mask-image']).toMatch(/^linear-gradient\(to bottom, transparent 0%/);
      expect(view.followStyle['mask-image']).toMatch(/transparent 100%\)$/);
      expect(view.followStyle['-webkit-mask-image']).toBe(view.followStyle['mask-image']);
      expect(follows()[0].style.getPropertyValue('mask-image')).toContain('linear-gradient');
    });

    it('drifts across but never up or down, the picture being laid across only', () => {
      lay({ speedX: 100, speedY: 100 });
      fixture.detectChanges();

      const view = component.backdropLayerViews()[0];
      expect(view.drifts).toBe(true);
      expect(view.style['--bg-layer-x-name']).toBe('bgLayerScrollX');
      expect(view.style['--bg-layer-y-name']).toBeUndefined();
    });
  });

  describe('saying what more a drag can be turned into', () => {
    const hint = (): HTMLElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="hold-hint"]');

    const takeUp = (liftable: boolean) =>
      TestBed.inject(HeldPieceService).take({
        identifier: 'held',
        x: 0,
        y: 0,
        widthPx: 50,
        heightPx: 50,
        altitude: 0,
        gridSize: 50,
        liftable,
      });

    it('says nothing while there is nothing in hand', () => {
      fixture.detectChanges();

      expect(hint()).toBeNull();
    });

    it('offers the footholds and the air to a piece held on the table', () => {
      takeUp(true);

      fixture.detectChanges();

      expect(hint()?.textContent).toContain('ホイールで足場を上下に辿る');
      expect(hint()?.textContent).toContain('Shift＋ホイールで高さを 1 マスずつ');
    });

    it('offers a piece held on a wall the footholds alone, having no height of its own', () => {
      takeUp(false);

      fixture.detectChanges();

      expect(hint()?.textContent).toContain('ホイールで足場を上下に辿る');
      expect(hint()?.textContent).not.toContain('Shift');
    });

    it('says nothing where there is no wheel to turn', () => {
      vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
      takeUp(true);

      fixture.detectChanges();

      expect(hint()).toBeNull();
    });

    it('leaves the band to the planned move, which is already speaking from it', () => {
      takeUp(true);
      vi.spyOn(component, 'isPlanningMove').mockReturnValue(true);

      fixture.detectChanges();

      expect(hint()).toBeNull();
    });

    afterEach(() => TestBed.inject(HeldPieceService).letGo());
  });

  describe('backing out on Escape', () => {
    it('takes the key when it backs out of picking targets, so nothing else acts on it too', () => {
      vi.spyOn(TestBed.inject(EffectTargetingService), 'cancel').mockReturnValue(true);
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

      component.onEscapeKey(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves the key for others when there was nothing to back out of', () => {
      vi.spyOn(TestBed.inject(EffectTargetingService), 'cancel').mockReturnValue(false);
      vi.spyOn(TestBed.inject(CardTargetService), 'cancelPicking').mockReturnValue(false);
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

      component.onEscapeKey(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('saying how far something is being turned', () => {
    const owner = {};
    const hint = (): HTMLElement | null =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="rotate-hint"]');

    it('says nothing while nothing is being turned', () => {
      fixture.detectChanges();

      expect(hint()).toBeNull();
    });

    it('reads out the angle and how to snap it while a turn is under way', () => {
      TestBed.inject(RotationGuideService).report(owner, { angle: 30, step: 45, snapping: false });

      fixture.detectChanges();

      expect(hint()?.textContent).toContain('30°');
      expect(hint()?.textContent).toContain('Alt を押しているあいだ 45° ごとにそろえる');
    });

    it('says the turn is being snapped while Alt is held', () => {
      TestBed.inject(RotationGuideService).report(owner, { angle: 90, step: 45, snapping: true });

      fixture.detectChanges();

      expect(hint()?.querySelector('[data-testid="rotate-hint-snap"]')?.textContent).toContain(
        '45° ごとにそろえています'
      );
    });

    it('reads out only the angle where there is no Alt key to hold', () => {
      vi.spyOn(TestBed.inject(ViewportService), 'isTouch').mockReturnValue(true);
      TestBed.inject(RotationGuideService).report(owner, { angle: 120, step: 30, snapping: false });

      fixture.detectChanges();

      expect(hint()?.textContent).toContain('120°');
      expect(hint()?.querySelector('[data-testid="rotate-hint-snap"]')).toBeNull();
    });

    afterEach(() => TestBed.inject(RotationGuideService).end(owner));
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

    it('enters flat mode where this reader asked for it, whatever the table is showing', () => {
      component.currentTable.mode2d = false;
      component.gestureService.viewRotateX = 35;
      TestBed.inject(ViewModePreferenceService).choose('flat');

      syncMode2d(component);

      expect(component.gestureService.tiltLocked).toBe(true);
      expect(component.gestureService.viewRotateX).toBe(0);
    });

    it('uses scale-based zoom only while orthographic projection is enabled in 2D mode', async () => {
      component.gestureService.viewPositionZ = -3000;
      component.currentTable.mode2d = true;
      component.currentTable.orthographicProjection = true;

      syncMode2d(component);
      await nextFrame();
      expect(component.gestureService.orthographicProjection).toBe(true);
      expect(
        (component.gestureService as unknown as { gameTableEl: HTMLElement }).gameTableEl.style.transform
      ).toContain('scale(0.500000)');

      component.currentTable.orthographicProjection = false;
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
      component.currentTable.orthographicProjection = true;

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

    describe('gathering a party', () => {
      const GATHER = 'この地点を中心にパーティを配置';
      const made: (Party | GameCharacter)[] = [];

      // The shared setup leaves this seat without a cursor, and a seat with no cursor is a
      // player. The master has to be given one before the role can be written on it.
      const beMaster = () => {
        PeerCursor.createMyCursor();
        PeerCursor.myCursor.role = PeerRole.GameMaster;
      };

      const makeParty = (name: string): Party => {
        const party = new Party();
        party.name = name;
        party.initialize();
        made.push(party);
        const member = GameCharacter.create('花子', 1, '');
        member.partyIdentifier = party.identifier;
        member.setLocation('table');
        made.push(member);
        return party;
      };

      afterEach(() => {
        PeerCursor.myCursor = null!;
        for (const object of made.splice(0)) object.destroy();
      });

      it('offers it to the master, in both menus', () => {
        beMaster();
        makeParty('パーティA');

        const model = component.buildContextMenuModel(position);

        expect(model.actions.map((action) => action.name)).toContain(GATHER);
        expect(model.rotatingGroups.map((group) => group.name)).toContain('同行');
      });

      it('keeps the two menus answering alike while it is offered', () => {
        beMaster();
        makeParty('パーティA');

        const model = component.buildContextMenuModel(position);
        const groupedActions = model.rotatingGroups.flatMap((group) => group.actions);
        const legacyActions = model.actions.filter((action) => action.name.length > 0);

        expect(groupedActions).toEqual(expect.arrayContaining(legacyActions));
        expect(groupedActions).toHaveLength(legacyActions.length);
      });

      it('offers it to nobody else', () => {
        makeParty('パーティA');

        const model = component.buildContextMenuModel(position);

        expect(model.actions.map((action) => action.name)).not.toContain(GATHER);
        expect(model.rotatingGroups.map((group) => group.name)).not.toContain('同行');
      });
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
      component.currentTable.orthographicProjection = true;

      expect(flatNames()).not.toContain('実寸に合わせ直す');

      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);

      expect(flatNames()).toContain('実寸に合わせ直す');
      expect(rotatingSettingNames()).toContain('実寸に合わせ直す');
    });

    it('reaches the camera once for a run of resizes, not once per event', async () => {
      component.currentTable.mode2d = true;
      component.currentTable.orthographicProjection = true;
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
      component.currentTable.orthographicProjection = true;
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
      component.currentTable.orthographicProjection = true;
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

    it('follows the width a square is meant to measure being changed', async () => {
      component.currentTable.mode2d = true;
      component.currentTable.gridSize = 50;
      const internals = component as unknown as { _initialized: boolean; setGameTableGrid(): void };
      vi.spyOn(internals, 'setGameTableGrid').mockImplementation(() => undefined);
      internals._initialized = true;
      component.currentTable.orthographicProjection = true;
      const calibration = TestBed.inject(DisplayCalibrationService);
      calibration.calibrateFromCardRun(274, 1);
      calibration.setRealSizeEnabled(true);
      await fixture.whenStable();
      const before = component.gestureService.viewPositionZ;
      expect(before).toBeGreaterThan(0);

      // A wider square means a nearer camera; the setting is this screen's, so no table event
      // announces it.
      TestBed.inject(TabletopDisplayService).set({ cellMm: 40 });
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
      component.currentTable.orthographicProjection = true;
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
      component.currentTable.orthographicProjection = false;
      TestBed.inject(DisplayCalibrationService).calibrateFromCardRun(274, 1);

      expect(flatNames()).not.toContain('実寸に合わせ直す');

      TestBed.inject(TabletopDisplayService).set({ orthographicProjection: true });

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
      component.currentTable.tabletopMenuStyle = 'radial';
      component.currentTable.radialMenuRotationSpeed = 8;
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

    it('opens the four-direction launcher on an empty 2D table when the style asks for it', () => {
      component.currentTable.mode2d = true;
      component.currentTable.tabletopMenuStyle = 'four-way';
      component.currentTable.radialMenuRotationSpeed = 6;
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

    it('keeps the ordinary menu on a 2D table that never asked for another', () => {
      component.currentTable.mode2d = true;
      const menus = TestBed.inject(ContextMenuService);
      const openRotating = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openLegacy = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      component.openTableContextMenu(menuPosition, objectPosition);

      expect(openLegacy).toHaveBeenCalled();
      expect(openRotating).not.toHaveBeenCalled();
    });

    it('keeps the existing vertical table menu outside 2D mode', () => {
      component.currentTable.mode2d = false;
      component.currentTable.tabletopMenuStyle = 'four-way';
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

    it('opens the four-way menu for a reader whose own seat lies flat over a table that does not', () => {
      component.currentTable.mode2d = false;
      component.currentTable.tabletopMenuStyle = 'radial';
      TestBed.inject(ViewModePreferenceService).choose('flat');
      const menus = TestBed.inject(ContextMenuService);
      const openRotating = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openLegacy = vi.spyOn(menus, 'open').mockImplementation(() => undefined);

      component.openTableContextMenu(menuPosition, objectPosition);

      expect(openRotating).toHaveBeenCalled();
      expect(openLegacy).not.toHaveBeenCalled();
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

    it('keeps the hex outline when only something standing on the table changes', async () => {
      const table = component.currentTable;
      table.width = 6;
      table.height = 5;
      table.gridSize = 50;
      table.gridType = GridType.HEX_VERTICAL;
      await Promise.resolve();
      const style = component.tableSurfaceStyle();
      const borderStyle = component.tableSurfaceBorderStyle();

      perfCounters.enabled = true;
      perfCounters.clear();
      const terrain = Terrain.create('crate', 1, 1, 1, '', '');
      table.appendChild(terrain);
      await Promise.resolve();

      try {
        expect(component.tableSurfaceStyle()).toBe(style);
        expect(component.tableSurfaceBorderStyle()).toBe(borderStyle);
        expect(perfCounters.drain().get(PERF_HEX_MASK_SVG) ?? 0).toBe(0);
      } finally {
        perfCounters.enabled = false;
        perfCounters.clear();
        terrain.destroy();
      }
    });

    it('builds the hex outline again for the size the table has now', async () => {
      const table = component.currentTable;
      table.width = 6;
      table.height = 5;
      table.gridType = GridType.HEX_VERTICAL;
      table.gridSize = 0;
      await Promise.resolve();
      const atNothing = component.tableSurfaceStyle();

      table.gridSize = 50;
      await Promise.resolve();

      expect(component.tableSurfaceStyle()).not.toBe(atNothing);
      expect(component.tableSurfaceStyle().width).toBe(`${(50 / Math.sqrt(3)) * 2 + (50 / Math.sqrt(3)) * 1.5 * 5}px`);
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

    it('hands the same wall views back while nothing changes', async () => {
      const table = component.currentTable;
      table.showNorthWall = true;
      table.northWallImageIdentifier = picture('blob:north');
      await Promise.resolve();

      const views = component['wallViews']();

      expect(views.map((view) => view.wall.surface)).toEqual(['north-wall']);
      expect(component['wallViews']()).toBe(views);
    });

    it('hands the canvas the grid laid over a wall, by the wall of the scene it goes on', async () => {
      vi.spyOn(GridFaceCache.prototype, 'dataUrl').mockReturnValue('data:image/png;base64,GRID');
      const handed = vi.spyOn(TestBed.inject(Table3dService), 'showFaceGrids');
      fixture.detectChanges();
      await fixture.whenStable();
      const table = component.currentTable;
      table.gridShow = true;
      table.showNorthWall = true;
      table.northWallImageIdentifier = picture('blob:north');
      await Promise.resolve();
      TestBed.tick();

      const grids = handed.mock.calls.at(-1)![0];
      expect(grids.get('table:north')).toBe('data:image/png;base64,GRID');
      expect(grids.size).toBe(1);
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

  describe('blocks the canvas draws together', () => {
    it('keeps each known to what finds the pieces under a point, with its menu, and lets go of one moved again', async () => {
      const open = vi.spyOn(TestBed.inject(TerrainMenuService), 'open').mockImplementation(() => undefined);
      const block = Terrain.create('壁', 1, 1, 2, 'wall.png', 'floor.png');
      block.location = { name: 'table', x: 100, y: 100 };
      block.isLocked = true;
      component.currentTable.appendChild(block);
      const overlap = TestBed.inject(TabletopOverlapService);
      fixture.detectChanges();
      await fixture.whenStable();

      try {
        const entry = overlap.get(block.identifier);
        expect(entry?.element).toBeNull();
        entry?.openMenu?.();
        expect(open).toHaveBeenCalledWith(block);

        block.isLocked = false;
        await fixture.whenStable();
        TestBed.tick();
        fixture.detectChanges();
        expect(overlap.get(block.identifier)?.openMenu).toBeUndefined();
      } finally {
        block.destroy();
      }
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

      const faces = component.beamWallGrids();

      expect(faces.map((grid) => grid.identifier)).toEqual([hung.identifier]);
      expect(faces[0]).toMatchObject({ width: 2 * table.gridSize, height: 3 * table.gridSize });
      expect(faces[0].matrix3d).toMatch(/^matrix3d\(/);
    });

    it('lists none while the table hides its grid', async () => {
      const table = component.currentTable;
      table.gridShow = false;
      terrainOn('north-wall', true);
      await Promise.resolve();

      expect(component.beamWallGrids()).toEqual([]);
    });
  });

  describe('camera glide', () => {
    const FRAME_TIMERS = [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ] as const;

    it('glides the table to the focus a frame at a time, with no easing left on the table', () => {
      vi.useFakeTimers({ toFake: [...FRAME_TIMERS] });
      fixture.detectChanges();
      const tableEl = component.gameTable().nativeElement;
      const camera = TestBed.inject(TableCameraService);
      vi.advanceTimersByTime(50);
      const before = tableEl.style.transform;

      TestBed.inject(SelectionSignalService).focusCoordinate.set({ x: 100, y: 100, timestamp: 1 });
      fixture.detectChanges();
      vi.advanceTimersByTime(50 + 16 * 3);
      const midway = tableEl.style.transform;
      expect(midway).not.toBe(before);
      expect(camera.view?.positionX).toBe(component.gestureService.viewPositionX);

      vi.advanceTimersByTime(400);
      const landed = tableEl.style.transform;
      expect(landed).not.toBe(midway);
      vi.advanceTimersByTime(100);
      expect(tableEl.style.transform).toBe(landed);
      expect(tableEl.style.transition).toBe('');
      vi.useRealTimers();
    });

    it('tells whatever reads the view about each step of the glide', () => {
      vi.useFakeTimers({ toFake: [...FRAME_TIMERS] });
      fixture.detectChanges();
      const coordinates = TestBed.inject(CoordinateService);
      vi.advanceTimersByTime(50);

      TestBed.inject(SelectionSignalService).focusCoordinate.set({ x: 100, y: 100, timestamp: 3 });
      fixture.detectChanges();
      vi.advanceTimersByTime(50);
      const atStart = coordinates.tabletopTransformVersion();
      vi.advanceTimersByTime(16 * 4);
      expect(coordinates.tabletopTransformVersion()).toBeGreaterThanOrEqual(atStart + 3);
      vi.useRealTimers();
    });

    it('drops the glide when the table goes before it lands', () => {
      vi.useFakeTimers({ toFake: [...FRAME_TIMERS] });
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
