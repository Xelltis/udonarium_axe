import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopDisplayService } from '@axe/application/tabletop/tabletop-display.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { GameCharacterComponent } from '@axe/features/character/game-character/game-character.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableDirective } from '@axe/ui/directives/movable.directive';

describe('GameCharacterComponent', () => {
  let component: GameCharacterComponent;
  let fixture: ComponentFixture<GameCharacterComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
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
    TestBed.inject(ViewModePreferenceService).choose('perspective');
    table.mode2d = false;
    table.facingMark = 'none';
    table.imageBillboard = false;
    table.radialMenuEnabled = false;
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

    function openMenu(tableMode2d: boolean, radialMenuEnabled: boolean, size = 1, showRotatingName = false) {
      const character = GameCharacter.create('menu-piece', size, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = tableMode2d;
      table.radialMenuEnabled = radialMenuEnabled;
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
      const character = openMenu(false, true);

      try {
        expect(open).toHaveBeenCalled();
        expect(openRadial).not.toHaveBeenCalled();
      } finally {
        character.destroy();
      }
    });

    it.each([true, false])('opens the 2D menu interface with rotating display %s', (enabled) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const character = openMenu(true, enabled);

      try {
        expect(openRadial).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Array),
          expect.any(Array),
          'menu-piece',
          enabled,
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
      const character = openMenu(true, true, 3, showRotatingName);

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
      const character = openMenu(true, true, 1, true);

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
      table.radialMenuEnabled = false;
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

    it('turns the picture with the piece from above', () => {
      tableShowing('turn', true);
      place(90);

      expect(component.imageTurnsWithPiece()).toBe(true);
      // The shared frame stays compatible with the multi-angle renderer, and this picture alone
      // declines to cancel the turn supplied by the piece.
      expect(component.standTransform().startsWith('rotateY(90deg)')).toBe(true);
      expect(component.billboardTransformImage()).toContain('rotateZ(0deg)');
    });

    it('leaves the picture square to the reader where a mark shows the facing instead', () => {
      tableShowing('arrow', true);
      place(90);

      expect(component.imageTurnsWithPiece()).toBe(false);
      expect(component.standTransform().startsWith('rotateY(90deg)')).toBe(true);
      expect(component.billboardTransformImage()).toContain('rotateZ(-90deg)');
      expect(arrow()).not.toBeNull();
    });

    it('keeps the name and the bars on the side of the piece they were on', () => {
      tableShowing('turn', true);
      place(180);

      // Each billboard cancels the piece turn, keeping everything above it on the same side.
      expect(component.standTransform().startsWith('rotateY(90deg)')).toBe(true);
      expect(component.billboardTransform()).toContain('rotateZ(-180deg)');
    });

    it('leaves a table seen from the side to turn its pieces as it always did', () => {
      tableShowing('arrow', false);
      place(90);

      expect(component.standTransform().startsWith('rotateY(90deg)')).toBe(true);
      expect(component.billboardTransform()).toContain('rotateZ(-90deg)');
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

    it('turns the picture only from above, a turned billboard being no help from the side', () => {
      tableShowing('turn', false);
      place(90);

      expect(component.imageTurnsWithPiece()).toBe(false);
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

      it('carries the display on to the next type at every press', () => {
        const character = bearBuff();

        try {
          expect(root().querySelector('[data-testid="buff-badge"]')).not.toBeNull();

          switchButton().click();
          fixture.detectChanges();
          expect(root().querySelector('[data-testid="buff-badge"]')).toBeNull();
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
      vi.spyOn(SoundEffect, 'playLocal').mockImplementation((arg) => {
        played.push(typeof arg === 'string' ? arg : arg.identifier);
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

  describe('viewRotateZ computed signal', () => {
    it('starts at ten', () => {
      expect(component.viewRotateZ()).toBe(10);
    });

    it('turns with the table view', () => {
      const uiSignalService = TestBed.inject(UiSignalService);
      uiSignalService.notifyTableViewRotation(50, 20, 120);
      expect(component.viewRotateZ()).toBe(120);
    });
  });

  it('asks for no change detector', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((component as any).changeDetector).toBeUndefined();
  });

  it('computes whether it is targeted', () => {
    expect(typeof component.isTargeted).toBe('function');
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

    const wrapperTransform = () => (markerOf().parentElement as HTMLElement).style.transform;

    const axisValues = (transform: string, axis: 'X' | 'Y' | 'Z') =>
      [...transform.matchAll(new RegExp(`translate${axis}\\((-?[\\d.]+)px\\)`, 'g'))].map((match) => Number(match[1]));

    const markerLift = () => {
      const transform = wrapperTransform();
      const x = axisValues(transform, 'X');
      const y = axisValues(transform, 'Y');
      const z = axisValues(transform, 'Z');
      return Math.hypot(x[x.length - 1], y[0], z[0]);
    };

    it('sits directly above the centre of the piece', () => {
      const character = GameCharacter.create('marker-center', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);

      try {
        setTargeted(character, true);

        expect(axisValues(wrapperTransform(), 'X')[0]).toBe((component.size() * component.gridSize) / 2);
        expect(component.targetStackTransform()).toContain('translateZ(0.00px)');
      } finally {
        character.destroy();
      }
    });

    it('keeps its distance as the camera turns', () => {
      const character = GameCharacter.create('marker-rotated-view', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);
      const uiSignalService = TestBed.inject(UiSignalService);

      try {
        uiSignalService.notifyTableViewRotation(50, 0, 10);
        setTargeted(character, true);
        const straight = markerLift();

        uiSignalService.notifyTableViewRotation(35, 0, 70);
        fixture.detectChanges();

        expect(markerLift()).toBeCloseTo(straight, 1);
      } finally {
        character.destroy();
      }
    });

    it('sits above the buffs', () => {
      const character = GameCharacter.create('marker-above-buff', 1, '');
      character.addExtendData();
      fixture.componentRef.setInput('gameCharacter', character);
      const objectChange = TestBed.inject(ObjectChangeService);
      const buffRoot = character.buffDataElement!;
      const container = DataElement.create('バフ', '', {});
      buffRoot.appendChild(container);
      const buff = DataElement.create('毒', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: 'ダメージ2' });
      buff.setAttribute(DataElementAttribute.BUFF_ICON, '☠️');
      container.appendChild(buff);
      objectChange.notifyChanged(buffRoot.identifier);
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);

      try {
        setTargeted(character, true);
        const buffDistance = -Number(/translateY\((-?[\d.]+)px\)/.exec(component.buffLabelOrbit())![1]);

        expect(markerLift()).toBeGreaterThan(buffDistance);
      } finally {
        character.destroy();
      }
    });
  });

  it('computes whether the height is set by hand', async () => {
    const char = GameCharacter.create('height-flag-test', 1, '');
    fixture.componentRef.setInput('gameCharacter', char);

    try {
      expect(component.specifyKomaImageFlag()).toBe(false);

      char.specifyKomaImageFlag = true;
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      expect(component.specifyKomaImageFlag()).toBe(true);
    } finally {
      char.destroy();
    }
  });

  it('keeps a hand-set image in the layout, so the name and the buffs still measure from it', () => {
    ImageStorage.instance.add('piece-height-url');
    const char = GameCharacter.create('height-layout-test', 1, 'piece-height-url');
    char.specifyKomaImageFlag = true;
    char.komaImageHeight = 240;
    fixture.componentRef.setInput('gameCharacter', char);

    try {
      fixture.detectChanges();

      const pieceImage = fixture.nativeElement.querySelector('img.image.chrome-smooth-image-trick') as HTMLImageElement;
      expect(pieceImage).toBeTruthy();
      expect(pieceImage.style.position).toBe('');
      expect(pieceImage.style.display).toBe('inline-block');
      expect(pieceImage.style.height).toBe('240px');
    } finally {
      char.destroy();
      ImageStorage.instance.delete('piece-height-url');
    }
  });

  describe('the handles that tip a piece over', () => {
    const headOf = () => fixture.nativeElement.querySelector('[data-testid="roll-grab-head"]') as HTMLElement | null;
    const footOf = () => fixture.nativeElement.querySelector('[data-testid="roll-grab-foot"]') as HTMLElement | null;

    it('hangs both handles off the picture box instead of off what the layout leaves behind', () => {
      ImageStorage.instance.add('roll-grab-url');
      const character = GameCharacter.create('roll-grab', 1, 'roll-grab-url');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const pictureBox = (fixture.nativeElement.querySelector('img.image.chrome-smooth-image-trick') as HTMLElement)
          .parentElement;

        expect(headOf()?.parentElement).toBe(pictureBox);
        expect(footOf()?.parentElement).toBe(pictureBox);
        expect(headOf()?.className).toContain('top-0');
        expect(footOf()?.className).toContain('bottom-0');
      } finally {
        character.destroy();
        ImageStorage.instance.delete('roll-grab-url');
      }
    });

    it('holds the head handle inside the top edge and hangs the foot one clear below', () => {
      const character = GameCharacter.create('roll-grab-offset', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.rollHandleHeadTransform()).toBe('translateX(-50%) translateX(25px)');
        expect(component.rollHandleFootTransform()).toBe(
          'translateX(-50%) translateX(25px) translateY(100%) translateY(7px)'
        );
      } finally {
        character.destroy();
      }
    });

    it('keeps the head handle out of the band the name hangs in, however big the piece grows', () => {
      for (const pieceSize of [0.5, 1, 4]) {
        const character = GameCharacter.create('roll-grab-name-clear', pieceSize, '');
        fixture.componentRef.setInput('gameCharacter', character);

        try {
          expect(component.rollHandleHeadTransform()).not.toContain('translateY');
        } finally {
          character.destroy();
        }
      }
    });

    it('sizes the handle off the piece and still leaves the biggest and the smallest grabbable', () => {
      const sizeOf = (pieceSize: number) => {
        const character = GameCharacter.create('roll-grab-size', pieceSize, '');
        fixture.componentRef.setInput('gameCharacter', character);
        try {
          return { handle: component.rollHandleSizePx(), icon: component.rollHandleIconSizePx() };
        } finally {
          character.destroy();
        }
      };

      expect(sizeOf(1)).toEqual({ handle: 28, icon: 24 });
      expect(sizeOf(2).handle).toBe(56);
      expect(sizeOf(4).handle).toBe(56);
      expect(sizeOf(0.5).handle).toBe(20);
    });

    it('centres the handle on a piece of any width', () => {
      const character = GameCharacter.create('roll-grab-wide', 4, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        expect(component.rollHandleFootTransform()).toContain('translateX(-50%) translateX(100px)');
      } finally {
        character.destroy();
      }
    });

    it('takes the handles away once the table lies flat', async () => {
      const character = GameCharacter.create('roll-grab-hidden', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        expect(footOf()).toBeTruthy();

        TestBed.inject(ViewModePreferenceService).choose('flat');
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        fixture.detectChanges();

        expect(headOf()).toBeNull();
        expect(footOf()).toBeNull();
      } finally {
        character.destroy();
      }
    });
  });

  describe('following the table setting for facing the camera', () => {
    it('takes the setting from the table', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.imageBillboard = false;
      expect(component.imageBillboardEnabled()).toBe(false);

      tabletopService.currentTable.imageBillboard = true;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.imageBillboardEnabled()).toBe(true);
    });

    it('faces the picture at the camera without raising it', () => {
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);
      expect(component.billboardTransformImage()).toContain('translateZ(0.00px)');
    });

    it('faces it anyway in the flat mode', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.imageBillboard = false;
      TestBed.inject(ViewModePreferenceService).choose('flat');
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.imageBillboardEnabled()).toBe(true);
    });

    it('faces it in flat mode when only this browser enables tabletop display mode', () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = false;
      tabletopService.currentTable.imageBillboard = false;
      TestBed.inject(ViewModePreferenceService).choose('flat');

      expect(component.mode2dEnabled()).toBe(true);
      expect(component.imageBillboardEnabled()).toBe(true);
    });

    it.each(['none', 'turn', 'arrow'] as const)(
      'keeps the character image renderable in 2D multi-angle mode with facing mark %s',
      (facingMark) => {
        const imageUrl = `2d-facing-${facingMark}.png`;
        ImageStorage.instance.add(imageUrl);
        const character = GameCharacter.create('2D image', 1, imageUrl);
        character.rotate = 90;
        fixture.componentRef.setInput('gameCharacter', character);
        const table = TestBed.inject(TabletopService).currentTable;
        table.mode2d = true;
        table.multiAngleEnabled = true;
        table.facingMark = facingMark;

        try {
          fixture.detectChanges();
          const image = (fixture.nativeElement as HTMLElement).querySelector<HTMLImageElement>(
            'img.image.chrome-smooth-image-trick'
          );

          expect(image).not.toBeNull();
          expect(image?.style.transform).not.toBe('');
          expect(component.standTransform().startsWith('rotateY(90deg)')).toBe(true);
          expect(component.billboardTransformImage()).toContain(
            facingMark === 'turn' ? 'rotateZ(0deg)' : 'rotateZ(-90deg)'
          );
          expect(component.imageView.pieceTransform()).toContain('rotateZ(var(--multi-angle-piece-angle, 0deg))');
        } finally {
          character.destroy();
          ImageStorage.instance.delete(imageUrl);
        }
      }
    );
  });

  describe('keeping the name above the piece on the screen in the flat mode', () => {
    it('raises the name straight up in three dimensions', async () => {
      TestBed.inject(ViewModePreferenceService).choose('perspective');
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.nameLabelOrbit()).toBe('translateY(-30px)');
    });

    it('puts it up the screen in the flat mode', async () => {
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const transform = component.nameLabelOrbit();
      const x = Number(transform.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? NaN);
      expect(x).toBeCloseTo(0, 5);
      expect(transform).toContain('translateZ(-60.00px)');
    });

    it('puts it across as the view turns a quarter', async () => {
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 90);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const transform = component.nameLabelOrbit();
      expect(transform).toContain('translateX(-60.00px)');
      const z = Number(transform.match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? NaN);
      expect(z).toBeCloseTo(0, 5);
    });

    it('compensates nothing along the depth in the flat mode', async () => {
      TestBed.inject(ViewModePreferenceService).choose('flat');
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.billboardTransform()).toContain('translateZ(0.00px)');
      expect(component.billboardTransformBuff()).toContain('translateZ(0.00px)');
    });

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

        const pieceRotation = root.querySelector<HTMLElement>('[data-testid="multi-angle-piece-motion-source"]');
        expect(pieceRotation?.classList.contains('animate-multi-angle-piece-spin')).toBe(true);
        expect(pieceRotation?.style.animationDuration).toBe('60s');
        expect(pieceRotation?.style.animationTimingFunction).toBe('linear');
        expect(component.multiAnglePieceRotationAnimation()).toEqual({
          durationSeconds: 60,
          timingFunction: 'linear',
        });
        expect(component.multiAnglePieceRotationDelaySeconds()).toBeLessThanOrEqual(0);
        expect(root.querySelector<HTMLElement>('[data-testid="multi-angle-rotating-pedestal"]')?.style.transform).toBe(
          'rotateZ(var(--multi-angle-piece-angle, 0deg))'
        );
        expect(component.multiAnglePieceImageRotation()).toBe('rotateZ(var(--multi-angle-piece-angle, 0deg))');
        expect(component.imageView.pieceTransform()).toMatch(
          /rotateY\(90deg\).*rotateZ\(var\(--multi-angle-piece-angle, 0deg\)\)$/
        );
        expect(component.imageView.pieceTransform()).not.toContain('rotateX(var(--multi-angle-piece-angle');
        expect(component.imageView.pieceTransform()).not.toContain('rotateY(var(--multi-angle-piece-angle');
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
      display.takeOver('pieceLabels');
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

        display.set('pieceLabels', { multiAngleResourceBuffEnabled: true });
        fixture.detectChanges();
        expect(root.querySelector('[data-testid="piece-gauge"]')).toBeNull();
        expect(root.querySelector('[data-testid="buff-badge"]')).toBeNull();
        expect(root.querySelectorAll('[data-testid="multi-angle-resource-segment"]')).toHaveLength(2);
        expect(root.querySelector('[data-testid="multi-angle-buff-icon"]')).toBeTruthy();

        display.set('pieceLabels', { multiAngleResourceBuffEnabled: false });
        fixture.detectChanges();
        expect(root.querySelectorAll('[data-testid="piece-gauge"]')).toHaveLength(2);
        expect(root.querySelector('[data-testid="buff-badge"]')).toBeTruthy();
        expect(root.querySelector('[data-testid="multi-angle-resource-buff-orbit"]')).toBeNull();
      } finally {
        character.destroy();
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
      const character = GameCharacter.create('間欠回転', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const orbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-name-orbit"]');
        const pieceRotation = root.querySelector<HTMLElement>('[data-testid="multi-angle-piece-motion-source"]');

        expect(component.multiAngleNameOrbitAnimation().durationSeconds).toBe(16);
        expect(component.multiAngleNameOrbitAnimation().timingFunction).toContain('0.25 12.5%');
        expect(orbit?.style.animationDuration).toBe('16s');
        expect(orbit?.style.animationTimingFunction).toContain('linear(');
        expect(component.multiAnglePieceRotationAnimation().durationSeconds).toBe(98);
        expect(component.multiAnglePieceRotationAnimation().timingFunction).toContain('0.25 22.9592%');
        expect(component.multiAnglePieceRotationAnimation().timingFunction).toContain('0.25 25%');
        expect(pieceRotation?.style.animationDuration).toBe('98s');
        expect(pieceRotation?.style.animationTimingFunction).toContain('linear(');
        expect(pieceRotation?.style.animationDelay).toBe(`${component.multiAnglePieceRotationDelaySeconds()}s`);
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
      const character = GameCharacter.create('コマだけ間欠回転', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        const orbit = root.querySelector<HTMLElement>('[data-testid="multi-angle-name-orbit"]');
        const pieceRotation = root.querySelector<HTMLElement>('[data-testid="multi-angle-piece-motion-source"]');

        expect(component.multiAngleNameOrbitAnimation()).toEqual({
          durationSeconds: 8,
          timingFunction: 'linear',
        });
        expect(orbit?.style.animationDuration).toBe('8s');
        expect(orbit?.style.animationTimingFunction).toBe('linear');
        expect(component.multiAnglePieceRotationAnimation().durationSeconds).toBe(98);
        expect(component.multiAnglePieceRotationAnimation().timingFunction).toContain('0.25 22.9592%');
        expect(pieceRotation?.style.animationDuration).toBe('98s');
        expect(pieceRotation?.style.animationTimingFunction).toContain('linear(');
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
    const bodyWrapper = () => fixture.nativeElement.querySelector('[data-testid="piece-entry-bounce"]') as HTMLElement;

    it('hops once and then stays put, so re-ordering the table does not set it off again', () => {
      const character = GameCharacter.create('bounce', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();
        expect(bodyWrapper().className).toContain('animate-bounce-in');

        bodyWrapper().dispatchEvent(new AnimationEvent('animationend', { animationName: 'bounceIn' }));
        fixture.detectChanges();

        expect(bodyWrapper().className).not.toContain('animate-bounce-in');
      } finally {
        character.destroy();
      }
    });

    it('keeps hopping while another animation on the piece finishes', () => {
      const character = GameCharacter.create('bounce-other', 1, '');
      fixture.componentRef.setInput('gameCharacter', character);

      try {
        fixture.detectChanges();

        bodyWrapper().dispatchEvent(new AnimationEvent('animationend', { animationName: 'hitShake' }));
        fixture.detectChanges();

        expect(bodyWrapper().className).toContain('animate-bounce-in');
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

  it('collapses the piece itself while an effect knocks it down', () => {
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
      const body = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="piece-body"]')!;
      expect(body.classList.contains('animate-defeat-dissolve')).toBe(true);
    } finally {
      ObjectStore.instance.remove(preset);
      character.destroy();
    }
  });
});
