import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RangeArea } from '@axe/domain/tabletop/range';
import { SheetRangeFormComponent } from '@axe/features/character/game-character-sheet/sheet-range-form.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SheetRangeFormComponent', () => {
  let fixture: ComponentFixture<SheetRangeFormComponent>;
  let range: RangeArea;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function shapeButtons(): HTMLButtonElement[] {
    return [...root().querySelectorAll<HTMLButtonElement>('.grid-cols-4 button')];
  }

  function change(field: HTMLInputElement, value: string): void {
    field.value = value;
    field.dispatchEvent(new Event('change'));
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [SheetRangeFormComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(SheetRangeFormComponent);
    range = RangeArea.create('範囲', 1, 3, 100);
    fixture.componentRef.setInput('range', range);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => range.destroy());

  it('offers the eight shapes and gives the range the one pressed', async () => {
    expect(shapeButtons()).toHaveLength(8);

    shapeButtons()[7].click();
    await fixture.whenStable();

    expect(range.type).toBe('CIRCLE');
    expect(shapeButtons()[7].classList).toContain('font-semibold');
  });

  it('writes the two colours to the range from their fields', () => {
    change(root().querySelector<HTMLInputElement>('input[name="color01"]')!, '#112233');
    change(root().querySelector<HTMLInputElement>('input[name="color02"]')!, '#445566');

    expect(range.rangeColor).toBe('#112233');
    expect(range.gridColor).toBe('#445566');
  });

  it('writes free placement to the range, and offers no rotation snap for a circle', async () => {
    const free = root().querySelector<HTMLInputElement>('[data-testid="range-free-placement"]')!;
    expect(root().querySelector('input[name="subDivisionSnapPolygonal"]')).not.toBeNull();

    free.click();
    expect(range.placesFreely).toBe(true);

    range.type = 'CIRCLE';
    await fixture.whenStable();
    expect(root().querySelector('input[name="subDivisionSnapPolygonal"]')).toBeNull();
  });

  it('shows the basic information of the range it is given', () => {
    expect(root().querySelector('sheet-basics-card [game-data-element]')).not.toBeNull();
  });
});
