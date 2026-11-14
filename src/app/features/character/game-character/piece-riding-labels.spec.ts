import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { BuffBadge } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  PieceRidingLabels,
  PieceRidingLabelsHost,
  RidingLabel,
  sameRidingLabels,
} from '@axe/features/character/game-character/piece-riding-labels';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function label(over: Partial<RidingLabel> = {}): RidingLabel {
  return {
    identifier: 'piece-1',
    name: '勇者',
    icon: 'upgrade',
    aboard: 0,
    part: false,
    targeted: false,
    pick: 0,
    gauges: [],
    badges: [],
    ...over,
  };
}

describe('sameRidingLabels', () => {
  it('takes labels showing the same pieces with the same names, bars and buffs for the same', () => {
    const list = [label()];
    expect(sameRidingLabels(list, list)).toBe(true);
    expect(sameRidingLabels([label()], [label()])).toBe(true);
    expect(
      sameRidingLabels(
        [label({ badges: [{ name: '毒' } as BuffBadge] })],
        [label({ badges: [{ name: '毒' } as BuffBadge] })]
      )
    ).toBe(true);
  });

  it('tells apart another length, name, aim, pick or buff', () => {
    expect(sameRidingLabels([label()], [])).toBe(false);
    expect(sameRidingLabels([label()], [label({ name: '戦士' })])).toBe(false);
    expect(sameRidingLabels([label()], [label({ targeted: true })])).toBe(false);
    expect(sameRidingLabels([label()], [label({ pick: 2 })])).toBe(false);
    expect(sameRidingLabels([label()], [label({ badges: [{ name: '毒' } as BuffBadge] })])).toBe(false);
  });
});

