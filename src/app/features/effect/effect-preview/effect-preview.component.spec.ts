import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { MotionService } from '@axe/application/ui/motion.service';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import type { EffectFrame } from '@axe/domain/effect/scene/effect-scene';
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
  it('runs the effect, holding still as it strikes, rests, and starts it over', () => {
    const preset = presetOf('burst', 1000);
    const [blow] = effectBlowsOf(preset);
    const period = 1000 + blow.holdMs + sceneLingerMsOf(preset) + EFFECT_PREVIEW_REST_MS;

    expect(effectPreviewFrameAt(preset, 0)).toEqual({ round: 0, elapsed: 0 });
    expect(effectPreviewFrameAt(preset, blow.atMs + blow.holdMs / 2)).toEqual({ round: 0, elapsed: blow.atMs });
    expect(effectPreviewFrameAt(preset, 400)).toEqual({ round: 0, elapsed: 400 - blow.holdMs });
    expect(effectPreviewFrameAt(preset, period + 10)).toEqual({ round: 1, elapsed: 10 });
    expect(effectPreviewFrameAt(preset, -50)).toEqual({ round: 0, elapsed: 0 });
  });
});

describe('EffectPreviewComponent', () => {
  let fixture: ComponentFixture<EffectPreviewComponent>;
  let component: EffectPreviewComponent;
  let motion: MotionService;
  let frames: FrameRequestCallback[];
  let shown: EffectFrame[];

  beforeEach(async () => {
    // The 2D context of happy-dom has no drawing functions; what is checked is what is placed.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    shown = [];
    const stage = {
      show: (frame: EffectFrame) => shown.push(frame),
      resize: () => undefined,
      dispose: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [EffectPreviewComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: EFFECT_STAGE_LOADER,
          useValue: () =>
            Promise.resolve({
              createEffectStage: () => Promise.resolve(stage),
              createEffectOverlay: () => Promise.resolve(null),
            }),
        },
      ],
    });
    motion = TestBed.inject(MotionService);
    motion.setting.set('on');
    await TestBed.inject(EffectSceneLooksService).load();
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

  /** How much the small stage draws at this moment: its particles, bands and marks on the floor. */
  const drawnOnStage = () => {
    const frame = component.sceneFrame();
    return frame.motes.length + frame.ribbons.length + frame.floor.length;
  };

  it('plays nothing without an effect', () => {
    show(null);
    runFramesAt(300);

    expect(component.sprites()).toEqual([]);
    expect(component.canvases()).toEqual([]);
    expect(drawnOnStage()).toBe(0);
  });

  it('plays a look drawn in the scene on a small stage, about the stand-in, frame by frame', async () => {
    const preset = presetOf('burst');
    const [blow] = effectBlowsOf(preset);
    show(preset);
    // The stage is made once the preview is drawn, as what makes it is loaded.
    for (let turn = 0; turn < 5; turn++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }

    runFramesAt(300);
    expect(component.frame()).toEqual({ round: 0, elapsed: 300 - blow.holdMs });
    expect(component.sprites()).toEqual([]);
    expect(drawnOnStage()).toBeGreaterThan(0);
    expect(component.sceneFrame().floor.every((mark) => Math.abs(mark.x) < 1 && Math.abs(mark.y) < 1)).toBe(true);
    expect(shown.at(-1)).toBe(component.sceneFrame());

    runFramesAt(600);
    expect(component.frame()).toEqual({ round: 0, elapsed: 600 - blow.holdMs });
  });

  it('plays it again from the start each round', () => {
    const preset = presetOf('burst');
    show(preset);
    const period = 1000 + effectBlowsOf(preset)[0].holdMs + sceneLingerMsOf(preset) + EFFECT_PREVIEW_REST_MS;

    runFramesAt(period + 300);

    expect(component.frame().round).toBe(1);
    expect(drawnOnStage()).toBeGreaterThan(0);
  });

  it('draws nothing in the rest between rounds, once what it leaves has cleared', () => {
    const preset = presetOf('burst');
    show(preset);

    runFramesAt(1000 + effectBlowsOf(preset)[0].holdMs + sceneLingerMsOf(preset) + EFFECT_PREVIEW_REST_MS / 2);

    expect(drawnOnStage()).toBe(0);
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

    runFramesAt(120);

    const frame = component.sceneFrame();
    const points = [...frame.motes, ...frame.ribbons.flatMap((ribbon) => ribbon.points)];
    expect(points.some((point) => point.x < -20 && point.y > 10)).toBe(true);
  });

  it('draws a look still drawn over the table over the little board, as it always was', () => {
    const run = presetOf('burst');
    run.stages = JSON.stringify([
      { role: 'impact', kind: 'frost', durationMs: 800 },
      { role: 'field', kind: 'dissolve', durationMs: 200 },
    ]);
    show(run);

    runFramesAt(300);

    expect(component.inScene()).toBe(false);
    expect(drawnOnStage()).toBe(0);
    expect(component.sprites().length + component.canvases().length).toBeGreaterThan(0);
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
    expect(drawnOnStage()).toBeGreaterThan(0);
  });
});
