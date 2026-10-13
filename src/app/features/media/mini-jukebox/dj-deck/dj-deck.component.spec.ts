import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { AUDIO_ANALYSIS_VERSION } from '@axe/domain/media/audio-analysis';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import { BeatLightPreferenceService } from '@axe/features/media/beat-light/beat-light-preference.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';
import { DjDeckComponent } from '@axe/features/media/mini-jukebox/dj-deck/dj-deck.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DjDeckComponent', () => {
  let fixture: ComponentFixture<DjDeckComponent>;
  const reading = signal('');

  const element = (testId: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;

  async function showTab(tab: 'deck' | 'pads' | 'mix'): Promise<void> {
    await fixture.whenStable();
    element(`dj-deck-tab-${tab}`).click();
    await fixture.whenStable();
  }

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
    await showTab('mix');
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
    ]) {
      expect(element(testId).disabled, testId).toBe(true);
    }
    await showTab('mix');
    for (const testId of ['dj-deck-auto-level', 'dj-deck-ducking', 'dj-deck-quantize']) {
      expect(element(testId).disabled, testId).toBe(true);
    }
  });

  it('lets a player tap the beat, and leaves the room’s mix to the game master', async () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    await fixture.whenStable();

    expect(element('dj-deck-tap').disabled).toBe(false);
    await showTab('mix');
    expect(element('dj-deck-auto-level').disabled).toBe(true);
    expect(element('dj-deck-ducking').disabled).toBe(true);
  });

  it('lets the game master turn the room’s levelling and ducking off', async () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    vi.spyOn(Jukebox.prototype, 'refreshMix').mockImplementation(() => {});
    await fixture.whenStable();
    await showTab('mix');

    element('dj-deck-auto-level').click();
    element('dj-deck-ducking').click();
    await fixture.whenStable();

    expect(Config.instance.djSettings.autoLevel).toBe(false);
    expect(Config.instance.djSettings.ducking).toBe(false);
    expect(element('dj-deck-auto-level').getAttribute('aria-pressed')).toBe('false');
  });

  describe('effects', () => {
    const knob = (name: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-name="${name}"]`)!;

    it('lets a player turn the filter for the room, heard here at once and shared when it settles', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      const jukebox = ObjectStore.instance.get<Jukebox>('Jukebox')!;
      const heard = vi.spyOn(jukebox, 'applyEffects').mockImplementation(() => {});
      await fixture.whenStable();

      knob('filter').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await fixture.whenStable();

      expect(heard).toHaveBeenCalledWith({ filter: -0.05, echo: 0, reverb: 0 });
      expect(JSON.parse(jukebox.fx ?? '')).toEqual({ filter: -0.05 });
      expect(knob('filter').getAttribute('aria-valuetext')).toBe('low-pass 5%');
    });

    it('turns every effect off at once', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      const jukebox = ObjectStore.instance.get<Jukebox>('Jukebox')!;
      vi.spyOn(jukebox, 'applyEffects').mockImplementation(() => {});
      jukebox.fx = '{"echo":0.4,"reverb":0.2}';
      await fixture.whenStable();

      element('dj-deck-reset-effects').click();
      await fixture.whenStable();

      expect(jukebox.fx).toBe('');
      expect(element('dj-deck-reset-effects').disabled).toBe(true);
    });

    it('leaves the knobs and the brake alone for a guest', async () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      ObjectStore.instance.get<Jukebox>('Jukebox')!.isPlaying = true;
      await fixture.whenStable();

      for (const name of ['filter', 'echo', 'reverb']) {
        expect(knob(name).getAttribute('aria-disabled'), name).toBe('true');
      }
      expect(element('dj-deck-brake').disabled).toBe(true);
    });

    it('lets a player brake only while the room plays', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      await fixture.whenStable();
      expect(knob('filter').getAttribute('aria-disabled')).toBe('false');
      expect(element('dj-deck-brake').disabled).toBe(true);

      ObjectStore.instance.get<Jukebox>('Jukebox')!.isPlaying = true;
      await waitZeroTimeout();
      await fixture.whenStable();
      expect(element('dj-deck-brake').disabled).toBe(false);
    });
  });

  it('shows each cue slot empty or with the place it marks', async () => {
    AudioProfile.setCues('track', [null, 83, null, null]);
    await waitZeroTimeout();
    await fixture.whenStable();

    expect(element('dj-deck-cue-0').textContent?.replace(/\s+/g, '')).toBe('1+');
    expect(element('dj-deck-cue-1').textContent?.replace(/\s+/g, '')).toBe('21:23');
  });

  describe('pads', () => {
    function addSound(identifier: string, tag: string): void {
      AudioStorage.instance.add({
        identifier,
        name: `${identifier}.mp3`,
        type: 'audio/mpeg',
        blob: new Blob(['x']),
        url: 'blob:x',
      });
      AudioTag.create(identifier).tag = tag;
    }

    afterEach(() => {
      for (const audio of AudioStorage.instance.audios) AudioStorage.instance.delete(audio.identifier);
    });

    it('lets the game master give an empty pad a sound from the library', async () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      addSound('airhorn', 'SE');
      await showTab('pads');

      element('dj-deck-pad-2').click();
      await fixture.whenStable();
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-testid="dj-deck-pad-choice"]')!
        .click();
      await waitZeroTimeout();
      await fixture.whenStable();

      expect(Config.instance.djPads[2]).toBe('airhorn');
      expect(element('dj-deck-pad-2').textContent).toContain('airhorn.mp3');
      expect(element('dj-deck-pad-picker')).toBeNull();
    });

    it('sets a pad off for the room by what its sound is', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      addSound('airhorn', 'SE');
      addSound('rain', AUDIO_TAG_BGS);
      Config.instance.djPads = ['airhorn', 'rain', '', '', '', '', '', ''];
      const play = vi.spyOn(TestBed.inject(JukeboxPlaybackService), 'play').mockImplementation(() => {});
      const toggle = vi.spyOn(TestBed.inject(BackgroundSoundPlaybackService), 'toggle').mockImplementation(() => {});
      await waitZeroTimeout();
      await showTab('pads');

      element('dj-deck-pad-0').click();
      element('dj-deck-pad-1').click();

      expect(play).toHaveBeenCalledWith(AudioStorage.instance.get('airhorn'));
      expect(toggle).toHaveBeenCalledWith(AudioStorage.instance.get('rain'));
    });

    it('leaves empty pads to the game master and every pad alone for a guest', async () => {
      addSound('airhorn', 'SE');
      Config.instance.djPads = ['airhorn', '', '', '', '', '', '', ''];
      PeerCursor.myCursor.role = PeerRole.Player;
      await waitZeroTimeout();
      await showTab('pads');

      expect(element('dj-deck-pad-0').disabled).toBe(false);
      expect(element('dj-deck-pad-1').disabled).toBe(true);
    });
  });

  it('lets the game master turn the beat light on for the room, and anyone keep it off on their own screen', async () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    vi.spyOn(Jukebox.prototype, 'refreshMix').mockImplementation(() => {});
    await showTab('mix');

    element('dj-deck-beat-light').click();
    element('dj-deck-beat-light-mine').click();
    await fixture.whenStable();

    expect(Config.instance.djSettings.beatLight).toBe(true);
    expect(TestBed.inject(BeatLightPreferenceService).off()).toBe(true);
  });

  it('lets the game master choose how long a pause fades, and nobody else', async () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    vi.spyOn(Jukebox.prototype, 'refreshMix').mockImplementation(() => {});
    await showTab('mix');
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '[data-testid="dj-deck-pause-fade"]'
    )!;

    select.selectedIndex = 4;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(Config.instance.djSettings.pauseFadeS).toBe(4);
    expect(select.disabled).toBe(false);
  });
});
