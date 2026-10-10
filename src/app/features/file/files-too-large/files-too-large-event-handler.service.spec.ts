import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { emitFilesTooLarge, imageDropped$, ImageDroppedEvent } from '@axe/core/event/domain-events';
import { MAX_LOADED_IMAGE_BYTES } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { FilesTooLargeEventHandlerService } from '@axe/features/file/files-too-large/files-too-large-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ImageAdded, ImageEditQueue } from '@axe/ui/components/image-editor/image-edit-queue.service';

describe('FilesTooLargeEventHandlerService', () => {
  const huge = new File(['png'], 'huge.png', { type: 'image/png' });
  let editAll: ReturnType<typeof vi.spyOn>;
  let canEdit: boolean;
  let placed: ImageDroppedEvent[];
  let off: () => void;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    canEdit = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockImplementation(() => canEdit);
    editAll = vi
      .spyOn(TestBed.inject(ImageEditQueue), 'editAll')
      .mockImplementation(async (files: readonly File[], added?: ImageAdded) => {
        const image = ImageFile.createEmpty('made-smaller');
        added?.(files[0], image);
        return { images: [image], oversized: [] };
      });
    placed = [];
    off = imageDropped$.subscribe((event) => placed.push(event));
    TestBed.inject(FilesTooLargeEventHandlerService);
  });

  afterEach(() => {
    off();
    vi.restoreAllMocks();
  });

  function shown(): string | undefined {
    return TestBed.inject(SnackbarService).current()?.message;
  }

  it('tells the reader at the foot of the screen which files were left out', () => {
    const t = TestBed.inject(TRANSLATE_FN);

    emitFilesTooLarge({ files: [{ name: 'long.ogg', kind: 'audio', limitBytes: 10 * 1024 * 1024 }] });

    expect(shown()).toBe(
      t('feature.file.tooLarge.one', {
        name: 'long.ogg',
        count: 0,
        limits: t('feature.file.tooLarge.audioLimit', { mb: 10 }),
      })
    );
    expect(shown()).toContain('long.ogg');
    expect(editAll).not.toHaveBeenCalled();
  });

  it('opens a picture that came on its own in the editor, and places it where it was dropped', async () => {
    emitFilesTooLarge({
      files: [
        {
          name: 'huge.png',
          kind: 'image',
          limitBytes: MAX_LOADED_IMAGE_BYTES,
          file: huge,
          dropPoint: { x: 40, y: 60 },
        },
      ],
    });
    await vi.waitFor(() => expect(placed).toHaveLength(1));

    expect(editAll).toHaveBeenCalledWith([huge], expect.any(Function));
    expect(placed[0]).toEqual({ identifier: 'made-smaller', fileName: 'huge.png', dropPoint: { x: 40, y: 60 } });
    expect(shown()).toBeUndefined();
  });

  it('places nothing until the editor has closed, since the editor stands over the table', async () => {
    let closeEditor!: () => void;
    editAll.mockImplementation(async (files: readonly File[], added?: ImageAdded) => {
      const image = ImageFile.createEmpty('made-smaller');
      added?.(files[0], image);
      await new Promise<void>((resolve) => (closeEditor = resolve));
      return { images: [image], oversized: [] };
    });

    emitFilesTooLarge({
      files: [
        { name: 'huge.png', kind: 'image', limitBytes: MAX_LOADED_IMAGE_BYTES, file: huge, dropPoint: { x: 1, y: 2 } },
      ],
    });
    await vi.waitFor(() => expect(closeEditor).toBeDefined());
    expect(placed).toEqual([]);

    closeEditor();
    await vi.waitFor(() => expect(placed).toHaveLength(1));
  });

  it('names a picture from inside an archive rather than opening it', () => {
    emitFilesTooLarge({ files: [{ name: 'scenery.png', kind: 'image', limitBytes: MAX_LOADED_IMAGE_BYTES }] });

    expect(editAll).not.toHaveBeenCalled();
    expect(shown()).toContain('scenery.png');
  });

  it('opens nothing for a seat that may not edit the table, and names the picture instead', () => {
    canEdit = false;

    emitFilesTooLarge({ files: [{ name: 'huge.png', kind: 'image', limitBytes: MAX_LOADED_IMAGE_BYTES, file: huge }] });

    expect(editAll).not.toHaveBeenCalled();
    expect(shown()).toContain('huge.png');
  });

  it('names a picture still too large once taken as it came', async () => {
    editAll.mockResolvedValue({ images: [], oversized: ['huge.png'] });

    emitFilesTooLarge({ files: [{ name: 'huge.png', kind: 'image', limitBytes: MAX_LOADED_IMAGE_BYTES, file: huge }] });

    await vi.waitFor(() => expect(shown()).toContain('huge.png'));
    expect(placed).toEqual([]);
  });
});
