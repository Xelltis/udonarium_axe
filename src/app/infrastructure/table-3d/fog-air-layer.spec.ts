import { FogAirLayer } from '@axe/infrastructure/table-3d/fog-air-layer';
import { LONGEST_PICTURE_PX, type Table3dFogAirSheet } from '@axe/infrastructure/table-3d/table-3d-port';
import type { Texture } from 'three/webgpu';

function sheetOf(width: number, height: number, revision = 1, canvas?: HTMLCanvasElement): Table3dFogAirSheet {
  const painted = canvas ?? document.createElement('canvas');
  painted.width = width;
  painted.height = height;
  return {
    canvas: painted,
    box: { x: 0, y: 0, width, height },
    heightPx: 10,
    alpha: 0.5,
    durationSec: 20,
    delaySec: 0,
    revision,
  };
}

function pictureOf(layer: FogAirLayer): Texture {
  return (layer as unknown as { hung: { picture: Texture }[] }).hung[0].picture;
}

describe('the sheets of fog hanging in the air', () => {
  it('sends a sheet longer than the card takes as a copy brought down to that length', () => {
    const layer = new FogAirLayer();

    layer.set([sheetOf(LONGEST_PICTURE_PX * 2, 1000)], false);

    const sent = pictureOf(layer).image as HTMLCanvasElement;
    expect([sent.width, sent.height]).toEqual([LONGEST_PICTURE_PX, 500]);
  });

  it('lets a sheet painted again at another size go on the card first, and takes one painted again at the same size in place', () => {
    const layer = new FogAirLayer();
    const sheet = sheetOf(800, 600);
    layer.set([sheet], false);
    const picture = pictureOf(layer);
    const letGo = vi.spyOn(picture, 'dispose');

    layer.set([sheetOf(800, 600, 2, sheet.canvas)], false);
    expect(letGo).not.toHaveBeenCalled();

    layer.set([sheetOf(1600, 600, 3, sheet.canvas)], false);
    expect(letGo).toHaveBeenCalledTimes(1);
    expect(pictureOf(layer)).toBe(picture);
  });
});
