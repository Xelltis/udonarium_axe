import { TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { TRANSLATE_FN, TranslateFn } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { CutIn } from '@axe/domain/media/cut-in';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { pieceCornerOn } from '@axe/domain/tabletop/move/piece-on-grid';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
import { TriggerMoment } from '@axe/domain/tabletop/trigger-event';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { vi } from 'vitest';

const GRID = 50;

describe('TriggerFireService', () => {
  let service: TriggerFireService;
  let table: GameTable;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function trapAt(col: number, row: number, overrides: Partial<TableTrigger> = {}): TableTrigger {
    const trigger = new TableTrigger();
    trigger.col = col;
    trigger.row = row;
    trigger.element = 'ライフ';
    trigger.amount = '3';
    Object.assign(trigger, overrides);
    trigger.initialize();
    table.appendChild(trigger);
    return trigger;
  }

  function heroWith(hp: number): GameCharacter {
    const hero = GameCharacter.create('英雄', 1, '');
    const resource = DataElement.create('ライフ', hp, { type: DataElementType.NUMBER_RESOURCE, currentValue: hp });
    hero.detailDataElement!.appendChild(resource);
    return hero;
  }

  function hpOf(piece: GameCharacter): number {
    return Number(DataElement.findElementByReference(piece.rootDataElement!, 'ライフ')!.currentValue);
  }

  describe('a piece carried by hand', () => {
    function standAt(piece: GameCharacter, col: number, row: number): void {
      piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    }

    it('springs what it is put down on', () => {
      trapAt(5, 5);
      const hero = heroWith(20);
      standAt(hero, 4, 5);

      service.pickedUp(hero);
      standAt(hero, 5, 5);
      const fired = service.putDown(hero);

      expect(fired.length).toBe(1);
      expect(hpOf(hero)).toBe(17);
    });

    it('springs ground that waits to be stepped on as readily, having no way to offer', () => {
      trapAt(5, 5, { moment: 'enter' });
      const hero = heroWith(20);
      standAt(hero, 4, 5);

      service.pickedUp(hero);
      standAt(hero, 5, 5);
      service.putDown(hero);

      expect(hpOf(hero)).toBe(17);
    });

    it('springs nothing where the piece was put back where it came from', () => {
      trapAt(4, 5);
      const hero = heroWith(20);
      standAt(hero, 4, 5);

      service.pickedUp(hero);
      const fired = service.putDown(hero);

      expect(fired).toEqual([]);
      expect(hpOf(hero)).toBe(20);
    });

    it('springs nothing for a piece nobody picked up', () => {
      trapAt(5, 5);
      const hero = heroWith(20);
      standAt(hero, 5, 5);

      expect(service.putDown(hero)).toEqual([]);
    });

    describe('and the ground it was carried over', () => {
      afterEach(() => {
        Config.instance.handTracesWay = null;
      });

      it('is left alone, a hand having walked no way at all', () => {
        trapAt(5, 5, { moment: 'enter' });
        const hero = heroWith(20);
        standAt(hero, 4, 5);

        service.pickedUp(hero);
        standAt(hero, 6, 5);
        const fired = service.putDown(hero);

        expect(fired).toEqual([]);
        expect(hpOf(hero)).toBe(20);
      });

      it('goes off where the room asks for the way to be worked out', () => {
        Config.instance.handTracesWay = true;
        trapAt(5, 5, { moment: 'enter' });
        const hero = heroWith(20);
        standAt(hero, 4, 5);

        service.pickedUp(hero);
        standAt(hero, 6, 5);
        const fired = service.putDown(hero);

        expect(fired.length).toBe(1);
        expect(hpOf(hero)).toBe(17);
      });

      it('is left alone for a piece with no walk of its own to work out', () => {
        Config.instance.handTracesWay = true;
        trapAt(5, 5, { moment: 'enter' });
        trapAt(6, 5);
        const hero = heroWith(20);
        DataElement.findElementByReference(hero.rootDataElement!, '移動')!.value = '';
        standAt(hero, 4, 5);

        service.pickedUp(hero);
        standAt(hero, 6, 5);
        service.putDown(hero);

        // The ground it was set down on still takes what it takes: only what lies between is
        // left out, there being no way to work out.
        expect(hpOf(hero)).toBe(17);
      });

      it('goes off on a hex table as readily', () => {
        Config.instance.handTracesWay = true;
        const hex = new GameTable();
        hex.width = 12;
        hex.height = 12;
        hex.gridSize = GRID;
        hex.gridType = GridType.HEX_VERTICAL;
        hex.initialize();
        TestBed.inject(TableSelecter).viewTableIdentifier = hex.identifier;

        const board = cellGridOf(hex.width, hex.height, GRID, GridType.HEX_VERTICAL);
        const between = new TableTrigger();
        between.col = 4;
        between.row = 2;
        between.width = 5;
        between.height = 7;
        between.element = 'ライフ';
        between.amount = '3';
        between.moment = 'enter';
        between.initialize();
        hex.appendChild(between);

        const hero = heroWith(20);
        const standOn = (col: number, row: number) => {
          const corner = pieceCornerOn(board, hero, GRID, cellIndexOf(board, col, row));
          hero.location = { name: 'table', x: corner.x, y: corner.y };
        };
        standOn(3, 5);
        service.pickedUp(hero);
        standOn(9, 5);

        // Whichever cells the way runs through, it crosses the band between the two ends.
        expect(service.putDown(hero).length).toBeGreaterThan(0);
      });
    });
  });

  describe('ground that throws its own dice', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** A roll of a d20 that lands on whatever face is asked for. */
    function lands(face: number): void {
      vi.spyOn(Math, 'random').mockReturnValue((face - 1) / 20 + 0.001);
    }

    it('takes less from whoever makes the roll', () => {
      trapAt(5, 5, { amount: '10', checkRoll: '1d20', checkTarget: '10', passAmount: 'half' });
      const hero = heroWith(20);
      lands(19);

      const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

      expect(fired[0].made).toBe(true);
      expect(fired[0].rolled).toBe(19);
      expect(hpOf(hero)).toBe(15);
    });

    it('takes the whole of it from whoever misses', () => {
      trapAt(5, 5, { amount: '10', checkRoll: '1d20', checkTarget: '10', passAmount: 'half' });
      const hero = heroWith(20);
      lands(2);

      const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

      expect(fired[0].made).toBe(false);
      expect(hpOf(hero)).toBe(10);
    });

    it('takes nothing from whoever makes it where nothing was written to take', () => {
      trapAt(5, 5, { amount: '10', checkRoll: '1d20', checkTarget: '10' });
      const hero = heroWith(20);
      lands(19);

      service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

      expect(hpOf(hero)).toBe(20);
    });

    it('throws nothing where it has dice but nothing to clear', () => {
      trapAt(5, 5, { amount: '10', checkRoll: '1d20', passAmount: 'half' });
      const hero = heroWith(20);
      lands(19);

      const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

      expect(fired[0].rolled).toBeNull();
      expect(hpOf(hero)).toBe(10);
    });

    it('throws nothing for ground that only asks for a roll', () => {
      trapAt(5, 5, { amount: '10', check: '敏捷', checkTarget: '15' });
      const hero = heroWith(20);

      const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

      expect(fired[0].rolled).toBeNull();
      expect(hpOf(hero)).toBe(10);
    });
  });

  it('takes what the ground takes from the piece that walks onto it', () => {
    trapAt(5, 5);
    const hero = heroWith(20);

    const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(fired.length).toBe(1);
    expect(fired[0].taken).toBe(3);
    expect(hpOf(hero)).toBe(17);
  });

  it('says the resource changed, so the gauge, the floating number and its sound all follow', () => {
    trapAt(5, 5);
    const hero = heroWith(20);
    const resource = DataElement.findElementByReference(hero.rootDataElement!, 'ライフ')!;
    const told = vi.spyOn(resource, 'update');

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    // The write itself announces it, which is what the piece watches to draw the change.
    expect(told).toHaveBeenCalled();
  });

  it('plays what the ground was told to play, on whoever set it off', () => {
    const preset = TestBed.inject(EffectLibraryService).create('爆発');
    const cast = vi.spyOn(TestBed.inject(EffectCastService), 'fire').mockReturnValue(null);
    trapAt(5, 5, { effect: '爆発' });
    const hero = heroWith(20);

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(cast).toHaveBeenCalledWith(preset, [hero], null);
  });

  it('plays an effect the master keeps to themselves, since the master is who painted it', () => {
    const preset = TestBed.inject(EffectLibraryService).create('隠し爆発');
    preset.gmOnly = true;
    const cast = vi.spyOn(TestBed.inject(EffectCastService), 'fire').mockReturnValue(null);
    trapAt(5, 5, { effect: '隠し爆発' });

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(cast).toHaveBeenCalled();
  });

  it('plays nothing where the ground names no effect', () => {
    const cast = vi.spyOn(TestBed.inject(EffectCastService), 'fire').mockReturnValue(null);
    trapAt(5, 5);

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(cast).not.toHaveBeenCalled();
  });

  it('leaves ground the piece was already standing on alone', () => {
    trapAt(5, 5);
    const hero = heroWith(20);

    expect(service.walked(hero, grid(), [at(5, 5)])).toEqual([]);
    expect(hpOf(hero)).toBe(20);
  });

  it('waits for the walk to end where that is what it waits for', () => {
    trapAt(5, 5);
    const hero = heroWith(20);

    service.walked(hero, grid(), [at(4, 5), at(5, 5), at(6, 5)]);

    expect(hpOf(hero)).toBe(20);
  });

  it('goes off in passing where it was told to', () => {
    trapAt(5, 5, { moment: 'enter' });
    const hero = heroWith(20);

    service.walked(hero, grid(), [at(4, 5), at(5, 5), at(6, 5)]);

    expect(hpOf(hero)).toBe(17);
  });

  it('goes off for every cell of it that is stepped on, so wading it costs the wading', () => {
    trapAt(5, 5, { moment: 'enter', width: 3, height: 3 });
    const hero = heroWith(20);

    const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5), at(6, 5), at(7, 5)]);

    expect(fired.length).toBe(3);
    expect(hpOf(hero)).toBe(11);
  });

  it('goes off once for a walk across it where one go is all it had', () => {
    trapAt(5, 5, { moment: 'enter', width: 3, height: 3, once: true });
    const hero = heroWith(20);

    const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5), at(6, 5), at(7, 5)]);

    expect(fired.length).toBe(1);
    expect(hpOf(hero)).toBe(17);
  });

  it('gives itself away by being seen where that is what going off was to do', () => {
    const trap = trapAt(5, 5, { reveals: true });
    expect(trap.isShown).toBe(false);

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(trap.isShown).toBe(true);
  });

  it('is found rather than repainted, so what was painted is still what it was', () => {
    const trap = trapAt(5, 5, { reveals: true });

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(trap.found).toBe(true);
    expect(trap.open).toBe(false);
  });

  it('stays hidden where giving itself away was never asked of it', () => {
    const trap = trapAt(5, 5);

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(trap.isShown).toBe(false);
  });

  it('holds its peace for a piece it was not pointed at', () => {
    trapAt(5, 5, { targets: 'pc' });
    const monster = heroWith(20);
    monster.isNpc = true;

    expect(service.walked(monster, grid(), [at(4, 5), at(5, 5)])).toEqual([]);
    expect(hpOf(monster)).toBe(20);
  });

  it('is spent once it has gone off, where it only ever had the one go', () => {
    const trap = trapAt(5, 5, { once: true });
    const hero = heroWith(20);

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);
    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(trap.spent).toBe(true);
    expect(hpOf(hero)).toBe(17);
  });

  it('goes off again and again where nothing said otherwise', () => {
    trapAt(5, 5);
    const hero = heroWith(20);

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);
    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(hpOf(hero)).toBe(14);
  });

  it('gives back rather than takes where the amount is written the other way', () => {
    trapAt(5, 5, { amount: '-5' });
    const hero = heroWith(20);
    DataElement.findElementByReference(hero.rootDataElement!, 'ライフ')!.currentValue = 10;

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(hpOf(hero)).toBe(15);
  });

  it('gives nothing back past the full a resource was written with', () => {
    trapAt(5, 5, { amount: '-50' });
    const hero = heroWith(20);
    DataElement.findElementByReference(hero.rootDataElement!, 'ライフ')!.currentValue = 12;

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(hpOf(hero)).toBe(20);
  });

  it('takes nothing from a piece that carries no such thing', () => {
    trapAt(5, 5, { element: 'マナ' });
    const hero = heroWith(20);

    const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(fired[0].from).toBe('');
    expect(hpOf(hero)).toBe(20);
  });
});

