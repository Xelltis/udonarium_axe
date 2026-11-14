import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { SHADOW_CASTERS_LAYER, SpriteLayer } from '@axe/infrastructure/table-3d/sprite-layer';
import { FrontSide, type Material, type Mesh, type MeshBasicNodeMaterial, Texture } from 'three/webgpu';

/** A piece's picture standing up, turned to the eye. */
function standing(url: string): TableWorldSprite {
  return {
    id: `${url}-picture`,
    owner: url,
    kind: 'character',
    centre: { x: 50, y: 50, z: 25 },
    widthPx: 50,
    heightPx: 50,
    facing: 'eye',
    look: { kind: 'picture', url },
    brightness: 1,
    twoSided: false,
  };
}

/** The squares of a layer the camera sees, and the boards its pictures throw their shadows with. */
function partsOf(layer: SpriteLayer): { shown: number; casters: number; standing: number } {
  const meshes: Mesh[] = [];
  layer.group.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  const drawn = (mesh: Mesh) => mesh.visible && (mesh.material as Material).visible;
  return {
    shown: meshes.filter((mesh) => drawn(mesh) && mesh.layers.isEnabled(0)).length,
    casters: meshes.filter(
      (mesh) => drawn(mesh) && mesh.layers.isEnabled(SHADOW_CASTERS_LAYER) && !mesh.layers.isEnabled(0)
    ).length,
    standing: meshes.filter((mesh) => mesh.visible && mesh.layers.isEnabled(0)).length,
  };
}

/** One side of a board standing up: its face wearing a picture, or its back in one colour. */
function side(id: string, look: TableWorldSprite['look'], opacity?: number): TableWorldSprite {
  return {
    id,
    owner: 'board',
    kind: 'white-board',
    centre: { x: 100, y: 100, z: 50 },
    widthPx: 200,
    heightPx: 100,
    facing: { across: { x: id.endsWith('#back') ? -1 : 1, y: 0, z: 0 }, down: { x: 0, y: 0, z: -1 } },
    look,
    brightness: 1,
    twoSided: false,
    ...(opacity === undefined ? {} : { opacity }),
  };
}

/** The material each sprite of a layer is drawn with, by the order they were laid in. */
function materialsOf(layer: SpriteLayer): MeshBasicNodeMaterial[] {
  return layer.group.children
    .filter((object) => (object as Mesh).isMesh)
    .map((object) => (object as Mesh).material as MeshBasicNodeMaterial);
}

