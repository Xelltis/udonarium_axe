import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag } from '@axe/domain/media/image-tag';
import { TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { MapEditorTexturePickerComponent } from '@axe/features/map-editor/editor/map-editor-texture-picker.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface Picker {
  imageTextures(): { identifier: string }[];
  selectImageTexture(file: ImageFile): void;
  selectTexture(id: string): void;
  onTextureFileSelected(event: Event): Promise<void>;
}

describe('MapEditorTexturePickerComponent', () => {
  let fixture: ComponentFixture<MapEditorTexturePickerComponent>;
  let picker: Picker;
  let state: MapEditorState;
  let imageStorage: { addAsync: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let modal: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    imageStorage = { addAsync: vi.fn(), get: vi.fn() };
    modal = { open: vi.fn().mockResolvedValue(null) };
    TestBed.configureTestingModule({
      imports: [MapEditorTexturePickerComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    });
    TestBed.overrideProvider(ImageStorage, { useValue: imageStorage });
    TestBed.overrideProvider(ModalService, { useValue: modal });
    TestBed.inject(ObjectChangeService);
    state = TestBed.inject(MapEditorState);
    fixture = TestBed.createComponent(MapEditorTexturePickerComponent);
    picker = fixture.componentInstance as unknown as Picker;
  });

  afterEach(() => {
    ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
  });

  function upload(): Event {
    const input = { files: [new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })], value: 'x' };
    return { target: input } as unknown as Event;
  }

  it('lists the images tagged as patterns', () => {
    ImageStorage.instance.add('tex-1');
    ImageStorage.instance.add('other');
    ImageTag.create('tex-1').tag = 'テクスチャ';
    ImageTag.create('other').tag = 'スタンプ';

    expect(picker.imageTextures().map((f) => f.identifier)).toEqual(['tex-1']);
  });

  it('leaves out the pictures it has swatches of its own for', () => {
    const floor = TEXTURE_ASSET_URLS.marble;
    ImageStorage.instance.add(floor);
    ImageStorage.instance.add('mine');
    ImageTag.create(floor).tag = 'テクスチャ';
    ImageTag.create('mine').tag = 'テクスチャ';

    expect(picker.imageTextures().map((f) => f.identifier)).toEqual(['mine']);
  });

  it('selects a pattern by its prefixed id and switches to pattern fill', () => {
    picker.selectImageTexture(ImageFile.create('tex-9'));
    expect(state.textureId()).toBe('image:tex-9');
    expect(state.fillMode()).toBe('texture');
  });

  it('saves the cropped image and tags it as a pattern', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/webp' });
    modal.open.mockResolvedValue(blob);
    imageStorage.addAsync.mockResolvedValue({ identifier: 'cropped-1' });

    await picker.onTextureFileSelected(upload());

    expect(imageStorage.addAsync).toHaveBeenCalledWith(blob);
    expect(ImageTag.get('cropped-1').tag).toBe('テクスチャ');
    expect(state.textureId()).toBe('image:cropped-1');
    expect(state.fillMode()).toBe('texture');
  });

  it('saves nothing when the crop dialogue is dismissed', async () => {
    await picker.onTextureFileSelected(upload());
    expect(imageStorage.addAsync).not.toHaveBeenCalled();
  });
});
