import { FOG_AIR_LAYER_COUNT, FOG_AIR_TOP_CELLS, fogAirLayers } from '@axe/infrastructure/tabletop/fog/fog-air-layers';
import { describe, expect, it } from 'vitest';

describe('fogAirLayers', () => {
  it('spreads the sheets up through the air', () => {
    const layers = fogAirLayers(50);
    expect(layers).toHaveLength(FOG_AIR_LAYER_COUNT);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].heightPx).toBeGreaterThan(layers[i - 1].heightPx);
    }
    expect(layers[0].heightPx).toBeGreaterThan(0);
    expect(layers[layers.length - 1].heightPx).toBeCloseTo(FOG_AIR_TOP_CELLS * 50, 6);
  });

  it('thins them out towards the top', () => {
    const layers = fogAirLayers(50);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].alpha).toBeLessThan(layers[i - 1].alpha);
    }
  });

  it('gives each of them its own pace and its own place in the drift', () => {
    const layers = fogAirLayers(50);
    expect(new Set(layers.map((layer) => layer.durationSec)).size).toBe(layers.length);
    expect(new Set(layers.map((layer) => layer.delaySec)).size).toBe(layers.length);
    for (const layer of layers) expect(layer.delaySec).toBeLessThanOrEqual(0);
  });

  it('draws nothing for a table with no grid to speak of', () => {
    expect(fogAirLayers(0)).toHaveLength(0);
  });
});
