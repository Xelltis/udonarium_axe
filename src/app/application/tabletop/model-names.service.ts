import { inject, Injectable, signal, type WritableSignal } from '@angular/core';
import { type GltfNames, gltfNamesOfBlob } from '@axe/core/storage/gltf-facts';
import { ModelStorage } from '@axe/core/storage/model-storage';

/** A model that names nothing, as one not read yet. */
export const NO_MODEL_NAMES: GltfNames = Object.freeze({ motions: [], shapes: [], materials: [] });

/**
 * What the models held here name of themselves, for whoever sets one up to choose among: its
 * motions, the shapes it can be blended towards and its materials. Each model is read once, from its
 * file's JSON alone, the first time it is asked after while its bytes are held in full.
 */
@Injectable({ providedIn: 'root' })
export class ModelNamesService {
  private readonly storage = inject(ModelStorage);
  private readonly read = new Map<string, WritableSignal<GltfNames>>();
  private readonly asked = new Set<string>();

  /**
   * What a model names, by the identifier it is kept under: nothing until it has been read, and
   * nothing for one that is not held here or cannot be read. Read as a signal, so what is shown of it
   * follows its being read; asked again once a model not held before has come, it is read then.
   */
  namesOf(identifier: string): GltfNames {
    let names = this.read.get(identifier);
    if (!names) {
      names = signal(NO_MODEL_NAMES);
      this.read.set(identifier, names);
    }
    if (!this.asked.has(identifier)) {
      const blob = this.storage.get(identifier)?.blob;
      if (blob) {
        this.asked.add(identifier);
        const known = names;
        void gltfNamesOfBlob(blob).then(
          (found) => known.set(found ?? NO_MODEL_NAMES),
          () => undefined
        );
      }
    }
    return names();
  }
}
