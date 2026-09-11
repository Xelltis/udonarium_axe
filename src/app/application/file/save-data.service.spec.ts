import { inject, TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageFile, ImageState } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SaveDataService', () => {
  type SaveDataServicePrivateApi = {
    _saveRoomAsync: (fileName?: string) => Promise<void>;
    _saveGameObjectAsync: (gameObject: object, fileName?: string) => Promise<void>;
    createChatLogImageSrc: (image: ImageFile, maxDimension: number, square?: boolean) => Promise<string>;
    convertToXml: (gameObject: unknown) => string;
    searchImageFiles: (xml: string) => ImageFile[];
    withCarried: (found: ImageFile[], carriers: readonly unknown[]) => ImageFile[];
    saveAsync: (files: File[], zipName: string, updateCallback?: (percent: number) => void) => Promise<void>;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, SaveDataService],
    });
  });

  it('should be created', inject([SaveDataService], (service: SaveDataService) => {
    expect(service).toBeTruthy();
  }));

  it('saves a room even when a finished image carries no blob', async () => {
    const service = TestBed.inject(SaveDataService);
    const privateApi = service as unknown as SaveDataServicePrivateApi;

    const imageWithNullBlob = {
      identifier: 'image-null-blob',
      state: ImageState.COMPLETE,
      blob: null,
    } as ImageFile;

    vi.spyOn(privateApi, 'convertToXml').mockReturnValue('<node />');
    vi.spyOn(privateApi, 'searchImageFiles').mockReturnValue([imageWithNullBlob]);
    const saveAsyncSpy = vi.spyOn(privateApi, 'saveAsync').mockResolvedValue(undefined);

    await expect(privateApi._saveRoomAsync('room')).resolves.toBeUndefined();

    const files = saveAsyncSpy.mock.calls[0][0] as File[];
    expect(files.some((file: File) => file.name.startsWith('image-null-blob.'))).toBe(false);
  });

  it('saves an object even when a finished image carries no blob', async () => {
    const service = TestBed.inject(SaveDataService);
    const privateApi = service as unknown as SaveDataServicePrivateApi;

    const imageWithNullBlob = {
      identifier: 'image-null-blob',
      state: ImageState.COMPLETE,
      blob: null,
    } as ImageFile;

    vi.spyOn(privateApi, 'convertToXml').mockReturnValue('<node />');
    vi.spyOn(privateApi, 'searchImageFiles').mockReturnValue([imageWithNullBlob]);
    const saveAsyncSpy = vi.spyOn(privateApi, 'saveAsync').mockResolvedValue(undefined);

    await expect(privateApi._saveGameObjectAsync({}, 'obj')).resolves.toBeUndefined();

    const files = saveAsyncSpy.mock.calls[0][0] as File[];
    expect(files.some((file: File) => file.name.startsWith('image-null-blob.'))).toBe(false);
  });

  it('turns a blob image into a data url for the html log', async () => {
    const service = TestBed.inject(SaveDataService);
    const privateApi = service as unknown as SaveDataServicePrivateApi;
    const image = {
      blob: new Blob(['Test'], { type: 'text/plain' }),
      url: 'blob:stamp-image',
    } as ImageFile;

    await expect(privateApi.createChatLogImageSrc(image, 0)).resolves.toBe('data:text/plain;base64,VGVzdA==');
  });

  it('turns a fetchable url into a data url for the html log', async () => {
    const service = TestBed.inject(SaveDataService);
    const privateApi = service as unknown as SaveDataServicePrivateApi;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['UrlImage'], { type: 'text/plain' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    const image = {
      blob: null,
      url: 'https://example.test/stamp.txt',
    } as ImageFile;

    try {
      await expect(privateApi.createChatLogImageSrc(image, 0)).resolves.toBe('data:text/plain;base64,VXJsSW1hZ2U=');
      expect(fetchMock).toHaveBeenCalledWith('https://example.test/stamp.txt');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves the url alone when it cannot be fetched', async () => {
    const service = TestBed.inject(SaveDataService);
    const privateApi = service as unknown as SaveDataServicePrivateApi;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const image = {
      blob: null,
      url: 'https://example.test/stamp.png',
    } as ImageFile;

    try {
      await expect(privateApi.createChatLogImageSrc(image, 0)).resolves.toBe('https://example.test/stamp.png');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('the image registry in an exported log', () => {
    type RegistryApi = {
      prepareChatLogImages: (chatTabs: readonly unknown[]) => Promise<{
        resolver: (image: ImageFile) => string;
        registryScript: string;
      }>;
    };

    function makeTab(messages: { image?: ImageFile | null; attachmentImages?: ImageFile[] }[]): unknown {
      return {
        chatMessages: messages.map((m) => ({
          image: m.image ?? null,
          attachmentImages: m.attachmentImages ?? [],
        })),
      };
    }

    it('keeps one copy of an image used by several messages', async () => {
      const service = TestBed.inject(SaveDataService);
      const api = service as unknown as RegistryApi;
      const portrait = {
        identifier: 'portrait-1',
        blob: new Blob(['BIN'], { type: 'text/plain' }),
      } as unknown as ImageFile;
      const tab = makeTab([{ image: portrait }, { image: portrait }, { image: portrait }]);

      const { resolver, registryScript } = await api.prepareChatLogImages([tab]);

      const key = resolver(portrait);
      expect(key).toMatch(/^i\d+$/);
      // gives the same identifier the same key every time
      expect(resolver(portrait)).toBe(key);
      // writes each data url into the registry once
      const occurrences = (registryScript.match(/data:text\/plain;base64,QklO/g) ?? []).length;
      expect(occurrences).toBe(1);
    });

    it('carries the script that fills in each image source on load', async () => {
      const service = TestBed.inject(SaveDataService);
      const api = service as unknown as RegistryApi;
      const portrait = {
        identifier: 'p-1',
        blob: new Blob(['X'], { type: 'text/plain' }),
      } as unknown as ImageFile;
      const tab = makeTab([{ image: portrait }]);

      const { registryScript } = await api.prepareChatLogImages([tab]);

      expect(registryScript).toContain("querySelectorAll('img[data-img-key]')");
      expect(registryScript).toContain("setAttribute('src'");
    });

    it('writes no script at all for a tab with no images', async () => {
      const service = TestBed.inject(SaveDataService);
      const api = service as unknown as RegistryApi;
      const tab = makeTab([{}, {}]);

      const { registryScript } = await api.prepareChatLogImages([tab]);
      expect(registryScript).toBe('');
    });

    it('shrinks a portrait to 96 square', async () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;
      const api = service as unknown as RegistryApi;

      const spy = vi.spyOn(privateApi, 'createChatLogImageSrc').mockResolvedValue('data:text/plain;base64,X');
      const portrait = {
        identifier: 'portrait-dim',
        blob: new Blob(['P'], { type: 'text/plain' }),
      } as unknown as ImageFile;
      const tab = makeTab([{ image: portrait }]);

      await api.prepareChatLogImages([tab]);

      expect(spy).toHaveBeenCalledWith(portrait, 96, true);
    });

    it('shrinks an attachment to 360 on its longest side', async () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;
      const api = service as unknown as RegistryApi;

      const spy = vi.spyOn(privateApi, 'createChatLogImageSrc').mockResolvedValue('data:text/plain;base64,X');
      const attachment = {
        identifier: 'attach-dim',
        blob: new Blob(['A'], { type: 'text/plain' }),
      } as unknown as ImageFile;
      const tab = makeTab([{ attachmentImages: [attachment] }]);

      await api.prepareChatLogImages([tab]);

      expect(spy).toHaveBeenCalledWith(attachment, 360, false);
    });
  });

  describe('hands saving off to the file archiver', () => {
    it('reports a hundred percent when it finishes', async () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;

      const fileArchiver = TestBed.inject(FileArchiver);
      vi.spyOn(fileArchiver, 'saveAsync').mockImplementation(async (_files, _zipName, cb) => {
        cb?.({ percent: 0, currentFile: '' });
        cb?.({ percent: 100, currentFile: '' });
      });

      const callback = vi.fn();
      await privateApi.saveAsync([], 'test', callback);

      expect(callback).toHaveBeenCalledWith(0);
      expect(callback).toHaveBeenCalledWith(100);
    });

    it('reports the same percentage only once', async () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;

      const fileArchiver = TestBed.inject(FileArchiver);
      vi.spyOn(fileArchiver, 'saveAsync').mockImplementation(async (_files, _zipName, cb) => {
        cb?.({ percent: 50, currentFile: '' });
        cb?.({ percent: 50, currentFile: '' }); // 重複
        cb?.({ percent: 100, currentFile: '' });
      });

      const callback = vi.fn();
      await privateApi.saveAsync([], 'test', callback);

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('the pictures a composed cut-in is built from', () => {
    it("gathers the picture of every layer, not only the cut-in's own", () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;

      ImageStorage.instance.add(ImageFile.createEmpty('layer-image-01'));

      const cutIn = new CutIn();
      cutIn.initialize();
      cutIn.imageIdentifier = '';
      const scene = new CutInScene();
      scene.initialize();
      scene.cutInIdentifier = cutIn.identifier;
      const layer = new CutInLayer();
      layer.initialize();
      layer.imageIdentifier = 'layer-image-01';
      scene.appendChild(layer);

      const found = privateApi.searchImageFiles(ObjectSerializer.instance.toXml(cutIn));

      expect(found.map((image) => image.identifier)).toContain('layer-image-01');
    });
  });

  describe('the pictures a board carries inside its drawing', () => {
    it('bundles a sticker that no walk of the XML would have found', () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;
      ImageStorage.instance.add(ImageFile.createEmpty('stuck-on-the-board'));

      const board = WhiteBoard.create('board', 6, 4, 1);
      board.scene = JSON.stringify({ layers: [{ kind: 'image', items: [{ imageIdentifier: 'stuck-on-the-board' }] }] });

      const bundled = privateApi.withCarried([], [board]);

      expect(bundled.map((image) => image.identifier)).toEqual(['stuck-on-the-board']);
    });

    it('bundles a picture only once, however it was come by', () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;
      const already = ImageStorage.instance.add(ImageFile.createEmpty('both-ways'));

      const board = WhiteBoard.create('board', 6, 4, 1);
      board.scene = JSON.stringify({ layers: [{ kind: 'image', items: [{ imageIdentifier: 'both-ways' }] }] });

      expect(privateApi.withCarried([already], [board])).toHaveLength(1);
    });

    it('passes over a picture the board names that the room has never held', () => {
      const service = TestBed.inject(SaveDataService);
      const privateApi = service as unknown as SaveDataServicePrivateApi;

      const board = WhiteBoard.create('board', 6, 4, 1);
      board.scene = JSON.stringify({ layers: [{ kind: 'image', items: [{ imageIdentifier: 'never-seen' }] }] });

      expect(privateApi.withCarried([], [board])).toEqual([]);
    });
  });
});
