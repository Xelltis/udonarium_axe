import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AUDIO_ANALYSIS_VERSION } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DjDeckComponent } from '@axe/features/media/mini-jukebox/dj-deck/dj-deck.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DjDeckComponent', () => {
  let fixture: ComponentFixture<DjDeckComponent>;
  const reading = signal('');

  const element = (testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DjDeckComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: AudioAnalysisService,
          useValue: { version: signal(0), reading, isPending: (identifier: string) => identifier === reading() },
        },
      ],
    });
    PeerCursor.createMyCursor();
    const jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    jukebox.audioIdentifier = 'track';
    if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
    reading.set('');
    fixture = TestBed.createComponent(DjDeckComponent);
  });

  it('shows the tempo the track was read at', async () => {
    AudioProfile.share('track', {
      version: AUDIO_ANALYSIS_VERSION,
      duration: 100,
      lufs: -12.34,
      peak: -1,
      start: 0,
      end: 100,
      bpm: 127.98,
      bar: 0.1,
      confidence: 0.8,
    });
    await fixture.whenStable();

    expect(element('dj-deck-bpm').textContent?.trim()).toBe('128.0');
    expect(element('dj-deck-level').textContent).toContain('-12.3');
    expect(element('dj-deck-level-db').textContent?.trim()).toBe('−3.7');
  });

  it('says when the track is still being read, and when no beat was found', async () => {
    const t = TestBed.inject(TRANSLATE_FN);
    reading.set('track');
    await fixture.whenStable();
    expect(element('dj-deck-bpm').textContent?.trim()).toBe('—');
    expect(element('dj-deck-tempo-state').textContent?.trim()).toBe(t('feature.media.djDeck.analyzing'));

    reading.set('');
    TestBed.inject(AudioAnalysisService).version.update((value) => value + 1);
    await fixture.whenStable();

    expect(element('dj-deck-tempo-state').textContent?.trim()).toBe(t('feature.media.djDeck.noBeat'));
  });

  it('greys out every control for a guest', async () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    await fixture.whenStable();

    for (const testId of [
      'dj-deck-tap',
      'dj-deck-halve',
      'dj-deck-double',
      'dj-deck-downbeat',
      'dj-deck-reset-tempo',
      'dj-deck-auto-level',
      'dj-deck-ducking',
    ]) {
      expect(element(testId).disabled, testId).toBe(true);
    }
  });

  it('lets a player tap the beat, and leaves the room’s mix to the game master', async () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    await fixture.whenStable();

    expect(element('dj-deck-tap').disabled).toBe(false);
    expect(element('dj-deck-auto-level').disabled).toBe(true);
    expect(element('dj-deck-ducking').disabled).toBe(true);
  });

  it('lets the game master turn the room’s levelling and ducking off', async () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    vi.spyOn(Jukebox.prototype, 'refreshMix').mockImplementation(() => {});
    await fixture.whenStable();

    element('dj-deck-auto-level').click();
    element('dj-deck-ducking').click();
    await fixture.whenStable();

    expect(Config.instance.djSettings.autoLevel).toBe(false);
    expect(Config.instance.djSettings.ducking).toBe(false);
    expect(element('dj-deck-auto-level').getAttribute('aria-pressed')).toBe('false');
  });
});
