import { TestBed } from '@angular/core/testing';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
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
});
