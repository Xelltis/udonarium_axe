import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import { DEFAULT_STATUS_AILMENTS } from '@axe/domain/character/builtin-status-ailments';
import { curseLookOf } from '@axe/domain/effect/ailment-looks';
import {
  applyEffectPresetSeed,
  createDefaultEffectPresets,
  createEffectPreset,
  DEFAULT_EFFECT_PRESET_SEEDS,
} from '@axe/domain/effect/builtin-effect-presets';
import { PROJECTILE_STYLES } from '@axe/domain/effect/effect-kind';
import { EFFECT_KINDS } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { stagedEffectDuration } from '@axe/domain/effect/effect-stage-timeline';
import { PresetSound } from '@axe/domain/media/sound-effect';

describe('the effects that come with the tool', () => {
  it('uses every built-in animation in at least one of them', () => {
    const used = new Set(DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.kind));

    for (const kind of EFFECT_KINDS) expect(used.has(kind)).toBe(true);
  });

  it('gives each family a grade from the lowest to the highest', () => {
    const gradesOf = (kinds: string[]) =>
      DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => kinds.includes(seed.kind))
        .map((seed) => seed.grade)
        .sort();

    for (const family of [
      ['flame', 'burst', 'nova', 'mushroom'],
      ['impact', 'rubble', 'upheaval'],
      ['bolt'],
      ['frost'],
      ['heal'],
      ['slash'],
    ]) {
      expect(new Set(gradesOf(family))).toEqual(new Set([1, 2, 3]));
    }
  });

  it('makes the higher grades larger', () => {
    for (const kind of ['bolt', 'frost', 'heal', 'slash']) {
      // There may be several of a grade, so the largest of each is compared.
      const largestOf = (grade: number) =>
        Math.max(
          ...DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.kind === kind && seed.grade === grade).map(
            (seed) => seed.scale
          )
        );

      expect(largestOf(2)).toBeGreaterThan(largestOf(1));
      expect(largestOf(3)).toBeGreaterThan(largestOf(2));
    }
  });

  it('runs each effect as long as its sound', () => {
    // A run built of stages keeps its own clock: it is as long as its stages take.
    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => !seed.stages)) {
      const preset = createEffectPreset(seed);
      try {
        // Ending sooner leaves the sound playing over nothing, which drags.
        // A projectile alone would be slowed by that, so its length is given outright.
        expect(preset.duration).toBe(clamp(seed.durationMs ?? seed.soundMs, 400, 6000));
      } finally {
        ObjectStore.instance.remove(preset);
      }
    }
  });

  it('gives a projectile a sound for the shot and another for the landing', () => {
    const flying = DEFAULT_EFFECT_PRESET_SEEDS.filter(
      (seed) => !seed.stages && (seed.kind === 'projectile' || seed.kind === 'arc')
    );

    expect(flying.length).toBeGreaterThan(0);
    for (const seed of flying) {
      // The shot alone does not land and the landing alone was never fired.
      expect(seed.impactSoundKey).toBeDefined();
      expect(seed.durationMs).toBeDefined();
    }
  });

  describe('the runs built of stages', () => {
    const staged = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.stages);

    it('puts a few on the shelf, so what the editor can do is not only in the manual', () => {
      expect(staged.length).toBeGreaterThan(0);
    });

    it('builds every one of them out of looks that were already there', () => {
      for (const seed of staged) {
        for (const stage of seed.stages ?? []) {
          expect(EFFECT_KINDS).toContain(stage.kind);
          for (const child of stage.children ?? []) expect(EFFECT_KINDS).toContain(child.kind);
        }
      }
    });

    it('runs each of them for as long as its stages take', () => {
      for (const seed of staged) {
        const preset = createEffectPreset(seed);
        try {
          expect(preset.isStaged).toBe(true);
          expect(preset.duration).toBe(stagedEffectDuration(preset.stageList));
        } finally {
          ObjectStore.instance.remove(preset);
        }
      }
    });

    it('throws no branch that throws again', () => {
      for (const seed of staged) {
        for (const stage of seed.stages ?? []) {
          for (const child of stage.children ?? []) expect(child.role).not.toBe('spawn');
        }
      }
    });
  });

  it('ends the highest grade of fire in a mushroom cloud', () => {
    const top = DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.kind === 'mushroom');

    expect(top?.name).toBe('業火');
    expect(top?.grade).toBe(3);
  });

  it('gives each family a sound of its own', () => {
    const soundOf = (kind: string) =>
      new Set(DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.kind === kind).map((seed) => seed.soundKey));

    // Ice and lightning sharing one sound leaves the ear unable to tell them apart.
    expect([...soundOf('frost')].some((sound) => [...soundOf('bolt')].includes(sound))).toBe(false);
    expect(DEFAULT_EFFECT_PRESET_SEEDS.every((seed) => seed.soundKey.length > 0)).toBe(true);
  });

  it('gives each a fixed identifier of its own', () => {
    const identifiers = DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.identifier);

    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(identifiers.every((identifier) => identifier.startsWith('EffectPreset_'))).toBe(true);
  });

  it('registers each under that identifier and gives it its sound', () => {
    PresetSound.slashSmall = 'se-slash-small';
    const created = createDefaultEffectPresets();

    try {
      expect(created.map((preset) => preset.identifier)).toEqual(
        DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.identifier)
      );
      const slash = ObjectStore.instance.get<EffectPreset>('EffectPreset_slash_1');
      expect(slash?.name).toBe('斬撃');
      expect(slash?.soundIdentifier).toBe('se-slash-small');
    } finally {
      for (const preset of created) ObjectStore.instance.remove(preset);
      PresetSound.slashSmall = '';
    }
  });

  it('puts even the flags you changed back when the seed is applied again', () => {
    const preset = new EffectPreset('preset');
    preset.gmOnly = true;
    preset.followTarget = false;
    preset.moteStyle = 'haze';

    applyEffectPresetSeed(preset, DEFAULT_EFFECT_PRESET_SEEDS[0]);

    // A field that survives the reset leaves the old behaviour on a table you meant to fix.
    expect(preset.gmOnly).toBe(false);
    expect(preset.followTarget).toBe(true);
    expect(preset.moteStyle).toBe('');
  });
});

