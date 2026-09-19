import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';

describe('FileSelecterComponent', () => {
  let component: FileSelecterComponent;
  let fixture: ComponentFixture<FileSelecterComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [FileSelecterComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FileSelecterComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('uploading pictures', () => {
    function playing(role: PeerRole): void {
      PeerCursor.createMyCursor().role = role;
    }

    function chose(...files: File[]): Event {
      return { target: { files, value: 'C:\\fakepath\\x.png' } } as unknown as Event;
    }

    function picture(name: string): File {
      return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
    }

    function stored(...identifiers: string[]): ImageFile[] {
      return identifiers.map((identifier) => ImageFile.createEmpty(identifier));
    }

    let loadImages: ReturnType<typeof vi.spyOn>;
    let resolve: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      loadImages = vi.spyOn(TestBed.inject(FileArchiver), 'loadImages');
      resolve = vi.spyOn(component['modalService'], 'resolve').mockImplementation(() => {});
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
      vi.restoreAllMocks();
    });

    function uploadTile(): HTMLInputElement | null {
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('input[type="file"]');
    }

    it('offers a way to upload to a player', () => {
      playing(PeerRole.Player);

      expect(uploadTile()).not.toBeNull();
    });

    it('stands on a ground of its own, so nothing behind the panel shows through it', () => {
      playing(PeerRole.Player);
      const tile = uploadTile()!.closest('label')!;

      expect(tile.classList).toContain('bg-ui-elevated');
      expect([...tile.classList].filter((name) => /^hover:bg-ui-/.test(name))).toEqual([]);
    });

    it('offers none to a guest', () => {
      playing(PeerRole.Guest);

      expect(uploadTile()).toBeNull();
    });

    it('takes in nothing for a guest', async () => {
      playing(PeerRole.Guest);

      await component.handleFileSelect(chose(picture('a.png')));

      expect(loadImages).not.toHaveBeenCalled();
    });

    it('picks a single picture as soon as it is in', async () => {
      playing(PeerRole.Player);
      loadImages.mockResolvedValue({ images: stored('image-a'), oversized: [] });

      await component.handleFileSelect(chose(picture('a.png')));

      expect(resolve).toHaveBeenCalledWith('image-a');
    });

    it('leaves several in the list, showing the untagged ones where they land', async () => {
      playing(PeerRole.Player);
      component.selectTag.set('コマ');
      loadImages.mockResolvedValue({ images: stored('image-a', 'image-b'), oversized: [] });

      await component.handleFileSelect(chose(picture('a.png'), picture('b.png')));

      expect(resolve).not.toHaveBeenCalled();
      expect(component.selectTag()).toBe('');
    });

    it('stays on every picture when every picture is on show', async () => {
      playing(PeerRole.Player);
      const everyPicture = component['allTag'];
      component.selectTag.set(everyPicture);
      loadImages.mockResolvedValue({ images: stored('image-a', 'image-b'), oversized: [] });

      await component.handleFileSelect(chose(picture('a.png'), picture('b.png')));

      expect(component.selectTag()).toBe(everyPicture);
    });

    it('names a picture too large to take, and picks nothing', async () => {
      playing(PeerRole.Player);
      loadImages.mockResolvedValue({ images: [], oversized: ['huge.png'] });

      await component.handleFileSelect(chose(picture('huge.png')));

      expect(resolve).not.toHaveBeenCalled();
      expect(component.oversized()).toEqual(['huge.png']);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('huge.png');
    });

    it('does not close on the one that went in when another was too large', async () => {
      playing(PeerRole.Player);
      loadImages.mockResolvedValue({ images: stored('image-a'), oversized: ['huge.png'] });

      await component.handleFileSelect(chose(picture('a.png'), picture('huge.png')));

      expect(resolve).not.toHaveBeenCalled();
    });

    it('clears the chooser so the same file can be chosen again', async () => {
      playing(PeerRole.Player);
      loadImages.mockResolvedValue({ images: [], oversized: [] });
      const event = chose(picture('a.png'));

      await component.handleFileSelect(event);

      expect((event.target as HTMLInputElement).value).toBe('');
    });
  });

  describe('the pictures it offers', () => {
    function put(identifier: string, tag: string): void {
      const file = TestBed.inject(ImageStorage).add(identifier);
      ImageTag.create(file.identifier).tag = tag;
    }

    it('offers what a person put there', () => {
      put('a-drawing', 'コマ');

      expect(component.getAllImage().map((image) => image.identifier)).toContain('a-drawing');
    });

    it('keeps back what the tool brought with it, whatever language the screen is in', () => {
      // The tag is a stored word shared round the room, not the word for it on this screen,
      // so matching it against a translation would leave these on show for half the world.
      put('a-die-face', SYSTEM_RESERVED_TAG);

      expect(component.getAllImage().map((image) => image.identifier)).not.toContain('a-die-face');
      expect(component.tagList).not.toContain(SYSTEM_RESERVED_TAG);
    });

    describe('one the master is keeping back', () => {
      function playing(role: PeerRole): void {
        PeerCursor.createMyCursor().role = role;
      }

      beforeEach(() => {
        const secret = TestBed.inject(ImageStorage).add('the-twist');
        ImageTag.create(secret.identifier).isSecret = true;
      });

      afterEach(() => {
        PeerCursor.myCursor = null!;
      });

      it('is not offered to a player', () => {
        playing(PeerRole.Player);

        expect(component.getAllImage().map((image) => image.identifier)).not.toContain('the-twist');
      });

      it('is not offered to a guest either', () => {
        playing(PeerRole.Guest);

        expect(component.getAllImage().map((image) => image.identifier)).not.toContain('the-twist');
      });

      it('is offered to the master', () => {
        playing(PeerRole.GameMaster);

        expect(component.getAllImage().map((image) => image.identifier)).toContain('the-twist');
      });

      it('offers no tag that holds nothing but what is kept back', () => {
        ImageTag.get('the-twist').tag = '仕掛け';
        playing(PeerRole.Player);

        expect(component.tagList).not.toContain('仕掛け');
      });

      it('offers the tag where something under it is there to be picked', () => {
        ImageTag.get('the-twist').tag = '仕掛け';
        put('a-hint', '仕掛け');
        playing(PeerRole.Player);

        expect(component.tagList).toContain('仕掛け');
      });
    });
  });
});
