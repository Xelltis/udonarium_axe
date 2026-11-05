import { weatherFallCount, weatherFallOf } from '@axe/domain/tabletop/world/weather-fall';
import { WeatherLayer } from '@axe/infrastructure/table-3d/weather-layer';
import { PerspectiveCamera } from 'three/webgpu';

const rain = weatherFallOf('rain', '#aabbcc', 1)!;

/** A camera standing over a point of the board, looking straight down at it from a height. */
function lookingDown(x: number, y: number, height: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1.6, 1, 100_000);
  camera.position.set(x, height, y);
  camera.lookAt(x, 0, y);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('the weather falling through the scene of a table drawn on a canvas', () => {
  it('lets nothing fall until weather is laid, and stops once it is taken away', () => {
    const layer = new WeatherLayer();
    expect(layer.advance(0, lookingDown(500, 400, 800))).toBe(false);
    expect(layer.shown).toBe(0);

    layer.set({ fall: rain, board: { width: 1000, depth: 800 }, ceilingPx: 500 });
    expect(layer.advance(16, lookingDown(500, 400, 800))).toBe(true);
    expect(layer.shown).toBeGreaterThan(0);

    layer.set(null);
    expect(layer.advance(32, lookingDown(500, 400, 800))).toBe(false);
    expect(layer.shown).toBe(0);
    layer.dispose();
  });

  it('drops as many as fall over the whole board for a camera taking it all in, and fewer for one drawn in close', () => {
    const layer = new WeatherLayer();
    layer.set({ fall: rain, board: { width: 1000, depth: 800 }, ceilingPx: 500 });

    layer.advance(0, lookingDown(500, 400, 50_000));
    expect(layer.shown).toBe(weatherFallCount(rain, 2048));

    layer.advance(0, lookingDown(500, 400, 100));
    expect(layer.shown).toBeLessThan(weatherFallCount(rain, 2048));
    expect(layer.shown).toBeGreaterThan(0);
    layer.dispose();
  });

  it('wants drawing once weather is laid and as it falls', () => {
    const layer = new WeatherLayer();
    layer.set({ fall: rain, board: { width: 1000, depth: 800 }, ceilingPx: 500 });
    expect(layer.takeChanged()).toBe(true);
    expect(layer.takeChanged()).toBe(false);

    layer.advance(16, lookingDown(500, 400, 800));
    expect(layer.takeChanged()).toBe(true);
    layer.dispose();
  });
});
