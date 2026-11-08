import { TestBed } from '@angular/core/testing';
import { Coin } from '@axe/domain/coin/coin';
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

  it('renames the coin from the box for its name', async () => {
    const coin = Coin.create('コイン');
    const fixture = TestBed.createComponent(CoinSheetComponent);
    fixture.componentInstance.coin = coin;

    try {
      fixture.detectChanges();
      await fixture.whenStable();
      const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="text"]')!;
      box.value = '運命のコイン';
      box.dispatchEvent(new Event('input'));

      expect(coin.name).toBe('運命のコイン');
    } finally {
      fixture.destroy();
      coin.destroy();
    }
  });
});
