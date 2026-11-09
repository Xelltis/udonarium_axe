import {
  CANVASES_OVER_ALL,
  FACES_OVER_FLOOR,
  LAID_OVER_FACES,
  LAYERS_OVER_BOARD,
} from '@axe/infrastructure/table-3d/floor-order';

describe('what is drawn ahead of what on the floor', () => {
  it('draws each of the board’s layers, the faces of the blocks, the grid and the floor’s canvases ahead of the one before', () => {
    const order = [LAYERS_OVER_BOARD, FACES_OVER_FLOOR, LAID_OVER_FACES, CANVASES_OVER_ALL];
    let back = { polygonOffsetFactor: 0, polygonOffsetUnits: 0 };

    for (const front of order) {
      expect(front.polygonOffset).toBe(true);
      expect(front.polygonOffsetFactor).toBeLessThanOrEqual(back.polygonOffsetFactor);
      expect(front.polygonOffsetUnits).toBeLessThan(back.polygonOffsetUnits);
      back = front;
    }
  });
});
