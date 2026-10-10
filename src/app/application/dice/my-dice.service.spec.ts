import { TestBed } from '@angular/core/testing';
import { DICE_PICTURE_MAX_BYTES, DICE_PICTURE_PREPARER, MyDiceService } from '@axe/application/dice/my-dice.service';
import { DiceImageStore } from '@axe/core/storage/dice-image-store';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { PLAIN_DICE_LOOK, wornDiceLook } from '@axe/domain/dice/dice-3d/dice-look';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The first bytes of a PNG, so what the guard sniffs is what a picture actually starts with. */
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PICTURE = 'ab'.repeat(32);

describe('MyDiceService', () => {
  beforeEach(() => {
    localStorage.removeItem('my-dice');
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: DICE_PICTURE_PREPARER, useValue: async (picture: Blob) => picture }],
    });
  });

  afterEach(() => {
    localStorage.removeItem('my-dice');
    vi.restoreAllMocks();
  });

  it('starts with the plain look in a browser that has kept none', () => {
    expect(TestBed.inject(MyDiceService).look()).toEqual(PLAIN_DICE_LOOK);
  });

  it('keeps the look chosen for the next visit', () => {
    TestBed.inject(MyDiceService).set({ ...PLAIN_DICE_LOOK, material: 'metal', body: '#b08d57', ink: '' });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });

    expect(TestBed.inject(MyDiceService).look()).toEqual({
      ...PLAIN_DICE_LOOK,
      material: 'metal',
      body: '#b08d57',
      ink: '',
    });
  });

  it('reads a kept look it cannot make sense of as the plain one', () => {
    localStorage.setItem('my-dice', '{"material":');

    expect(TestBed.inject(MyDiceService).look()).toEqual(PLAIN_DICE_LOOK);
  });

  it('tidies a look as it is chosen', () => {
    const service = TestBed.inject(MyDiceService);

    service.set({ ...PLAIN_DICE_LOOK, material: 'glass', body: '#AABBCC', ink: 'nonsense' });

    expect(service.look()).toEqual({ ...PLAIN_DICE_LOOK, material: 'glass', body: '#aabbcc', ink: '' });
  });

  describe('a picture for the dice', () => {
    /** A picture made ready to share, as the room's images would hold it. */
    function imageOf(identifier: string, bytes: Blob): ImageFile {
      return { identifier, blob: bytes, destroy: vi.fn() } as unknown as ImageFile;
    }

    /** Has a picture offered come out as these bytes, and watches the room's images being added to. */
    function shared(bytes: Blob) {
      vi.spyOn(ImageFile, 'createAsync').mockResolvedValue(imageOf(PICTURE, bytes));
      return vi.spyOn(ImageStorage.instance, 'add').mockImplementation((image) => image as ImageFile);
    }

    it('shares a picture through the room’s images, keeps it in this browser and puts it on the dice', async () => {
      const bytes = new Blob([PNG_HEAD], { type: 'image/png' });
      const added = shared(bytes);
      const kept = vi.spyOn(DiceImageStore.instance, 'put').mockResolvedValue(true);
      const service = TestBed.inject(MyDiceService);

      expect(await service.setPicture(bytes)).toBeNull();

      expect(added).toHaveBeenCalled();
      expect(kept).toHaveBeenCalledWith(PICTURE, bytes);
      expect(service.look().picture).toBe(PICTURE);
    });

    it('turns away what is not a picture, or is too large, leaving the dice as they were', async () => {
      const added = shared(new Blob());
      const service = TestBed.inject(MyDiceService);

      expect(await service.setPicture(new Blob(['hello'], { type: 'text/plain' }))).toBe('notPicture');
      expect(await service.setPicture(new Blob([new Uint8Array(DICE_PICTURE_MAX_BYTES + 1)]))).toBe('tooLarge');

      expect(added).not.toHaveBeenCalled();
      expect(service.look().picture).toBe('');
    });

    it('shares nothing that could not be kept in this browser', async () => {
      const bytes = new Blob([PNG_HEAD], { type: 'image/png' });
      const image = imageOf(PICTURE, bytes);
      vi.spyOn(ImageFile, 'createAsync').mockResolvedValue(image);
      const added = vi.spyOn(ImageStorage.instance, 'add');
      vi.spyOn(DiceImageStore.instance, 'put').mockResolvedValue(false);
      const service = TestBed.inject(MyDiceService);

      expect(await service.setPicture(bytes)).toBe('unstored');

      expect(added).not.toHaveBeenCalled();
      expect(image.destroy).toHaveBeenCalled();
      expect(service.look().picture).toBe('');
    });

    it('lets go of the copy kept for the picture it replaces', async () => {
      const made = vi.spyOn(ImageFile, 'createAsync');
      made.mockResolvedValueOnce(imageOf(PICTURE, new Blob([PNG_HEAD])));
      made.mockResolvedValueOnce(imageOf('cd'.repeat(32), new Blob([PNG_HEAD])));
      vi.spyOn(ImageStorage.instance, 'add').mockImplementation((image) => image as ImageFile);
      vi.spyOn(DiceImageStore.instance, 'put').mockResolvedValue(true);
      const removed = vi.spyOn(DiceImageStore.instance, 'remove').mockResolvedValue();
      const service = TestBed.inject(MyDiceService);

      await service.setPicture(new Blob([PNG_HEAD], { type: 'image/png' }));
      expect(removed).not.toHaveBeenCalled();
      await service.setPicture(new Blob([PNG_HEAD], { type: 'image/png' }));

      expect(service.look().picture).toBe('cd'.repeat(32));
      expect(removed).toHaveBeenCalledWith(PICTURE);
    });

    describe('for a guest, who may not add to the room’s images', () => {
      const original = PeerCursor.myCursor;

      beforeEach(() => {
        PeerCursor.myCursor = { role: PeerRole.Guest } as PeerCursor;
      });

      afterEach(() => {
        PeerCursor.myCursor = original;
      });

      it('turns a picture away without sharing it', async () => {
        const added = shared(new Blob([PNG_HEAD], { type: 'image/png' }));
        const service = TestBed.inject(MyDiceService);

        expect(await service.setPicture(new Blob([PNG_HEAD], { type: 'image/png' }))).toBe('notAllowed');

        expect(added).not.toHaveBeenCalled();
        expect(service.look().picture).toBe('');
      });

      it('leaves the room’s images alone on a fresh visit', async () => {
        localStorage.setItem('my-dice', JSON.stringify({ ...PLAIN_DICE_LOOK, picture: PICTURE }));
        const kept = vi.spyOn(DiceImageStore.instance, 'get');
        const added = vi.spyOn(ImageStorage.instance, 'addAsync');

        await TestBed.inject(MyDiceService).ensureShared();

        expect(kept).not.toHaveBeenCalled();
        expect(added).not.toHaveBeenCalled();
      });
    });

    it('makes the dice resin while they wear a picture, and gives the material back with it', async () => {
      shared(new Blob([PNG_HEAD], { type: 'image/png' }));
      vi.spyOn(DiceImageStore.instance, 'put').mockResolvedValue(true);
      const removed = vi.spyOn(DiceImageStore.instance, 'remove').mockResolvedValue();
      const service = TestBed.inject(MyDiceService);
      service.set({ ...PLAIN_DICE_LOOK, material: 'metal' });

      await service.setPicture(new Blob([PNG_HEAD], { type: 'image/png' }));
      expect(wornDiceLook(service.look()).material).toBe('resin');

      service.removePicture();
      expect(service.look().picture).toBe('');
      expect(service.look().material).toBe('metal');
      expect(removed).toHaveBeenCalledWith(PICTURE);
    });

    it('puts the picture kept in this browser back among the room’s images on a fresh visit, under the same identifier', async () => {
      localStorage.setItem('my-dice', JSON.stringify({ ...PLAIN_DICE_LOOK, picture: PICTURE }));
      vi.spyOn(DiceImageStore.instance, 'get').mockResolvedValue(new Blob([PNG_HEAD], { type: 'image/webp' }));
      const added = vi.spyOn(ImageStorage.instance, 'addAsync').mockResolvedValue({} as ImageFile);

      await TestBed.inject(MyDiceService).ensureShared();

      const named = added.mock.calls[0][0] as File;
      expect(named.name).toBe(`${PICTURE}.webp`);
    });

    it('leaves the room’s images alone as the page starts, before the seat’s role is known', async () => {
      localStorage.setItem('my-dice', JSON.stringify({ ...PLAIN_DICE_LOOK, picture: PICTURE }));
      const kept = vi.spyOn(DiceImageStore.instance, 'get').mockResolvedValue(new Blob([PNG_HEAD]));
      const added = vi.spyOn(ImageStorage.instance, 'addAsync').mockResolvedValue({} as ImageFile);

      TestBed.inject(MyDiceService);
      await Promise.resolve();

      expect(kept).not.toHaveBeenCalled();
      expect(added).not.toHaveBeenCalled();
    });

    it('leaves the room’s images alone when the picture is already among them', async () => {
      localStorage.setItem('my-dice', JSON.stringify({ ...PLAIN_DICE_LOOK, picture: PICTURE }));
      vi.spyOn(ImageStorage.instance, 'get').mockReturnValue({ state: 2 } as unknown as ImageFile);
      const kept = vi.spyOn(DiceImageStore.instance, 'get');

      await TestBed.inject(MyDiceService).ensureShared();

      expect(kept).not.toHaveBeenCalled();
    });
  });
});
