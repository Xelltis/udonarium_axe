import { type FaceLook, faceMaterialOf, lookOf, pictureOfLook } from '@axe/infrastructure/table-3d/face-materials';
import { LAYERS_OVER_BOARD } from '@axe/infrastructure/table-3d/floor-order';
import { BackSide, DoubleSide, FrontSide, type Material, Texture } from 'three/webgpu';

/** How far ahead a material is pulled, in steps of the slant and of the depth; the board is not pulled. */
function pullOf(material: Material): [number, number] {
  return material.polygonOffset ? [material.polygonOffsetFactor, material.polygonOffsetUnits] : [0, 0];
}

/** Whether one pull draws a face ahead of another lying in the same plane, however steeply it is seen. */
function ahead(front: [number, number], back: [number, number]): boolean {
  return front[0] <= back[0] && front[1] < back[1];
}

function made(face: FaceLook): Material {
  return faceMaterialOf(
    face,
    () => new Texture(),
    () => undefined
  );
}

const BOARD: [number, number] = [0, 0];

/** Each thing a face may wear. */
const WEARS: FaceLook[] = [
  { pictureUrl: 'crate.png', tilePx: 0, glass: false },
  { pictureUrl: 'stone.png', tilePx: 50, glass: false },
  { pictureUrl: '', tilePx: 0, glass: false, colour: '#884422' },
  { pictureUrl: '', tilePx: 0, glass: true },
  { pictureUrl: '', tilePx: 0, glass: false },
];

/** The ways a face lies level: a top, an underside, and a top given the heights of its corners, all one. */
const LEVEL: Partial<FaceLook>[] = [{ facing: 'up' }, { facing: 'down' }, { facing: 'up', heights: [40, 40, 40] }];

/** The ways a face does not: a side standing upright, and a piece of a slope looking up. */
const ASLANT: Partial<FaceLook>[] = [{}, { facing: 'up', heights: [40, 100, 100, 40] }];

/** The top of a block sunk into the floor up to its top. */
const SUNK_TOP: Partial<FaceLook> = { facing: 'up', onFloor: true };

/** The faces lying level in the floor's plane or on another level face: a sheet's flat faces, and a sunk block's top. */
const LYING_ON: Partial<FaceLook>[] = [
  ...LEVEL.flatMap((lie): Partial<FaceLook>[] => [
    { ...lie, sheet: 'outside' },
    { ...lie, sheet: 'both' },
  ]),
  SUNK_TOP,
];

/** Every other face of a block: one lying level clear of the floor, and one standing upright or on a slope, a sheet's or not. */
const LYING_CLEAR: Partial<FaceLook>[] = [
  ...LEVEL,
  ...ASLANT.flatMap((lie): Partial<FaceLook>[] => [lie, { ...lie, sheet: 'outside' }, { ...lie, sheet: 'both' }]),
];

