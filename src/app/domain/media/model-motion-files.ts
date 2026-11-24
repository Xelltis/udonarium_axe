import { isModelMotion, modelNameOf } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ModelTag } from '@axe/domain/media/model-tag';

/** How many motions a model may be given. */
export const MAX_MODEL_MOTION_FILES = 24;

/** A motion for VRM models given to a model: the identifier it is held under, its name, and where its bytes are read from, empty until they are held here. */
export interface ModelMotionFile {
  readonly identifier: string;
  readonly name: string;
  readonly url: string;
}

/**
 * The identifiers of the motions written down for a model, each once and no more than a model may be
 * given; none for what is empty or cannot be read.
 */
export function motionFileIdsOf(written: string): string[] {
  if (!written) return [];
  try {
    const read: unknown = JSON.parse(written);
    if (!Array.isArray(read)) return [];
    const ids = read.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(ids)].slice(0, MAX_MODEL_MOTION_FILES);
  } catch {
    return [];
  }
}

/** The motions given to a model as they are written down: empty for none. */
export function writeMotionFileIds(ids: readonly string[]): string {
  const kept = [...new Set(ids.filter((id) => id.length > 0))].slice(0, MAX_MODEL_MOTION_FILES);
  return kept.length > 0 ? JSON.stringify(kept) : '';
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
