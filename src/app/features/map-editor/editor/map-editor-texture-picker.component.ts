import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag } from '@axe/domain/media/image-tag';
import {
  TEXTURE_ASSET_URLS,
  TEXTURE_BASE_COLOR,
  TEXTURE_IDS,
  TEXTURE_IMAGE_TAG,
  TextureId,
} from '@axe/domain/media/texture-catalog';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TextureIntakeService } from '@axe/features/map-editor/editor/texture-intake.service';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'map-editor-texture-picker',
  templateUrl: './map-editor-texture-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'contents' },
})
export class MapEditorTexturePickerComponent {
  protected readonly state = inject(MapEditorState);
  private readonly imageStorage = inject(ImageStorage);
  private readonly textureIntake = inject(TextureIntakeService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  private readonly textureFileInput = viewChild<ElementRef<HTMLInputElement>>('textureFileInput');

  protected readonly textureIds = TEXTURE_IDS;
  protected readonly textureBaseColor = TEXTURE_BASE_COLOR;
  protected readonly textureAssetUrls = TEXTURE_ASSET_URLS;

  protected readonly imageTextures = computed<ImageFile[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('image-tag')();
    return ImageTag.searchImages([TEXTURE_IMAGE_TAG], this.rolePermission.canSeeHidden);
  });

  protected selectTexture(id: TextureId): void {
    this.state.textureId.set(id);
    this.state.fillMode.set('texture');
  }

  protected selectImageTexture(file: ImageFile): void {
    this.state.textureId.set('image:' + file.identifier);
    this.state.fillMode.set('texture');
  }

  protected isActiveImageTexture(file: ImageFile): boolean {
    return this.state.textureId() === 'image:' + file.identifier;
  }

  protected triggerTextureUpload(): void {
    this.textureFileInput()?.nativeElement.click();
  }

  protected async onTextureFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const imageFile = await this.textureIntake.takeIn(file);
    if (!imageFile) return;
    this.state.fillMode.set('texture');
    this.state.textureId.set('image:' + imageFile.identifier);
  }
}
