import {
  ccfoliaRoomDropped$,
  type CcfoliaRoomDroppedEvent,
  imageDropped$,
  type ImageDroppedEvent,
  xmlLoaded$,
} from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { FileArchiver, isXmlCandidateFile } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { zipSync } from 'fflate';
import { strToU8, zip } from 'fflate';

describe('isXmlCandidateFile', () => {
  function file(name: string, type: string): File {
    return new File(['<x />'], name, { type });
  }

  it('takes an xml file', () => {
    expect(isXmlCandidateFile(file('data.xml', 'text/xml'))).toBe(true);
    expect(isXmlCandidateFile(file('data.xml', 'text/plain'))).toBe(true);
  });

  it('takes text with no recognised extension', () => {
    expect(isXmlCandidateFile(file('data', 'text/plain'))).toBe(true);
  });

  it('refuses html', () => {
    expect(isXmlCandidateFile(file('page.html', 'text/html'))).toBe(false);
    expect(isXmlCandidateFile(file('page.html', 'text/plain'))).toBe(false);
    expect(isXmlCandidateFile(file('page.htm', 'text/plain'))).toBe(false);
  });

  it('refuses text that is not xml', () => {
    expect(isXmlCandidateFile(file('config.yaml', 'text/plain'))).toBe(false);
    expect(isXmlCandidateFile(file('style.css', 'text/css'))).toBe(false);
  });

  it('refuses anything that is not text', () => {
    expect(isXmlCandidateFile(file('piece.png', 'image/png'))).toBe(false);
    expect(isXmlCandidateFile(file('room.zip', 'application/zip'))).toBe(false);
  });
});

