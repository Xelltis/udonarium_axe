import { TestBed } from '@angular/core/testing';
import {
  BATTLE_CHANGE_SETTLE_MS,
  BATTLE_CHANGE_WAIT_MS,
  BattleLaunchService,
} from '@axe/application/battle/battle-launch.service';
import { battleCutIn$ } from '@axe/core/event/domain-events';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { normalizeBattleScene } from '@axe/domain/battle/battle-scene';
import { DEFAULT_BATTLE_SETTINGS, DEFAULT_DEFEAT_EFFECT_IDENTIFIER } from '@axe/domain/battle/battle-settings';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { autoEffectIdentifier } from '@axe/domain/effect/resource-effect-map';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleLaunchService', () => {
  let service: BattleLaunchService;
  let heard: unknown[];
  let stopListening: () => void;
  let hero: GameCharacter;
  let goblin: GameCharacter;

  function hpOf(character: GameCharacter): DataElement {
    const element = character.detailDataElement?.getFirstElementByName('HP');
    if (!element) throw new Error('the sample character carries no HP');
    return element;
  }

  beforeEach(() => {
    // Cut off from the room, a scene sent to it plays here at once, which is what is listened for.
    setNetworkIsolated(true);
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(BattleLaunchService);
    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) createEffectPreset(seed, seed.identifier);

    hero = GameCharacter.create('勇者', 1, '');
    goblin = GameCharacter.create('ゴブリン', 1, '');
    heard = [];
    stopListening = battleCutIn$.subscribe((event) => heard.push(event.scene));
  });

  afterEach(() => {
    vi.useRealTimers();
    setNetworkIsolated(false);
    stopListening();
    Config.instance.battleSettings = DEFAULT_BATTLE_SETTINGS;
    TurnState.instance.currentIdentifier = '';
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('sends the room a scene of who strikes whom, as the pieces stand', () => {
    const scene = service.play({ attacker: hero, defenders: [goblin] }, 'everywhere');

    expect(scene).not.toBeNull();
    expect(heard).toHaveLength(1);
    const played = normalizeBattleScene(heard[0]);
    expect(played?.attacker.name).toBe('勇者');
    expect(played?.defenders.map((defender) => defender.name)).toEqual(['ゴブリン']);
    expect(played?.attackerSide).toBe('left');
  });

  it('draws the fall of the numbers between the reading taken and the pieces now', () => {
    const take = service.take({ attacker: hero, defenders: [goblin] });
    hpOf(goblin).currentValue = 0;

    const scene = service.finish(take);

    const hp = scene?.defenders[0].gauges.find((gauge) => gauge.name === 'HP');
    expect(hp?.after).toBe(0);
    expect(hp?.before).toBeGreaterThan(0);
    expect(scene?.defenders[0].defeated).toBe(true);
    expect(scene?.defeatEffect).toBe(DEFAULT_DEFEAT_EFFECT_IDENTIFIER);
  });

  it('brings nobody down while the room has going down turned off', () => {
    Config.instance.battleSettings = { ...DEFAULT_BATTLE_SETTINGS, defeat: false };
    const take = service.take({ attacker: hero, defenders: [goblin] });
    hpOf(goblin).currentValue = 0;

    const scene = service.finish(take);

    expect(scene?.defenders[0].defeated).toBe(false);
    expect(scene?.defeatEffect).toBe('');
  });

  it('strikes with the effect named, then the piece’s own, then the stage’s own', () => {
    const own = new EffectPreset();
    own.name = '必殺剣';
    own.initialize();

    expect(service.play({ attacker: hero, defenders: [goblin], effectName: '殴打' }, 'here')?.effect).toBe(
      'EffectPreset_bash_1'
    );

    hero.battleEffect = '必殺剣';
    expect(service.play({ attacker: hero, defenders: [goblin] }, 'here')?.effect).toBe(own.identifier);

    hero.battleEffect = 'もう無い技';
    expect(service.play({ attacker: hero, defenders: [goblin] }, 'here')?.effect).toBe(
      autoEffectIdentifier('damage', 'medium')
    );
  });

  it('stands each piece on the side the master put it on', () => {
    goblin.battleSide = 'left';

    expect(service.play({ attacker: hero, defenders: [goblin] }, 'here')?.attackerSide).toBe('right');
  });

  it('stands a piece put on no side where its party stands, and the one struck across from it', () => {
    const heroes = new Party();
    heroes.battleSide = 'right';
    heroes.initialize();
    hero.partyIdentifier = heroes.identifier;

    expect(service.play({ attacker: hero, defenders: [goblin] }, 'here')?.attackerSide).toBe('right');
    expect(service.play({ attacker: goblin, defenders: [hero] }, 'here')?.attackerSide).toBe('left');

    heroes.destroy();
  });

  it('strikes nobody with themselves', () => {
    expect(service.play({ attacker: hero, defenders: [hero] }, 'everywhere')).toBeNull();
    expect(heard).toEqual([]);
  });

  it('plays the lineup with whoever’s turn it is striking', () => {
    const orc = GameCharacter.create('オーク', 1, '');
    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    orc.battleSide = 'right';
    TurnState.instance.currentIdentifier = orc.identifier;

    const scene = service.playLineup(null, 'everywhere');

    expect(scene?.attacker.identifier).toBe(orc.identifier);
    expect(scene?.defenders.map((defender) => defender.identifier)).toEqual([hero.identifier]);
    expect(scene?.attackerSide).toBe('right');
  });

  it('has the piece asked for strike the other side of the lineup, whoever’s turn it is', () => {
    const orc = GameCharacter.create('オーク', 1, '');
    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    orc.battleSide = 'right';
    TurnState.instance.currentIdentifier = hero.identifier;

    const scene = service.playLineupAs(orc, 'everywhere');

    expect(scene?.attacker.identifier).toBe(orc.identifier);
    expect(scene?.defenders.map((defender) => defender.identifier)).toEqual([hero.identifier]);
  });

  it('plays nothing for a piece asked to strike that stands in no side', () => {
    hero.battleSide = 'left';
    goblin.battleSide = 'right';
    const outsider = GameCharacter.create('通行人', 1, '');

    expect(service.playLineupAs(outsider, 'everywhere')).toBeNull();
    expect(heard).toEqual([]);
  });

  it('plays no lineup with one side empty', () => {
    hero.battleSide = 'left';

    expect(service.playLineup(hero, 'everywhere')).toBeNull();
    expect(heard).toEqual([]);
  });

  it('waits for a change under way to reach the pieces before playing', async () => {
    vi.useFakeTimers();
    const take = service.take({ attacker: hero, defenders: [goblin] });
    const playing = service.finishAfterChange(take);

    await vi.advanceTimersByTimeAsync(500);
    expect(heard).toEqual([]);

    hpOf(goblin).currentValue = 1;
    await vi.advanceTimersByTimeAsync(BATTLE_CHANGE_SETTLE_MS + 50);
    const scene = await playing;

    expect(heard).toHaveLength(1);
    expect(scene?.defenders[0].gauges.find((gauge) => gauge.name === 'HP')?.after).toBe(1);
  });

  it('takes nothing that touches the numbers without moving them for the change', async () => {
    vi.useFakeTimers();
    const playing = service.finishAfterChange(service.take({ attacker: hero, defenders: [goblin] }));

    hpOf(goblin).update();
    await vi.advanceTimersByTimeAsync(BATTLE_CHANGE_SETTLE_MS + 50);
    expect(heard).toEqual([]);

    hpOf(goblin).currentValue = 2;
    await vi.advanceTimersByTimeAsync(BATTLE_CHANGE_SETTLE_MS + 50);
    expect((await playing)?.defenders[0].gauges.find((gauge) => gauge.name === 'HP')?.after).toBe(2);
  });

  it('gives up waiting for a change that never comes and plays the pieces as they stand', async () => {
    vi.useFakeTimers();
    const playing = service.finishAfterChange(service.take({ attacker: hero, defenders: [goblin] }));

    await vi.advanceTimersByTimeAsync(BATTLE_CHANGE_WAIT_MS);

    expect(await playing).not.toBeNull();
    expect(heard).toHaveLength(1);
  });
});
