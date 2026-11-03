import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { tableLayersOf } from '@axe/domain/tabletop/world/table-layers';

describe('the layers a table lays under and over its board', () => {
  let table: GameTable;

  beforeEach(() => {
    table = new GameTable();
    table.initialize();
  });

  afterEach(() => table.destroy());

  function lay(
    options: Partial<Pick<TableBackgroundLayer, 'order' | 'placement' | 'speedX' | 'opacity' | 'enabled'>> = {}
  ) {
    const layer = new TableBackgroundLayer();
    layer.initialize();
    layer.imageIdentifier = `picture-${table.children.length}`;
    Object.assign(layer, options);
    table.appendChild(layer);
    return layer;
  }

  const pictures = (identifier: string) => `blob:${identifier}`;

  it('lays those under the board first and those over it after, each run back to front', () => {
    const over = lay({ order: 0, placement: 'over' });
    const back = lay({ order: 1 });
    const front = lay({ order: 2 });

    expect(tableLayersOf(table, pictures, true).map((layer) => [layer.id, layer.over])).toEqual([
      [back.identifier, false],
      [front.identifier, false],
      [over.identifier, true],
    ]);
  });

  it('leaves out a layer turned off, one seen through entirely, one behind the whole table and one with no picture', () => {
    lay({ enabled: false });
    lay({ opacity: 0 });
    lay({ placement: 'backdrop' });
    const shown = lay();

    expect(tableLayersOf(table, pictures, true).map((layer) => layer.id)).toEqual([shown.identifier]);
    expect(tableLayersOf(table, () => '', true)).toEqual([]);
  });

  it('drifts a layer as fast as it says, and holds it still where nothing on the table may move', () => {
    lay({ speedX: 40 });

    expect(tableLayersOf(table, pictures, true)[0].speedX).toBe(40);
    expect(tableLayersOf(table, pictures, false)[0].speedX).toBe(0);
  });

  it('lays nothing for no table', () => {
    expect(tableLayersOf(null, pictures, true)).toEqual([]);
  });
});
