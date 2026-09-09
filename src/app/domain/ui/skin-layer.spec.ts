import {
  asLayer,
  asLayers,
  layerPlacement,
  MAX_LAYERS,
  newLayerId,
  parseLayers,
  reorderLayers,
  SkinLayer,
} from '@axe/domain/ui/skin-layer';

const LAYER: SkinLayer = { id: 'a', name: 'paper.webp', opacity: 60, fit: 'tile', anchor: 'top-left' };

describe('reading a layer back', () => {
  it('keeps what it was given', () => {
    expect(asLayer(LAYER)).toEqual(LAYER);
  });

  it('refuses anything with no key to its bytes', () => {
    expect(asLayer({ name: 'x' })).toBeNull();
    expect(asLayer(null)).toBeNull();
    expect(asLayer('paper')).toBeNull();
  });

  it('pulls the strength into range and falls back on the rest', () => {
    const read = asLayer({ id: 'a', opacity: 900, fit: 'sideways', anchor: 'nowhere' });

    expect(read?.opacity).toBe(100);
    expect(read?.fit).toBe('cover');
    expect(read?.anchor).toBe('center');
  });

  it('takes no more of a stack than a panel should carry', () => {
    const many = Array.from({ length: MAX_LAYERS + 4 }, (_, i) => ({ ...LAYER, id: `l${i}` }));

    expect(asLayers(many).length).toBe(MAX_LAYERS);
  });

  it('reads anything that is not a stack as an empty one', () => {
    expect(asLayers({ id: 'a' })).toEqual([]);
    expect(parseLayers('{ broken')).toEqual([]);
    expect(parseLayers(null)).toEqual([]);
  });

  it('mints a key of its own each time', () => {
    expect(newLayerId()).not.toBe(newLayerId());
  });
});

describe('moving a layer through the stack', () => {
  const stack: SkinLayer[] = [
    { ...LAYER, id: 'a' },
    { ...LAYER, id: 'b' },
    { ...LAYER, id: 'c' },
  ];

  it('lifts one over the next', () => {
    expect(reorderLayers(stack, 'a', 1).map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('drops one under the one below', () => {
    expect(reorderLayers(stack, 'c', -1).map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });

  it('stays inside the stack at either end', () => {
    expect(reorderLayers(stack, 'a', -1).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(reorderLayers(stack, 'c', 1).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves a stack alone when asked about a layer it does not hold', () => {
    expect(reorderLayers(stack, 'z', 1)).toEqual(stack);
  });
});

describe('where a layer is drawn', () => {
  it('fills the panel and crops, by default', () => {
    expect(layerPlacement({ ...LAYER, fit: 'cover', anchor: 'center' })).toEqual({
      size: 'cover',
      position: 'center',
      repeat: 'no-repeat',
    });
  });

  it('repeats a tile from the corner it is anchored to', () => {
    expect(layerPlacement({ ...LAYER, fit: 'tile', anchor: 'top-left' })).toEqual({
      size: 'auto',
      position: 'left top',
      repeat: 'repeat',
    });
  });

  it('fits the whole picture in when it is asked to', () => {
    expect(layerPlacement({ ...LAYER, fit: 'contain', anchor: 'bottom-right' })).toEqual({
      size: 'contain',
      position: 'right bottom',
      repeat: 'no-repeat',
    });
  });

  it('pulls it to the edges when it is asked to stretch', () => {
    expect(layerPlacement({ ...LAYER, fit: 'stretch', anchor: 'top' }).size).toBe('100% 100%');
  });
});
