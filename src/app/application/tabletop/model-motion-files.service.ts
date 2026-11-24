import { inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { modelNameOf } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import {
  MAX_MODEL_MOTION_FILES,
  type ModelMotionFile,
  modelMotionFilesOf,
  motionFileIdsOf,
  writeMotionFileIds,
} from '@axe/domain/media/model-motion-files';
import { ModelTag, modelTagIdentifierOf } from '@axe/domain/media/model-tag';

/** A motion for VRM models held here, as it may be chosen to give a model. */
export interface HeldMotionFile {
  readonly identifier: string;
  readonly name: string;
}

/**
 * The motions for VRM models (`.vrma`) given to the models of the room: which a model is given, which
 * may be given it, and the giving and taking back of one, which goes to the whole room with the
 * model, for every piece drawn as it. Read as signals, so what is shown of them follows them.
 */
@Injectable({ providedIn: 'root' })
export class ModelMotionFilesService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly storage = inject(ModelStorage);

  /** The motions a model is given, in the order they were given, as `modelMotionFilesOf` names them. */
  givenTo(modelIdentifier: string): ModelMotionFile[] {
    this.follow(modelIdentifier);
    return modelMotionFilesOf(modelIdentifier);
  }

  /**
   * Follows what a model is given, and the bytes of what it is given coming in, for whatever draws
   * the model to draw it again as they change: the motions are part of how a model is read.
   */
  follow(modelIdentifier: string): void {
    this.objectChange.versionOf(modelTagIdentifierOf(modelIdentifier))();
    this.objectChange.fileVersion();
  }

  /** The motions held here that a model may yet be given, by name. */
  givable(modelIdentifier: string): HeldMotionFile[] {
    const given = new Set(this.givenTo(modelIdentifier).map((motion) => motion.identifier));
    return this.storage.motionFiles
      .filter((motion) => !given.has(motion.identifier))
      .map((motion) => ({ identifier: motion.identifier, name: modelNameOf(motion.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Whether this seat may give a model motions or take them back: one that may change the table. */
  canGive(): boolean {
    return this.permission.canEditTabletop();
  }

  /** Gives a model a motion, after those it is given. False, with nothing done, where this seat may not or it may have no more. */
  give(modelIdentifier: string, motionIdentifier: string): boolean {
    if (!this.canGive()) return false;
    const ids = motionFileIdsOf(ModelTag.get(modelIdentifier)?.motions ?? '');
    if (ids.includes(motionIdentifier) || ids.length >= MAX_MODEL_MOTION_FILES) return false;
    ModelTag.giveMotions(modelIdentifier, writeMotionFileIds([...ids, motionIdentifier]));
    return true;
  }

  /** Takes a motion back from a model. False, with nothing done, where this seat may not or the model was not given it. */
  takeBack(modelIdentifier: string, motionIdentifier: string): boolean {
    if (!this.canGive()) return false;
    const ids = motionFileIdsOf(ModelTag.get(modelIdentifier)?.motions ?? '');
    if (!ids.includes(motionIdentifier)) return false;
    ModelTag.giveMotions(modelIdentifier, writeMotionFileIds(ids.filter((id) => id !== motionIdentifier)));
    return true;
  }
}
