import type { ThrowToDraw } from '@axe/infrastructure/dice-3d/dice-3d-engine';
import { TableDiceLayer } from '@axe/infrastructure/table-3d/table-dice-layer';
import { contextThatTakesAnything } from '@axe/testing/fake-canvas-context';
import {
  type CubeRenderTarget,
  CubeTexture,
  type Material,
  Matrix4,
  Mesh,
  PMREMGenerator,
  type WebGPURenderer,
} from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A 2D context the dice's faces and engravings can be drawn into under happy-dom, which answers blank pixels. */
function contextWithPixels(): CanvasRenderingContext2D {
  const taking = contextThatTakesAnything();
  const blank = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
  return new Proxy(taking, {
    get: (target, name) => {
      if (name === 'getImageData')
        return (_x: number, _y: number, width: number, height: number) => blank(width, height);
      if (name === 'createImageData') return blank;
      return Reflect.get(target, name);
    },
  });
}

/** A still throw of one d6, as a chat frame hands one over. */
function throwOf(key: string, color = '#202024') {
  const draw: ThrowToDraw = {
    dice: [{ shape: 'd6', labels: 'standard' }],
    color,
    tray: { halfWidth: 4, halfDepth: 2 },
    result: {
      frameCount: 1,
      restFrame: 0,
      frames: new Float32Array([0, 0, 1, 0, 0, 0, 1]),
      landed: [0],
      corrections: [[0, 0, 0, 1]],
      attempt: 0,
      fault: null,
    },
  };
  return { key, draw, model: new Matrix4().toArray(), seconds: 0, opacity: 1 };
}

function materialsUnder(layer: TableDiceLayer): Material[] {
  const materials: Material[] = [];
  layer.group.traverse((object) => {
    if (object instanceof Mesh) materials.push(object.material as Material);
  });
  return materials;
}

describe('the dice thrown on a table drawn on a canvas', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => contextWithPixels());
    vi.spyOn(PMREMGenerator.prototype, 'fromScene').mockImplementation(
      () => ({ texture: new CubeTexture(), dispose: () => undefined }) as unknown as CubeRenderTarget
    );
  });

  afterEach(() => vi.restoreAllMocks());

  function layerOf(): TableDiceLayer {
    return new TableDiceLayer(
      () => ({}) as WebGPURenderer,
      () => undefined,
      new Matrix4()
    );
  }

  it('builds the dice of a throw set on the table, and lets their materials go once it is taken off', () => {
    const layer = layerOf();

    layer.set([throwOf('one')]);

    expect(layer.shown).toBe(1);
    expect(layer.takeChanged()).toBe(true);
    const materials = materialsUnder(layer);
    expect(materials.length).toBeGreaterThan(0);
    const letGo = materials.map((material) => vi.spyOn(material, 'dispose'));

    layer.set([]);

    expect(layer.shown).toBe(0);
    expect(layer.group.children).toHaveLength(0);
    expect(letGo.map((spy) => spy.mock.calls.length)).toEqual(materials.map(() => 1));
    expect(layer.takeChanged()).toBe(true);
  });

  it('leaves a throw handed over again as it lay alone, and builds it anew once what it is drawn from changes', () => {
    const layer = layerOf();
    const same = throwOf('one');
    layer.set([same]);
    layer.takeChanged();
    const built = materialsUnder(layer);

    layer.set([same]);

    expect(layer.takeChanged()).toBe(false);
    expect(materialsUnder(layer)).toEqual(built);

    layer.set([throwOf('one', '#ff0000')]);

    expect(layer.takeChanged()).toBe(true);
    expect(materialsUnder(layer)).not.toEqual(built);
  });

  it('builds a material ahead again the next time it is asked for, once the graphics card would not build it', async () => {
    const layer = layerOf();
    const compile = vi.fn().mockRejectedValueOnce(new Error('the device was lost')).mockResolvedValue(undefined);

    await expect(layer.warm('resin', compile)).resolves.toBeUndefined();
    await layer.warm('resin', compile);
    await layer.warm('resin', compile);

    expect(compile).toHaveBeenCalledTimes(2);
  });
});
