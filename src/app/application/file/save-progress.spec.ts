import { SAVE_PROGRESS_LINGER_MS, SaveProgress } from '@axe/application/file/save-progress';

describe('SaveProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is busy from the start of a save and reports how far it has come', async () => {
    const progress = new SaveProgress();
    let report: (percent: number) => void = () => undefined;
    let finish: () => void = () => undefined;

    const running = progress.run((onProgress) => {
      report = onProgress;
      return new Promise<void>((resolve) => (finish = resolve));
    });

    expect(progress.isSaving()).toBe(true);
    report(40);
    expect(progress.percent()).toBe(40);
    finish();
    await running;
  });

  it('stays busy for a moment after the save finishes, then gives the button back', async () => {
    const progress = new SaveProgress();

    await progress.run(async (onProgress) => onProgress(100));

    expect(progress.isSaving()).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_PROGRESS_LINGER_MS - 1);
    expect(progress.isSaving()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(progress.isSaving()).toBe(false);
    expect(progress.percent()).toBe(0);
  });

  it('starts no second save while one is running', async () => {
    const progress = new SaveProgress();
    const save = vi.fn(() => new Promise<void>(() => undefined));

    void progress.run(save);
    await progress.run(save);

    expect(save).toHaveBeenCalledOnce();
  });
});
