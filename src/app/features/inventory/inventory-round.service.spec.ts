import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('InventoryRoundService', () => {
  let service: InventoryRoundService;
  let turnOrder: TurnOrderService;
  let seen: GameCharacter;
  let unseen: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    turnOrder = TestBed.inject(TurnOrderService);
    service = TestBed.inject(InventoryRoundService);
    seen = GameCharacter.create('見える', 1, '');
    unseen = GameCharacter.create('闇の中', 1, '');
    vi.spyOn(TestBed.inject(VisionService), 'mayBeListed').mockImplementation((character) => character !== unseen);
  });

  afterEach(() => {
    seen.destroy();
    unseen.destroy();
    vi.restoreAllMocks();
  });

  describe('what the reader is shown of the round', () => {
    it('leaves the pieces the reader cannot see out of the order', () => {
      vi.spyOn(turnOrder, 'orderedCharacters').mockReturnValue([unseen, seen]);

      expect(service.order()).toEqual([seen]);
    });

    it('names the piece the turn goes to next only where the reader can see it', () => {
      vi.spyOn(turnOrder, 'orderedCharacters').mockReturnValue([unseen, seen]);
      const next = vi.spyOn(turnOrder, 'peekNextIdentifier').mockReturnValue(unseen.identifier);
      expect(service.nextIdentifier()).toBe('');

      next.mockReturnValue(seen.identifier);
      expect(TestBed.runInInjectionContext(() => new InventoryRoundService()).nextIdentifier()).toBe(seen.identifier);
    });

    it('lists companions the reader can see, and no carrier left with none', () => {
      vi.spyOn(turnOrder, 'companionsByCarrier').mockReturnValue(
        new Map([
          ['carrier-a', [seen, unseen]],
          ['carrier-b', [unseen]],
        ])
      );

      expect([...service.companions()]).toEqual([['carrier-a', [seen]]]);
    });

    it('shows a side with the pieces the reader can see on it, and no side that has none', () => {
      vi.spyOn(turnOrder, 'orderedSides').mockReturnValue([
        { side: 'ally', members: [seen, unseen] },
        { side: 'enemy', members: [unseen] },
      ] as ReturnType<TurnOrderService['orderedSides']>);
      vi.spyOn(turnOrder, 'sideName').mockImplementation((side) => `name:${side}`);
      vi.spyOn(turnOrder, 'sideColor').mockImplementation((side) => `color:${side}`);

      expect(service.sides()).toEqual([{ side: 'ally', name: 'name:ally', color: 'color:ally', members: [seen] }]);
    });

    it('does not offer waiting while no piece has the turn, whatever may wait', () => {
      const mayHold = vi.spyOn(turnOrder, 'mayHold').mockReturnValue(true);

      expect(service.progress().currentIdentifier).toBe('');
      expect(service.mayHoldCurrent()).toBe(false);
      expect(mayHold).not.toHaveBeenCalled();
    });
  });

  describe('the presses that move the round on', () => {
    it('steps a waiting piece in, and gives the turn to any other', () => {
      const mayInterrupt = vi.spyOn(turnOrder, 'mayInterrupt').mockReturnValue(true);
      const interrupt = vi.spyOn(turnOrder, 'interrupt').mockImplementation(() => undefined);
      const setCurrent = vi.spyOn(turnOrder, 'setCurrent').mockImplementation(() => undefined);

      service.giveTurnTo('piece-1');
      expect(interrupt).toHaveBeenCalledWith('piece-1');
      expect(setCurrent).not.toHaveBeenCalled();

      mayInterrupt.mockReturnValue(false);
      service.giveTurnTo('piece-2');
      expect(setCurrent).toHaveBeenCalledWith('piece-2');
      expect(interrupt).toHaveBeenCalledTimes(1);
    });

    it('has the piece whose turn it is wait', () => {
      vi.spyOn(turnOrder, 'currentIdentifier', 'get').mockReturnValue('piece-1');
      const hold = vi.spyOn(turnOrder, 'hold').mockImplementation(() => undefined);

      service.holdCurrent();

      expect(hold).toHaveBeenCalledWith('piece-1');
    });

    it('hands each press on to the turn order', () => {
      const next = vi.spyOn(turnOrder, 'next').mockImplementation(() => undefined);
      const prev = vi.spyOn(turnOrder, 'prev').mockImplementation(() => undefined);
      const advance = vi.spyOn(turnOrder, 'advanceRound').mockResolvedValue(undefined as never);
      const retreat = vi.spyOn(turnOrder, 'retreatRound').mockImplementation(() => undefined);
      const reset = vi.spyOn(turnOrder, 'reset').mockImplementation(() => undefined);

      service.next();
      service.prev();
      service.advanceRound();
      service.retreatRound();
      service.reset();

      for (const press of [next, prev, advance, retreat, reset]) expect(press).toHaveBeenCalledTimes(1);
    });

    it('switches whether buffs run down', () => {
      vi.spyOn(turnOrder, 'buffDecay', 'get').mockReturnValue(true);
      const set = vi.spyOn(turnOrder, 'setBuffDecay').mockImplementation(() => undefined);

      service.toggleBuffDecay();

      expect(set).toHaveBeenCalledWith(false);
    });
  });
});