describe('TriggerFireService and what the room is told', () => {
  let service: TriggerFireService;
  let table: GameTable;
  let chat: ChatMessageService;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  /** Says the key and the words put into it, so a line can be read without any translation. */
  const spell: TranslateFn = (key, params) => [key, ...Object.values(params ?? {}).map((held) => `${held}`)].join('|');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, { provide: TRANSLATE_FN, useValue: spell }] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
    chat = TestBed.inject(ChatMessageService);
    vi.spyOn(chat, 'sendSystemMessageToMainTab').mockReturnValue(null!);
    vi.spyOn(chat, 'sendSecretSystemMessageToMainTab').mockReturnValue(null!);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.restoreAllMocks();
  });

  function trapAt(col: number, row: number, overrides: Partial<TableTrigger> = {}): TableTrigger {
    const trigger = new TableTrigger();
    trigger.col = col;
    trigger.row = row;
    trigger.name = '落とし穴';
    Object.assign(trigger, overrides);
    trigger.initialize();
    table.appendChild(trigger);
    return trigger;
  }

  function heroWith(hp: number): GameCharacter {
    const hero = GameCharacter.create('英雄', 1, '');
    const resource = DataElement.create('ライフ', hp, { type: DataElementType.NUMBER_RESOURCE, currentValue: hp });
    hero.detailDataElement!.appendChild(resource);
    return hero;
  }

  const spoken = () => vi.mocked(chat.sendSystemMessageToMainTab).mock.calls.map((call) => call[0]);
  const kept = () => vi.mocked(chat.sendSecretSystemMessageToMainTab).mock.calls.map((call) => call[0]);

  it('says only that the ground was stepped on where it was given no line', () => {
    trapAt(5, 5);

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(spoken()).toHaveLength(1);
    expect(spoken()[0]).toContain('trigger.sprang');
  });

  it('writes the line the ground was given in place of saying merely that it went off', () => {
    trapAt(5, 5, { say: '足元の石が沈んだ' });

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(spoken()).toHaveLength(1);
    expect(spoken()[0]).toContain('足元の石が沈んだ');
    expect(spoken()[0]).not.toContain('trigger.sprang');
  });

  it('writes what it took on a line after the one it was given', () => {
    trapAt(5, 5, { say: '足元の石が沈んだ', element: 'ライフ', amount: '3' });

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(spoken()).toHaveLength(2);
    expect(spoken()[0]).toContain('足元の石が沈んだ');
    expect(spoken()[1]).toContain('trigger.tookFrom');
  });

  it('keeps every line of a quiet trap back from the room', () => {
    trapAt(5, 5, { say: '糸が張ってある', silent: true, element: 'ライフ', amount: '3' });

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(spoken()).toHaveLength(0);
    expect(kept()).toHaveLength(2);
  });

  it('sends a quiet line from nobody, so the seat that sprang it cannot read it either', () => {
    trapAt(5, 5, { silent: true });

    service.walked(heroWith(20), grid(), [at(4, 5), at(5, 5)]);

    expect(vi.mocked(chat.sendSecretSystemMessageToMainTab).mock.calls[0][1]).toBeUndefined();
  });

  it('takes what it takes whether or not anybody is told', () => {
    vi.mocked(chat.sendSystemMessageToMainTab).mockImplementation(() => {
      throw new Error('no chat tab yet');
    });
    trapAt(5, 5, { element: 'ライフ', amount: '3' });
    const hero = heroWith(20);

    service.walked(hero, grid(), [at(4, 5), at(5, 5)]);

    expect(Number(DataElement.findElementByReference(hero.rootDataElement!, 'ライフ')!.currentValue)).toBe(17);
  });
});

