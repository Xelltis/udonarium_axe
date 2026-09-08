import { TestBed } from '@angular/core/testing';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
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

  it('goes off once for one walk, however much of it crosses the ground', () => {
    trapAt(5, 5, { moment: 'enter', width: 3, height: 3 });
    const hero = heroWith(20);

    const fired = service.walked(hero, grid(), [at(4, 5), at(5, 5), at(6, 5), at(7, 5)]);

    expect(fired.length).toBe(1);
    expect(hpOf(hero)).toBe(17);
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
