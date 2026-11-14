import { type FaceLook, faceMaterialOf, lookOf, pictureOfLook } from '@axe/infrastructure/table-3d/face-materials';
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

describe('the materials the faces of the blocks are drawn with', () => {
  it('draws a face ahead of the board whatever it wears, so a block made as high as nothing hides the board', () => {
    const faces: FaceLook[] = [
      { pictureUrl: 'crate.png', tilePx: 0, glass: false },
      { pictureUrl: 'stone.png', tilePx: 50, glass: false },
      { pictureUrl: '', tilePx: 0, glass: false, colour: '#884422' },
      { pictureUrl: '', tilePx: 0, glass: true },
      { pictureUrl: '', tilePx: 0, glass: false },
    ];

    for (const face of faces) expect(ahead(pullOf(made(face)), BOARD), JSON.stringify(face)).toBe(true);
  });

  it('draws a picture laid over a face ahead of the face it is laid over', () => {
    const face = pullOf(made({ pictureUrl: 'crate.png', tilePx: 0, glass: false }));
    const over = pullOf(made({ pictureUrl: 'moss.png', tilePx: 0, glass: false, laidOver: true }));

    expect(ahead(over, face)).toBe(true);
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
      for (const sheet of ['outside', 'both'] as const) {
        const pulled = pullOf(made({ ...face, sheet }));
        expect(ahead(pulled, pullOf(made(face))), JSON.stringify(face)).toBe(true);
        expect(ahead(over, pulled), JSON.stringify(face)).toBe(true);
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
    expect(lookOf({ ...face, sheet: 'outside' })).toBe(lookOf({ ...face, sheet: 'outside', facing: 'down' }));
    expect(lookOf({ ...face, facing: 'up' })).toBe(lookOf(face));
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
