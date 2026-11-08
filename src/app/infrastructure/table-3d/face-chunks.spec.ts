import type { TableWorldCap, TableWorldWall } from '@axe/domain/tabletop/world/table-world';
import { changedChunks, chunkSignatures, facesByOwner } from '@axe/infrastructure/table-3d/face-chunks';

const GRID = 50;
const look = { pictureUrl: '', tilePx: 0, glass: false };

function wall(id: string, x: number, y: number): TableWorldWall {
  return { ...look, id, ax: x, ay: y, bx: x + 50, by: y, basePx: 0, topPx: 50 };
}

function cap(id: string, x: number, y: number): TableWorldCap {
  return {
    ...look,
    id,
    outline: [
      { x, y },
      { x: x + 50, y },
      { x: x + 50, y: y + 50 },
    ],
    zPx: 50,
    facing: 'up',
  };
}

describe('the chunks the table’s faces are drawn in', () => {
  it('keeps a block’s faces together, in the chunk its first point stands in', () => {
    const owned = facesByOwner(
      [wall('a:north', 790, 10), wall('a:east', 810, 10), wall('table:north', 0, 0)],
      [cap('a:top', 790, 10)],
      GRID
    );

    expect([...owned.keys()]).toEqual(['a', 'table']);
    expect(owned.get('a')).toMatchObject({ chunk: '0,0' });
    expect(owned.get('a')!.walls).toHaveLength(2);
    expect(owned.get('a')!.caps).toHaveLength(1);
  });

  it('builds again only the chunks where a block came, went or changed', () => {
    const layout = (blockAt: number, other = 0) =>
      chunkSignatures(
        facesByOwner(
          [wall('a:north', blockAt, 10), wall('b:north', 1700, 10 + other)],
          [cap('a:top', blockAt, 10)],
          GRID
        )
      );

    const before = layout(100);
    expect(changedChunks(before, layout(100))).toEqual([]);
    expect(changedChunks(before, layout(150))).toEqual(['0,0']);
    expect(changedChunks(before, layout(900)).sort()).toEqual(['0,0', '1,0']);
    expect(changedChunks(before, layout(100, 5))).toEqual(['2,0']);
  });
});
