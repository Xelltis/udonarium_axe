import { bakeLight } from '@axe/infrastructure/three-kit/baked-light';
import { BoxGeometry, Mesh, MeshBasicMaterial, Scene, Texture } from 'three';

describe('bakeLight', () => {
  function studioOf() {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const studio = new Scene();
    studio.add(new Mesh(geometry, material));
    return { studio, shape: vi.spyOn(geometry, 'dispose'), look: vi.spyOn(material, 'dispose') };
  }

  function bakerOf() {
    const target = { texture: new Texture(), dispose: vi.fn() };
    return { target, baker: { fromScene: vi.fn(() => target) } };
  }

  it('lets go of the studio as soon as it is baked, keeping the light', () => {
    const { studio, shape, look } = studioOf();
    const { baker, target } = bakerOf();

    const baked = bakeLight(baker, studio, 0.02);

    expect(baker.fromScene).toHaveBeenCalledWith(studio, 0.02);
    expect(shape).toHaveBeenCalledTimes(1);
    expect(look).toHaveBeenCalledTimes(1);
    expect(baked.texture).toBe(target.texture);
    expect(target.dispose).not.toHaveBeenCalled();
  });

  it('lets go of the render target that holds the light when the light is let go of', () => {
    const { baker, target } = bakerOf();

    bakeLight(baker, studioOf().studio, 0.02).dispose();

    expect(target.dispose).toHaveBeenCalledTimes(1);
  });
});
