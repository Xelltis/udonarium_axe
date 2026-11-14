import { TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTag } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { TEXTURE_IMAGE_TAG } from '@axe/domain/media/texture-catalog';
import { TextureIntakeService } from '@axe/features/map-editor/editor/texture-intake.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TextureIntakeService', () => {
  let intake: TextureIntakeService;
  let cropped: Blob | null;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    intake = TestBed.inject(TextureIntakeService);
    cropped = new Blob(['picture'], { type: 'image/png' });
    vi.spyOn(TestBed.inject(ModalService), 'open').mockImplementation(() => Promise.resolve(cropped) as never);
    vi.spyOn(TestBed.inject(ImageStorage), 'addAsync').mockResolvedValue({ identifier: 'picture-1' } as ImageFile);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('files the picture it took in as a texture', async () => {
    const taken = await intake.takeIn(new File(['picture'], 'wall.png', { type: 'image/png' }));

    expect(taken?.identifier).toBe('picture-1');
    expect(ImageTag.get('picture-1')?.tag).toBe(TEXTURE_IMAGE_TAG);
  });

  it('files a picture the room had already tagged as a texture too', async () => {
    ImageTag.create('picture-1').tag = 'モンスター';

    await intake.takeIn(new File(['picture'], 'wall.png', { type: 'image/png' }));

    expect(ImageTag.get('picture-1')?.tag).toBe(TEXTURE_IMAGE_TAG);
    expect(TestBed.inject(SnackbarService).current()).toBeNull();
  });

  it('leaves a picture kept under a private tag there, hands it over all the same, and says so once', async () => {
    ImageTag.create('picture-1').tag = '秘蔵';
    ImageTagLock.lock('秘蔵', 'owner_me');
    const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');

    const taken = await intake.takeIn(new File(['picture'], 'wall.png', { type: 'image/png' }));

    expect(taken?.identifier).toBe('picture-1');
    expect(ImageTag.get('picture-1')?.tag).toBe('秘蔵');
    expect(show).toHaveBeenCalledOnce();
    expect(show.mock.calls[0][0]).toContain('自分専用のタグ「秘蔵」');
  });

  it('takes nothing in where the crop was left', async () => {
    cropped = null;

    expect(await intake.takeIn(new File(['picture'], 'wall.png', { type: 'image/png' }))).toBeNull();
    expect(ImageTag.get('picture-1')).toBeNull();
  });
});
