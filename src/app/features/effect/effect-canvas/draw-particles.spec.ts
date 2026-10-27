import { EffectParticle, EffectParticleLayer } from '@axe/domain/effect/effect-particles';
import { drawParticleLayer } from '@axe/features/effect/effect-canvas/draw-particles';
import { pixelRatioFor } from '@axe/features/effect/effect-canvas/effect-canvas.component';

describe('drawParticleLayer()', () => {
  interface Call {
    op: string;
    alpha: number;
  }

  function makeContext(calls: Call[]): CanvasRenderingContext2D {
    const state = { globalCompositeOperation: 'source-over', globalAlpha: 1 };
    return {
      get globalCompositeOperation() {
        return state.globalCompositeOperation;
      },
      set globalCompositeOperation(value: string) {
        state.globalCompositeOperation = value;
      },
      get globalAlpha() {
        return state.globalAlpha;
      },
      set globalAlpha(value: number) {
        state.globalAlpha = value;
      },
      setTransform: () => undefined,
      clearRect: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      drawImage: () => calls.push({ op: state.globalCompositeOperation, alpha: state.globalAlpha }),
    } as unknown as CanvasRenderingContext2D;
  }

  function makeParticle(overrides: Partial<EffectParticle>): EffectParticle {
    return {
      x: 0,
      y: 0,
      size: 10,
      angle: 0,
      stretch: 1,
      color: '#ffffff',
      alpha: 1,
      shape: 'glow',
      ...overrides,
    };
  }

  function makeLayer(particles: EffectParticle[]): EffectParticleLayer {
    return { width: 100, height: 100, originX: 50, originY: 70, particles };
  }

  const stubTexture = () => ({}) as CanvasImageSource;

  it('draws the smoke plainly and the glowing particles additively', () => {
    const calls: Call[] = [];
    drawParticleLayer(
      makeContext(calls),
      makeLayer([makeParticle({ shape: 'glow' }), makeParticle({ shape: 'smoke' })]),
      1,
      stubTexture
    );

    expect(calls).toHaveLength(2);
    // The smoke goes down first and the light over it; the other way round the smoke would cover the light.
    expect(calls[0].op).toBe('source-over');
    expect(calls[1].op).toBe('lighter');
  });

  it('draws no particle that cannot be seen', () => {
    const calls: Call[] = [];
    drawParticleLayer(
      makeContext(calls),
      makeLayer([makeParticle({ alpha: 0 }), makeParticle({ size: 0 }), makeParticle({ alpha: 0.5 })]),
      1,
      stubTexture
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].alpha).toBe(0.5);
  });

  it('puts the blending mode back when it is done', () => {
    const calls: Call[] = [];
    const context = makeContext(calls);
    drawParticleLayer(context, makeLayer([makeParticle({})]), 2, stubTexture);

    expect(context.globalCompositeOperation).toBe('source-over');
    expect(context.globalAlpha).toBe(1);
  });
});

describe('pixelRatioFor()', () => {
  function layerOf(width: number, height: number): EffectParticleLayer {
    return { width, height, originX: 0, originY: 0, particles: [] };
  }

  it('keeps at least a pixel per pixel at an ordinary size', () => {
    expect(pixelRatioFor(layerOf(300, 300))).toBeGreaterThanOrEqual(1);
  });

  it('holds the pixel count down over a whole map', () => {
    // Five thousand pixels a side at double density is a hundred million pixels; drawing coarsely beats failing to allocate and going white.
    const layer = layerOf(5000, 5000);
    const ratio = pixelRatioFor(layer);
    expect(ratio).toBeLessThan(1);
    expect(layer.width * ratio * (layer.height * ratio)).toBeLessThanOrEqual(4_000_000);
  });

  it('returns a ratio even at no size at all', () => {
    expect(pixelRatioFor(layerOf(0, 0))).toBeGreaterThan(0);
  });
});
