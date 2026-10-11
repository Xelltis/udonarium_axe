import { TestBed } from '@angular/core/testing';
import { ImageUploadPreferenceService } from '@axe/application/file/image-upload-preference.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { FileArchiver, MAX_LOADED_IMAGE_BYTES } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ImageEditQueue } from '@axe/ui/components/image-editor/image-edit-queue.service';
import { ImageEditOutcome, ImageEditRequest } from '@axe/ui/components/image-editor/image-editor.component';
import { Z_PANEL_OVER_MODAL } from '@axe/ui/z-layers';

function picture(name: string, size = 3): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' });
}

/**
 * The page here decodes no picture, so writing one out again goes through stand-ins: an image
 * that loads at once, and a canvas that writes a WebP of a few bytes.
 */
function standInConversion(): void {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 4;
      naturalHeight = 4;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => undefined } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
    callback(new Blob(['w'], { type: type ?? 'image/png' }))
  );
}

describe('ImageEditQueue', () => {
  let queue: ImageEditQueue;
  let outcomes: ImageEditOutcome[];
  let opened: ImageEditRequest[];
  let loaded: File[];
  let close: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    outcomes = [];
    opened = [];
    loaded = [];
    close = vi.fn();
    vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue({
      open: async (request: ImageEditRequest) => {
        opened.push(request);
        return outcomes.shift() ?? { kind: 'closed' };
      },
      close,
    } as never);
    vi.spyOn(TestBed.inject(FileArchiver), 'loadImages').mockImplementation(async (files) => {
      const [file] = files as File[];
      loaded.push(file);
      return file.size > MAX_LOADED_IMAGE_BYTES
        ? { images: [], oversized: [file.name] }
        : { images: [ImageFile.createEmpty(`stored-${file.name}`)], oversized: [] };
    });
    queue = TestBed.inject(ImageEditQueue);
  });

  afterEach(() => {
    localStorage.removeItem('ui-image-edit-first');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function added(image: string): ImageEditOutcome {
    return { kind: 'added', image: ImageFile.createEmpty(image) };
  }

  describe('an upload', () => {
    it('adds pictures within the limit straight away and opens only one over it in the editor', async () => {
      const heavy = picture('heavy.jpg', MAX_LOADED_IMAGE_BYTES + 1);
      outcomes = [added('made-smaller')];
      const told: string[] = [];

      const result = await queue.upload(
        [picture('small.jpg'), heavy, new File(['notes'], 'notes.txt', { type: 'text/plain' })],
        (file, image) => told.push(`${file.name}:${image.identifier}`)
      );

      expect(loaded.map((file) => file.name)).toEqual(['small.jpg']);
      expect(opened).toEqual([{ blob: heavy, name: 'heavy.jpg', position: { index: 1, count: 1 } }]);
      expect(result.images.map((image) => image.identifier)).toEqual(['stored-small.jpg', 'made-smaller']);
      expect(told).toEqual(['small.jpg:stored-small.jpg', 'heavy.jpg:made-smaller']);
      expect(close).toHaveBeenCalled();
    });

    it('opens no editor when every picture fits', async () => {
      const result = await queue.upload([picture('a.jpg'), picture('b.jpg')]);

      expect(opened).toEqual([]);
      expect(result.images).toHaveLength(2);
    });

    it('opens every picture in the editor, one after another, when set to', async () => {
      TestBed.inject(ImageUploadPreferenceService).setEditFirst(true);
      outcomes = [added('edited-a'), { kind: 'skipped' }];

      const result = await queue.upload([picture('a.jpg'), picture('b.jpg')]);

      expect(opened.map((request) => [request.name, request.position])).toEqual([
        ['a.jpg', { index: 1, count: 2 }],
        ['b.jpg', { index: 2, count: 2 }],
      ]);
      expect(loaded).toEqual([]);
      expect(result.images.map((image) => image.identifier)).toEqual(['edited-a']);
    });
  });

  describe('a run of pictures in the editor', () => {
    it('takes the rest as they are when asked, writing one over the limit out again', async () => {
      standInConversion();
      outcomes = [{ kind: 'restAsTheyAre' }];

      const result = await queue.editAll([picture('a.jpg'), picture('heavy.jpg', MAX_LOADED_IMAGE_BYTES + 1)]);

      expect(opened).toHaveLength(1);
      expect(loaded.map((file) => [file.name, file.type])).toEqual([
        ['a.jpg', 'image/jpeg'],
        ['heavy.webp', 'image/webp'],
      ]);
      expect(result).toEqual({ images: [expect.any(ImageFile), expect.any(ImageFile)], oversized: [] });
    });

    it('names a picture still over the limit once taken as it came', async () => {
      standInConversion();
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
      outcomes = [{ kind: 'restAsTheyAre' }];

      const result = await queue.editAll([picture('heavy.jpg', MAX_LOADED_IMAGE_BYTES + 1)]);

      expect(loaded).toEqual([]);
      expect(result).toEqual({ images: [], oversized: ['heavy.jpg'] });
    });

    it('stops where the panel was closed, keeping what went in before it', async () => {
      outcomes = [added('first'), { kind: 'closed' }];

      const result = await queue.editAll([picture('a.jpg'), picture('b.jpg'), picture('c.jpg')]);

      expect(opened).toHaveLength(2);
      expect(result.images.map((image) => image.identifier)).toEqual(['first']);
      expect(close).not.toHaveBeenCalled();
    });

    it('opens nothing without a picture among the files', async () => {
      const result = await queue.editAll([new File(['notes'], 'notes.txt', { type: 'text/plain' })]);

      expect(opened).toEqual([]);
      expect(result).toEqual({ images: [], oversized: [] });
    });
  });

  describe('where the editor opens', () => {
    it('opens among the panels, and above a modal while one is up so it can be used', async () => {
      const open = vi.mocked(TestBed.inject(PanelService).open);
      outcomes = [added('a'), added('b')];

      await queue.edit({ blob: picture('a.jpg'), name: 'a.jpg' });
      expect(open.mock.calls[0][1]).not.toHaveProperty('layer');

      vi.spyOn(TestBed.inject(ModalService), 'isShow', 'get').mockReturnValue(true);
      await queue.edit({ blob: picture('b.jpg'), name: 'b.jpg' });
      expect(open.mock.calls[1][1]).toMatchObject({ layer: Z_PANEL_OVER_MODAL });
    });
  });

  describe('a single picture', () => {
    it('closes the editor once it has gone in, and leaves it open otherwise', async () => {
      outcomes = [added('edited')];
      await queue.edit({ blob: picture('a.jpg'), name: 'a.jpg' });
      expect(close).toHaveBeenCalledTimes(1);

      outcomes = [{ kind: 'closed' }];
      await queue.edit({ blob: picture('a.jpg'), name: 'a.jpg' });
      expect(close).toHaveBeenCalledTimes(1);
    });
  });
});
