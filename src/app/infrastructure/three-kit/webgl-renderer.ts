import { SRGBColorSpace, WebGLRenderer, type WebGLRendererParameters } from 'three';

/**
 * A WebGL renderer on a canvas: antialiased and see-through, writing sRGB and clearing to nothing,
 * with any other parameters given laid over those.
 */
export function webglRendererOn(
  canvas: HTMLCanvasElement,
  parameters: Omit<WebGLRendererParameters, 'canvas'> = {}
): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, ...parameters });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/**
 * Lets a WebGL renderer go, and the browser's hold on its drawing with it: a page keeps few
 * drawings at once, and one too many loses the oldest, which may be the table's. Only for a
 * canvas that goes with the renderer, as one drawn on again would be handed the lost drawing.
 */
export function letGoOfWebglRenderer(renderer: Pick<WebGLRenderer, 'dispose' | 'forceContextLoss'>): void {
  renderer.dispose();
  renderer.forceContextLoss();
}
