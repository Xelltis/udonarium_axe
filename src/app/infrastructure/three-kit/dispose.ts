import type { EventDispatcher, Material, Object3D } from 'three';

/**
 * Tells the renderer an object taken out of the scene for good, and everything under it, is drawn no
 * more, so it lets go of what it built to draw each, leaving their geometry and materials, which
 * others may share, as they are. The WebGPU renderer keeps what it builds for a mesh until the mesh,
 * or its material, says it is disposed of: a mesh merely taken out, wearing a material that goes on
 * being worn, is kept for good, and the mesh, its geometry and all built for it with it.
 */
export function forgetDrawn(root: Object3D): void {
  root.traverse((object) =>
    (object as unknown as EventDispatcher<{ dispose: object }>).dispatchEvent({ type: 'dispose' })
  );
}

/** Gives back what an object and everything under it hold on the graphics card: geometry, materials and their textures. */
export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value) (value as { dispose(): void }).dispose();
      }
      material.dispose();
    }
  });
}

/** What of a renderer {@link letGoOfRenderer} reaches: its own letting go, and what it draws through. */
export interface HandedCanvasRenderer {
  dispose(): Promise<void> | void;
  readonly backend: unknown;
}

/**
 * Gives back a renderer that draws on a canvas it was handed, and the drawing context with it. Three
 * lets go of a WebGL context itself only on a canvas it made, and a page keeps few contexts at once:
 * one too many loses the oldest, which may be the table's. Only for a canvas that goes with the
 * renderer, as one drawn on again would be handed the lost context.
 */
export function letGoOfRenderer(renderer: HandedCanvasRenderer): Promise<void> {
  const backend = renderer.backend as { isWebGLBackend?: boolean; gl?: WebGLRenderingContext | null } | undefined;
  const lose = () => {
    if (backend?.isWebGLBackend) backend.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  };
  return Promise.resolve()
    .then(() => renderer.dispose())
    .then(lose, lose);
}
