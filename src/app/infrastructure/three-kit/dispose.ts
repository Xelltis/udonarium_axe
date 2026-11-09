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
