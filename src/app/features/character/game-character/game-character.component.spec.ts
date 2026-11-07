import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import { SPEECH_BUBBLE_WAIT_MS, SpeechBubbleService } from '@axe/application/chat/speech-bubble.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { VolumeType } from '@axe/core/storage/audio-output';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_HEX_PEDESTAL_OUTLINE, perfCounters } from '@axe/core/util/perf-counters';
import { BUFF_BADGES_PER_ROW } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { GameCharacterComponent } from '@axe/features/character/game-character/game-character.component';
import { GameCharacterMenuService } from '@axe/features/character/game-character/game-character-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';

describe('GameCharacterComponent', () => {
  let component: GameCharacterComponent;
  let fixture: ComponentFixture<GameCharacterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameCharacterComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GameCharacterComponent);
    component = fixture.componentInstance;
  });

  const useFlatTable = () => {
    const table = TestBed.inject(TabletopService).currentTable;
    TestBed.inject(ViewModePreferenceService).choose('auto');
    table.mode2d = false;
    table.facingMark = 'none';
    table.imageBillboard = false;
    table.tabletopMenuStyle = 'four-way';
    table.radialMenuRotationSpeed = 5;
    table.multiAngleEnabled = false;
    table.multiAngleResourceBuffEnabled = false;
    table.multiAngleMotionMode = 'continuous';
    table.multiAngleRevolutionSeconds = 12;
    table.multiAnglePauseSeconds = 4;
    table.multiAnglePieceRevolutionSeconds = 60;
  };

  beforeEach(useFlatTable);
  afterEach(useFlatTable);

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('the panels it fetches on first use', () => {
    type Opener = 'showLightSettings' | 'showBattlePlacement' | 'showLineOfFire';

    /** Opens a panel about the piece, and hands back what the panel would arrive as and be given. */
    async function opened(opener: Opener, character: GameCharacter) {
      const openLazy = vi
        .spyOn(fixture.debugElement.injector.get(PanelService), 'openLazy')
        .mockImplementation(() => {});
      (TestBed.inject(GameCharacterMenuService) as unknown as Record<Opener, (piece: GameCharacter) => void>)[opener](
        character
      );
      const [factory, option, setup] = openLazy.mock.calls[0] as [
        () => Promise<unknown>,
        PanelOption,
        (instance: Record<string, unknown>) => void,
      ];
      openLazy.mockRestore();
      return { panel: await factory(), option, setup };
    }

    it('shows the light settings of the piece with its vision', async () => {
      const character = GameCharacter.create('灯りのコマ', 1, '');
      const { LightSettingsComponent } = await import('@axe/features/light-settings/light-settings.component');

      const { panel, option, setup } = await opened('showLightSettings', character);
      const settings: Record<string, unknown> = {};
      setup(settings);

      expect(panel).toBe(LightSettingsComponent);
      expect(settings).toEqual({ target: character, showVision: true });
      expect(option.stillWanted?.()).toBe(true);
      character.destroy();
      expect(option.stillWanted?.()).toBe(false);
    });

    it.each([
      ['showBattlePlacement', 'leaderIdentifier'],
      ['showLineOfFire', 'shooterIdentifier'],
    ] as const)('%s hands the panel the piece by its identifier', async (opener, field) => {
      const character = GameCharacter.create('隊長', 1, '');

      const { option, setup } = await opened(opener, character);
      const given = signal('');
      setup({ [field]: given });

      expect(given()).toBe(character.identifier);
      character.destroy();
      expect(option.stillWanted?.()).toBe(false);
    });
  });

  it('carries its place in the pile onto the element the table stacks', async () => {
    const character = GameCharacter.create('コマ', 1, '');
    fixture.componentRef.setInput('gameCharacter', character);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).style.zIndex).toBe('0');

    character.zindex = 4;
    await Promise.resolve();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).style.zIndex).toBe('4');
  });

  it('marks a piece in stealth for those who still see it, and drops the mark as it comes out', async () => {
    const lurker = GameCharacter.create('潜む者', 1, '');
    lurker.stealth = '1';
    fixture.componentRef.setInput('gameCharacter', lurker);
    fixture.detectChanges();
    const mark = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="stealth-mark"]');
    expect(mark()).not.toBeNull();

    lurker.stealth = '';
    await Promise.resolve();
    fixture.detectChanges();

    expect(mark()).toBeNull();
  });

  it('says by its name how many ride a mount', async () => {
    const horse = GameCharacter.create('馬', 2, '');
    horse.mountable = '1';
    fixture.componentRef.setInput('gameCharacter', horse);
    fixture.detectChanges();
    const riders = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="piece-riders"]');
    expect(riders()).toBeNull();

    const rider = GameCharacter.create('騎士', 1, '');
    rider.ridingOn = horse.identifier;
    await Promise.resolve();
    fixture.detectChanges();

    expect(riders()?.textContent).toContain('1');
  });

  describe('the riding label', () => {
    function ride(): { horse: GameCharacter; knight: GameCharacter; squire: GameCharacter } {
      const horse = GameCharacter.create('馬', 2, '');
      horse.setLocation('table');
      horse.mountable = '1';
      const knight = GameCharacter.create('騎士', 1, '');
      knight.setLocation('table');
      knight.ridingOn = horse.identifier;
      const squire = GameCharacter.create('従者', 1, '');
      squire.setLocation('table');
      squire.ridingOn = horse.identifier;
      squire.rideSeat = 'passenger';
      return { horse, knight, squire };
    }

    async function draw(of: ComponentFixture<GameCharacterComponent>): Promise<HTMLElement> {
      of.detectChanges();
      await of.whenStable();
      return of.nativeElement as HTMLElement;
    }

    it('draws a mount ridden as one card, those riding it over the mount and the one in front lowest', async () => {
      const { horse } = ride();
      fixture.componentRef.setInput('gameCharacter', horse);

      const element = await draw(fixture);
      const card = element.querySelector('[data-testid="riding-label"]')!;
      const names = [...card.querySelectorAll('[data-testid="riding-label-name"], [data-testid="piece-name"]')].map(
        (name) => name.textContent?.replace(/\s+/g, ' ').trim()
      );

      expect(names).toEqual(['group 従者', 'upgrade 騎士', '馬 person2']);
      expect(card.querySelectorAll('[data-testid="riding-label-piece"]')).toHaveLength(3);
      expect(card.querySelectorAll('[data-testid="piece-gauge"]').length).toBeGreaterThan(0);
      expect(element.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(1);
      expect(element.querySelectorAll('[data-testid="piece-gauge"]').length).toBe(
        card.querySelectorAll('[data-testid="piece-gauge"]').length
      );
    });

    it('draws no labels of its own over a piece riding a mount, and its labels again once it is off', async () => {
      const { knight } = ride();
      fixture.componentRef.setInput('gameCharacter', knight);

      let element = await draw(fixture);
      expect(element.querySelector('[data-testid="piece-name"]')).toBeNull();
      expect(element.querySelector('[data-testid="piece-gauge"]')).toBeNull();

      knight.ridingOn = '';
      element = await draw(fixture);
      expect(element.querySelector('[data-testid="piece-name"]')?.textContent).toContain('騎士');
    });

    it('names those riding a mount in its curved name from above, and draws no ring of their own', async () => {
      const { horse, knight } = ride();
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(TabletopService).currentTable.multiAngleEnabled = true;
      fixture.componentRef.setInput('gameCharacter', horse);
      await draw(fixture);

      expect(component.multiAngleLabelText()).toBe('騎士／従者／馬');

      fixture.componentRef.setInput('gameCharacter', knight);
      await draw(fixture);
      expect(component.multiAngleOrbitVisible()).toBe(false);
    });

    it('leaves out the name of a rider hiding it, and its buffs where it hides them', async () => {
      const { horse, knight } = ride();
      knight.hideName = true;
      knight.buffs.addRound('加護', '', 2);
      fixture.componentRef.setInput('gameCharacter', horse);
      const cursor = new PeerCursor();
      cursor.userId = 'me';
      cursor.role = PeerRole.Player;
      cursor.initialize();
      PeerCursor.myCursor = cursor;
      onTestFinished(() => {
        PeerCursor.myCursor = null!;
      });

      let element = await draw(fixture);
      const names = () =>
        [...element.querySelectorAll('[data-testid="riding-label-name"]')].map((name) => name.textContent?.trim());
      expect(names()).toEqual(['group 従者']);
      expect(element.querySelectorAll('[data-testid="riding-label-piece"] [data-testid="buff-badge"]').length).toBe(1);

      knight.hideBuff = true;
      element = await draw(fixture);
      expect(element.querySelectorAll('[data-testid="riding-label-piece"] [data-testid="buff-badge"]').length).toBe(0);
    });
  });

  describe('showing where the piece could walk', () => {
    function pieceThatWalks(walk: number): GameCharacter {
      const character = GameCharacter.create('コマ', 1, '');
      DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
      return character;
    }

    function movableOf(): MovableDirective {
      return fixture.debugElement.query(By.directive(MovableDirective)).injector.get(MovableDirective);
    }

    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.width = 12;
      table.height = 12;
      table.gridSize = 50;
      table.initialize();
    });

    afterEach(() => {
      table.destroy();
    });

    it('shows the reach when the piece is picked up and takes it away when it is put down', () => {
      const moveRange = TestBed.inject(MoveRangeService);
      fixture.componentRef.setInput('gameCharacter', pieceThatWalks(2));
      fixture.detectChanges();

      movableOf().ondragstart.emit({} as PointerEvent);
      expect(moveRange.range()).not.toBeNull();

      movableOf().ondragend.emit({} as PointerEvent);
      expect(moveRange.range()).toBeNull();
    });

    it('carries those riding a mount put down to where it was let go, not where the hand last wrote it', () => {
      const horse = pieceThatWalks(2);
      horse.size = 3;
      horse.mountable = '1';
      const knight = GameCharacter.create('騎士', 1, '');
      knight.setLocation('table');
      knight.location = { name: 'table', x: horse.location.x + 50, y: horse.location.y + 50 };
      knight.ridingOn = horse.identifier;
      fixture.componentRef.setInput('gameCharacter', horse);
      fixture.detectChanges();
      const movable = movableOf();
      movable.ondragstart.emit({} as PointerEvent);

      movable.posX = 300;
      movable.posY = 200;
      movable.ondragend.emit({} as PointerEvent);
      movable.onend.emit({} as PointerEvent);

      expect([horse.location.x, horse.location.y]).toEqual([300, 200]);
      expect([knight.location.x, knight.location.y]).toEqual([350, 250]);
    });

    it('takes it away when the pointer is let go without a drop', () => {
      const moveRange = TestBed.inject(MoveRangeService);
      fixture.componentRef.setInput('gameCharacter', pieceThatWalks(2));
      fixture.detectChanges();
      movableOf().ondragstart.emit({} as PointerEvent);

      movableOf().onend.emit({} as PointerEvent);

      expect(moveRange.range()).toBeNull();
    });

    it('shows nothing when the table has the range turned off', () => {
      table.moveRangeEnabled = false;
      const moveRange = TestBed.inject(MoveRangeService);
      fixture.componentRef.setInput('gameCharacter', pieceThatWalks(2));
      fixture.detectChanges();

      movableOf().ondragstart.emit({} as PointerEvent);

      expect(moveRange.range()).toBeNull();
    });

    it('works a move out instead of dragging when the press holds shift', async () => {
      const movePlan = TestBed.inject(MovePlanService);
      const piece = pieceThatWalks(2);
      fixture.componentRef.setInput('gameCharacter', piece);
      fixture.detectChanges();
      const turnedAway = vi.spyOn(movableOf(), 'cancel');

      movableOf().onstart.emit({ shiftKey: true } as PointerEvent);

      expect(movePlan.plan()?.characterIdentifier).toBe(piece.identifier);
      expect(component.isPlanningMove()).toBe(true);
      // The drag is still taking the press up; refusing it now would be undone by the rest
      // of that setting up, which puts the piece's transition and layer aside.
      expect(turnedAway).not.toHaveBeenCalled();

      await Promise.resolve();

      expect(turnedAway).toHaveBeenCalled();
      movePlan.cancel();
    });

    it('works a move out for every press where the room holds pieces to a way', async () => {
      Config.instance.moveStrict = true;
      try {
        const movePlan = TestBed.inject(MovePlanService);
        const piece = pieceThatWalks(2);
        fixture.componentRef.setInput('gameCharacter', piece);
        fixture.detectChanges();

        movableOf().onstart.emit({} as PointerEvent);

        expect(movePlan.plan()?.characterIdentifier).toBe(piece.identifier);
        await Promise.resolve();
        movePlan.cancel();
      } finally {
        Config.instance.moveStrict = false;
      }
    });

    /** Who the reader is at the table, since the room's rule is the game master's to set aside. */
    function beAt(role: PeerRole): void {
      const cursor = new PeerCursor();
      cursor.userId = 'me';
      cursor.role = role;
      cursor.initialize();
      PeerCursor.myCursor = cursor;
    }

    it('carries the piece where the game master holds shift and the room holds pieces to a way', () => {
      Config.instance.moveStrict = true;
      beAt(PeerRole.GameMaster);
      try {
        const movePlan = TestBed.inject(MovePlanService);
        fixture.componentRef.setInput('gameCharacter', pieceThatWalks(2));
        fixture.detectChanges();

        movableOf().onstart.emit({ shiftKey: true } as PointerEvent);

        expect(movePlan.plan()).toBeNull();
      } finally {
        Config.instance.moveStrict = false;
        PeerCursor.myCursor = null!;
      }
    });

    it('draws the way all the same where a player holds shift in such a room', async () => {
      Config.instance.moveStrict = true;
      beAt(PeerRole.Player);
      try {
        const movePlan = TestBed.inject(MovePlanService);
        const piece = pieceThatWalks(2);
        fixture.componentRef.setInput('gameCharacter', piece);
        fixture.detectChanges();

        movableOf().onstart.emit({ shiftKey: true } as PointerEvent);

        expect(movePlan.plan()?.characterIdentifier).toBe(piece.identifier);
        await Promise.resolve();
        movePlan.cancel();
      } finally {
        Config.instance.moveStrict = false;
        PeerCursor.myCursor = null!;
      }
    });

    it('drags a piece with no move to speak of, even where the room holds the others to a way', () => {
      Config.instance.moveStrict = true;
      try {
        const movePlan = TestBed.inject(MovePlanService);
        const character = GameCharacter.create('コマ', 1, '');
        DataElement.findElementByReference(character.rootDataElement!, '移動')!.destroy();
        fixture.componentRef.setInput('gameCharacter', character);
        fixture.detectChanges();

        movableOf().onstart.emit({} as PointerEvent);

        expect(movePlan.plan()).toBeNull();
      } finally {
        Config.instance.moveStrict = false;
      }
    });

    it('drags as it always did when the press holds nothing', () => {
      const movePlan = TestBed.inject(MovePlanService);
      fixture.componentRef.setInput('gameCharacter', pieceThatWalks(2));
      fixture.detectChanges();

      movableOf().onstart.emit({} as PointerEvent);

      expect(movePlan.plan()).toBeNull();
    });

    it('leaves shift with alt to the gesture that already had it', () => {
      const movePlan = TestBed.inject(MovePlanService);
      fixture.componentRef.setInput('gameCharacter', pieceThatWalks(2));
      fixture.detectChanges();

      movableOf().onstart.emit({ shiftKey: true, altKey: true } as PointerEvent);

      expect(movePlan.plan()).toBeNull();
    });

    it('shows nothing for a piece whose sheet says nothing about walking', () => {
      const moveRange = TestBed.inject(MoveRangeService);
      const character = GameCharacter.create('コマ', 1, '');
      DataElement.findElementByReference(character.rootDataElement!, '移動')!.destroy();
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();

      movableOf().ondragstart.emit({} as PointerEvent);

      expect(moveRange.range()).toBeNull();
    });
  });

  describe('where it is snapped to on a table counting squares of several cells', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.width = 12;
      table.height = 12;
      table.gridSize = 50;
      table.squareSpan = 2;
      table.initialize();
    });

    afterEach(() => {
      table.destroy();
    });

    function letGoAt(x: number, y: number, size = 1): { x: number; y: number } {
      fixture.componentRef.setInput('gameCharacter', GameCharacter.create('コマ', size, ''));
      fixture.detectChanges();
      const movable = fixture.debugElement.query(By.directive(MovableDirective)).injector.get(MovableDirective);
      movable.posX = x;
      movable.posY = y;
      movable.snapToGrid();
      return { x: movable.posX, y: movable.posY };
    }

    it('goes to the middle of the square under the cell snap', () => {
      expect(letGoAt(60, 10)).toEqual({ x: 25, y: 25 });
    });

    it('stays on the cell of the square it is let go over under the grid snap', () => {
      table.gridSnapStyle = GridSnapStyle.GRID;

      expect(letGoAt(60, 10)).toEqual({ x: 50, y: 0 });
      expect(letGoAt(10, 60)).toEqual({ x: 0, y: 50 });
    });

    it('keeps a piece two cells across inside the one square under its middle under the grid snap', () => {
      table.gridSnapStyle = GridSnapStyle.GRID;

      expect(letGoAt(50, 50, 2)).toEqual({ x: 100, y: 100 });
    });
  });

  describe('standing up or lying flat', () => {
    function pieceOn(surface?: string) {
      const character = GameCharacter.create('コマ', 1, '');
      character.location.surface = surface;
      fixture.componentRef.setInput('gameCharacter', character);
      return character;
    }

    it('lies flat against a wall, which is what a wall is for', () => {
      const character = pieceOn('north-wall');
      try {
        expect(component.isPoster()).toBe(true);
      } finally {
        character.destroy();
      }
    });

    it('stands up on the floor', () => {
      const character = pieceOn(undefined);
      try {
        expect(component.isPoster()).toBe(false);
      } finally {
        character.destroy();
      }
    });

    it('stands up again where the face it was on says nothing in words', () => {
      // A face cleared by one seat reaches another as nothing and can come back written out
      // as the word for it. Read as a face, the piece would go on lying down on the floor.
      for (const word of ['null', 'undefined', '']) {
        const character = pieceOn(word);
        try {
          expect(component.isPoster()).toBe(false);
        } finally {
          character.destroy();
        }
      }
    });
  });

  describe('the pedestal', () => {
    type Pedestals = {
      pedestalStyleShown(): Record<string, string>;
      pedestalStyleHidden(): Record<string, string>;
      pedestalStyleTargeted(): Record<string, string>;
    };

    it('wears a plain border on a square grid and hands the same style back each pass', () => {
      fixture.componentRef.setInput('gameCharacter', GameCharacter.create('コマ', 1, ''));
      fixture.detectChanges();
      const pedestals = component as unknown as Pedestals;

      expect(pedestals.pedestalStyleShown()).toEqual({ border: 'solid 6px #FFCC80' });
      expect(pedestals.pedestalStyleShown()).toBe(pedestals.pedestalStyleShown());
      expect(pedestals.pedestalStyleTargeted()).toEqual({ border: 'solid 6px #ff3b30' });
    });

    it('cuts one hex ring and colours it three ways', async () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.gridType = GridType.HEX_VERTICAL;
      await Promise.resolve();
      fixture.componentRef.setInput('gameCharacter', GameCharacter.create('コマ', 1, ''));
      fixture.detectChanges();
      const pedestals = component as unknown as Pedestals;

      const shown = pedestals.pedestalStyleShown();
      const hidden = pedestals.pedestalStyleHidden();
      const targeted = pedestals.pedestalStyleTargeted();

      expect(shown['clipPath']).toMatch(/^path\(/);
      expect(hidden['clipPath']).toBe(shown['clipPath']);
      expect(targeted['clipPath']).toBe(shown['clipPath']);
      expect([shown['background'], hidden['background'], targeted['background']]).toEqual([
        '#FFCC80',
        '#A0E0FF',
        '#ff3b30',
      ]);
      table.gridType = GridType.SQUARE;
    });

    it('hands the canvas a picture of the whole outline a piece of three cells stands on, past its own box', async () => {
      type Region = { left: number; top: number; width: number; height: number };
      type Pictured = Pedestals & { pedestalRegion(element: HTMLElement): Region; gridSize: number };
      fixture.componentRef.setInput('gameCharacter', GameCharacter.create('コマ', 3, ''));
      fixture.detectChanges();
      const pictured = component as unknown as Pictured;
      const box = 3 * pictured.gridSize;
      const element = { offsetWidth: box, offsetHeight: box } as HTMLElement;
      expect(pictured.pedestalRegion(element)).toEqual({ left: 0, top: 0, width: box, height: box });

      const table = TestBed.inject(TabletopService).currentTable;
      table.gridType = GridType.HEX_VERTICAL;
      await Promise.resolve();
      fixture.detectChanges();

      try {
        const ring = pictured.pedestalStyleShown();
        const region = pictured.pedestalRegion(element);
        const [left, top, width, height] = ['left', 'top', 'width', 'height'].map((key) => parseFloat(ring[key]));
        expect(region.left).toBeLessThanOrEqual(left);
        expect(region.top).toBeLessThanOrEqual(top);
        expect(region.left + region.width).toBeGreaterThanOrEqual(left + width);
        expect(region.top + region.height).toBeGreaterThanOrEqual(top + height);
        expect(region.left).toBeLessThan(0);
      } finally {
        table.gridType = GridType.SQUARE;
      }
    });

    it('cuts the hex pedestal out of the ring that turns the piece, and nothing out of the square one', async () => {
      type Grab = { turnRing(): { grab: Record<string, string> } };
      fixture.componentRef.setInput('gameCharacter', GameCharacter.create('コマ', 1, ''));
      fixture.detectChanges();
      expect((component as unknown as Grab).turnRing().grab['clipPath']).toBeUndefined();

      const table = TestBed.inject(TabletopService).currentTable;
      table.gridType = GridType.HEX_VERTICAL;
      await Promise.resolve();
      fixture.detectChanges();

      try {
        const clipPath = (component as unknown as Grab).turnRing().grab['clipPath'];
        expect(clipPath).toMatch(/^path\(evenodd, "M 0 [\d.]+ A /);
        expect(clipPath.match(/ Z/g)).toHaveLength(2);
      } finally {
        table.gridType = GridType.SQUARE;
      }
    });

    it('keeps the ring it cut while the piece walks about', async () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.gridType = GridType.HEX_VERTICAL;
      await Promise.resolve();
      const character = GameCharacter.create('コマ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();
      const pedestals = component as unknown as Pedestals;
      const before = pedestals.pedestalStyleShown();

      perfCounters.enabled = true;
      perfCounters.clear();
      character.location.x = 300;
      character.update();
      await Promise.resolve();
      fixture.detectChanges();

      try {
        expect(pedestals.pedestalStyleShown()).toBe(before);
        expect(perfCounters.drain().get(PERF_HEX_PEDESTAL_OUTLINE) ?? 0).toBe(0);
      } finally {
        perfCounters.enabled = false;
        perfCounters.clear();
        character.destroy();
        table.gridType = GridType.SQUARE;
      }
    });

    it('cuts another ring for a piece of another size', async () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.gridType = GridType.HEX_VERTICAL;
      await Promise.resolve();
      const character = GameCharacter.create('コマ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();
      const pedestals = component as unknown as Pedestals;
      const atOne = pedestals.pedestalStyleShown();

      character.size = 3;
      character.update();
      await Promise.resolve();
      fixture.detectChanges();

      try {
        expect(pedestals.pedestalStyleShown()).not.toBe(atOne);
        expect(pedestals.pedestalStyleShown()['clipPath']).not.toBe(atOne['clipPath']);
      } finally {
        character.destroy();
        table.gridType = GridType.SQUARE;
      }
    });
  });

  it('registers its effect in the constructor, so nothing is set up outside an injection context', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  describe('character context menu display', () => {
    function pointerEvent(type: string, x: number, y: number): PointerEvent {
      return new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        button: 2,
        buttons: type === 'pointerup' ? 0 : 2,
        clientX: x,
        clientY: y,
      });
    }

    function openMenu(
      tableMode2d: boolean,
      menuStyle: 'four-way' | 'radial' | 'standard',
      size = 1,
      showRotatingName = false
    ) {
      const character = GameCharacter.create('menu-piece', size, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = tableMode2d;
      table.tabletopMenuStyle = menuStyle;
      table.radialMenuRotationSpeed = 7;
      table.multiAngleEnabled = showRotatingName;
      fixture.detectChanges();
      const diameter = size * 50;
      vi.spyOn(component.rootElementRef()!.nativeElement, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        right: 100 + diameter,
        bottom: 100 + diameter,
        left: 100,
        width: diameter,
        height: diameter,
        x: 100,
        y: 100,
      } as DOMRect);
      TestBed.inject(PointerDeviceService).primeForContextMenu(120, 160);
      vi.spyOn(TestBed.inject(TabletopOverlapService), 'findAt').mockReturnValue([]);

      component.onContextMenu(new Event('contextmenu', { cancelable: true }));
      return character;
    }

    it('uses the ordinary downward menu outside 2D mode', () => {
      const menus = TestBed.inject(ContextMenuService);
      const open = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const character = openMenu(false, 'radial');

      try {
        expect(open).toHaveBeenCalled();
        expect(openRadial).not.toHaveBeenCalled();
      } finally {
        character.destroy();
      }
    });

    it('offers to play the battle stage from the piece to a player, not to one who only watches', () => {
      const menus = TestBed.inject(ContextMenuService);
      const open = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      const names = (actions: readonly unknown[]): string[] =>
        actions.flatMap((action) => {
          const entry = action as { name?: unknown; subActions?: readonly unknown[] } | null;
          return [String(entry?.name ?? ''), ...names(entry?.subActions ?? [])];
        });
      const offersPlay = (call: number) =>
        names(open.mock.calls[call][1] as readonly unknown[]).some((name) => /battlePlay|このコマで攻撃/.test(name));
      const before = PeerCursor.myCursor;
      const cursor = before ?? PeerCursor.createMyCursor();
      const role = cursor.role;

      try {
        cursor.role = PeerRole.Player;
        openMenu(false, 'standard').destroy();
        cursor.role = PeerRole.Guest;
        openMenu(false, 'standard').destroy();

        expect(offersPlay(0)).toBe(true);
        expect(offersPlay(1)).toBe(false);
      } finally {
        cursor.role = role;
        if (!before) {
          cursor.destroy();
          PeerCursor.myCursor = before;
        }
      }
    });

    it.each(['radial', 'four-way'] as const)('opens the four-way menu when the style is %s', (style) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const character = openMenu(true, style);

      try {
        expect(openRadial).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Array),
          expect.any(Array),
          'menu-piece',
          style === 'radial',
          7,
          1,
          0,
          25
        );
      } finally {
        character.destroy();
      }
    });

    it.each([true, false])('keeps the same large-piece clearance with rotating names %s', (showRotatingName) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const character = openMenu(true, 'radial', 3, showRotatingName);

      try {
        const clearanceRadius = openRadial.mock.calls[0]?.[7];
        expect(clearanceRadius).toBeCloseTo(100.05);
      } finally {
        character.destroy();
      }
    });

    it('keeps the original 1x1 distance and passes its rendered half extent', () => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const character = openMenu(true, 'radial', 1, true);

      try {
        expect(openRadial.mock.calls[0]?.[7]).toBe(0);
        expect(openRadial.mock.calls[0]?.[8]).toBe(25);
      } finally {
        character.destroy();
      }
    });

    it('opens a 2D piece menu at the release point of a right drag', () => {
      const character = GameCharacter.create('drag-menu-piece', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.tabletopMenuStyle = 'four-way';
      fixture.detectChanges();
      const root = component.rootElementRef()!.nativeElement;
      vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        right: 150,
        bottom: 150,
        left: 100,
        width: 50,
        height: 50,
        x: 100,
        y: 100,
      } as DOMRect);
      vi.spyOn(TestBed.inject(TabletopOverlapService), 'findAt').mockReturnValue([]);
      const openRadial = vi.spyOn(TestBed.inject(ContextMenuService), 'openRadial').mockImplementation(() => undefined);

      try {
        root.dispatchEvent(pointerEvent('pointerdown', 120, 120));
        root.dispatchEvent(pointerEvent('pointermove', 360, 280));
        const centerMarker = document.querySelector<HTMLElement>('[data-piece-right-drag-center]');
        expect(centerMarker?.classList.contains('piece-right-drag-center')).toBe(true);
        expect(centerMarker?.style.left).toBe('360px');
        expect(centerMarker?.style.top).toBe('280px');
        root.dispatchEvent(pointerEvent('pointerup', 360, 280));
        const nativeMenu = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 360,
          clientY: 280,
        });
        root.dispatchEvent(nativeMenu);

        expect(openRadial).toHaveBeenCalledWith(
          { x: 360, y: 280, z: 0 },
          expect.any(Array),
          expect.any(Array),
          'drag-menu-piece',
          false,
          expect.any(Number),
          1,
          0,
          25,
          { x: 125, y: 125 }
        );
        expect(openRadial).toHaveBeenCalledTimes(1);
        expect(nativeMenu.defaultPrevented).toBe(true);
        expect(document.querySelector('[data-piece-right-drag-center]')).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('leaves an unmoved right click on the existing menu path', () => {
      const character = GameCharacter.create('click-menu-piece', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      fixture.detectChanges();
      const root = component.rootElementRef()!.nativeElement;
      vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        right: 150,
        bottom: 150,
        left: 100,
        width: 50,
        height: 50,
        x: 100,
        y: 100,
      } as DOMRect);
      vi.spyOn(TestBed.inject(TabletopOverlapService), 'findAt').mockReturnValue([]);
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);

      try {
        root.dispatchEvent(pointerEvent('pointerdown', 120, 120));
        root.dispatchEvent(pointerEvent('pointerup', 120, 120));
        expect(openRadial).not.toHaveBeenCalled();
        expect(document.querySelector('[data-piece-right-drag-center]')).toBeNull();

        TestBed.inject(PointerDeviceService).primeForContextMenu(120, 120);
        component.onContextMenu(new Event('contextmenu', { cancelable: true }));
        expect(openRadial).toHaveBeenCalledWith(
          { x: 125, y: 125 },
          expect.any(Array),
          expect.any(Array),
          'click-menu-piece',
          false,
          5,
          1,
          0,
          25
        );
      } finally {
        character.destroy();
      }
    });

    it('does not replace the 3D table right drag with a piece menu', () => {
      const character = GameCharacter.create('3d-menu-piece', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      TestBed.inject(TabletopService).currentTable.mode2d = false;
      fixture.detectChanges();
      const root = component.rootElementRef()!.nativeElement;
      const menus = TestBed.inject(ContextMenuService);
      const open = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);

      try {
        root.dispatchEvent(pointerEvent('pointerdown', 120, 120));
        root.dispatchEvent(pointerEvent('pointermove', 360, 280));
        root.dispatchEvent(pointerEvent('pointerup', 360, 280));

        expect(open).not.toHaveBeenCalled();
        expect(openRadial).not.toHaveBeenCalled();
      } finally {
        character.destroy();
      }
    });
  });

  describe('which way a piece faces', () => {
    function tableShowing(mark: 'none' | 'turn' | 'arrow', mode2d: boolean): void {
      const table = TestBed.inject(TabletopService).currentTable;
      TestBed.inject(ViewModePreferenceService).choose(mode2d ? 'flat' : 'perspective');
      table.facingMark = mark;
    }

    function place(rotate = 0): GameCharacter {
      const character = GameCharacter.create('向き', 1, '');
      character.rotate = rotate;
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();
      return character;
    }

    function arrow(): SVGElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector<SVGElement>('[data-testid="facing-arrow"]');
    }

    it('takes the room over the table where the room has said which way it shows', () => {
      tableShowing('none', true);
      Config.instance.facingMark = 'arrow';
      place(90);

      expect(component.facingMark()).toBe('arrow');
      expect(arrow()).not.toBeNull();

      Config.instance.facingMark = null;
      TestBed.inject(ObjectChangeService).notifyChanged('Config');
      fixture.detectChanges();

      expect(component.facingMark()).toBe('none');
    });

    it('holds a piece still from above while the table shows nothing', () => {
      tableShowing('none', true);
      place();

      expect(component.canTurn()).toBe(false);
      expect(arrow()).toBeNull();
    });

    it('hands the handles back once the table shows facing', () => {
      tableShowing('turn', true);
      place();

      expect(component.canTurn()).toBe(true);
    });

    it('suppresses whole-piece turning only in this browser while its name orbit is enabled', () => {
      tableShowing('turn', true);
      const table = TestBed.inject(TabletopService).currentTable;
      table.multiAngleEnabled = true;
      place();

      expect(component.facingMark()).toBe('none');
      expect(component.canTurn()).toBe(false);
      expect(table.facingMark).toBe('turn');
    });

    it('shows the same mark on a table seen from the side', () => {
      tableShowing('arrow', false);
      place(45);

      expect(component.showFacingArrow()).toBe(true);
      expect(arrow()).not.toBeNull();
      expect(component.canTurn()).toBe(true);
    });

    it('moves the arrow outside the rotating resource gauge', () => {
      tableShowing('arrow', true);
      const table = TestBed.inject(TabletopService).currentTable;
      table.multiAngleEnabled = true;
      table.multiAngleResourceBuffEnabled = true;
      place();

      const baseOffset = Math.round(component.gridSize * 0.06);
      const gauge = component.multiAngleResourceGaugeLayout();
      expect(gauge.segments.length).toBeGreaterThan(0);
      expect(component.facingArrowOffsetPx()).toBe(baseOffset + gauge.strokeWidth);
    });
  });

  describe('what shows above a piece', () => {
    it('gives a character bars for the usual two resources', () => {
      const character = GameCharacter.create('ゲージ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.pieceGauges().map((gauge) => gauge.name)).toEqual(['HP', 'MP']);
        expect(component.pieceGauges()[0]).toMatchObject({ initial: 'H', ratio: 1 });
      } finally {
        character.destroy();
      }
    });

    it('draws no bars and no buffs while this seat has them switched off from the toolbar', () => {
      const character = GameCharacter.create('スイッチ', 1, '');
      character.addExtendData();
      character.buffs.addRound('加速', '', 2);
      fixture.componentRef.setInput('gameCharacter', character);
      const overlay = TestBed.inject(PieceOverlayPreferenceService);

      try {
        expect(component.pieceGauges()).toHaveLength(2);
        expect(component.hideBuff()).toBe(false);

        overlay.toggleResourceBars();
        overlay.toggleBuffs();
        expect(component.pieceGauges()).toEqual([]);
        expect(component.hideBuff()).toBe(true);

        overlay.toggleResourceBars();
        overlay.toggleBuffs();
        expect(component.pieceGauges()).toHaveLength(2);
        expect(component.hideBuff()).toBe(false);
      } finally {
        localStorage.removeItem('ui-piece-overlay');
        character.destroy();
      }
    });

    it('keeps the readings back from whoever the piece is not open to', () => {
      const character = GameCharacter.create('秘密', 1, '');
      character.disclosureMode = DisclosureMode.GameMaster;
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.gaugeNumbersReadable()).toBe(false);
        expect(component.gaugeRows().map((row) => row.numbers)).toEqual(['???/???', '???/???']);
        // The bar itself still stands, since how full it is can be guessed at anyway.
        expect(component.gaugeRows()[0].gauge.ratio).toBe(1);
      } finally {
        character.destroy();
      }
    });

    it('reads the numbers out for a piece the room may look at', () => {
      const character = GameCharacter.create('公開', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.gaugeNumbersReadable()).toBe(true);
        expect(component.gaugeRows()[0].numbers).toMatch(/^\d+\/\d+$/);
      } finally {
        character.destroy();
      }
    });

    it('takes a resource off the piece once its bar is turned off', () => {
      const character = GameCharacter.create('ゲージ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;

      try {
        expect(component.pieceGauges()).toHaveLength(2);

        hp.removeAttribute(DataElementAttribute.PIECE_GAUGE);
        objectChange.notifyChanged(hp.identifier);

        expect(component.pieceGauges().map((gauge) => gauge.name)).toEqual(['MP']);
      } finally {
        character.destroy();
      }
    });

    it('folds the buffs into icons with their strength', () => {
      const character = GameCharacter.create('バフ', 1, '');
      character.addExtendData();
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const buffRoot = character.buffDataElement!;
      const container = DataElement.create('バフ', '', {});
      buffRoot.appendChild(container);
      const buff = DataElement.create('毒', 3, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: 'ダメージ2',
      });
      buff.setAttribute(DataElementAttribute.BUFF_ICON, '☠️');
      container.appendChild(buff);
      objectChange.notifyChanged(buffRoot.identifier);

      try {
        expect(component.buffBadges()).toEqual([
          expect.objectContaining({ icon: '☠️', name: '毒', strength: '2', rounds: 3 }),
        ]);
      } finally {
        character.destroy();
      }
    });

    it('lays the buff icons out in as many columns as the panel is reckoned by', () => {
      const character = GameCharacter.create('バフ', 1, '');
      character.addExtendData();
      character.location = { name: 'table', x: 0, y: 0 };
      fixture.componentRef.setInput('gameCharacter', character);
      const container = DataElement.create('バフ', '', {});
      character.buffDataElement!.appendChild(container);
      for (let index = 0; index < 7; index++) {
        container.appendChild(DataElement.create(`加護${index}`, 2, { type: DataElementType.NUMBER_RESOURCE }));
      }
      TestBed.inject(ObjectChangeService).notifyChanged(character.buffDataElement!.identifier);

      try {
        fixture.detectChanges();
        const grid = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
          '[data-testid="buff-badge-grid"]'
        );

        expect(grid?.style.gridTemplateColumns).toBe(`repeat(${BUFF_BADGES_PER_ROW}, minmax(0, 1fr))`);
      } finally {
        character.destroy();
      }
    });

    it('leaves its bars alone when data is added to another piece', () => {
      const character = GameCharacter.create('こちら', 1, '');
      const other = GameCharacter.create('あちら', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        const gauges = component.pieceGauges();

        other.detailDataElement!.appendChild(DataElement.create('メモ', 'なし', {}));

        expect(component.pieceGauges()).toBe(gauges);
      } finally {
        character.destroy();
        other.destroy();
      }
    });

    it('takes its bars down once its detail is taken away', () => {
      const character = GameCharacter.create('ゲージ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.pieceGauges()).toHaveLength(2);

        character.detailDataElement!.destroy();

        expect(component.pieceGauges()).toEqual([]);
      } finally {
        character.destroy();
      }
    });

    describe('what the bars, buff icons and resource readings are worked out from', () => {
      const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

      const walksUnder = (element: DataElement) => {
        const readChildren = Object.getOwnPropertyDescriptor(DataElement.prototype, 'children')!.get!;
        const counter = { walks: 0 };
        Object.defineProperty(element, 'children', {
          configurable: true,
          get() {
            counter.walks++;
            return readChildren.call(element);
          },
        });
        return counter;
      };

      const resourceSnapshot = () => component['resourceSnapshot']();

      const pieceWithBuff = async () => {
        const character = GameCharacter.create('ゲージ', 1, '');
        character.addExtendData();
        const buff = DataElement.create('毒', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: 'ダメージ2' });
        character.buffDataElement!.appendChild(buff);
        fixture.componentRef.setInput('gameCharacter', character);
        await settle();
        const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;
        return { character, buff, hp };
      };

      it('walks nothing again while the piece is dragged about', async () => {
        const { character } = await pieceWithBuff();
        const objectChange = TestBed.inject(ObjectChangeService);

        try {
          const gauges = component.pieceGauges();
          const badges = component.buffBadges();
          const snapshot = resourceSnapshot();
          const detailWalks = walksUnder(character.detailDataElement!);
          const buffWalks = walksUnder(character.buffDataElement!);
          const pieceVersion = objectChange.versionOf(character.identifier)();

          character.location.x = 120;
          character.location.y = 80;
          character.posZ = 0;
          await settle();

          expect(objectChange.versionOf(character.identifier)()).toBeGreaterThan(pieceVersion);
          expect(component.pieceGauges()).toBe(gauges);
          expect(component.buffBadges()).toBe(badges);
          expect(resourceSnapshot()).toBe(snapshot);
          expect(detailWalks.walks).toBe(0);
          expect(buffWalks.walks).toBe(0);
        } finally {
          character.destroy();
        }
      });

      it('moves a bar and its reading when the value behind it changes', async () => {
        const { character, hp } = await pieceWithBuff();

        try {
          const gauges = component.pieceGauges();
          const snapshot = resourceSnapshot();
          const lowered = Number(hp.currentValue) - 1;

          hp.currentValue = lowered;
          await settle();

          expect(component.pieceGauges()).not.toBe(gauges);
          expect(component.pieceGauges().find((gauge) => gauge.identifier === hp.identifier)?.current).toBe(lowered);
          expect(resourceSnapshot().get(hp.identifier)?.current).toBe(lowered);
          expect(resourceSnapshot()).not.toBe(snapshot);
        } finally {
          character.destroy();
        }
      });

      it('shows a buff once it is put on the piece', async () => {
        const { character } = await pieceWithBuff();

        try {
          expect(component.buffBadges().map((badge) => badge.name)).toEqual(['毒']);

          character.buffDataElement!.appendChild(
            DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE, currentValue: '+1' })
          );
          await settle();

          expect(component.buffBadges().map((badge) => badge.name)).toEqual(['毒', '加護']);
        } finally {
          character.destroy();
        }
      });

      it('draws its bars from a detail put in place of the old one', async () => {
        const { character } = await pieceWithBuff();

        try {
          expect(component.pieceGauges().map((gauge) => gauge.name)).toEqual(['HP', 'MP']);

          const root = character.rootDataElement!;
          character.detailDataElement!.destroy();
          const detail = DataElement.create('detail', '', {});
          const sp = DataElement.create('SP', 5, { type: DataElementType.NUMBER_RESOURCE, currentValue: '4' });
          sp.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
          detail.appendChild(sp);
          root.appendChild(detail);
          await settle();

          expect(component.pieceGauges().map((gauge) => gauge.name)).toEqual(['SP']);
          expect([...resourceSnapshot().keys()]).toEqual([sp.identifier]);
        } finally {
          character.destroy();
        }
      });

      it('keeps the same bars while only a buff changes', async () => {
        const { character, buff } = await pieceWithBuff();

        try {
          const gauges = component.pieceGauges();

          buff.value = 2;
          await settle();

          expect(component.buffBadges()[0].rounds).toBe(2);
          expect(component.pieceGauges()).toBe(gauges);
        } finally {
          character.destroy();
        }
      });

      it('keeps the same buff icons while only a bar moves', async () => {
        const { character, hp } = await pieceWithBuff();

        try {
          const badges = component.buffBadges();
          const gauges = component.pieceGauges();

          hp.currentValue = Number(hp.currentValue) - 1;
          await settle();

          expect(component.pieceGauges()).not.toBe(gauges);
          expect(component.buffBadges()).toBe(badges);
        } finally {
          character.destroy();
        }
      });
    });

    describe('the buffs as the switch for how they show', () => {
      beforeEach(() => TestBed.inject(BuffViewPreferenceService).set('icon'));

      const bearBuff = () => {
        const character = GameCharacter.create('バフ', 1, '');
        character.addExtendData();
        fixture.componentRef.setInput('gameCharacter', character);
        const buffRoot = character.buffDataElement!;
        buffRoot.appendChild(
          DataElement.create('毒', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: 'ダメージ2' })
        );
        TestBed.inject(ObjectChangeService).notifyChanged(buffRoot.identifier);
        fixture.detectChanges();
        return character;
      };

      const root = () => fixture.nativeElement as HTMLElement;
      const switchButton = () => root().querySelector('[data-testid="buff-view-switch"]') as HTMLButtonElement;

      it('draws the icons at the size this reader chose', () => {
        const preference = TestBed.inject(BuffViewPreferenceService);
        const character = bearBuff();
        const grid = () => root().querySelector('[data-testid="buff-badge-grid"]') as HTMLElement;

        try {
          expect(grid().style.fontSize).toBe('1em');

          preference.setIconScale(150);
          fixture.detectChanges();
          expect(grid().style.fontSize).toBe('1.5em');
        } finally {
          preference.setIconScale(100);
          character.destroy();
        }
      });

      it('carries the display on to the next type at every press', () => {
        const character = bearBuff();

        try {
          expect(root().querySelector('[data-testid="buff-badge"]')).not.toBeNull();

          switchButton().click();
          fixture.detectChanges();
          expect(root().querySelector('[data-testid="buff-badge-grid"]')).toBeNull();
          expect(root().querySelector('[game-data-element-buff]')).not.toBeNull();

          switchButton().click();
          fixture.detectChanges();
          expect(root().querySelector('[game-data-element-buff]')).toBeNull();

          switchButton().click();
          fixture.detectChanges();
          expect(root().querySelector('[data-testid="buff-badge"]')).not.toBeNull();
        } finally {
          character.destroy();
        }
      });

      it('names the type on show', () => {
        const character = bearBuff();

        try {
          expect(switchButton().getAttribute('title')).toContain('アイコン');
        } finally {
          character.destroy();
        }
      });

      it('opens on the display the table is set to', () => {
        TestBed.inject(BuffViewPreferenceService).set('count');
        const character = bearBuff();

        try {
          expect(root().querySelector('[data-testid="buff-badge"]')).toBeNull();
          expect(switchButton().getAttribute('title')).toContain('個数');
        } finally {
          character.destroy();
        }
      });

      it('gives its own display up when the table turns over to another', () => {
        const preference = TestBed.inject(BuffViewPreferenceService);
        const character = bearBuff();

        try {
          switchButton().click();
          fixture.detectChanges();
          expect(switchButton().getAttribute('title')).toContain('詳細');

          preference.set('count');
          fixture.detectChanges();

          expect(switchButton().getAttribute('title')).toContain('個数');
        } finally {
          character.destroy();
        }
      });

      it('turns over on the press, so nothing that pops up before the release can eat it', () => {
        const character = bearBuff();

        try {
          switchButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
          fixture.detectChanges();
          expect(switchButton().getAttribute('title')).toContain('詳細');

          switchButton().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          fixture.detectChanges();
          expect(switchButton().getAttribute('title')).toContain('詳細');
        } finally {
          character.destroy();
        }
      });

      it('leaves the right button to the menu', () => {
        const character = bearBuff();
        let reached = 0;
        const count = () => reached++;
        root().addEventListener('mousedown', count);

        try {
          switchButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
          fixture.detectChanges();

          expect(switchButton().getAttribute('title')).toContain('アイコン');
          expect(reached).toBe(1);
        } finally {
          root().removeEventListener('mousedown', count);
          character.destroy();
        }
      });

      it('keeps the press off the piece, so it is no drag', () => {
        const character = bearBuff();
        let reached = 0;
        const count = () => reached++;
        root().addEventListener('mousedown', count);

        try {
          switchButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
          expect(reached).toBe(0);
        } finally {
          root().removeEventListener('mousedown', count);
          character.destroy();
        }
      });
    });
  });

  describe('showing a resource change', () => {
    it('shows a red number and a flash of damage as a value falls', async () => {
      const character = GameCharacter.create('被弾', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;

      try {
        fixture.detectChanges();
        expect(component.floatingChanges()).toEqual([]);

        hp.currentValue = 170;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        expect(component.floatingChanges()).toEqual([
          expect.objectContaining({ kind: 'damage', label: '-30', name: 'HP' }),
        ]);
        expect(component.hitFlash()).toBe('damage');
      } finally {
        character.destroy();
      }
    });

    it('stays quiet for a value replaced by a load or a sync', async () => {
      const character = GameCharacter.create('復元', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;

      try {
        fixture.detectChanges();

        // Loading a room, restoring an autosave and syncing from a peer all come in through the
        // apply rather than the setter, and none of them is a change to show.
        const context = hp.toContext();
        (context.syncData as Record<string, unknown>)['currentValue'] = 999;
        context.majorVersion += 1;
        hp.apply(context);
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        expect(component.floatingChanges()).toEqual([]);
        expect(component.hitFlash()).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('shows a green number and a flash of healing as it rises', async () => {
      const character = GameCharacter.create('回復', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;
      hp.currentValue = 100;

      try {
        fixture.detectChanges();
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();
        component.floatingChanges.set([]);

        hp.currentValue = 160;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        expect(component.floatingChanges()).toEqual([
          expect.objectContaining({ kind: 'heal', label: '+60', name: 'HP' }),
        ]);
        expect(component.hitFlash()).toBe('heal');
      } finally {
        character.destroy();
      }
    });

    it('picks the sound by how large the change is', async () => {
      const character = GameCharacter.create('鳴り分け', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;
      const played: string[] = [];
      const kinds: (VolumeType | undefined)[] = [];
      vi.spyOn(SoundEffect, 'playLocal').mockImplementation((arg, kind) => {
        played.push(typeof arg === 'string' ? arg : arg.identifier);
        kinds.push(kind);
      });

      try {
        fixture.detectChanges();

        hp.currentValue = 190;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        hp.currentValue = 130;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        hp.currentValue = 10;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        expect(played).toEqual([PresetSound.damageSmall, PresetSound.damageMedium, PresetSound.damageLarge]);
        expect(kinds).toEqual([VolumeType.EFFECT, VolumeType.EFFECT, VolumeType.EFFECT]);
      } finally {
        character.destroy();
      }
    });

    it('sounds like a machine when the resource asks for it', async () => {
      const character = GameCharacter.create('自律機械', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;
      hp.setAttribute(DataElementAttribute.CHANGE_SOUND_SET, 'mech');
      const played: string[] = [];
      vi.spyOn(SoundEffect, 'playLocal').mockImplementation((arg) => {
        played.push(typeof arg === 'string' ? arg : arg.identifier);
      });
      const sounds = { damageLarge: PresetSound.damageLarge, mechDamageLarge: PresetSound.mechDamageLarge };
      PresetSound.damageLarge = 'flesh-damage-large';
      PresetSound.mechDamageLarge = 'mech-damage-large';

      try {
        fixture.detectChanges();

        hp.currentValue = 10;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        expect(played).toEqual(['mech-damage-large']);
      } finally {
        Object.assign(PresetSound, sounds);
        character.destroy();
      }
    });

    it('counts a rise as damage on a resource that runs the other way', async () => {
      const character = GameCharacter.create('狂気', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const hp = DataElement.findElementByReference(character.rootDataElement!, 'HP')!;
      hp.setAttribute(DataElementAttribute.GAUGE_INVERTED, 'true');
      const played: string[] = [];
      vi.spyOn(SoundEffect, 'playLocal').mockImplementation((arg) => {
        played.push(typeof arg === 'string' ? arg : arg.identifier);
      });

      try {
        fixture.detectChanges();

        hp.currentValue = 260;
        objectChange.notifyChanged(hp.identifier);
        await fixture.whenStable();

        expect(component.floatingChanges()).toEqual([
          expect.objectContaining({ kind: 'damage', label: '+60', name: 'HP' }),
        ]);
        expect(component.hitFlash()).toBe('damage');
        expect(played).toEqual([PresetSound.damageLarge]);
      } finally {
        character.destroy();
      }
    });

    it('stays quiet for the portrait slot and the piece image', async () => {
      const character = GameCharacter.create('立ち絵', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      character.addExtendData();
      const played: string[] = [];
      vi.spyOn(SoundEffect, 'playLocal').mockImplementation((arg) => {
        played.push(typeof arg === 'string' ? arg : arg.identifier);
      });

      try {
        fixture.detectChanges();

        character.portraitPosition = 7;
        const pos = character.detailDataElement!.getFirstElementByName('POS')!;
        objectChange.notifyChanged(pos.identifier);
        await fixture.whenStable();

        const icon = character.detailDataElement!.getFirstElementByName('ICON')!;
        icon.currentValue = 3;
        objectChange.notifyChanged(icon.identifier);
        await fixture.whenStable();

        expect(component.floatingChanges()).toEqual([]);
        expect(component.hitFlash()).toBeNull();
        expect(played).toEqual([]);
      } finally {
        character.destroy();
      }
    });

    it('shows nothing when nothing changed', async () => {
      const character = GameCharacter.create('無変化', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);

      try {
        fixture.detectChanges();
        objectChange.notifyChanged(character.identifier);
        await fixture.whenStable();

        expect(component.floatingChanges()).toEqual([]);
        expect(component.hitFlash()).toBeNull();
      } finally {
        character.destroy();
      }
    });
  });

  it('asks for no change detector', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).changeDetector).toBeUndefined();
  });

  it('computes whether it is targeted', () => {
    expect(typeof component.isTargeted).toBe('function');
  });

  describe('the ring on the piece everyone is looking out of', () => {
    const ringOf = () => fixture.nativeElement.querySelector('[data-testid="shared-view-ring"]');

    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.width = 12;
      table.height = 12;
      table.gridSize = 50;
      table.initialize();
    });

    afterEach(() => table.destroy());

    function shareView(identifier: string): void {
      table.sharedViewPiece = identifier;
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);
      fixture.detectChanges();
    }

    it('marks the piece the table names, and lets it go again', () => {
      const character = GameCharacter.create('共有コマ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        expect(ringOf()).toBeNull();

        shareView(character.identifier);
        expect(ringOf()).toBeTruthy();

        shareView('');
        expect(ringOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('leaves every other piece unmarked', () => {
      const character = GameCharacter.create('よそのコマ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        shareView('somebody-else');

        expect(ringOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });
  });

  describe('what the character says', () => {
    let tab: ChatTab;

    beforeEach(() => {
      vi.useFakeTimers();
      ChatTabList.instance.initialize();
      tab = new ChatTab();
      tab.initialize();
      ChatTabList.instance.appendChild(tab);
      vi.spyOn(TestBed.inject(ChatClockService), 'now').mockImplementation(() => Date.now());
    });

    afterEach(() => {
      TestBed.inject(SpeechBubbleService).clear();
      for (const chatTab of [...ChatTabList.instance.chatTabs]) chatTab.destroy();
      localStorage.removeItem('ui-piece-overlay');
      vi.useRealTimers();
    });

    const bubbleOf = () => fixture.nativeElement.querySelector('[data-testid="speech-bubble"]') as HTMLElement | null;

    it('shows over the piece, kept from a screen reader, and not while this seat hides it', () => {
      const character = GameCharacter.create('話者', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        tab.addMessage({
          from: 'me',
          sendFrom: character.identifier,
          name: '話者',
          text: '手を振る。「やあ」',
          timestamp: Date.now(),
        });
        vi.advanceTimersByTime(SPEECH_BUBBLE_WAIT_MS);
        fixture.detectChanges();

        expect(bubbleOf()?.textContent?.trim()).toBe('やあ');
        expect(bubbleOf()?.closest('[aria-hidden="true"]')).toBeTruthy();

        TestBed.inject(PieceOverlayPreferenceService).toggleSpeech();
        fixture.detectChanges();
        expect(bubbleOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });
  });

  describe('the target marker', () => {
    const setTargeted = (character: GameCharacter, targeted: boolean) => {
      character.targeted = targeted;
      TestBed.inject(UiSignalService).notifyTargetChange(character.identifier, character.aliasName);
      fixture.detectChanges();
    };

    const markerOf = () => fixture.nativeElement.querySelector('[data-testid="target-marker"]');

    const ringOf = () => fixture.nativeElement.querySelector('[data-testid="target-ring"]');

    it('appears on a target and goes with it', () => {
      const character = GameCharacter.create('marker', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        expect(markerOf()).toBeNull();

        setTargeted(character, true);
        expect(markerOf()).toBeTruthy();

        setTargeted(character, false);
        expect(markerOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('brings the ring at its foot with it', () => {
      const character = GameCharacter.create('marker-ring', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        expect(ringOf()).toBeNull();

        setTargeted(character, true);
        expect(ringOf()).toBeTruthy();

        setTargeted(character, false);
        expect(ringOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('appears even on a character whose buffs are hidden', () => {
      const character = GameCharacter.create('marker-hidden-buff', 1, '');
      character.addExtendData();
      character.hideBuff = true;
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        setTargeted(character, true);
        expect(markerOf()).toBeTruthy();
      } finally {
        character.destroy();
      }
    });
  });

  describe('the handles that turn and tip a piece over', () => {
    const headOf = () => fixture.nativeElement.querySelector('[data-testid="roll-grab-head"]') as HTMLElement | null;
    const footOf = () => fixture.nativeElement.querySelector('[data-testid="roll-grab-foot"]') as HTMLElement | null;
    const testOf = (testId: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    type Handles = {
      turnRotable(): RotableDirective | undefined;
      rollRotable(): RotableDirective | undefined;
      turnTicks(): { x: number; y: number }[];
      rollGauge(): { degrees: number; wedge: string };
    };
    const handles = () => component as unknown as Handles;

    /** Has the handle of that kind turn the piece, as its directive reports a turn under way. */
    function hold(kind: 'turn' | 'roll', angle = 0): void {
      const directive = (kind === 'turn' ? handles().turnRotable() : handles().rollRotable())!;
      (directive as unknown as { inTurn: WritableSignal<boolean> }).inTurn.set(true);
      TestBed.inject(RotationGuideService).report(directive, { angle, step: 45, snapping: false });
    }

    /** Has the table draw the piece's picture standing, as a sprite of its own. */
    function drawPicture(character: GameCharacter): void {
      const picture = { id: `${character.identifier}#picture`, owner: character.identifier, hidden: false };
      vi.spyOn(TestBed.inject(TablePiecesService), 'sprites').mockReturnValue([picture as unknown as TableWorldSprite]);
    }

    /** Ends whatever turn either handle has under way. */
    function letGo(): void {
      for (const directive of [handles().turnRotable(), handles().rollRotable()]) directive?.cancel();
    }

    afterEach(() => ImageStorage.instance.delete('roll-grab-url'));

    function withPicture(name: string, size = 1): GameCharacter {
      ImageStorage.instance.add('roll-grab-url');
      const character = GameCharacter.create(name, size, 'roll-grab-url');
      fixture.componentRef.setInput('gameCharacter', character);
      return character;
    }

    function choose(_character: GameCharacter): void {
      fixture.detectChanges();
    }

    it('lays the ring, its knob and the handle that tips the piece by it, for the pointer to bring out, and none on a piece locked', () => {
      const character = withPicture('roll-grab-shown');

      try {
        choose(character);
        expect(testOf('turn-ring')).not.toBeNull();
        expect(testOf('turn-grab')?.className).toContain('group-hover:opacity-85');
        expect(headOf()?.className).toContain('group-hover:opacity-85');
        expect(footOf()).toBeNull();

        character.isLock = true;
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        fixture.detectChanges();
        expect(testOf('turn-grab')).toBeNull();
        expect(headOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('stands the one that tips it beside the top of the picture, clear of it by half its size and a gap', () => {
      const character = withPicture('roll-grab');

      try {
        choose(character);
        // Half the handle (14), then the gap (7).
        expect((component as unknown as { rollHandles(): unknown }).rollHandles()).toEqual([
          { testId: 'roll-grab-head', corner: 1, dx: 21, dy: 14 },
        ]);
        expect(headOf()?.style.left).toBe(`${21 - 14}px`);
      } finally {
        character.destroy();
      }
    });

    it('reads the angle out under the pedestal while it is turned', () => {
      const character = withPicture('turn-readout');
      character.rotate = 90;

      try {
        choose(character);
        expect(fixture.nativeElement.querySelectorAll('[data-testid="turn-tick"]')).toHaveLength(0);
        expect(testOf('turn-readout')).toBeNull();

        hold('turn', 90);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('[data-testid="turn-tick"]').length).toBeGreaterThan(0);
        expect(testOf('turn-readout')?.textContent?.trim()).toBe('90°');

        letGo();
        fixture.detectChanges();
        expect(testOf('turn-readout')).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('keeps the knob it is turned by and the handle it is tipped by drawn while either is held, and no longer once broken off', () => {
      const character = withPicture('handles-held');

      try {
        choose(character);
        hold('turn');
        fixture.detectChanges();
        expect(testOf('turn-grab')?.classList.contains('opacity-100!')).toBe(true);
        expect(headOf()?.classList.contains('opacity-100!')).toBe(false);
        handles().turnRotable()!.cancel();
        fixture.detectChanges();
        expect(testOf('turn-grab')?.classList.contains('opacity-100!')).toBe(false);
        hold('roll');
        fixture.detectChanges();
        expect(testOf('turn-grab')?.classList.contains('opacity-100!')).toBe(false);
        expect(headOf()?.classList.contains('opacity-100!')).toBe(true);
        letGo();
      } finally {
        character.destroy();
      }
    });

    it('reads how far the piece leans either way of upright while it is tipped, and stands it upright on a double click', () => {
      const character = withPicture('roll-gauge');

      try {
        choose(character);
        character.roll = 330;
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        expect(handles().rollGauge().degrees).toBe(-30);
        expect(handles().rollGauge().wedge).toMatch(/ 0 0 0 /);

        character.roll = 30;
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        expect(handles().rollGauge().degrees).toBe(30);
        expect(handles().rollGauge().wedge).toMatch(/ 0 0 1 /);
        hold('roll');
        fixture.detectChanges();
        expect(testOf('roll-readout')?.textContent?.trim()).toBe('30°');

        headOf()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(character.roll).toBe(0);
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        expect(handles().rollGauge().wedge).toBe('');
      } finally {
        character.destroy();
      }
    });

    it('draws the handles one size whatever the size of the piece', () => {
      const sizeOf = (pieceSize: number) => {
        const character = GameCharacter.create('roll-grab-size', pieceSize, '');
        fixture.componentRef.setInput('gameCharacter', character);
        try {
          return { handle: component.rollHandleSizePx(), icon: component.rollHandleIconSizePx() };
        } finally {
          character.destroy();
        }
      };

      for (const pieceSize of [0.5, 1, 2, 4]) expect(sizeOf(pieceSize)).toEqual({ handle: 28, icon: 24 });
    });

    it('puts a knob on the side of the ring the piece faces and one behind it, which turn with the piece and tell which way it faces', () => {
      const character = withPicture('turn-knob');
      type Knob = { turnRing(): { knobs: { x: number; y: number; facing: boolean }[]; radius: number } };
      const knob = () => component as unknown as Knob;

      try {
        choose(character);
        const [front, back] = knob().turnRing().knobs;
        const radius = knob().turnRing().radius;
        expect(front).toMatchObject({ facing: true });
        expect(front!.y).toBeCloseTo(25 - radius, 6);
        expect(back).toMatchObject({ facing: false });
        expect(back!.y).toBeCloseTo(25 + radius, 6);
        const shown = fixture.nativeElement.querySelectorAll('[data-testid="turn-grab"]');
        expect(shown).toHaveLength(2);
        expect(shown[0].getAttribute('data-facing')).toBe('true');
        expect(shown[0].classList.contains('bg-ui-accent-solid')).toBe(true);
        expect(shown[1].hasAttribute('data-facing')).toBe(false);

        character.rotate = 90;
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        expect(knob().turnRing().knobs[0]!.y).toBeCloseTo(25 - radius, 6);
      } finally {
        character.destroy();
      }
    });

    it('draws the ring and its knobs round the piece, leaving out what the piece hides while the handles are out', () => {
      const character = withPicture('turn-ring-hidden');
      drawPicture(character);
      type Ring = { hovered: { set(value: boolean): void }; turnRing(): { arc: string; radius: number } };
      const ring = () => component as unknown as Ring;
      const hides = vi.fn((_surface: string, _x: number, y: number) => y < 24.5);
      const sightOf = vi
        .spyOn(TestBed.inject(TablePickService), 'pictureSightOf')
        .mockReturnValue({ hides, cornerOnPage: () => ({ x: -1000, y: -1000 }) });

      try {
        choose(character);
        expect(ring().turnRing().arc).toMatch(/ A/);
        expect(sightOf).not.toHaveBeenCalled();

        expect(fixture.nativeElement.querySelectorAll('[data-testid="turn-grab"]')).toHaveLength(2);
        ring().hovered.set(true);
        const arc = ring().turnRing().arc;
        expect(arc).not.toMatch(/A/);
        expect(arc.match(/M/g)).toHaveLength(1);
        expect(hides).toHaveBeenCalled();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('[data-testid="turn-grab"]')).toHaveLength(1);

        hold('turn');
        fixture.detectChanges();
        expect(handles().turnTicks()).toHaveLength(5);
        letGo();
      } finally {
        character.destroy();
      }
    });

    it('lets a knob give way where the handle that tips the piece is drawn, but keeps both, unweighed, while the piece is turned', () => {
      const character = withPicture('knob-gives-way');
      drawPicture(character);
      const pick = TestBed.inject(TablePickService);
      const cornerOnPage = vi.fn(() => ({ x: 100, y: 100 }));
      vi.spyOn(pick, 'pictureSightOf').mockReturnValue({ hides: () => false, cornerOnPage });
      vi.spyOn(TestBed.inject(TableSurfaceService), 'pageOf').mockImplementation((_surface, _x, y) =>
        y < 25 ? { x: 118, y: 112 } : { x: 0, y: 300 }
      );
      const knobs = () => [...fixture.nativeElement.querySelectorAll('[data-testid="turn-grab"]')] as HTMLElement[];

      try {
        choose(character);
        expect(knobs()).toHaveLength(2);
        (component as unknown as { hovered: { set(value: boolean): void } }).hovered.set(true);
        fixture.detectChanges();
        expect(knobs()).toHaveLength(1);
        expect(knobs()[0]!.hasAttribute('data-facing')).toBe(false);

        hold('turn');
        fixture.detectChanges();
        expect(knobs()).toHaveLength(2);
        cornerOnPage.mockClear();
        character.rotate = 45;
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        fixture.detectChanges();
        expect(knobs()).toHaveLength(2);
        expect(cornerOnPage).not.toHaveBeenCalled();
        letGo();
      } finally {
        character.destroy();
      }
    });

    it('marks the ring at the table’s own directions a held Alt turns the piece to, by its grid', async () => {
      const character = withPicture('turn-steps');
      const table = TestBed.inject(TabletopService).currentTable;
      character.rotate = 10;
      TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);

      try {
        choose(character);
        const radius = (component as unknown as { turnRing(): { radius: number } }).turnRing().radius;
        const [first] = handles().turnTicks();
        expect(handles().turnTicks()).toHaveLength(8);
        expect(first!.x).toBeCloseTo(radius + radius * Math.sin((-10 * Math.PI) / 180), 6);

        table.gridType = GridType.HEX_VERTICAL;
        await Promise.resolve();
        fixture.detectChanges();
        expect(handles().turnTicks()).toHaveLength(12);
      } finally {
        table.gridType = GridType.SQUARE;
        character.destroy();
      }
    });

    it('weighs nothing round the pedestal while the piece is carried, and the ring at the pedestal of a piece raised off it', () => {
      const character = withPicture('turn-carried');
      drawPicture(character);
      character.altitude = 2;
      const hides = vi.fn((_surface: string, _x: number, _y: number, _height?: number) => false);
      const sightOf = vi
        .spyOn(TestBed.inject(TablePickService), 'pictureSightOf')
        .mockReturnValue({ hides, cornerOnPage: () => ({ x: -1000, y: -1000 }) });
      type Carry = { hovered: { set(value: boolean): void }; turnRingSeen(): unknown };
      const carry = () => component as unknown as Carry;
      const heldPiece = TestBed.inject(HeldPieceService);

      try {
        choose(character);
        carry().hovered.set(true);
        heldPiece.take({
          identifier: character.identifier,
          x: 0,
          y: 0,
          widthPx: 50,
          heightPx: 50,
          altitude: 2,
          gridSize: 50,
          liftable: true,
        });
        carry().turnRingSeen();
        expect(sightOf).not.toHaveBeenCalled();

        heldPiece.letGo(character.identifier);
        carry().turnRingSeen();
        expect(sightOf).toHaveBeenCalled();
        expect(hides.mock.calls[0]![3]).toBe(TestBed.inject(TablePiecesService).footOf(character).height);
      } finally {
        character.destroy();
      }
    });

    it('shows a seat only watching no handles, and lets no double click of it stand the piece upright', () => {
      const character = withPicture('turn-watching');
      character.roll = 30;
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);

      try {
        choose(character);
        expect(testOf('turn-grab')).toBeNull();
        expect(headOf()).toBeNull();
        (component as unknown as { standUpright(event: MouseEvent): void }).standUpright(new MouseEvent('dblclick'));
        expect(character.roll).toBe(30);
      } finally {
        character.destroy();
      }
    });

    it('brings out the handles of the piece last touched on a touch screen, and weighs what its picture hides, until it is in hand', () => {
      const character = withPicture('turn-touch');
      drawPicture(character);
      const touch = (TestBed.inject(ViewportService) as unknown as { _isTouch: WritableSignal<boolean> })._isTouch;
      const wasTouch = touch();
      touch.set(false);
      const selection = TestBed.inject(SelectionSignalService);
      const sightOf = vi
        .spyOn(TestBed.inject(TablePickService), 'pictureSightOf')
        .mockReturnValue({ hides: () => false, cornerOnPage: () => ({ x: -1000, y: -1000 }) });
      const heldPiece = TestBed.inject(HeldPieceService);
      const shownAtFull = () => testOf('turn-grab')?.classList.contains('opacity-100!');

      try {
        choose(character);
        selection.selectObject(character.identifier, 'character');
        fixture.detectChanges();
        expect(shownAtFull()).toBe(false);
        expect(sightOf).not.toHaveBeenCalled();

        touch.set(true);
        fixture.detectChanges();
        expect(shownAtFull()).toBe(true);
        expect(headOf()?.classList.contains('opacity-100!')).toBe(true);
        expect(sightOf).toHaveBeenCalled();

        heldPiece.take({
          identifier: character.identifier,
          x: 0,
          y: 0,
          widthPx: 50,
          heightPx: 50,
          altitude: 0,
          gridSize: 50,
          liftable: true,
        });
        fixture.detectChanges();
        expect(shownAtFull()).toBe(false);
      } finally {
        heldPiece.letGo(character.identifier);
        selection.selectedObject.set(null);
        touch.set(wasTouch);
        character.destroy();
      }
    });

    it('takes the handle that tips it away once the table lies flat, and from a piece with no picture to tip', async () => {
      const character = withPicture('roll-grab-hidden');

      try {
        choose(character);
        expect(headOf()).toBeTruthy();

        TestBed.inject(ViewModePreferenceService).choose('flat');
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        fixture.detectChanges();

        expect(headOf()).toBeNull();
      } finally {
        character.destroy();
      }

      const bare = GameCharacter.create('roll-grab-bare', 1, '');
      fixture.componentRef.setInput('gameCharacter', bare);
      TestBed.inject(ViewModePreferenceService).choose('auto');
      choose(bare);
      expect(headOf()).toBeNull();
      expect(testOf('turn-grab')).not.toBeNull();
      bare.destroy();
    });
  });

  describe('keeping the name above the piece on the screen in the flat mode', () => {
    it('keeps the stationary name while the clockwise orbit is disabled', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      tabletopService.currentTable.multiAngleEnabled = false;
      const character = GameCharacter.create('停止名', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;

        expect(component.multiAngleNameOrbitEnabled()).toBe(false);
        expect(root.querySelector('[data-testid="multi-angle-name-orbit"]')).toBeNull();
        expect(root.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(1);
      } finally {
        character.destroy();
      }
    });

    it('draws no name while this seat has names switched off from the toolbar', () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      tabletopService.currentTable.multiAngleEnabled = false;
      const character = GameCharacter.create('名札', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const overlay = TestBed.inject(PieceOverlayPreferenceService);
      const root = fixture.nativeElement as HTMLElement;

      try {
        fixture.detectChanges();
        expect(root.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(1);

        overlay.toggleNames();
        fixture.detectChanges();
        expect(root.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(0);

        overlay.toggleNames();
        fixture.detectChanges();
        expect(root.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(1);
      } finally {
        localStorage.removeItem('ui-piece-overlay');
        character.destroy();
      }
    });

    it('draws no name round the orbit either while names are switched off', () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      tabletopService.currentTable.multiAngleEnabled = true;
      const character = GameCharacter.create('周回名札', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const root = fixture.nativeElement as HTMLElement;

      try {
        TestBed.inject(PieceOverlayPreferenceService).toggleNames();
        fixture.detectChanges();

        expect(component.multiAngleNameOrbitEnabled()).toBe(true);
        expect(root.querySelector('[data-testid="multi-angle-name-orbit"]')).toBeNull();
        expect(root.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(0);
      } finally {
        localStorage.removeItem('ui-piece-overlay');
        character.destroy();
      }
    });

    it('curves a short label four times around the clockwise orbit', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      tabletopService.currentTable.multiAngleEnabled = true;
      const character = GameCharacter.create('周回名', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const orbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-name-orbit"]');

        expect(component.multiAngleNameOrbitEnabled()).toBe(true);
        expect(orbit?.dataset['orbitDirection']).toBe('clockwise');
        expect(orbit?.classList.contains('animate-multi-angle-name-orbit')).toBe(true);
        expect(root.querySelectorAll('[data-testid="piece-name"]')).toHaveLength(1);
        expect(root.querySelectorAll('[data-testid="multi-angle-name-text-path"]')).toHaveLength(4);
        const seamContinuation = root.querySelector<SVGTextPathElement>(
          '[data-testid="multi-angle-name-seam-continuation"]'
        );
        expect(seamContinuation?.getAttribute('startOffset')).toBe('100%');
        expect(seamContinuation?.textContent?.trim()).toBe('周回名');
        expect(root.querySelectorAll('[data-testid="multi-angle-name-separator"]')).toHaveLength(4);
        expect(root.querySelector('[data-testid="multi-angle-name-separator"]')?.textContent?.trim()).toBe('◆');
        expect(root.querySelector('textPath')?.getAttribute('startOffset')).toBe('75%');
        expect(root.querySelector('textPath')?.textContent?.trim()).toBe('周回名');
        expect(root.querySelector('[data-multi-angle-seat]')).toBeNull();
        expect(component.multiAngleCurvedNameLayout().path.match(/ A /g)).toHaveLength(2);
        expect(component.multiAngleCurvedNameLayout().startOffsets).toEqual(['75%', '0%', '25%', '50%']);
        expect(component.multiAngleNameOrbitAnimation()).toEqual({
          durationSeconds: 12,
          timingFunction: 'linear',
        });
        expect(root.querySelector<HTMLElement>('[data-testid="piece-gauge"]')?.style.transform ?? '').not.toContain(
          '--multi-angle-piece-angle'
        );
      } finally {
        character.destroy();
      }
    });

    it('replaces the linear resource bars with equal rotating pedestal arcs', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleResourceBuffEnabled = true;
      const character = GameCharacter.create('円形ゲージ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const nameOrbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-name-orbit"]')!;
        const resourceBuffOrbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-resource-buff-orbit"]')!;
        const segments = Array.from(
          root.querySelectorAll<SVGCircleElement>('[data-testid="multi-angle-resource-segment"]')
        );
        const labels = Array.from(root.querySelectorAll<SVGTextElement>('[data-testid="multi-angle-resource-label"]'));
        const separators = Array.from(
          root.querySelectorAll<SVGLineElement>('[data-testid="multi-angle-resource-separator"]')
        );

        expect(component.multiAngleResourceBuffOrbitEnabled()).toBe(true);
        expect(root.querySelectorAll('[data-testid="piece-gauge"]')).toHaveLength(0);
        expect(segments).toHaveLength(2);
        expect(segments.map((segment) => segment.dataset['segmentDegrees'])).toEqual(['180', '180']);
        expect(labels.map((label) => label.textContent?.trim())).toEqual(['H', 'M']);
        expect(separators.map((separator) => separator.dataset['separatorAngle'])).toEqual(['-90', '90']);
        expect(root.querySelector('[data-testid="multi-angle-resource-gauge"]')?.textContent).not.toContain('200');
        expect(nameOrbit.style.animationDuration).toBe('12s');
        expect(resourceBuffOrbit.classList.contains('animate-multi-angle-name-orbit')).toBe(true);
        expect(resourceBuffOrbit.style.animationDuration).toBe('15s');
        expect(resourceBuffOrbit.style.animationTimingFunction).toBe('linear');
        expect(resourceBuffOrbit.style.animationDelay).toBe(`${component.multiAngleResourceBuffOrbitDelaySeconds()}s`);
        expect(component.multiAngleResourceBuffOrbitAnimation()).toEqual({
          durationSeconds: 15,
          timingFunction: 'linear',
        });
        expect(resourceBuffOrbit.parentElement).toBe(nameOrbit.parentElement);
      } finally {
        character.destroy();
      }
    });

    it('switches between stationary and rotating resource and buff displays', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleResourceBuffEnabled = false;
      const display = TestBed.inject(TabletopDisplayService);
      const character = GameCharacter.create('表示切替', 1, '');
      const buff = DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE });
      character.buffDataElement!.appendChild(buff);
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelectorAll('[data-testid="piece-gauge"]')).toHaveLength(2);
        expect(root.querySelector('[data-testid="buff-badge"]')).toBeTruthy();
        expect(root.querySelector('[data-testid="multi-angle-resource-buff-orbit"]')).toBeNull();

        display.set({ multiAngleResourceBuffEnabled: true });
        fixture.detectChanges();
        expect(root.querySelector('[data-testid="piece-gauge"]')).toBeNull();
        expect(root.querySelector('[data-testid="buff-badge"]')).toBeNull();
        expect(root.querySelectorAll('[data-testid="multi-angle-resource-segment"]')).toHaveLength(2);
        expect(root.querySelector('[data-testid="multi-angle-buff-icon"]')).toBeTruthy();

        display.set({ multiAngleResourceBuffEnabled: false });
        fixture.detectChanges();
        expect(root.querySelectorAll('[data-testid="piece-gauge"]')).toHaveLength(2);
        expect(root.querySelector('[data-testid="buff-badge"]')).toBeTruthy();
        expect(root.querySelector('[data-testid="multi-angle-resource-buff-orbit"]')).toBeNull();
      } finally {
        character.destroy();
      }
    });

    it('draws a picture chosen as the mark of a buff in the orbit, rather than writing out its name', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleResourceBuffEnabled = true;
      const pictures = vi
        .spyOn(ImageStorage.instance, 'get')
        .mockImplementation((identifier) => (identifier === '452c31a22f' ? { url: 'blob:blessing' } : null) as never);
      const character = GameCharacter.create('絵の印', 1, '');
      const buff = DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE });
      buff.setAttribute(DataElementAttribute.BUFF_ICON, '452c31a22f');
      character.buffDataElement!.appendChild(buff);
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const icon = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="multi-angle-buff-icon"]')!;

        expect(icon.querySelector('img')?.getAttribute('src')).toBe('blob:blessing');
        expect(icon.textContent).not.toContain('452c31a22f');
      } finally {
        character.destroy();
        pictures.mockRestore();
      }
    });

    it('shows at most four configured resources in ninety-degree segments', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleResourceBuffEnabled = true;
      const character = GameCharacter.create('四分割', 1, '');
      const group = character.detailDataElement!.getFirstElementByName('基本')!;
      for (const name of ['AP', 'BP', 'CP']) {
        const resource = DataElement.create(name, 10, {
          type: DataElementType.NUMBER_RESOURCE,
          currentValue: '5',
        });
        resource.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
        group.appendChild(resource);
      }
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const segments = Array.from(
          (fixture.nativeElement as HTMLElement).querySelectorAll<SVGCircleElement>(
            '[data-testid="multi-angle-resource-segment"]'
          )
        );

        expect(component.pieceGauges()).toHaveLength(5);
        expect(segments).toHaveLength(4);
        expect(segments.map((segment) => segment.dataset['resourceName'])).toEqual(['HP', 'MP', 'AP', 'BP']);
        expect(segments.every((segment) => segment.dataset['segmentDegrees'] === '90')).toBe(true);
      } finally {
        character.destroy();
      }
    });

    it('moves buff icons onto the same rotating outer orbit', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleResourceBuffEnabled = true;
      const character = GameCharacter.create('外周バフ', 1, '');
      const buff = DataElement.create('毒', 3, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: 'ダメージ2',
      });
      buff.setAttribute(DataElementAttribute.BUFF_ICON, '☠️');
      character.buffDataElement!.appendChild(buff);
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const icon = root.querySelector<HTMLElement>('[data-testid="multi-angle-buff-icon"]');
        const position = root.querySelector<HTMLElement>('[data-testid="multi-angle-buff-position"]');

        expect(root.querySelector('[data-testid="buff-badge"]')).toBeNull();
        expect(icon?.textContent?.trim()).toBe('☠️');
        expect(icon?.title).toBe('毒');
        expect(position?.style.transform).toContain('rotate(0deg)');
        expect(position?.closest('[data-testid="multi-angle-resource-buff-orbit"]')).toBeTruthy();
        expect(position?.closest('[data-testid="multi-angle-name-orbit"]')).toBeNull();
        expect(component.multiAngleLabelText()).toBe('外周バフ');
      } finally {
        character.destroy();
      }
    });

    it('uses smooth quarter turns separated by the configured pause', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleMotionMode = 'quarter-turn';
      table.multiAngleRevolutionSeconds = 8;
      table.multiAnglePauseSeconds = 2;
      table.multiAnglePieceRevolutionSeconds = 90;
      const turn = vi.spyOn(TestBed.inject(PieceMotionsService), 'turnOnItsOwn');
      const character = GameCharacter.create('間欠回転', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        TestBed.tick();
        const root = fixture.nativeElement as HTMLElement;
        const orbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-name-orbit"]');

        expect(component.multiAngleNameOrbitAnimation().durationSeconds).toBe(16);
        expect(component.multiAngleNameOrbitAnimation().timingFunction).toContain('0.25 12.5%');
        expect(orbit?.style.animationDuration).toBe('16s');
        expect(orbit?.style.animationTimingFunction).toContain('linear(');
        expect(turn).toHaveBeenLastCalledWith(
          character.identifier,
          expect.objectContaining({ mode: 'quarter-turn', revolutionSeconds: 90, pauseSeconds: 2 })
        );
      } finally {
        character.destroy();
      }
    });

    it('keeps the name continuous while only the piece pauses after quarter turns', () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      table.multiAngleMotionMode = 'piece-quarter-turn';
      table.multiAngleRevolutionSeconds = 8;
      table.multiAnglePauseSeconds = 2;
      table.multiAnglePieceRevolutionSeconds = 90;
      const turn = vi.spyOn(TestBed.inject(PieceMotionsService), 'turnOnItsOwn');
      const character = GameCharacter.create('コマだけ間欠回転', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        TestBed.tick();
        const root = fixture.nativeElement as HTMLElement;
        const orbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-name-orbit"]');

        expect(component.multiAngleNameOrbitAnimation()).toEqual({
          durationSeconds: 8,
          timingFunction: 'linear',
        });
        expect(orbit?.style.animationDuration).toBe('8s');
        expect(orbit?.style.animationTimingFunction).toBe('linear');
        expect(turn).toHaveBeenLastCalledWith(
          character.identifier,
          expect.objectContaining({ mode: 'quarter-turn', revolutionSeconds: 90, pauseSeconds: 2 })
        );
      } finally {
        character.destroy();
      }
    });

    it('adds only the leading buff characters to the repeated label', () => {
      const character = GameCharacter.create('勇者', 1, '');
      character.addExtendData();
      const buff = DataElement.create('攻撃強化状態', 3, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: '+2',
      });
      character.buffDataElement!.appendChild(buff);
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.multiAngleLabelText()).toBe('勇者/攻撃強化状');

        character.hideBuff = true;
        TestBed.inject(ObjectChangeService).notifyChanged(character.identifier);
        expect(component.multiAngleLabelText()).toBe('勇者');
      } finally {
        character.destroy();
      }
    });
  });

  describe('targeting with a modified click', () => {
    it('targets and untargets a character on a modified press, and says so', () => {
      const uiSignalService = TestBed.inject(UiSignalService);
      const notifySpy = vi.spyOn(uiSignalService, 'notifyTargetChange');
      const char = GameCharacter.create('target-test', 1, '');
      fixture.componentRef.setInput('gameCharacter', char);

      try {
        const event = new PointerEvent('pointerdown', { altKey: true, button: 0, cancelable: true });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

        component.checkKey(event);

        expect(char.targeted).toBe(true);
        expect(notifySpy).toHaveBeenCalledWith(char.identifier, char.aliasName);
        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(stopPropagationSpy).toHaveBeenCalled();
      } finally {
        char.destroy();
      }
    });

    it('clears every target with the second modifier and does not target this one again', () => {
      const uiSignalService = TestBed.inject(UiSignalService);
      const notifySpy = vi.spyOn(uiSignalService, 'notifyTargetChange');
      const char1 = GameCharacter.create('target-clear-1', 1, '');
      const char2 = GameCharacter.create('target-clear-2', 1, '');
      char1.targeted = true;
      char2.targeted = true;
      fixture.componentRef.setInput('gameCharacter', char1);

      try {
        component.checkKey(
          new PointerEvent('pointerdown', { altKey: true, shiftKey: true, button: 0, cancelable: true })
        );

        expect(char1.targeted).toBe(false);
        expect(char2.targeted).toBe(false);
        expect(notifySpy).toHaveBeenCalledWith(char1.identifier, char1.aliasName);
        expect(notifySpy).toHaveBeenCalledWith(char2.identifier, char2.aliasName);
      } finally {
        char1.destroy();
        char2.destroy();
      }
    });
  });

  describe('the hop a piece makes when it arrives', () => {
    it('hops on the canvas once, as it comes onto the table', () => {
      const play = vi.spyOn(TestBed.inject(PieceMotionsService), 'play');
      const character = GameCharacter.create('bounce', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        TestBed.tick();
        fixture.detectChanges();
        TestBed.tick();

        expect(play.mock.calls.filter(([, kind]) => kind === 'bounce-in')).toEqual([
          [character.identifier, 'bounce-in'],
        ]);
      } finally {
        character.destroy();
      }
    });

    it('stops hopping once it is taken off the table', () => {
      const motions = TestBed.inject(PieceMotionsService);
      const character = GameCharacter.create('bounce-gone', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        TestBed.tick();
        expect(motions.isPlaying(character.identifier)).toBe(true);

        fixture.destroy();

        expect(motions.isPlaying(character.identifier)).toBe(false);
      } finally {
        character.destroy();
      }
    });
  });

  describe('setting up and tearing down', () => {
    it('reads without throwing before a character is set', () => {
      expect(() => {
        const name = component.name;
        expect(name).toBeDefined();
      }).not.toThrow();
    });

    it('reads the lock without throwing', () => {
      expect(() => {
        const isLock = component.isLock;
        expect(isLock).toBeDefined();
      }).not.toThrow();
    });

    it('sets the lock without throwing', () => {
      expect(() => {
        component.isLock = true;
      }).not.toThrow();
    });

    it('reads the size without throwing', () => {
      expect(() => {
        const size = component.size;
        expect(size).toBeDefined();
      }).not.toThrow();
    });

    it('reads the altitude without throwing', () => {
      expect(() => {
        const altitude = component.altitude;
        expect(altitude).toBeDefined();
      }).not.toThrow();
    });

    it('sets the altitude without throwing', () => {
      expect(() => {
        component.setAltitude(5);
      }).not.toThrow();
    });

    it('sets up and tears down without throwing', () => {
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(() => fixture.destroy()).not.toThrow();
    });
  });

  it('stands its guide to how high it floats on the raised ground the canvas draws it on', () => {
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    TestBed.inject(GroundService).dab({ kind: 'raise', x: 2.5, y: 4.5, radius: 3, strength: 1 });
    const character = GameCharacter.create('浮く人', 1, '');
    character.location = { name: 'table', x: 100, y: 200 };
    character.isAltitudeIndicate = true;
    fixture.componentRef.setInput('gameCharacter', character);
    component.setAltitude(2);
    type Guide = { lifted: { height: number }; ground: { height: number } } | null;

    try {
      const lift = TestBed.inject(TablePiecesService).footOf(character).height;
      const guide = (component as unknown as { altitudeGuide(): Guide }).altitudeGuide()!;
      expect(lift).toBeGreaterThan(0);
      expect(guide.ground.height).toBeCloseTo(lift, 6);
      expect(guide.lifted.height).toBeCloseTo(lift + 2 * component.gridSize, 6);
    } finally {
      character.destroy();
      table.destroy();
    }
  });

  it('collapses the piece itself while an effect knocks it down', () => {
    const play = vi.spyOn(TestBed.inject(PieceMotionsService), 'play');
    const character = GameCharacter.create('斬られ役', 1, '');
    fixture.componentRef.setInput('gameCharacter', character);
    const preset = new EffectPreset();
    preset.kind = 'dissolve';
    preset.durationMs = 5000;
    ObjectStore.instance.add(preset, false);

    try {
      fixture.detectChanges();
      TestBed.inject(EffectPlaybackService).play({
        presetIdentifier: preset.identifier,
        targets: [{ identifier: character.identifier, x: 0, y: 0, z: 0 }],
        seed: 1,
      });
      fixture.detectChanges();

      // An effect around it does not read as falling; the piece has to go down with it.
      TestBed.tick();
      expect(play).toHaveBeenCalledWith(character.identifier, 'defeat-dissolve', { holds: true });
    } finally {
      ObjectStore.instance.remove(preset);
      character.destroy();
    }
  });

  describe('over a table drawn on a canvas', () => {
    beforeEach(() => {
      fixture = TestBed.createComponent(GameCharacterComponent);
      component = fixture.componentInstance;
    });

    it('lays its pedestal and its labels out on the screen, and draws its pedestal out of sight for the canvas', () => {
      const character = GameCharacter.create('コマ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(
        element.querySelector('[data-part="pedestal"][data-testid="multi-angle-piece-motion-source"]')
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="piece-name"]')?.textContent).toContain('コマ');
      expect(element.querySelector('[appbillboard]')).toBeNull();
      expect(element.querySelector('.fixed [data-part="pedestal"]')).not.toBeNull();
      character.destroy();
    });

    it('flashes its box on the screen when it is asked to be found, and opens its menu round that box', () => {
      vi.useFakeTimers();
      const character = GameCharacter.create('コマ', 1, '');
      character.location.name = 'table';
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();
      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-hud-box]')!;

      try {
        expect(component.rootElementRef()?.nativeElement).toBe(box);
        TestBed.inject(SelectionSignalService).highlightObject(character.identifier);
        TestBed.tick();
        vi.advanceTimersByTime(1);

        expect(box.classList).toContain('animate-focused');
      } finally {
        vi.useRealTimers();
        character.destroy();
      }
    });

    it('turns on its own while the table is seen from straight above with its pieces turning', async () => {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = true;
      table.multiAngleEnabled = true;
      await Promise.resolve();
      const turn = vi.spyOn(TestBed.inject(PieceMotionsService), 'turnOnItsOwn');
      const character = GameCharacter.create('コマ', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      fixture.detectChanges();
      TestBed.tick();

      expect(turn).toHaveBeenCalledWith(
        character.identifier,
        expect.objectContaining({ mode: 'continuous', revolutionSeconds: 60 })
      );
      fixture.destroy();
      expect(turn).toHaveBeenLastCalledWith(character.identifier, null);
      character.destroy();
    });
  });
});