describe('TriggerFireService and the state it leaves a piece in', () => {
  let service: TriggerFireService;
  let ailments: StatusAilmentService;
  let table: GameTable;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
    ailments = TestBed.inject(StatusAilmentService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function trapAt(col: number, row: number, overrides: Partial<TableTrigger> = {}): TableTrigger {
    const trigger = new TableTrigger();
    trigger.col = col;
    trigger.row = row;
    Object.assign(trigger, overrides);
    trigger.initialize();
    table.appendChild(trigger);
    return trigger;
  }

  const walkOnto = (piece: GameCharacter) => service.walked(piece, grid(), [at(4, 5), at(5, 5)]);
  const hero = () => GameCharacter.create('英雄', 1, '');
  const buffOf = (piece: GameCharacter, name: string) => piece.buffs.find(name);

  it('leaves a piece in no state at all where the ground names none', () => {
    trapAt(5, 5);
    const piece = hero();

    walkOnto(piece);

    expect(piece.buffs.find('毒')).toBeFalsy();
  });

  it('leaves a piece in the state the ground names', () => {
    trapAt(5, 5, { ailment: '毒' });
    const piece = hero();

    walkOnto(piece);

    expect(buffOf(piece, '毒')).toBeTruthy();
  });

  it('leaves it as the room keeps it, so one poison is every poison', () => {
    ailments.save([
      { ...newStatusAilment('毒'), color: 'red', icon: '☠', rounds: 4, timing: 'roundEnd', effect: '継続 2' },
    ]);
    trapAt(5, 5, { ailment: '毒' });
    const piece = hero();

    walkOnto(piece);

    expect(Number(buffOf(piece, '毒')!.value)).toBe(4);
  });

  it('holds it as long as the ground says, over what the room keeps', () => {
    ailments.save([{ ...newStatusAilment('毒'), rounds: 4 }]);
    trapAt(5, 5, { ailment: '毒', ailmentRounds: 9 });
    const piece = hero();

    walkOnto(piece);

    expect(Number(buffOf(piece, '毒')!.value)).toBe(9);
  });

  it('leaves a piece in a state the room has never heard of, as a plain mark', () => {
    trapAt(5, 5, { ailment: '呪い' });
    const piece = hero();

    walkOnto(piece);

    expect(buffOf(piece, '呪い')).toBeTruthy();
  });

  it('leaves nothing on a piece the ground has nothing to say to', () => {
    trapAt(5, 5, { ailment: '毒', targets: 'npc' });
    const piece = hero();

    walkOnto(piece);

    expect(piece.buffs.find('毒')).toBeFalsy();
  });
});

describe('TriggerFireService and the roll it asks for', () => {
  let service: TriggerFireService;
  let table: GameTable;
  let chat: ChatMessageService;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);
  const spell: TranslateFn = (key, params) => [key, ...Object.values(params ?? {}).map((held) => `${held}`)].join('|');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, { provide: TRANSLATE_FN, useValue: spell }] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
    chat = TestBed.inject(ChatMessageService);
    vi.spyOn(chat, 'sendSystemMessageToMainTab').mockReturnValue(null!);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.restoreAllMocks();
  });

  function trapAt(overrides: Partial<TableTrigger>): void {
    const trigger = new TableTrigger();
    trigger.col = 5;
    trigger.row = 5;
    Object.assign(trigger, overrides);
    trigger.initialize();
    table.appendChild(trigger);
  }

  const spoken = () => vi.mocked(chat.sendSystemMessageToMainTab).mock.calls.map((call) => call[0]);
  const walkOn = () => service.walked(GameCharacter.create('英雄', 1, ''), grid(), [at(4, 5), at(5, 5)]);

  it('asks for nothing where the ground wants no roll', () => {
    trapAt({});

    walkOn();

    expect(spoken().some((line) => line.includes('trigger.asks'))).toBe(false);
  });

  it('asks for the roll the ground wants, with the number it has to reach', () => {
    trapAt({ check: '敏捷', checkTarget: '15' });

    walkOn();

    const asked = spoken().find((line) => line.includes('trigger.asksFor'))!;
    expect(asked).toContain('敏捷');
    expect(asked).toContain('15');
  });

  it('asks for the roll without a number where the ground names none', () => {
    trapAt({ check: '生命抵抗' });

    walkOn();

    expect(spoken().some((line) => line.includes('trigger.asks|'))).toBe(true);
    expect(spoken().some((line) => line.includes('trigger.asksFor'))).toBe(false);
  });

  it('asks before it says what was taken, so the table reads the roll first', () => {
    trapAt({ check: '敏捷', checkTarget: '15', element: 'ライフ', amount: '3' });

    walkOn();

    expect(spoken()[0]).toContain('trigger.asksFor');
  });
});

