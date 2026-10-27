import { createImageTexturePattern } from '@axe/infrastructure/map-editor/texture-pattern';
import { describe, expect, it } from 'vitest';

function patternCtx(pattern: unknown): CanvasRenderingContext2D {
  return { createPattern: () => pattern } as unknown as CanvasRenderingContext2D;
}

describe('createImageTexturePattern', () => {
  it('returns null without ctx, createPattern, or image', () => {
    const img = { width: 100, height: 100 } as unknown as CanvasImageSource;
    expect(createImageTexturePattern(null as unknown as CanvasRenderingContext2D, img, 32)).toBeNull();
    expect(createImageTexturePattern({} as unknown as CanvasRenderingContext2D, img, 32)).toBeNull();
    expect(createImageTexturePattern(patternCtx({}), null as unknown as CanvasImageSource, 32)).toBeNull();
  });

  it('returns null when createPattern yields null', () => {
    const img = { width: 100, height: 100 } as unknown as CanvasImageSource;
    expect(createImageTexturePattern(patternCtx(null), img, 32)).toBeNull();
  });

  it('swallows createPattern throwing', () => {
    const ctx = {
      createPattern: () => {
        throw new Error('boom');
      },
    } as unknown as CanvasRenderingContext2D;
    const img = { width: 100, height: 100 } as unknown as CanvasImageSource;
    expect(createImageTexturePattern(ctx, img, 32)).toBeNull();
  });

  it('scales the source so its width maps to 2 cells', () => {
    const transforms: { a: number; d: number }[] = [];
    const pattern = {
      setTransform: (m: { a: number; d: number }) => transforms.push({ a: m.a, d: m.d }),
    } as unknown as CanvasPattern;
    const img = { width: 50, height: 50 } as unknown as CanvasImageSource;
    const result = createImageTexturePattern(patternCtx(pattern), img, 32);
    expect(result).toBe(pattern);
    if (typeof DOMMatrix !== 'undefined') {
      expect(transforms).toHaveLength(1);
      expect(transforms[0].a).toBeCloseTo((2 * 32) / 50, 6);
      expect(transforms[0].d).toBeCloseTo((2 * 32) / 50, 6);
    }
  });

  it('folds the scale factor into the transform', () => {
    const transforms: { a: number; d: number }[] = [];
    const pattern = {
      setTransform: (m: { a: number; d: number }) => transforms.push({ a: m.a, d: m.d }),
    } as unknown as CanvasPattern;
    const img = { width: 50, height: 50 } as unknown as CanvasImageSource;
    createImageTexturePattern(patternCtx(pattern), img, 32, 2);
    if (typeof DOMMatrix !== 'undefined') {
      expect(transforms).toHaveLength(1);
      expect(transforms[0].a).toBeCloseTo((2 * 2 * 32) / 50, 6);
      expect(transforms[0].d).toBeCloseTo((2 * 2 * 32) / 50, 6);
    }
  });

  it('applies rotation into the transform', () => {
    const transforms: { a: number; b: number }[] = [];
    const pattern = {
      setTransform: (m: { a: number; b: number }) => transforms.push({ a: m.a, b: m.b }),
    } as unknown as CanvasPattern;
    const img = { width: 50, height: 50 } as unknown as CanvasImageSource;
    createImageTexturePattern(patternCtx(pattern), img, 32, 1, 90);
    if (typeof DOMMatrix !== 'undefined') {
      expect(transforms).toHaveLength(1);
      expect(transforms[0].a).toBeCloseTo(0, 6);
      expect(transforms[0].b).toBeCloseTo((2 * 32) / 50, 6);
    }
  });
});
