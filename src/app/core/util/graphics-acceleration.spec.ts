import { drawsWithoutGpu, isSoftwareRenderer } from '@axe/core/util/graphics-acceleration';

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
