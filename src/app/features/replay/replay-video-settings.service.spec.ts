import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '@axe/application/i18n/language.service';
import type { SupportedLang } from '@axe/application/i18n/transloco.config';
import { ReplayVideoAudience } from '@axe/application/replay/replay-video-studio.service';
import { ReplayVideoPacing, ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';
import {
  REPLAY_PREVIEW_SIZE,
  REPLAY_VIDEO_SIZES,
  ReplayVideoSettingsService,
} from '@axe/features/replay/replay-video-settings.service';

describe('ReplayVideoSettingsService', () => {
  const interfaceLang = signal<SupportedLang>('ja');
  let settings: ReplayVideoSettingsService;

  beforeEach(() => {
    interfaceLang.set('ja');
    TestBed.configureTestingModule({
      providers: [
        ReplayVideoSettingsService,
        { provide: LanguageService, useValue: { currentLang: interfaceLang.asReadonly() } },
      ],
    });
    settings = TestBed.inject(ReplayVideoSettingsService);
  });

  it('starts as a novel for the public at 1080p and 60 frames, read at leisure, with everything on', () => {
    expect({
      style: settings.style(),
      audience: settings.audience(),
      sizeKey: settings.sizeKey(),
      fps: settings.fps(),
      pacing: settings.pacing(),
      readingSpeed: settings.readingSpeed(),
      withOpening: settings.withOpening(),
      withEffects: settings.withEffects(),
      withMusic: settings.withMusic(),
    }).toEqual({
      style: ReplayVideoStyle.Novel,
      audience: ReplayVideoAudience.Public,
      sizeKey: '1080p',
      fps: 60,
      pacing: ReplayVideoPacing.Reading,
      readingSpeed: 1,
      withOpening: true,
      withEffects: true,
      withMusic: true,
    });
  });

  it('makes the video in the language the interface is in, following it until one is chosen', () => {
    expect(settings.lang()).toBe('ja');

    interfaceLang.set('en');
    expect(settings.lang()).toBe('en');

    settings.setLang('ko');
    interfaceLang.set('ja');
    expect(settings.lang()).toBe('ko');
  });

  it('gathers the choices into the settings a video is made with at the size given', () => {
    settings.style.set(ReplayVideoStyle.Tabletop);
    settings.audience.set(ReplayVideoAudience.GameMaster);
    settings.pacing.set(ReplayVideoPacing.Recorded);
    settings.readingSpeed.set(1.5);
    settings.withOpening.set(false);
    settings.setLang('en');

    expect(settings.settingsAt(REPLAY_VIDEO_SIZES['720p'])).toEqual({
      style: ReplayVideoStyle.Tabletop,
      audience: ReplayVideoAudience.GameMaster,
      lang: 'en',
      width: 1280,
      height: 720,
      pacing: ReplayVideoPacing.Recorded,
      readingSpeed: 1.5,
      tabs: null,
      withOpening: false,
    });
  });

  it('offers the sizes YouTube lists, each the shape of the preview', () => {
    expect(Object.keys(REPLAY_VIDEO_SIZES)).toEqual(['720p', '1080p', '1440p', '2160p']);
    for (const size of Object.values(REPLAY_VIDEO_SIZES)) {
      expect(size.width / size.height).toBeCloseTo(REPLAY_PREVIEW_SIZE.width / REPLAY_PREVIEW_SIZE.height);
    }
  });
});
