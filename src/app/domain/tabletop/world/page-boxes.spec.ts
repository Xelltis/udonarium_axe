import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { COIN_PART, piecePageBoxes } from '@axe/domain/tabletop/world/page-boxes';
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
    expect(die.parts.get('frame')).toEqual({ left: 75, top: 75, width: 50, height: 50, scale: 1 });
    expect(die.parts.get('picture')).toEqual({ left: 90, top: 30, width: 20, height: 40, scale: 1 });
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

    expect(boxes.get('die')!.parts.get('picture')).toEqual({ left: -5, top: -10, width: 10, height: 20, scale: 0.5 });
  });
});
