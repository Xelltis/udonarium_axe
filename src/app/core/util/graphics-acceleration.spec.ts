import { drawsWithoutGpu, isSoftwareRenderer, tableGraphicsOf } from '@axe/core/util/graphics-acceleration';

/** A canvas whose WebGL answers as a browser with or without the GPU does. */
function canvasOf(answer: { fast: string | null; any: string | null }) {
  const lost = vi.fn();
  const contextNaming = (renderer: string) => ({
    RENDERER: 0x1f01,
    getParameter: () => renderer,
    getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext: lost } : null),
  });
  const canvas = {
    getContext: (_kind: string, options?: WebGLContextAttributes) => {
      const renderer = options?.failIfMajorPerformanceCaveat ? answer.fast : answer.any;
      return renderer === null ? null : contextNaming(renderer);
    },
  } as unknown as HTMLCanvasElement;
  return { make: () => canvas, lost };
}

describe('isSoftwareRenderer', () => {
  it('knows the rasterisers that draw without the GPU', () => {
    expect(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(
      true
    );
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
  });

  it('takes a GPU for what it is', () => {
    expect(isSoftwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(isSoftwareRenderer('Apple M2')).toBe(false);
    expect(isSoftwareRenderer('WebKit WebGL')).toBe(false);
  });
});

describe('drawsWithoutGpu', () => {
  it('finds no GPU where WebGL comes only with a major performance caveat', () => {
    expect(drawsWithoutGpu(canvasOf({ fast: null, any: 'WebKit WebGL' }).make)).toBe(true);
  });

  it('finds no GPU where the renderer names a software rasteriser', () => {
    expect(drawsWithoutGpu(canvasOf({ fast: 'llvmpipe (LLVM 15.0.7)', any: 'llvmpipe (LLVM 15.0.7)' }).make)).toBe(
      true
    );
  });

  it('finds the GPU where WebGL comes without a caveat', () => {
    expect(drawsWithoutGpu(canvasOf({ fast: 'WebKit WebGL', any: 'WebKit WebGL' }).make)).toBe(false);
  });

  it('says nothing of a browser with no WebGL at all', () => {
    expect(drawsWithoutGpu(canvasOf({ fast: null, any: null }).make)).toBe(false);
  });

  it('lets go of each context it made to ask', () => {
    const { make, lost } = canvasOf({ fast: null, any: 'WebKit WebGL' });

    drawsWithoutGpu(make);

    expect(lost).toHaveBeenCalledOnce();
  });

  it('takes a canvas that throws on being asked as one with no WebGL', () => {
    const throwing = {
      getContext: () => {
        throw new Error('blocked');
      },
    } as unknown as HTMLCanvasElement;

    expect(drawsWithoutGpu(() => throwing)).toBe(false);
  });
});

describe('tableGraphicsOf', () => {
  /** A canvas that makes a WebGL2 context or not, and one even where software drawing is refused or not. */
  function canvasMaking(webgl2: boolean, card = true): () => HTMLCanvasElement {
    return () =>
      ({
        getContext: (kind: string, options?: WebGLContextAttributes) =>
          kind === 'webgl2' && webgl2 && (card || !options?.failIfMajorPerformanceCaveat)
            ? { getExtension: () => ({ loseContext: () => undefined }) }
            : null,
      }) as unknown as HTMLCanvasElement;
  }

  it('says WebGPU is there where the browser gives an adapter, and WebGL2 where it makes a context', async () => {
    const gpu = { requestAdapter: () => Promise.resolve({}) };
    expect(await tableGraphicsOf(gpu, canvasMaking(true))).toEqual({ webgpu: true, webgl2: true, hardware: true });
  });

  it('says neither is there for a browser with no adapter and no context', async () => {
    const gpu = { requestAdapter: () => Promise.resolve(null) };
    expect(await tableGraphicsOf(gpu, canvasMaking(false))).toEqual({ webgpu: false, webgl2: false, hardware: false });
    expect(await tableGraphicsOf(undefined, canvasMaking(true))).toEqual({
      webgpu: false,
      webgl2: true,
      hardware: true,
    });
  });

  it('takes an adapter refused with an error for no adapter', async () => {
    const gpu = { requestAdapter: () => Promise.reject(new Error('blocked')) };
    expect((await tableGraphicsOf(gpu, canvasMaking(true))).webgpu).toBe(false);
  });

  it('finds no graphics card where the adapter is the fallback one and WebGL2 is drawn only in software', async () => {
    const fallback = { requestAdapter: () => Promise.resolve({ info: { isFallbackAdapter: true } }) };
    const older = { requestAdapter: () => Promise.resolve({ isFallbackAdapter: true }) };

    expect((await tableGraphicsOf(fallback, canvasMaking(true, false))).hardware).toBe(false);
    expect((await tableGraphicsOf(older, canvasMaking(true, false))).hardware).toBe(false);
    expect((await tableGraphicsOf(fallback, canvasMaking(true, true))).hardware).toBe(true);
    expect((await tableGraphicsOf(undefined, canvasMaking(true, false))).hardware).toBe(false);
  });
});