describe('the effects of the states a room starts with', () => {
  const seedNamed = (name: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name);

  it('has one under the name of every state in the catalogue, so that putting the state on finds it', () => {
    for (const ailment of DEFAULT_STATUS_AILMENTS) {
      const seed = seedNamed(ailment.name);

      expect(seed?.kind, ailment.name).toBe('curse');
      expect(
        DEFAULT_EFFECT_PRESET_SEEDS.filter((other) => other.name === ailment.name),
        ailment.name
      ).toHaveLength(1);
    }
  });

  it('draws each as the state it is named for, and a paralysis under the name it always had', () => {
    const lookOf = (name: string) => curseLookOf(createSeedOf(name));

    expect(Object.fromEntries(DEFAULT_STATUS_AILMENTS.map((ailment) => [ailment.name, lookOf(ailment.name)]))).toEqual({
      毒: 'poison',
      出血: 'bleed',
      燃焼: 'burn',
      麻痺: 'shock',
      睡眠: 'sleep',
      石化: 'petrify',
      混乱: 'confuse',
      魅了: 'charm',
      恐怖: 'fear',
      暗闇: 'blind',
      沈黙: 'silence',
      鈍足: 'slow',
    });
    expect(lookOf('拘束')).toBe('bind');
    expect(lookOf('呪い')).toBe('curse');
    expect(seedNamed('麻痺')?.moteStyle).toBe('arc');
  });

  it('keeps the identifiers of those that were there before', () => {
    expect(['麻痺', '睡眠', '拘束', '呪い', '石化'].map((name) => seedNamed(name)?.identifier)).toEqual([
      'EffectPreset_status_paralysis',
      'EffectPreset_status_sleep',
      'EffectPreset_status_bind',
      'EffectPreset_status_curse',
      'EffectPreset_status_petrify',
    ]);
  });

  it('leaves the poison over an area as the miasma it was', () => {
    expect(seedNamed('毒霧')).toMatchObject({ kind: 'miasma', identifier: 'EffectPreset_miasma_2' });
  });

  function createSeedOf(name: string): EffectPreset {
    const preset = new EffectPreset(`seed-of-${name}`);
    applyEffectPresetSeed(preset, seedNamed(name)!);
    return preset;
  }
});

