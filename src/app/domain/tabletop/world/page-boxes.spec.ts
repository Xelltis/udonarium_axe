import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  blockPageBoxes,
  COIN_PART,
  drawnRanks,
  piecePageBoxes,
  quadMatrix,
  TOP_PART,
} from '@axe/domain/tabletop/world/page-boxes';
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

  it('boxes a range following the raised ground round where it lies over the ground', () => {
    const tilted = new Matrix3D().identity();
    tilted.m32 = -1;
    const range = sprite('range#picture', {
      kind: 'range',
      centre: { x: 100, y: 100, z: 1 },
      widthPx: 50,
      heightPx: 50,
      facing: { across: FLOOR.u, down: FLOOR.v },
      order: 1,
      drapes: { liftPx: 1 },
    });
    const groundAt = (x: number) => (x >= 100 ? 20 : 0);

    const flat = piecePageBoxes([range], [], tilted, EYE).get('range')!.parts.get('picture')!;
    const over = piecePageBoxes([range], [], tilted, EYE, groundAt).get('range')!.parts.get('picture')!;

    expect(flat.top).toBe(74);
    expect(over.top).toBe(54);
    expect(over.corners).toEqual([
      { x: 75, y: 74 },
      { x: 125, y: 54 },
      { x: 125, y: 104 },
      { x: 75, y: 124 },
    ]);
  });

  it('boxes a part by the box of the piece its picture stands for, where the picture reaches past it', () => {
    const boxes = piecePageBoxes(
      [
        sprite('hero#pedestal', {
          centre: { x: 100, y: 100, z: 1 },
          widthPx: 90,
          heightPx: 80,
          facing: { across: FLOOR.u, down: FLOOR.v },
          box: { left: 20, top: 15, width: 50, height: 50 },
        }),
      ],
      [],
      scene,
      EYE
    );

    expect(boxes.get('hero')!.parts.get('pedestal')).toMatchObject({ left: 75, top: 75, width: 50, height: 50 });
  });

  it('keeps how large a part drawn with one sprite is on the table, by the box of the piece where it has one', () => {
    const boxes = piecePageBoxes(
      [
        sprite('card#face', { widthPx: 60, heightPx: 90, facing: { across: FLOOR.u, down: FLOOR.v } }),
        sprite('hero#pedestal', {
          widthPx: 90,
          heightPx: 80,
          facing: { across: FLOOR.u, down: FLOOR.v },
          box: { left: 20, top: 15, width: 50, height: 40 },
        }),
        sprite('deck#top', {}),
        sprite('deck#top', { centre: { x: 30, y: 0, z: 0 } }),
      ],
      [],
      scene,
      EYE
    );

    expect(boxes.get('card')!.parts.get('face')!.size).toEqual({ width: 60, height: 90 });
    expect(boxes.get('hero')!.parts.get('pedestal')!.size).toEqual({ width: 50, height: 40 });
    expect(boxes.get('deck')!.parts.get('top')!.size).toBeUndefined();
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

describe('drawnRanks', () => {
  const ON_FLOOR = { across: FLOOR.u, down: FLOOR.v };
  const WALL = { across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 0, z: -1 } };
  /** A table seen tilted, so that the further down the board a point lies the nearer the eye it is. */
  const tilted = (() => {
    const scene = new Matrix3D().identity();
    scene.m23 = 0.5;
    return scene;
  })();

  function ranksOf(sprites: TableWorldSprite[], groundAt?: (x: number, y: number) => number): Record<string, number> {
    return Object.fromEntries(drawnRanks(piecePageBoxes(sprites, [], tilted, EYE, groundAt)));
  }

  function lyingAt(id: string, y: number, order: number, facing = ON_FLOOR): TableWorldSprite {
    return sprite(id, { centre: { x: 100, y, z: order }, widthPx: 60, heightPx: 90, facing, order });
  }

  it('draws the nearer of two pieces over the other', () => {
    const ranks = ranksOf([
      sprite('far#picture', { centre: { x: 100, y: 100, z: 20 } }),
      sprite('near#picture', { centre: { x: 100, y: 300, z: 20 } }),
    ]);

    expect(ranks).toEqual({ far: 1, near: 2 });
  });

  it('draws a card lying over another over it, however much nearer the eye the one under it reaches', () => {
    expect(ranksOf([lyingAt('under#face', 200, 0.15), lyingAt('over#face', 150, 0.151)])).toEqual({
      under: 1,
      over: 2,
    });
  });

  it('draws the later of two cards lying as high over the earlier, as the canvas draws them', () => {
    expect(ranksOf([lyingAt('earlier#face', 200, 0.15), lyingAt('later#face', 150, 0.15)])).toEqual({
      earlier: 1,
      later: 2,
    });
  });

  it('takes a stack by the last drawn of the things it lies in', () => {
    const ranks = ranksOf([
      lyingAt('deck#layer-0', 200, 1),
      lyingAt('card#face', 300, 2),
      lyingAt('deck#plate', 200, 3),
    ]);

    expect(ranks).toEqual({ card: 1, deck: 2 });
  });

  it('draws the cards on the ground under a piece standing and a card posted on a wall, and stacks them among themselves', () => {
    const ranks = ranksOf([
      lyingAt('under#face', 400, 0.15),
      sprite('hero#pedestal', { centre: { x: 100, y: 300, z: 0.5 }, facing: ON_FLOOR, order: 0.5 }),
      sprite('hero#picture', { centre: { x: 100, y: 300, z: 30 } }),
      lyingAt('posted#face', 100, 0.2, WALL),
      lyingAt('over#face', 50, 0.16),
    ]);

    expect(ranks).toEqual({ under: 1, over: 2, posted: 3, hero: 4 });
  });

  it('draws a piece standing on a range over the range, however much nearer the eye the range reaches', () => {
    const ranks = ranksOf([
      sprite('range#picture', {
        centre: { x: 100, y: 300, z: 0.25 },
        widthPx: 400,
        heightPx: 400,
        facing: ON_FLOOR,
        order: 0.25,
        drapes: { liftPx: 0.25 },
      }),
      sprite('hero#picture', { centre: { x: 100, y: 300, z: 30 } }),
      lyingAt('flat#face', 450, 0.15),
    ]);

    expect(ranks).toEqual({ flat: 1, range: 2, hero: 3 });
  });

  it('draws a range raised over the ground it follows among the pieces by how near the eye it reaches', () => {
    const ranks = ranksOf([
      sprite('range#picture', {
        centre: { x: 100, y: 300, z: 100.25 },
        widthPx: 400,
        heightPx: 400,
        facing: ON_FLOOR,
        order: 100.25,
        drapes: { liftPx: 100.25 },
      }),
      sprite('hero#picture', { centre: { x: 100, y: 300, z: 30 } }),
    ]);

    expect(ranks).toEqual({ hero: 1, range: 2 });
  });

  it('takes a card lying on the raised ground as on the ground, and one floating over a hollow as not', () => {
    const groundAt = (x: number) => (x < 150 ? 50 : 0);
    const ranks = ranksOf(
      [
        lyingAt('onHill#face', 450, 50.15),
        sprite('hero#picture', { centre: { x: 100, y: 300, z: 80 } }),
        sprite('floating#face', {
          centre: { x: 200, y: 450, z: 50.15 },
          widthPx: 60,
          heightPx: 90,
          facing: ON_FLOOR,
          order: 50.15,
        }),
      ],
      groundAt
    );

    expect(ranks).toEqual({ onHill: 1, hero: 2, floating: 3 });
  });

  it('draws a card lying on a block’s top among the pieces by how near the eye it reaches', () => {
    const ranks = ranksOf([
      sprite('hero#picture', { centre: { x: 100, y: 300, z: 30 } }),
      lyingAt('raised#face', 350, 50),
    ]);

    expect(ranks).toEqual({ hero: 1, raised: 2 });
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

describe('blockPageBoxes', () => {
  const scene = new Matrix3D().identity();

  it('boxes a block round its top and its foot, and its top with the corners of a square one', () => {
    const boxes = blockPageBoxes(
      [
        {
          id: 'block',
          layer: 'terrain',
          order: 0,
          shapes: [
            {
              kind: 'prism',
              outline: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 50 },
                { x: 0, y: 50 },
              ],
              base: 0,
              top: 40,
            },
          ],
        },
      ],
      scene,
      EYE
    );

    const block = boxes.get('block')!;
    expect(block.whole).toEqual({ left: 0, top: 0, width: 100, height: 50 });
    expect(block.parts.get(TOP_PART)!.corners).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ]);
    expect(block.nearness).toBe(40);
  });

  it('boxes a block on a face where the face carries it, and a top of more than four corners whole', () => {
    const lifted = { ...FLOOR, origin: { x: 10, y: 20, z: 30 } };
    const hexagon = Array.from({ length: 6 }, (_, i) => ({
      x: Math.cos((i * Math.PI) / 3) * 10,
      y: Math.sin((i * Math.PI) / 3) * 10,
    }));
    const boxes = blockPageBoxes(
      [
        {
          id: 'hex',
          layer: 'terrain',
          order: 0,
          shapes: [{ kind: 'on-face', frame: lifted, shape: { kind: 'prism', outline: hexagon, base: 0, top: 5 } }],
        },
      ],
      scene,
      EYE
    );

    const top = boxes.get('hex')!.parts.get(TOP_PART)!;
    expect(top.left).toBeCloseTo(0, 6);
    expect(top.width).toBeCloseTo(20, 6);
    expect(top.corners).toBeUndefined();
  });
});