describe('TriggerFireService and what is heard and seen', () => {
  let service: TriggerFireService;
  let cutIns: CutInService;
  let table: GameTable;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
    cutIns = TestBed.inject(CutInService);
    vi.spyOn(cutIns, 'launch').mockReturnValue(true);
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.restoreAllMocks();
  });

  function trapAt(overrides: Partial<TableTrigger>): void {
    const trigger = new TableTrigger();
    trigger.col = 5;
    trigger.row = 5;
    Object.assign(trigger, overrides);
    trigger.initialize();
    table.appendChild(trigger);
  }

  function cutInNamed(name: string): CutIn {
    const cutIn = new CutIn();
    cutIn.name = name;
    cutIn.initialize();
    return cutIn;
  }

  const walkOn = () => service.walked(GameCharacter.create('英雄', 1, ''), grid(), [at(4, 5), at(5, 5)]);

  it('makes no sound and shows nothing where the ground names neither', () => {
    trapAt({});

    walkOn();

    expect(SoundEffect.play).not.toHaveBeenCalled();
    expect(cutIns.launch).not.toHaveBeenCalled();
  });

  it('plays the cut-in the ground names', () => {
    const shown = cutInNamed('落とし穴');
    trapAt({ cutIn: '落とし穴' });

    walkOn();

    expect(cutIns.launch).toHaveBeenCalledWith(shown);
  });

  it('plays nothing for a name the room answers to twice, since neither is meant', () => {
    cutInNamed('罠');
    cutInNamed('罠');
    trapAt({ cutIn: '罠' });

    walkOn();

    expect(cutIns.launch).not.toHaveBeenCalled();
  });

  it('plays nothing for a name the room does not answer to at all', () => {
    trapAt({ cutIn: '無い' });

    walkOn();

    expect(cutIns.launch).not.toHaveBeenCalled();
  });

  it('shows the cut-in even where the sound is one the room has not got', () => {
    cutInNamed('落とし穴');
    trapAt({ sound: '無い', cutIn: '落とし穴' });

    walkOn();

    expect(SoundEffect.play).not.toHaveBeenCalled();
    expect(cutIns.launch).toHaveBeenCalled();
  });
});

