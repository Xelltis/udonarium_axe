import { TestBed } from '@angular/core/testing';
import { ImportCharacterImgComponent } from '@axe/features/character/import-character-img/import-character-img.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ImportCharacterImgComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImportCharacterImgComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(ImportCharacterImgComponent));
  });
});
