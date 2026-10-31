import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { FileStorageComponent } from '@axe/features/file/file-storage/file-storage.component';
import { ReportDialogComponent } from '@axe/features/moderation/report-dialog/report-dialog.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ImageEditQueue } from '@axe/ui/components/image-editor/image-edit-queue.service';

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

  it('lists no account’s avatar among the room’s pictures, untagged or all', () => {
    const storage = TestBed.inject(ImageStorage);
    const avatar = storage.add('https://cdn.discordapp.com/avatars/1/a.png');
    const plain = storage.add('https://example.com/b.png');
    try {
      const listed = () => component.images().map((image) => image.identifier);
      expect(listed()).toContain(plain.identifier);
      expect(listed()).not.toContain(avatar.identifier);

      component.selectTag.set(component.tagList()[1]);
      expect(listed()).toContain(plain.identifier);
      expect(listed()).not.toContain(avatar.identifier);
    } finally {
      storage.delete(avatar.identifier);
      storage.delete(plain.identifier);
    }
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(FileStorageComponent);
  });

  describe('keeping track of which files are picked', () => {
    it('picks one that was not picked', () => {
      component.imgBlockClick('img-123');
      expect(component['checkedFiles']().has('img-123')).toBe(true);
    });

    it('unpicks one that was', () => {
      component.imgBlockClick('img-123');
      component.imgBlockClick('img-123');
      expect(component['checkedFiles']().has('img-123')).toBe(false);
    });

    it('keeps several apart', () => {
      component.imgBlockClick('img-a');
      component.imgBlockClick('img-b');
      expect(component['checkedFiles']().has('img-a')).toBe(true);
      expect(component['checkedFiles']().has('img-b')).toBe(true);

      component.imgBlockClick('img-a');
      expect(component['checkedFiles']().has('img-a')).toBe(false);
      expect(component['checkedFiles']().has('img-b')).toBe(true);
    });
  });

  describe('changeTag', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('files the ticked picture under the typed tag for a seat that may edit', () => {
      TestBed.inject(ImageStorage).add('a-drawing');
      component.imgBlockClick('a-drawing');
      component.newTagName.set('地図');

      component.changeTag();

      expect(ImageTag.get('a-drawing')?.tag).toBe('地図');
    });

    it('leaves the tags alone for a guest', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
      TestBed.inject(ImageStorage).add('a-drawing');
      component.imgBlockClick('a-drawing');
      component.newTagName.set('地図');

      component.changeTag();

      expect(ImageTag.get('a-drawing')).toBeFalsy();
    });

    it('returns early for the tag that means everything', () => {
      component['checkedFiles'].set(new Set(['img-1']));
      component.newTagName.set('全て');
      component.changeTag();
      // finishes without error, changing no tag
    });

    it('returns early for the reserved tag', () => {
      component['checkedFiles'].set(new Set(['img-1']));
      component.newTagName.set('システム予約');
      component.changeTag();
      // finishes without error
    });
  });

  describe('removing pictures from the room', () => {
    const pictureId = 'a'.repeat(64);
    const otherId = 'b'.repeat(64);

    function playing(role: PeerRole): void {
      PeerCursor.createMyCursor().role = role;
    }

    const removeButton = () =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="file-storage-remove"]');

    afterEach(() => {
      PeerCursor.myCursor = null!;
      for (const record of AssetOwner.all()) ObjectStore.instance.remove(record);
    });

    /** Names this seat as the one who added the picture, as one made here is. */
    function addedHere(identifier: string): void {
      AssetOwner.claim(identifier, 'image', TestBed.inject(AssetOwnershipService).myOwnerKey());
    }

    it.each([
      [PeerRole.GameMaster, true],
      [PeerRole.Player, false],
    ])('is offered to a seat of role %s, with no picture of its own listed: %s', async (role, offered) => {
      playing(role);
      await fixture.whenStable();

      expect(removeButton() !== null).toBe(offered);
    });

    it('asks to remove what the master ticked in the list, and unticks them once removed', async () => {
      playing(PeerRole.GameMaster);
      const removeAfterAsking = vi
        .spyOn(TestBed.inject(AssetRemovalService), 'removeAfterAsking')
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      TestBed.inject(ImageStorage).add(pictureId);
      TestBed.inject(ImageStorage).add(otherId);
      component.imgBlockClick(pictureId);

      await component.removeChecked();
      expect(component['checkedFiles']().has(pictureId)).toBe(true);
      await component.removeChecked();

      expect(removeAfterAsking.mock.calls).toEqual([
        ['image', [pictureId]],
        ['image', [pictureId]],
      ]);
      expect(component['checkedFiles']().size).toBe(0);
    });

    it('is offered to a player while a picture they added is listed', async () => {
      playing(PeerRole.Player);
      TestBed.inject(ImageStorage).add(pictureId);
      AssetOwner.claim(otherId, 'image', 'owner_someone-else');
      TestBed.inject(ImageStorage).add(otherId);
      await fixture.whenStable();
      expect(removeButton()).toBeNull();

      addedHere(pictureId);
      await fixture.whenStable();

      expect(removeButton()).not.toBeNull();
    });

    it('asks to remove what a player ticked, leaving it to the asking to keep what they did not add', async () => {
      playing(PeerRole.Player);
      const removeAfterAsking = vi.spyOn(TestBed.inject(AssetRemovalService), 'removeAfterAsking').mockResolvedValue(1);
      TestBed.inject(ImageStorage).add(pictureId);
      TestBed.inject(ImageStorage).add(otherId);
      addedHere(pictureId);
      component.imgBlockClick(pictureId);
      component.imgBlockClick(otherId);

      await component.removeChecked();

      expect(removeAfterAsking.mock.calls).toEqual([['image', [pictureId, otherId]]]);
    });

    it('asks nothing for a player who added none of those listed', async () => {
      playing(PeerRole.Player);
      const removeAfterAsking = vi.spyOn(TestBed.inject(AssetRemovalService), 'removeAfterAsking');
      TestBed.inject(ImageStorage).add(pictureId);
      component.imgBlockClick(pictureId);

      await component.removeChecked();

      expect(removeAfterAsking).not.toHaveBeenCalled();
    });
  });

  describe('reporting a picture to the room server’s operator', () => {
    const pictureId = 'a'.repeat(64);

    const reportButtons = () =>
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-testid="file-storage-report"]');

    function inRoomServerRoom(): void {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
      vi.spyOn(AssetHttpStore.instance, 'isEnabled', 'get').mockReturnValue(true);
    }

    beforeEach(() => {
      const images = TestBed.inject(ImageStorage);
      for (const image of [...images.images]) images.delete(image.identifier);
    });

    afterEach(() => vi.restoreAllMocks());

    it('offers it for a picture a person added, and opens the report for that picture without ticking it', async () => {
      inRoomServerRoom();
      const opened = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue(null);
      TestBed.inject(ImageStorage).add(pictureId);
      TestBed.inject(ImageStorage).add('none_icon');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(reportButtons()).toHaveLength(1);
      reportButtons()[0].click();

      expect(opened).toHaveBeenCalledWith(
        ReportDialogComponent,
        expect.objectContaining({ target: 'asset', assetId: pictureId })
      );
      expect(component['checkedFiles']().size).toBe(0);
    });

    it('offers none among peers, where there is no operator to tell', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');
      TestBed.inject(ImageStorage).add(pictureId);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(reportButtons()).toHaveLength(0);
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
    let opened: { blob: Blob; name: string; replaces?: string }[];
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
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockImplementation(() => canEdit);
      opened = [];
      vi.spyOn(TestBed.inject(ImageEditQueue), 'edit').mockImplementation(async (request) => {
        opened.push({
          blob: request.blob,
          name: request.name,
          ...(request.replaces ? { replaces: request.replaces.identifier } : {}),
        });
        return { kind: 'closed' };
      });
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

    it('names the pictures still over the size limit once the rest are in', async () => {
      const upload = vi
        .spyOn(TestBed.inject(ImageEditQueue), 'upload')
        .mockResolvedValue({ images: [], oversized: ['heavy.png', 'huge.jpg'] });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [new File(['png'], 'heavy.png', { type: 'image/png' })] });

      await component.handleFileSelect({ target: input } as unknown as Event);

      expect(upload).toHaveBeenCalledTimes(1);
      expect(component.notice()).toContain('heavy.png, huge.jpg');
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

    it('offers to edit one ticked picture in its place, and no more', async () => {
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
        await component.editChecked();
        expect(opened).toEqual([{ blob, name: 'map-one.png', replaces: 'map-one' }]);
      } finally {
        storage.delete('map-one');
        storage.delete('map-two');
      }
    });
    it('moves the tick to the picture that took the place of the one edited, ready to edit again', async () => {
      const storage = TestBed.inject(ImageStorage);
      const blob = new Blob(['png'], { type: 'image/png' });
      const put = (identifier: string) =>
        storage.add({
          identifier,
          name: `${identifier}.png`,
          type: 'image/png',
          blob,
          url: `blob:${identifier}`,
          thumbnail: { type: '', blob: null, url: '' },
        });
      put('map-one');
      component.selectTag.set('__all__');
      vi.mocked(TestBed.inject(ImageEditQueue).edit).mockImplementation(async (request) => {
        const edited = put('map-one-edited');
        ImageTag.create(request.replaces!.identifier).tag = SYSTEM_RESERVED_TAG;
        return { kind: 'added', image: edited };
      });

      try {
        component.imgBlockClick('map-one');
        await component.editChecked();
        expect(component.checkedImage()?.identifier).toBe('map-one-edited');

        component.imgBlockClick('map-one-edited');
        component.imgBlockClick('map-one-edited');
        component['checkedFiles'].update((checked) => new Set([...checked, 'map-one']));
        expect(component.checkedImage()?.identifier).toBe('map-one-edited');
      } finally {
        storage.delete('map-one');
        storage.delete('map-one-edited');
      }
    });
  });

  describe('what a guest is offered', () => {
    let canEdit: boolean;

    beforeEach(() => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockImplementation(() => canEdit);
      TestBed.inject(ImageStorage).add('a-drawing');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function shown(): Record<string, boolean> {
      const element = fixture.nativeElement as HTMLElement;
      return {
        upload: element.querySelector('input[type="file"]') !== null,
        paste: element.querySelector('[data-testid="file-storage-paste"]') !== null,
        editFirst: element.querySelector('[data-testid="file-storage-edit-first"]') !== null,
        changeTag: element.textContent?.includes('タグを変更') === true,
        tick: element.querySelector('.grid input[type="checkbox"]') !== null,
      };
    }

    it('shows a player every way to bring pictures in and file them', () => {
      canEdit = true;
      fixture.detectChanges();

      expect(shown()).toEqual({ upload: true, paste: true, editFirst: true, changeTag: true, tick: true });
    });

    it('shows a guest none of them', () => {
      canEdit = false;
      fixture.detectChanges();

      expect(shown()).toEqual({ upload: false, paste: false, editFirst: false, changeTag: false, tick: false });
    });
  });

  describe('tags kept to one person', () => {
    function playing(role: PeerRole): void {
      PeerCursor.createMyCursor().role = role;
    }

    const lockButton = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="file-storage-lock-tag"]');

    beforeEach(() => {
      ImageTag.create(TestBed.inject(ImageStorage).add('the-boss').identifier).tag = 'ボス';
      ImageTag.create(TestBed.inject(ImageStorage).add('a-goblin').identifier).tag = '雑魚';
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
      for (const record of ImageTagLock.all()) ObjectStore.instance.remove(record);
      vi.restoreAllMocks();
    });

    it('lists neither a tag someone else keeps nor its pictures for a player, and both for the master', async () => {
      ImageTagLock.lock('ボス', 'owner_someone-else');
      playing(PeerRole.Player);
      await fixture.whenStable();

      expect(component.tagList()).not.toContain('ボス');
      expect(component.getAllImage().map((image) => image.identifier)).not.toContain('the-boss');

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await fixture.whenStable();
      expect(component.tagList()).toContain('ボス');
      expect(component.getAllImage().map((image) => image.identifier)).toContain('the-boss');
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-testid="file-storage-tag-locked"]')
      ).not.toBeNull();
    });

    it('keeps the tag picked to this seat from its button, and frees it again', async () => {
      playing(PeerRole.Player);
      component.selectTag.set('雑魚');
      await fixture.whenStable();

      lockButton()!.click();
      await fixture.whenStable();
      expect(TestBed.inject(ImageTagLockService).isMine('雑魚')).toBe(true);

      lockButton()!.click();
      expect(TestBed.inject(ImageTagLockService).isLocked('雑魚')).toBe(false);
    });

    it('offers no lock for all the pictures together or the untagged ones', async () => {
      playing(PeerRole.Player);
      component.selectTag.set('');
      await fixture.whenStable();
      expect(lockButton()).toBeNull();
    });

    it('files no picture under a tag someone else keeps, and says so', () => {
      ImageTagLock.lock('ボス', 'owner_someone-else');
      playing(PeerRole.Player);
      const show = vi.spyOn(TestBed.inject(SnackbarService), 'show');
      component.selectTag.set('雑魚');
      component.imgBlockClick('a-goblin');
      component.newTagName.set('ボス');

      component.changeTag();

      expect(ImageTag.get('a-goblin').tag).toBe('雑魚');
      expect(show).toHaveBeenCalledOnce();
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
