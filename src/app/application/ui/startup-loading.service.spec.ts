import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { DRIVEN_BY_AUTOMATION, StartupLoadingService } from '@axe/application/ui/startup-loading.service';

describe('StartupLoadingService', () => {
  let screen: HTMLElement;
  let loading: StartupLoadingService;
  const taking = signal(0);

  function stage(): string {
    return screen.querySelector('.app-loading-stage')!.textContent ?? '';
  }

  function make(automated = false): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: TRANSLATE_FN, useValue: (key: string) => `[${key}]` },
        { provide: PiecePicturesService, useValue: { taking: () => taking() } },
        { provide: DRIVEN_BY_AUTOMATION, useValue: automated },
      ],
    });
    loading = TestBed.inject(StartupLoadingService);
  }

  beforeEach(() => {
    screen = document.createElement('div');
    screen.id = 'app-loading';
    screen.innerHTML = '<div class="app-loading-fill"></div><div class="app-loading-stage"></div>';
    document.body.appendChild(screen);
    taking.set(0);
    make();
  });

  afterEach(() => {
    loading.finish();
    screen.remove();
    vi.useRealTimers();
  });

  it('says the table is being made ready once the app is up, and moves on, never back', () => {
    loading.begin();
    expect(stage()).toBe('[app.loading.table]');

    loading.reach('pieces');
    expect(stage()).toBe('[app.loading.pieces]');

    loading.reach('table');
    expect(stage()).toBe('[app.loading.pieces]');
  });

  it('takes the screen away once the table has settled, the work held is over and no picture is being taken', async () => {
    let finishWork!: () => void;
    loading.hold(new Promise<void>((resolve) => (finishWork = resolve)));
    taking.set(1);
    const settled = vi.fn(() => Promise.resolve());

    const finishing = loading.finishAfter(settled);
    await Promise.resolve();
    expect(loading.finished()).toBe(false);

    finishWork();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(settled).toHaveBeenCalledTimes(1);
    expect(loading.finished()).toBe(false);

    taking.set(0);
    await finishing;
    expect(settled).toHaveBeenCalledTimes(2);
    expect(loading.finished()).toBe(true);
    expect(screen.classList.contains('is-done')).toBe(true);
  });

  it('waits on work that fails as on work that succeeds', async () => {
    loading.hold(Promise.reject(new Error('no canvas')));

    await loading.finishAfter(() => Promise.resolve());

    expect(loading.finished()).toBe(true);
  });

  it('takes the screen away after twenty seconds however far the start has got', () => {
    vi.useFakeTimers();
    loading.begin();

    vi.advanceTimersByTime(19_999);
    expect(loading.finished()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(loading.finished()).toBe(true);
  });

  it('takes the screen away at once in a browser driven by automation', () => {
    TestBed.resetTestingModule();
    make(true);

    loading.begin();

    expect(loading.finished()).toBe(true);
  });

  it('leaves no timer behind once finished', () => {
    vi.useFakeTimers();
    loading.begin();

    loading.finish();

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(600);
    expect(vi.getTimerCount()).toBe(0);
  });
});