describe('TriggerFireService and the ground that carries a piece away', () => {
  let service: TriggerFireService;
  let table: GameTable;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pitAt(col: number, row: number, overrides: Partial<TableTrigger> = {}): TableTrigger {
    const trigger = new TableTrigger();
    trigger.col = col;
    trigger.row = row;
    trigger.warps = true;
    trigger.warpCol = 1;
    trigger.warpRow = 1;
    Object.assign(trigger, overrides);
    trigger.initialize();
    table.appendChild(trigger);
    return trigger;
  }

  function heroAt(col: number, row: number): GameCharacter {
    const piece = GameCharacter.create('英雄', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    return piece;
  }

  const cellOf = (piece: GameCharacter) => pieceCellOf(grid(), piece, GRID);

  it('carries a piece whose walk ends on it', () => {
    pitAt(5, 5);
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

    expect(cellOf(piece)).toBe(at(1, 1));
  });

  it('leaves a piece that only passes over it where the walk was going', () => {
    pitAt(5, 5, { moment: 'enter' });
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5), at(6, 5)]);

    expect(cellOf(piece)).toBe(at(4, 5));
  });

  it('carries nobody where the ground was not told to', () => {
    pitAt(5, 5, { warps: false });
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

    expect(cellOf(piece)).toBe(at(4, 5));
  });

  it('carries nobody off the edge of the board', () => {
    pitAt(5, 5, { warpCol: 40, warpRow: 40 });
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

    expect(cellOf(piece)).toBe(at(4, 5));
  });

  it('does not set off the ground it lands on during that same walk', () => {
    pitAt(5, 5, { warpCol: 8, warpRow: 8 });
    const second = pitAt(8, 8, { warpCol: 1, warpRow: 1 });
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

    expect(cellOf(piece)).toBe(at(8, 8));
    expect(second.warps).toBe(true);
  });

  it('carries a piece three cells across just as it carries one across the board', () => {
    pitAt(5, 5, { warpCol: 2, warpRow: 9 });
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

    expect(cellOf(piece)).toBe(at(2, 9));
  });

  describe('opening onto another table', () => {
    function floorBelow(gridSize = GRID): GameTable {
      const below = new GameTable();
      below.name = '地下 1 階';
      below.width = 12;
      below.height = 12;
      below.gridSize = gridSize;
      below.initialize();
      return below;
    }

    it('carries the room down with the piece', () => {
      const below = floorBelow();
      pitAt(5, 5, { warpCol: 2, warpRow: 9, warpTable: below.identifier });
      const piece = heroAt(4, 5);

      service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

      expect(TestBed.inject(TableSelecter).viewTableIdentifier).toBe(below.identifier);
      expect(pieceCellOf(cellGridOf(below.width, below.height, GRID, GridType.SQUARE), piece, GRID)).toBe(
        cellIndexOf(cellGridOf(below.width, below.height, GRID, GridType.SQUARE), 2, 9)
      );
    });

    it('sets the piece down by the cells of the table it lands on, not the one it fell from', () => {
      const below = floorBelow(80);
      pitAt(5, 5, { warpCol: 2, warpRow: 9, warpTable: below.identifier });
      const piece = heroAt(4, 5);

      service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

      const landing = cellGridOf(below.width, below.height, 80, GridType.SQUARE);
      expect(pieceCellOf(landing, piece, 80)).toBe(cellIndexOf(landing, 2, 9));
    });

    it('leaves the room where it is where the ground names no table', () => {
      pitAt(5, 5, { warpCol: 2, warpRow: 9 });
      const piece = heroAt(4, 5);

      service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

      expect(TestBed.inject(TableSelecter).viewTableIdentifier).toBe(table.identifier);
    });

    it('opens onto the table it lies on where the one it names is not in this room', () => {
      pitAt(5, 5, { warpCol: 2, warpRow: 9, warpTable: 'a-table-from-another-room' });
      const piece = heroAt(4, 5);

      service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

      expect(TestBed.inject(TableSelecter).viewTableIdentifier).toBe(table.identifier);
      expect(cellOf(piece)).toBe(at(2, 9));
    });
  });
});

