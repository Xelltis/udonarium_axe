import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { ConfirmDialogComponent } from '@axe/ui/components/confirm-dialog/confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let component: ConfirmDialogComponent;
  let modalService: { option: unknown; title: string; resolve: ReturnType<typeof vi.fn> };

  async function setup(option: unknown) {
    modalService = { option, title: '', resolve: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    });
    TestBed.overrideProvider(ModalService, { useValue: modalService });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('shows the message', async () => {
    await setup({ message: 'テストメッセージ' });

    const p = fixture.nativeElement.querySelector('p') as HTMLElement;
    expect(p.textContent).toContain('テストメッセージ');
  });

  it('resolves true from the confirm button', async () => {
    await setup({ message: '確認' });

    component.ok();

    expect(modalService.resolve).toHaveBeenCalledWith(true);
  });

  it('resolves false from the cancel button', async () => {
    await setup({ message: '確認' });

    component.cancel();

    expect(modalService.resolve).toHaveBeenCalledWith(false);
  });

  it('styles the confirm button as dangerous when asked', async () => {
    await setup({ message: '削除確認', danger: true });

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const okBtn = Array.from(buttons).find((b) => b.classList.contains('text-ui-danger'));
    expect(okBtn).toBeTruthy();
  });

  describe('from the keyboard', () => {
    const okButton = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).at(-1)!;
    const cancelButton = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    it('puts the focus on OK, so Enter answers yes', async () => {
      await setup({ message: '確認' });
      await fixture.whenStable();

      expect(document.activeElement).toBe(okButton());
    });

    it('puts the focus on cancel when what is asked is dangerous', async () => {
      await setup({ message: '削除確認', danger: true });
      await fixture.whenStable();

      expect(document.activeElement).toBe(cancelButton());
    });

    it('cancels on Escape, keeping the key from the table behind', async () => {
      await setup({ message: '確認' });
      await fixture.whenStable();
      const behind = vi.fn();
      document.addEventListener('keydown', behind);

      okButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

      document.removeEventListener('keydown', behind);
      expect(modalService.resolve).toHaveBeenCalledWith(false);
      expect(behind).not.toHaveBeenCalled();
    });

    it('gives the focus back to whatever held it, once answered', async () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();
      await setup({ message: '確認' });
      await fixture.whenStable();
      expect(document.activeElement).not.toBe(opener);

      fixture.destroy();

      expect(document.activeElement).toBe(opener);
      opener.remove();
    });
  });

  it('styles the confirm button as an accent otherwise', async () => {
    await setup({ message: '確認', danger: false });

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const okBtn = Array.from(buttons).find((b) => b.classList.contains('bg-ui-accent-solid'));
    expect(okBtn).toBeTruthy();
  });
});
