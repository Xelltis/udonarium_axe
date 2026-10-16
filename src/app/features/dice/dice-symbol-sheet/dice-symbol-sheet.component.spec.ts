import { TestBed } from '@angular/core/testing';
import { DiceSymbolSheetComponent } from '@axe/features/dice/dice-symbol-sheet/dice-symbol-sheet.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DiceSymbolSheetComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DiceSymbolSheetComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(DiceSymbolSheetComponent));
  });
});
