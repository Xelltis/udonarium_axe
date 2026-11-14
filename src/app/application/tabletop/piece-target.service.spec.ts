import { TestBed } from '@angular/core/testing';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PieceTargetService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  function service(): PieceTargetService {
    return TestBed.inject(PieceTargetService);
  }

  it('puts the mark on a piece and takes it off again, and says so each time', () => {
    const piece = GameCharacter.create('コマ', 1, '');
    const signal = TestBed.inject(UiSignalService).targetChange;

    service().toggle(piece);
    expect(piece.targeted).toBe(true);
    expect(signal()).toEqual({ identifier: piece.identifier, className: piece.aliasName });

    service().toggle(piece);
    expect(piece.targeted).toBe(false);
  });

  it('takes the mark off everything at once', () => {
    const one = GameCharacter.create('一', 1, '');
    const two = GameCharacter.create('二', 1, '');
    service().toggle(one);
    service().toggle(two);
    expect(service().anything()).toBe(true);

    service().clear();

    expect(one.targeted).toBe(false);
    expect(two.targeted).toBe(false);
    expect(service().anything()).toBe(false);
  });

  it('aims at exactly the pieces given, and at nothing else', () => {
    const one = GameCharacter.create('一', 1, '');
    const two = GameCharacter.create('二', 1, '');
    const three = GameCharacter.create('三', 1, '');
    service().toggle(one);

    service().setOnly([two, three]);

    expect([one.targeted, two.targeted, three.targeted]).toEqual([false, true, true]);
  });

  it('lets go of the targets of an effect being picked as it takes every aim off', () => {
    const picking = TestBed.inject(EffectTargetingService);
    const cancelled = vi.spyOn(picking, 'cancel');
    const piece = GameCharacter.create('コマ', 1, '');
    service().toggle(piece);

    service().clear();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(piece.targeted).toBe(false);
  });

  describe('aiming at what a range takes in', () => {
    function circleAt(x: number, y: number): RangeArea {
      const range = RangeArea.create('円', 1, 2, 50);
      range.type = 'CIRCLE';
      range.location = { name: 'table', x, y };
      return range;
    }

    it('aims at the pieces a circle takes in, and takes the aim off the rest and off pieces out of the fight', () => {
      const range = circleAt(300, 300);
      const inside = GameCharacter.create('中', 1, '');
      inside.location = { name: 'table', x: 325, y: 275 };
      const outside = GameCharacter.create('外', 1, '');
      outside.location = { name: 'table', x: 600, y: 600 };
      outside.targeted = true;
      const resting = GameCharacter.create('除外', 1, '');
      resting.location = { name: 'table', x: 300, y: 300 };
      resting.offField = '1';

      service().targetInsideRange(range, 50);

      expect([inside.targeted, outside.targeted, resting.targeted]).toEqual([true, false, false]);
      range.destroy();
    });

    it('takes in pieces as far off as its length counts squares, in the squares it is given', () => {
      const range = circleAt(300, 300);
      const twoSquaresOff = GameCharacter.create('二マス先', 1, '');
      twoSquaresOff.location = { name: 'table', x: 425, y: 275 };

      service().targetInsideRange(range, 50);
      expect(twoSquaresOff.targeted).toBe(false);

      service().targetInsideRange(range, 100);
      expect(twoSquaresOff.targeted).toBe(true);
      range.destroy();
    });
  });

  it('names the pieces on the table aimed at, read again as aims and places change', () => {
    const onTable = GameCharacter.create('卓', 1, '');
    onTable.location = { name: 'table', x: 0, y: 0 };
    const away = GameCharacter.create('墓', 1, '');
    away.location = { name: 'graveyard', x: 0, y: 0 };
    expect(service().onTable()).toEqual([]);

    service().toggle(onTable);
    service().toggle(away);
    expect(service().onTable()).toEqual([onTable]);

    onTable.location.name = 'graveyard';
    TestBed.inject(ObjectChangeService).notifyChanged(onTable.identifier);
    expect(service().onTable()).toEqual([]);
  });
});
