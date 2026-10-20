import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag } from '@axe/domain/media/image-tag';
import { MapEditorStampPickerComponent } from '@axe/features/map-editor/editor/map-editor-stamp-picker.component';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface Picker {
  stampImages(): { identifier: string }[];
  selectImageStamp(file: ImageFile): void;
  onStampFileSelected(event: Event): Promise<void>;
  isImageStampSelected(): boolean;
}

describe('MapEditorStampPickerComponent', () => {
  let fixture: ComponentFixture<MapEditorStampPickerComponent>;
  let picker: Picker;
  let state: MapEditorState;
  let imageStorage: {
    addAsync: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    isRemoved: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    imageStorage = { addAsync: vi.fn(), get: vi.fn(), isRemoved: vi.fn(() => false) };
    TestBed.configureTestingModule({
      imports: [MapEditorStampPickerComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    });
    TestBed.overrideProvider(ImageStorage, { useValue: imageStorage });
    TestBed.inject(ObjectChangeService);
    state = TestBed.inject(MapEditorState);
    fixture = TestBed.createComponent(MapEditorStampPickerComponent);
    picker = fixture.componentInstance as unknown as Picker;
  });

  afterEach(() => {
    ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
  });

  it('lists the images tagged as stamps', () => {
    ImageStorage.instance.add('stamp-1');
    ImageStorage.instance.add('other-stamp');
    ImageTag.create('stamp-1').tag = 'マップスタンプ';
    ImageTag.create('other-stamp').tag = 'テクスチャ';

    expect(picker.stampImages().map((f) => f.identifier)).toEqual(['stamp-1']);
  });

  it('selects a stamp by its prefixed id, with automatic colour and a size of one cell', () => {
    state.stampColor.set('#123456');
    picker.selectImageStamp(ImageFile.create('stamp-9'));
    expect(state.stampId()).toBe('media:stamp-9');
    expect(state.stampColor()).toBeNull();
    expect(state.stampSize()).toBe(state.current.cellPx);
    expect(picker.isImageStampSelected()).toBe(true);
  });

  it('saves an uploaded stamp, tags it and selects it', async () => {
    imageStorage.addAsync.mockResolvedValue({ identifier: 'uploaded-stamp' });
    const input = { files: [new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })], value: 'x' };

    await picker.onStampFileSelected({ target: input } as unknown as Event);

    const created = ImageTag.get('uploaded-stamp');
    expect(created).toBeTruthy();
    expect(created.tag).toBe('マップスタンプ');
    expect(state.stampId()).toBe('media:uploaded-stamp');
    expect(input.value).toBe('');
  });

  it('may put back a picture the room removed, and uses none it could not', async () => {
    imageStorage.addAsync.mockResolvedValue(null);
    const input = { files: [new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })], value: 'x' };

    await picker.onStampFileSelected({ target: input } as unknown as Event);

    expect(imageStorage.addAsync.mock.calls[0][1]).toEqual({ putBack: true });
    expect(ImageTag.get('removed-stamp')).toBeFalsy();
    expect(state.stampId()).not.toBe('media:removed-stamp');
  });

  it('takes nothing that is not an image', async () => {
    const input = { files: [new File([new Uint8Array([1])], 'x.txt', { type: 'text/plain' })], value: 'x' };
    await picker.onStampFileSelected({ target: input } as unknown as Event);
    expect(imageStorage.addAsync).not.toHaveBeenCalled();
  });
});
