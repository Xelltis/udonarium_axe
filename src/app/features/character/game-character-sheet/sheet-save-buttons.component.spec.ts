import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SheetSaveButtonsComponent } from '@axe/features/character/game-character-sheet/sheet-save-buttons.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SheetSaveButtonsComponent', () => {
  let fixture: ComponentFixture<SheetSaveButtonsComponent>;

  function buttons(): HTMLButtonElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SheetSaveButtonsComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(SheetSaveButtonsComponent);
    fixture.detectChanges();
  });

  it('takes up no box of its own, so its buttons stand in the row it is put in', () => {
    expect((fixture.nativeElement as HTMLElement).classList).toContain('contents');
  });

  it('says which of its two buttons was pressed', () => {
    const copied = vi.fn();
    const saved = vi.fn();
    fixture.componentInstance.copyPressed.subscribe(copied);
    fixture.componentInstance.savePressed.subscribe(saved);
    const [copy, save] = buttons();

    copy.click();
    expect([copied.mock.calls.length, saved.mock.calls.length]).toEqual([1, 0]);
    save.click();
    expect([copied.mock.calls.length, saved.mock.calls.length]).toEqual([1, 1]);
  });

  it('keeps the save button from being pressed, and shows how far the save has come, while one runs', async () => {
    const [, save] = buttons();
    expect(save.disabled).toBe(false);
    expect(save.textContent).toContain('save');

    fixture.componentRef.setInput('saving', true);
    fixture.componentRef.setInput('percent', 40);
    await fixture.whenStable();

    expect(save.disabled).toBe(true);
    expect(save.textContent).toContain('hourglass_empty');
    expect(save.textContent).toContain('40');
  });
});
