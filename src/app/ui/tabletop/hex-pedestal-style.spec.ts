import { buildHexRingClipPath, calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { hexPedestalGrabStyle, hexPedestalRingStyle } from '@axe/ui/tabletop/hex-pedestal-style';

describe('the pedestal of a piece on a hex grid', () => {
  const params = calcHexFlowerParams(1, 50, false);
  const { bbox, L } = params;

  it('draws the rim round the cells the piece stands on, in its colour and at its thickness', () => {
    const style = hexPedestalRingStyle(params, 6, '#FFCC80');

    expect(style).toMatchObject({
      background: '#FFCC80',
      clipPath: buildHexRingClipPath(params.outline, bbox, 6),
      width: `${bbox.maxX - bbox.minX}px`,
      left: `${bbox.minX + L / 2}px`,
    });
  });

  it('reaches the handle past the corners of the pedestal, round the cell the piece is drawn from', () => {
    const halfW = (bbox.maxX - bbox.minX) / 2;
    const halfH = (bbox.maxY - bbox.minY) / 2;
    const radius = Math.sqrt(halfW * halfW + halfH * halfH) + 12;

    const style = hexPedestalGrabStyle(params, { reachPx: 12 });

    expect(style['width']).toBe(`${radius * 2}px`);
    expect(style['left']).toBe(`${L / 2 - radius}px`);
    expect(style['clipPath']).toBeUndefined();
  });

  it('cuts the pedestal out of the handle where asked, so a press inside the rim moves the piece', () => {
    expect(hexPedestalGrabStyle(params, { reachPx: 12, pedestalCutOut: true })['clipPath']).toContain('M ');
  });
});
