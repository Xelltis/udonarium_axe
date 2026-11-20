import { skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { SkyLayer } from '@axe/infrastructure/table-3d/sky-layer';
import { Color, Matrix3, PerspectiveCamera } from 'three/webgpu';

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

  it('draws the sky alone round the board, with no ground beyond it', () => {
    const sky = new SkyLayer();
    sky.set(skyDomeAt(0.5), board);

    expect(sky.group.children).toHaveLength(1);
    expect(sky.shown).toBe(true);
    sky.set(null, board);
    expect(sky.shown).toBe(false);
    sky.dispose();
  });

  it('hazes the board itself but thinly, so a pale sky does not wash it out', () => {
    const sky = new SkyLayer();
    const haze = sky.set(skyDomeAt(0.5), board)!;
    const acrossBoard = Math.hypot(board.width, board.height);
    const onBoard = 1 - Math.exp(-((haze.density * acrossBoard) ** 2));

    expect(onBoard).toBeLessThan(0.1);
    sky.dispose();
  });

  it('turns the sky for a camera looking down on the table, and not for an eye among the pieces', () => {
    const sky = new SkyLayer();
    const camera = new PerspectiveCamera(50, 1, 1, 10000);
    camera.position.set(0, 1000, 600);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const level = () => (sky as unknown as { level: { value: Matrix3 } }).level.value;
    const identity = new Matrix3();

    sky.follow(camera.position, camera);
    expect(level().equals(identity)).toBe(false);
    sky.follow(camera.position, camera, true);
    expect(level().equals(identity)).toBe(true);
    sky.dispose();
  });

  it('hazes nothing where no sky is drawn', () => {
    const sky = new SkyLayer();

    expect(sky.set(null, board)).toBeNull();
    sky.dispose();
  });
});
