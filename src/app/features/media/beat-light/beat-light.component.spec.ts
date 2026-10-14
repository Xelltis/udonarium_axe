import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';
import { AudioProfile } from '@axe/domain/media/audio-profile';
import { beatGlow } from '@axe/domain/media/beat-glow';
import { DEFAULT_DJ_SETTINGS } from '@axe/domain/media/dj-settings';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Config } from '@axe/domain/peer/config';
import { BEAT_LIGHT_PEAK_OPACITY, BeatLightComponent } from '@axe/features/media/beat-light/beat-light.component';
import { BeatLightPreferenceService } from '@axe/features/media/beat-light/beat-light-preference.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BeatLightComponent', () => {
  let fixture: ComponentFixture<BeatLightComponent>;
  let jukebox: Jukebox;
  let config: Config;
  const motion = signal(true);
  let frames: FrameRequestCallback[];

  beforeEach(async () => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    motion.set(true);
    TestBed.configureTestingModule({
      imports: [BeatLightComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: MotionService, useValue: { enabled: motion } },
        { provide: AudioAnalysisService, useValue: { version: signal(0) } },
      ],
    });
    jukebox = new Jukebox('Jukebox');
    jukebox.initialize();
    jukebox.audioIdentifier = 'track';
    jukebox.isPlaying = true;
    config = new Config('Config');
    config.initialize();
    config.djSettings = { ...DEFAULT_DJ_SETTINGS, beatLight: true };
    AudioProfile.setGrid('track', { bpm: 120, bar: 0 });
    vi.spyOn(Jukebox.prototype, 'position', 'get').mockReturnValue(4.1);
    await waitZeroTimeout();
    fixture = TestBed.createComponent(BeatLightComponent);
    await fixture.whenStable();
  });

  afterEach(() => vi.restoreAllMocks());

  const glow = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('div')!;

  it('glows with the beat of the room track while the room turns it on', () => {
    expect(fixture.componentInstance.allowed()).toBe(true);
    expect(frames.length).toBeGreaterThan(0);

    frames.at(-1)!(0);

    expect(Number(glow().style.opacity)).toBeCloseTo(beatGlow({ bpm: 120, bar: 0 }, 4.1) * BEAT_LIGHT_PEAK_OPACITY, 3);
  });

  it('stays dark for a reader who keeps it off or asks for less motion', async () => {
    TestBed.inject(BeatLightPreferenceService).setOff(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.allowed()).toBe(false);
    expect(glow().style.opacity).toBe('0');
    expect((fixture.nativeElement as HTMLElement).classList).toContain('hidden');

    TestBed.inject(BeatLightPreferenceService).setOff(false);
    motion.set(false);
    await fixture.whenStable();
    expect(fixture.componentInstance.allowed()).toBe(false);
  });

  it('stays dark while the room does not turn it on, or its track keeps no beats', async () => {
    config.djSettings = DEFAULT_DJ_SETTINGS;
    await waitZeroTimeout();
    await fixture.whenStable();
    expect(fixture.componentInstance.allowed()).toBe(false);

    config.djSettings = { ...DEFAULT_DJ_SETTINGS, beatLight: true };
    AudioProfile.setGrid('track', null);
    await waitZeroTimeout();
    await fixture.whenStable();
    expect(fixture.componentInstance.grid()).toBeNull();
  });
});
