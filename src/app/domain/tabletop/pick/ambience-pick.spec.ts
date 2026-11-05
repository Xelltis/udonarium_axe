import { TableRay } from '@axe/domain/tabletop/camera/table-camera';
import { AMBIENCE_PICK_LAYER, ambiencePickTarget } from '@axe/domain/tabletop/pick/ambience-pick';
import { pickFirst, PickTarget } from '@axe/domain/tabletop/pick/pick-index';

const down = (x: number, y: number): TableRay => ({ origin: { x, y, z: 1000 }, direction: { x: 0, y: 0, z: -1 } });

describe('ambience pick target', () => {
  it('covers the rectangle of the board the look is laid over, on the floor, and nothing beside it', () => {
    const look = ambiencePickTarget('a-marsh', 100, 50, 200, 150);

    const hit = pickFirst([look], down(150, 100))!;

    expect(hit.target).toMatchObject({ id: 'a-marsh', layer: AMBIENCE_PICK_LAYER, surface: 'floor' });
    expect(hit.point.z).toBeCloseTo(0, 9);
    expect(pickFirst([look], down(310, 100))).toBeNull();
    expect(pickFirst([look], down(150, 210))).toBeNull();
  });

  it('lies behind a piece lying on the floor in it', () => {
    const look = ambiencePickTarget('a-marsh', 0, 0, 200, 200);
    const card: PickTarget = {
      id: 'a-card',
      layer: 'card',
      order: 0,
      shapes: [
        {
          kind: 'quad',
          corners: [
            { x: 50, y: 50, z: 0.15 },
            { x: 100, y: 50, z: 0.15 },
            { x: 100, y: 120, z: 0.15 },
            { x: 50, y: 120, z: 0.15 },
          ],
        },
      ],
    };

    expect(pickFirst([look, card], down(70, 70))?.target.id).toBe('a-card');
    expect(pickFirst([card, look], down(70, 70))?.target.id).toBe('a-card');
    expect(pickFirst([look, card], down(150, 150))?.target.id).toBe('a-marsh');
  });
});
