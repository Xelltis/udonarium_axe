import type { ReplayFrameCanvas, ReplayFrameImage } from '@axe/infrastructure/replay/replay-canvas';

export interface DrawnImage {
  image: ReplayFrameImage;
  x: number;
  y: number;
  width: number;
  height: number;
  /** How soft the shadow under it is, as the canvas was set when it was drawn. */
  shadowBlur: number;
}

export interface GradientLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A stand-in 2D canvas that writes down what is drawn on it, where it lands on screen once the
 * transform is applied: text, pictures, filled boxes, outlined text and gradients.
 */
export function recorder(): {
  ctx: ReplayFrameCanvas;
  texts: { text: string; x: number; y: number; font: string; color: string }[];
  images: DrawnImage[];
  fills: { x: number; y: number; width: number; height: number; color: string }[];
  strokes: { text: string; x: number; y: number; color: string }[];
  gradients: GradientLine[];
} {
  const texts: { text: string; x: number; y: number; font: string; color: string }[] = [];
  const images: DrawnImage[] = [];
  const fills: { x: number; y: number; width: number; height: number; color: string }[] = [];
  const strokes: { text: string; x: number; y: number; color: string }[] = [];
  const gradients: GradientLine[] = [];

  // Anything flat on the ground is drawn through the matrix, so the spec applies the same
  // transform and checks where it lands on screen.
  let matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const stack: [number, number, number, number, number, number][] = [];
  const atX = (x: number, y: number) => matrix[0] * x + matrix[2] * y + matrix[4];
  const atY = (x: number, y: number) => matrix[1] * x + matrix[3] * y + matrix[5];

  const ctx = {
    globalAlpha: 1,
    filter: 'none',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    shadowColor: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {
      stack.push([...matrix] as typeof matrix);
    },
    restore() {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = [a, b, c, d, e, f];
    },
    getTransform() {
      const [a, b, c, d, e, f] = matrix;
      return { a, b, c, d, e, f };
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({
        x: atX(x, y),
        y: atY(x, y),
        width: width * matrix[0],
        height: height * matrix[3],
        color: String(ctx.fillStyle),
      });
    },
    strokeRect() {},
    rect() {},
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = compose(matrix, [a, b, c, d, e, f]);
    },
    ellipse() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    clip() {},
    arc() {},
    translate(tx: number, ty: number) {
      matrix = compose(matrix, [1, 0, 0, 1, tx, ty]);
    },
    rotate(radians: number) {
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      matrix = compose(matrix, [cos, sin, -sin, cos, 0, 0]);
    },
    scale(sx: number, sy: number) {
      matrix = compose(matrix, [sx, 0, 0, sy, 0, 0]);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      gradients.push({ x0: atX(x0, y0), y0: atY(x0, y0), x1: atX(x1, y1), y1: atY(x1, y1) });
      return { addColorStop() {} };
    },
    strokeText(text: string, x: number, y: number) {
      strokes.push({ text, x: atX(x, y), y: atY(x, y), color: String(ctx.strokeStyle) });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x: atX(x, y), y: atY(x, y), font: ctx.font, color: String(ctx.fillStyle) });
    },
    measureText(text: string) {
      return { width: [...text].length * 20 };
    },
    drawImage(image: ReplayFrameImage, x: number, y: number, width: number, height: number) {
      images.push({
        image,
        x: atX(x, y),
        y: atY(x, y),
        width: width * matrix[0],
        height: height * matrix[3],
        shadowBlur: ctx.shadowBlur,
      });
    },
  } as unknown as ReplayFrameCanvas;

  return { ctx, texts, images, fills, strokes, gradients };
}

type Matrix = [number, number, number, number, number, number];

function compose(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

/** A picture of the given size, with nothing in it. */
export function image(width: number, height: number): ReplayFrameImage {
  return { width, height } as ReplayFrameImage;
}