describe('PieceRidingLabels', () => {
  const made: GameCharacter[] = [];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    for (const piece of made.splice(0)) piece.destroy();
    vi.restoreAllMocks();
  });

  function piece(name: string, over: Partial<Pick<GameCharacter, 'mountable' | 'ridingOn' | 'rideSeat'>> = {}) {
    const character = GameCharacter.create(name, 1, '');
    character.setLocation('table');
    Object.assign(character, over);
    made.push(character);
    return character;
  }

  function setup(character: GameCharacter | null) {
    const state = { hideName: signal(false), hideBuff: signal(false), runRound: signal(false) };
    const ownBadges = [{ name: '祝福' } as BuffBadge];
    const host: PieceRidingLabelsHost = {
      character: () => character,
      followedTree: (root) => (root ? [] : null),
      name: () => character?.name ?? '',
      hideName: state.hideName,
      hideBuff: state.hideBuff,
      gaugeRows: () => [],
      buffBadges: () => ownBadges,
      labelsRunRound: state.runRound,
    };
    return { labels: TestBed.runInInjectionContext(() => new PieceRidingLabels(host)), state, ownBadges };
  }

  const names = (labels: readonly RidingLabel[]) => labels.map((one) => one.name);

  it('shows nothing for a piece that carries nobody, or before a piece is bound', () => {
    const { labels } = setup(piece('馬', { mountable: '1' }));

    expect(labels.ridersAboard()).toBe(0);
    expect(labels.ridingLabels()).toEqual([]);
    expect(labels.partLabels()).toEqual([]);
    expect(labels.ridingCard()).toEqual([]);
    expect(labels.labelsInRidingCard()).toBe(false);
    expect(setup(null).labels.ridingCard()).toEqual([]);
    expect(setup(null).labels.ridingMount()).toBeNull();
  });

  it('lists those riding a mount with the one in front first, each with the mark of its seat', () => {
    const horse = piece('馬', { mountable: '1' });
    piece('荷物', { ridingOn: horse.identifier, rideSeat: 'cargo' });
    piece('騎手', { ridingOn: horse.identifier, rideSeat: 'rider' });
    piece('同乗者', { ridingOn: horse.identifier, rideSeat: 'passenger' });
    const { labels } = setup(horse);

    expect(labels.ridersAboard()).toBe(3);
    expect(names(labels.ridingLabels())).toEqual(['騎手', '同乗者', '荷物']);
    expect(labels.ridingLabels().map((one) => one.icon)).toEqual(['upgrade', 'group', 'backpack']);
    expect(labels.ridingLabels().every((one) => !one.part && one.aboard === 0)).toBe(true);
  });

  it('counts nobody aboard a piece that is not a mount', () => {
    const cart = piece('荷車');
    piece('騎手', { ridingOn: cart.identifier, rideSeat: 'rider' });

    expect(setup(cart).labels.ridersAboard()).toBe(0);
  });

  it('says which mount a piece rides', () => {
    const horse = piece('馬', { mountable: '1' });
    const rider = piece('騎手', { ridingOn: horse.identifier, rideSeat: 'rider' });

    expect(setup(rider).labels.ridingMount()).toBe(horse);
    expect(setup(horse).labels.ridingMount()).toBeNull();
  });

  it('puts the riders over the mount and its parts under it in one card, the one in front lowest', () => {
    const dragon = piece('ドラゴン', { mountable: '1' });
    piece('騎手', { ridingOn: dragon.identifier, rideSeat: 'rider' });
    piece('同乗者', { ridingOn: dragon.identifier, rideSeat: 'passenger' });
    piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });
    const { labels, ownBadges, state } = setup(dragon);

    const card = labels.ridingCard();

    expect(names(card)).toEqual(['同乗者', '騎手', 'ドラゴン', '頭']);
    expect(card[2]).toMatchObject({ identifier: dragon.identifier, icon: '', aboard: 2, part: false });
    expect(card[2].badges).toBe(ownBadges);
    expect(card[3]).toMatchObject({ part: true, icon: 'extension' });
    expect(labels.labelsInRidingCard()).toBe(true);

    state.hideName.set(true);
    state.hideBuff.set(true);
    expect(labels.ridingCard()[2]).toMatchObject({ name: '', badges: [] });
  });

  it('lists the parts in a card of their own while the labels run round the piece', () => {
    const dragon = piece('ドラゴン');
    piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });
    const { labels, state } = setup(dragon);
    expect(labels.partCardInOrbit()).toEqual([]);

    state.runRound.set(true);

    expect(names(labels.partCardInOrbit())).toEqual(['頭']);
    expect(labels.labelsInRidingCard()).toBe(false);
  });

  it('tells the row of a part again as the part changes', () => {
    const dragon = piece('ドラゴン');
    const head = piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });
    const { labels } = setup(dragon);
    expect(names(labels.partLabels())).toEqual(['頭']);

    head.name = '竜の頭';
    TestBed.inject(ObjectChangeService).notifyChanged(head.identifier);

    expect(names(labels.partLabels())).toEqual(['竜の頭']);
  });

  it('leaves out the name of a piece kept from the reader, and every name while names are switched off', () => {
    const horse = piece('馬', { mountable: '1' });
    const rider = piece('騎手', { ridingOn: horse.identifier, rideSeat: 'rider' });
    const kept = vi.spyOn(TestBed.inject(PieceNameService), 'isKept').mockImplementation((one) => one === rider);
    expect(names(setup(horse).labels.ridingLabels())).toEqual(['']);

    kept.mockReturnValue(false);
    const overlay = TestBed.inject(PieceOverlayPreferenceService);
    Object.defineProperty(overlay, 'names', { value: signal(false), configurable: true });
    expect(names(setup(horse).labels.ridingLabels())).toEqual(['']);
  });

  it('numbers a part picked while an effect is aimed, and no rider', () => {
    const dragon = piece('ドラゴン', { mountable: '1' });
    const rider = piece('騎手', { ridingOn: dragon.identifier, rideSeat: 'rider' });
    const head = piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });
    const picked = signal(
      new Map([
        [head.identifier, 2],
        [rider.identifier, 1],
      ])
    );
    Object.defineProperty(TestBed.inject(EffectTargetingService), 'pickOrder', { value: picked, configurable: true });
    const { labels } = setup(dragon);

    expect(labels.partLabels()[0].pick).toBe(2);
    expect(labels.ridingLabels()[0].pick).toBe(0);
  });
});
