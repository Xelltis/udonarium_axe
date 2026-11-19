import { skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { SkyLayer } from '@axe/infrastructure/table-3d/sky-layer';
import { Color, type Mesh, type MeshLambertNodeMaterial } from 'three/webgpu';

describe('the sky over a table drawn on a canvas', () => {
  const board = { x: 0, y: 0, width: 1600, height: 1000 };

  it('hazes the scene with one and the same fog as the hour goes by, its colour and depth the hour’s', () => {
    const sky = new SkyLayer();
    const noon = skyDomeAt(0.5);
    const dusk = skyDomeAt(0.8);

    const first = sky.set(noon, board);
    const second = sky.set(dusk, board);

    expect(second).toBe(first);
    expect(second!.color.getHex()).toBe(new Color(dusk.horizon).getHex());
    expect(second!.density).toBeGreaterThan(0);
    sky.dispose();
  });

  it('hazes a wider board more thinly, and a scene with no board as one of some breadth', () => {
    const sky = new SkyLayer();
    const noon = skyDomeAt(0.5);

    const small = sky.set(noon, board)!.density;
    const wide = sky.set(noon, { ...board, width: board.width * 4 })!.density;
    const none = sky.set(noon, null)!.density;

    expect(wide).toBeLessThan(small);
    expect(none).toBeGreaterThan(0);
    expect(none).toBeLessThan(Infinity);
    sky.dispose();
  });

  it('lays ground round the board that gives back the colour of the sky and fades into the horizon', () => {
    const sky = new SkyLayer();
    sky.set(skyDomeAt(0.5), board);
    const ground = sky.group.children.find((child) => child !== sky.group.children[0]) as Mesh | undefined;

    expect(ground).toBeDefined();
    const material = ground!.material as MeshLambertNodeMaterial;
    expect(material.emissiveNode).toBeTruthy();
    expect(material.colorNode).toBeTruthy();
    sky.set(null, board);
    expect(sky.group.children.length).toBe(1);
    sky.dispose();
  });

  it('hazes the board itself but thinly, the ground beyond fading into the horizon of its own accord', () => {
    const sky = new SkyLayer();
    const haze = sky.set(skyDomeAt(0.5), board)!;
    const acrossBoard = Math.hypot(board.width, board.height);
    const onBoard = 1 - Math.exp(-((haze.density * acrossBoard) ** 2));

    expect(onBoard).toBeLessThan(0.1);
    sky.dispose();
  });

  it('hazes nothing where no sky is drawn', () => {
    const sky = new SkyLayer();

    expect(sky.set(null, board)).toBeNull();
    sky.dispose();
  });
});
