import { readFileSync } from 'node:fs';

import { TABLE_3D_QUALITY } from '@axe/infrastructure/table-3d/table-3d-quality';
import { TablePost } from '@axe/infrastructure/table-3d/table-post';
import { type Node, NodeFrame, Object3D, PerspectiveCamera, Scene, type WebGPURenderer } from 'three/webgpu';

/** A renderer that only notes what it is asked to do, keeping its count of frames as the library's does. */
function notingRenderer(frames: { update(): void } | null) {
  const render = vi.fn();
  const renderer = { render, _nodes: frames ? { nodeFrame: frames } : null } as unknown as WebGPURenderer;
  return { renderer, render };
}

describe('TablePost', () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const glow = null as unknown as Node<'vec3'>;

  it('passes over a thing taken out of the scene while those before it were readied', async () => {
    const stage = new Scene();
    const first = new Object3D();
    const second = new Object3D();
    stage.add(first, second);
    const compileAsync = vi.fn(async (thing: Object3D) => {
      if (thing === first) stage.remove(second);
    });
    const renderer = {
      compileAsync,
      getRenderTarget: () => null,
      getMRT: () => null,
      setRenderTarget: vi.fn(),
      setMRT: vi.fn(),
      _nodes: null,
    } as unknown as WebGPURenderer;

    await new TablePost(renderer, glow).compileAsync(stage, camera, TABLE_3D_QUALITY.light, [first, second]);

    expect(compileAsync.mock.calls.map(([thing]) => thing)).toEqual([first]);
  });

  it('has the renderer take every drawing of the scene for a frame of its own, before it is drawn', () => {
    const update = vi.fn();
    const { renderer, render } = notingRenderer({ update });
    const post = new TablePost(renderer, glow);

    post.render(scene, camera, TABLE_3D_QUALITY.light);
    post.render(scene, camera, TABLE_3D_QUALITY.light);

    expect(update).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
    expect(update.mock.invocationCallOrder[1]).toBeLessThan(render.mock.invocationCallOrder[1]);
    expect(update.mock.invocationCallOrder[1]).toBeGreaterThan(render.mock.invocationCallOrder[0]);
  });

  it('reaches for the count of frames where the library keeps it, which counts on as asked', () => {
    const library = readFileSync('node_modules/three/build/three.webgpu.js', 'utf8');
    const frames = new NodeFrame();
    const before = frames.frameId;
    frames.update();

    expect(library).toMatch(/this\._nodes = new NodeManager\(/);
    expect(library).toMatch(/this\.nodeFrame = new NodeFrame\(\)/);
    expect(frames.frameId).toBe(before + 1);
  });

  it('draws all the same with a renderer that keeps no count of frames yet', () => {
    const { renderer, render } = notingRenderer(null);

    expect(() => new TablePost(renderer, glow).render(scene, camera, TABLE_3D_QUALITY.light)).not.toThrow();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
