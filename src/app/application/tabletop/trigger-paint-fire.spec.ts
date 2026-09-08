import { TestBed } from '@angular/core/testing';
import { FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
import { DEFAULT_FUNCTION_SPEC, FunctionPaintPlan } from '@axe/domain/tabletop/function-paint';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { triggersOn } from '@axe/domain/tabletop/table-trigger';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

/** Painting a trap and then walking a piece into it, the way a session does it. */
describe('painting ground that goes off and then walking into it', () => {
  let paint: FunctionalPaintService;
  let fire: TriggerFireService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    paint = TestBed.inject(FunctionalPaintService);
    fire = TestBed.inject(TriggerFireService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function planWith(over: Partial<FunctionPaintPlan> = {}): FunctionPaintPlan {
    return {
      blocked: [],
      terrain: { add: [], remove: [] },
      mask: { add: [], remove: [] },
      trigger: { add: [], remove: [] },
      ...over,
    };
  }

  it('lays the painted ground on the table and takes what it says when a piece is put on it', () => {
    paint.apply(
      planWith({
        trigger: {
          add: [
            {
              col: 5,
              row: 5,
              width: 1,
              height: 1,
              spec: { ...DEFAULT_FUNCTION_SPEC.trigger, name: '落とし穴', element: 'ライフ', amount: '4' },
            },
          ],
          remove: [],
        },
      })
    );

    expect(triggersOn(table).length).toBe(1);

    const hero = GameCharacter.create('英雄', 1, '');
    hero.detailDataElement!.appendChild(
      DataElement.create('ライフ', 20, { type: DataElementType.NUMBER_RESOURCE, currentValue: 20 })
    );
    hero.location = { name: 'table', x: 4 * GRID, y: 5 * GRID };

    fire.pickedUp(hero);
    hero.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    const fired = fire.putDown(hero);

    expect(fired.length).toBe(1);
    expect(Number(DataElement.findElementByReference(hero.rootDataElement!, 'ライフ')!.currentValue)).toBe(16);
  });
});