describe('the newer looks for a projectile', () => {
  const seedOf = (identifier: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.identifier === identifier)!;

  it('sends a flying cut as a crescent that flies, cuts and is done', () => {
    const seed = seedOf('EffectPreset_crescent_wave');

    expect(seed).toMatchObject({ kind: 'projectile', projectileStyle: 'crescent', impactKind: 'slash' });
    expect(seed.soundKey).toBe('slashIai');
    expect(seed.impactSoundKey).toBe('slashLarge');
  });

  it('fires a blaster in a burst, each shot landing', () => {
    const seed = seedOf('EffectPreset_blaster_bolt');

    expect(seed).toMatchObject({ kind: 'projectile', projectileStyle: 'blaster' });
    expect(seed.shots).toBeGreaterThan(1);
    expect(seed.shotInterval).toBeGreaterThan(0);
    expect(seed.soundKey).toBe('sfShot');
    expect(seed.impactSoundKey).toBe('sfHit');
  });

  it('fires it as a single shot as well', () => {
    const single = seedOf('EffectPreset_blaster_single');

    expect(single).toMatchObject({ projectileStyle: 'blaster', soundKey: 'sfShot' });
    expect(single.shots ?? 1).toBe(1);
  });

  it('sends a flying combination as crescents one after another', () => {
    const combo = seedOf('EffectPreset_crescent_combo');

    expect(combo).toMatchObject({ projectileStyle: 'crescent', impactKind: 'slash' });
    expect(combo.shots).toBeGreaterThan(1);
  });

  it('gives a sword of light time to gather before it falls', () => {
    const blade = seedOf('EffectPreset_skyblade');

    expect(blade.kind).toBe('skyblade');
    expect(blade.durationMs).toBeGreaterThan(1200);
    expect(blade.soundKey).toBe('holyBlade');
    expect(blade.tagName).toBe('聖');
  });

  it('gives a beam time to keep firing', () => {
    const laser = seedOf('EffectPreset_laser_sustained');

    expect(laser.kind).toBe('raybeam');
    expect(laser.soundKey).toBe('sfBeam');
    expect(laser.durationMs).toBeGreaterThan(seedOf('EffectPreset_blaster_single').durationMs!);
  });

  it('sends a snipers shot alone, and faster than anything else', () => {
    const sniper = seedOf('EffectPreset_sniper_shot');

    expect(sniper).toMatchObject({ kind: 'projectile', projectileStyle: 'tracer' });
    expect(sniper.shots ?? 1).toBe(1);
    expect(sniper.soundKey).toBe('gunRifle');
    expect(sniper.durationMs).toBeLessThan(seedOf('EffectPreset_bullet_2').durationMs!);
    expect(sniper.scale).toBeLessThan(seedOf('EffectPreset_bullet_2').scale);
  });

  it('brings the meteor down as a meteor, on up to five targets one after another, with time for its crater to cool', () => {
    const meteor = seedOf('EffectPreset_projectile_3');

    expect(meteor).toMatchObject({
      name: '流星',
      kind: 'projectile',
      projectileStyle: 'meteor',
      grade: 3,
      durationMs: 2000,
      staggerMs: 130,
      targeting: 'multi',
      maxTargets: 5,
    });
    expect(meteor.impactKind).toBeUndefined();
  });

  it('lists the newer looks among the choices', () => {
    expect([...PROJECTILE_STYLES]).toEqual(
      expect.arrayContaining(['crescent', 'blaster', 'tracer', 'missile', 'cruise', 'meteor'])
    );
  });

  it('looses arrows one at a time', () => {
    const volley = seedOf('EffectPreset_arrow_volley');

    expect(volley).toMatchObject({ kind: 'projectile', projectileStyle: 'arrow' });
    expect(volley.shots).toBeGreaterThan(1);
    expect(volley.shotInterval).toBeGreaterThan(0);
    expect(volley.soundKey).toBe('bowRelease');
    expect(volley.impactSoundKey).toBe('bowPierce');
  });

  it('brings a rain of arrows down over a wide area', () => {
    const rain = seedOf('EffectPreset_arrow_rain');

    expect(rain.kind).toBe('arrowrain');
    expect(rain.maxTargets).toBeGreaterThan(seedOf('EffectPreset_arrow_volley').maxTargets);
    expect(rain.scale).toBeGreaterThan(seedOf('EffectPreset_arrow_volley').scale);
    expect(rain.durationMs).toBeGreaterThan(1200);
  });

  it('fires small missiles in a cluster, each bursting', () => {
    const micro = seedOf('EffectPreset_micro_missile');

    expect(micro).toMatchObject({ kind: 'projectile', projectileStyle: 'missile', impactKind: 'burst' });
    expect(micro.shots).toBeGreaterThan(1);
    expect(micro.soundKey).toBe('missileLaunch');
    expect(micro.impactSoundKey).toBe('explosionSmall');
  });

  it('sends a guided missile alone and far', () => {
    const cruise = seedOf('EffectPreset_cruise_missile');

    expect(cruise).toMatchObject({ kind: 'projectile', projectileStyle: 'cruise' });
    expect(cruise.shots ?? 1).toBe(1);
    expect(cruise.soundKey).toBe('rocketLaunch');
    expect(cruise.durationMs).toBeGreaterThan(seedOf('EffectPreset_micro_missile').durationMs!);
  });

  it('ends a great sword differently, and sounds it differently, by its element', () => {
    const blades = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.kind === 'skyblade');

    expect(blades.length).toBeGreaterThan(4);
    // A sword with an element ends in that element; one of light ends as light.
    const elemental = blades.filter((seed) => seed.identifier !== 'EffectPreset_skyblade');
    expect(elemental.every((seed) => (seed.impactKind ?? '').length > 0)).toBe(true);
    expect(new Set(elemental.map((seed) => seed.impactKind)).size).toBe(elemental.length);
    expect(new Set(elemental.map((seed) => seed.impactSoundKey)).size).toBe(elemental.length);
    expect(new Set(elemental.map((seed) => seed.tagName)).size).toBe(elemental.length);
  });
});

