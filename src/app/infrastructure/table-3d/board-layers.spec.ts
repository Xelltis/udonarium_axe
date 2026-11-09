import type { TableWorldLayer } from '@axe/domain/tabletop/world/table-layers';
import { BoardLayers } from '@axe/infrastructure/table-3d/board-layers';
import { faceMaterialOf } from '@axe/infrastructure/table-3d/face-materials';
import { type Material, Mesh, PlaneGeometry, Texture } from 'three/webgpu';

function pullOf(material: Material): [number, number] {
  return material.polygonOffset ? [material.polygonOffsetFactor, material.polygonOffsetUnits] : [0, 0];
}

function ahead(front: [number, number], back: [number, number]): boolean {
  return front[0] <= back[0] && front[1] < back[1];
}

function layer(id: string, over: boolean): TableWorldLayer {
  return { id, pictureUrl: `${id}.png`, over, scale: 1, speedX: 0, speedY: 0, opacity: 1 };
}

describe('the pictures a table lays under and over its board', () => {
  it('draws a picture over the board ahead of the board, and behind the faces of the blocks standing on it', () => {
    const layers = new BoardLayers(
      () => new Texture(),
      () => undefined
    );
    layers.place(
      [layer('under', false), layer('over', true)],
      { widthPx: 100, depthPx: 100 },
      () => new PlaneGeometry(),
      'board'
    );
    const [under, over] = layers.group.children.map((child) => pullOf((child as Mesh).material as Material));
    const face = pullOf(
      faceMaterialOf(
        { pictureUrl: 'crate.png', tilePx: 0, glass: false },
        () => new Texture(),
        () => undefined
      )
    );

    expect(under).toEqual([0, 0]);
    expect(ahead(over, [0, 0])).toBe(true);
    expect(ahead(face, over)).toBe(true);
  });
});
