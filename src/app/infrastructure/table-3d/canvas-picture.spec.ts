import {
  canvasOfPicture,
  fitReadPicture,
  LONGEST_PICTURE_PX,
  retakeCanvasPicture,
} from '@axe/infrastructure/table-3d/canvas-picture';
import { CanvasTexture, Texture } from 'three/webgpu';

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe('a picture taken again from a canvas', () => {
  it('is taken again in place while the canvas keeps its size', () => {
    const picture = new CanvasTexture(canvasOf(1600, 1000));
    const letGo = vi.spyOn(picture, 'dispose');
    retakeCanvasPicture(picture);
    const taken = picture.version;

    retakeCanvasPicture(picture);

    expect(letGo).not.toHaveBeenCalled();
    expect(picture.version).toBeGreaterThan(taken);
  });

  it('is let go of on the graphics card first where the canvas has been made another size', () => {
    const canvas = canvasOf(1600, 1000);
    const picture = new CanvasTexture(canvas);
    const letGo = vi.spyOn(picture, 'dispose');
    retakeCanvasPicture(picture);

    canvas.width = 2000;
    retakeCanvasPicture(picture);
    expect(letGo).toHaveBeenCalledTimes(1);

    retakeCanvasPicture(picture);
    expect(letGo).toHaveBeenCalledTimes(1);
  });

  it('is sent as a copy brought down to the longest side the card takes, still drawn from its canvas', () => {
    const canvas = canvasOf(11000, 2000);
    const picture = new CanvasTexture(canvas);

    retakeCanvasPicture(picture, canvas);

    const sent = picture.image as HTMLCanvasElement;
    expect(sent).not.toBe(canvas);
    expect([sent.width, sent.height]).toEqual([LONGEST_PICTURE_PX, Math.round((2000 * LONGEST_PICTURE_PX) / 11000)]);
    expect(canvasOfPicture(picture)).toBe(canvas);
  });

  it('is sent whole again, as the canvas itself, once the canvas is short enough', () => {
    const canvas = canvasOf(11000, 2000);
    const picture = new CanvasTexture(canvas);
    retakeCanvasPicture(picture, canvas);

    canvas.width = 3200;
    retakeCanvasPicture(picture, canvas);

    expect(picture.image).toBe(canvas);
  });
});

describe('a picture read from a file', () => {
  it('is brought down to the longest side the card takes where it was read longer', () => {
    const picture = new Texture(canvasOf(16384, 7680));
    const sent = picture.version;

    fitReadPicture(picture);

    const image = picture.image as HTMLCanvasElement;
    expect([image.width, image.height]).toEqual([LONGEST_PICTURE_PX, LONGEST_PICTURE_PX * (7680 / 16384)]);
    expect(picture.version).toBeGreaterThan(sent);
  });

  it('is left as it is where it was read whole, or not read at all', () => {
    const whole = canvasOf(1600, 1000);
    const picture = new Texture(whole);
    fitReadPicture(picture);
    expect(picture.image).toBe(whole);

    const unread = new Texture();
    expect(() => fitReadPicture(unread)).not.toThrow();
  });
});
