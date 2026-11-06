/**
 * The names a WebGL renderer goes by when it draws without the GPU: Chrome's SwiftShader, Mesa's
 * llvmpipe and softpipe, and Windows' WARP, which calls itself the Microsoft Basic Render Driver.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render driver|software rasterizer/i;

/** Whether a WebGL renderer's name is that of a rasteriser drawing without the GPU. */
export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERER.test(renderer);
}

/**
 * Whether this browser draws the page without the GPU, as it does with its graphics acceleration
 * turned off, which makes every frame of a 3D table many times dearer to put together.
 *
 * Asked of WebGL, the one thing a page can ask: a browser that will not make a context without a
 * major performance caveat, but will make one with it, draws in software, and so does one whose
 * renderer names a software rasteriser. A browser with no WebGL at all says nothing either way and
 * is not taken to draw without the GPU. Each context made to ask is let go at once.
 */
export function drawsWithoutGpu(makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')): boolean {
  const fast = rendererOf(makeCanvas, { failIfMajorPerformanceCaveat: true });
  if (fast !== null) return isSoftwareRenderer(fast);
  return rendererOf(makeCanvas, {}) !== null;
}

/** The renderer a WebGL context made with these options names, or null where none is made. */
function rendererOf(makeCanvas: () => HTMLCanvasElement, options: WebGLContextAttributes): string | null {
  let gl: WebGLRenderingContext | null;
  try {
    const canvas = makeCanvas();
    gl = (canvas.getContext('webgl', options) ??
      canvas.getContext('experimental-webgl', options)) as WebGLRenderingContext | null;
  } catch {
    return null;
  }
  if (!gl) return null;
  try {
    return String(gl.getParameter(gl.RENDERER) ?? '');
  } catch {
    return '';
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** The interfaces this browser can draw the 3D table through. */
export interface TableGraphics {
  readonly webgpu: boolean;
  readonly webgl2: boolean;
  /**
   * Whether one of them is drawn by a graphics card rather than in software, which the table can be
   * drawn at its best on. Left out, not known to be.
   */
  readonly hardware?: boolean;
}

type GpuAdapter = { readonly isFallbackAdapter?: boolean; readonly info?: { readonly isFallbackAdapter?: boolean } };
type GpuNavigator = { readonly gpu?: { requestAdapter(): Promise<unknown> } };

/**
 * Whether this browser can draw the 3D table, through WebGPU where it gives an adapter and through
 * WebGL2 where it makes a context, and whether a graphics card draws it: an adapter that is not the
 * fallback one, or a context made even where one drawn in software is refused. A browser with its
 * graphics turned off and its software drawing forbidden gives neither, and the table is not to be
 * drawn there at all. The contexts made to ask are let go at once.
 */
export async function tableGraphicsOf(
  gpu: GpuNavigator['gpu'] = (navigator as unknown as GpuNavigator).gpu,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')
): Promise<TableGraphics> {
  const adapter = await adapterOf(gpu);
  const webgl2 = makesWebGl2(makeCanvas);
  const softAdapter = adapter?.info?.isFallbackAdapter ?? adapter?.isFallbackAdapter ?? false;
  const hardware =
    (!!adapter && !softAdapter) || (webgl2 && makesWebGl2(makeCanvas, { failIfMajorPerformanceCaveat: true }));
  return { webgpu: adapter !== null, webgl2, hardware };
}

async function adapterOf(gpu: GpuNavigator['gpu']): Promise<GpuAdapter | null> {
  try {
    return ((await gpu?.requestAdapter()) as GpuAdapter | null | undefined) ?? null;
  } catch {
    return null;
  }
}

function makesWebGl2(makeCanvas: () => HTMLCanvasElement, options?: WebGLContextAttributes): boolean {
  let gl: WebGL2RenderingContext | null;
  try {
    gl = makeCanvas().getContext('webgl2', options) as WebGL2RenderingContext | null;
  } catch {
    return false;
  }
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}
