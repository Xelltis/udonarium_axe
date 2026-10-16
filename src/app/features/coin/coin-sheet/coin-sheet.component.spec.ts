import { TestBed } from '@angular/core/testing';
import { CoinSheetComponent } from '@axe/features/coin/coin-sheet/coin-sheet.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CoinSheetComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CoinSheetComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(CoinSheetComponent));
  });
});
