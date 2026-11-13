import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableAmbienceSettingsComponent } from '@axe/features/tabletop/table-ambience/table-ambience-settings.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableAmbienceSettingsComponent', () => {
  let ambience: TableAmbience;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TableAmbienceSettingsComponent],
      providers: [...TEST_PROVIDERS],
    });
    ambience = TableAmbience.create('池', 'water', 4, 4);
  });

  afterEach(() => {
    ObjectStore.instance.remove(ambience);
  });

  async function depthField(): Promise<HTMLInputElement> {
    const fixture = TestBed.createComponent(TableAmbienceSettingsComponent);
    fixture.componentInstance.target = ambience;
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="ambienceSurface"]')!;
  }

  function fieldIn(fixture: ComponentFixture<TableAmbienceSettingsComponent>, name: string): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  }

  function type(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(TableAmbienceSettingsComponent));
  });

  it('shows a depth set from elsewhere once the change reaches it', async () => {
    ambience.surfaceHeight = 2;
    const fixture = TestBed.createComponent(TableAmbienceSettingsComponent);
    fixture.componentInstance.target = ambience;
    await fixture.whenStable();
    expect(fieldIn(fixture, 'ambienceSurface').value).toBe('2');

    ambience.surfaceHeight = 3;
    TestBed.inject(ObjectChangeService).notifyChanged(ambience.identifier);
    await fixture.whenStable();

    expect(fieldIn(fixture, 'ambienceSurface').value).toBe('3');
  });

  it('leaves the water where it stands while its depth is emptied to type a new one', async () => {
    ambience.surfaceHeight = 2;
    const field = await depthField();

    type(field, '');
    expect(ambience.surfaceHeight).toBe(2);

    type(field, '1.5');
    expect(ambience.surfaceHeight).toBe(1.5);
  });
});
