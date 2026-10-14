import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableAmbienceSettingsComponent } from '@axe/features/tabletop/table-ambience/table-ambience-settings.component';
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

  function type(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('leaves the water where it stands while its depth is emptied to type a new one', async () => {
    ambience.surfaceHeight = 2;
    const field = await depthField();

    type(field, '');
    expect(ambience.surfaceHeight).toBe(2);

    type(field, '1.5');
    expect(ambience.surfaceHeight).toBe(1.5);
  });
});
