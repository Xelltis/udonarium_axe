import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { FileStorageComponent } from '@axe/features/file/file-storage/file-storage.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('FileStorageComponent', () => {
  let component: FileStorageComponent;
  let fixture: ComponentFixture<FileStorageComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [FileStorageComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FileStorageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(FileStorageComponent);
  });

  describe('keeping track of which files are picked', () => {
    it('picks one that was not picked', () => {
      component.imgBlockClick('img-123');
      expect(component['checkedFiles'].has('img-123')).toBe(true);
    });

    it('unpicks one that was', () => {
      component.imgBlockClick('img-123');
      component.imgBlockClick('img-123');
      expect(component['checkedFiles'].has('img-123')).toBe(false);
    });

    it('keeps several apart', () => {
      component.imgBlockClick('img-a');
      component.imgBlockClick('img-b');
      expect(component['checkedFiles'].has('img-a')).toBe(true);
      expect(component['checkedFiles'].has('img-b')).toBe(true);

      component.imgBlockClick('img-a');
      expect(component['checkedFiles'].has('img-a')).toBe(false);
      expect(component['checkedFiles'].has('img-b')).toBe(true);
    });
  });

  describe('changeTag', () => {
    it('returns early for the tag that means everything', () => {
      component['checkedFiles'].add('img-1');
      component.newTagName.set('全て');
      component.changeTag();
      // finishes without error, changing no tag
    });

    it('returns early for the reserved tag', () => {
      component['checkedFiles'].add('img-1');
      component.newTagName.set('システム予約');
      component.changeTag();
      // finishes without error
    });
  });

  describe('keeping a picture back', () => {
    function playing(role: PeerRole): void {
      PeerCursor.createMyCursor().role = role;
    }

    function put(identifier: string, tag = ''): void {
      const file = TestBed.inject(ImageStorage).add(identifier);
      if (tag) ImageTag.create(file.identifier).tag = tag;
    }

    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    it('is not something a player may do at all', () => {
      playing(PeerRole.Player);
      put('a-drawing');
      component.imgBlockClick('a-drawing');

      component.setCheckedSecret(true);

      expect(ImageTag.isSecret('a-drawing')).toBe(false);
      expect(component.canKeepSecret).toBe(false);
    });

    it('keeps back what the master ticked, and gives it up again', () => {
      playing(PeerRole.GameMaster);
      put('the-twist');
      component.imgBlockClick('the-twist');

      component.setCheckedSecret(true);
      expect(ImageTag.isSecret('the-twist')).toBe(true);

      component.setCheckedSecret(false);
      expect(ImageTag.isSecret('the-twist')).toBe(false);
    });

    it('leaves what the tool brought with it alone', () => {
      playing(PeerRole.GameMaster);
      put('a-die-face', SYSTEM_RESERVED_TAG);
      component.imgBlockClick('a-die-face');

      component.setCheckedSecret(true);

      expect(ImageTag.isSecret('a-die-face')).toBe(false);
    });

    it('leaves untouched anything the master did not tick', () => {
      playing(PeerRole.GameMaster);
      put('kept');
      put('not-kept');
      component.imgBlockClick('kept');

      component.setCheckedSecret(true);

      expect(ImageTag.isSecret('kept')).toBe(true);
      expect(ImageTag.isSecret('not-kept')).toBe(false);
    });
  });

  describe('bringing a picture in to look over first', () => {
    let opened: { blob: Blob; name: string }[];
    let canEdit: boolean;
    const ownClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

    function clipboardHolding(read: () => Promise<unknown[]>): void {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
    }

    function pasted(files: File[]): ClipboardEvent {
      return { clipboardData: { files }, preventDefault: vi.fn() } as unknown as ClipboardEvent;
    }

    beforeEach(() => {
      canEdit = true;
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockImplementation(() => canEdit);
      opened = [];
      vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue({
        open: (blob: Blob, name: string) => {
          opened.push({ blob, name });
          return Promise.resolve();
        },
      } as never);
    });

    afterEach(() => {
      if (ownClipboard) Object.defineProperty(navigator, 'clipboard', ownClipboard);
      else delete (navigator as { clipboard?: unknown }).clipboard;
      vi.restoreAllMocks();
    });

    it('opens a picture pasted with the keys, and leaves anything else pasted alone', () => {
      const picture = new File(['png'], 'image.png', { type: 'image/png' });
      const withPicture = pasted([picture]);
      const withText = pasted([]);

      component.onPaste(withPicture);
      component.onPaste(withText);

      expect(withPicture.preventDefault).toHaveBeenCalled();
      expect(withText.preventDefault).not.toHaveBeenCalled();
      expect(opened).toHaveLength(1);
      expect(opened[0].blob).toBe(picture);
      expect(opened[0].name).toMatch(/^pasted-\d{8}-\d{6}\.png$/);
    });

    it('takes nothing pasted from a seat that may not edit the table', () => {
      canEdit = false;
      const withPicture = pasted([new File(['png'], 'image.png', { type: 'image/png' })]);

      component.onPaste(withPicture);

      expect(withPicture.preventDefault).not.toHaveBeenCalled();
      expect(opened).toHaveLength(0);
    });

    it('opens the picture on the clipboard from the paste button', async () => {
      const picture = new Blob(['jpg'], { type: 'image/jpeg' });
      clipboardHolding(async () => [
        { types: ['text/plain'], getType: async () => new Blob(['words']) },
        { types: ['image/jpeg'], getType: async () => picture },
      ]);

      await component.pasteFromClipboard();

      expect(opened).toEqual([{ blob: picture, name: expect.stringMatching(/^pasted-.*\.jpg$/) }]);
      expect(component.notice()).toBe('');
    });

    it('says so when the clipboard holds no picture, or will not be read', async () => {
      clipboardHolding(async () => [{ types: ['text/plain'], getType: async () => new Blob(['words']) }]);
      await component.pasteFromClipboard();
      const nothing = component.notice();

      clipboardHolding(() => Promise.reject(new Error('denied')));
      await component.pasteFromClipboard();
      const refused = component.notice();

      expect(opened).toHaveLength(0);
      expect(nothing).not.toBe('');
      expect(refused).not.toBe('');
      expect(refused).not.toBe(nothing);
    });

    it('offers to clear the background of one ticked picture, and of no more', async () => {
      const storage = TestBed.inject(ImageStorage);
      const blob = new Blob(['png'], { type: 'image/png' });
      for (const identifier of ['map-one', 'map-two']) {
        storage.add({
          identifier,
          name: `${identifier}.png`,
          type: 'image/png',
          blob,
          url: `blob:${identifier}`,
          thumbnail: { type: '', blob: null, url: '' },
        });
      }
      component.selectTag.set('__all__');

      try {
        expect(component.checkedImage()).toBeNull();
        component.imgBlockClick('map-one');
        expect(component.checkedImage()?.identifier).toBe('map-one');
        component.imgBlockClick('map-two');
        expect(component.checkedImage()).toBeNull();

        component.imgBlockClick('map-two');
        await component.clearBackgroundOfChecked();
        expect(opened).toEqual([{ blob, name: 'map-one-clear.png' }]);
      } finally {
        storage.delete('map-one');
        storage.delete('map-two');
      }
    });
  });

  describe('the list of pictures', () => {
    function playing(role: PeerRole): void {
      PeerCursor.createMyCursor().role = role;
    }

    beforeEach(() => {
      const plain = TestBed.inject(ImageStorage).add('a-drawing');
      ImageTag.create(plain.identifier);
      const secret = TestBed.inject(ImageStorage).add('the-twist');
      ImageTag.create(secret.identifier).isSecret = true;
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    it('never shows a player what is being kept back', () => {
      playing(PeerRole.Player);

      const shown = component.getAllImage().map((image) => image.identifier);
      expect(shown).toContain('a-drawing');
      expect(shown).not.toContain('the-twist');
    });

    it('shows the master everything by default', () => {
      playing(PeerRole.GameMaster);

      expect(component.showSecret()).toBe(true);
      expect(component.getAllImage().map((image) => image.identifier)).toContain('the-twist');
    });

    it('folds them away for the master who asks, and leaves the rest', () => {
      playing(PeerRole.GameMaster);
      component.showSecret.set(false);

      const shown = component.getAllImage().map((image) => image.identifier);
      expect(shown).not.toContain('the-twist');
      expect(shown).toContain('a-drawing');
    });
  });
});
