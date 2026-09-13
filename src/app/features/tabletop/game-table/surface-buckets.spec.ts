import { TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { bucketBySurface, DrawnSurfaces } from '@axe/features/tabletop/game-table/surface-buckets';

describe('bucketBySurface', () => {
  const on = (surface?: string) => ({ location: { surface } });
  const drawing = (walls: TableSurface[] = [], boards: string[] = []): DrawnSurfaces => ({
    walls: new Set(walls),
    boards: new Set(boards),
  });

  it('puts a piece on the face it says it is on', () => {
    const wall = on('north-wall');
    const floor = on(undefined);

    const buckets = bucketBySurface([wall, floor], drawing(['north-wall']));

    expect(buckets['north-wall']).toEqual([wall]);
    expect(buckets.floor).toEqual([floor]);
  });

  it('leaves a board to draw what stands on it', () => {
    const onBoard = on('board-1');

    const buckets = bucketBySurface([onBoard], drawing([], ['board-1']));

    expect(Object.values(buckets).flat()).toEqual([]);
  });

  it('brings a piece back to the floor when its wall is not being drawn', () => {
    const stranded = on('north-wall');

    const buckets = bucketBySurface([stranded], drawing(['south-wall']));

    expect(buckets.floor).toEqual([stranded]);
    expect(buckets['north-wall']).toEqual([]);
  });

  it('brings a piece back to the floor when its board is no longer on the table', () => {
    const stranded = on('board-that-went-away');

    const buckets = bucketBySurface([stranded], drawing());

    expect(buckets.floor).toEqual([stranded]);
  });

  it('keeps every face, so a face with nothing on it is still a face', () => {
    const buckets = bucketBySurface([], drawing());

    expect(Object.keys(buckets).sort()).toEqual(['east-wall', 'floor', 'north-wall', 'south-wall', 'west-wall']);
  });

  it('reads a face it does not know as the floor', () => {
    const odd = on('ceiling');

    const buckets = bucketBySurface([odd], drawing());

    expect(buckets.floor).toEqual([odd]);
  });
});
