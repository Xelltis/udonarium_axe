import { TranslateFn } from '@axe/application/i18n/translate.token';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Party } from '@axe/domain/party/party';
import {
  buildCreateObjectMenu,
  buildCreateObjectMenuGroups,
  buildGatherPartyMenu,
  CreateMenuHands,
  GatherPartyHands,
} from '@axe/features/tabletop/create-menu/create-object-context-menu';
import { vi } from 'vitest';

const t: TranslateFn = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${Object.values(params).join(',')})` : key;

const position = { x: 100, y: 200, z: 0 };

function nameOf(entry: ContextMenuAction): string {
  return entry.name;
}

describe('buildCreateObjectMenuGroups', () => {
  const made = { identifier: 'made-1', aliasName: 'character' };
  let actions: Record<string, ReturnType<typeof vi.fn>>;
  let hands: CreateMenuHands;

  beforeEach(() => {
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
    actions = {
      createGameCharacter: vi.fn(() => made),
      createGameTableMask: vi.fn(),
      createTerrain: vi.fn(),
      createTextNote: vi.fn(),
      createBlankCard: vi.fn(),
      createTrump: vi.fn(),
      createDiceSymbol: vi.fn(),
      createCoin: vi.fn(() => made),
      createRangeArea: vi.fn(),
      createSolidRangeArea: vi.fn(),
      createLightSource: vi.fn(() => made),
      createWhiteBoard: vi.fn(() => made),
      createTableAmbience: vi.fn(),
    };
    hands = {
      actions: actions as unknown as TabletopActionService,
      t,
      select: vi.fn(),
      makeManyDice: vi.fn(),
    };
  });

  afterEach(() => vi.restoreAllMocks());

  it('splits the create menu into two spokes, with the one list being both in order', () => {
    const [first, second] = buildCreateObjectMenuGroups(position, hands);

    expect(first.map(nameOf)).toEqual([
      'feature.tabletop.action.createCharacter',
      'feature.tabletop.action.createMask',
      'feature.tabletop.action.createTerrain',
      'feature.tabletop.action.createNote',
      'feature.tabletop.action.createBlankCard',
      'feature.tabletop.action.createTrump',
      'feature.tabletop.action.createDice',
    ]);
    expect(second.map(nameOf)).toEqual([
      'feature.tabletop.action.createCoin',
      'feature.tabletop.action.createRange',
      'feature.tabletop.action.createSolidRange',
      'feature.tabletop.action.createLight',
      'feature.whiteBoard.action.create',
      'feature.tabletop.action.createAmbience',
    ]);
    expect(buildCreateObjectMenu(position, hands).map(nameOf)).toEqual([...first, ...second].map(nameOf));
  });

  it('makes what is picked at the point, with a sound, and picks out what has a place to be worked on', () => {
    const [first, second] = buildCreateObjectMenuGroups(position, hands);

    first.find((entry) => entry.name.endsWith('createCharacter'))?.action?.();
    expect(actions['createGameCharacter']).toHaveBeenCalledWith(position);
    expect(hands.select).toHaveBeenCalledWith(made);
    expect(SoundEffect.play).toHaveBeenCalledWith(PresetSound.piecePut);

    first.find((entry) => entry.name.endsWith('createTerrain'))?.action?.();
    expect(actions['createTerrain']).toHaveBeenCalledWith(position);
    expect(hands.select).toHaveBeenCalledTimes(1);

    second.find((entry) => entry.name.endsWith('createCoin'))?.action?.();
    expect(hands.select).toHaveBeenCalledTimes(2);
  });

  it('makes a range standing up as each kind, from the shape that kind stands up from', () => {
    const [, second] = buildCreateObjectMenuGroups(position, hands);
    const solids = second.find((entry) => entry.name.endsWith('createSolidRange'))!.subActions!;

    expect(solids.map(nameOf)).toEqual([
      'feature.tabletop.action.solidRangeSphere',
      'feature.tabletop.action.solidRangeCylinder',
      'feature.tabletop.action.solidRangeCone',
      'feature.tabletop.action.solidRangeBeam',
      'feature.tabletop.action.solidRangeSquareColumn',
    ]);
    solids[0].action?.();
    expect(actions['createSolidRangeArea']).toHaveBeenCalledWith(position, 'CIRCLE', 'sphere');
    solids[2].action?.();
    expect(actions['createSolidRangeArea']).toHaveBeenCalledWith(position, 'CORN', 'cone');
    solids[4].action?.();
    expect(actions['createSolidRangeArea']).toHaveBeenCalledWith(position, 'SQUARE', 'column');
  });

  it('offers every die, then the handful asked for by count', () => {
    const [first] = buildCreateObjectMenuGroups(position, hands);
    const dice = first.find((entry) => entry.name.endsWith('createDice'))!.subActions!;

    expect(dice.length).toBeGreaterThan(1);
    expect(dice.at(-1)?.name).toBe('feature.tabletop.action.createDiceMany');

    dice[0].action?.();
    expect(actions['createDiceSymbol']).toHaveBeenCalledWith(
      position,
      expect.any(String),
      expect.anything(),
      expect.any(String)
    );

    dice.at(-1)?.action?.();
    expect(hands.makeManyDice).toHaveBeenCalledWith(position);
  });

  it('offers each kind of ground ambience and makes it at the point', () => {
    const [, second] = buildCreateObjectMenuGroups(position, hands);
    const ambience = second.find((entry) => entry.name.endsWith('createAmbience'))!.subActions!;

    expect(ambience.length).toBeGreaterThan(0);
    expect(ambience.every((entry) => entry.name.startsWith('feature.ambience.kind.'))).toBe(true);

    ambience[0].action?.();
    expect(actions['createTableAmbience']).toHaveBeenCalledWith(position, expect.any(String));
  });
});

describe('buildGatherPartyMenu', () => {
  const parties: Party[] = [];

  function party(name: string): Party {
    const made = new Party();
    made.name = name;
    made.initialize();
    parties.push(made);
    return made;
  }

  function handsWith(members: ReadonlyMap<Party, readonly boolean[]>, isGameMaster = true): GatherPartyHands {
    return {
      isGameMaster,
      parties: [...members.keys()],
      membersOf: (party) => (members.get(party) ?? []).map((isVisibleOnTable) => ({ isVisibleOnTable })),
      gather: vi.fn<GatherPartyHands['gather']>(),
      t,
    };
  }

  afterEach(() => {
    for (const made of parties.splice(0)) made.destroy();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('is the master alone who may gather, and only where there is a party', () => {
    const members = new Map([[party('冒険者'), [true]]]);

    expect(buildGatherPartyMenu(handsWith(members, false))).toEqual([]);
    expect(buildGatherPartyMenu(handsWith(new Map()))).toEqual([]);
  });

  it('names each party, and shows one that has lost its members without letting it be picked', () => {
    const members = new Map([
      [party('冒険者'), [true, true]],
      [party(''), []],
    ]);

    const [entry] = buildGatherPartyMenu(handsWith(members));

    expect(entry.name).toBe('feature.gmTools.party.gather');
    expect(entry.subActions?.map((action) => [action.name, action.enabled ?? true])).toEqual([
      ['冒険者', true],
      ['common.party.unnamed', false],
    ]);
  });

  it('offers a party with members put away twice, by how many each would move', () => {
    const away = party('斥候');
    const members = new Map([[away, [true, false, false]]]);
    const hands = handsWith(members);

    const entries = buildGatherPartyMenu(hands)[0].subActions!;

    expect(entries.map(nameOf)).toEqual([
      'feature.gmTools.party.gatherOnTable(斥候,1)',
      'feature.gmTools.party.gatherWithAway(斥候,2)',
    ]);
    entries[0].action?.();
    expect(hands.gather).toHaveBeenLastCalledWith(away, false);
    entries[1].action?.();
    expect(hands.gather).toHaveBeenLastCalledWith(away, true);
  });

  it('offers a party with everyone put away only as all of them', () => {
    const members = new Map([[party('留守'), [false]]]);

    const entries = buildGatherPartyMenu(handsWith(members))[0].subActions!;

    expect(entries.map(nameOf)).toEqual(['feature.gmTools.party.gatherWithAway(留守,1)']);
  });
});
