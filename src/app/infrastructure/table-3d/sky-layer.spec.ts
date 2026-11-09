import { skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { SkyLayer } from '@axe/infrastructure/table-3d/sky-layer';
import { Color } from 'three/webgpu';

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
    expect(second!.density).toBeCloseTo(1 / (3 * (Math.hypot(1600, 1000) + 3000)), 12);
    sky.dispose();
  });

  it('hazes nothing where no sky is drawn', () => {
    const sky = new SkyLayer();

    expect(sky.set(null, board)).toBeNull();
    sky.dispose();
  });
});
