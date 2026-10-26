import { TestBed } from '@angular/core/testing';
import { EffectAutoPlayService } from '@axe/application/effect/effect-auto-play.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ResourceChange } from '@axe/domain/character/resource-change';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { autoEffectIdentifier } from '@axe/domain/effect/resource-effect-map';
import { refuseLocalStorage, refuseLocalStorageOutright } from '@axe/testing/refused-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectAutoPlayService', () => {
  let service: EffectAutoPlayService;
  let playback: { play: ReturnType<typeof vi.fn> };
  let character: GameCharacter;

  function change(kind: 'damage' | 'heal', ratio: number): ResourceChange {
    return {
      identifier: 'HP',
      name: 'HP',
      kind,
      delta: kind === 'damage' ? -10 : 10,
      label: '-10',
      ratio,
      playsEffect: true,
      playsSound: false,
      soundSet: 'flesh',
    };
  }

  beforeEach(() => {
    localStorage.clear();
    playback = { play: vi.fn().mockReturnValue({}) };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(EffectPlaybackService, { useValue: playback });
    service = TestBed.inject(EffectAutoPlayService);

    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) createEffectPreset(seed, seed.identifier);
    character = GameCharacter.create('的', 1, '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
    localStorage.clear();
  });

  it('stays off by default', () => {
    // Tables differ on this, so nothing appears unasked.
    expect(service.enabled()).toBe(false);
    expect(service.play(character, [change('damage', 0.5)])).toBe(false);
    expect(playback.play).not.toHaveBeenCalled();
  });

  it('picks an effect to match the size of the change once turned on', () => {
    service.setEnabled(true);

    expect(service.play(character, [change('damage', 0.5)])).toBe(true);
    expect(playback.play.mock.calls[0][0].presetIdentifier).toBe(autoEffectIdentifier('damage', 'large'));

    expect(service.play(character, [change('heal', 0.05)])).toBe(true);
    expect(playback.play.mock.calls[1][0].presetIdentifier).toBe(autoEffectIdentifier('heal', 'small'));
  });

  it('shows the damage when damage and healing arrive together', () => {
    service.setEnabled(true);

    service.play(character, [change('heal', 0.5), change('damage', 0.5)]);

    expect(playback.play.mock.calls[0][0].presetIdentifier).toBe(autoEffectIdentifier('damage', 'large'));
  });

  it('does nothing when nothing changed', () => {
    service.setEnabled(true);

    expect(service.play(character, [])).toBe(false);
  });

  it('remembers the setting', () => {
    service.setEnabled(true);

    expect(localStorage.getItem('axe.effect.autoPlay')).toBe('on');
    expect(TestBed.inject(EffectAutoPlayService).enabled()).toBe(true);
  });

  it('starts off and still turns on where the browser refuses to keep the choice', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    refuseLocalStorage();
    const refused = TestBed.inject(EffectAutoPlayService);

    expect(refused.enabled()).toBe(false);
    refused.setEnabled(true);
    expect(refused.enabled()).toBe(true);
  });

  it('starts where the browser refuses to hand over its storage at all', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    refuseLocalStorageOutright();

    expect(TestBed.inject(EffectAutoPlayService).enabled()).toBe(false);
  });
});
