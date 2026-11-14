import { ComponentFixture, TestBed } from '@angular/core/testing';
import { startCutIn$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { withPortraitFits } from '@axe/domain/media/cut-in-portrait-fit';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CutInEditorComponent } from '@axe/features/media/cut-in-list/cut-in-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInEditorComponent', () => {
  let component: CutInEditorComponent;
  let fixture: ComponentFixture<CutInEditorComponent>;
  let cutIn: CutIn;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInEditorComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    const objectStore = TestBed.inject(ObjectStore);
    cutIn = new CutIn('cut-in-under-edit');
    cutIn.imageIdentifier = '';
    cutIn.initialize();
    objectStore.add(cutIn);

    fixture = TestBed.createComponent(CutInEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('cutIn', cutIn);
    fixture.componentRef.setInput('isEditable', true);
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('trying a cut-in out as somebody', () => {
    function withLayer(fields: Partial<CutInLayer>): { scene: CutInScene; layer: CutInLayer } {
      const scene = new CutInScene();
      scene.initialize();
      scene.cutInIdentifier = cutIn.identifier;
      const layer = new CutInLayer();
      layer.initialize();
      Object.assign(layer, fields);
      scene.appendChild(layer);
      return { scene, layer };
    }

    it('asks who to play it as only where its layers show a portrait or a name', () => {
      const { scene } = withLayer({ kind: 'text', text: 'ふつうの文' });
      try {
        fixture.componentRef.setInput('cutIn', null);
        fixture.detectChanges();
        fixture.componentRef.setInput('cutIn', cutIn);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="cut-in-try-speaker"]')).toBeNull();
      } finally {
        scene.destroy();
      }
    });

    it('plays it for the character chosen, with the portrait they are showing as they set it', () => {
      const { scene } = withLayer({ kind: 'text', text: '{character}、参戦！' });
      const hero = GameCharacter.create('ヒロ', 1, 'hero-face');
      hero.cutInPortraitFits = withPortraitFits('', new Map([['hero-face', { scale: 1.5, x: 0, y: 0.2 }]]), [
        'hero-face',
      ]);
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const start = vi.spyOn(launcher, 'startCutInMySelf').mockImplementation(() => {});
      try {
        fixture.componentRef.setInput('cutIn', null);
        fixture.detectChanges();
        fixture.componentRef.setInput('cutIn', cutIn);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="cut-in-try-speaker"]')).not.toBeNull();

        component.trySpeakerId.set(hero.identifier);
        component.previewCutIn();

        expect(start).toHaveBeenCalledWith(cutIn, {
          characterId: hero.identifier,
          imageIdentifier: 'hero-face',
          name: 'ヒロ',
          fit: { scale: 1.5, x: 0, y: 0.2 },
        });
      } finally {
        hero.destroy();
        launcher.destroy();
        scene.destroy();
      }
    });
  });

  it('lets a guest on a room server try a cut-in out here alone, offering no play or stop for everyone', () => {
    const launcher = new CutInLauncher('CutInLauncher');
    launcher.initialize();
    const original = PeerCursor.myCursor;
    PeerCursor.myCursor = { role: PeerRole.Guest } as PeerCursor;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    const shown: unknown[] = [];
    const stop = startCutIn$.subscribe((event) => shown.push(event.cutIn));
    const before = launcher.launchTimeStamp;
    try {
      fixture = TestBed.createComponent(CutInEditorComponent);
      fixture.componentRef.setInput('cutIn', cutIn);
      fixture.detectChanges();
      const titles = [...fixture.nativeElement.querySelectorAll('button[title]')].map((b) => b.getAttribute('title'));

      fixture.componentInstance.previewCutIn();
      fixture.componentInstance.playCutIn();

      expect(titles).not.toContain('全員に再生');
      expect(shown).toEqual([cutIn]);
      expect(launcher.launchTimeStamp).toBe(before);
    } finally {
      stop();
      vi.restoreAllMocks();
      PeerCursor.myCursor = original;
      launcher.destroy();
    }
  });

  describe('the picture it shows for a cut-in', () => {
    it('asks for a picture rather than showing a broken one where none is set', () => {
      expect(component.cutInImageUrl()).toBe('');
      expect(fixture.nativeElement.querySelector('img')).toBeNull();
      expect(fixture.nativeElement.querySelector('.material-icons')?.textContent).toBe('add_photo_alternate');
    });

    it('shows the picture once one is set', () => {
      TestBed.inject(ImageStorage).add('a-picture');
      cutIn.imageIdentifier = 'a-picture';
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
    });
  });

  describe('a cut-in that plays a video', () => {
    const VIDEO_URL = 'https://www.youtube.com/watch?v=abcdefghijk';

    function asVideo(target: CutIn): void {
      target.isVideoCutIn = true;
      target.videoUrl = VIDEO_URL;
    }

    it('is known for a video as it is opened, and for a picture when another is opened in its place', async () => {
      const picture = new CutIn('a-picture-cut-in');
      picture.imageIdentifier = '';
      picture.initialize();
      try {
        asVideo(cutIn);
        await fixture.whenStable();
        expect(component.isYouTubeCutIn()).toBe(true);
        expect([component.minSizeWidth, component.minSizeHeight]).toEqual([
          cutIn.minSizeWidth(true),
          cutIn.minSizeHeight(true),
        ]);

        fixture.componentRef.setInput('cutIn', picture);
        await fixture.whenStable();
        expect(component.isYouTubeCutIn()).toBe(false);
      } finally {
        picture.destroy();
      }
    });

    it('takes the size of a video as its address is first typed, and keeps the size set since while it stays a video', () => {
      cutIn.originalSize = false;
      cutIn.isVideoCutIn = true;
      cutIn.width = 200;
      cutIn.height = 100;

      component.cutInVideoURL = VIDEO_URL;
      expect([cutIn.width, cutIn.height]).toEqual([cutIn.defVideoSizeWidth, cutIn.defVideoSizeHeight]);

      cutIn.width = 320;
      cutIn.height = 180;
      component.cutInVideoURL = VIDEO_URL + '&t=10';
      expect([cutIn.width, cutIn.height]).toEqual([320, 180]);
    });

    it('keeps the size of a saved video when its address is edited for the first time', () => {
      asVideo(cutIn);
      cutIn.originalSize = false;
      cutIn.width = 320;
      cutIn.height = 180;
      fixture.detectChanges();

      component.cutInVideoURL = VIDEO_URL + '&t=10';

      expect([cutIn.width, cutIn.height]).toEqual([320, 180]);
    });

    it('keeps the size it had when it turns back into a picture that is not measured yet', () => {
      asVideo(cutIn);
      TestBed.inject(ImageStorage).add('a-picture');
      cutIn.imageIdentifier = 'a-picture';
      cutIn.originalSize = false;
      cutIn.width = 320;
      cutIn.height = 180;
      fixture.detectChanges();

      component.cutInVideoURL = '';

      expect(cutIn.videoId).toBe('');
      expect([cutIn.width, cutIn.height]).toEqual([320, 180]);
    });

    it('snaps the height to the shape of a video when the aspect is kept from then on', () => {
      asVideo(cutIn);
      TestBed.inject(ImageStorage).add('a-picture');
      cutIn.imageIdentifier = 'a-picture';
      cutIn.originalSize = false;
      cutIn.keepImageAspect = false;
      cutIn.width = 320;
      cutIn.height = 999;

      component.keepImageAspect = true;

      expect(cutIn.height).toBe(180);
    });
  });

  describe('the size shown while the cut-in keeps its own size', () => {
    it('reads the size of its own without writing it onto the cut-in', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
      cutIn.originalSize = true;
      cutIn.width = 123;
      cutIn.height = 45;
      const version = cutIn.version;

      fixture.detectChanges();

      expect([component.cutInWidth, component.cutInHeight]).toEqual([
        cutIn.defVideoSizeWidth,
        cutIn.defVideoSizeHeight,
      ]);
      expect([cutIn.width, cutIn.height, cutIn.version]).toEqual([123, 45, version]);
    });

    it('writes that size onto the cut-in when the box for it is turned on', () => {
      cutIn.isVideoCutIn = true;
      cutIn.videoUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
      cutIn.originalSize = false;
      cutIn.width = 123;
      cutIn.height = 45;

      component.cutInOriginalSize = true;

      expect([cutIn.width, cutIn.height]).toEqual([cutIn.defVideoSizeWidth, cutIn.defVideoSizeHeight]);
    });
  });

  it('leaves the height alone when the aspect is kept for a picture whose size has not come yet', () => {
    TestBed.inject(ImageStorage).add('a-picture');
    cutIn.imageIdentifier = 'a-picture';
    cutIn.originalSize = false;
    cutIn.keepImageAspect = false;
    cutIn.width = 320;
    cutIn.height = 200;
    fixture.detectChanges();

    component.keepImageAspect = true;

    expect(cutIn.keepImageAspect).toBe(true);
    expect(cutIn.height).toBe(200);
  });

  it('writes the side typed and leaves the other alone while the kept aspect waits on a picture not yet measured', () => {
    TestBed.inject(ImageStorage).add('a-picture');
    cutIn.imageIdentifier = 'a-picture';
    cutIn.originalSize = false;
    cutIn.keepImageAspect = true;
    cutIn.width = 320;
    cutIn.height = 200;
    fixture.detectChanges();

    component.cutInWidth = 400;
    expect([cutIn.width, cutIn.height]).toEqual([400, 200]);

    component.cutInHeight = 250;
    expect([cutIn.width, cutIn.height]).toEqual([400, 250]);
  });

  it('keeps a video’s shape from either side typed while the aspect is kept', async () => {
    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
    cutIn.originalSize = false;
    cutIn.keepImageAspect = true;
    await fixture.whenStable();

    component.cutInWidth = 320;
    expect([cutIn.width, cutIn.height]).toEqual([320, 180]);

    component.cutInHeight = 360;
    expect([cutIn.width, cutIn.height]).toEqual([640, 360]);
  });

  it('offers the bounds of the cut-in’s kind for each side, and stand-in bounds without a cut-in', async () => {
    expect([component.minSizeWidth, component.maxSizeWidth, component.minSizeHeight, component.maxSizeHeight]).toEqual([
      cutIn.minSizeWidth(false),
      cutIn.maxSizeWidth(false),
      cutIn.minSizeHeight(false),
      cutIn.maxSizeHeight(false),
    ]);

    cutIn.isVideoCutIn = true;
    cutIn.videoUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
    await fixture.whenStable();
    expect([component.minSizeWidth, component.maxSizeWidth, component.minSizeHeight, component.maxSizeHeight]).toEqual([
      cutIn.minSizeWidth(true),
      cutIn.maxSizeWidth(true),
      cutIn.minSizeHeight(true),
      cutIn.maxSizeHeight(true),
    ]);

    fixture.componentRef.setInput('cutIn', null);
    expect([component.minSizeWidth, component.maxSizeWidth, component.minSizeHeight, component.maxSizeHeight]).toEqual([
      10, 1200, 10, 1200,
    ]);
  });

  it('stops the music before playing for everyone a cut-in that brings its own sound and has no tag', () => {
    const launcher = new CutInLauncher('CutInLauncher');
    launcher.initialize();
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    const start = vi.spyOn(launcher, 'startCutIn').mockImplementation(() => {});
    const stop = vi.spyOn(jukebox, 'stop').mockImplementation(() => {});
    vi.spyOn(TestBed.inject(AudioStorage), 'get').mockReturnValue({} as AudioFile);
    try {
      cutIn.originalSize = false;
      cutIn.audioIdentifier = 'a-sound';
      cutIn.tagName = '';

      component.playCutIn();

      expect(stop).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledWith(cutIn, '', null);
    } finally {
      vi.restoreAllMocks();
      jukebox.destroy();
      launcher.destroy();
    }
  });

  describe('the basic fields', () => {
    function field(name: string): HTMLInputElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[name="${name}"]`);
    }

    function type(name: string, value: string): void {
      const input = field(name)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('writes the name, the tag and the seconds it shows into the cut-in as they are typed', async () => {
      await fixture.whenStable();

      type('cut-in-name', 'オープニング');
      type('cut-in-tag-name', 'BGM');
      type('cut-in-out-time', '5');

      expect([cutIn.name, cutIn.tagName, cutIn.outTime]).toEqual(['オープニング', 'BGM', 5]);
    });

    it('is drawn taking no typing in any field when it is not editable from the first', async () => {
      const locked = TestBed.createComponent(CutInEditorComponent);
      locked.componentRef.setInput('cutIn', cutIn);
      locked.componentRef.setInput('isEditable', false);
      locked.detectChanges();
      await locked.whenStable();

      const fields = [...(locked.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[name]')];
      expect(fields.length).toBeGreaterThan(5);
      expect(fields.filter((input) => !input.disabled).map((input) => input.name)).toEqual([]);
      locked.destroy();
    });

    it('has number fields for the width, the height and the place across and down', () => {
      const names = ['cut-in-width', 'cut-in-height', 'cut-in-x-pos-num', 'cut-in-y-pos-num'];

      expect(names.map((name) => field(name)?.type)).toEqual(['number', 'number', 'number', 'number']);
    });

    it('has the boxes for keeping the aspect ratio, looping, playing a video and starting from the chat', () => {
      const names = ['keepImageAspect', 'cutInIsLoop', 'cutInIsVideo', 'chatActivate'];

      expect(names.map((name) => field(name)?.type)).toEqual(['checkbox', 'checkbox', 'checkbox', 'checkbox']);
    });

    it('turns the cut-in into a video from its box, and back', async () => {
      await fixture.whenStable();
      const box = field('cutInIsVideo')!;
      expect(cutIn.isVideoCutIn).toBe(false);

      box.click();
      expect(cutIn.isVideoCutIn).toBe(true);

      fixture.detectChanges();
      await fixture.whenStable();
      box.click();
      expect(cutIn.isVideoCutIn).toBe(false);
    });
  });
});
