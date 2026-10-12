import { movingPointsAsRead, readMovingPoints, writeMovingPoints } from '@axe/domain/tabletop/move/moving-points';

describe('a way told to the room', () => {
  it('is written in whole pixels and read back as written', () => {
    const text = writeMovingPoints([
      { x: 10.4, y: 20.6 },
      { x: 30, y: 40.5 },
    ]);

    expect(text).toBe('10,21 30,41');
    expect(readMovingPoints(text)).toEqual([
      { x: 10, y: 21 },
      { x: 30, y: 41 },
    ]);
  });

  it('leaves out what cannot be read', () => {
    expect(readMovingPoints(' 1,2  x,3 4 5,6 ')).toEqual([
      { x: 1, y: 2 },
      { x: 5, y: 6 },
    ]);
    expect(readMovingPoints('')).toEqual([]);
  });

  it('is measured by the peer walking it as the room reads it', () => {
    expect(movingPointsAsRead([{ x: 0.45, y: 0.6 }])).toEqual([{ x: 0, y: 1 }]);
  });
});
