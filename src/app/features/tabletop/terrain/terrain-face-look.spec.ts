import { fogMaskOf, HIDDEN_FACE, terrainTextureLayout } from '@axe/features/tabletop/terrain/terrain-face-look';
import { STRETCHED_TEXTURE } from '@axe/ui/tabletop/shaded-background';
import { describe, expect, it } from 'vitest';

describe('how a block picture is laid on its faces', () => {
  it('tiles it a cell to a tile, or stretches it over the face', () => {
    expect(terrainTextureLayout(true, 50)).toEqual({ size: '50px 50px', repeat: 'repeat' });
    expect(terrainTextureLayout(false, 50)).toBe(STRETCHED_TEXTURE);
  });
});

describe('what the fog leaves of a face', () => {
  it('leaves a face the party has reached all of unmasked', () => {
    expect(fogMaskOf([true, true], 2, 1)).toBeNull();
  });

  it('takes away a face the party has reached none of', () => {
    expect(fogMaskOf([false, false], 2, 1)).toBe(HIDDEN_FACE);
  });

  it('thins a face out across the cell at the edge of what the party has reached', () => {
    const mask = fogMaskOf([true, false], 2, 1)!;
    expect(mask['mask-image']).toBe(mask['-webkit-mask-image']);
    expect(mask['mask-image']).toContain('linear-gradient(to right, rgba(0,0,0,1.000) 25%, rgba(0,0,0,0.000) 75%)');
    expect(mask['mask-repeat']).toBe('no-repeat');
  });
});
