import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { BuffBadge } from '@axe/domain/character/buff-badge';
import { BuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';
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
    buffView: 'icon',
    badges: [],
    buffRows: [],
    buffCount: 0,
    detail: null,
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

  it('tells apart another way of drawing the buffs, other rows of them, another count and another piece to detail', () => {
    const row = {} as DataElement;
    expect(sameRidingLabels([label()], [label({ buffView: 'count' })])).toBe(false);
    expect(sameRidingLabels([label({ buffCount: 1 })], [label({ buffCount: 2 })])).toBe(false);
    expect(sameRidingLabels([label({ buffRows: [row] })], [label({ buffRows: [row] })])).toBe(true);
    expect(sameRidingLabels([label({ buffRows: [row] })], [label({ buffRows: [{} as DataElement] })])).toBe(false);
    expect(sameRidingLabels([label()], [label({ detail: {} as GameCharacter })])).toBe(false);
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
    const state = {
      hideName: signal(false),
      hideBuff: signal(false),
      runRound: signal(false),
      buffView: signal<BuffViewMode>('icon'),
    };
    const ownBadges = [{ name: '祝福' } as BuffBadge];
    const ownRows = [{} as DataElement];
    const host: PieceRidingLabelsHost = {
      character: () => character,
      followedTree: (root) => (root ? [] : null),
      name: () => character?.name ?? '',
      hideName: state.hideName,
      hideBuff: state.hideBuff,
      gaugeRows: () => [],
      buffBadges: () => ownBadges,
      buffRows: () => ownRows,
      buffCount: () => 1,
      buffViewMode: state.buffView,
      labelsRunRound: state.runRound,
    };
    return { labels: TestBed.runInInjectionContext(() => new PieceRidingLabels(host)), state, ownBadges, ownRows };
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

  describe('the buffs of a row, as this reader has buffs drawn', () => {
    function dragonWithPoisonedHead() {
      const dragon = piece('ドラゴン');
      const head = piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });
      head.addExtendData();
      const poison = DataElement.create('毒', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: 'ダメージ2' });
      head.buffDataElement!.appendChild(poison);
      return { dragon, head, poison };
    }

    it('carries the icons alone while buffs are drawn as icons', () => {
      const { dragon, poison } = dragonWithPoisonedHead();
      const { labels, ownBadges } = setup(dragon);

      const [body, part] = labels.ridingCard();

      expect(part).toMatchObject({ buffView: 'icon', buffRows: [], buffCount: 0 });
      expect(part.badges.map((badge) => badge.identifier)).toEqual([poison.identifier]);
      expect(body).toMatchObject({ buffView: 'icon', buffRows: [], buffCount: 0 });
      expect(body.badges).toBe(ownBadges);
    });

    it('carries the rows of the buffs alone while they are drawn in detail', () => {
      const { dragon, head } = dragonWithPoisonedHead();
      const { labels, state, ownRows } = setup(dragon);
      state.buffView.set('detail');

      const [body, part] = labels.ridingCard();

      expect(part).toMatchObject({ buffView: 'detail', badges: [], buffCount: 0 });
      expect(part.buffRows).toEqual(head.buffDataElement!.children);
      expect(body).toMatchObject({ buffView: 'detail', badges: [], buffCount: 0 });
      expect(body.buffRows).toBe(ownRows);
    });

    it('carries how many buffs there are alone while they are counted', () => {
      const { dragon } = dragonWithPoisonedHead();
      const { labels, state } = setup(dragon);
      state.buffView.set('count');

      const [body, part] = labels.ridingCard();

      expect(part).toMatchObject({ buffView: 'count', badges: [], buffRows: [], buffCount: 1 });
      expect(body).toMatchObject({ buffView: 'count', badges: [], buffRows: [], buffCount: 1 });
    });

    it('carries no buffs of a part that hides them, nor of a body hiding its own, however they are drawn', () => {
      const { dragon, head } = dragonWithPoisonedHead();
      head.hideBuff = true;
      const { labels, state } = setup(dragon);
      state.hideBuff.set(true);

      for (const mode of ['icon', 'detail', 'count'] as const) {
        state.buffView.set(mode);
        for (const row of labels.ridingCard()) {
          expect(row).toMatchObject({ badges: [], buffRows: [], buffCount: 0 });
        }
      }
    });
  });

  describe('whose detail a row shows when pointed at', () => {
    it('shows the detail of a part this reader may see the contents of', () => {
      const dragon = piece('ドラゴン', { mountable: '1' });
      const head = piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });

      expect(setup(dragon).labels.partLabels()[0].detail).toBe(head);
    });

    it('shows none for a part kept from this reader', () => {
      const dragon = piece('ドラゴン');
      const head = piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });
      vi.spyOn(TestBed.inject(DisclosureService), 'canView').mockImplementation((one) => one !== head);

      expect(setup(dragon).labels.partLabels()[0].detail).toBeNull();
    });

    it('shows none of its own for the body or for one riding it, whose rows are not pointed at', () => {
      const dragon = piece('ドラゴン', { mountable: '1' });
      piece('騎手', { ridingOn: dragon.identifier, rideSeat: 'rider' });
      piece('頭', { ridingOn: dragon.identifier, rideSeat: 'part' });

      const [rider, body] = setup(dragon).labels.ridingCard();

      expect(rider.detail).toBeNull();
      expect(body.detail).toBeNull();
    });
  });
});
