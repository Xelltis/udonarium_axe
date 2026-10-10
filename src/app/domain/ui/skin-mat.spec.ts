import { asDiceMat, DEFAULT_MAT_COLOR, parseMat, PLAIN_MAT } from '@axe/domain/ui/skin-mat';

describe('skin mat', () => {
  it('reads nothing kept, or what cannot be read, as the plain mat', () => {
    expect(parseMat(null)).toEqual(PLAIN_MAT);
    expect(parseMat('')).toEqual(PLAIN_MAT);
    expect(parseMat('{nope')).toEqual(PLAIN_MAT);
    expect(asDiceMat('green')).toEqual(PLAIN_MAT);
  });

  it('reads back a colour and a picture laid over it', () => {
    const kept = {
      color: '#1F4D3A',
      layer: { id: 'layer-1', name: 'mat.png', opacity: 80, fit: 'tile', anchor: 'top' },
    };

    expect(parseMat(JSON.stringify(kept))).toEqual({
      color: '#1f4d3a',
      layer: { id: 'layer-1', name: 'mat.png', opacity: 80, fit: 'tile', anchor: 'top' },
    });
  });

  it('leaves a colour that is not one to the default, and a picture naming none out', () => {
    expect(asDiceMat({ color: 'red', layer: { name: 'no id' } })).toEqual({ color: DEFAULT_MAT_COLOR, layer: null });
  });
});
