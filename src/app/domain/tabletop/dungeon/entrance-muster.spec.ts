import { generateDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { cellAt, DungeonCell, DungeonLayout, DungeonPoint } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { musterCells } from '@axe/domain/tabletop/dungeon/entrance-muster';

function dungeon(seed = 7): DungeonLayout {
  return generateDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed });
}

function walk(from: DungeonPoint, to: DungeonPoint): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

describe('where a party stands when it walks in', () => {
  it('stands the first of them on the way in itself', () => {
    const layout = dungeon();

    expect(musterCells(layout, layout.entrance, 1)).toEqual([layout.entrance]);
  });

  it('gives every one of them a cell of their own', () => {
    const layout = dungeon();
    const cells = musterCells(layout, layout.entrance, 6);
    const seen = new Set(cells.map((cell) => `${cell.x},${cell.y}`));

    expect(cells.length).toBe(6);
    expect(seen.size).toBe(6);
  });

  it('stands them all on ground a piece may stand on', () => {
    for (const seed of [1, 7, 42]) {
      const layout = dungeon(seed);
      for (const cell of musterCells(layout, layout.entrance, 8)) {
        const on = cellAt(layout, cell.x, cell.y);

        expect(on === DungeonCell.Room || on === DungeonCell.Corridor).toBe(true);
      }
    }
  });

  it('keeps them together, taking the nearest ground first', () => {
    const layout = dungeon();
    const cells = musterCells(layout, layout.entrance, 8);

    for (let index = 1; index < cells.length; index++) {
      expect(walk(cells[index], layout.entrance)).toBeGreaterThanOrEqual(walk(cells[index - 1], layout.entrance));
    }
  });

  it('asks for nobody and answers with nowhere', () => {
    const layout = dungeon();

    expect(musterCells(layout, layout.entrance, 0)).toEqual([]);
  });

  it('answers with nothing at all from a place outside the board', () => {
    const layout = dungeon();

    expect(musterCells(layout, { x: -5, y: -5 }, 4)).toEqual([]);
  });

  it('hands back what ground there is where a party outgrows it', () => {
    const layout: DungeonLayout = {
      width: 5,
      height: 5,
      cells: new Uint8Array(25).fill(DungeonCell.Rock),
      rooms: [],
      doors: [],
      links: [],
      entrance: { x: 2, y: 2 },
      exit: { x: 2, y: 2 },
      mouth: null,
      keyRoomIndex: -1,
      seed: 1,
    };
    layout.cells[2 * 5 + 2] = DungeonCell.Room;
    layout.cells[2 * 5 + 3] = DungeonCell.Room;

    expect(musterCells(layout, layout.entrance, 5).length).toBe(2);
  });
});
