import { tableFocusPoint } from '@axe/domain/tabletop/table-focus-point';
import { TabletopLocation } from '@axe/domain/tabletop/tabletop-object';

const dims = { widthPx: 1000, depthPx: 800, wallHeightPx: 300 };

function at(x: number, y: number, surface?: string): { location: TabletopLocation } {
  return { location: { name: 'table', x, y, surface } };
}

function boardsFrom(boards: Record<string, { location: TabletopLocation }>) {
  return (identifier: string) => boards[identifier] ?? null;
}

const noBoards = boardsFrom({});

describe('tableFocusPoint', () => {
  it('leaves a piece on the floor where it is', () => {
    expect(tableFocusPoint(at(120, 80), dims, noBoards)).toEqual({ x: 120, y: 80 });
  });

  it('reads a face left behind as the floor', () => {
    expect(tableFocusPoint(at(120, 80, 'null'), dims, noBoards)).toEqual({ x: 120, y: 80 });
  });

  it('brings a piece on each wall to the foot of that wall', () => {
    expect(tableFocusPoint(at(120, 80, 'north-wall'), dims, noBoards)).toEqual({ x: 120, y: 0 });
    expect(tableFocusPoint(at(120, 80, 'south-wall'), dims, noBoards)).toEqual({ x: 1000 - 120, y: 800 });
    expect(tableFocusPoint(at(120, 80, 'west-wall'), dims, noBoards)).toEqual({ x: 0, y: 800 - 120 });
    expect(tableFocusPoint(at(120, 80, 'east-wall'), dims, noBoards)).toEqual({ x: 1000, y: 120 });
  });

  it('shows a piece on a board where the board stands, following the board onto its wall', () => {
    const boards = boardsFrom({ board: at(40, 60, 'north-wall') });

    expect(tableFocusPoint(at(5, 5, 'board'), dims, boards)).toEqual({ x: 40, y: 0 });
  });

  it('keeps a piece at its own coordinates when its board cannot be found', () => {
    expect(tableFocusPoint(at(5, 5, 'gone'), dims, noBoards)).toEqual({ x: 5, y: 5 });
  });

  it('stops at boards that stand on one another in a ring', () => {
    const boards = boardsFrom({ a: at(10, 20, 'b'), b: at(30, 40, 'a') });

    expect(tableFocusPoint(at(5, 5, 'a'), dims, boards)).toEqual({ x: 30, y: 40 });
  });
});
