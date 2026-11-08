import type { Material, Object3D } from 'three';

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
