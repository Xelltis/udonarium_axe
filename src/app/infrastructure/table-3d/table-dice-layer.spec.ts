import { TableDiceLayer } from '@axe/infrastructure/table-3d/table-dice-layer';
import { Group, Matrix4, type WebGPURenderer } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('the dice thrown on a table drawn on a canvas', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds a material ahead again the next time it is asked for, once the graphics card would not build it', async () => {
    const layer = new TableDiceLayer(
      () => ({}) as WebGPURenderer,
      () => undefined,
      new Matrix4()
    );
    vi.spyOn(layer as unknown as { build(): unknown }, 'build').mockImplementation(() => ({
      root: new Group(),
      materials: [],
    }));
    const compile = vi.fn().mockRejectedValueOnce(new Error('the device was lost')).mockResolvedValue(undefined);

    await expect(layer.warm('resin', compile)).resolves.toBeUndefined();
    await layer.warm('resin', compile);
    await layer.warm('resin', compile);

    expect(compile).toHaveBeenCalledTimes(2);
  });
});
