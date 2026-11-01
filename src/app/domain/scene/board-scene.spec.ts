import { BoardScene } from '@axe/domain/scene/board-scene';
import { GameTable } from '@axe/domain/tabletop/game-table';

describe('BoardScene', () => {
  it('saves the name its table goes by now, for the scene to find it by after the save is read back', () => {
    const table = new GameTable();
    table.name = '村';
    table.initialize();
    const scene = new BoardScene('night-village');
    scene.tableIdentifier = table.identifier;
    scene.tableName = '村';
    scene.initialize();
    table.name = '燃える村';

    const xml = scene.toXml();

    expect(xml).toContain('identifier="night-village"');
    expect(xml).toContain('tableName="燃える村"');
    table.destroy();
    scene.destroy();
  });
});