describe('FileArchiver', () => {
  beforeEach(() => {
    vi.spyOn(ObjectStore.instance, 'get').mockReturnValue({
      isLoadOk: () => true,
      reloadCheckStart: vi.fn(),
    } as unknown as ReturnType<typeof ObjectStore.instance.get>);
    Object.defineProperty(Network, 'peerContext', {
      get: () => ({ roomName: '' }),
      configurable: true,
    });
  });

  afterEach(() => {
    // The listeners are on the page itself, and the page outlives this file: left on, they
    // answer drops made up by every spec that runs after this one in the same worker.
    FileArchiver.instance.destroy();
    (FileArchiver as unknown as { _instance: FileArchiver | undefined })._instance = undefined;
    vi.restoreAllMocks();
  });

  describe('instance', () => {
    it('returns the one instance', () => {
      const a = FileArchiver.instance;
      const b = FileArchiver.instance;
      expect(a).toBe(b);
    });
  });

  describe('initialize', () => {
    it('survives being initialised', () => {
      FileArchiver.instance.initialize();
      expect(true).toBe(true);
    });

    it('survives a drop carrying no list of types', () => {
      FileArchiver.instance.initialize();

      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: { effectAllowed: '', setData: vi.fn() } });

      expect(() => document.body.dispatchEvent(drop)).not.toThrow();
    });

    it('survives a drop before the guard exists', () => {
      // A drop can arrive before startup finishes, or where no guard exists at all.
      vi.spyOn(ObjectStore.instance, 'get').mockReturnValue(
        null as unknown as ReturnType<typeof ObjectStore.instance.get>
      );
      FileArchiver.instance.initialize();

      const drop = new Event('drop', { bubbles: true, cancelable: true });
      expect(() => document.body.dispatchEvent(drop)).not.toThrow();
    });
  });

  describe('a drop that began on the page', () => {
    const INTERNAL_DRAG_TYPE = 'application/x-axe-internal-drag';

    function dragStart(): { setData: ReturnType<typeof vi.fn> } {
      const dataTransfer = { setData: vi.fn(), types: [] as string[], files: [] as File[] };
      const event = new Event('dragstart', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
      document.body.dispatchEvent(event);
      return dataTransfer;
    }

    function drop(types: string[], files: File[]): void {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types, files } });
      document.body.dispatchEvent(event);
    }

    it('marks what a drag begun on the page carries', () => {
      FileArchiver.instance.initialize();

      expect(dragStart().setData).toHaveBeenCalledWith(INTERNAL_DRAG_TYPE, '1');
    });

    it('lays out nothing from a picture the page was already showing', () => {
      const addAsync = vi.spyOn(ImageStorage.instance, 'addAsync');
      FileArchiver.instance.initialize();

      drop(['Files', INTERNAL_DRAG_TYPE], [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })]);

      expect(addAsync).not.toHaveBeenCalled();
    });

    it('still lays out a picture brought in from outside', async () => {
      const addAsync = vi
        .spyOn(ImageStorage.instance, 'addAsync')
        .mockImplementation(() => Promise.resolve(ImageFile.createEmpty('image-a.png')));
      FileArchiver.instance.initialize();

      drop(['Files'], [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })]);

      await vi.waitFor(() => expect(addAsync).toHaveBeenCalled());
    });
  });

  describe('load', () => {
    it('survives an empty file list', async () => {
      await FileArchiver.instance.load([]);
    });

    it('survives a file list object', async () => {
      const fileList = {
        length: 0,
        [Symbol.iterator]: function* () {},
      } as unknown as FileList;
      await FileArchiver.instance.load(fileList);
    });
  });

  describe('dropping an image', () => {
    function imageFile(name: string): File {
      return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
    }

    beforeEach(() => {
      vi.spyOn(ImageStorage.instance, 'addAsync').mockImplementation((file) =>
        Promise.resolve(ImageFile.createEmpty(`image-${(file as File).name}`))
      );
    });

    it('announces each image when the drop has a position', async () => {
      const dropped: ImageDroppedEvent[] = [];
      const off = imageDropped$.subscribe((event) => dropped.push(event));

      await FileArchiver.instance.load([imageFile('a.png')], { x: 10, y: 20 });
      off();

      expect(dropped).toHaveLength(1);
      expect(dropped[0]).toMatchObject({ fileName: 'a.png', dropPoint: { x: 10, y: 20 } });
    });

    it('offsets several images dropped together so they do not stack', async () => {
      const dropped: ImageDroppedEvent[] = [];
      const off = imageDropped$.subscribe((event) => dropped.push(event));

      await FileArchiver.instance.load([imageFile('a.png'), imageFile('b.png')], { x: 10, y: 20 });
      off();

      expect(dropped.map((event) => event.dropPoint)).toEqual([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ]);
    });

    it('makes no piece from an image inside an archive', async () => {
      const dropped: ImageDroppedEvent[] = [];
      const off = imageDropped$.subscribe((event) => dropped.push(event));

      const zipped = zipSync({
        'data.png': new Uint8Array([1, 2, 3]),
        'nested/other.png': new Uint8Array([4, 5, 6]),
      });
      const zipFile = new File([zipped.slice()], 'room.zip', { type: 'application/zip' });
      await FileArchiver.instance.load([zipFile], { x: 10, y: 20 });
      off();

      expect(dropped).toHaveLength(0);
    });

    it('announces nothing without a position, as when loading from a panel', async () => {
      const dropped: ImageDroppedEvent[] = [];
      const off = imageDropped$.subscribe((event) => dropped.push(event));

      await FileArchiver.instance.load([imageFile('a.png')]);
      off();

      expect(dropped).toHaveLength(0);
    });
  });

  describe('loadImages', () => {
    function imageFile(name: string, size = 3): File {
      return new File([new Uint8Array(size)], name, { type: 'image/png' });
    }

    let addAsync: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      addAsync = vi
        .spyOn(ImageStorage.instance, 'addAsync')
        .mockImplementation((file) => Promise.resolve(ImageFile.createEmpty(`image-${(file as File).name}`)));
    });

    it('returns what the store keeps for each image, in the order given', async () => {
      const result = await FileArchiver.instance.loadImages([imageFile('a.png'), imageFile('b.png')]);

      expect(result.images.map((image) => image.identifier)).toEqual(['image-a.png', 'image-b.png']);
      expect(result.oversized).toEqual([]);
    });

    it('names an image over the size limit instead of storing it', async () => {
      const result = await FileArchiver.instance.loadImages([
        imageFile('huge.png', 2 * 1024 * 1024 + 1),
        imageFile('small.png'),
      ]);

      expect(result.oversized).toEqual(['huge.png']);
      expect(result.images.map((image) => image.identifier)).toEqual(['image-small.png']);
      expect(addAsync).toHaveBeenCalledTimes(1);
    });

    it('reads no room data and opens no archive', async () => {
      const loaded: Element[] = [];
      const offXml = xmlLoaded$.subscribe((event) => loaded.push(event.xmlElement));
      const zipped = zipSync({ 'inside.png': new Uint8Array([1, 2, 3]) });

      const result = await FileArchiver.instance.loadImages([
        new File(['<room />'], 'data.xml', { type: 'text/xml' }),
        new File([zipped.slice()], 'room.zip', { type: 'application/zip' }),
      ]);
      offXml();

      expect(loaded).toEqual([]);
      expect(addAsync).not.toHaveBeenCalled();
      expect(result.images).toEqual([]);
    });

    it('places nothing on the table', async () => {
      const dropped: ImageDroppedEvent[] = [];
      const off = imageDropped$.subscribe((event) => dropped.push(event));

      await FileArchiver.instance.loadImages([imageFile('a.png')]);
      off();

      expect(dropped).toHaveLength(0);
    });

    it('takes images even after a room load was declined', async () => {
      vi.spyOn(ObjectStore.instance, 'get').mockReturnValue({
        isLoadOk: () => false,
        reloadCheckStart: vi.fn(),
      } as unknown as ReturnType<typeof ObjectStore.instance.get>);

      const result = await FileArchiver.instance.loadImages([imageFile('a.png')]);

      expect(result.images).toHaveLength(1);
    });
  });

  describe('reading an archive', () => {
    it('unpacks an archive and handles what is inside', async () => {
      // build an archive for the test
      const zipBuffer = await new Promise<Uint8Array>((resolve, reject) => {
        zip({ 'data.xml': strToU8('<test />') }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      const zipFile = new File([zipBuffer.slice()], 'test.zip', { type: 'application/zip' });
      const loaded: Element[] = [];
      const off = xmlLoaded$.subscribe((event) => loaded.push(event.xmlElement));

      await FileArchiver.instance.load([zipFile]);
      off();

      expect(loaded.map((element) => element.tagName)).toEqual(['test']);
    });

    it('skips a broken archive without throwing', async () => {
      const badFile = new File([new Uint8Array([0, 1, 2, 3])], 'broken.zip', { type: 'application/zip' });
      await expect(FileArchiver.instance.load([badFile])).resolves.toBeUndefined();
    });

    it('announces a foreign room archive rather than unpacking it', async () => {
      const addAsync = vi
        .spyOn(ImageStorage.instance, 'addAsync')
        .mockImplementation(() => Promise.resolve(ImageFile.createEmpty('image')));
      const zipped = zipSync({
        '__data.json': strToU8('{"meta":{"version":"1.1.0"},"entities":{}}'),
        '.token': strToU8('0.abc'),
        'aaaa.png': new Uint8Array([1, 2, 3]),
      });
      const zipFile = new File([zipped.slice()], 'room.zip', { type: 'application/zip' });

      const dropped: CcfoliaRoomDroppedEvent[] = [];
      const off = ccfoliaRoomDropped$.subscribe((event) => dropped.push(event));
      await FileArchiver.instance.load([zipFile]);
      off();

      expect(dropped).toHaveLength(1);
      expect(Object.keys(dropped[0].entries)).toContain('__data.json');
      expect(addAsync).not.toHaveBeenCalled();
    });
  });

  describe('writing an archive', () => {
    it('packs the files and hands the archive to the browser', async () => {
      const clickSpy = vi.fn();
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const el = origCreate('a') as HTMLAnchorElement;
          el.click = clickSpy;
          return el;
        }
        return origCreate(tag);
      });

      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      await FileArchiver.instance.saveAsync([file], 'archive');

      expect(clickSpy).toHaveBeenCalledTimes(1);
      // The url outlives the click, for a browser that reads the archive after it.
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
    });

    it('reports nought and a hundred percent', async () => {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const el = origCreate('a') as HTMLAnchorElement;
          el.click = vi.fn();
          return el;
        }
        return origCreate(tag);
      });

      const callback = vi.fn();
      const file = new File(['data'], 'test.txt', { type: 'text/plain' });
      await FileArchiver.instance.saveAsync([file], 'out', callback);

      expect(callback).toHaveBeenCalledWith({ percent: 0, currentFile: '' });
      expect(callback).toHaveBeenCalledWith({ percent: 100, currentFile: '' });
    });

    it('survives writing an empty file list', async () => {
      await expect(FileArchiver.instance.saveAsync([], 'empty')).resolves.toBeUndefined();
    });
  });

  describe('onDrop', () => {
    it('survives a drop carrying no data', () => {
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: null,
      } as unknown as DragEvent;

      expect(() =>
        (FileArchiver.instance as unknown as { onDrop: (event: DragEvent) => void }).onDrop(event)
      ).not.toThrow();
    });
  });
});
