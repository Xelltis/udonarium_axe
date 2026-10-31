import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { ImageEditQueue } from '@axe/ui/components/image-editor/image-edit-queue.service';

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

  it('offers no account’s avatar among the pictures to pick, untagged or all', () => {
    const storage = TestBed.inject(ImageStorage);
    const avatar = storage.add('https://cdn.discordapp.com/avatars/1/a.png');
    const plain = storage.add('https://example.com/b.png');
    try {
      const shown = () => component.images().map((image) => image.identifier);
      expect(shown()).toContain(plain.identifier);
      expect(shown()).not.toContain(avatar.identifier);

      component.selectTag.set(component.tagList[1]);
      expect(shown()).not.toContain(avatar.identifier);
    } finally {
      storage.delete(avatar.identifier);
      storage.delete(plain.identifier);
    }
  });

  it('offers among the pictures the one avatar it is told it may, the reader’s own, and no other', () => {
    const storage = TestBed.inject(ImageStorage);
    const own = storage.add('https://cdn.discordapp.com/avatars/1/a.png');
    const other = storage.add('https://cdn.discordapp.com/avatars/2/b.png');
    vi.spyOn(TestBed.inject(ModalService), 'option', 'get').mockReturnValue({ ownAvatar: own.identifier });
    try {
      const picker = TestBed.createComponent(FileSelecterComponent).componentInstance;
      const shown = picker.images().map((image) => image.identifier);
      expect(shown).toContain(own.identifier);
      expect(shown).not.toContain(other.identifier);
    } finally {
      storage.delete(own.identifier);
      storage.delete(other.identifier);
    }
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

    let upload: ReturnType<typeof vi.spyOn>;
    let resolve: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      upload = vi.spyOn(TestBed.inject(ImageEditQueue), 'upload');
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

      expect(upload).not.toHaveBeenCalled();
    });

    it('picks a single picture as soon as it is in', async () => {
      playing(PeerRole.Player);
      upload.mockResolvedValue({ images: stored('image-a'), oversized: [] });

      await component.handleFileSelect(chose(picture('a.png')));

      expect(resolve).toHaveBeenCalledWith('image-a');
    });

    it('leaves several in the list, showing the untagged ones where they land', async () => {
      playing(PeerRole.Player);
      component.selectTag.set('コマ');
      upload.mockResolvedValue({ images: stored('image-a', 'image-b'), oversized: [] });

      await component.handleFileSelect(chose(picture('a.png'), picture('b.png')));

      expect(resolve).not.toHaveBeenCalled();
      expect(component.selectTag()).toBe('');
    });

    it('stays on every picture when every picture is on show', async () => {
      playing(PeerRole.Player);
      const everyPicture = component['allTag'];
      component.selectTag.set(everyPicture);
      upload.mockResolvedValue({ images: stored('image-a', 'image-b'), oversized: [] });

      await component.handleFileSelect(chose(picture('a.png'), picture('b.png')));

      expect(component.selectTag()).toBe(everyPicture);
    });

    it('names a picture too large to take, and picks nothing', async () => {
      playing(PeerRole.Player);
      upload.mockResolvedValue({ images: [], oversized: ['huge.png'] });

      await component.handleFileSelect(chose(picture('huge.png')));

      expect(resolve).not.toHaveBeenCalled();
      expect(component.oversized()).toEqual(['huge.png']);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('huge.png');
    });

    it('does not close on the one that went in when another was too large', async () => {
      playing(PeerRole.Player);
      upload.mockResolvedValue({ images: stored('image-a'), oversized: ['huge.png'] });

      await component.handleFileSelect(chose(picture('a.png'), picture('huge.png')));

      expect(resolve).not.toHaveBeenCalled();
    });

    it('clears the chooser so the same file can be chosen again', async () => {
      playing(PeerRole.Player);
      upload.mockResolvedValue({ images: [], oversized: [] });
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

  describe('a tag kept to one person', () => {
    beforeEach(() => {
      ImageTag.create(TestBed.inject(ImageStorage).add('the-boss').identifier).tag = 'ボス';
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
      for (const record of ImageTagLock.all()) ObjectStore.instance.remove(record);
    });

    it('offers neither the tag nor its pictures to a player it is kept from, and both to the master', () => {
      ImageTagLock.lock('ボス', 'owner_someone-else');
      PeerCursor.createMyCursor().role = PeerRole.Player;

      expect(component.tagList).not.toContain('ボス');
      expect(component.getAllImage().map((image) => image.identifier)).not.toContain('the-boss');

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(component.tagList).toContain('ボス');
      expect(component.getAllImage().map((image) => image.identifier)).toContain('the-boss');
    });

    it('offers them to the one who keeps it', () => {
      ImageTagLock.lock('ボス', TestBed.inject(AssetOwnershipService).myOwnerKey());
      PeerCursor.createMyCursor().role = PeerRole.Player;

      expect(component.getAllImage().map((image) => image.identifier)).toContain('the-boss');
    });
  });
});
