import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MotionService } from '@axe/application/ui/motion.service';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  EFFECT_PREVIEW_REST_MS,
  EffectPreviewComponent,
  effectPreviewFrameAt,
} from '@axe/features/effect/effect-preview/effect-preview.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function presetOf(kind: string, durationMs = 1000): EffectPreset {
  const preset = new EffectPreset();
  preset.kind = kind;
  preset.durationMs = durationMs;
  preset.staggerMs = 0;
  return preset;
}

describe('effectPreviewFrameAt', () => {
  it('runs the effect, rests, and starts it over', () => {
    const preset = presetOf('burst', 1000);
    const period = 1000 + EFFECT_PREVIEW_REST_MS;

    expect(effectPreviewFrameAt(preset, 0)).toEqual({ round: 0, elapsed: 0 });
    expect(effectPreviewFrameAt(preset, 400)).toEqual({ round: 0, elapsed: 400 });
    expect(effectPreviewFrameAt(preset, period + 10)).toEqual({ round: 1, elapsed: 10 });
    expect(effectPreviewFrameAt(preset, -50)).toEqual({ round: 0, elapsed: 0 });
  });
});

describe('EffectPreviewComponent', () => {
  let fixture: ComponentFixture<EffectPreviewComponent>;
  let component: EffectPreviewComponent;
  let motion: MotionService;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    // The 2D context of happy-dom has no drawing functions; what is checked is what is placed.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    TestBed.configureTestingModule({ imports: [EffectPreviewComponent], providers: [...TEST_PROVIDERS] });
    motion = TestBed.inject(MotionService);
    motion.setting.set('on');
    fixture = TestBed.createComponent(EffectPreviewComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    motion.setting.set('auto');
    vi.restoreAllMocks();
  });

  function show(preset: EffectPreset | null): void {
    fixture.componentRef.setInput('preset', preset);
    fixture.detectChanges();
  }

  /** Runs every frame asked for so far, at a time past the start of the playback. */
  function runFramesAt(sinceStartMs: number): void {
    for (const frame of frames.splice(0)) frame(1000 + sinceStartMs);
    fixture.detectChanges();
  }

  it('plays nothing without an effect', () => {
    show(null);
    runFramesAt(300);

    expect(component.sprites()).toEqual([]);
    expect(component.canvases()).toEqual([]);
  });

  it('plays the effect on the stand-in in the middle of the board, frame by frame', () => {
    show(presetOf('burst'));

    runFramesAt(300);
    expect(component.frame()).toEqual({ round: 0, elapsed: 300 });
    const drawn = [...component.sprites(), ...component.canvases()];
    expect(drawn.length).toBeGreaterThan(0);
    expect(component.sprites().every((sprite) => Math.abs(sprite.x) < 50 && Math.abs(sprite.y) < 50)).toBe(true);

    runFramesAt(600);
    expect(component.frame()).toEqual({ round: 0, elapsed: 600 });
  });

  it('draws each round afresh, so that what animates starts again', () => {
    const preset = presetOf('burst');
    show(preset);

    runFramesAt(300);
    const first = component.sprites().map((sprite) => sprite.key);
    runFramesAt(1000 + EFFECT_PREVIEW_REST_MS + 300);
    const second = component.sprites().map((sprite) => sprite.key);

    expect(first.length).toBeGreaterThan(0);
    expect(first.every((key) => key.startsWith('0-'))).toBe(true);
    expect(second.every((key) => key.startsWith('1-'))).toBe(true);
  });

  it('draws nothing in the rest between rounds', () => {
    show(presetOf('burst'));

    runFramesAt(1000 + EFFECT_PREVIEW_REST_MS / 2);

    expect(component.sprites()).toEqual([]);
    expect(component.canvases()).toEqual([]);
  });

  it('starts again from the beginning when another effect is chosen', () => {
    show(presetOf('burst'));
    runFramesAt(700);

    show(presetOf('heal'));

    expect(component.frame()).toEqual({ round: 0, elapsed: 0 });
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('fires an aimed effect from a caster off to the front left of the stand-in', () => {
    show(presetOf('projectile'));

    runFramesAt(300);

    expect(component.sprites().some((sprite) => sprite.x < -20 && sprite.y > 10)).toBe(true);
  });

  it('draws the board smaller for a larger effect, so that it stays in the box', () => {
    const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(component['boardTransform']())![1]);
    const usual = presetOf('nova');
    show(usual);
    const usualScale = scaleOf();

    const large = presetOf('nova');
    large.scale = 2;
    show(large);

    expect(scaleOf()).toBeCloseTo(usualScale / 2);
  });

  it('holds one still halfway through while motion is turned off', () => {
    motion.setting.set('off');
    show(presetOf('burst', 1000));
    runFramesAt(300);

    expect(component.frame()).toEqual({ round: 0, elapsed: 500 });
    expect(component.sprites().length + component.canvases().length).toBeGreaterThan(0);
  });
});
