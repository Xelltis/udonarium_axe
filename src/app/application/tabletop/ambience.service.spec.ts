import { TestBed } from '@angular/core/testing';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { AmbienceService, storedAmbienceFrameStepMs } from '@axe/application/tabletop/ambience.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AmbienceService', () => {
  let service: AmbienceService;
  let playback: EffectPlaybackService;

  beforeEach(() => {
    localStorage.removeItem('ui-ambience-frame-step');
    // Held to the full way, so the machine running the tests cannot decide it.
    localStorage.setItem('ui-render-lite', 'off');
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(AmbienceService);
    playback = TestBed.inject(EffectPlaybackService);
  });

  afterEach(() => {
    localStorage.removeItem('ui-ambience-frame-step');
    localStorage.removeItem('ui-render-lite');
    TestBed.resetTestingModule();
    document.documentElement.classList.remove('render-lite');
  });

  it('follows the effect clock exactly by default', () => {
    playback.now.set(1234.5);
    expect(service.now()).toBe(1234.5);
  });

  it('holds the clock on a step once one is chosen', () => {
    service.frameStepMs.set(33);

    playback.now.set(100);
    expect(service.now()).toBe(99);
    playback.now.set(131);
    expect(service.now()).toBe(99);
    playback.now.set(132);
    expect(service.now()).toBe(132);
  });

  it('moves on about every other frame while the table is drawn the lighter way', () => {
    TestBed.inject(RenderLiteService).setting.set('on');

    playback.now.set(100);
    expect(service.now()).toBe(96);
    playback.now.set(116.7);
    expect(service.now()).toBe(96);
    playback.now.set(133.3);
    expect(service.now()).toBe(128);
  });

  it('keeps a step chosen in the browser over the one the lighter way takes', () => {
    TestBed.inject(RenderLiteService).setting.set('on');
    service.frameStepMs.set(50);

    playback.now.set(120);
    expect(service.now()).toBe(100);
  });

  it('reads the step from the browser, and takes nothing unusable', () => {
    localStorage.setItem('ui-ambience-frame-step', '33');
    expect(storedAmbienceFrameStepMs()).toBe(33);
    localStorage.setItem('ui-ambience-frame-step', 'fast');
    expect(storedAmbienceFrameStepMs()).toBe(0);
    localStorage.setItem('ui-ambience-frame-step', '-5');
    expect(storedAmbienceFrameStepMs()).toBe(0);
  });
});
