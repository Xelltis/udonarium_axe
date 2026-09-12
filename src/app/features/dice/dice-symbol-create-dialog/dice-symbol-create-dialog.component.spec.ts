import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { DiceSymbolCreateDialogComponent } from '@axe/features/dice/dice-symbol-create-dialog/dice-symbol-create-dialog.component';

describe('DiceSymbolCreateDialogComponent', () => {
  let fixture: ComponentFixture<DiceSymbolCreateDialogComponent>;
  let component: DiceSymbolCreateDialogComponent;
  let modalService: { option: unknown; resolve: ReturnType<typeof vi.fn> };

  async function setup(option: unknown) {
    modalService = { option, resolve: vi.fn() };
    TestBed.configureTestingModule({ imports: [DiceSymbolCreateDialogComponent] });
    TestBed.overrideProvider(ModalService, { useValue: modalService });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(DiceSymbolCreateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('offers every kind the creation menu offers', async () => {
    await setup({});

    expect(component.diceItems.map((item) => item.menuName)).toEqual([
      'D4',
      'D6',
      'D8',
      'D10',
      'D10 (00-90)',
      'D12',
      'D20',
    ]);
  });

  it('starts on two, which is more than the one a single press already makes', async () => {
    await setup({});

    expect(component.count).toBe(2);
  });

  it('starts on the kind it was opened for', async () => {
    await setup({ typeIndex: 3 });

    expect(component.typeIndex).toBe(3);
  });

  it('answers with the kind and how many', async () => {
    await setup({ typeIndex: 1 });
    component.count = 4;

    component.confirm();

    expect(modalService.resolve).toHaveBeenCalledWith({ typeIndex: 1, count: 4 });
  });

  it('keeps the count between one and the limit it was given', async () => {
    await setup({ maxCount: 6 });
    component.count = 99;
    component.confirm();
    expect(modalService.resolve).toHaveBeenCalledWith({ typeIndex: 0, count: 6 });

    component.count = 0;
    component.confirm();
    expect(modalService.resolve).toHaveBeenLastCalledWith({ typeIndex: 0, count: 1 });
  });

  it('keeps the kind to one it actually offers', async () => {
    await setup({ typeIndex: 99 });

    component.confirm();

    expect(modalService.resolve).toHaveBeenCalledWith({ typeIndex: 6, count: 2 });
  });

  it('answers with nothing on cancel', async () => {
    await setup({});

    component.cancel();

    expect(modalService.resolve).toHaveBeenCalledWith(null);
  });
});
