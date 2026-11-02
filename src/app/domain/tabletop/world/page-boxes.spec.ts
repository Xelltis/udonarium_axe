import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { COIN_PART, piecePageBoxes, quadMatrix } from '@axe/domain/tabletop/world/page-boxes';
import { TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

const FLOOR = {
  origin: { x: 0, y: 0, z: 0 },
  u: { x: 1, y: 0, z: 0 },
  v: { x: 0, y: 1, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
};
const EYE = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 } };

function sprite(id: string, overrides: Partial<TableWorldSprite>): TableWorldSprite {
  return {
    id,
    owner: id.split('#')[0],
    kind: 'dice-symbol',
    centre: { x: 0, y: 0, z: 0 },
    widthPx: 10,
    heightPx: 10,
    facing: 'eye',
    look: { kind: 'picture', url: 'a.png' },
    brightness: 1,
    twoSided: true,
    ...overrides,
  };
}

describe('piecePageBoxes', () => {
  const scene = new Matrix3D().identity();

  it('boxes each part of a piece where it is drawn, and the whole piece round them all', () => {
    const boxes = piecePageBoxes(
      [
        sprite('die#frame', {
          centre: { x: 100, y: 100, z: 1 },
          widthPx: 50,
          heightPx: 50,
          facing: { across: FLOOR.u, down: FLOOR.v },
        }),
        sprite('die#picture', { centre: { x: 100, y: 50, z: 25 }, widthPx: 20, heightPx: 40 }),
      ],
      [],
      scene,
      EYE
    );

    const die = boxes.get('die')!;
    expect(die.parts.get('frame')).toMatchObject({ left: 75, top: 75, width: 50, height: 50, scale: 1 });
    expect(die.parts.get('picture')).toMatchObject({ left: 90, top: 30, width: 20, height: 40, scale: 1 });
    expect(die.parts.get('frame')!.corners).toEqual([
      { x: 75, y: 75 },
      { x: 125, y: 75 },
      { x: 125, y: 125 },
      { x: 75, y: 125 },
    ]);
    expect(die.whole).toEqual({ left: 75, top: 30, width: 50, height: 95 });
    expect(die.nearness).toBe(25);
  });

  it('boxes a part made of more than one sprite whole', () => {
    const boxes = piecePageBoxes(
      [sprite('deck#top', { centre: { x: 0, y: 0, z: 0 } }), sprite('deck#top', { centre: { x: 30, y: 0, z: 0 } })],
      [],
      scene,
      EYE
    );

    expect(boxes.get('deck')!.parts.get('top')).toMatchObject({ left: -5, width: 40 });
    expect(boxes.get('deck')!.parts.get('top')!.corners).toBeUndefined();
  });

  it('boxes a coin round its rims', () => {
    const coin: TableWorldCoin = {
      id: 'coin',
      face: FLOOR,
      x: 200,
      y: 200,
      base: 0,
      radiusPx: 10,
      thicknessPx: 2,
      rotateDeg: 0,
      outer: { side: 'front', pictureUrl: '' },
      inner: { side: 'back', pictureUrl: '' },
      backUp: false,
    };

    const box = piecePageBoxes([], [coin], scene, EYE).get('coin')!.parts.get(COIN_PART)!;

    expect(box.left).toBeCloseTo(190, 6);
    expect(box.top).toBeCloseTo(190, 6);
    expect(box.width).toBeCloseTo(20, 6);
    expect(box.height).toBeCloseTo(20, 6);
  });

  it('says how much smaller a part is drawn where the view draws the table smaller', () => {
    const halved = new Matrix3D().identity();
    halved.m11 = 0.5;
    halved.m22 = 0.5;

    const boxes = piecePageBoxes([sprite('die#picture', { widthPx: 20, heightPx: 40 })], [], halved, EYE);

    expect(boxes.get('die')!.parts.get('picture')).toMatchObject({
      left: -5,
      top: -10,
      width: 10,
      height: 20,
      scale: 0.5,
    });
  });
});

describe('quadMatrix', () => {
  function drawn(matrix: number[], x: number, y: number) {
    const w = matrix[3] * x + matrix[7] * y + matrix[15];
    return { x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w, y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w };
  }

  it('draws the corners of a box onto the corners given, in perspective', () => {
    const corners = [
      { x: 110, y: 40 },
      { x: 190, y: 45 },
      { x: 230, y: 160 },
      { x: 60, y: 150 },
    ] as const;
    const matrix = quadMatrix(200, 100, corners)!;

    const ends = [drawn(matrix, 0, 0), drawn(matrix, 200, 0), drawn(matrix, 200, 100), drawn(matrix, 0, 100)];
    ends.forEach((end, at) => {
      expect(end.x).toBeCloseTo(corners[at].x, 6);
      expect(end.y).toBeCloseTo(corners[at].y, 6);
    });
  });

  it('has nothing for a box of no size, or corners all in a line', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ] as const;
    expect(quadMatrix(0, 10, square)).toBeNull();
    expect(
      quadMatrix(10, 10, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ])
    ).toBeNull();
  });
});