describe('TriggerFireService and the ground a turn brings round', () => {
  let service: TriggerFireService;
  let table: GameTable;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TriggerFireService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function fireAt(col: number, row: number, moment: TriggerMoment): void {
    const trigger = new TableTrigger();
    trigger.col = col;
    trigger.row = row;
    trigger.moment = moment;
    trigger.element = 'ライフ';
    trigger.amount = '3';
    trigger.initialize();
    table.appendChild(trigger);
  }

  function heroAt(col: number, row: number, hp = 20): GameCharacter {
    const piece = GameCharacter.create('英雄', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    const resource = DataElement.create('ライフ', hp, { type: DataElementType.NUMBER_RESOURCE, currentValue: hp });
    piece.detailDataElement!.appendChild(resource);
    return piece;
  }

  const hpOf = (piece: GameCharacter) =>
    Number(DataElement.findElementByReference(piece.rootDataElement!, 'ライフ')!.currentValue);

  it('burns a piece standing in it as its turn opens', () => {
    fireAt(5, 5, 'turnStart');
    const piece = heroAt(5, 5);

    service.standingOn(piece, 'turnStart');

    expect(hpOf(piece)).toBe(17);
  });

  it('leaves a piece standing somewhere else alone', () => {
    fireAt(5, 5, 'turnStart');
    const piece = heroAt(2, 2);

    service.standingOn(piece, 'turnStart');

    expect(hpOf(piece)).toBe(20);
  });

  it('tells the opening of a turn from the closing of one', () => {
    fireAt(5, 5, 'turnEnd');
    const piece = heroAt(5, 5);

    service.standingOn(piece, 'turnStart');

    expect(hpOf(piece)).toBe(20);
  });

  it('leaves ground that answers to walking alone when a turn comes round', () => {
    fireAt(5, 5, 'stop');
    const piece = heroAt(5, 5);

    service.standingOn(piece, 'turnStart');
    service.standingOn(piece, 'turnEnd');

    expect(hpOf(piece)).toBe(20);
  });

  it('leaves ground that answers to the round alone when a piece merely walks over it', () => {
    fireAt(5, 5, 'turnStart');
    const piece = heroAt(4, 5);

    service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

    expect(hpOf(piece)).toBe(20);
  });

  it('burns a piece standing in it every turn, since standing is not crossing', () => {
    fireAt(5, 5, 'turnStart');
    const piece = heroAt(5, 5);

    service.standingOn(piece, 'turnStart');
    service.standingOn(piece, 'turnStart');

    expect(hpOf(piece)).toBe(14);
  });
});

describe('TriggerFireService and how often ground has another go', () => {
  let service: TriggerFireService;
  let table: GameTable;
  let turnState: TurnState;

  const grid = () => cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid(), col, row);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    turnState = TestBed.inject(TurnState);
    turnState.round = 1;
    service = TestBed.inject(TriggerFireService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function swampAt(repeat: string): void {
    const trigger = new TableTrigger();
    trigger.col = 5;
    trigger.row = 5;
    trigger.repeat = repeat;
    trigger.element = 'ライフ';
    trigger.amount = '3';
    trigger.initialize();
    table.appendChild(trigger);
  }

  function heroWith(hp = 20): GameCharacter {
    const piece = GameCharacter.create('英雄', 1, '');
    const resource = DataElement.create('ライフ', hp, { type: DataElementType.NUMBER_RESOURCE, currentValue: hp });
    piece.detailDataElement!.appendChild(resource);
    return piece;
  }

  const hpOf = (piece: GameCharacter) =>
    Number(DataElement.findElementByReference(piece.rootDataElement!, 'ライフ')!.currentValue);
  const wadeIn = (piece: GameCharacter) => service.walked(piece, grid(), [at(4, 5), at(5, 5)]);

  it('takes from every piece that wades in, where it has one go apiece', () => {
    swampAt('oncePerPiece');
    const first = heroWith();
    const second = heroWith();

    wadeIn(first);
    wadeIn(second);

    expect(hpOf(first)).toBe(17);
    expect(hpOf(second)).toBe(17);
  });

  it('takes from the same piece once and no more, where it has one go apiece', () => {
    swampAt('oncePerPiece');
    const piece = heroWith();

    wadeIn(piece);
    wadeIn(piece);

    expect(hpOf(piece)).toBe(17);
  });

  it('is spent by whoever reaches it first, where it has one go at all', () => {
    swampAt('once');
    const first = heroWith();
    const second = heroWith();

    wadeIn(first);
    wadeIn(second);

    expect(hpOf(first)).toBe(17);
    expect(hpOf(second)).toBe(20);
  });

  it('comes round again with the round, where it has one go a round', () => {
    swampAt('oncePerRound');
    const piece = heroWith();

    wadeIn(piece);
    wadeIn(piece);
    turnState.round = 2;
    wadeIn(piece);

    expect(hpOf(piece)).toBe(14);
  });

  it('takes as often as it is walked into where nothing was said', () => {
    swampAt('');
    const piece = heroWith();

    wadeIn(piece);
    wadeIn(piece);

    expect(hpOf(piece)).toBe(14);
  });
});