describe('the shots and the cure that were given another look to land or to play with', () => {
  const seedOf = (identifier: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.identifier === identifier)!;

  it('lands a ball of spirit and the shots of a blaster in an impact, which leaves no soot', () => {
    expect(seedOf('EffectPreset_qigong_2')).toMatchObject({ name: '気弾', impactKind: 'impact', soundKey: 'qigong' });
    for (const identifier of ['EffectPreset_blaster_single', 'EffectPreset_blaster_bolt']) {
      expect(seedOf(identifier)).toMatchObject({ impactKind: 'impact', soundKey: 'sfShot', impactSoundKey: 'sfHit' });
    }
  });

  it('plays the cure of states as a healing, as long as its sound', () => {
    const cure = seedOf('EffectPreset_status_cure');

    expect(cure).toMatchObject({ name: '状態回復', tagName: '回復', kind: 'heal', soundKey: 'statusCure' });
    expect(cure.durationMs).toBeUndefined();
  });

  it('names the particles of a cleansing for the two that cleanse, and for no other healing', () => {
    const healings = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.kind === 'heal');
    const cleansing = healings.filter((seed) => seed.moteStyle === 'cleanse').map((seed) => seed.name);

    expect(cleansing.sort()).toEqual(['状態回復', '状態治療'].sort());
    for (const seed of healings) expect(['', 'cleanse']).toContain(seed.moteStyle ?? '');
  });
});

describe('the holy family', () => {
  const holy = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.tagName === '聖');
  const seedOf = (identifier: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.identifier === identifier)!;

  it('takes in the shot, the breath and the great sword of light that were there before, as they were', () => {
    expect(seedOf('EffectPreset_holybolt_3')).toMatchObject({ name: '聖光弾', tagName: '聖', kind: 'projectile' });
    expect(seedOf('EffectPreset_breath_holy')).toMatchObject({ name: '聖なる吐息', tagName: '聖', kind: 'breath' });
    expect(seedOf('EffectPreset_skyblade')).toMatchObject({ name: '光の大剣', tagName: '聖', kind: 'skyblade' });
    for (const seed of holy) expect(seed.moteStyle ?? '').toBe('');
  });

  it('lands the shot and the great sword of light in light that smites, not in a blast of fire', () => {
    expect(seedOf('EffectPreset_holybolt_3')).toMatchObject({ impactKind: 'smite', impactSoundKey: 'explosionSmall' });
    expect(seedOf('EffectPreset_skyblade')).toMatchObject({ impactKind: 'smite', impactSoundKey: 'explosionLarge' });
  });

  it('has an attack for every part an element plays, eight in all', () => {
    expect(holy.map((seed) => seed.name).sort()).toEqual(
      ['聖光弾', '聖なる吐息', '光の大剣', '聖印', '裁きの光', '光輪', '聖域', '天罰'].sort()
    );
    expect(seedOf('EffectPreset_smite_1')).toMatchObject({
      name: '聖印',
      kind: 'smite',
      grade: 1,
      targeting: 'single',
    });
    expect(seedOf('EffectPreset_smite_2')).toMatchObject({
      name: '裁きの光',
      kind: 'smite',
      grade: 2,
      targeting: 'multi',
    });
    expect(seedOf('EffectPreset_halo_2')).toMatchObject({ name: '光輪', kind: 'halo', grade: 2, targeting: 'single' });
    expect(seedOf('EffectPreset_sanctuary_3')).toMatchObject({
      name: '聖域',
      kind: 'sanctuary',
      grade: 3,
      areaRadius: 3,
    });
    expect(seedOf('EffectPreset_smite_3')).toMatchObject({ name: '天罰', kind: 'smite', grade: 3, areaRadius: 3 });
    expect(seedOf('EffectPreset_smite_2').areaRadius ?? 0).toBe(0);
    expect(seedOf('EffectPreset_smite_2').maxTargets).toBeGreaterThan(1);
  });

  it('strikes all that an attack over an area takes in at once, and those picked one by one in turn', () => {
    expect(seedOf('EffectPreset_sanctuary_3').staggerMs).toBe(0);
    expect(seedOf('EffectPreset_smite_3').staggerMs).toBe(0);
    expect(seedOf('EffectPreset_smite_2').staggerMs).toBeGreaterThan(150);
  });

  it('sounds none of its attacks as a healing or as thunder', () => {
    const attacks = holy.filter((seed) => ['smite', 'halo', 'sanctuary'].includes(seed.kind));

    expect(attacks.length).toBe(5);
    for (const seed of attacks) {
      for (const sound of [seed.soundKey, seed.impactSoundKey ?? '']) expect(sound).not.toMatch(/^(cure|heal|thunder)/);
    }
  });
});

