import { retakeCanvasPicture } from '@axe/infrastructure/table-3d/canvas-picture';
import { CanvasTexture } from 'three/webgpu';

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
});
