import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { SnackbarComponent, Z_SNACKBAR } from '@axe/ui/components/snackbar/snackbar.component';

describe('SnackbarComponent', () => {
  let fixture: ComponentFixture<SnackbarComponent>;
  let service: SnackbarService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SnackbarComponent] });
    fixture = TestBed.createComponent(SnackbarComponent);
    service = TestBed.inject(SnackbarService);
    fixture.detectChanges();
  });

  afterEach(() => service.dismiss());

  const host = () => fixture.nativeElement as HTMLElement;

  it('keeps a live region up even with nothing to say', () => {
    expect(host().querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(host().querySelector('[data-testid="snackbar"]')).toBeNull();
  });

  it('shows the notice with its action, and does it when pressed', () => {
    const run = vi.fn();
    service.show('「HP」を削除しました', { action: { label: '元に戻す', run } });
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="snackbar"]')?.textContent).toContain('「HP」を削除しました');
    (host().querySelector('[data-testid="snackbar-action"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(run).toHaveBeenCalledTimes(1);
    expect(host().querySelector('[data-testid="snackbar"]')).toBeNull();
  });

  it('shows no action button for a notice without one', () => {
    service.show('保存しました');
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="snackbar-action"]')).toBeNull();
  });

  it('stands above the sheets', () => {
    expect((host().querySelector('[role="status"]') as HTMLElement).style.zIndex).toBe(String(Z_SNACKBAR));
  });
});
