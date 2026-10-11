import { TestBed } from '@angular/core/testing';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectFieldService', () => {
  let service: EffectFieldService;
  let preset: EffectPreset;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(EffectFieldService);

    preset = new EffectPreset();
    preset.name = '毒沼';
    preset.kind = 'miasma';
    preset.durationMs = 1000;
    preset.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('leaves the field standing on the board', () => {
    const field = service.place(preset, 100, 200, 0);

    expect(service.fields()).toEqual([field]);
    expect(service.presetOf(field)).toBe(preset);
    expect(field.isVisibleOnTable).toBe(true);
  });

  it('loops the effect over its own length', () => {
    service.place(preset, 0, 0, 0);

    const early = service.renderables(100)[0];
    const wrapped = service.renderables(1100)[0];

    // The effect never ends, so the elapsed time is folded back into its length.
    expect(early.elapsed).toBeLessThan(preset.duration);
    expect(wrapped.elapsed).toBeCloseTo(early.elapsed);
  });

  it('gives two fields side by side different motion', () => {
    // A field's offset comes from its identifier, and two random ones fall on the same moment of a
    // one-second loop about once in a thousand runs; these two never do.
    let drawn = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-00000000000${++drawn}`);
    service.place(preset, 0, 0, 0);
    service.place(preset, 100, 0, 0);

    const [first, second] = service.renderables(0);

    expect(first.elapsed).not.toBe(second.elapsed);
  });

  it('disappears when cleared away', () => {
    const field = service.place(preset, 0, 0, 0);

    service.remove(field);

    expect(service.fields()).toHaveLength(0);
    expect(service.renderables(0)).toHaveLength(0);
  });

  it('draws nothing once its preset is gone', () => {
    service.place(preset, 0, 0, 0);
    ObjectStore.instance.remove(preset);

    expect(service.renderables(0)).toHaveLength(0);
  });

  it('draws nothing while motion is off', () => {
    service.place(preset, 0, 0, 0);
    TestBed.inject(MotionService).setting.set('off');

    // A field never ends, so drawing on would ignore the setting for good.
    expect(service.renderables(0)).toHaveLength(0);
  });
});
