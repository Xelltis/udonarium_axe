import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { trackEvery } from '@axe/application/sync/track-every';
import { ImageFile } from '@axe/core/storage/image-file';
import { isBuiltinMaterial } from '@axe/domain/media/builtin-materials';
import { ImageTag } from '@axe/domain/media/image-tag';
import { TEXTURE_IMAGE_TAG } from '@axe/domain/media/texture-catalog';

/**
 * The pictures the room has filed as textures that this reader may browse, for a list of textures
 * to choose from. Read inside a computed, it follows the files, the tags and the tags kept locked.
 *
 * What the tool is built with is left out: a list that offers textures shows those by swatches of
 * their own, and they are in the library as well, so here they would be offered twice over.
 */
export function textureImagesOf(
  objectChange: ObjectChangeService,
  rolePermission: RolePermissionService,
  tagLock: ImageTagLockService
): ImageFile[] {
  objectChange.fileVersion();
  trackEvery(objectChange, 'image-tag');
  tagLock.track();
  return ImageTag.searchImages([TEXTURE_IMAGE_TAG], rolePermission.canSeeHidden(), tagLock.hides).filter(
    (file) => !isBuiltinMaterial(file.identifier)
  );
}