describe('the family of lightning', () => {
  const seedOf = (name: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!;

  it('has an attack for every part an element plays, eight in all, its shot among the shots', () => {
    const parts = ['雷弾', '電撃', '落雷', '電流', '連鎖雷', '雷帝', '雷のブレス', '雷の大剣'];

    for (const name of parts) expect([name, seedOf(name) !== undefined]).toEqual([name, true]);
    expect(parts.filter((name) => seedOf(name).tagName === '雷')).toHaveLength(7);
    expect(seedOf('雷弾').tagName).toBe('射撃');
  });

  it('sends the shot as a bolt that lands in a bolt of lightning, under an identifier of its own', () => {
    expect(seedOf('雷弾')).toMatchObject({
      identifier: 'EffectPreset_stormbolt_2',
      kind: 'projectile',
      impactKind: 'bolt',
      grade: 2,
      targeting: 'multi',
      soundKey: 'thunderSmall',
      impactSoundKey: 'thunderBolt',
      durationMs: 850,
    });
    expect(seedOf('雷弾').projectileStyle ?? 'bolt').toBe('bolt');
    expect(seedOf('雷弾').moteStyle ?? '').toBe('');
  });

  it('tells the chain from the current by how many it may strike, and gives both a beat between their targets', () => {
    expect(seedOf('連鎖雷').maxTargets).toBeGreaterThan(seedOf('電流').maxTargets);
    expect(seedOf('連鎖雷').staggerMs).toBeGreaterThanOrEqual(100);
    expect(seedOf('電流').staggerMs).toBeGreaterThanOrEqual(50);
  });

  it('sounds each landing as the lightning strikes', () => {
    const preset = createEffectPreset(seedOf('電流'));
    try {
      expect(preset.impactSoundAt).toBeCloseTo(0.1);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});

describe('the dark family', () => {
  const dark = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.tagName === '闇');
  const seedOf = (identifier: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.identifier === identifier)!;

  it('has an attack for every part an element plays in it, beside its curse', () => {
    expect(dark.map((seed) => seed.name).sort()).toEqual(
      ['呪い', '暗黒のブレス', '闇の大剣', '生命吸収', '影の棘', '暗黒球', '奈落', '蝕'].sort()
    );
    expect(seedOf('EffectPreset_shadow_1')).toMatchObject({
      name: '影の棘',
      kind: 'shadow',
      grade: 1,
      targeting: 'single',
    });
    expect(seedOf('EffectPreset_darkorb_2')).toMatchObject({
      name: '暗黒球',
      kind: 'darkorb',
      grade: 2,
      targeting: 'multi',
    });
    expect(seedOf('EffectPreset_shadow_3')).toMatchObject({ name: '奈落', kind: 'shadow', grade: 3, areaRadius: 3 });
    expect(seedOf('EffectPreset_darkorb_3')).toMatchObject({ name: '蝕', kind: 'darkorb', grade: 3, areaRadius: 3 });
    expect(seedOf('EffectPreset_darkorb_2').areaRadius ?? 0).toBe(0);
    expect(seedOf('EffectPreset_darkorb_2').maxTargets).toBeGreaterThan(1);
  });

  it('strikes all that an attack over an area takes in at once, and those picked one by one in turn', () => {
    expect(seedOf('EffectPreset_shadow_3').staggerMs).toBe(0);
    expect(seedOf('EffectPreset_darkorb_3').staggerMs).toBe(0);
    expect(seedOf('EffectPreset_darkorb_2').staggerMs).toBeGreaterThan(150);
  });

  it('gives each of its four new attacks a sound of its own', () => {
    const sounds = ['shadow_1', 'darkorb_2', 'shadow_3', 'darkorb_3'].map(
      (key) => seedOf(`EffectPreset_${key}`).soundKey
    );

    expect(new Set(sounds).size).toBe(4);
  });
});

describe('the family of earth', () => {
  const seedOf = (name: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!;

  it('has an attack for every part an element plays, eight in all, its shot among the shots', () => {
    const parts = ['衝撃波', '岩石破砕', '地割れ', '地隆', '大地震', '砂塵のブレス', '大地の大剣'];

    for (const name of ['岩弾', ...parts]) expect([name, seedOf(name) !== undefined]).toEqual([name, true]);
    expect(parts.map((name) => seedOf(name).tagName)).toEqual(parts.map(() => '土'));
    expect(DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.tagName === '土')).toHaveLength(7);
    expect(seedOf('岩弾').tagName).toBe('射撃');
  });

  it('tears a rift on each of a few targets in turn, and heaves all of an area at once, under identifiers of their own', () => {
    expect(seedOf('地割れ')).toMatchObject({
      identifier: 'EffectPreset_quake_2',
      kind: 'quake',
      grade: 2,
      targeting: 'multi',
    });
    expect(seedOf('地割れ').staggerMs).toBeGreaterThan(100);
    expect(seedOf('地割れ').areaRadius ?? 0).toBe(0);
    expect(seedOf('大地震')).toMatchObject({
      identifier: 'EffectPreset_quake_3',
      kind: 'quake',
      grade: 3,
      areaRadius: 3,
      staggerMs: 0,
    });
    for (const name of ['地割れ', '大地震']) expect((seedOf(name).impactSoundKey ?? '').length).toBeGreaterThan(0);
  });

  it('breathes sand as the breath of earth, naming no particle of its own', () => {
    expect(seedOf('砂塵のブレス')).toMatchObject({
      identifier: 'EffectPreset_breath_earth',
      kind: 'breath',
      tagName: '土',
    });
    expect(seedOf('砂塵のブレス').moteStyle ?? '').toBe('');
  });
});

describe('the family of wind', () => {
  const seedOf = (name: string) => DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!;

  it('has an attack for every part an element plays, eight in all, its shot among the shots', () => {
    const parts = ['突風', '鎌鼬', '真空波', '竜巻', '大嵐', '風のブレス', '風の大剣'];

    for (const name of ['風弾', ...parts]) expect([name, seedOf(name) !== undefined]).toEqual([name, true]);
    expect(parts.map((name) => seedOf(name).tagName)).toEqual(parts.map(() => '風'));
    expect(DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.tagName === '風')).toHaveLength(7);
    expect(seedOf('風弾').tagName).toBe('射撃');
  });

  it('cuts, flies, storms and swings by looks of the kinds it shares, keyed by its family and its particles', () => {
    expect(seedOf('鎌鼬')).toMatchObject({
      identifier: 'EffectPreset_sickle_2',
      kind: 'slash',
      slashStyle: 'combo',
      grade: 2,
    });
    expect(seedOf('鎌鼬').maxTargets).toBeGreaterThan(1);
    expect(seedOf('真空波')).toMatchObject({
      identifier: 'EffectPreset_vacuum_2',
      kind: 'projectile',
      projectileStyle: 'crescent',
      impactKind: 'vortex',
      grade: 2,
    });
    expect(seedOf('大嵐')).toMatchObject({
      identifier: 'EffectPreset_storm_3',
      kind: 'vortex',
      moteStyle: 'arc',
      grade: 3,
      areaRadius: 3,
      staggerMs: 0,
    });
    expect(seedOf('風の大剣')).toMatchObject({
      identifier: 'EffectPreset_skyblade_wind',
      kind: 'skyblade',
      impactKind: 'vortex',
    });
    for (const name of ['鎌鼬', '真空波', '大嵐', '風の大剣']) {
      expect([name, (seedOf(name).impactSoundKey ?? '').length > 0]).toEqual([name, true]);
    }
  });
});
