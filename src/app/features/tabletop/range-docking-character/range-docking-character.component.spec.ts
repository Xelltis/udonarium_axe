import { TestBed } from '@angular/core/testing';
import { RangeDockingCharacterComponent } from '@axe/features/tabletop/range-docking-character/range-docking-character.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RangeDockingCharacterComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RangeDockingCharacterComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(RangeDockingCharacterComponent));
  });
});
