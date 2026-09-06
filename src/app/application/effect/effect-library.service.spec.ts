import { TestBed } from '@angular/core/testing';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectLibraryService', () => {
  let service: EffectLibraryService;

  function clearPresets(): void {
    for (const preset of ObjectStore.instance.getObjects<EffectPreset>(EffectPreset)) {
      ObjectStore.instance.remove(preset);
    }
  }

  beforeEach(() => {
    // The store is shared, and a spec that left presets behind would make these read as already restored.
    clearPresets();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(EffectLibraryService);
  });

  afterEach(() => clearPresets());

  it('builds the whole default set when there is nothing', () => {
    const result = service.restoreDefaults();

    expect(result.added).toBe(DEFAULT_EFFECT_PRESET_SEEDS.length);
    expect(result.updated).toBe(0);
    expect(service.presets()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
  });

  it('refreshes what is already there instead of rebuilding it', () => {
    service.restoreDefaults();
    const seed = DEFAULT_EFFECT_PRESET_SEEDS[0];
    const preset = service.get(seed.identifier)!;
    preset.name = '書き換えた名前';
    preset.scale = 99;

    const result = service.restoreDefaults();

    // A preset with a fixed identifier cannot be rebuilt on joining,
    // so without a refresh here it would keep its old values.
    expect(result.added).toBe(0);
    expect(result.updated).toBe(DEFAULT_EFFECT_PRESET_SEEDS.length);
    expect(service.presets()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
    expect(service.get(seed.identifier)?.name).toBe(seed.name);
    expect(service.get(seed.identifier)?.scale).toBe(seed.scale);
  });

  it('can rebuild what was deleted', () => {
    service.restoreDefaults();
    const seed = DEFAULT_EFFECT_PRESET_SEEDS[0];
    service.get(seed.identifier)!.destroy();

    const result = service.restoreDefaults();

    expect(result.added).toBe(1);
    expect(service.presets().some((preset) => preset.name === seed.name)).toBe(true);
  });

  it('can build one from nothing', () => {
    const preset = service.create('新しいエフェクト');

    expect(service.get(preset.identifier)).toBe(preset);
    expect(preset.name).toBe('新しいエフェクト');
  });

  it('gives a copy a name of its own', () => {
    const source = service.create('爆炎');
    source.scale = 2.5;
    source.kind = 'flame';

    const copy = service.duplicate(source);

    expect(copy.identifier).not.toBe(source.identifier);
    expect(copy.name).toBe('爆炎 (2)');
    expect(copy.kind).toBe('flame');
    expect(copy.scale).toBe(2.5);
    expect(service.duplicate(source).name).toBe('爆炎 (3)');
  });

  it('drops a deleted preset from the list', () => {
    const preset = service.create('消すもの');

    service.remove(preset);

    expect(service.get(preset.identifier)).toBeNull();
  });

  it('keeps a game-master-only preset from a player even by name', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    const secret = service.create('伏せ札の演出');
    secret.gmOnly = true;

    // Hiding it from the list would still leave it castable from chat by anyone who knows the name.
    expect(service.findByName('伏せ札の演出')).toBeNull();

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    expect(service.findByName('伏せ札の演出')).toBe(secret);

    PeerCursor.myCursor.role = PeerRole.Player;
  });
});
