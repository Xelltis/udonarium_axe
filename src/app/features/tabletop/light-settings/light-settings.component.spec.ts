import { TestBed } from '@angular/core/testing';
import { LightSettingsComponent } from '@axe/features/tabletop/light-settings/light-settings.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('LightSettingsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LightSettingsComponent], providers: [...TEST_PROVIDERS] });
  });

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(LightSettingsComponent));
  });
});
