import { TestBed } from '@angular/core/testing';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectFrameService } from '@axe/application/effect/effect-frame.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EMPTY_EFFECT_FRAME } from '@axe/domain/effect/scene/effect-scene';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/scene-kinds';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectFrameService', () => {
  let service: EffectFrameService;
  let fields: EffectFieldService;
  let playback: EffectPlaybackService;
  let motion: MotionService;
  let preset: EffectPreset;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    motion = TestBed.inject(MotionService);
    motion.setting.set('on');
    await TestBed.inject(EffectSceneLooksService).load();
    service = TestBed.inject(EffectFrameService);
    fields = TestBed.inject(EffectFieldService);
    playback = TestBed.inject(EffectPlaybackService);
    preset = new EffectPreset();
    preset.kind = 'burst';
    preset.durationMs = 600;
    preset.initialize();
  });

  afterEach(() => {
    motion.setting.set('auto');
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  /** Sets the clock to where a field has played the given time, from its own moment. */
  function atPlayed(field: EffectField, playedMs: number): void {
    playback.now.set(playedMs - field.phaseOffset);
  }

  it('draws nothing with nothing playing and nothing left standing', () => {
    expect(service.frame()).toBe(EMPTY_EFFECT_FRAME);
  });

  it('draws an effect left standing on the table in the scene, round after round', () => {
    const field = fields.place(preset, 100, 200, 0);

    atPlayed(field, 300);

    const drawn = service.frame();
    expect(drawn.motes.length).toBeGreaterThan(0);
    expect(drawn.floor.length).toBeGreaterThan(0);
  });

  it('sets each round off before the last has died down, and keeps what the earlier ones left clearing', () => {
    const field = fields.place(preset, 100, 200, 0);
    const cast = fields.renderables(0)[0].cast;
    const cellPx = TestBed.inject(TabletopService).gridSize();
    const every = preset.duration * 0.75;
    const rounds = nothingStaged();
    for (let elapsed = 10; elapsed < preset.duration + sceneLingerMsOf(preset); elapsed += every) {
      stageEffect(preset, cast, elapsed, { cellPx }, rounds);
    }
    const roundAlone = nothingStaged();
    stageEffect(preset, cast, 10, { cellPx }, roundAlone);

    atPlayed(field, every * 100 + 10);

    const drawn = service.frame();
    expect(roundAlone.motes.some((mote) => mote.shape === 'smoke')).toBe(false);
    expect(drawn.motes).toHaveLength(rounds.motes.length);
    expect(drawn.floor).toHaveLength(rounds.floor.length);
    expect(drawn.motes.some((mote) => mote.shape === 'smoke')).toBe(true);
  });

  it('draws nothing of a field while motion is off', () => {
    const field = fields.place(preset, 100, 200, 0);
    motion.setting.set('off');

    atPlayed(field, 300);

    expect(service.frame()).toBe(EMPTY_EFFECT_FRAME);
  });
});
