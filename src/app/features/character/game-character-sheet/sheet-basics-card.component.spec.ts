import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataElement } from '@axe/domain/data/data-element';
import { SheetBasicsCardComponent } from '@axe/features/character/game-character-sheet/sheet-basics-card.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SheetBasicsCardComponent', () => {
  let fixture: ComponentFixture<SheetBasicsCardComponent>;
  let basics: DataElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SheetBasicsCardComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(SheetBasicsCardComponent);
    basics = DataElement.create('common', '', {});
    basics.appendChild(DataElement.create('name', '見張り台', {}));
    fixture.componentRef.setInput('element', basics);
  });

  afterEach(() => basics.destroy());

  it('shows the fields of the element it is given under the heading of basic information', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.classList).toContain('contents');
    expect(root.querySelector('[game-data-element]')).not.toBeNull();
    expect(root.innerHTML).toContain('見張り台');
  });

  it('stands where the sheet places it, keeping the look of a card', async () => {
    fixture.componentRef.setInput('place', 'col-span-2');
    fixture.detectChanges();
    await fixture.whenStable();
    const card = (fixture.nativeElement as HTMLElement).firstElementChild!;

    expect(card.classList).toContain('col-span-2');
    expect(card.classList).toContain('bg-ui-elevated');
  });
});
