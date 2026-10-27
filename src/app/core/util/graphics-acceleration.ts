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
