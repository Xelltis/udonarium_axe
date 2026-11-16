import { driftAt, FogAirLayer } from '@axe/infrastructure/table-3d/fog-air-layer';
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

describe('how far a sheet of fog has drifted', () => {
  const sheet = sheetOf(1000, 1000);

  it('drifts from the north-west end through the middle to as far south-east, and back', () => {
    const start = driftAt(sheet, 0);
    const middle = driftAt(sheet, 10);
    const end = driftAt(sheet, 20);
    const back = driftAt(sheet, 30);

    expect(start.x).toBeLessThan(0);
    expect(start.y).toBeLessThan(0);
    expect(middle).toEqual({ x: 0, y: 0 });
    expect(end).toEqual({ x: -start.x, y: -start.y });
    expect(back.x).toBeCloseTo(0, 9);
    expect(back.y).toBeCloseTo(0, 9);
  });

  it('eases out of either end, so a quarter of the way in it has come less than halfway to the middle', () => {
    const start = driftAt(sheet, 0);
    const quarter = driftAt(sheet, 5);

    expect(quarter.x).toBeLessThan(start.x / 2);
    expect(quarter.x).toBeGreaterThan(start.x);
  });

  it('starts its drift later by the delay, and drifts a wider sheet further', () => {
    const delayed = { ...sheet, delaySec: 4 };
    const wide = sheetOf(2000, 1000);

    expect(driftAt(delayed, 4)).toEqual(driftAt(sheet, 0));
    expect(driftAt(wide, 0).x).toBe(driftAt(sheet, 0).x * 2);
    expect(driftAt(wide, 0).y).toBe(driftAt(sheet, 0).y);
  });

  it('takes a drift shorter than a second as one second long', () => {
    const quick = { ...sheet, durationSec: 0 };

    expect(driftAt(quick, 0.5)).toEqual({ x: 0, y: 0 });
  });
});
