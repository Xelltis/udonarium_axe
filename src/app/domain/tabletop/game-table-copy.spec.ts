import { selectGameTable$ } from '@axe/core/event/domain-events';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { copyGameTable, freeTableName } from '@axe/domain/tabletop/game-table-copy';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';

describe('copyGameTable', () => {
  function tableWithLayer(): GameTable {
    const table = new GameTable('village');
    table.name = '村';
    table.width = 30;
    table.selected = true;
    table.initialize();
    const layer = new TableBackgroundLayer();
    layer.initialize();
    layer.order = 2;
    layer.placement = 'over';
    table.appendChild(layer);
    return table;
  }

  it('copies the table and what is on it under identifiers of their own, leaving the table as it was', () => {
    const table = tableWithLayer();

    const copy = copyGameTable(table, '村のコピー')!;

    expect(copy).toBeInstanceOf(GameTable);
    expect(copy.identifier).not.toBe(table.identifier);
    expect(copy.name).toBe('村のコピー');
    expect(copy.width).toBe(30);
    expect(copy.backgroundLayers).toHaveLength(1);
    expect(copy.backgroundLayers[0].identifier).not.toBe(table.backgroundLayers[0].identifier);
    expect(copy.backgroundLayers[0].placedOver).toBe(true);
    expect(table.name).toBe('村');
    expect(table.backgroundLayers).toHaveLength(1);
  });

  it('is not shown until somebody picks it, though the table it copies is the one shown', () => {
    const table = tableWithLayer();
    const shown: string[] = [];
    const off = selectGameTable$.subscribe((event) => shown.push(event.identifier));

    const copy = copyGameTable(table, '村のコピー')!;
    off();

    expect(copy.selected).toBe(false);
    expect(shown).toEqual([]);
  });
});

describe('freeTableName', () => {
  it('keeps the name wanted while no table goes by it', () => {
    expect(freeTableName('村のコピー', ['村'])).toBe('村のコピー');
  });

  it('numbers the name from 2 past those taken, so that a scene can find each table by name', () => {
    expect(freeTableName('村のコピー', ['村', '村のコピー'])).toBe('村のコピー (2)');
    expect(freeTableName('村のコピー', ['村', '村のコピー', ' 村のコピー (2) '])).toBe('村のコピー (3)');
  });
});
