import {
  CANVASES_OVER_ALL,
  FACES_OVER_FLOOR,
  type FloorPull,
  LAID_OVER_FACES,
  LAYERS_OVER_BOARD,
  SHEETS_OVER_FACES,
  withoutSlant,
} from '@axe/infrastructure/table-3d/floor-order';

/** Expects each pull to draw ahead of the one before, from the board, which is not pulled. */
function expectEachAhead(order: readonly FloorPull[]): void {
  let back = { polygonOffsetFactor: 0, polygonOffsetUnits: 0 };

  for (const front of order) {
    expect(front.polygonOffset).toBe(true);
    expect(front.polygonOffsetFactor).toBeLessThanOrEqual(back.polygonOffsetFactor);
    expect(front.polygonOffsetUnits).toBeLessThan(back.polygonOffsetUnits);
    back = front;
  }
}

describe('what is drawn ahead of what on the floor', () => {
  it('draws each of the board’s layers, the faces of the blocks, the sheets, the grid and the floor’s canvases ahead of the one before', () => {
    expectEachAhead([LAYERS_OVER_BOARD, FACES_OVER_FLOOR, SHEETS_OVER_FACES, LAID_OVER_FACES, CANVASES_OVER_ALL]);
  });

  it('keeps the faces of the blocks clear of the floor, the sheets stood against them and what is laid over them in the same order, by the steps alone', () => {
    const faces = withoutSlant(FACES_OVER_FLOOR);
    const sheets = withoutSlant(SHEETS_OVER_FACES);

    expectEachAhead([faces, sheets, LAID_OVER_FACES]);
    expect([faces.polygonOffsetFactor, sheets.polygonOffsetFactor]).toEqual([0, 0]);
    expect([faces.polygonOffsetUnits, sheets.polygonOffsetUnits]).toEqual([
      FACES_OVER_FLOOR.polygonOffsetUnits,
      SHEETS_OVER_FACES.polygonOffsetUnits,
    ]);
  });
});
