import { WebGPURenderer } from 'three/webgpu';

/** How a renderer is made on a canvas. */
export interface CanvasRendererOptions {
  /** Whether the canvas is see-through, clearing to nothing rather than to its background. */
  readonly alpha: boolean;
  /** The colour a canvas that is not see-through clears to; black where none is given. */
  readonly background?: number;
  /** Whether to draw through WebGL2 even where WebGPU is to be had. */
  readonly forceWebGL?: boolean;
}

/**
 * A renderer readied on a canvas, through WebGPU where it can draw and WebGL2 elsewhere:
 * antialiased, and clearing to nothing where it is see-through or to its background otherwise.
 */
export async function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  options: CanvasRendererOptions
): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: options.alpha,
    forceWebGL: options.forceWebGL,
  });
  await renderer.init();
  renderer.setClearColor(options.background ?? 0x000000, options.alpha ? 0 : 1);
  return renderer;
}
