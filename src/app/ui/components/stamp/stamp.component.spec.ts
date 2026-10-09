import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { imageStampId } from '@axe/domain/chat/stamp-catalog';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';

describe('StampComponent', () => {
  let fixture: ComponentFixture<StampComponent>;

  function show(stampId: string, play = 0): HTMLElement | null {
    fixture.componentRef.setInput('stampId', stampId);
    fixture.componentRef.setInput('play', play);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('[data-stamp]');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StampComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(StampComponent);
  });

  it('writes a sound effect in its own words and colour', () => {
    const drawn = show('sfx:creepy')!;
    const t = TestBed.inject(TRANSLATE_FN);

    const words = drawn.querySelector('span') as HTMLElement;
    expect(words.textContent).toBe(t('ui.stamp.items.sfx.creepy.label'));
    expect(words.style.color).toBe('#7b3fd6');
    expect(drawn.getAttribute('title')).toBe(t('ui.stamp.items.sfx.creepy.name'));
  });

  it('lets the words of a sound effect run as wide as they need, and keeps a picture to its box', () => {
    const words = show('sfx:clap')!;
    expect(words.style.width).toBe('');
    expect(words.style.minWidth).toBe('48px');

    expect(show('seal:ok')!.style.width).toBe('48px');
  });

  it('draws a seal and a table mark as pictures', () => {
    expect(show('seal:ok')!.querySelector('svg')).not.toBeNull();
    expect(show('motif:critical')!.querySelector('svg')).not.toBeNull();
  });

  it('shows a stamp from the room by its picture, and nothing while the picture is not here', () => {
    expect(show(imageStampId('not-here'))).toBeNull();

    ImageStorage.instance.add({
      identifier: 'stamp-picture',
      name: 'nice.png',
      type: 'image/png',
      blob: null,
      url: 'blob:stamp-picture',
      thumbnail: { type: '', blob: null, url: '' },
    });
    try {
      const drawn = show(imageStampId('stamp-picture'))!;
      expect(drawn.querySelector('img')!.getAttribute('src')).toBe('blob:stamp-picture');
      expect(drawn.getAttribute('title')).toBe('nice.png');
    } finally {
      ImageStorage.instance.delete('stamp-picture');
    }
  });

  it('names a stamp from the room by the name it has in a set', () => {
    ImageStorage.instance.add({
      identifier: 'stamp-picture',
      name: 'nice.png',
      type: 'image/png',
      blob: null,
      url: 'blob:stamp-picture',
      thumbnail: { type: '', blob: null, url: '' },
    });
    const pack = StampPack.create('セット');
    pack.addStamp('stamp-picture', 'ナイス');
    try {
      expect(show(imageStampId('stamp-picture'))!.getAttribute('title')).toBe('ナイス');
    } finally {
      pack.destroy();
      ImageStorage.instance.delete('stamp-picture');
    }
  });

  it('draws nothing for a stamp it does not know', () => {
    expect(show('sfx:from-a-newer-version')).toBeNull();
  });

  it('keeps still until asked to move, and moves again each time it is asked', () => {
    expect(show('seal:ok', 0)!.className).not.toContain('animate-stamp');

    const first = show('seal:ok', 1)!;
    expect(first.className).toContain('animate-stamp-press');

    const second = show('seal:ok', 2)!;
    expect(second.className).toContain('animate-stamp-press');
    expect(second).not.toBe(first);
  });
});
