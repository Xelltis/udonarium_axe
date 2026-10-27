import { TestBed } from '@angular/core/testing';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BattleScene } from '@axe/domain/battle/battle-scene';
import { GameCharacter } from '@axe/domain/character/game-character';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { BattleCutInReceiverService } from '@axe/features/battle-cut-in/battle-cut-in-receiver.service';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleCutInReceiverService', () => {
  let receiver: BattleCutInReceiverService;
  let state: BattleCutInStateService;
  let preference: BattleCutInPreferenceService;
  let cast: { playHere: ReturnType<typeof vi.fn> };
  let hero: GameCharacter;
  let goblin: GameCharacter;

  function sceneOf(defeated: boolean): BattleScene {
    const fighter = (piece: GameCharacter, down = false) => ({
      identifier: piece.identifier,
      name: piece.name,
      image: '',
      gauges: [],
      defeated: down,
    });
    return {
      key: `scene-${Math.random()}`,
      attackerSide: 'left',
      attacker: fighter(hero),
      defenders: [fighter(goblin, defeated)],
      effect: 'EffectPreset_slash_1',
      defeatEffect: 'EffectPreset_defeat_dissolve',
      background: '',
      theme: 'fantasy',
      secret: false,
      seed: 3,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    cast = { playHere: vi.fn() };
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(EffectCastService, { useValue: cast });
    receiver = TestBed.inject(BattleCutInReceiverService);
    state = TestBed.inject(BattleCutInStateService);
    preference = TestBed.inject(BattleCutInPreferenceService);
    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) createEffectPreset(seed, seed.identifier);
    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
  });

  afterEach(() => {
    vi.useRealTimers();
    state.clear();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('puts a scene played here on the stage', () => {
    receiver.receive(sceneOf(false));

    expect(state.current()?.scene.attacker.name).toBe('勇者');
    expect(cast.playHere).not.toHaveBeenCalled();
  });

  it('passes over a scene that cannot be read', () => {
    receiver.receive({ attacker: null });

    expect(state.active()).toBe(false);
  });

  it('plays the blow on the table, and the going down after it lands, for a reader who turned the stage off', () => {
    vi.useFakeTimers();
    preference.setShown(false);

    receiver.receive(sceneOf(true));

    expect(state.active()).toBe(false);
    expect(cast.playHere).toHaveBeenCalledTimes(1);
    const [blow, struck, striker] = cast.playHere.mock.calls[0];
    expect(blow.identifier).toBe('EffectPreset_slash_1');
    expect(struck).toEqual([goblin]);
    expect(striker).toBe(hero);

    vi.runAllTimers();
    expect(cast.playHere).toHaveBeenCalledTimes(2);
    expect(cast.playHere.mock.calls[1][0].identifier).toBe('EffectPreset_defeat_dissolve');
  });
});
