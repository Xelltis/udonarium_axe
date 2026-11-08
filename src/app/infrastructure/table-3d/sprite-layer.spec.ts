import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { SHADOW_CASTERS_LAYER, SpriteLayer } from '@axe/infrastructure/table-3d/sprite-layer';
import { type Material, type Mesh, Texture } from 'three/webgpu';

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

describe('SpriteLayer', () => {
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
});
