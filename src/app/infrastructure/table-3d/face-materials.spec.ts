import { type FaceLook, faceMaterialOf } from '@axe/infrastructure/table-3d/face-materials';
import { type Material, Texture } from 'three/webgpu';

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
