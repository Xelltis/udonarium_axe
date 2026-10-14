import { lightMaskUrl } from '@axe/features/tabletop/table-water-layer/caustic-texture';

describe('the pictures laid over sheets of water', () => {
  let drawn: number;

  beforeEach(() => {
    drawn = 0;
    const context = {
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => undefined,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;base64,${++drawn}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws a sheet once for as long as what it shows stays the same', () => {
    const mask = (fill: number) => ({ cols: 4, rows: 3, alpha: new Uint8ClampedArray(12).fill(fill) });

    const first = lightMaskUrl(mask(91));
    const again = lightMaskUrl(mask(91));
    const changed = lightMaskUrl(mask(92));

    expect(again).toBe(first);
    expect(changed).not.toBe(first);
    expect(drawn).toBe(2);
  });
});
