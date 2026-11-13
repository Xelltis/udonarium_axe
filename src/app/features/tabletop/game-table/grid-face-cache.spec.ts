import { GridFaceCache, gridFaceKey, GridLook } from '@axe/features/tabletop/game-table/grid-face-cache';

const look: GridLook = { gridSize: 50, gridType: 0, gridColor: '#000000', gridFontColor: '#000000' };

describe('GridFaceCache', () => {
  afterEach(() => vi.restoreAllMocks());

  /** happy-dom draws nothing, so the canvas is given a context that takes anything and a picture to answer with. */
  function drawable(): ReturnType<typeof vi.spyOn> {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as RenderingContext
    );
    return vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,GRID');
  }

  it('rasterises a face once and hands the same picture back for the same geometry', () => {
    const encode = drawable();
    const cache = new GridFaceCache();

    const first = cache.dataUrl(look, 500, 200, 0, 0, 'N', null);
    const again = cache.dataUrl(look, 500, 200, 0, 0, 'N', null);
    const other = cache.dataUrl(look, 500, 200, 0, 0, 'S', [-1, 0, 0, 1]);
    const face = cache.dataUrl(look, 100, 150, 0, 50, 'N', null);
    const faceAgain = cache.dataUrl(look, 100, 150, 0, 50, 'N', null);

    expect(first).toBe('data:image/png;base64,GRID');
    expect(again).toBe(first);
    expect(other).toBe('data:image/png;base64,GRID');
    expect(faceAgain).toBe(face);
    expect(encode).toHaveBeenCalledTimes(3);
  });

  it('rasterises again once the grid colour changes', () => {
    const encode = drawable();
    const cache = new GridFaceCache();

    cache.dataUrl(look, 500, 200, 0, 0, 'N', null);
    cache.dataUrl({ ...look, gridColor: '#ff0000ff' }, 500, 200, 0, 0, 'N', null);

    expect(encode).toHaveBeenCalledTimes(2);
  });

  it('hands back the face it drew before rather than drawing it again', () => {
    const cache = new GridFaceCache();
    let drawn = 0;
    const draw = () => {
      drawn += 1;
      return `face-${drawn}`;
    };

    expect(cache.remember('key', draw)).toBe('face-1');
    expect(cache.remember('key', draw)).toBe('face-1');
    expect(drawn).toBe(1);
  });

  it('draws again after a face that could not be drawn', () => {
    const cache = new GridFaceCache();

    expect(cache.dataUrl(look, 100, 80, 0, 0, '', null)).toBe('');

    const key = gridFaceKey(look, 100, 80, 0, 0, '', null);
    expect(cache.remember(key, () => 'data:image/png;base64,drawn')).toBe('data:image/png;base64,drawn');
  });
});
