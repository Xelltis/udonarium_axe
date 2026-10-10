import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { StampPackPanelComponent } from '@axe/features/chat/stamp-pack-panel/stamp-pack-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StampPackPanelComponent', () => {
  let fixture: ComponentFixture<StampPackPanelComponent>;
  let canEdit: boolean;
  const pictures: string[] = [];

  const root = () => fixture.nativeElement as HTMLElement;
  const testId = (id: string) => root().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const packs = () => ObjectStore.instance.getObjects<StampPack>(StampPack);

  function picture(identifier: string, name: string): ImageFile {
    pictures.push(identifier);
    return ImageStorage.instance.add({
      identifier,
      name,
      type: 'image/png',
      blob: null,
      url: `blob:${identifier}`,
      thumbnail: { type: '', blob: null, url: '' },
    });
  }

  async function settle(): Promise<void> {
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function pickFiles(files: File[]): void {
    const input = testId('stamp-pack-add-files') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
  }

  beforeEach(() => {
    for (const pack of packs()) pack.destroy();
    TestBed.configureTestingModule({ imports: [StampPackPanelComponent], providers: [...TEST_PROVIDERS] });
    canEdit = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockImplementation(() => canEdit);
    fixture = TestBed.createComponent(StampPackPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    for (const pack of packs()) pack.destroy();
    for (const identifier of pictures.splice(0)) ImageStorage.instance.delete(identifier);
    vi.restoreAllMocks();
  });

  it('makes a set, and fills it from files, which go into the room first', async () => {
    expect(testId('stamp-pack-tab')).toBeNull();
    testId('stamp-pack-create')!.click();
    await settle();
    expect(packs()).toHaveLength(1);

    const loaded = [picture('cat-a', 'にゃー.png'), picture('cat-b', 'しゃー.png')];
    const load = vi
      .spyOn(TestBed.inject(FileArchiver), 'loadImages')
      .mockResolvedValue({ images: loaded, oversized: [] });
    pickFiles([new File(['a'], 'にゃー.png'), new File(['b'], 'しゃー.png')]);
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await settle();

    expect(packs()[0].stamps.map((stamp) => stamp.name)).toEqual(['にゃー', 'しゃー']);
    expect(root().querySelectorAll('[data-testid="stamp-pack-stamp"]')).toHaveLength(2);
  });

  it('says which pictures were too large to add', async () => {
    StampPack.create('ねこ');
    await settle();
    vi.spyOn(TestBed.inject(FileArchiver), 'loadImages').mockResolvedValue({ images: [], oversized: ['big.png'] });

    pickFiles([new File(['x'], 'big.png')]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(testId('stamp-pack-notice')?.textContent).toContain('big.png');
    });
  });

  it('renames a stamp, and takes the set away once that is confirmed', async () => {
    const pack = StampPack.create('ねこ');
    pack.addStamp(picture('cat-a', 'a.png').identifier, 'にゃー');
    await settle();

    const name = testId('stamp-pack-stamp-name') as HTMLInputElement;
    name.value = 'ごろにゃん';
    name.dispatchEvent(new Event('change'));
    expect(pack.stamps[0].name).toBe('ごろにゃん');

    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    testId('stamp-pack-remove')!.click();
    await settle();
    expect(packs()).toHaveLength(1);

    ask.mockResolvedValue(true);
    testId('stamp-pack-remove')!.click();
    await vi.waitFor(() => expect(packs()).toHaveLength(0));
  });

  it('shows the sets as they are to somebody who may not change them', async () => {
    const pack = StampPack.create('ねこ');
    pack.addStamp(picture('cat-a', 'a.png').identifier, 'にゃー');
    canEdit = false;
    fixture = TestBed.createComponent(StampPackPanelComponent);
    await settle();

    expect(root().querySelectorAll('[data-testid="stamp-pack-stamp"]')).toHaveLength(1);
    for (const id of ['stamp-pack-create', 'stamp-pack-name', 'stamp-pack-add-files', 'stamp-pack-stamp-remove']) {
      expect(testId(id), id).toBeNull();
    }
  });
});
