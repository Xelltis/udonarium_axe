import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
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
    table.mode2d = false;
    table.imageBillboard = false;
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

  describe('which way a piece faces', () => {
    function tableShowing(mark: 'none' | 'turn' | 'arrow', mode2d: boolean): void {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = mode2d;
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

    it('turns the picture with the piece from above', () => {
      tableShowing('turn', true);
      place(90);

      expect(component.imageTurnsWithPiece()).toBe(true);
      // The frame above the pedestal holds the turn back; the picture alone puts it on again.
      expect(component.standTransform().startsWith('rotateZ(-90deg)')).toBe(true);
      expect(component.billboardTransformImage()).toContain('rotateZ(90deg)');
    });

    it('leaves the picture square to the reader where a mark shows the facing instead', () => {
      tableShowing('arrow', true);
      place(90);

      expect(component.imageTurnsWithPiece()).toBe(false);
      expect(component.standTransform().startsWith('rotateZ(-90deg)')).toBe(true);
      expect(component.billboardTransformImage()).toContain('rotateZ(0deg)');
      expect(arrow()).not.toBeNull();
    });

    it('keeps the name and the bars on the side of the piece they were on', () => {
      tableShowing('turn', true);
      place(180);

      // Held still once above the pedestal, so nothing hanging there turns with the piece.
      expect(component.standTransform().startsWith('rotateZ(-180deg)')).toBe(true);
      expect(component.billboardTransform()).toContain('rotateZ(0deg)');
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

        TestBed.inject(TabletopService).currentTable.mode2d = true;
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
      tabletopService.currentTable.mode2d = true;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.imageBillboardEnabled()).toBe(true);
    });
  });

  describe('keeping the name above the piece on the screen in the flat mode', () => {
    it('raises the name straight up in three dimensions', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = false;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.nameLabelOrbit()).toBe('translateY(-30px)');
    });

    it('puts it up the screen in the flat mode', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const transform = component.nameLabelOrbit();
      const x = Number(transform.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? NaN);
      expect(x).toBeCloseTo(0, 5);
      expect(transform).toContain('translateZ(-60.00px)');
    });

    it('puts it across as the view turns a quarter', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      TestBed.inject(UiSignalService).notifyTableViewRotation(0, 0, 90);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const transform = component.nameLabelOrbit();
      expect(transform).toContain('translateX(-60.00px)');
      const z = Number(transform.match(/translateZ\((-?[\d.]+)px\)/)?.[1] ?? NaN);
      expect(z).toBeCloseTo(0, 5);
    });

    it('compensates nothing along the depth in the flat mode', async () => {
      const tabletopService = TestBed.inject(TabletopService);
      tabletopService.currentTable.mode2d = true;
      TestBed.inject(UiSignalService).notifyTableViewRotation(50, 0, 10);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(component.billboardTransform()).toContain('translateZ(0.00px)');
      expect(component.billboardTransformBuff()).toContain('translateZ(0.00px)');
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
    const bodyWrapper = () =>
      (fixture.nativeElement.querySelector('[data-testid="piece-body"]') as HTMLElement).parentElement!;

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
