import { TestBed } from '@angular/core/testing';
import { SNACKBAR_MS, SnackbarService } from '@axe/application/ui/snackbar.service';

describe('SnackbarService', () => {
  let service: SnackbarService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SnackbarService);
  });

  afterEach(() => {
    service.dismiss();
    vi.useRealTimers();
  });

  it('shows a notice and takes it away after a while', () => {
    service.show('「HP」を削除しました');
    expect(service.current()?.message).toBe('「HP」を削除しました');

    vi.advanceTimersByTime(SNACKBAR_MS);

    expect(service.current()).toBeNull();
  });

  it("puts a newer notice in place of the older, with the older one's time no longer counting", () => {
    service.show('一つ目', { ms: 1000 });
    vi.advanceTimersByTime(900);
    service.show('二つ目', { ms: 1000 });
    vi.advanceTimersByTime(500);

    expect(service.current()?.message).toBe('二つ目');
  });

  it('does what it offers once, and goes', () => {
    const run = vi.fn();
    service.show('削除しました', { action: { label: '元に戻す', run } });

    service.runAction();
    service.runAction();

    expect(run).toHaveBeenCalledTimes(1);
    expect(service.current()).toBeNull();
  });

  it('offers nothing more once dismissed', () => {
    const run = vi.fn();
    service.show('削除しました', { action: { label: '元に戻す', run } });

    service.dismiss();
    service.runAction();

    expect(run).not.toHaveBeenCalled();
  });

  it('tells one notice from the next', () => {
    service.show('一つ目');
    const first = service.current()!.id;
    service.show('二つ目');

    expect(service.current()!.id).not.toBe(first);
  });
});
