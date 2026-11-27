import { isModelMotion, modelNameOf } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { motionFileIdsOf } from '@axe/domain/media/model-motion-ids';
import { ModelTag } from '@axe/domain/media/model-tag';

/** A motion for VRM models given to a model: the identifier it is held under, its name, and where its bytes are read from, empty until they are held here. */
export interface ModelMotionFile {
  readonly identifier: string;
  readonly name: string;
  readonly url: string;
}

/**
 * The motions for VRM models given to a model, by the identifier it is held under, in the order they
 * were given: each named as its file was, without `.vrma`, numbered where two would go by one name,
 * and read from its bytes held here. One known to this seat as no motion is left out; one not known
 * yet is kept, with no bytes to read from, until it comes.
 */
export function modelMotionFilesOf(modelIdentifier: string): ModelMotionFile[] {
  const ids = motionFileIdsOf(ModelTag.get(modelIdentifier)?.motions ?? '');
  const taken = new Set<string>();
  const files: ModelMotionFile[] = [];
  for (const identifier of ids) {
    const held = ModelStorage.instance.get(identifier);
    if (held?.name && !isModelMotion(held)) continue;
    const stem = (held ? modelNameOf(held.name) : '').trim() || identifier.slice(0, 8);
    let name = stem;
    for (let copy = 2; taken.has(name); copy++) name = `${stem} (${copy})`;
    taken.add(name);
    files.push({ identifier, name, url: held?.isReady ? held.url : '' });
  }
  return files;
}
