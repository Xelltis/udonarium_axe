import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag } from '@axe/domain/media/image-tag';
import { isImageStampId, MAP_STAMP_TAG, toImageStampId } from '@axe/features/map-editor/assets/image-stamp';
import { STAMP_CATEGORIES, StampCategory, StampDef } from '@axe/features/map-editor/assets/stamp-types';
import { getStampsByCategory } from '@axe/features/map-editor/assets/stamps';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * A data URI of the stamp's SVG for previews, painted in the colour when one is given and left to
 * follow the text colour otherwise.
 */
export function stampDataUri(def: StampDef, color: string | null): string {
  const svg = def.svg.split('currentColor').join(color ?? 'currentColor');
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

@Component({
  selector: 'map-editor-stamp-picker',
  templateUrl: './map-editor-stamp-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
  host: { class: 'contents' },
})
export class MapEditorStampPickerComponent {
  protected readonly state = inject(MapEditorState);
  private readonly imageStorage = inject(ImageStorage);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);

  private readonly stampFileInput = viewChild<ElementRef<HTMLInputElement>>('stampFileInput');

  protected readonly stampCategories = STAMP_CATEGORIES;
  protected readonly categoryStamps = computed<StampDef[]>(() => getStampsByCategory(this.state.stampCategory()));

  protected readonly stampImages = computed<ImageFile[]>(() => {
    this.objectChange.fileVersion();
    this.objectChange.collectionOf('image-tag')();
    return ImageTag.searchImages([MAP_STAMP_TAG], this.rolePermission.canSeeHidden);
  });

  protected stampDataUri(def: StampDef, color: string | null): string {
    return stampDataUri(def, color);
  }

  protected setStampCategory(cat: StampCategory): void {
    this.state.stampCategory.set(cat);
  }

  protected selectStamp(id: string): void {
    this.state.stampId.set(id);
  }

  protected selectImageStamp(file: ImageFile): void {
    this.state.stampId.set(toImageStampId(file.identifier));
    this.state.stampColor.set(null);
    this.state.stampSize.set(Math.min(256, Math.max(16, this.state.current.cellPx)));
  }

  protected isActiveImageStamp(file: ImageFile): boolean {
    return this.state.stampId() === toImageStampId(file.identifier);
  }

  protected isImageStampSelected(): boolean {
    const id = this.state.stampId();
    return !!id && isImageStampId(id);
  }

  protected triggerStampUpload(): void {
    this.stampFileInput()?.nativeElement.click();
  }

  protected async onStampFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const imageFile = await this.imageStorage.addAsync(file);
    const tag = ImageTag.get(imageFile.identifier) ?? ImageTag.create(imageFile.identifier);
    tag.tag = MAP_STAMP_TAG;
    this.objectChange.notifyCollectionChanged('image-tag');
    this.selectImageStamp(imageFile);
  }
}