describe('SpriteLayer', () => {
  it('draws a sprite of one colour in that colour at its opacity, with no picture, from its front only', () => {
    const asked: string[] = [];
    const layer = new SpriteLayer((url) => {
      asked.push(url);
      return new Texture();
    });

    layer.set([
      side('board#face', { kind: 'picture', url: 'blob:board' }),
      side('board#back', { kind: 'colour', colour: '#336699' }, 0.4),
    ]);
    const [face, back] = materialsOf(layer);

    expect([...new Set(asked)]).toEqual(['blob:board']);
    expect(back.map).toBeNull();
    expect(back.color.getHexString()).toBe('336699');
    expect(back.opacity).toBe(0.4);
    expect(back.transparent).toBe(true);
    expect(back.visible).toBe(true);
    expect([face.side, back.side]).toEqual([FrontSide, FrontSide]);
    expect(layer.casterCount).toBe(1);
  });

  it('turns the back of a board to look the other way from its face', () => {
    const layer = new SpriteLayer(() => new Texture());
    layer.set([
      side('board#face', { kind: 'picture', url: 'blob:board' }),
      side('board#back', { kind: 'colour', colour: '#336699' }),
    ]);
    const [face, back] = layer.group.children.filter((object) => (object as Mesh).isMesh);
    const out = (mesh: (typeof layer.group.children)[number]) => {
      mesh.updateMatrix();
      const m = mesh.matrix.elements;
      const length = Math.hypot(m[8], m[9], m[10]);
      return [m[8] / length, m[9] / length, m[10] / length];
    };

    // The face of a board standing along the east, read from the south, looks south: the scene's z.
    expect(out(face)[2]).toBeCloseTo(1, 6);
    expect(out(back)[2]).toBeCloseTo(-1, 6);
  });

  it('shares one material between the backs of one colour and opacity, and none between those that differ', () => {
    const layer = new SpriteLayer(() => new Texture());
    const back = (id: string, colour: string, opacity: number) =>
      side(`${id}#back`, { kind: 'colour', colour }, opacity);

    layer.set([
      back('a', '#336699', 0.4),
      back('b', '#336699', 0.4),
      back('c', '#336699', 0.8),
      back('d', '#993366', 0.4),
    ]);
    const [a, b, c, d] = materialsOf(layer);

    expect(b).toBe(a);
    expect(new Set([a, c, d]).size).toBe(3);
  });

  it('draws a picture as nothing until it has come, with the shadow it throws, though it stands in the scene, and shows it once it has', () => {
    const pictures = new Map<string, Texture>();
    const layer = new SpriteLayer((url) => {
      let picture = pictures.get(url);
      if (!picture) pictures.set(url, (picture = new Texture()));
      return picture;
    });

    layer.set([standing('knight.webp'), standing('golem.webp')]);
    expect(partsOf(layer)).toEqual({ shown: 0, casters: 0, standing: 2 });

    pictures.get('knight.webp')!.image = { width: 2, height: 2 };
    layer.picturesCame();
    expect(partsOf(layer)).toEqual({ shown: 1, casters: 2, standing: 2 });

    pictures.get('golem.webp')!.image = { width: 2, height: 2 };
    layer.picturesCame();
    expect(partsOf(layer)).toEqual({ shown: 2, casters: 4, standing: 2 });
  });

  it('shows nothing again once it is let go of, as pictures still coming arrive', () => {
    const picture = new Texture();
    const layer = new SpriteLayer(() => picture);
    layer.set([standing('knight.webp')]);

    layer.dispose();
    picture.image = { width: 2, height: 2 };
    layer.picturesCame();

    expect(partsOf(layer).shown).toBe(0);
  });

  it('lays a range over the raised ground under its box, made anew only as the ground or its box changes, and flat again once the ground is flat', () => {
    const layer = new SpriteLayer(() => new Texture());
    const range: TableWorldSprite = {
      id: 'range#picture',
      owner: 'range',
      kind: 'range',
      centre: { x: 25, y: 25, z: 0.25 },
      widthPx: 30,
      heightPx: 30,
      facing: { across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 } },
      look: { kind: 'picture', url: 'blob:range' },
      brightness: 1,
      twoSided: false,
      order: 0.25,
      drapes: { liftPx: 0.25 },
    };
    const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
    heights[1 * GROUND_CHUNK_SAMPLES + 1] = 64;
    const floor = {
      surface: groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]),
      gridSize: 50,
      gridType: GridType.SQUARE,
    };
    const laid = () => layer.group.children[0] as Mesh;
    const highest = () => {
      const positions = laid().geometry.getAttribute('position');
      return Math.max(...Array.from({ length: positions.count }, (_, at) => positions.getY(at)));
    };

    layer.set([range]);
    const square = laid().geometry;
    expect(square.getAttribute('position').count).toBe(4);

    layer.setGround(floor);
    layer.set([range]);
    const draped = laid().geometry;
    expect(draped).not.toBe(square);
    expect(highest()).toBeCloseTo(50.25);
    expect(laid().position.toArray()).toEqual([0, 0, 0]);

    layer.setGround({ ...floor });
    layer.set([range]);
    expect(laid().geometry).toBe(draped);

    layer.setGround(null);
    layer.set([range]);
    expect(laid().geometry).toBe(square);
  });
});
