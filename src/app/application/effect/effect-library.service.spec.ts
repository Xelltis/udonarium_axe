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

  it('says a deleted default is coming back before it is made again under its own identifier', () => {
    service.restoreDefaults();
    const seed = DEFAULT_EFFECT_PRESET_SEEDS[0];
    service.get(seed.identifier)!.destroy();
    const announce = vi.spyOn(ObjectStore.instance, 'announceComingBack');

    service.restoreDefaults();

    expect(announce).toHaveBeenCalledWith([seed.identifier]);
    expect(service.get(seed.identifier)).toBeTruthy();
    announce.mockRestore();
  });

  it('can rebuild what was deleted', () => {
    service.restoreDefaults();
    const seed = DEFAULT_EFFECT_PRESET_SEEDS[0];
    service.get(seed.identifier)!.destroy();

    const result = service.restoreDefaults();

    expect(result.added).toBe(1);
    expect(service.presets().some((preset) => preset.name === seed.name)).toBe(true);
  });

  describe('adding the defaults a room does not have', () => {
    function written(): Record<string, string> {
      return Object.fromEntries(
        service.presets().map((preset) => [preset.identifier, JSON.stringify(preset.toContext())])
      );
    }

    it('builds every default in a room that has none', () => {
      expect(service.addMissingDefaults()).toBe(DEFAULT_EFFECT_PRESET_SEEDS.length);
      expect(service.presets()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
    });

    it('builds only the defaults that are missing, as a room saved before they were bundled lacks them', () => {
      service.restoreDefaults();
      const [first, second] = DEFAULT_EFFECT_PRESET_SEEDS;
      ObjectStore.instance.remove(service.get(first.identifier)!);
      ObjectStore.instance.remove(service.get(second.identifier)!);
      const before = written();

      expect(service.addMissingDefaults()).toBe(2);

      expect(service.presets()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
      expect(service.get(first.identifier)?.name).toBe(first.name);
      expect(service.get(second.identifier)?.name).toBe(second.name);
      expect(written()).toMatchObject(before);
    });

    it('leaves a default the table adjusted, and an effect of the table’s own, exactly as they are', () => {
      service.restoreDefaults();
      const [missing, adjusted] = DEFAULT_EFFECT_PRESET_SEEDS;
      ObjectStore.instance.remove(service.get(missing.identifier)!);
      const preset = service.get(adjusted.identifier)!;
      preset.name = '書き換えた名前';
      preset.scale = 99;
      preset.colorPrimary = '#123456';
      const own = service.create('卓のエフェクト');
      const before = written();
      const update = vi.spyOn(preset, 'update');

      service.addMissingDefaults();

      expect(written()).toMatchObject(before);
      expect(service.get(adjusted.identifier)?.name).toBe('書き換えた名前');
      expect(service.get(own.identifier)).toBe(own);
      expect(update).not.toHaveBeenCalled();
    });

    it('builds nothing the second time', () => {
      service.restoreDefaults();
      ObjectStore.instance.remove(service.get(DEFAULT_EFFECT_PRESET_SEEDS[0].identifier)!);
      service.addMissingDefaults();
      const before = written();

      expect(service.addMissingDefaults()).toBe(0);

      expect(written()).toEqual(before);
    });

    it('brings back a default the table deleted, under its own identifier, saying first that it is coming back', () => {
      service.restoreDefaults();
      const seed = DEFAULT_EFFECT_PRESET_SEEDS[0];
      service.get(seed.identifier)!.destroy();
      const before = written();
      const announce = vi.spyOn(ObjectStore.instance, 'announceComingBack');

      expect(service.addMissingDefaults()).toBe(1);

      expect(announce).toHaveBeenCalledWith([seed.identifier]);
      expect(service.get(seed.identifier)?.name).toBe(seed.name);
      expect(service.presets()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
      expect(written()).toMatchObject(before);
      expect(service.addMissingDefaults()).toBe(0);
      announce.mockRestore();
    });
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

  it('names a preset already in the room to a player only where it is not kept for the game master', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    const secret = service.create('伏せ札の演出');
    secret.gmOnly = true;
    const open = service.create('炎の壁');

    expect(service.shownPreset(secret.identifier)).toBeNull();
    expect(service.isShown(secret)).toBe(false);
    expect(service.shownPreset(open.identifier)).toBe(open);
    expect(service.shownPreset('gone')).toBeNull();

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    expect(service.shownPreset(secret.identifier)).toBe(secret);

    PeerCursor.myCursor.role = PeerRole.Player;
  });
});
