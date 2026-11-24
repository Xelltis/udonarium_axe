import { inject, Injectable, signal, type WritableSignal } from '@angular/core';
import { ModelMotionFilesService } from '@axe/application/tabletop/model-motion-files.service';
import type { GltfNames } from '@axe/core/storage/gltf-names';
import { ModelStorage } from '@axe/core/storage/model-storage';

/** A model that names nothing, as one not read yet. */
export const NO_MODEL_NAMES: GltfNames = Object.freeze({ motions: [], shapes: [], materials: [], vrm: false });

/**
 * What the models held here name of themselves, for whoever sets one up to choose among: its
 * motions, after them those of the motions for VRM models a VRM is given whose files are held here,
 * as one not come yet has nothing to play, the shapes it can be
 * blended towards and its materials. Each model is read once, from its
 * file's JSON alone, the first time it is asked after while its bytes are held in full; what reads it
 * is fetched the first time any is.
 */
@Injectable({ providedIn: 'root' })
export class ModelNamesService {
  private readonly storage = inject(ModelStorage);
  private readonly motionFiles = inject(ModelMotionFilesService);
  private readonly read = new Map<string, WritableSignal<GltfNames>>();
  private readonly asked = new Set<string>();

  /**
   * What a model names, by the identifier it is kept under: nothing until it has been read, and
   * nothing for one that is not held here or cannot be read. Read as a signal, so what is shown of it
   * follows its being read; asked again once a model not held before has come, it is read then, and
   * so is one whose reading failed, as where what reads it could not be fetched.
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
        void import('@axe/core/storage/gltf-names')
          .then(({ gltfNamesOfBlob }) => gltfNamesOfBlob(blob))
          .then(
            (found) => known.set(found ?? NO_MODEL_NAMES),
            () => this.asked.delete(identifier)
          );
      }
    }
    const own = names();
    if (!own.vrm) return own;
    const given = this.motionFiles
      .givenTo(identifier)
      .filter((motion) => motion.url !== '')
      .map((motion) => motion.name);
    return given.length > 0 ? { ...own, motions: [...new Set([...own.motions, ...given])] } : own;
  }
}