describe('the materials the faces of the blocks are drawn with', () => {
  it('draws a face ahead of the board whatever it wears, so a block made as high as nothing hides the board', () => {
    for (const face of WEARS) {
      for (const lie of [...LYING_ON, ...LYING_CLEAR]) {
        expect(ahead(pullOf(made({ ...face, ...lie })), BOARD), JSON.stringify({ face, lie })).toBe(true);
      }
    }
  });

  it('draws a picture laid over a face ahead of the face it is laid over', () => {
    const over = pullOf(made({ pictureUrl: 'moss.png', tilePx: 0, glass: false, laidOver: true }));

    for (const lie of [...LYING_ON, ...LYING_CLEAR]) {
      const face = pullOf(made({ pictureUrl: 'crate.png', tilePx: 0, glass: false, ...lie }));
      expect(ahead(over, face), JSON.stringify(lie)).toBe(true);
    }
  });

  it('pulls a face lying level in the floor’s plane or on another level face ahead by how steeply it is seen as well', () => {
    for (const face of WEARS) {
      for (const lie of LYING_ON) {
        const [slant, steps] = pullOf(made({ ...face, ...lie }));
        expect(slant, JSON.stringify({ face, lie })).toBeLessThan(0);
        expect(steps, JSON.stringify({ face, lie })).toBeLessThan(0);
      }
    }
  });

  it('pulls every other face ahead by the steps alone, so where two faces meet at an edge the nearer is drawn there however steeply either is seen', () => {
    for (const face of WEARS) {
      for (const lie of LYING_CLEAR) {
        const [slant, steps] = pullOf(made({ ...face, ...lie }));
        expect(slant, JSON.stringify({ face, lie })).toBe(0);
        expect(steps, JSON.stringify({ face, lie })).toBeLessThan(0);
      }
    }
  });

  it('draws the top of a block sunk to the floor ahead of the pictures over the board, and a sheet laid on it ahead of it', () => {
    const overBoard: [number, number] = [LAYERS_OVER_BOARD.polygonOffsetFactor, LAYERS_OVER_BOARD.polygonOffsetUnits];

    for (const face of WEARS) {
      const sunk = pullOf(made({ ...face, ...SUNK_TOP }));
      expect(ahead(sunk, overBoard), JSON.stringify(face)).toBe(true);
      expect(ahead(pullOf(made({ ...face, facing: 'up', sheet: 'both' })), sunk), JSON.stringify(face)).toBe(true);
    }
  });
});

