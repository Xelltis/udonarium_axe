import { GROUND_CHUNK_SAMPLE_COUNT } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { squareGroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import { FloorCanvasLayer } from '@axe/infrastructure/table-3d/floor-canvas-layer';
import { Mesh, MeshBasicNodeMaterial, Texture } from 'three/webgpu';

const box = { x: 0, y: 0, width: 100, height: 50 };

function raised() {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT).fill(64);
  return squareGroundMesh(box, groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]), 50);
}

describe('the canvases laid on the floor of a table drawn on a canvas', () => {
  it('lays a canvas flat over its box at its height, and over the raised ground following it, and flat again', () => {
    const layer = new FloorCanvasLayer();
    layer.set([{ id: 'reach', canvas: document.createElement('canvas'), box, heightPx: 2, revision: 1 }]);
    const mesh = layer.group.children[0] as Mesh;

    expect(mesh.position.toArray()).toEqual([50, 2, 25]);
    expect(mesh.geometry.getAttribute('position').count).toBe(4);

    const ground = raised();
    layer.setGround(ground);
    const heights = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) =>
      mesh.geometry.getAttribute('position').getY(i)
    );
    expect(mesh.geometry.getAttribute('position').count).toBe(ground.points.length / 3);
    expect(heights.every((height) => height === 52)).toBe(true);

    layer.setGround(null);
    expect(mesh.geometry.getAttribute('position').count).toBe(4);
    layer.dispose();
  });

  it('takes the picture of a canvas made larger afresh at its new size', () => {
    const layer = new FloorCanvasLayer();
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;
    layer.set([{ id: 'reach', canvas, box, heightPx: 0, revision: 1 }]);
    const picture = ((layer.group.children[0] as Mesh).material as MeshBasicNodeMaterial).map as Texture;
    const letGo = vi.spyOn(picture, 'dispose');

    canvas.width = 200;
    layer.set([{ id: 'reach', canvas, box: { ...box, width: 200 }, heightPx: 0, revision: 2 }]);

    expect(letGo).toHaveBeenCalledTimes(1);
    layer.dispose();
  });
});
