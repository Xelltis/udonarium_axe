import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { textureImagesOf } from '@axe/application/file/texture-images';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { TEXTURE_ASSET_URLS, TEXTURE_BASE_COLOR, TEXTURE_IDS, TextureId } from '@axe/domain/media/texture-catalog';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TextureIntakeService } from '@axe/features/map-editor/editor/texture-intake.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The textures to paint or stroke with: the swatches the tool is built with, the pictures the room
 * filed as textures, a button to take one in, and how large and how turned the texture is laid.
 */
@Component({
  selector: 'map-editor-texture-picker',
  templateUrl: './map-editor-texture-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'contents' },
})
export class MapEditorTexturePickerComponent {
  protected readonly state = inject(MapEditorState);
  private readonly imageStorage = inject(ImageStorage);
  private readonly textureIntake = inject(TextureIntakeService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tagLock = inject(ImageTagLockService);

  private readonly textureFileInput = viewChild<ElementRef<HTMLInputElement>>('textureFileInput');

  protected readonly textureIds = TEXTURE_IDS;
  protected readonly textureBaseColor = TEXTURE_BASE_COLOR;
  protected readonly textureAssetUrls = TEXTURE_ASSET_URLS;

  protected readonly imageTextures = computed<ImageFile[]>(() => textureImagesOf(this.objectChange, this.tagLock));

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