describe('the materials the faces of a block with no thickness are drawn with', () => {
  const worn: FaceLook[] = [
    { pictureUrl: 'poster.png', tilePx: 0, glass: false },
    { pictureUrl: 'stone.png', tilePx: 50, glass: false },
    { pictureUrl: '', tilePx: 0, glass: true },
  ];

  it('draws a sheet ahead of the face of a block it lies against, and what is laid over a face ahead of the sheet', () => {
    const over = pullOf(made({ pictureUrl: 'grid.png', tilePx: 0, glass: false, laidOver: true }));

    for (const face of worn) {
      for (const lie of [...LEVEL, ...ASLANT]) {
        for (const sheet of ['outside', 'both'] as const) {
          const pulled = pullOf(made({ ...face, ...lie, sheet }));
          expect(ahead(pulled, pullOf(made({ ...face, ...lie }))), JSON.stringify({ face, lie })).toBe(true);
          expect(ahead(over, pulled), JSON.stringify({ face, lie })).toBe(true);
        }
      }
    }
  });

  it('draws a sheet with another face of its block behind it from outside only: a side from its front, a top from its back', () => {
    for (const face of worn) {
      expect(made({ ...face, sheet: 'outside' }).side, JSON.stringify(face)).toBe(FrontSide);
      expect(made({ ...face, sheet: 'outside', facing: 'down' }).side, JSON.stringify(face)).toBe(FrontSide);
      expect(made({ ...face, sheet: 'outside', facing: 'up' }).side, JSON.stringify(face)).toBe(BackSide);
    }
  });

  it('draws a sheet with no face behind it, and every other face, from both sides', () => {
    for (const face of worn) {
      expect(made({ ...face, sheet: 'both', facing: 'up' }).side, JSON.stringify(face)).toBe(DoubleSide);
      expect(made(face).side, JSON.stringify(face)).toBe(DoubleSide);
      expect(made({ ...face, facing: 'up' }).side, JSON.stringify(face)).toBe(DoubleSide);
    }
  });

  it('shares no material between a sheet and another face, nor between sheets drawn from different sides', () => {
    const face = worn[0];
    const keys = [
      lookOf(face),
      lookOf({ ...face, sheet: 'both' }),
      lookOf({ ...face, sheet: 'outside' }),
      lookOf({ ...face, sheet: 'outside', facing: 'up' }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
    expect(lookOf({ ...face, facing: 'up' })).toBe(lookOf(face));
  });

  it('shares a material between the faces of a block pulled ahead alike, and none between faces pulled ahead otherwise', () => {
    const face = worn[0];
    const [side, slope] = ASLANT.map((lie) => ({ ...face, ...lie }));

    expect(lookOf({ ...face, facing: 'down' })).toBe(lookOf(side));
    expect(lookOf(slope)).toBe(lookOf(side));
    expect(lookOf({ ...face, ...SUNK_TOP })).not.toBe(lookOf({ ...face, facing: 'up' }));
    expect(lookOf({ ...face, sheet: 'outside', facing: 'down' })).not.toBe(lookOf({ ...face, sheet: 'outside' }));
    expect(lookOf({ ...face, sheet: 'both', facing: 'up' })).not.toBe(lookOf({ ...face, sheet: 'both' }));
  });

  it('gives two faces one key only where they are drawn with the same material', () => {
    const faces = WEARS.flatMap((face) => [...LYING_ON, ...LYING_CLEAR].map((lie): FaceLook => ({ ...face, ...lie })));
    const drawn = (face: FaceLook) => {
      const material = made(face);
      return JSON.stringify([material.type, material.side, material.transparent, ...pullOf(material)]);
    };

    for (const one of faces) {
      for (const other of faces) {
        if (lookOf(one) === lookOf(other)) expect(drawn(other), JSON.stringify([one, other])).toBe(drawn(one));
      }
    }
  });

  it('keeps the grid laid over a face as it is', () => {
    const grid: FaceLook = { pictureUrl: 'grid.png', tilePx: 0, glass: false, laidOver: true };

    expect(lookOf({ ...grid, sheet: 'outside' })).toBe(lookOf(grid));
  });
});

describe('the picture the faces sharing a key wear', () => {
  it('is read back off the key of a sheet as off any other', () => {
    const faces: FaceLook[] = [
      { pictureUrl: 'blob:poster|1', tilePx: 0, glass: false, sheet: 'outside' },
      { pictureUrl: 'blob:stone', tilePx: 50, glass: false, sheet: 'both', facing: 'up' },
    ];

    expect(faces.map((face) => pictureOfLook(lookOf(face)))).toEqual(['blob:poster|1', 'blob:stone']);
    expect(pictureOfLook(lookOf({ pictureUrl: '', tilePx: 0, glass: true, sheet: 'outside' }))).toBeNull();
  });

  it('is read back off the key of a face however it lies', () => {
    for (const lie of [...LYING_ON, ...LYING_CLEAR]) {
      const face: FaceLook = { pictureUrl: 'blob:crate|1', tilePx: 0, glass: false, ...lie };
      expect(pictureOfLook(lookOf(face)), JSON.stringify(face)).toBe('blob:crate|1');
      expect(pictureOfLook(lookOf({ ...face, pictureUrl: '', glass: true })), JSON.stringify(face)).toBeNull();
      expect(pictureOfLook(lookOf({ ...face, pictureUrl: '', colour: '#884422' })), JSON.stringify(face)).toBeNull();
    }
  });

  it('is read back off the key of every look that wears one, tiled, stretched or laid over', () => {
    const faces: FaceLook[] = [
      { pictureUrl: 'blob:crate|1', tilePx: 0, glass: false },
      { pictureUrl: 'blob:stone', tilePx: 50, glass: false },
      { pictureUrl: 'blob:grid', tilePx: 0, glass: false, laidOver: true },
    ];

    expect(faces.map((face) => pictureOfLook(lookOf(face)))).toEqual(['blob:crate|1', 'blob:stone', 'blob:grid']);
  });

  it('is none for glass and for a painted colour', () => {
    expect(pictureOfLook(lookOf({ pictureUrl: '', tilePx: 0, glass: true }))).toBeNull();
    expect(pictureOfLook(lookOf({ pictureUrl: '', tilePx: 0, glass: false, colour: '#884422' }))).toBeNull();
  });
});
