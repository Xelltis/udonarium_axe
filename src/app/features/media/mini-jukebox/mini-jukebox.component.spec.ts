import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { LoopPlayer } from '@axe/core/storage/loop-player';
import { ObjectStore } from '@axe/core/sync/object-store';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DJ_DECK_OPEN_STORAGE_KEY, readDeckOpen } from '@axe/features/media/mini-jukebox/dj-deck-preference';
import { MiniJukeboxComponent } from '@axe/features/media/mini-jukebox/mini-jukebox.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function addBackgroundSound(identifier: string, name: string): void {
  const audio = AudioFile.createEmpty(identifier);
  const context = (audio as unknown as { context: Record<string, unknown> }).context;
  context['blob'] = new Blob(['x']);
  context['url'] = 'blob:x';
  context['name'] = name;
  AudioStorage.instance.add(audio);
  AudioTag.create(identifier).tag = AUDIO_TAG_BGS;
}

describe('MiniJukeboxComponent', () => {
  let fixture: ComponentFixture<MiniJukeboxComponent>;

  const line = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('[data-testid="mini-jukebox-background-sounds"]');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MiniJukeboxComponent],
      providers: [...TEST_PROVIDERS],
    });
    if (!ObjectStore.instance.get<Jukebox>('Jukebox')) new Jukebox('Jukebox').initialize();
    vi.spyOn(LoopPlayer.prototype, 'start').mockImplementation(() => {});
    vi.spyOn(LoopPlayer.prototype, 'stop').mockImplementation(() => {});
    fixture = TestBed.createComponent(MiniJukeboxComponent);
  });

  afterEach(() => {
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
    vi.restoreAllMocks();
  });

  describe('what each role may touch', () => {
    const control = (testId: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;

    beforeEach(() => {
      PeerCursor.createMyCursor();
      addBackgroundSound('rain', 'Rain');
      BackgroundSound.start('rain');
      ObjectStore.instance.get<Jukebox>('Jukebox')!.isPlaying = true;
    });

    afterEach(() => BackgroundSound.stopAll());

    it('greys out the room’s music and background sounds for a guest', async () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      await fixture.whenStable();

      for (const testId of [
        'mini-jukebox-play-pause',
        'mini-jukebox-shuffle',
        'mini-jukebox-repeat',
        'mini-jukebox-background-stop-all',
      ]) {
        expect(control(testId).disabled, testId).toBe(true);
      }
    });

    it('lets a player pause the room’s music, and leaves shuffle and repeat to the game master', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      PeerCursor.myCursor.role = PeerRole.Player;
      await fixture.whenStable();

      expect(control('mini-jukebox-play-pause').disabled).toBe(false);
      expect(control('mini-jukebox-background-stop-all').disabled).toBe(false);
      for (const testId of ['mini-jukebox-shuffle', 'mini-jukebox-repeat']) {
        expect(control(testId).disabled, testId).toBe(true);
        expect(control(testId).title, testId).toContain(t('feature.media.jukebox.gmOnlySuffix'));
      }
    });

    it('gives the game master shuffle and repeat', async () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      await fixture.whenStable();

      expect(control('mini-jukebox-shuffle').disabled).toBe(false);
      expect(control('mini-jukebox-repeat').disabled).toBe(false);
    });
  });

  describe('the line of background sounds', () => {
    it('is not shown while none is playing', async () => {
      await fixture.whenStable();

      expect(line()).toBeNull();
    });

    it('names the ones playing, in the order they were started', async () => {
      addBackgroundSound('rain', 'Rain');
      addBackgroundSound('fire', 'Campfire');
      BackgroundSound.start('rain')!.startedAt = 100;
      BackgroundSound.start('fire')!.startedAt = 200;
      await fixture.whenStable();

      expect(line()?.textContent).toContain('Rain · Campfire');
    });

    it('stops them all for the room, and goes', async () => {
      addBackgroundSound('rain', 'Rain');
      BackgroundSound.start('rain');
      await fixture.whenStable();

      line()!.querySelector<HTMLButtonElement>('[data-testid="mini-jukebox-background-stop-all"]')!.click();
      await fixture.whenStable();

      expect(BackgroundSound.playing()).toEqual([]);
      expect(line()).toBeNull();
    });
  });
  describe('the DJ deck', () => {
    const toggle = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="mini-jukebox-dj-deck-toggle"]'
      )!;
    const deck = () => (fixture.nativeElement as HTMLElement).querySelector('app-dj-deck');

    it('is closed until opened, then opens under the player and is remembered in this browser', async () => {
      await fixture.whenStable();
      expect(deck()).toBeNull();
      expect(toggle().getAttribute('aria-pressed')).toBe('false');

      toggle().click();
      await fixture.whenStable();

      expect(deck()).not.toBeNull();
      expect(localStorage.getItem(DJ_DECK_OPEN_STORAGE_KEY)).toBe('1');
      expect(readDeckOpen()).toBe(true);

      toggle().click();
      await fixture.whenStable();
      expect(deck()).toBeNull();
      expect(readDeckOpen()).toBe(false);
    });
  });

  it('marks the places marked in the room track along the seek bar', async () => {
    const jukebox = ObjectStore.instance.get<Jukebox>('Jukebox')!;
    jukebox.audioIdentifier = 'marked';
    jukebox.isPlaying = true;
    vi.spyOn(Jukebox.prototype, 'duration', 'get').mockReturnValue(200);
    AudioProfile.setCues('marked', [50, null, 150, null]);
    await waitZeroTimeout();
    await fixture.whenStable();

    const marks = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[data-testid="mini-jukebox-cue-mark"]'),
    ];
    expect(marks.map((mark) => mark.style.left)).toEqual(['25%', '75%']);
  });
});
