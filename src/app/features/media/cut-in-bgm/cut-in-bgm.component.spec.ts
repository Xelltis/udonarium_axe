import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutInBgmComponent } from '@axe/features/media/cut-in-bgm/cut-in-bgm.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInBgmComponent', () => {
  let component: CutInBgmComponent;
  let fixture: ComponentFixture<CutInBgmComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInBgmComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CutInBgmComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('returns its audio as a list', () => {
    expect(Array.isArray(component.audios())).toBe(true);
  });

  describe('narrowing the list by tag', () => {
    function add(identifier: string, tag?: string): void {
      const audio = AudioFile.createEmpty(identifier);
      const context = (audio as unknown as { context: Record<string, unknown> }).context;
      context['blob'] = new Blob(['x']);
      context['url'] = 'blob:x';
      context['name'] = identifier;
      AudioStorage.instance.add(audio);
      if (tag) AudioTag.create(identifier).tag = tag;
    }

    afterEach(() => {
      for (const audio of AudioStorage.instance.audios) AudioStorage.instance.delete(audio.identifier);
      for (const tag of ObjectStore.instance.getObjects(AudioTag)) ObjectStore.instance.delete(tag, false);
    });

    it('lists every file until a tab is picked, then the files under that tag, an untagged one as BGM', () => {
      add('music');
      add('hit', 'SE');

      expect(component.filteredAudios().map((audio) => audio.identifier)).toEqual(['music', 'hit']);

      component.selectTag.set('SE');
      expect(component.filteredAudios().map((audio) => audio.identifier)).toEqual(['hit']);

      component.selectTag.set('BGM');
      expect(component.filteredAudios().map((audio) => audio.identifier)).toEqual(['music']);
    });

    it('follows a file being filed under another tag at another seat', () => {
      add('hit', 'SE');
      component.selectTag.set('SE');
      expect(component.filteredAudios().map((audio) => audio.identifier)).toEqual(['hit']);

      const tag = AudioTag.get('hit')!;
      tag.tag = 'BGM';
      TestBed.inject(ObjectChangeService).notifyChanged(tag.identifier);

      expect(component.filteredAudios()).toEqual([]);
    });

    it('goes back to every file from the first tab, whose label is in the reader’s language', async () => {
      add('music');
      add('hit', 'SE');
      component.selectTag.set('SE');
      await fixture.whenStable();
      const tabs = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')];

      expect(tabs[0].textContent?.trim()).toBe('全て');
      tabs[0].click();

      expect(component.selectTag()).toBeNull();
      expect(component.filteredAudios()).toHaveLength(2);
    });
  });
});
