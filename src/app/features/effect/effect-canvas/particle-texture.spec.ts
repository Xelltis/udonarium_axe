import type { ParticleShape } from '@axe/domain/effect/particles/shared';
import { particleTexture } from '@axe/features/effect/effect-canvas/particle-texture';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';

describe('particleTexture()', () => {
  interface Gradient {
    /** The circles the gradient runs between: x, y and radius of the inner, then of the outer. */
    readonly circles: readonly number[];
    readonly stops: [number, string][];
  }

  interface Drawing {
    gradients: Gradient[];
    /** What was filled, in order: a rectangle with its box, or the path drawn so far. */
    fills: { kind: 'rect' | 'path'; style: unknown; points: number[][] }[];
  }

  const borrowed = new BorrowedGlobals();
  /** What was drawn on each canvas a texture was baked on. */
  let drawings: Map<HTMLCanvasElement, Drawing>;
  /** Whether the browser gives a 2D context at all. */
  let draws = true;
  let serial = 0;

  /** A colour no other test has baked, as the textures are kept for the life of the page. */
  function freshColor(): string {
    serial += 1;
    return `#${(0x100000 + serial).toString(16)}`;
  }

  function contextOn(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const drawing: Drawing = { gradients: [], fills: [] };
    drawings.set(canvas, drawing);
    let path: number[][] = [];
    const context = {
      fillStyle: '' as unknown,
      createRadialGradient(...circles: number[]) {
        const gradient: Gradient = { circles, stops: [] };
        drawing.gradients.push(gradient);
        return { addColorStop: (at: number, color: string) => gradient.stops.push([at, color]), gradient };
      },
      fillRect(x: number, y: number, width: number, height: number) {
        drawing.fills.push({ kind: 'rect', style: context.fillStyle, points: [[x, y, width, height]] });
      },
      beginPath: () => (path = []),
      moveTo: (x: number, y: number) => path.push([x, y]),
      lineTo: (x: number, y: number) => path.push([x, y]),
      closePath: () => undefined,
      fill() {
        drawing.fills.push({ kind: 'path', style: context.fillStyle, points: path });
      },
    };
    return context as unknown as CanvasRenderingContext2D;
  }

  function baked(shape: ParticleShape, color = freshColor()): { canvas: HTMLCanvasElement; drawing: Drawing } {
    const canvas = particleTexture(shape, color)!;
    return { canvas, drawing: drawings.get(canvas)! };
  }

  /** How opaque a stop written as `rgb(r g b / a)` or `rgba(r, g, b, a)` is. */
  function alphaOf(color: string): number {
    const parts = color.match(/[\d.]+/g) ?? [];
    return Number(parts[parts.length - 1]);
  }

  beforeEach(() => {
    drawings = new Map();
    draws = true;
    borrowed.lendOn(HTMLCanvasElement.prototype, 'getContext', function (this: HTMLCanvasElement) {
      return draws ? contextOn(this) : null;
    });
  });

  afterEach(() => borrowed.giveBack());

  it('bakes a square canvas once for a shape in a colour, and hands the same one out after', () => {
    const color = freshColor();

    const first = particleTexture('glow', color);
    const second = particleTexture('glow', color);

    expect(first).not.toBeNull();
    expect([first!.width, first!.height]).toEqual([128, 128]);
    expect(second).toBe(first);
    expect(drawings.size).toBe(1);
  });

  it('keeps a texture apart for each shape and each colour', () => {
    const color = freshColor();

    const glow = particleTexture('glow', color);

    expect(particleTexture('smoke', color)).not.toBe(glow);
    expect(particleTexture('glow', freshColor())).not.toBe(glow);
  });

  it('answers nothing where the browser gives no context to draw on, and bakes once it does', () => {
    const color = freshColor();
    draws = false;
    expect(particleTexture('glow', color)).toBeNull();

    draws = true;
    expect(particleTexture('glow', color)).not.toBeNull();
  });

  it.each([['glow'], ['streak']] as [ParticleShape][])(
    'draws a %s as a disc white-hot at the centre and gone at the rim',
    (shape) => {
      const { drawing } = baked(shape);
      const [gradient] = drawing.gradients;

      expect(gradient.circles).toEqual([64, 64, 0, 64, 64, 64]);
      expect(gradient.stops.map(([at]) => at)).toEqual([0, 0.18, 0.5, 1]);
      expect(alphaOf(gradient.stops[0][1])).toBe(1);
      expect(alphaOf(gradient.stops[3][1])).toBe(0);
      expect(drawing.fills).toHaveLength(1);
      expect(drawing.fills[0].points).toEqual([[0, 0, 128, 128]]);
    }
  );

  it('draws smoke with no core: thinner at the centre than a glow, and soft to the rim', () => {
    const { drawing } = baked('smoke');
    const stops = drawing.gradients[0].stops;

    expect(stops.map(([at]) => at)).toEqual([0, 0.45, 1]);
    expect(stops.map(([, color]) => alphaOf(color))).toEqual([0.85, 0.4, 0]);
  });

  it('draws a puff thick in its own colour to the heart and soft only at the edge', () => {
    const { drawing } = baked('puff');
    const stops = drawing.gradients[0].stops;

    expect(stops.map(([at]) => at)).toEqual([0, 0.5, 0.8, 1]);
    expect(stops.map(([, color]) => alphaOf(color))).toEqual([0.95, 0.8, 0.3, 0]);
  });

  it('draws a bubble clear in the middle and bright near the rim, with a glint high on one side', () => {
    const { drawing } = baked('bubble');
    const [film, glint] = drawing.gradients;

    expect(film.circles).toEqual([64, 64, 32, 64, 64, 64]);
    expect(film.stops.map(([, color]) => alphaOf(color))).toEqual([0, 0.3, 0.9, 0]);
    expect(glint.circles[0]).toBeLessThan(64);
    expect(glint.circles[1]).toBeLessThan(64);
    expect(glint.stops.map(([, color]) => alphaOf(color))).toEqual([0.95, 0]);
    expect(drawing.fills.map((fill) => fill.kind)).toEqual(['rect', 'rect']);
  });

  it('draws a chunk as a hard polygon in its colour with only its top face lit', () => {
    const color = freshColor();
    const { drawing } = baked('chunk', color);
    const [body, face] = drawing.fills;

    expect(drawing.gradients).toHaveLength(0);
    expect(body).toMatchObject({ kind: 'path', style: color });
    expect(body.points).toHaveLength(7);
    expect(face.kind).toBe('path');
    expect(face.points).toHaveLength(4);
    expect(alphaOf(String(face.style))).toBe(0.24);
    for (const [x, y] of [...body.points, ...face.points]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(128);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(128);
    }
  });
});
